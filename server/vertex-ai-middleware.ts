import { mkdir, writeFile } from 'node:fs/promises';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import path from 'node:path';
import {AI_MODEL, buildAiSystemInstruction, buildAiUserPrompt} from '../src/lib/ai-contract';
import {createDefaultProject, getComponent, normalizeAiResponse, projectStats} from '../src/lib/project-utils';
import {
  AIRequestPayload,
  type BehaviorComponent,
  type ColliderComponent,
  type AIDebugIssue,
  type AIDebugPayload,
  type AIDebugStats,
  type AIResponsePayload,
  type Entity,
  type Project,
  type RigidBodyComponent,
  type ScriptComponent,
  type SpriteComponent,
  type TransformComponent,
  ComponentType,
} from '../src/types';

const AI_MAX_OUTPUT_TOKENS = 16_384;
const AI_PLAN_OUTPUT_TOKENS = 1_024;
const AI_THINKING_BUDGET = 2_048;
const AI_DEBUG_DIR = path.resolve(process.cwd(), 'output', 'ai-debug');

class AiGenerationError extends Error {
  debug?: AIDebugPayload;

  constructor(message: string, debug?: AIDebugPayload) {
    super(message);
    this.name = 'AiGenerationError';
    this.debug = debug;
  }
}

export {AiGenerationError};

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

function createDebugId() {
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function collectProjectDebugStats(inputProject: Project, outputProject?: Project): AIDebugStats {
  const input = projectStats(inputProject);

  let scriptCount = 0;
  let rigidBodyCount = 0;
  let colliderCount = 0;
  let behaviorCount = 0;
  let playerCount = 0;
  let collectibleCount = 0;
  let goalCount = 0;
  let hazardCount = 0;

  for (const scene of outputProject?.scenes ?? []) {
    for (const entity of scene.entities) {
      if (entity.prefab === 'player') {
        playerCount += 1;
      } else if (entity.prefab === 'collectible') {
        collectibleCount += 1;
      } else if (entity.prefab === 'goal') {
        goalCount += 1;
      } else if (entity.prefab === 'hazard') {
        hazardCount += 1;
      }

      const behavior = getComponent<BehaviorComponent>(entity, ComponentType.Behavior);
      if (behavior?.enabled && behavior.kind !== 'none') {
        behaviorCount += 1;
      }

      for (const component of entity.components) {
        switch (component.type) {
          case ComponentType.Script:
            scriptCount += 1;
            break;
          case ComponentType.RigidBody:
            rigidBodyCount += 1;
            break;
          case ComponentType.Collider:
            colliderCount += 1;
            break;
          default:
            break;
        }
      }
    }
  }

  return {
    inputSceneCount: input.sceneCount,
    inputEntityCount: input.entityCount,
    outputSceneCount: outputProject?.scenes.length ?? 0,
    outputEntityCount: outputProject?.scenes.reduce((sum, scene) => sum + scene.entities.length, 0) ?? 0,
    assetCount: outputProject?.assets.length ?? 0,
    behaviorCount,
    scriptCount,
    rigidBodyCount,
    colliderCount,
    playerCount,
    collectibleCount,
    goalCount,
    hazardCount,
  };
}

function isProjectileLikeEntity(entity: Entity) {
  const script = getComponent<ScriptComponent>(entity, ComponentType.Script);
  const text = [entity.name, ...entity.tags, script?.code ?? ''].join(' ').toLowerCase();
  return /\b(projectile|bullet|shot|missile|orb|fireball|laser)\b/.test(text);
}

function buildAiDebugIssues(params: {
  mode: 'create' | 'extend';
  parseMode: AIDebugPayload['parseMode'];
  project?: Project;
  stats: AIDebugStats;
  summary?: string;
  notes?: string[];
  planText: string;
  generationText: string;
}) {
  const issues: AIDebugIssue[] = [];
  const narrative = [params.summary ?? '', ...(params.notes ?? []), params.planText].join('\n').toLowerCase();

  if (params.parseMode === 'repaired') {
    issues.push({
      code: 'json-repaired',
      level: 'warning',
      message: 'The first AI response was invalid JSON, so the server used a repair pass before applying the project.',
    });
  } else if (params.parseMode === 'failed') {
    issues.push({
      code: 'json-failed',
      level: 'error',
      message: 'The AI response could not be parsed into valid JSON.',
    });
  }

  if (!params.project || params.stats.outputSceneCount === 0) {
    issues.push({
      code: 'no-scenes',
      level: 'error',
      message: 'The AI output does not contain any usable scenes.',
    });
    return issues;
  }

  if (params.stats.outputEntityCount === 0) {
    issues.push({
      code: 'no-entities',
      level: 'error',
      message: 'The AI output contains no entities, so the scene cannot be playable.',
    });
  }

  if (params.mode === 'create' && params.stats.outputEntityCount <= 1) {
    issues.push({
      code: 'minimal-create-output',
      level: 'warning',
      message: 'Create mode returned only one entity. This usually means the game is incomplete.',
    });
  }

  if (params.mode === 'create' && params.stats.behaviorCount === 0 && params.stats.scriptCount === 0) {
    issues.push({
      code: 'no-runtime-logic',
      level: 'warning',
      message: 'The generated project has no behaviors and no scripts, so it is likely static.',
    });
  }

  if (params.stats.scriptCount === 0 && /\bscript\b/.test(narrative)) {
    issues.push({
      code: 'script-mentioned-but-missing',
      level: 'warning',
      message: 'The AI summary or notes mention scripts, but the normalized project contains zero Script components.',
    });
  }

  if (params.stats.collectibleCount === 0 && /\bcollectible\b|\bfood\b|\bpickup\b|\bcoin\b/.test(narrative)) {
    issues.push({
      code: 'collectible-mentioned-but-missing',
      level: 'warning',
      message: 'The AI description mentions collectibles or food, but no collectible-prefab entities were created.',
    });
  }

  if (params.stats.hazardCount === 0 && /\bhazard\b|\blava\b|\bspike\b|\bwall\b/.test(narrative)) {
    issues.push({
      code: 'hazard-mentioned-but-missing',
      level: 'warning',
      message: 'The AI description mentions hazards or walls, but no hazard-prefab entities were created.',
    });
  }

  if (params.stats.scriptCount === 0 && /"type"\s*:\s*"Script"/.test(params.generationText)) {
    issues.push({
      code: 'script-lost-during-normalization',
      level: 'error',
      message: 'The raw AI JSON mentioned Script components, but the final normalized project contains none.',
    });
  }

  for (const scene of params.project.scenes) {
    for (const entity of scene.entities) {
      const transform = getComponent<TransformComponent>(entity, ComponentType.Transform);
      const sprite = getComponent<SpriteComponent>(entity, ComponentType.Sprite);
      const rigidBody = getComponent<RigidBodyComponent>(entity, ComponentType.RigidBody);
      const collider = getComponent<ColliderComponent>(entity, ComponentType.Collider);
      const behavior = getComponent<BehaviorComponent>(entity, ComponentType.Behavior);
      const script = getComponent<ScriptComponent>(entity, ComponentType.Script);

      if (!transform || !sprite) {
        issues.push({
          code: 'entity-missing-core-components',
          level: 'error',
          message: `Entity "${entity.name}" is missing Transform or Sprite and cannot render correctly in the engine.`,
        });
      }

      if (
        behavior?.enabled &&
        ['player-platformer', 'player-topdown', 'enemy-patrol', 'moving-platform'].includes(behavior.kind) &&
        (!rigidBody || !collider)
      ) {
        issues.push({
          code: 'behavior-missing-physics',
          level: 'warning',
          message: `Entity "${entity.name}" uses ${behavior.kind} but is missing RigidBody or Collider.`,
        });
      }

      if (script?.enabled && !script.code.trim()) {
        issues.push({
          code: 'empty-script',
          level: 'warning',
          message: `Entity "${entity.name}" has a Script component with empty code.`,
        });
      }

      if (sprite) {
        const cameraWidth = Math.max(320, scene.settings.cameraSize.x);
        const cameraHeight = Math.max(240, scene.settings.cameraSize.y);

        if (entity.prefab === 'player' && (sprite.height > cameraHeight * 0.3 || sprite.width > cameraWidth * 0.18)) {
          issues.push({
            code: 'oversized-player',
            level: 'warning',
            message: `Entity "${entity.name}" is unusually large relative to the camera and may feel impractical in play.`,
          });
        }

        if (entity.prefab === 'collectible' && (sprite.height > cameraHeight * 0.08 || sprite.width > cameraWidth * 0.08)) {
          issues.push({
            code: 'oversized-collectible',
            level: 'warning',
            message: `Entity "${entity.name}" is unusually large for a collectible and may read poorly in gameplay.`,
          });
        }

        if (entity.prefab === 'enemy' && /\bboss\b/i.test(entity.name) && (sprite.height > cameraHeight * 0.22 || sprite.width > cameraWidth * 0.18)) {
          issues.push({
            code: 'oversized-boss',
            level: 'warning',
            message: `Entity "${entity.name}" is unusually large for a small boss relative to the camera.`,
          });
        }

        if (entity.prefab === 'hazard' && isProjectileLikeEntity(entity) && (sprite.width > cameraWidth * 0.05 || sprite.height > cameraHeight * 0.06)) {
          issues.push({
            code: 'oversized-projectile',
            level: 'warning',
            message: `Entity "${entity.name}" looks oversized for a projectile and may feel impractical in play.`,
          });
        }
      }
    }
  }

  return issues;
}

async function persistAiDebugArtifact(debug: AIDebugPayload, artifact: Record<string, unknown>) {
  await mkdir(AI_DEBUG_DIR, {recursive: true});
  const filename = `${debug.timestamp.replace(/[:.]/g, '-')}-${debug.id}.json`;
  const relativePath = path.posix.join('output', 'ai-debug', filename);
  const absolutePath = path.resolve(AI_DEBUG_DIR, filename);
  debug.savedFilePath = relativePath;
  await writeFile(
    absolutePath,
    JSON.stringify(
      {
        ...artifact,
        debug,
      },
      null,
      2,
    ),
    'utf8',
  );
  return relativePath;
}

export function getAiHealthPayload() {
  return {
    ok: true,
    vertexAiConfigured:
      process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' &&
      Boolean(process.env.GOOGLE_CLOUD_PROJECT),
    project: process.env.GOOGLE_CLOUD_PROJECT || null,
    location: process.env.GOOGLE_CLOUD_LOCATION || null,
  };
}

export async function generateProjectFromPayload(body: AIRequestPayload): Promise<AIResponsePayload> {
  const fallbackProject = body.project ?? createDefaultProject();

  if (!body.prompt?.trim()) {
    throw new Error('Prompt is required.');
  }

  const ai = createVertexClient();
  let planningNotes = '';
  let planFinishReason = 'plan skipped';

  try {
    const planResponse = await requestProjectPlan(ai, body, fallbackProject);
    planningNotes = (planResponse.text ?? '').trim();
    planFinishReason = finishReasonSummary(planResponse);
  } catch {
    planningNotes = '';
    planFinishReason = 'plan request failed';
  }

  const response = await requestProjectGeneration(ai, body, fallbackProject, planningNotes);
  let parsed: unknown;
  let parseMode: AIDebugPayload['parseMode'] = 'direct';
  let repairText = '';
  let repairFinishReason = 'repair not needed';

  try {
    parsed = extractJson(response.text ?? '');
  } catch (initialError) {
    const repaired = await repairProjectJson(ai, response.text ?? '', body.mode ?? 'extend', body.prompt.trim());
    parseMode = 'repaired';
    repairText = repaired.text ?? '';
    repairFinishReason = finishReasonSummary(repaired);

    try {
      parsed = extractJson(repaired.text ?? '');
    } catch (repairError) {
      const initialMessage = initialError instanceof Error ? initialError.message : 'Unknown initial parse failure.';
      const repairMessage = repairError instanceof Error ? repairError.message : 'Unknown repair parse failure.';
      const failedDebug: AIDebugPayload = {
        id: createDebugId(),
        timestamp: new Date().toISOString(),
        model: AI_MODEL,
        mode: body.mode ?? 'extend',
        prompt: body.prompt.trim(),
        parseMode: 'failed',
        planText: planningNotes,
        generationText: response.text ?? '',
        repairText,
        planFinishReason,
        generationFinishReason: finishReasonSummary(response),
        repairFinishReason,
        savedFilePath: null,
        stats: collectProjectDebugStats(fallbackProject),
        issues: buildAiDebugIssues({
          mode: body.mode ?? 'extend',
          parseMode: 'failed',
          stats: collectProjectDebugStats(fallbackProject),
          planText: planningNotes,
          generationText: response.text ?? '',
        }),
      };
      await persistAiDebugArtifact(failedDebug, {
        request: body,
        error: {
          initialMessage,
          repairMessage,
        },
      });
      throw new AiGenerationError(
        `AI returned invalid JSON after repair. Initial response: ${finishReasonSummary(response)}. ${initialMessage} Repair response: ${finishReasonSummary(repaired)}. ${repairMessage}`,
        failedDebug,
      );
    }
  }

  const normalized = normalizeAiResponse(parsed, fallbackProject);
  const debugStats = collectProjectDebugStats(fallbackProject, normalized.project);
  const debug: AIDebugPayload = {
    id: createDebugId(),
    timestamp: new Date().toISOString(),
    model: AI_MODEL,
    mode: body.mode ?? 'extend',
    prompt: body.prompt.trim(),
    parseMode,
    planText: planningNotes,
    generationText: response.text ?? '',
    repairText,
    planFinishReason,
    generationFinishReason: finishReasonSummary(response),
    repairFinishReason,
    savedFilePath: null,
    stats: debugStats,
    issues: buildAiDebugIssues({
      mode: body.mode ?? 'extend',
      parseMode,
      project: normalized.project,
      stats: debugStats,
      summary: normalized.summary,
      notes: normalized.notes,
      planText: planningNotes,
      generationText: response.text ?? '',
    }),
  };

  await persistAiDebugArtifact(debug, {
    request: body,
    response: normalized,
  });

  return {
    ...normalized,
    debug,
  } satisfies AIResponsePayload;
}

export function formatAiRouteError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown Vertex AI error.';

  const authHint = message.toLowerCase().includes('credentials')
    ? ' Vertex AI on Node requires credentials at runtime, for example Application Default Credentials via `gcloud auth application-default login` or a workload identity/service account on the host.'
    : '';

  return {
    error: `${message}${authHint}`,
    debug: error instanceof AiGenerationError ? error.debug : undefined,
  };
}
