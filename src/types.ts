export type Vector2 = { x: number; y: number };

export type TransformMode = 'move' | 'rotate' | 'scale';
export type ViewportMode = 'desktop' | 'mobile';
export type SpriteShape = 'rectangle' | 'ellipse' | 'diamond';
export type ColliderShape = 'box' | 'circle';
export type PatrolAxis = 'x' | 'y';
export type EntityPrefab =
  | 'player'
  | 'platform'
  | 'enemy'
  | 'collectible'
  | 'goal'
  | 'hazard'
  | 'decoration'
  | 'custom';

export type BehaviorKind =
  | 'none'
  | 'player-platformer'
  | 'player-topdown'
  | 'enemy-patrol'
  | 'moving-platform'
  | 'collectible'
  | 'goal'
  | 'hazard';

export enum ComponentType {
  Transform = 'Transform',
  Sprite = 'Sprite',
  RigidBody = 'RigidBody',
  Collider = 'Collider',
  Script = 'Script',
  Behavior = 'Behavior',
}

export interface BaseComponent {
  id: string;
  type: ComponentType;
  enabled: boolean;
}

export interface TransformComponent extends BaseComponent {
  type: ComponentType.Transform;
  position: Vector2;
  rotation: number;
  scale: Vector2;
}

export interface SpriteComponent extends BaseComponent {
  type: ComponentType.Sprite;
  assetId: string;
  color: string;
  opacity: number;
  width: number;
  height: number;
  shape: SpriteShape;
  flipX: boolean;
  flipY: boolean;
}

export interface RigidBodyComponent extends BaseComponent {
  type: ComponentType.RigidBody;
  velocity: Vector2;
  mass: number;
  isStatic: boolean;
  gravityScale: number;
  drag: Vector2;
  bounce: Vector2;
  maxVelocity: Vector2;
}

export interface ColliderComponent extends BaseComponent {
  type: ComponentType.Collider;
  shape: ColliderShape;
  autoSize: boolean;
  width: number;
  height: number;
  radius: number;
  offsetX: number;
  offsetY: number;
  isTrigger: boolean;
  isPassThrough: boolean;
}

export interface ScriptComponent extends BaseComponent {
  type: ComponentType.Script;
  code: string;
}

export interface BehaviorComponent extends BaseComponent {
  type: ComponentType.Behavior;
  kind: BehaviorKind;
  moveSpeed: number;
  jumpForce: number;
  patrolDistance: number;
  patrolSpeed: number;
  patrolAxis: PatrolAxis;
  collectibleValue: number;
  respawnDelay: number;
  checkpointId: string;
}

export type Component =
  | TransformComponent
  | SpriteComponent
  | RigidBodyComponent
  | ColliderComponent
  | ScriptComponent
  | BehaviorComponent;

export interface Entity {
  id: string;
  name: string;
  components: Component[];
  children: string[];
  parent: string | null;
  tags: string[];
  layer: number;
  locked: boolean;
  hidden: boolean;
  prefab: EntityPrefab;
}

export interface Asset {
  id: string;
  name: string;
  type: 'image' | 'audio';
  url: string;
}

export interface SceneSettings {
  worldSize: Vector2;
  cameraStart: Vector2;
  gravity: Vector2;
  gridSize: number;
  snapToGrid: boolean;
  showGrid: boolean;
  cameraFollowPlayer: boolean;
  backgroundTop: string;
  backgroundBottom: string;
  ambientColor: string;
}

export interface Scene {
  id: string;
  name: string;
  notes: string;
  settings: SceneSettings;
  entities: Entity[];
}

export interface Controls {
  left: string;
  right: string;
  up: string;
  down: string;
  jump: string;
  action: string;
  altAction: string;
}

export interface Project {
  version: number;
  name: string;
  description: string;
  updatedAt: string;
  scenes: Scene[];
  assets: Asset[];
  activeSceneId: string;
  controls: Controls;
}

export interface RuntimeSnapshot {
  mode: 'editor' | 'play' | 'win';
  score: number;
  collectiblesRemaining: number;
  deaths: number;
  player?: {
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
  camera: {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
  };
  scene: {
    id: string;
    name: string;
    worldWidth: number;
    worldHeight: number;
  };
  selectedEntityId: string | null;
  entities: Array<{
    id: string;
    name: string;
    prefab: EntityPrefab;
    hidden: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    behavior: BehaviorKind;
  }>;
}

export interface AIRequestPayload {
  mode: 'create' | 'extend';
  prompt: string;
  project: Project;
}

export interface AIResponsePayload {
  summary: string;
  notes: string[];
  project: Project;
}
