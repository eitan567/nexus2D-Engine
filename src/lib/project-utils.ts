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
  worldSize: { x: 2400, y: 1350 },
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

function vectorOr(value: unknown, fallback: Vector2): Vector2 {
  if (!value || typeof value !== 'object') {
    return {...fallback};
  }

  const maybeVector = value as Partial<Vector2>;
  return {
    x: numberOr(maybeVector.x, fallback.x),
    y: numberOr(maybeVector.y, fallback.y),
  };
}

export function createTransform(position: Vector2, scale: Vector2 = {x: 1, y: 1}): TransformComponent {
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
    velocity: {x: 0, y: 0},
    mass: 1,
    isStatic: false,
    gravityScale: 1,
    drag: {x: 0, y: 0},
    bounce: {x: 0, y: 0},
    maxVelocity: {x: 450, y: 1400},
    ...options,
  };
}

export function createCollider(options: Partial<ColliderComponent> = {}): ColliderComponent {
  return {
    id: generateId('collider'),
    type: ComponentType.Collider,
    enabled: true,
    shape: 'box',
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
            createSprite({color: '#d4c095', width: 72, height: 96, shape: 'rectangle'}),
            createRigidBody({drag: {x: 800, y: 0}, maxVelocity: {x: 320, y: 1200}}),
            createCollider({width: 72, height: 96}),
            createBehavior('player-platformer', {moveSpeed: 240, jumpForce: 620}),
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
            createSprite({color: '#666d77', width: 240, height: 32, shape: 'rectangle'}),
            createRigidBody({isStatic: true, gravityScale: 0}),
            createCollider({width: 240, height: 32}),
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
            createSprite({color: '#8e6f73', width: 80, height: 80, shape: 'diamond'}),
            createRigidBody({drag: {x: 600, y: 0}, maxVelocity: {x: 220, y: 1200}}),
            createCollider({width: 80, height: 80}),
            createBehavior('enemy-patrol', {patrolDistance: 260, patrolSpeed: 120}),
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
            createSprite({color: '#b6a071', width: 40, height: 40, shape: 'ellipse'}),
            createCollider({width: 44, height: 44, isTrigger: true}),
            createBehavior('collectible', {collectibleValue: 10}),
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
            createSprite({color: '#8a9199', width: 64, height: 112, shape: 'rectangle'}),
            createCollider({width: 64, height: 112, isTrigger: true}),
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
            createSprite({color: '#8d666d', width: 120, height: 28, shape: 'diamond'}),
            createCollider({width: 120, height: 28, isTrigger: true}),
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
            createSprite({color: '#5d636c', width: 96, height: 160, shape: 'diamond', opacity: 0.65}),
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
            createSprite({color: '#7f858d'}),
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
    createEntityFromPrefab('player', {x: 160, y: 620}),
    createEntityFromPrefab('platform', {x: 800, y: 840}),
    {
      ...createEntityFromPrefab('platform', {x: 520, y: 720}),
      name: 'Mid Platform',
    },
    {
      ...createEntityFromPrefab('platform', {x: 980, y: 620}),
      name: 'Upper Platform',
    },
    createEntityFromPrefab('enemy', {x: 980, y: 560}),
    createEntityFromPrefab('collectible', {x: 520, y: 660}),
    createEntityFromPrefab('collectible', {x: 1000, y: 560}),
    createEntityFromPrefab('goal', {x: 1380, y: 720}),
    createEntityFromPrefab('hazard', {x: 1190, y: 858}),
  ]);

  scene.settings.backgroundTop = '#2a2d33';
  scene.settings.backgroundBottom = '#202329';
  scene.settings.worldSize = {x: 1800, y: 960};
  scene.settings.gravity = {x: 0, y: 1100};
  scene.notes = 'Template platformer scene with player, patrol enemy, collectibles and goal.';

  return scene;
}

export function createTopDownTemplate() {
  const scene = createScene('Neon Maze', [
    {
      ...createEntityFromPrefab('player', {x: 280, y: 280}),
      name: 'Explorer',
      components: [
        createTransform({x: 280, y: 280}),
        createSprite({color: '#b8c2c9', width: 72, height: 72, shape: 'ellipse'}),
        createRigidBody({drag: {x: 900, y: 900}, gravityScale: 0, maxVelocity: {x: 280, y: 280}}),
        createCollider({width: 72, height: 72}),
        createBehavior('player-topdown', {moveSpeed: 220}),
      ],
    },
    {
      ...createEntityFromPrefab('platform', {x: 800, y: 120}),
      name: 'North Wall',
      components: [
        createTransform({x: 800, y: 120}),
        createSprite({color: '#5d636b', width: 1180, height: 32}),
        createRigidBody({isStatic: true, gravityScale: 0}),
        createCollider({width: 1180, height: 32}),
      ],
    },
    {
      ...createEntityFromPrefab('platform', {x: 800, y: 780}),
      name: 'South Wall',
      components: [
        createTransform({x: 800, y: 780}),
        createSprite({color: '#5d636b', width: 1180, height: 32}),
        createRigidBody({isStatic: true, gravityScale: 0}),
        createCollider({width: 1180, height: 32}),
      ],
    },
    {
      ...createEntityFromPrefab('platform', {x: 220, y: 450}),
      name: 'West Wall',
      components: [
        createTransform({x: 220, y: 450}),
        createSprite({color: '#5d636b', width: 32, height: 680}),
        createRigidBody({isStatic: true, gravityScale: 0}),
        createCollider({width: 32, height: 680}),
      ],
    },
    {
      ...createEntityFromPrefab('platform', {x: 1380, y: 450}),
      name: 'East Wall',
      components: [
        createTransform({x: 1380, y: 450}),
        createSprite({color: '#5d636b', width: 32, height: 680}),
        createRigidBody({isStatic: true, gravityScale: 0}),
        createCollider({width: 32, height: 680}),
      ],
    },
    {
      ...createEntityFromPrefab('collectible', {x: 800, y: 450}),
      name: 'Energy Core',
    },
    {
      ...createEntityFromPrefab('goal', {x: 1220, y: 670}),
      name: 'Exit Gate',
    },
  ]);

  scene.settings.backgroundTop = '#2a2d33';
  scene.settings.backgroundBottom = '#202329';
  scene.settings.gravity = {x: 0, y: 0};
  scene.settings.worldSize = {x: 1600, y: 900};
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
  const base = fallback ?? createEntityFromPrefab('custom', {x: 240, y: 240});
  const source = input && typeof input === 'object' ? (input as Partial<Entity>) : {};
  const prefab = isPrefab(source.prefab) ? source.prefab : base.prefab;
  const components = Array.isArray(source.components)
    ? source.components
        .map((component, index) => normalizeComponent(component, base.components[index]))
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

function normalizeComponent(input: unknown, fallback?: Component) {
  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const source = input as Partial<Component>;
  const type = source.type ?? fallback?.type;

  switch (type) {
    case ComponentType.Transform:
      return {
        id: stringOr(source.id, generateId('transform')),
        type: ComponentType.Transform,
        enabled: booleanOr(source.enabled, true),
        position: vectorOr((source as Partial<TransformComponent>).position, fallback && fallback.type === ComponentType.Transform ? fallback.position : {x: 0, y: 0}),
        rotation: numberOr((source as Partial<TransformComponent>).rotation, fallback && fallback.type === ComponentType.Transform ? fallback.rotation : 0),
        scale: vectorOr((source as Partial<TransformComponent>).scale, fallback && fallback.type === ComponentType.Transform ? fallback.scale : {x: 1, y: 1}),
      } satisfies TransformComponent;
    case ComponentType.Sprite:
      return {
        id: stringOr(source.id, generateId('sprite')),
        type: ComponentType.Sprite,
        enabled: booleanOr(source.enabled, true),
        assetId: stringOr((source as Partial<SpriteComponent>).assetId, fallback && fallback.type === ComponentType.Sprite ? fallback.assetId : ''),
        color: stringOr((source as Partial<SpriteComponent>).color, fallback && fallback.type === ComponentType.Sprite ? fallback.color : '#4cc9f0'),
        opacity: Math.min(1, Math.max(0, numberOr((source as Partial<SpriteComponent>).opacity, fallback && fallback.type === ComponentType.Sprite ? fallback.opacity : 1))),
        width: Math.max(8, numberOr((source as Partial<SpriteComponent>).width, fallback && fallback.type === ComponentType.Sprite ? fallback.width : 96)),
        height: Math.max(8, numberOr((source as Partial<SpriteComponent>).height, fallback && fallback.type === ComponentType.Sprite ? fallback.height : 96)),
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
        velocity: vectorOr((source as Partial<RigidBodyComponent>).velocity, fallback && fallback.type === ComponentType.RigidBody ? fallback.velocity : {x: 0, y: 0}),
        mass: Math.max(0.1, numberOr((source as Partial<RigidBodyComponent>).mass, fallback && fallback.type === ComponentType.RigidBody ? fallback.mass : 1)),
        isStatic: booleanOr((source as Partial<RigidBodyComponent>).isStatic, fallback && fallback.type === ComponentType.RigidBody ? fallback.isStatic : false),
        gravityScale: numberOr((source as Partial<RigidBodyComponent>).gravityScale, fallback && fallback.type === ComponentType.RigidBody ? fallback.gravityScale : 1),
        drag: vectorOr((source as Partial<RigidBodyComponent>).drag, fallback && fallback.type === ComponentType.RigidBody ? fallback.drag : {x: 0, y: 0}),
        bounce: vectorOr((source as Partial<RigidBodyComponent>).bounce, fallback && fallback.type === ComponentType.RigidBody ? fallback.bounce : {x: 0, y: 0}),
        maxVelocity: vectorOr((source as Partial<RigidBodyComponent>).maxVelocity, fallback && fallback.type === ComponentType.RigidBody ? fallback.maxVelocity : {x: 450, y: 1400}),
      } satisfies RigidBodyComponent;
    case ComponentType.Collider:
      return {
        id: stringOr(source.id, generateId('collider')),
        type: ComponentType.Collider,
        enabled: booleanOr(source.enabled, true),
        shape: (source as Partial<ColliderComponent>).shape === 'circle' ? 'circle' : 'box',
        width: Math.max(8, numberOr((source as Partial<ColliderComponent>).width, fallback && fallback.type === ComponentType.Collider ? fallback.width : 96)),
        height: Math.max(8, numberOr((source as Partial<ColliderComponent>).height, fallback && fallback.type === ComponentType.Collider ? fallback.height : 96)),
        radius: Math.max(4, numberOr((source as Partial<ColliderComponent>).radius, fallback && fallback.type === ComponentType.Collider ? fallback.radius : 48)),
        offsetX: numberOr((source as Partial<ColliderComponent>).offsetX, fallback && fallback.type === ComponentType.Collider ? fallback.offsetX : 0),
        offsetY: numberOr((source as Partial<ColliderComponent>).offsetY, fallback && fallback.type === ComponentType.Collider ? fallback.offsetY : 0),
        isTrigger: booleanOr((source as Partial<ColliderComponent>).isTrigger, fallback && fallback.type === ComponentType.Collider ? fallback.isTrigger : false),
        isPassThrough: booleanOr((source as Partial<ColliderComponent>).isPassThrough, fallback && fallback.type === ComponentType.Collider ? fallback.isPassThrough : false),
      } satisfies ColliderComponent;
    case ComponentType.Script:
      return {
        id: stringOr(source.id, generateId('script')),
        type: ComponentType.Script,
        enabled: booleanOr(source.enabled, true),
        code: stringOr((source as Partial<ScriptComponent>).code, fallback && fallback.type === ComponentType.Script ? fallback.code : ''),
      } satisfies ScriptComponent;
    case ComponentType.Behavior:
      return {
        id: stringOr(source.id, generateId('behavior')),
        type: ComponentType.Behavior,
        enabled: booleanOr(source.enabled, true),
        kind: isBehaviorKind((source as Partial<BehaviorComponent>).kind) ? (source as Partial<BehaviorComponent>).kind : fallback && fallback.type === ComponentType.Behavior ? fallback.kind : 'none',
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
        'Player entities should include RigidBody, Collider and a player behavior.',
        'Scene settings must include worldSize, gravity, gridSize and background colors.',
        'Use Script components when the request requires custom engine functionality beyond the built-in behaviors.',
      ],
    },
    null,
    2,
  );
}

export function normalizeAiResponse(input: unknown, fallbackProject: Project): AIResponsePayload {
  const source = input && typeof input === 'object' ? (input as Partial<AIResponsePayload>) : {};

  return {
    summary: stringOr(source.summary, 'AI updated the project structure.'),
    notes: Array.isArray(source.notes) ? source.notes.filter((note) => typeof note === 'string') : [],
    project: normalizeProject(source.project, fallbackProject),
  };
}
