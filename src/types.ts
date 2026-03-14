export type Vector2 = { x: number; y: number };

export enum ComponentType {
  Transform = 'Transform',
  Sprite = 'Sprite',
  RigidBody = 'RigidBody',
  Collider = 'Collider',
  Script = 'Script',
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
  flipX: boolean;
  flipY: boolean;
}

export interface RigidBodyComponent extends BaseComponent {
  type: ComponentType.RigidBody;
  velocity: Vector2;
  mass: number;
  isStatic: boolean;
  gravityScale: number;
}

export interface ColliderComponent extends BaseComponent {
  type: ComponentType.Collider;
  shape: 'box' | 'circle';
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

export type Component = TransformComponent | SpriteComponent | RigidBodyComponent | ColliderComponent | ScriptComponent;

export interface Entity {
  id: string;
  name: string;
  components: Component[];
  children: string[]; // IDs of child entities
  parent: string | null;
}

export interface Asset {
  id: string;
  name: string;
  type: 'image' | 'audio';
  url: string;
}

export interface Scene {
  id: string;
  name: string;
  entities: Entity[];
}

export interface Controls {
  left: string;
  right: string;
  up: string;
  down: string;
  jump: string;
}

export interface Project {
  name: string;
  scenes: Scene[];
  assets: Asset[];
  activeSceneId: string;
  controls: Controls;
}
