import {GoogleGenAI} from '@google/genai';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {AI_MODEL, AI_RESPONSE_JSON_SCHEMA, buildAiSystemInstruction, buildAiUserPrompt} from '../src/lib/ai-contract';
import {createDefaultProject, normalizeAiResponse} from '../src/lib/project-utils';
import {AIRequestPayload} from '../src/types';

type Next = (error?: unknown) => void;
type MiddlewareContainer = {
  use: (route: string, handler: (req: IncomingMessage, res: ServerResponse, next: Next) => void | Promise<void>) => void;
};

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

  if (trimmed.startsWith('```')) {
    const cleaned = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return JSON.parse(cleaned);
  }

  return JSON.parse(trimmed);
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
  const response = await ai.models.generateContent({
    model: AI_MODEL,
    contents: buildAiUserPrompt(body.mode ?? 'extend', body.prompt, fallbackProject),
    config: {
      temperature: body.mode === 'create' ? 0.95 : 0.7,
      topP: 0.95,
      maxOutputTokens: 8_192,
      systemInstruction: buildAiSystemInstruction(body.mode ?? 'extend'),
      responseMimeType: 'application/json',
      responseJsonSchema: AI_RESPONSE_JSON_SCHEMA,
    },
  });

  const parsed = extractJson(response.text ?? '');
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
