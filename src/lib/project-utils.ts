import {
  AIResponsePayload,
  BehaviorComponent,
  BehaviorKind,
  ColliderComponent,
  Component,
  ComponentType,
  Controls,
  Entity,
  EntityPrefab,
  Project,
  RigidBodyComponent,
  Scene,
  SceneSettings,
  ScriptComponent,
  SpriteComponent,
  TransformComponent,
  Vector2,
} from '../types';

export const PROJECT_VERSION = 2;
export const STORAGE_KEY = 'nexus2d.editor.project';

const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  worldSize: { x: 3000, y: 1393 },
  cameraSize: { x: 1280, y: 720 },
  cameraStart: { x: 0, y: 0 },
  gravity: { x: 0, y: 980 },
  gridSize: 32,
  snapToGrid: false,
  showGrid: true,
  cameraFollowPlayer: true,
  backgroundTop: '#292c31',
  backgroundBottom: '#1e2126',
  ambientColor: '#5f656e',
};

const DEFAULT_CONTROLS: Controls = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  jump: 'Space',
  action: 'KeyE',
  altAction: 'ShiftLeft',
};

export function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cloneProject(project: Project) {
  return structuredClone(project);
}

function nowIso() {
  return new Date().toISOString();
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function maybeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function vectorOr(value: unknown, fallback: Vector2): Vector2 {
  if (!value || typeof value !== 'object') {
    return { ...fallback };
  }

  const maybeVector = value as Partial<Vector2>;
  return {
    x: numberOr(maybeVector.x, fallback.x),
    y: numberOr(maybeVector.y, fallback.y),
  };
}

function maybeVector(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybe = value as Partial<Vector2>;
  const x = maybeNumber(maybe.x);
  const y = maybeNumber(maybe.y);

  if (x === null || y === null) {
    return null;
  }

  return { x, y } satisfies Vector2;
}

function maybeVectorFromAxes(xValue: unknown, yValue: unknown) {
  const x = maybeNumber(xValue);
  const y = maybeNumber(yValue);

  if (x === null || y === null) {
    return null;
  }

  return { x, y } satisfies Vector2;
}

export function createTransform(position: Vector2, scale: Vector2 = { x: 1, y: 1 }): TransformComponent {
  return {
    id: generateId('transform'),
    type: ComponentType.Transform,
    enabled: true,
    position,
    rotation: 0,
    scale,
  };
}

export function createSprite(options: Partial<SpriteComponent> = {}): SpriteComponent {
  return {
    id: generateId('sprite'),
    type: ComponentType.Sprite,
    enabled: true,
    assetId: '',
    color: '#8f949b',
    opacity: 1,
    width: 96,
    height: 96,
    shape: 'rectangle',
    flipX: false,
    flipY: false,
    ...options,
  };
}

export function createRigidBody(options: Partial<RigidBodyComponent> = {}): RigidBodyComponent {
  return {
    id: generateId('body'),
    type: ComponentType.RigidBody,
    enabled: true,
    velocity: { x: 0, y: 0 },
    mass: 1,
    isStatic: false,
    gravityScale: 1,
    drag: { x: 0, y: 0 },
    bounce: { x: 0, y: 0 },
    maxVelocity: { x: 450, y: 1400 },
    ...options,
  };
}

export function createCollider(options: Partial<ColliderComponent> = {}): ColliderComponent {
  return {
    id: generateId('collider'),
    type: ComponentType.Collider,
    enabled: true,
    shape: 'box',
    autoSize: true,
    width: 96,
    height: 96,
    radius: 48,
    offsetX: 0,
    offsetY: 0,
    isTrigger: false,
    isPassThrough: false,
    ...options,
  };
}

export function createScript(code = ''): ScriptComponent {
  return {
    id: generateId('script'),
    type: ComponentType.Script,
    enabled: true,
    code,
  };
}

export function createBehavior(kind: BehaviorKind, options: Partial<BehaviorComponent> = {}): BehaviorComponent {
  return {
    id: generateId('behavior'),
    type: ComponentType.Behavior,
    enabled: true,
    kind,
    moveSpeed: 240,
    jumpForce: 560,
    patrolDistance: 220,
    patrolSpeed: 90,
    patrolAxis: 'x',
    collectibleValue: 10,
    respawnDelay: 0,
    checkpointId: '',
    ...options,
  };
}

function withPrefabMeta(entity: Entity, prefab: EntityPrefab): Entity {
  return {
    ...entity,
    prefab,
    tags: entity.tags ?? [],
    layer: entity.layer ?? 0,
    locked: entity.locked ?? false,
    hidden: entity.hidden ?? false,
  };
}

export function createEntityFromPrefab(
  prefab: EntityPrefab,
  position: Vector2,
): Entity {
  const base: Entity = {
    id: generateId(prefab),
    name: prefab.replace('-', ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    parent: null,
    children: [],
    tags: [],
    layer: 0,
    locked: false,
    hidden: false,
    prefab,
    components: [createTransform(position)],
  };

  switch (prefab) {
    case 'player':
      return withPrefabMeta(
        {
          ...base,
          name: 'Player',
          tags: ['player'],
          components: [
            createTransform(position),
            createSprite({ color: '#d4c095', width: 72, height: 96, shape: 'rectangle' }),
            createRigidBody({ drag: { x: 800, y: 0 }, maxVelocity: { x: 320, y: 1200 } }),
            createCollider({ width: 72, height: 96 }),
            createBehavior('player-platformer', { moveSpeed: 240, jumpForce: 620 }),
          ],
        },
        prefab,
      );
    case 'platform':
      return withPrefabMeta(
        {
          ...base,
          name: 'Platform',
          components: [
            createTransform(position),
            createSprite({ color: '#666d77', width: 240, height: 32, shape: 'rectangle' }),
            createRigidBody({ isStatic: true, gravityScale: 0 }),
            createCollider({ width: 240, height: 32 }),
          ],
        },
        prefab,
      );
    case 'enemy':
      return withPrefabMeta(
        {
          ...base,
          name: 'Patrol Enemy',
          components: [
            createTransform(position),
            createSprite({ color: '#8e6f73', width: 80, height: 80, shape: 'diamond' }),
            createRigidBody({ drag: { x: 600, y: 0 }, maxVelocity: { x: 220, y: 1200 } }),
            createCollider({ width: 80, height: 80 }),
            createBehavior('enemy-patrol', { patrolDistance: 260, patrolSpeed: 120 }),
          ],
        },
        prefab,
      );
    case 'collectible':
      return withPrefabMeta(
        {
          ...base,
          name: 'Collectible',
          components: [
            createTransform(position),
            createSprite({ color: '#b6a071', width: 40, height: 40, shape: 'ellipse' }),
            createCollider({ width: 44, height: 44, isTrigger: true }),
            createBehavior('collectible', { collectibleValue: 10 }),
          ],
        },
        prefab,
      );
    case 'goal':
      return withPrefabMeta(
        {
          ...base,
          name: 'Goal',
          components: [
            createTransform(position),
            createSprite({ color: '#8a9199', width: 64, height: 112, shape: 'rectangle' }),
            createCollider({ width: 64, height: 112, isTrigger: true }),
            createBehavior('goal'),
          ],
        },
        prefab,
      );
    case 'hazard':
      return withPrefabMeta(
        {
          ...base,
          name: 'Hazard',
          components: [
            createTransform(position),
            createSprite({ color: '#8d666d', width: 120, height: 28, shape: 'diamond' }),
            createCollider({ width: 120, height: 28, isTrigger: true }),
            createBehavior('hazard'),
          ],
        },
        prefab,
      );
    case 'decoration':
      return withPrefabMeta(
        {
          ...base,
          name: 'Decoration',
          components: [
            createTransform(position),
            createSprite({ color: '#5d636c', width: 96, height: 160, shape: 'diamond', opacity: 0.65 }),
          ],
        },
        prefab,
      );
    default:
      return withPrefabMeta(
        {
          ...base,
          components: [
            createTransform(position),
            createSprite({ color: '#7f858d' }),
            createCollider(),
          ],
        },
        'custom',
      );
  }
}

export function getComponent<T extends Component>(entity: Entity | null | undefined, type: T['type']) {
  return entity?.components?.find((component) => component.type === type) as T | undefined;
}

export function updateEntityComponent<T extends Component>(
  entity: Entity,
  componentType: T['type'],
  updater: (component: T) => T,
) {
  return {
    ...entity,
    components: entity.components.map((component) =>
      component.type === componentType ? updater(component as T) : component,
    ),
  };
}

export function projectStats(project: Project) {
  const sceneCount = project.scenes.length;
  const entityCount = project.scenes.reduce((sum, scene) => sum + scene.entities.length, 0);
  const behaviorCount = project.scenes.reduce(
    (sum, scene) =>
      sum +
      scene.entities.filter((entity) => {
        const behavior = getComponent<BehaviorComponent>(entity, ComponentType.Behavior);
        return behavior && behavior.enabled && behavior.kind !== 'none';
      }).length,
    0,
  );

  return {
    sceneCount,
    entityCount,
    behaviorCount,
    assetCount: project.assets.length,
  };
}

export function createScene(name: string, entities: Entity[] = []): Scene {
  return {
    id: generateId('scene'),
    name,
    notes: '',
    settings: structuredClone(DEFAULT_SCENE_SETTINGS),
    entities,
  };
}

export function createBlankScene(name = 'Scene 1') {
  const scene = createScene(name, []);
  scene.notes = 'Empty scene. Build the level from scratch or load a sample project.';
  return scene;
}

export function createPlatformerTemplate() {
  const scene = createScene('Skyline Run', [
    createEntityFromPrefab('player', { x: 160, y: 620 }),
    createEntityFromPrefab('platform', { x: 800, y: 840 }),
    {
      ...createEntityFromPrefab('platform', { x: 520, y: 720 }),
      name: 'Mid Platform',
    },
    {
      ...createEntityFromPrefab('platform', { x: 980, y: 620 }),
      name: 'Upper Platform',
    },
    createEntityFromPrefab('enemy', { x: 980, y: 560 }),
    createEntityFromPrefab('collectible', { x: 520, y: 660 }),
    createEntityFromPrefab('collectible', { x: 1000, y: 560 }),
    createEntityFromPrefab('goal', { x: 1380, y: 720 }),
    createEntityFromPrefab('hazard', { x: 1190, y: 858 }),
  ]);

  scene.settings.backgroundTop = '#2a2d33';
  scene.settings.backgroundBottom = '#202329';
  scene.settings.worldSize = { x: 1800, y: 960 };
  scene.settings.gravity = { x: 0, y: 1100 };
  scene.notes = 'Template platformer scene with player, patrol enemy, collectibles and goal.';

  return scene;
}

export function createTopDownTemplate() {
  const scene = createScene('Neon Maze', [
    {
      ...createEntityFromPrefab('player', { x: 280, y: 280 }),
      name: 'Explorer',
      components: [
        createTransform({ x: 280, y: 280 }),
        createSprite({ color: '#b8c2c9', width: 72, height: 72, shape: 'ellipse' }),
        createRigidBody({ drag: { x: 900, y: 900 }, gravityScale: 0, maxVelocity: { x: 280, y: 280 } }),
        createCollider({ width: 72, height: 72 }),
        createBehavior('player-topdown', { moveSpeed: 220 }),
      ],
    },
    {
      ...createEntityFromPrefab('platform', { x: 800, y: 120 }),
      name: 'North Wall',
      components: [
        createTransform({ x: 800, y: 120 }),
        createSprite({ color: '#5d636b', width: 1180, height: 32 }),
        createRigidBody({ isStatic: true, gravityScale: 0 }),
        createCollider({ width: 1180, height: 32 }),
      ],
    },
    {
      ...createEntityFromPrefab('platform', { x: 800, y: 780 }),
      name: 'South Wall',
      components: [
        createTransform({ x: 800, y: 780 }),
        createSprite({ color: '#5d636b', width: 1180, height: 32 }),
        createRigidBody({ isStatic: true, gravityScale: 0 }),
        createCollider({ width: 1180, height: 32 }),
      ],
    },
    {
      ...createEntityFromPrefab('platform', { x: 220, y: 450 }),
      name: 'West Wall',
      components: [
        createTransform({ x: 220, y: 450 }),
        createSprite({ color: '#5d636b', width: 32, height: 680 }),
        createRigidBody({ isStatic: true, gravityScale: 0 }),
        createCollider({ width: 32, height: 680 }),
      ],
    },
    {
      ...createEntityFromPrefab('platform', { x: 1380, y: 450 }),
      name: 'East Wall',
      components: [
        createTransform({ x: 1380, y: 450 }),
        createSprite({ color: '#5d636b', width: 32, height: 680 }),
        createRigidBody({ isStatic: true, gravityScale: 0 }),
        createCollider({ width: 32, height: 680 }),
      ],
    },
    {
      ...createEntityFromPrefab('collectible', { x: 800, y: 450 }),
      name: 'Energy Core',
    },
    {
      ...createEntityFromPrefab('goal', { x: 1220, y: 670 }),
      name: 'Exit Gate',
    },
  ]);

  scene.settings.backgroundTop = '#2a2d33';
  scene.settings.backgroundBottom = '#202329';
  scene.settings.gravity = { x: 0, y: 0 };
  scene.settings.worldSize = { x: 1600, y: 900 };
  scene.notes = 'Top-down arena template with walls and collectible objective.';

  return scene;
}

export function createBlankProject(name = 'Untitled Project'): Project {
  const defaultScene = createBlankScene();

  return {
    version: PROJECT_VERSION,
    name,
    description: 'Blank 2D project ready for scene construction, scripting and AI-assisted iteration.',
    updatedAt: nowIso(),
    assets: [],
    controls: structuredClone(DEFAULT_CONTROLS),
    scenes: [defaultScene],
    activeSceneId: defaultScene.id,
  };
}

export function createSampleProject(template: 'platformer' | 'topdown'): Project {
  const scene = template === 'platformer' ? createPlatformerTemplate() : createTopDownTemplate();
  return {
    version: PROJECT_VERSION,
    name: template === 'platformer' ? 'Platformer Sample' : 'Top-Down Sample',
    description:
      template === 'platformer'
        ? 'Example side-scrolling project demonstrating player control, collectibles, hazards and goal flow.'
        : 'Example top-down project demonstrating arena layout, movement and objective flow.',
    updatedAt: nowIso(),
    assets: [],
    controls: structuredClone(DEFAULT_CONTROLS),
    scenes: [scene],
    activeSceneId: scene.id,
  };
}

export function createDefaultProject(): Project {
  return createBlankProject();
}

export function getActiveScene(project: Project) {
  return (
    project.scenes.find((scene) => scene.id === project.activeSceneId) ?? project.scenes[0]
  );
}

export function duplicateEntity(entity: Entity) {
  const duplicate = structuredClone(entity);
  duplicate.id = generateId(entity.prefab || 'entity');
  duplicate.name = `${entity.name} Copy`;
  duplicate.components = duplicate.components.map((component) => ({
    ...component,
    id: generateId(component.type.toLowerCase()),
  }));

  const transform = getComponent<TransformComponent>(duplicate, ComponentType.Transform);
  if (transform) {
    transform.position.x += 56;
    transform.position.y -= 24;
  }

  return duplicate;
}

export function snapPoint(position: Vector2, gridSize: number) {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
  };
}

export function normalizeProject(input: unknown, fallback = createDefaultProject()): Project {
  const source = input && typeof input === 'object' ? (input as Partial<Project>) : {};
  const scenesInput = Array.isArray(source.scenes) ? source.scenes : fallback.scenes;

  const scenes = scenesInput
    .map((sceneInput, sceneIndex) => normalizeScene(sceneInput, fallback.scenes[sceneIndex] ?? createScene(`Scene ${sceneIndex + 1}`)))
    .filter(Boolean);

  const activeSceneId = stringOr(
    source.activeSceneId,
    scenes[0]?.id ?? fallback.activeSceneId,
  );

  return {
    version: PROJECT_VERSION,
    name: stringOr(source.name, fallback.name),
    description: stringOr(source.description, fallback.description),
    updatedAt: nowIso(),
    assets: Array.isArray(source.assets)
      ? source.assets
        .map((asset, index) => normalizeAsset(asset, index))
        .filter(Boolean)
      : fallback.assets,
    controls: normalizeControls(source.controls, fallback.controls),
    scenes: scenes.length > 0 ? scenes : fallback.scenes,
    activeSceneId:
      scenes.find((scene) => scene.id === activeSceneId)?.id ?? scenes[0]?.id ?? fallback.activeSceneId,
  };
}

function normalizeControls(input: unknown, fallback: Controls): Controls {
  const source = input && typeof input === 'object' ? (input as Partial<Controls>) : {};

  return {
    left: stringOr(source.left, fallback.left),
    right: stringOr(source.right, fallback.right),
    up: stringOr(source.up, fallback.up),
    down: stringOr(source.down, fallback.down),
    jump: stringOr(source.jump, fallback.jump),
    action: stringOr(source.action, fallback.action),
    altAction: stringOr(source.altAction, fallback.altAction),
  };
}

function normalizeAsset(input: unknown, index: number) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const source = input as Record<string, unknown>;
  const type = source.type === 'audio' ? 'audio' : 'image';

  return {
    id: stringOr(source.id, generateId(`asset-${index}`)),
    name: stringOr(source.name, `Asset ${index + 1}`),
    type,
    url: stringOr(source.url, ''),
  };
}

function normalizeScene(input: unknown, fallback: Scene): Scene {
  const source = input && typeof input === 'object' ? (input as Partial<Scene>) : fallback;
  const entitiesInput = Array.isArray(source.entities) ? source.entities : fallback.entities;

  return {
    id: stringOr(source.id, generateId('scene')),
    name: stringOr(source.name, fallback.name),
    notes: stringOr(source.notes, fallback.notes),
    settings: normalizeSceneSettings(source.settings, fallback.settings),
    entities: entitiesInput.map((entity, index) => normalizeEntity(entity, fallback.entities[index])),
  };
}

function normalizeSceneSettings(input: unknown, fallback: SceneSettings): SceneSettings {
  const source = input && typeof input === 'object' ? (input as Partial<SceneSettings>) : {};

  return {
    worldSize: vectorOr(source.worldSize, fallback.worldSize),
    cameraSize: vectorOr(source.cameraSize, fallback.cameraSize),
    cameraStart: vectorOr(source.cameraStart, fallback.cameraStart),
    gravity: vectorOr(source.gravity, fallback.gravity),
    gridSize: Math.max(8, numberOr(source.gridSize, fallback.gridSize)),
    snapToGrid: booleanOr(source.snapToGrid, fallback.snapToGrid),
    showGrid: booleanOr(source.showGrid, fallback.showGrid),
    cameraFollowPlayer: booleanOr(source.cameraFollowPlayer, fallback.cameraFollowPlayer),
    backgroundTop: stringOr(source.backgroundTop, fallback.backgroundTop),
    backgroundBottom: stringOr(source.backgroundBottom, fallback.backgroundBottom),
    ambientColor: stringOr(source.ambientColor, fallback.ambientColor),
  };
}

function normalizeEntity(input: unknown, fallback?: Entity): Entity {
  const source = input && typeof input === 'object' ? (input as Partial<Entity>) : {};
  const inferredPrefab = isPrefab(source.prefab) ? source.prefab : fallback?.prefab ?? 'custom';
  const base = fallback ?? createEntityFromPrefab(inferredPrefab, { x: 240, y: 240 });
  const prefab = isPrefab(source.prefab) ? source.prefab : base.prefab;
  const normalizedInputComponents = normalizeComponentInputList(source.components);
  const legacyHints = resolveLegacyEntityHints(source.components);
  const fallbackComponentsByType = new Map(base.components.map((component) => [component.type, component] as const));
  const components = normalizedInputComponents.length > 0
    ? normalizedInputComponents
      .map((component) => {
        const componentType =
          component && typeof component === 'object' && 'type' in component ? (component.type as ComponentType | undefined) : undefined;
        return normalizeComponent(component, componentType ? fallbackComponentsByType.get(componentType) : undefined, legacyHints);
      })
      .filter(Boolean)
    : base.components;

  return {
    id: stringOr(source.id, generateId(prefab)),
    name: stringOr(source.name, base.name),
    parent: typeof source.parent === 'string' ? source.parent : null,
    children: Array.isArray(source.children) ? source.children.filter((child) => typeof child === 'string') : [],
    tags: Array.isArray(source.tags) ? source.tags.filter((tag) => typeof tag === 'string') : base.tags,
    layer: numberOr(source.layer, base.layer),
    locked: booleanOr(source.locked, base.locked),
    hidden: booleanOr(source.hidden, base.hidden),
    prefab,
    components: components.length > 0 ? components : base.components,
  };
}

function isPrefab(value: unknown): value is EntityPrefab {
  return (
    value === 'player' ||
    value === 'platform' ||
    value === 'enemy' ||
    value === 'collectible' ||
    value === 'goal' ||
    value === 'hazard' ||
    value === 'decoration' ||
    value === 'custom'
  );
}

type LegacyEntityHints = {
  spriteSizeFromTransform: Vector2 | null;
};

function normalizeComponentInputList(components: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(components)) {
    return components.filter((component): component is Record<string, unknown> => !!component && typeof component === 'object');
  }

  if (!components || typeof components !== 'object') {
    return [];
  }

  const componentMap = components as Record<string, unknown>;
  const orderedTypes = [
    ComponentType.Transform,
    ComponentType.Sprite,
    ComponentType.RigidBody,
    ComponentType.Collider,
    ComponentType.Behavior,
    ComponentType.Script,
  ] as const;
  const normalizedComponents: Array<Record<string, unknown>> = [];
  const seenTypes = new Set<ComponentType>();

  for (const componentType of orderedTypes) {
    const component = componentMap[componentType];
    if (!component || typeof component !== 'object') {
      continue;
    }

    normalizedComponents.push({
      type: componentType,
      ...(component as Record<string, unknown>),
    });
    seenTypes.add(componentType);
  }

  for (const [rawType, component] of Object.entries(componentMap)) {
    if (!component || typeof component !== 'object') {
      continue;
    }

    const componentType = parseComponentType(rawType);
    if (!componentType || seenTypes.has(componentType)) {
      continue;
    }

    normalizedComponents.push({
      type: componentType,
      ...(component as Record<string, unknown>),
    });
    seenTypes.add(componentType);
  }

  return normalizedComponents;
}

function parseComponentType(value: unknown): ComponentType | null {
  if (typeof value !== 'string') {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case 'transform':
      return ComponentType.Transform;
    case 'sprite':
      return ComponentType.Sprite;
    case 'rigidbody':
    case 'rigid-body':
      return ComponentType.RigidBody;
    case 'collider':
      return ComponentType.Collider;
    case 'behavior':
      return ComponentType.Behavior;
    case 'script':
      return ComponentType.Script;
    default:
      return null;
  }
}

function resolveLegacyEntityHints(components: unknown): LegacyEntityHints {
  const normalizedComponents = normalizeComponentInputList(components);
  if (normalizedComponents.length === 0) {
    return { spriteSizeFromTransform: null };
  }

  const transform = normalizedComponents.find(
    (component) => component && typeof component === 'object' && 'type' in component && component.type === ComponentType.Transform,
  ) as (Partial<TransformComponent> & Record<string, unknown>) | undefined;
  const sprite = normalizedComponents.find(
    (component) => component && typeof component === 'object' && 'type' in component && component.type === ComponentType.Sprite,
  ) as (Partial<SpriteComponent> & Record<string, unknown>) | undefined;

  if (!transform || !sprite) {
    return { spriteSizeFromTransform: null };
  }

  const hasExplicitSpriteSize = maybeNumber(sprite.width) !== null || maybeNumber(sprite.height) !== null;
  const legacyScale = maybeVector(transform.scale);
  const legacyTransformSize = maybeVectorFromAxes(transform.width, transform.height);

  if (hasExplicitSpriteSize) {
    return { spriteSizeFromTransform: null };
  }

  const legacySize = legacyTransformSize ?? legacyScale;

  if (!legacySize) {
    return { spriteSizeFromTransform: null };
  }

  const width = Math.abs(legacySize.x);
  const height = Math.abs(legacySize.y);

  if (width < 8 || height < 8) {
    return { spriteSizeFromTransform: null };
  }

  return {
    spriteSizeFromTransform: {
      x: width,
      y: height,
    },
  };
}

function normalizeComponent(input: unknown, fallback?: Component, legacyHints?: LegacyEntityHints) {
  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const source = input as Partial<Component> & Record<string, unknown>;
  const type = source.type ?? fallback?.type;

  switch (type) {
    case ComponentType.Transform:
      const legacyPosition = maybeVectorFromAxes(source.x, source.y);
      return {
        id: stringOr(source.id, generateId('transform')),
        type: ComponentType.Transform,
        enabled: booleanOr(source.enabled, true),
        position:
          legacyPosition ??
          vectorOr((source as Partial<TransformComponent>).position, fallback && fallback.type === ComponentType.Transform ? fallback.position : { x: 0, y: 0 }),
        rotation: numberOr((source as Partial<TransformComponent>).rotation, fallback && fallback.type === ComponentType.Transform ? fallback.rotation : 0),
        scale:
          legacyHints?.spriteSizeFromTransform
            ? { x: 1, y: 1 }
            : vectorOr((source as Partial<TransformComponent>).scale, fallback && fallback.type === ComponentType.Transform ? fallback.scale : { x: 1, y: 1 }),
      } satisfies TransformComponent;
    case ComponentType.Sprite:
      return {
        id: stringOr(source.id, generateId('sprite')),
        type: ComponentType.Sprite,
        enabled: booleanOr(source.enabled, booleanOr(source.visible, true)),
        assetId: stringOr(
          (source as Partial<SpriteComponent>).assetId,
          stringOr(source.image, stringOr(source.texture, fallback && fallback.type === ComponentType.Sprite ? fallback.assetId : '')),
        ),
        color: stringOr(
          (source as Partial<SpriteComponent>).color,
          stringOr(source.tint, fallback && fallback.type === ComponentType.Sprite ? fallback.color : '#4cc9f0'),
        ),
        opacity: Math.min(1, Math.max(0, numberOr((source as Partial<SpriteComponent>).opacity, fallback && fallback.type === ComponentType.Sprite ? fallback.opacity : 1))),
        width: Math.max(
          8,
          numberOr(
            (source as Partial<SpriteComponent>).width,
            legacyHints?.spriteSizeFromTransform?.x ?? (fallback && fallback.type === ComponentType.Sprite ? fallback.width : 96),
          ),
        ),
        height: Math.max(
          8,
          numberOr(
            (source as Partial<SpriteComponent>).height,
            legacyHints?.spriteSizeFromTransform?.y ?? (fallback && fallback.type === ComponentType.Sprite ? fallback.height : 96),
          ),
        ),
        shape:
          (source as Partial<SpriteComponent>).shape === 'ellipse' || (source as Partial<SpriteComponent>).shape === 'diamond'
            ? (source as Partial<SpriteComponent>).shape
            : fallback && fallback.type === ComponentType.Sprite
              ? fallback.shape
              : 'rectangle',
        flipX: booleanOr((source as Partial<SpriteComponent>).flipX, fallback && fallback.type === ComponentType.Sprite ? fallback.flipX : false),
        flipY: booleanOr((source as Partial<SpriteComponent>).flipY, fallback && fallback.type === ComponentType.Sprite ? fallback.flipY : false),
      } satisfies SpriteComponent;
    case ComponentType.RigidBody:
      return {
        id: stringOr(source.id, generateId('body')),
        type: ComponentType.RigidBody,
        enabled: booleanOr(source.enabled, true),
        velocity: vectorOr((source as Partial<RigidBodyComponent>).velocity, fallback && fallback.type === ComponentType.RigidBody ? fallback.velocity : { x: 0, y: 0 }),
        mass: Math.max(0.1, numberOr((source as Partial<RigidBodyComponent>).mass, fallback && fallback.type === ComponentType.RigidBody ? fallback.mass : 1)),
        isStatic:
          typeof source.isStatic === 'boolean'
            ? source.isStatic
            : source.bodyType === 'static'
              ? true
              : source.bodyType === 'dynamic'
                ? false
                : fallback && fallback.type === ComponentType.RigidBody
                  ? fallback.isStatic
                  : false,
        gravityScale:
          maybeNumber((source as Partial<RigidBodyComponent>).gravityScale) ??
          (source.bodyType === 'static' ? 0 : fallback && fallback.type === ComponentType.RigidBody ? fallback.gravityScale : 1),
        drag: vectorOr((source as Partial<RigidBodyComponent>).drag, fallback && fallback.type === ComponentType.RigidBody ? fallback.drag : { x: 0, y: 0 }),
        bounce: vectorOr((source as Partial<RigidBodyComponent>).bounce, fallback && fallback.type === ComponentType.RigidBody ? fallback.bounce : { x: 0, y: 0 }),
        maxVelocity: vectorOr((source as Partial<RigidBodyComponent>).maxVelocity, fallback && fallback.type === ComponentType.RigidBody ? fallback.maxVelocity : { x: 450, y: 1400 }),
      } satisfies RigidBodyComponent;
    case ComponentType.Collider:
      const legacyColliderSize = maybeVector(source.size);
      const hasManualColliderMetrics =
        typeof source.autoSize === 'boolean'
          ? false
          : legacyColliderSize !== null ||
            maybeNumber((source as Partial<ColliderComponent>).width) !== null ||
            maybeNumber((source as Partial<ColliderComponent>).height) !== null ||
            maybeNumber((source as Partial<ColliderComponent>).radius) !== null;

      return {
        id: stringOr(source.id, generateId('collider')),
        type: ComponentType.Collider,
        enabled: booleanOr(source.enabled, true),
        shape:
          (source as Partial<ColliderComponent>).shape === 'circle'
            ? 'circle'
            : source.shape === 'rectangle'
              ? 'box'
              : 'box',
        autoSize:
          typeof source.autoSize === 'boolean'
            ? source.autoSize
            : hasManualColliderMetrics
              ? false
              : fallback && fallback.type === ComponentType.Collider
                ? fallback.autoSize
                : true,
        width: Math.max(
          8,
          numberOr(
            (source as Partial<ColliderComponent>).width,
            legacyColliderSize?.x ?? (fallback && fallback.type === ComponentType.Collider ? fallback.width : 96),
          ),
        ),
        height: Math.max(
          8,
          numberOr(
            (source as Partial<ColliderComponent>).height,
            legacyColliderSize?.y ?? (fallback && fallback.type === ComponentType.Collider ? fallback.height : 96),
          ),
        ),
        radius: Math.max(4, numberOr((source as Partial<ColliderComponent>).radius, fallback && fallback.type === ComponentType.Collider ? fallback.radius : 48)),
        offsetX: numberOr((source as Partial<ColliderComponent>).offsetX, fallback && fallback.type === ComponentType.Collider ? fallback.offsetX : 0),
        offsetY: numberOr((source as Partial<ColliderComponent>).offsetY, fallback && fallback.type === ComponentType.Collider ? fallback.offsetY : 0),
        isTrigger: booleanOr(
          (source as Partial<ColliderComponent>).isTrigger,
          booleanOr(source.isSensor, fallback && fallback.type === ComponentType.Collider ? fallback.isTrigger : false),
        ),
        isPassThrough: booleanOr((source as Partial<ColliderComponent>).isPassThrough, fallback && fallback.type === ComponentType.Collider ? fallback.isPassThrough : false),
      } satisfies ColliderComponent;
    case ComponentType.Script:
      return {
        id: stringOr(source.id, generateId('script')),
        type: ComponentType.Script,
        enabled: booleanOr(source.enabled, true),
        code: stringOr(
          (source as Partial<ScriptComponent>).code,
          stringOr(source.source, stringOr(source.content, fallback && fallback.type === ComponentType.Script ? fallback.code : '')),
        ),
      } satisfies ScriptComponent;
    case ComponentType.Behavior:
      return {
        id: stringOr(source.id, generateId('behavior')),
        type: ComponentType.Behavior,
        enabled: booleanOr(source.enabled, true),
        kind: (() => {
          const rawKind = source.kind ?? source.behaviorType;
          return isBehaviorKind(rawKind) ? rawKind : fallback && fallback.type === ComponentType.Behavior ? fallback.kind : 'none';
        })(),
        moveSpeed: Math.max(0, numberOr((source as Partial<BehaviorComponent>).moveSpeed, fallback && fallback.type === ComponentType.Behavior ? fallback.moveSpeed : 220)),
        jumpForce: Math.max(0, numberOr((source as Partial<BehaviorComponent>).jumpForce, fallback && fallback.type === ComponentType.Behavior ? fallback.jumpForce : 560)),
        patrolDistance: Math.max(0, numberOr((source as Partial<BehaviorComponent>).patrolDistance, fallback && fallback.type === ComponentType.Behavior ? fallback.patrolDistance : 180)),
        patrolSpeed: Math.max(0, numberOr((source as Partial<BehaviorComponent>).patrolSpeed, fallback && fallback.type === ComponentType.Behavior ? fallback.patrolSpeed : 90)),
        patrolAxis: (source as Partial<BehaviorComponent>).patrolAxis === 'y' ? 'y' : fallback && fallback.type === ComponentType.Behavior ? fallback.patrolAxis : 'x',
        collectibleValue: Math.max(0, numberOr((source as Partial<BehaviorComponent>).collectibleValue, fallback && fallback.type === ComponentType.Behavior ? fallback.collectibleValue : 10)),
        respawnDelay: Math.max(0, numberOr((source as Partial<BehaviorComponent>).respawnDelay, fallback && fallback.type === ComponentType.Behavior ? fallback.respawnDelay : 0)),
        checkpointId: stringOr((source as Partial<BehaviorComponent>).checkpointId, fallback && fallback.type === ComponentType.Behavior ? fallback.checkpointId : ''),
      } satisfies BehaviorComponent;
    default:
      return fallback;
  }
}

function isBehaviorKind(value: unknown): value is BehaviorKind {
  return (
    value === 'none' ||
    value === 'player-platformer' ||
    value === 'player-topdown' ||
    value === 'enemy-patrol' ||
    value === 'moving-platform' ||
    value === 'collectible' ||
    value === 'goal' ||
    value === 'hazard'
  );
}

export function summarizeProject(project: Project) {
  const activeScene = getActiveScene(project);
  const behaviors = activeScene.entities
    .map((entity) => {
      const behavior = getComponent<BehaviorComponent>(entity, ComponentType.Behavior);
      return behavior && behavior.enabled ? `${entity.name}:${behavior.kind}` : null;
    })
    .filter(Boolean);

  return {
    name: project.name,
    description: project.description,
    activeScene: activeScene.name,
    sceneCount: project.scenes.length,
    entityCount: activeScene.entities.length,
    behaviors,
    controls: project.controls,
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundSize(value: number) {
  return Math.max(8, Math.round(value));
}

function isProjectileLikeEntity(entity: Entity) {
  const script = getComponent<ScriptComponent>(entity, ComponentType.Script);
  const text = [entity.name, ...entity.tags, script?.code ?? ''].join(' ').toLowerCase();
  return /\b(projectile|bullet|shot|missile|orb|fireball|laser)\b/.test(text);
}

function isGroundLikeEntity(entity: Entity) {
  return /\b(ground|floor|base|arena)\b/i.test(entity.name);
}

function isWallLikeEntity(entity: Entity) {
  return /\b(wall|barrier|blocker|gate)\b/i.test(entity.name);
}

function applyTargetSpriteSize(
  sprite: SpriteComponent,
  config: {
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    targetWidth: number;
    targetHeight: number;
  },
) {
  const widthOutOfRange = sprite.width < config.minWidth || sprite.width > config.maxWidth;
  const heightOutOfRange = sprite.height < config.minHeight || sprite.height > config.maxHeight;

  if (!widthOutOfRange && !heightOutOfRange) {
    return;
  }

  sprite.width = roundSize(config.targetWidth);
  sprite.height = roundSize(config.targetHeight);
}

function rebalanceColliderToSprite(
  collider: ColliderComponent | undefined,
  sprite: SpriteComponent,
  projectileLike: boolean,
) {
  if (!collider || collider.autoSize) {
    return;
  }

  if (projectileLike && collider.isTrigger) {
    const diameter = Math.max(8, Math.round(Math.min(sprite.width, sprite.height) * 0.65));
    collider.width = diameter;
    collider.height = diameter;
    collider.radius = Math.max(4, Math.round(diameter / 2));
    return;
  }

  if (collider.shape === 'circle') {
    const idealRadius = Math.max(4, Math.round(Math.min(sprite.width, sprite.height) * 0.4));
    if (collider.radius < idealRadius * 0.5 || collider.radius > idealRadius * 1.6) {
      collider.radius = idealRadius;
      collider.width = idealRadius * 2;
      collider.height = idealRadius * 2;
    }
    return;
  }

  if (collider.width < sprite.width * 0.35 || collider.width > sprite.width * 1.5) {
    collider.width = roundSize(sprite.width);
  }

  if (collider.height < sprite.height * 0.35 || collider.height > sprite.height * 1.5) {
    collider.height = roundSize(sprite.height);
  }
}

function rebalanceAiEntity(entity: Entity, scene: Scene) {
  const transform = getComponent<TransformComponent>(entity, ComponentType.Transform);
  const sprite = getComponent<SpriteComponent>(entity, ComponentType.Sprite);
  const collider = getComponent<ColliderComponent>(entity, ComponentType.Collider);

  if (!transform || !sprite) {
    return entity;
  }

  const nextEntity = structuredClone(entity);
  const nextTransform = getComponent<TransformComponent>(nextEntity, ComponentType.Transform);
  const nextSprite = getComponent<SpriteComponent>(nextEntity, ComponentType.Sprite);
  const nextCollider = getComponent<ColliderComponent>(nextEntity, ComponentType.Collider);

  if (!nextTransform || !nextSprite) {
    return nextEntity;
  }

  if (
    nextTransform.scale.x <= 0 ||
    nextTransform.scale.y <= 0 ||
    nextTransform.scale.x > 4 ||
    nextTransform.scale.y > 4 ||
    nextTransform.scale.x < 0.25 ||
    nextTransform.scale.y < 0.25
  ) {
    nextTransform.scale = {x: 1, y: 1};
  }

  const cameraWidth = Math.max(320, scene.settings.cameraSize.x);
  const cameraHeight = Math.max(240, scene.settings.cameraSize.y);
  const projectileLike = entity.prefab === 'hazard' && isProjectileLikeEntity(entity);
  const bossLike = entity.prefab === 'enemy' && /\bboss\b/i.test(entity.name);

  if (entity.prefab === 'player') {
    applyTargetSpriteSize(nextSprite, {
      minWidth: 24,
      maxWidth: Math.max(96, Math.round(cameraWidth * 0.14)),
      minHeight: 32,
      maxHeight: Math.max(128, Math.round(cameraHeight * 0.22)),
      targetWidth: 72,
      targetHeight: 96,
    });
  } else if (entity.prefab === 'collectible') {
    applyTargetSpriteSize(nextSprite, {
      minWidth: 12,
      maxWidth: Math.max(40, Math.round(cameraWidth * 0.06)),
      minHeight: 12,
      maxHeight: Math.max(40, Math.round(cameraHeight * 0.06)),
      targetWidth: 24,
      targetHeight: 24,
    });
  } else if (entity.prefab === 'goal') {
    applyTargetSpriteSize(nextSprite, {
      minWidth: 24,
      maxWidth: Math.max(80, Math.round(cameraWidth * 0.1)),
      minHeight: 32,
      maxHeight: Math.max(128, Math.round(cameraHeight * 0.22)),
      targetWidth: 48,
      targetHeight: 96,
    });
  } else if (entity.prefab === 'enemy') {
    applyTargetSpriteSize(nextSprite, {
      minWidth: 28,
      maxWidth: bossLike ? Math.max(112, Math.round(cameraWidth * 0.14)) : Math.max(88, Math.round(cameraWidth * 0.1)),
      minHeight: 28,
      maxHeight: bossLike ? Math.max(112, Math.round(cameraHeight * 0.18)) : Math.max(88, Math.round(cameraHeight * 0.14)),
      targetWidth: bossLike ? 64 : 56,
      targetHeight: bossLike ? 64 : 56,
    });
  } else if (projectileLike) {
    applyTargetSpriteSize(nextSprite, {
      minWidth: 8,
      maxWidth: Math.min(32, Math.max(18, Math.round(cameraWidth * 0.03))),
      minHeight: 8,
      maxHeight: Math.min(24, Math.max(12, Math.round(cameraHeight * 0.035))),
      targetWidth: 20,
      targetHeight: 12,
    });
  } else if (entity.prefab === 'platform' && !isGroundLikeEntity(entity) && !isWallLikeEntity(entity)) {
    nextSprite.height = clampNumber(nextSprite.height, 16, Math.max(40, Math.round(cameraHeight * 0.07)));
    if (nextSprite.width < 48 || nextSprite.width > Math.max(280, Math.round(cameraWidth * 0.45))) {
      nextSprite.width = clampNumber(nextSprite.width, 96, Math.max(220, Math.round(cameraWidth * 0.22)));
    }
  }

  rebalanceColliderToSprite(nextCollider, nextSprite, projectileLike);
  return nextEntity;
}

function rebalanceAiProject(project: Project): Project {
  return {
    ...project,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      entities: scene.entities.map((entity) => rebalanceAiEntity(entity, scene)),
    })),
  };
}

export function buildAiPromptContext(project: Project) {
  return JSON.stringify(
    {
      summary: summarizeProject(project),
      project,
      supportedPrefabs: ['player', 'platform', 'enemy', 'collectible', 'goal', 'hazard', 'decoration', 'custom'],
      supportedBehaviors: ['none', 'player-platformer', 'player-topdown', 'enemy-patrol', 'moving-platform', 'collectible', 'goal', 'hazard'],
      guidance: [
        'Return a complete project JSON that keeps IDs stable when extending an existing project.',
        'Every gameplay entity should include Transform and Sprite.',
        'Use Sprite.width/height for authored size. Keep Transform.scale near 1 unless you intentionally need a multiplier.',
        'Behavior uses kind. RigidBody uses isStatic. Collider shape uses box/circle.',
        'Keep gameplay proportions practical: player about 6-14% of camera height, collectibles about 2-6%, small bosses about 8-18%, projectiles about 1-3% of camera width.',
        'Regular platforms should usually be much thinner than actors; avoid giant projectiles, oversized collectibles, or bosses that dominate the whole camera.',
        'Spread actors across the stage instead of stacking many entities at the same coordinates.',
        'Keep hitboxes close to visible sprites. Avoid giant invisible colliders.',
        'Projectile scripts should despawn only after the projectile is fully outside the world bounds, not when it first touches the edge.',
        'Player entities should include RigidBody, Collider and a player behavior.',
        'Scene settings must include worldSize, cameraSize, gravity, gridSize and background colors.',
        'Use Script components when the request requires custom engine functionality beyond the built-in behaviors.',
        'Preferred Script formats: export default class MyLogic { init(entity, scene) {} update(dt) {} } or function update(entity, dt, scene) { ... }.',
        "Script facades expose entity.transform, entity.body, entity.rigidBody, entity.state, scene.entities and entity.getComponent('RigidBody').",
        'Set motion with body.setVelocity(x, y) or body.velocity.x/body.velocity.y.',
      ],
    },
    null,
    2,
  );
}

export function normalizeAiResponse(input: unknown, fallbackProject: Project): AIResponsePayload {
  const source = input && typeof input === 'object' ? (input as Partial<AIResponsePayload>) : {};
  const summaryObject =
    source.summary && typeof source.summary === 'object'
      ? (source.summary as Record<string, unknown>)
      : null;
  const notes =
    typeof source.notes === 'string'
      ? [source.notes]
      : Array.isArray(source.notes)
        ? source.notes.filter((note): note is string => typeof note === 'string')
        : [];
  const projectSource =
    source.project ??
    (input && typeof input === 'object' && Array.isArray((input as Project).scenes) ? (input as Project) : fallbackProject);

  return {
    summary:
      stringOr(source.summary, '') ||
      stringOr(summaryObject?.text, '') ||
      stringOr(summaryObject?.description, '') ||
      stringOr(summaryObject?.title, 'AI updated the project structure.'),
    notes,
    project: rebalanceAiProject(normalizeProject(projectSource, fallbackProject)),
  };
}
