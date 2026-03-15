import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {AI_MODEL, buildAiSystemInstruction, buildAiUserPrompt} from '../src/lib/ai-contract';
import {createDefaultProject, normalizeAiResponse} from '../src/lib/project-utils';
import {AIRequestPayload} from '../src/types';

type Next = (error?: unknown) => void;
type MiddlewareContainer = {
  use: (route: string, handler: (req: IncomingMessage, res: ServerResponse, next: Next) => void | Promise<void>) => void;
};

const AI_MAX_OUTPUT_TOKENS = 16_384;
const AI_PLAN_OUTPUT_TOKENS = 1_024;
const AI_THINKING_BUDGET = 2_048;

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

    const size = chunks.reduce((total, entry) => total + entry.byteLength, 0);
    if (size > 2_000_000) {
      throw new Error('Request body is too large.');
    }
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return (raw ? JSON.parse(raw) : {}) as T;
}

function createVertexClient() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';
  const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';

  if (!useVertex || !project) {
    throw new Error(
      'Vertex AI is not configured. Set GOOGLE_GENAI_USE_VERTEXAI=true and GOOGLE_CLOUD_PROJECT in .env.local.',
    );
  }

  return new GoogleGenAI({
    vertexai: true,
    project,
    location,
    apiVersion: 'v1',
  });
}

function extractJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Vertex AI returned an empty response.');
  }

  const candidates = new globalThis.Set<string>([trimmed]);

  if (trimmed.startsWith('```')) {
    candidates.add(trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.add(trimmed.slice(firstBrace, lastBrace + 1).trim());
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : 'Unknown JSON parse failure.';
  throw new Error(`Vertex AI returned invalid JSON. ${reason}`);
}

async function requestProjectGeneration(
  ai: GoogleGenAI,
  body: AIRequestPayload,
  fallbackProject: ReturnType<typeof createDefaultProject>,
  planningNotes: string,
) {
  return ai.models.generateContent({
    model: AI_MODEL,
    contents: [
      buildAiUserPrompt(body.mode ?? 'extend', body.prompt, fallbackProject),
      planningNotes
        ? `Implementation plan:\n${planningNotes}`
        : 'Implementation plan:\nKeep the result compact and playable.',
      'Return valid JSON only. If the request is too large, reduce scope instead of returning partial or truncated JSON.',
    ].join('\n\n'),
    config: {
      temperature: body.mode === 'create' ? 0.45 : 0.25,
      topP: 0.8,
      maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
      systemInstruction: buildAiSystemInstruction(body.mode ?? 'extend'),
      responseMimeType: 'application/json',
    },
  });
}

async function requestProjectPlan(
  ai: GoogleGenAI,
  body: AIRequestPayload,
  fallbackProject: ReturnType<typeof createDefaultProject>,
) {
  return ai.models.generateContent({
    model: AI_MODEL,
    contents: [
      buildAiUserPrompt(body.mode ?? 'extend', body.prompt, fallbackProject),
      [
        'Think through the best implementation before generating the project JSON.',
        'Return plain text only.',
        'Keep the answer under 12 short bullets.',
        'Focus on gameplay structure, entities, behaviors, and any required scripts.',
        'Do not return JSON.',
      ].join(' '),
    ].join('\n\n'),
    config: {
      temperature: 0.2,
      topP: 0.7,
      maxOutputTokens: AI_PLAN_OUTPUT_TOKENS,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
        thinkingBudget: AI_THINKING_BUDGET,
        includeThoughts: false,
      },
      systemInstruction:
        'You are planning a Nexus 2D project generation step. Think deeply, then return only a compact implementation plan in plain text.',
    },
  });
}

async function repairProjectJson(
  ai: GoogleGenAI,
  invalidJson: string,
  mode: 'create' | 'extend',
  prompt: string,
) {
  return ai.models.generateContent({
    model: AI_MODEL,
    contents: [
      [
        `Original mode: ${mode}`,
        `Original request: ${prompt}`,
        'The JSON below is invalid.',
        'Repair it into valid JSON only.',
        'Keep the wrapper shape exactly as: { "summary": string, "notes": string[], "project": object }.',
        'Do not add markdown fences, comments, duplicate keys, or explanations.',
        'If something is ambiguous, keep the smallest valid playable project instead of expanding it.',
        'Invalid JSON:',
        invalidJson,
      ].join('\n\n'),
    ],
    config: {
      temperature: 0,
      topP: 0.1,
      maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      systemInstruction:
        'You repair broken JSON for a 2D game editor. Return only valid JSON. Never include markdown. Never include duplicate keys.',
    },
  });
}

function finishReasonSummary(response: Awaited<ReturnType<typeof requestProjectGeneration>>) {
  const candidate = response.candidates?.[0];
  if (!candidate?.finishReason) {
    return 'unknown finish reason';
  }

  return candidate.finishMessage ? `${candidate.finishReason}: ${candidate.finishMessage}` : candidate.finishReason;
}

async function handleGenerateProject(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody<AIRequestPayload>(req);
  const fallbackProject = body.project ?? createDefaultProject();

  if (!body.prompt?.trim()) {
    sendJson(res, 400, {
      error: 'Prompt is required.',
    });
    return;
  }

  const ai = createVertexClient();
  let planningNotes = '';

  try {
    const planResponse = await requestProjectPlan(ai, body, fallbackProject);
    planningNotes = (planResponse.text ?? '').trim();
  } catch {
    planningNotes = '';
  }

  const response = await requestProjectGeneration(ai, body, fallbackProject, planningNotes);
  let parsed: unknown;

  try {
    parsed = extractJson(response.text ?? '');
  } catch (initialError) {
    const repaired = await repairProjectJson(ai, response.text ?? '', body.mode ?? 'extend', body.prompt.trim());

    try {
      parsed = extractJson(repaired.text ?? '');
    } catch (repairError) {
      const initialMessage = initialError instanceof Error ? initialError.message : 'Unknown initial parse failure.';
      const repairMessage = repairError instanceof Error ? repairError.message : 'Unknown repair parse failure.';
      throw new Error(
        `AI returned invalid JSON after repair. Initial response: ${finishReasonSummary(response)}. ${initialMessage} Repair response: ${finishReasonSummary(repaired)}. ${repairMessage}`,
      );
    }
  }

  const normalized = normalizeAiResponse(parsed, fallbackProject);
  sendJson(res, 200, normalized);
}

export function attachVertexAiMiddleware(container: MiddlewareContainer) {
  container.use('/api/health', async (req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    sendJson(res, 200, {
      ok: true,
      vertexAiConfigured:
        process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' &&
        Boolean(process.env.GOOGLE_CLOUD_PROJECT),
      project: process.env.GOOGLE_CLOUD_PROJECT || null,
      location: process.env.GOOGLE_CLOUD_LOCATION || null,
    });
  });

  container.use('/api/ai/generate-project', async (req, res, next) => {
    if (req.method !== 'POST') {
      next();
      return;
    }

    try {
      await handleGenerateProject(req, res);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Vertex AI error.';

      const authHint = message.toLowerCase().includes('credentials')
        ? ' Vertex AI on Node requires credentials at runtime, for example Application Default Credentials via `gcloud auth application-default login` or a workload identity/service account on the host.'
        : '';

      sendJson(res, 500, {
        error: `${message}${authHint}`,
      });
    }
  });
}
