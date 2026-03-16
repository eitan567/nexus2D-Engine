import { Project } from '../types';
import { buildAiPromptContext } from './project-utils';

export const AI_MODEL = 'gemini-3.1-pro-preview';

export const AI_RESPONSE_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'notes', 'project'],
  properties: {
    summary: {
      type: 'string',
      description: 'Short summary of the design changes made to the project.',
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short implementation notes or caveats for the user.',
    },
    project: {
      type: 'object',
      description: 'A full Nexus 2D project JSON object.',
    },
  },
} as const;

export function buildAiSystemInstruction(mode: 'create' | 'extend') {
  const modeInstruction =
    mode === 'create'
      ? 'Create a fresh, playable 2D game project from the user request.'
      : 'Edit the existing project in place. You may add systems, fix broken gameplay, rebalance scenes, refactor behaviors, and write Script components when custom functionality is needed.';

  return [
    'You are a senior 2D game designer and technical level designer working inside the Nexus 2D editor.',
    'Behave like an intelligent engine-native development assistant, not a generic chatbot.',
    modeInstruction,
    'Return only JSON that matches the requested wrapper object.',
    'Use this component vocabulary only: Transform, Sprite, RigidBody, Collider, Script, Behavior.',
    'Use these behavior kinds only: none, player-platformer, player-topdown, enemy-patrol, moving-platform, collectible, goal, hazard.',
    'Use these prefabs only: player, platform, enemy, collectible, goal, hazard, decoration, custom.',
    'Every entity must include Transform and Sprite.',
    'Transform.scale is a multiplier, not a size field. Put authored pixel dimensions on Sprite.width/Sprite.height and Collider.width/Collider.height.',
    'Behavior components must use the property name kind, never behaviorType.',
    'RigidBody components must use isStatic, never bodyType.',
    'Collider.shape must be box or circle. Do not use rectangle.',
    'Player entities should include RigidBody, Collider and an appropriate player behavior.',
    'Use scene settings to define world size, camera size, gravity, grid visibility and background colors.',
    'Script components may be used for engine-specific custom interactions, doors, switches, counters, win logic or animation helpers.',
    'Never return an empty Script component. If you add Script, its code must be non-empty and directly useful at runtime.',
    'Prefer compact but playable scenes with clear objectives.',
    'Keep summary to one short sentence and notes to a few short strings.',
    'Use the minimum number of entities, scenes and scripts required for a solid playable result.',
    'Create mode must return a runnable game loop, not just a visual layout.',
    'If the request is too broad, simplify scope instead of returning incomplete JSON.',
  ].join(' ');
}

export function buildAiUserPrompt(mode: 'create' | 'extend', prompt: string, project: Project) {
  return [
    `Mode: ${mode}`,
    `User request: ${prompt}`,
    'Editor context:',
    buildAiPromptContext(project),
    'Return the wrapper object with summary, notes and project.',
  ].join('\n\n');
}
