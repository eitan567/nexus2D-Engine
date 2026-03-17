import * as Phaser from 'phaser';
import {getActiveScene, getComponent} from '../lib/project-utils';
import {
  BehaviorComponent,
  ColliderComponent,
  ComponentType,
  Entity,
  Project,
  RigidBodyComponent,
  RuntimeSnapshot,
  Scene,
  ScriptComponent,
  SpriteComponent,
  TransformComponent,
  TransformMode,
  Vector2,
} from '../types';
import {InputManager} from './InputManager';

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

type VirtualInput = 'left' | 'right' | 'up' | 'down' | 'jump' | 'action' | 'altAction';
type EditorViewportMode = 'world' | 'camera';

type EntityInstance = {
  sprite: Phaser.GameObjects.Sprite;
  authoredPosition: Vector2;
  patrolOrigin: Vector2;
  triggerConsumed: boolean;
  lastDirection: 1 | -1;
  scriptState: unknown;
  scriptRuntime?: {
    source: string;
    executor: ScriptExecutor | null | undefined;
    context: Record<string, unknown>;
    hooks: ScriptHooks | null;
    classInstance: Record<string, unknown> | null;
    initialized: boolean;
    lastError: string | null;
  };
};

type ScriptHooks = {
  init?: (...args: unknown[]) => void;
  update?: (...args: unknown[]) => void;
  onCollect?: (...args: unknown[]) => void;
};

type ScriptInlineRunner = (
  entity: unknown,
  sprite: Phaser.GameObjects.Sprite,
  body: unknown,
  scene: unknown,
  inputs: Record<VirtualInput, boolean>,
  deltaSeconds: number,
  runtime: RuntimeSnapshot | null,
  Input: unknown,
  Time: unknown,
  transform: unknown,
  components: unknown,
) => unknown;

type ScriptHooksFactory = (
  entity: unknown,
  sprite: Phaser.GameObjects.Sprite,
  body: unknown,
  scene: unknown,
  inputs: Record<VirtualInput, boolean>,
  runtime: RuntimeSnapshot | null,
  Input: unknown,
  Time: unknown,
  transform: unknown,
  components: unknown,
) => ScriptHooks;

type ScriptExecutor =
  | {
      mode: 'class';
      instantiate: () => Record<string, unknown>;
    }
  | {
      mode: 'hooks';
      createHooks: ScriptHooksFactory;
    }
  | {
      mode: 'inline';
      run: ScriptInlineRunner;
    };

type ScriptBindings = {
  entity: Record<string, unknown>;
  scene: Record<string, unknown>;
  transform: Record<string, unknown>;
  body: Record<string, unknown> | null;
  components: Record<string, unknown>;
  Input: Record<string, unknown>;
  Time: {deltaTime: number};
  inputs: Record<VirtualInput, boolean>;
};

const VIRTUAL_INPUTS: Record<VirtualInput, boolean> = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  action: false,
  altAction: false,
};

export class GameEngine {
  private game: Phaser.Game;
  private scene: MainScene;
  private destroyed = false;
  private readonly renderGameToTextHandler = () => this.renderGameToText();
  private readonly advanceTimeHandler = (ms: number) => this.advanceTime(ms);

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new MainScene();
    const renderType = detectRenderType();

    const config: Phaser.Types.Core.GameConfig = {
      type: renderType,
      canvas,
      width: canvas.width,
      height: canvas.height,
      backgroundColor: '#1f2227',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: {x: 0, y: 0},
          debug: false,
        },
      },
      scene: [this.scene],
    };

    this.game = new Phaser.Game(config);

    if (typeof window !== 'undefined') {
      window.render_game_to_text = this.renderGameToTextHandler;
      window.advanceTime = this.advanceTimeHandler;
    }
  }

  setProject(project: Project) {
    if (this.destroyed) {
      return;
    }
    this.scene.deferUntilReady(() => this.scene.syncProject(project));
  }

  setSelectedEntity(id: string | null, mode: TransformMode) {
    if (this.destroyed) {
      return;
    }
    this.scene.deferUntilReady(() => this.scene.setSelectedEntity(id, mode));
  }

  setInput(input: string, value: boolean) {
    if (this.destroyed) {
      return;
    }
    this.scene.deferUntilReady(() => this.scene.setInput(input as VirtualInput, value));
  }

  setEditorViewportMode(mode: EditorViewportMode) {
    if (this.destroyed) {
      return;
    }
    this.scene.deferUntilReady(() => this.scene.setEditorViewportMode(mode));
  }

  screenToWorld(screenX: number, screenY: number) {
    return this.scene.screenToWorld(screenX, screenY);
  }

  worldToScreen(worldX: number, worldY: number) {
    return this.scene.worldToScreen(worldX, worldY);
  }

  panEditor(screenDeltaX: number, screenDeltaY: number) {
    if (this.destroyed) {
      return;
    }
    this.scene.deferUntilReady(() => this.scene.panEditor(screenDeltaX, screenDeltaY));
  }

  adjustEditorZoom(deltaY: number, screenX: number, screenY: number) {
    if (this.destroyed) {
      return;
    }
    this.scene.deferUntilReady(() => this.scene.adjustEditorZoom(deltaY, screenX, screenY));
  }

  getEditorCameraFrame() {
    return this.scene.getEditorCameraFrame();
  }

  start() {
    if (this.destroyed) {
      return;
    }
    this.scene.deferUntilReady(() => this.scene.setRunning(true));
  }

  stop() {
    if (this.destroyed) {
      return;
    }
    this.scene.deferUntilReady(() => this.scene.setRunning(false));
  }

  resize(width: number, height: number) {
    if (this.destroyed) {
      return;
    }
    this.game.scale.resize(width, height);
    this.scene.deferUntilReady(() => this.scene.handleResize(width, height));
  }

  getRuntimeSnapshot() {
    return this.scene.getRuntimeSnapshot();
  }

  renderGameToText() {
    const snapshot = this.getRuntimeSnapshot();
    return JSON.stringify(
      snapshot
        ? {
            coordinateSystem: 'origin top-left, +x right, +y down',
            ...snapshot,
          }
        : {
            mode: 'loading',
            coordinateSystem: 'origin top-left, +x right, +y down',
          },
    );
  }

  advanceTime(ms: number) {
    if (this.destroyed) {
      return;
    }
    this.scene.deferUntilReady(() => this.scene.advanceTime(ms));
  }

  destroy() {
    this.destroyed = true;
    this.scene.markDestroyed();
    if (typeof window !== 'undefined') {
      if (window.render_game_to_text === this.renderGameToTextHandler) {
        delete window.render_game_to_text;
      }
      if (window.advanceTime === this.advanceTimeHandler) {
        delete window.advanceTime;
      }
    }
    this.game.destroy(true);
  }
}

class MainScene extends Phaser.Scene {
  private ready = false;
  private destroyed = false;
  private project: Project | null = null;
  private entityMap = new Map<string, EntityInstance>();
  private solidGroup!: Phaser.Physics.Arcade.Group;
  private worldCollider?: Phaser.Physics.Arcade.Collider;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private inputManager: InputManager | null = null;
  private inputSignature = '';
  private selectedEntityId: string | null = null;
  private transformMode: TransformMode = 'move';
  private editorViewportMode: EditorViewportMode = 'world';
  private worldFillReferenceZoom: number | null = null;
  private editorZoomFactor = 1;
  private editorCameraCenter: Vector2 | null = null;
  private manualCameraControlActive = false;
  private currentSceneId: string | null = null;
  private isPlaying = false;
  private virtualInputs = {...VIRTUAL_INPUTS};
  private runtimeSnapshot: RuntimeSnapshot | null = null;
  private score = 0;
  private deaths = 0;
  private collectiblesRemaining = 0;
  private hasWon = false;
  private playerEntityId: string | null = null;
  private spawnPoint: Vector2 = {x: 120, y: 120};

  constructor() {
    super('MainScene');
  }

  markDestroyed() {
    this.destroyed = true;
    this.ready = false;
  }

  deferUntilReady(action: () => void) {
    if (this.destroyed) {
      return;
    }

    if (this.isOperational()) {
      action();
      return;
    }

    window.setTimeout(() => this.deferUntilReady(action), 30);
  }

  create() {
    this.destroyed = false;
    this.physics.pause();
    this.solidGroup = this.physics.add.group();
    this.backgroundGraphics = this.add.graphics().setDepth(-50);
    this.overlayGraphics = this.add.graphics().setDepth(10_000);

    this.generateShapeTextures();
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.handleResize(size.width, size.height);
    });

    this.input.keyboard?.on('keydown-F', () => {
      if (this.scale.isFullscreen) {
        this.scale.stopFullscreen();
      } else {
        void this.scale.startFullscreen();
      }
    });

    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.markDestroyed();
    });

    this.ready = true;
  }

  handleResize(width: number, height: number) {
    if (!this.cameras?.main) {
      return;
    }
    this.cameras.main.setSize(width, height);
    if (this.editorViewportMode === 'world') {
      this.worldFillReferenceZoom = null;
    }
    if (this.project) {
      this.refreshCamera(getActiveScene(this.project));
    }
    this.drawSceneBackground();
    this.drawOverlay();
  }

  setInput(input: VirtualInput, value: boolean) {
    this.virtualInputs[input] = value;
  }

  setSelectedEntity(id: string | null, mode: TransformMode) {
    this.selectedEntityId = id;
    this.transformMode = mode;
    if (this.project) {
      this.refreshCamera(getActiveScene(this.project));
    }
    this.drawOverlay();
    this.refreshRuntimeSnapshot(true);
  }

  setEditorViewportMode(mode: EditorViewportMode) {
    this.editorViewportMode = mode;
    this.worldFillReferenceZoom = null;
    this.editorZoomFactor = 1;
    this.editorCameraCenter = null;
    if (this.project) {
      const scene = getActiveScene(this.project);
      this.refreshCamera(scene);
      this.drawSceneBackground();
      this.drawOverlay();
      this.refreshRuntimeSnapshot(true);
    }
  }

  screenToWorld(screenX: number, screenY: number) {
    if (!this.cameras?.main) {
      return {x: screenX, y: screenY};
    }

    return this.cameras.main.getWorldPoint(screenX, screenY);
  }

  worldToScreen(worldX: number, worldY: number) {
    if (!this.cameras?.main) {
      return {x: worldX, y: worldY};
    }

    const view = this.cameras.main.worldView;
    return {
      x: this.cameras.main.x + (worldX - view.x) * this.cameras.main.zoom,
      y: this.cameras.main.y + (worldY - view.y) * this.cameras.main.zoom,
    };
  }

  panEditor(screenDeltaX: number, screenDeltaY: number) {
    if (!this.project || !this.cameras?.main) {
      return;
    }
    if (!this.isPlaying && this.editorViewportMode === 'camera') {
      return;
    }

    const scene = getActiveScene(this.project);
    if (this.isPlaying && scene.settings.cameraFollowPlayer) {
      this.manualCameraControlActive = true;
      this.cameras.main.stopFollow();
    }

    this.cameras.main.setScroll(
      this.cameras.main.scrollX - screenDeltaX / this.cameras.main.zoom,
      this.cameras.main.scrollY - screenDeltaY / this.cameras.main.zoom,
    );
    this.clampCameraToScene(scene);

    const visibleWidth = this.cameras.main.width / this.cameras.main.zoom;
    const visibleHeight = this.cameras.main.height / this.cameras.main.zoom;
    this.editorCameraCenter = {
      x: this.cameras.main.scrollX + visibleWidth / 2,
      y: this.cameras.main.scrollY + visibleHeight / 2,
    };

    this.drawOverlay();
    this.refreshRuntimeSnapshot(true);
  }

  adjustEditorZoom(deltaY: number, screenX: number, screenY: number) {
    if (!this.project || !this.cameras?.main) {
      return;
    }
    if (!this.isPlaying && this.editorViewportMode === 'camera') {
      return;
    }

    const scene = getActiveScene(this.project);
    if (this.isPlaying && scene.settings.cameraFollowPlayer) {
      this.manualCameraControlActive = true;
      this.cameras.main.stopFollow();
    }

    const zoomBefore = this.getEditorZoom(scene);
    const worldBefore = this.cameras.main.getWorldPoint(screenX, screenY);
    const multiplier = deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextFactor = this.editorZoomFactor * multiplier;

    this.editorZoomFactor = clamp(nextFactor, this.getMinZoomFactor(scene), 6);
    this.refreshCamera(scene);

    const worldAfter = this.cameras.main.getWorldPoint(screenX, screenY);
    const nextScrollX = this.cameras.main.scrollX + (worldBefore.x - worldAfter.x);
    const nextScrollY = this.cameras.main.scrollY + (worldBefore.y - worldAfter.y);

    this.cameras.main.setScroll(nextScrollX, nextScrollY);
    this.clampCameraToScene(scene);

    const visibleWidth = this.cameras.main.width / this.cameras.main.zoom;
    const visibleHeight = this.cameras.main.height / this.cameras.main.zoom;
    this.editorCameraCenter = {
      x: this.cameras.main.scrollX + visibleWidth / 2,
      y: this.cameras.main.scrollY + visibleHeight / 2,
    };

    if (Math.abs(this.getEditorZoom(scene) - zoomBefore) < 0.0001) {
      return;
    }

    this.drawOverlay();
    this.refreshRuntimeSnapshot(true);
  }

  getEditorCameraFrame() {
    if (!this.cameras?.main) {
      return null;
    }

    return {
      x: this.cameras.main.scrollX,
      y: this.cameras.main.scrollY,
      width: this.cameras.main.width / this.cameras.main.zoom,
      height: this.cameras.main.height / this.cameras.main.zoom,
      zoom: this.cameras.main.zoom,
    };
  }

  setRunning(value: boolean) {
    this.isPlaying = value;
    this.manualCameraControlActive = false;

    if (this.project) {
      this.resetRuntime();
      this.syncProject(this.project);
    }

    if (value) {
      this.physics.resume();
    } else {
      this.physics.pause();
    }

    this.refreshRuntimeSnapshot(true);
  }

  syncProject(project: Project) {
    if (!this.isOperational()) {
      return;
    }

    const nextScene = getActiveScene(project);
    if (this.currentSceneId !== nextScene.id) {
      this.currentSceneId = nextScene.id;
      this.worldFillReferenceZoom = null;
      this.editorZoomFactor = 1;
      this.editorCameraCenter = null;
    }

    this.project = project;
    const activeScene = nextScene;
    const nextInputSignature = JSON.stringify(project.controls);

    if (!this.inputManager || this.inputSignature !== nextInputSignature) {
      this.inputManager = new InputManager(this, project.controls);
      this.inputSignature = nextInputSignature;
    }
    this.loadAssets(project);
    this.applySceneSettings(activeScene);
    this.syncEntities(activeScene);
    this.refreshCamera(activeScene);
    this.drawSceneBackground();
    this.drawOverlay();
    this.refreshRuntimeSnapshot(true);
  }

  getRuntimeSnapshot() {
    return this.runtimeSnapshot;
  }

  advanceTime(ms: number) {
    if (!this.isOperational()) {
      return;
    }

    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    const deltaSeconds = 1 / 60;

    for (let index = 0; index < steps; index += 1) {
      if (this.isPlaying) {
        this.stepGameplay(deltaSeconds);
        this.physics.world.step(deltaSeconds);
        this.physics.world.postUpdate();
      }
    }

    this.drawOverlay();
    this.refreshRuntimeSnapshot(true);
  }

  update(_time: number, delta: number) {
    if (!this.isOperational()) {
      return;
    }

    if (this.isPlaying) {
      this.stepGameplay(Math.min(0.05, delta / 1000));
    }

    this.drawOverlay();
    this.refreshRuntimeSnapshot();
  }

  private applySceneSettings(scene: Scene) {
    if (!this.cameras?.main || !this.physics?.world) {
      return;
    }
    this.physics.world.setBounds(0, 0, scene.settings.worldSize.x, scene.settings.worldSize.y);
    this.cameras.main.setBounds(0, 0, scene.settings.worldSize.x, scene.settings.worldSize.y);
    this.cameras.main.setBackgroundColor(scene.settings.backgroundBottom);
  }

  private refreshCamera(scene: Scene) {
    if (!this.cameras?.main) {
      return;
    }

    const viewport = this.getCameraViewport(scene);
    this.cameras.main.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
    this.editorZoomFactor = clamp(this.editorZoomFactor, this.getMinZoomFactor(scene), 6);

    const previewFrame = this.getPreviewCameraFrame(scene);
    const player = this.getPlayerInstance();
    const cameraBaseZoom = this.getCameraBaseZoom(scene);

    if (this.isPlaying && !this.manualCameraControlActive) {
      this.cameras.main.stopFollow();
      this.cameras.main.setZoom(cameraBaseZoom);
      this.cameras.main.setScroll(previewFrame.x, previewFrame.y);
      this.cameras.main.setDeadzone();
      this.clampCameraToScene(scene);

      if (scene.settings.cameraFollowPlayer && player) {
        this.cameras.main.startFollow(player.sprite, false, 1, 1);
      }
      return;
    }

    this.cameras.main.stopFollow();
    this.cameras.main.setDeadzone();

    if (!this.isPlaying && this.editorViewportMode === 'camera') {
      this.cameras.main.setZoom(cameraBaseZoom);
      this.cameras.main.setScroll(previewFrame.x, previewFrame.y);
      this.editorCameraCenter = {
        x: previewFrame.x + previewFrame.width / 2,
        y: previewFrame.y + previewFrame.height / 2,
      };
      this.clampCameraToScene(scene);
      return;
    }

    const zoom = this.getEditorZoom(scene);
    this.cameras.main.setZoom(zoom);
    const visibleWidth = this.cameras.main.width / zoom;
    const visibleHeight = this.cameras.main.height / zoom;
    const defaultCenter = {
      x: previewFrame.x + visibleWidth / 2,
      y: previewFrame.y + visibleHeight / 2,
    };
    const center = this.editorCameraCenter ?? defaultCenter;
    this.cameras.main.setScroll(center.x - visibleWidth / 2, center.y - visibleHeight / 2);
    this.clampCameraToScene(scene);
  }

  private syncEntities(scene: Scene) {
    const entityIds = new Set(scene.entities.map((entity) => entity.id));

    this.solidGroup.clear(false, false);
    this.worldCollider?.destroy();
    this.playerEntityId = null;
    this.collectiblesRemaining = 0;

    for (const [id, instance] of this.entityMap.entries()) {
      if (!entityIds.has(id)) {
        instance.sprite.destroy();
        this.entityMap.delete(id);
      }
    }

    scene.entities
      .slice()
      .sort((left, right) => left.layer - right.layer)
      .forEach((entity) => this.syncEntity(entity, scene));

    this.worldCollider = this.physics.add.collider(this.solidGroup, this.solidGroup);
  }

  private syncEntity(entity: Entity, scene: Scene) {
    const transform = getComponent<TransformComponent>(entity, ComponentType.Transform);
    const spriteComponent = getComponent<SpriteComponent>(entity, ComponentType.Sprite);
    const rigidBody = getComponent<RigidBodyComponent>(entity, ComponentType.RigidBody);
    const collider = getComponent<ColliderComponent>(entity, ComponentType.Collider);
    const behavior = getComponent<BehaviorComponent>(entity, ComponentType.Behavior);
    const script = getComponent<ScriptComponent>(entity, ComponentType.Script);

    if (!transform || !spriteComponent || entity.hidden) {
      const existing = this.entityMap.get(entity.id);
      if (existing) {
        existing.sprite.setVisible(false);
      }
      return;
    }

    let instance = this.entityMap.get(entity.id);
    const textureKey = this.resolveTextureKey(spriteComponent);

    if (!instance) {
      const sprite = this.add.sprite(transform.position.x, transform.position.y, textureKey);
      sprite.setOrigin(0.5, 0.5);

      instance = {
        sprite,
        authoredPosition: {...transform.position},
        patrolOrigin: {...transform.position},
        triggerConsumed: false,
        lastDirection: 1,
        scriptState: undefined,
      };
      this.entityMap.set(entity.id, instance);
    }

    const sprite = instance.sprite;
    instance.authoredPosition = {...transform.position};
    instance.patrolOrigin = {...transform.position};
    instance.triggerConsumed = false;
    const scriptSource = script?.enabled ? script.code.trim() : '';
    if (!scriptSource) {
      instance.scriptRuntime = undefined;
    } else if (instance.scriptRuntime?.source !== scriptSource) {
      instance.scriptState = undefined;
      instance.scriptRuntime = {
        source: scriptSource,
        executor: undefined,
        context: {},
        hooks: null,
        classInstance: null,
        initialized: false,
        lastError: null,
      };
    }

    if (!sprite.body) {
      this.physics.add.existing(sprite);
    }

    const body = sprite.body as Phaser.Physics.Arcade.Body;
    // Live project edits during play should update body settings without
    // snapping dynamic actors back to their authored transform.
    const preserveRuntimeState = Boolean(
      this.isPlaying && rigidBody && !rigidBody.isStatic && sprite.body,
    )
      ? {
          x: sprite.x,
          y: sprite.y,
          angle: sprite.angle,
          velocityX: body.velocity.x,
          velocityY: body.velocity.y,
        }
      : null;

    sprite.setVisible(true);
    sprite.setTexture(textureKey);
    sprite.setPosition(
      preserveRuntimeState?.x ?? transform.position.x,
      preserveRuntimeState?.y ?? transform.position.y,
    );
    sprite.setAngle(preserveRuntimeState?.angle ?? transform.rotation);
    sprite.setDisplaySize(
      spriteComponent.width * transform.scale.x,
      spriteComponent.height * transform.scale.y,
    );
    sprite.setFlip(spriteComponent.flipX, spriteComponent.flipY);
    sprite.setAlpha(spriteComponent.opacity);
    sprite.setDepth(entity.layer);

    if (!spriteComponent.assetId) {
      sprite.setTint(parseHexColor(spriteComponent.color));
    } else {
      sprite.clearTint();
    }

    body.setEnable(Boolean(rigidBody || collider));
    body.setCollideWorldBounds(Boolean(rigidBody && !rigidBody.isStatic && !collider?.isTrigger));
    body.moves = true;
    const colliderMetrics = collider ? this.resolveColliderMetrics(collider, sprite) : null;
    const bodyColliderMetrics = collider ? this.resolveBodyColliderMetrics(collider, sprite) : null;
    const isSolidCollider = Boolean(colliderMetrics && !colliderMetrics.isTrigger);

    if (isSolidCollider) {
      // Add to the collision group before configuring body physics, because the
      // group can apply its own defaults when a sprite joins it.
      this.solidGroup.add(sprite);
    }

    if (rigidBody) {
      body.setAllowGravity(this.isPlaying && !rigidBody.isStatic);
      body.setImmovable(rigidBody.isStatic);
      body.setMass(rigidBody.mass);
      body.setDrag(rigidBody.drag.x, rigidBody.drag.y);
      body.setBounce(rigidBody.bounce.x, rigidBody.bounce.y);
      body.setMaxVelocity(rigidBody.maxVelocity.x, rigidBody.maxVelocity.y);
      body.gravity.set(
        scene.settings.gravity.x * rigidBody.gravityScale,
        scene.settings.gravity.y * rigidBody.gravityScale,
      );
      if (!this.isPlaying) {
        body.setVelocity(0, 0);
      } else if (!rigidBody.isStatic) {
        body.setVelocity(
          preserveRuntimeState?.velocityX ?? rigidBody.velocity.x,
          preserveRuntimeState?.velocityY ?? rigidBody.velocity.y,
        );
      }
    } else {
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setVelocity(0, 0);
      body.gravity.set(0, 0);
    }

    if (colliderMetrics && bodyColliderMetrics) {
      if (colliderMetrics.shape === 'circle') {
        body.setCircle(bodyColliderMetrics.radius);
        body.setOffset(
          sprite.width / 2 - bodyColliderMetrics.radius + bodyColliderMetrics.offsetX,
          sprite.height / 2 - bodyColliderMetrics.radius + bodyColliderMetrics.offsetY,
        );
      } else {
        body.setSize(bodyColliderMetrics.width, bodyColliderMetrics.height);
        body.setOffset(
          sprite.width / 2 - bodyColliderMetrics.width / 2 + bodyColliderMetrics.offsetX,
          sprite.height / 2 - bodyColliderMetrics.height / 2 + bodyColliderMetrics.offsetY,
        );
      }
      body.updateFromGameObject();

      body.checkCollision.none = colliderMetrics.isTrigger;
      body.checkCollision.up = !colliderMetrics.isTrigger;
      body.checkCollision.down = !colliderMetrics.isTrigger && !colliderMetrics.isPassThrough;
      body.checkCollision.left = !colliderMetrics.isTrigger;
      body.checkCollision.right = !colliderMetrics.isTrigger;

    } else {
      body.checkCollision.none = true;
    }

    if (behavior?.enabled) {
      if (behavior.kind === 'player-platformer' || behavior.kind === 'player-topdown') {
        this.playerEntityId = entity.id;
        this.spawnPoint = {...transform.position};
      }

      if (behavior.kind === 'collectible' && sprite.visible) {
        this.collectiblesRemaining += 1;
      }
    }
  }

  private stepGameplay(deltaSeconds: number) {
    if (!this.project) {
      return;
    }

    const scene = getActiveScene(this.project);
    const player = this.getPlayerInstance();

    for (const entity of scene.entities) {
      const instance = this.entityMap.get(entity.id);
      if (!instance || !instance.sprite.visible) {
        continue;
      }

      const behavior = getComponent<BehaviorComponent>(entity, ComponentType.Behavior);
      const rigidBody = getComponent<RigidBodyComponent>(entity, ComponentType.RigidBody);
      const body = instance.sprite.body as Phaser.Physics.Arcade.Body | undefined;

      if (behavior?.enabled && body) {
        switch (behavior.kind) {
          case 'player-platformer':
            this.drivePlatformPlayer(body, behavior);
            break;
          case 'player-topdown':
            this.driveTopDownPlayer(body, behavior);
            break;
          case 'enemy-patrol':
            this.drivePatrol(instance, body, behavior);
            break;
          case 'moving-platform':
            this.driveMovingPlatform(instance, body, behavior, deltaSeconds);
            break;
          default:
            break;
        }
      }

      this.runEntityScript(entity, scene, instance, deltaSeconds);
    }

    if (player) {
      const playerBody = player.sprite.body as Phaser.Physics.Arcade.Body | undefined;
      if (playerBody && player.sprite.y > scene.settings.worldSize.y + 200) {
        this.handlePlayerRespawn(playerBody);
      }
    }

    this.handleTriggers(scene, player?.sprite);
    this.refreshCamera(scene);
  }

  private drivePlatformPlayer(body: Phaser.Physics.Arcade.Body, behavior: BehaviorComponent) {
    const left = this.virtualInputs.left || this.inputManager?.isLeftDown();
    const right = this.virtualInputs.right || this.inputManager?.isRightDown();
    const jump = this.virtualInputs.jump || this.inputManager?.isJumpDown();
    const down = this.virtualInputs.down || this.inputManager?.isDownDown();

    const speed = behavior.moveSpeed;
    const targetVelocityX = left && !right ? -speed : right && !left ? speed : 0;

    body.setVelocityX(targetVelocityX);

    const onGround = body.blocked.down || body.touching.down;
    if (jump && onGround) {
      body.setVelocityY(-behavior.jumpForce);
    } else if (down && !onGround) {
      body.setVelocityY(body.velocity.y + 18);
    }
  }

  private driveTopDownPlayer(body: Phaser.Physics.Arcade.Body, behavior: BehaviorComponent) {
    const left = this.virtualInputs.left || this.inputManager?.isLeftDown();
    const right = this.virtualInputs.right || this.inputManager?.isRightDown();
    const up = this.virtualInputs.up || this.inputManager?.isUpDown();
    const down = this.virtualInputs.down || this.inputManager?.isDownDown();

    let velocityX = 0;
    let velocityY = 0;

    if (left && !right) {
      velocityX = -behavior.moveSpeed;
    } else if (right && !left) {
      velocityX = behavior.moveSpeed;
    }

    if (up && !down) {
      velocityY = -behavior.moveSpeed;
    } else if (down && !up) {
      velocityY = behavior.moveSpeed;
    }

    body.setAllowGravity(false);
    body.gravity.set(0, 0);
    body.setVelocity(velocityX, velocityY);
  }

  private drivePatrol(
    instance: EntityInstance,
    body: Phaser.Physics.Arcade.Body,
    behavior: BehaviorComponent,
  ) {
    const sprite = instance.sprite;
    const origin = instance.patrolOrigin;
    const distance =
      behavior.patrolAxis === 'y'
        ? sprite.y - origin.y
        : sprite.x - origin.x;

    if (distance > behavior.patrolDistance) {
      instance.lastDirection = -1;
    } else if (distance < -behavior.patrolDistance) {
      instance.lastDirection = 1;
    }

    if (behavior.patrolAxis === 'y') {
      body.setVelocityY(behavior.patrolSpeed * instance.lastDirection);
    } else {
      body.setVelocityX(behavior.patrolSpeed * instance.lastDirection);
    }
  }

  private driveMovingPlatform(
    instance: EntityInstance,
    body: Phaser.Physics.Arcade.Body,
    behavior: BehaviorComponent,
    deltaSeconds: number,
  ) {
    const sprite = instance.sprite;
    const origin = instance.patrolOrigin;

    if (behavior.patrolAxis === 'y') {
      sprite.y += behavior.patrolSpeed * deltaSeconds * instance.lastDirection;
      if (sprite.y > origin.y + behavior.patrolDistance) {
        instance.lastDirection = -1;
      } else if (sprite.y < origin.y - behavior.patrolDistance) {
        instance.lastDirection = 1;
      }
    } else {
      sprite.x += behavior.patrolSpeed * deltaSeconds * instance.lastDirection;
      if (sprite.x > origin.x + behavior.patrolDistance) {
        instance.lastDirection = -1;
      } else if (sprite.x < origin.x - behavior.patrolDistance) {
        instance.lastDirection = 1;
      }
    }

    body.updateFromGameObject();
  }

  private buildScriptBindings(entity: Entity, scene: Scene, instance: EntityInstance, deltaSeconds: number): ScriptBindings {
    const entityFacadeCache = new Map<string, Record<string, unknown>>();
    const createEntityFacade = (target: Entity) => {
      const existing = entityFacadeCache.get(target.id);
      if (existing) {
        return existing;
      }

      const targetInstance = this.entityMap.get(target.id);
      const targetBody = targetInstance?.sprite.body as Phaser.Physics.Arcade.Body | undefined;
      const transformFacade = this.createScriptTransformFacade(target, targetInstance, targetBody);
      const bodyFacade = this.createScriptBodyFacade(target, targetBody);
      const componentFacades = this.createScriptComponentFacadeMap(target, targetInstance, transformFacade, bodyFacade);
      let persistentState = targetInstance?.scriptState;

      const facade: Record<string, unknown> = {
        id: target.id,
        name: target.name,
        prefab: target.prefab,
        tags: [...target.tags],
        hidden: Boolean(target.hidden || (targetInstance ? !targetInstance.sprite.visible : false)),
        transform: transformFacade,
        sprite: targetInstance?.sprite ?? null,
        body: bodyFacade,
        rigidBody: bodyFacade,
        getComponent: (name: unknown) => {
          if (typeof name !== 'string') {
            return null;
          }

          const normalizedName = name.trim();
          const directMatch = componentFacades[normalizedName];
          if (directMatch) {
            return directMatch;
          }

          const camelCaseName = normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1);
          return (
            componentFacades[normalizedName.toLowerCase()] ??
            componentFacades[camelCaseName] ??
            null
          );
        },
      };
      Object.defineProperty(facade, 'state', {
        get: () => (targetInstance ? targetInstance.scriptState : persistentState),
        set: (value: unknown) => {
          if (targetInstance) {
            targetInstance.scriptState = value;
          } else {
            persistentState = value;
          }
        },
        enumerable: true,
      });

      entityFacadeCache.set(target.id, facade);
      return facade;
    };

    const left = this.virtualInputs.left || Boolean(this.inputManager?.isLeftDown());
    const right = this.virtualInputs.right || Boolean(this.inputManager?.isRightDown());
    const up = this.virtualInputs.up || Boolean(this.inputManager?.isUpDown());
    const down = this.virtualInputs.down || Boolean(this.inputManager?.isDownDown());
    const jump = this.virtualInputs.jump || Boolean(this.inputManager?.isJumpDown());
    const action = this.virtualInputs.action;
    const altAction = this.virtualInputs.altAction;
    const inputs = {left, right, up, down, jump, action, altAction} satisfies Record<VirtualInput, boolean>;
    const Input: Record<string, unknown> = {
      left,
      right,
      up,
      down,
      jump,
      action,
      altAction,
      keys: {
        ArrowLeft: left,
        ArrowRight: right,
        ArrowUp: up,
        ArrowDown: down,
        Space: jump,
        KeyE: action,
        ShiftLeft: altAction,
        [this.project?.controls.left ?? 'ArrowLeft']: left,
        [this.project?.controls.right ?? 'ArrowRight']: right,
        [this.project?.controls.up ?? 'ArrowUp']: up,
        [this.project?.controls.down ?? 'ArrowDown']: down,
        [this.project?.controls.jump ?? 'Space']: jump,
        [this.project?.controls.action ?? 'KeyE']: action,
        [this.project?.controls.altAction ?? 'ShiftLeft']: altAction,
      },
    };
    const Time = {deltaTime: deltaSeconds};
    const entityFacade = createEntityFacade(entity);
    const transformFacade = this.createScriptTransformFacade(entity, instance, instance.sprite.body as Phaser.Physics.Arcade.Body | undefined);
    const bodyFacade = this.createScriptBodyFacade(entity, instance.sprite.body as Phaser.Physics.Arcade.Body | undefined);
    const components = this.createScriptComponentFacadeMap(entity, instance, transformFacade, bodyFacade);
    const sceneFacade: Record<string, unknown> = {
      id: scene.id,
      name: scene.name,
      notes: scene.notes,
      settings: scene.settings,
      entities: scene.entities.map((sceneEntity) => createEntityFacade(sceneEntity)),
      getEntityById: (id: unknown) => (typeof id === 'string' ? createEntityFacade(scene.entities.find((sceneEntity) => sceneEntity.id === id) ?? entity) : null),
    };

    return {
      entity: entityFacade,
      scene: sceneFacade,
      transform: transformFacade,
      body: bodyFacade,
      components,
      Input,
      Time,
      inputs,
    };
  }

  private createScriptTransformFacade(
    entity: Entity,
    instance?: EntityInstance,
    body?: Phaser.Physics.Arcade.Body,
  ) {
    const transform = getComponent<TransformComponent>(entity, ComponentType.Transform);
    const rigidBody = getComponent<RigidBodyComponent>(entity, ComponentType.RigidBody);
    const sprite = instance?.sprite;
    const setAxis = (axis: 'x' | 'y', value: unknown) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }

      if (transform) {
        transform.position[axis] = numeric;
      }

      if (sprite) {
        if (axis === 'x') {
          sprite.x = numeric;
        } else {
          sprite.y = numeric;
        }
      }

      if (body && sprite) {
        if (!rigidBody || rigidBody.isStatic) {
          body.reset(sprite.x, sprite.y);
          body.setVelocity(0, 0);
        } else {
          body.updateFromGameObject();
        }
      }
    };

    const positionFacade: Record<string, unknown> = {};
    Object.defineProperties(positionFacade, {
      x: {
        get: () => sprite?.x ?? transform?.position.x ?? 0,
        set: (value: unknown) => setAxis('x', value),
        enumerable: true,
      },
      y: {
        get: () => sprite?.y ?? transform?.position.y ?? 0,
        set: (value: unknown) => setAxis('y', value),
        enumerable: true,
      },
    });

    const facade: Record<string, unknown> = {
      position: positionFacade,
      scale: transform?.scale ?? {x: 1, y: 1},
    };
    Object.defineProperties(facade, {
      x: {
        get: () => sprite?.x ?? transform?.position.x ?? 0,
        set: (value: unknown) => setAxis('x', value),
        enumerable: true,
      },
      y: {
        get: () => sprite?.y ?? transform?.position.y ?? 0,
        set: (value: unknown) => setAxis('y', value),
        enumerable: true,
      },
      rotation: {
        get: () => sprite?.angle ?? transform?.rotation ?? 0,
        set: (value: unknown) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) {
            return;
          }
          if (transform) {
            transform.rotation = numeric;
          }
          if (sprite) {
            sprite.setAngle(numeric);
            body?.updateFromGameObject();
          }
        },
        enumerable: true,
      },
    });

    return facade;
  }

  private createScriptBodyFacade(entity: Entity, body?: Phaser.Physics.Arcade.Body) {
    const rigidBody = getComponent<RigidBodyComponent>(entity, ComponentType.RigidBody);
    if (!rigidBody && !body) {
      return null;
    }

    const setVelocity = (nextX: unknown, nextY: unknown) => {
      const x = Number(nextX);
      const y = Number(nextY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      if (rigidBody) {
        rigidBody.velocity.x = x;
        rigidBody.velocity.y = y;
      }
      body?.setVelocity(x, y);
    };
    const velocityFacade: Record<string, unknown> = {};
    Object.defineProperties(velocityFacade, {
      x: {
        get: () => body?.velocity.x ?? rigidBody?.velocity.x ?? 0,
        set: (value: unknown) => {
          const nextX = Number(value);
          if (!Number.isFinite(nextX)) {
            return;
          }
          if (rigidBody) {
            rigidBody.velocity.x = nextX;
          }
          body?.setVelocityX(nextX);
        },
        enumerable: true,
      },
      y: {
        get: () => body?.velocity.y ?? rigidBody?.velocity.y ?? 0,
        set: (value: unknown) => {
          const nextY = Number(value);
          if (!Number.isFinite(nextY)) {
            return;
          }
          if (rigidBody) {
            rigidBody.velocity.y = nextY;
          }
          body?.setVelocityY(nextY);
        },
        enumerable: true,
      },
    });
    const gravityFacade: Record<string, unknown> = {};
    Object.defineProperties(gravityFacade, {
      x: {
        get: () => body?.gravity.x ?? 0,
        set: (value: unknown) => {
          const nextX = Number(value);
          if (Number.isFinite(nextX) && body) {
            body.gravity.x = nextX;
          }
        },
        enumerable: true,
      },
      y: {
        get: () => body?.gravity.y ?? 0,
        set: (value: unknown) => {
          const nextY = Number(value);
          if (Number.isFinite(nextY) && body) {
            body.gravity.y = nextY;
          }
        },
        enumerable: true,
      },
    });
    const facade: Record<string, unknown> = {
      setVelocity,
      setVelocityX: (x: unknown) => {
        const nextX = Number(x);
        if (!Number.isFinite(nextX)) {
          return;
        }
        if (rigidBody) {
          rigidBody.velocity.x = nextX;
        }
        body?.setVelocityX(nextX);
      },
      setVelocityY: (y: unknown) => {
        const nextY = Number(y);
        if (!Number.isFinite(nextY)) {
          return;
        }
        if (rigidBody) {
          rigidBody.velocity.y = nextY;
        }
        body?.setVelocityY(nextY);
      },
    };

    Object.defineProperties(facade, {
      velocity: {
        get: () => velocityFacade,
        set: (value: unknown) => {
          if (!value || typeof value !== 'object') {
            return;
          }
          const source = value as Partial<Vector2>;
          setVelocity(source.x, source.y);
        },
        enumerable: true,
      },
      gravity: {
        get: () => gravityFacade,
        set: (value: unknown) => {
          if (!value || typeof value !== 'object' || !body) {
            return;
          }
          const source = value as Partial<Vector2>;
          if (Number.isFinite(Number(source.x))) {
            body.gravity.x = Number(source.x);
          }
          if (Number.isFinite(Number(source.y))) {
            body.gravity.y = Number(source.y);
          }
        },
        enumerable: true,
      },
      isStatic: {
        get: () => rigidBody?.isStatic ?? false,
        set: (value: unknown) => {
          const next = Boolean(value);
          if (rigidBody) {
            rigidBody.isStatic = next;
          }
          if (body) {
            body.setImmovable(next);
            body.setAllowGravity(!next);
            if (next) {
              body.setVelocity(0, 0);
            }
          }
        },
        enumerable: true,
      },
      type: {
        get: () => (rigidBody?.isStatic ? 'static' : 'dynamic'),
        set: (value: unknown) => {
          if (value === 'static' || value === 'kinematic') {
            if (rigidBody) {
              rigidBody.isStatic = true;
            }
            if (body) {
              body.setImmovable(true);
              body.setAllowGravity(false);
              body.setVelocity(0, 0);
            }
          } else if (value === 'dynamic') {
            if (rigidBody) {
              rigidBody.isStatic = false;
            }
            if (body) {
              body.setImmovable(false);
              body.setAllowGravity(true);
            }
          }
        },
        enumerable: true,
      },
    });

    return facade;
  }

  private createScriptComponentFacadeMap(
    entity: Entity,
    instance: EntityInstance | undefined,
    transformFacade: Record<string, unknown>,
    bodyFacade: Record<string, unknown> | null,
  ) {
    const sprite = getComponent<SpriteComponent>(entity, ComponentType.Sprite);
    const collider = getComponent<ColliderComponent>(entity, ComponentType.Collider);
    const behavior = getComponent<BehaviorComponent>(entity, ComponentType.Behavior);
    const script = getComponent<ScriptComponent>(entity, ComponentType.Script);

    return {
      Transform: transformFacade,
      transform: transformFacade,
      Sprite: instance?.sprite ?? sprite ?? null,
      sprite: instance?.sprite ?? sprite ?? null,
      RigidBody: bodyFacade,
      rigidBody: bodyFacade,
      body: bodyFacade,
      Collider: collider ?? null,
      collider: collider ?? null,
      Behavior: behavior ?? null,
      behavior: behavior ?? null,
      Script: script ?? null,
      script: script ?? null,
    } satisfies Record<string, unknown>;
  }

  private compileScript(source: string): ScriptExecutor {
    const trimmed = source.trim();
    const normalizedHookSource = trimmed.replace(/\bexport\s+(?=function\b)/g, '');

    if (/export\s+default\s+class\b/.test(trimmed)) {
      const instantiate = new Function(trimmed.replace(/export\s+default\s+class\b/, 'return class')) as () => new () => Record<string, unknown>;
      return {
        mode: 'class',
        instantiate: () => {
          const ScriptClass = instantiate();
          return new ScriptClass() as Record<string, unknown>;
        },
      };
    }

    if (/\bfunction\s+(?:init|update|onCollect)\s*\(/.test(normalizedHookSource)) {
      return {
        mode: 'hooks',
        createHooks: new Function(
          'entity',
          'sprite',
          'body',
          'scene',
          'inputs',
          'runtime',
          'Input',
          'Time',
          'transform',
          'components',
          `${normalizedHookSource}
return {
  init: typeof init === 'function' ? init : undefined,
  update: typeof update === 'function' ? update : undefined,
  onCollect: typeof onCollect === 'function' ? onCollect : undefined,
};`,
        ) as ScriptHooksFactory,
      };
    }

    return {
      mode: 'inline',
      run: new Function(
        'entity',
        'sprite',
        'body',
        'scene',
        'inputs',
        'deltaSeconds',
        'runtime',
        'Input',
        'Time',
        'transform',
        'components',
        trimmed,
      ) as ScriptInlineRunner,
    };
  }

  private getScriptHookParameterNames(hook: (...args: unknown[]) => unknown) {
    const match = hook.toString().match(/^[^(]*\(([^)]*)\)/);
    if (!match) {
      return [];
    }

    return match[1]
      .split(',')
      .map((parameter) => parameter.trim().replace(/^\.\.\./, '').split('=')[0]?.trim() ?? '')
      .filter(Boolean);
  }

  private resolveSingleScriptHookArgument(
    parameterName: string,
    bindings: ScriptBindings,
    deltaSeconds: number,
    phase: 'init' | 'update',
  ) {
    const normalizedName = parameterName.trim().toLowerCase();

    if (phase === 'update' && /^(dt|delta|deltatime|deltaseconds|time|seconds|elapsed)$/.test(normalizedName)) {
      return deltaSeconds;
    }
    if (/^(scene|world|level)$/.test(normalizedName)) {
      return bindings.scene;
    }
    if (/^(input|inputs|controls)$/.test(normalizedName)) {
      return bindings.Input;
    }
    if (/^(runtime|snapshot)$/.test(normalizedName)) {
      return this.runtimeSnapshot;
    }
    if (/^(time|clock)$/.test(normalizedName)) {
      return bindings.Time;
    }
    if (/^(body|rigidbody|physics)$/.test(normalizedName)) {
      return bindings.body;
    }
    if (/^(transform|position)$/.test(normalizedName)) {
      return bindings.transform;
    }
    if (/^(components|componentmap)$/.test(normalizedName)) {
      return bindings.components;
    }
    return bindings.entity;
  }

  private buildScriptHookArguments(
    phase: 'init' | 'update',
    hook: (...args: unknown[]) => unknown,
    bindings: ScriptBindings,
    deltaSeconds: number,
  ) {
    const parameters = this.getScriptHookParameterNames(hook);
    if (parameters.length === 0) {
      return [];
    }
    if (parameters.length === 1) {
      return [this.resolveSingleScriptHookArgument(parameters[0], bindings, deltaSeconds, phase)];
    }
    if (phase === 'init') {
      return [
        bindings.entity,
        bindings.scene,
        bindings.inputs,
        this.runtimeSnapshot,
        bindings.Input,
        bindings.Time,
        bindings.components,
        bindings.body,
        bindings.transform,
      ];
    }
    return [
      bindings.entity,
      deltaSeconds,
      bindings.scene,
      bindings.inputs,
      this.runtimeSnapshot,
      bindings.Input,
      bindings.Time,
      bindings.components,
      bindings.body,
      bindings.transform,
    ];
  }

  private callScriptHook(
    phase: 'init' | 'update',
    hook: ((...args: unknown[]) => unknown) | undefined,
    context: Record<string, unknown>,
    bindings: ScriptBindings,
    deltaSeconds: number,
    shouldRun: boolean,
  ) {
    if (!shouldRun || typeof hook !== 'function') {
      return;
    }

    hook.call(context, ...this.buildScriptHookArguments(phase, hook, bindings, deltaSeconds));
  }

  private reportScriptError(entity: Entity, instance: EntityInstance, error: unknown) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (instance.scriptRuntime?.lastError === message) {
      return;
    }
    if (instance.scriptRuntime) {
      instance.scriptRuntime.lastError = message;
    }
    console.error(`Script error in entity ${entity.name}`, error);
  }

  private runEntityScript(entity: Entity, scene: Scene, instance: EntityInstance, deltaSeconds: number) {
    const script = getComponent<ScriptComponent>(entity, ComponentType.Script);

    if (!script?.enabled || !script.code.trim()) {
      return;
    }

    try {
      const runtime = instance.scriptRuntime;
      if (!runtime) {
        return;
      }

      if (runtime.executor === undefined) {
        try {
          runtime.executor = this.compileScript(runtime.source);
        } catch (error) {
          runtime.executor = null;
          throw error;
        }
      }

      if (!runtime.executor) {
        return;
      }

      const bindings = this.buildScriptBindings(entity, scene, instance, deltaSeconds);
      runtime.context.entity = bindings.entity;
      runtime.context.scene = bindings.scene;
      runtime.context.sprite = instance.sprite;
      runtime.context.body = bindings.body;
      runtime.context.transform = bindings.transform;
      runtime.context.components = bindings.components;
      runtime.context.Input = bindings.Input;
      runtime.context.Time = bindings.Time;
      runtime.context.world = bindings.scene;
      runtime.context.runtime = this.runtimeSnapshot;

      switch (runtime.executor.mode) {
        case 'class': {
          if (!runtime.classInstance) {
            runtime.classInstance = runtime.executor.instantiate();
          }

          runtime.classInstance.entity = bindings.entity;
          runtime.classInstance.scene = bindings.scene;
          runtime.classInstance.sprite = instance.sprite;
          runtime.classInstance.body = bindings.body;
          runtime.classInstance.transform = bindings.transform;
          runtime.classInstance.Input = bindings.Input;
          runtime.classInstance.Time = bindings.Time;
          runtime.classInstance.world = bindings.scene;
          runtime.classInstance.runtime = this.runtimeSnapshot;

          if (!runtime.initialized && typeof runtime.classInstance.init === 'function') {
            (runtime.classInstance.init as (entityFacade: unknown, sceneFacade: unknown) => void)(bindings.entity, bindings.scene);
          }

          runtime.initialized = true;
          if (typeof runtime.classInstance.update === 'function') {
            (runtime.classInstance.update as (delta: number) => void)(deltaSeconds);
          }
          break;
        }
        case 'hooks': {
          if (!runtime.hooks) {
            runtime.hooks = runtime.executor.createHooks(
              bindings.entity,
              instance.sprite,
              bindings.body,
              bindings.scene,
              bindings.inputs,
              this.runtimeSnapshot,
              bindings.Input,
              bindings.Time,
              bindings.transform,
              bindings.components,
            );
          }

          this.callScriptHook('init', runtime.hooks.init, runtime.context, bindings, deltaSeconds, !runtime.initialized);

          runtime.initialized = true;
          this.callScriptHook('update', runtime.hooks.update, runtime.context, bindings, deltaSeconds, true);
          break;
        }
        case 'inline':
          runtime.executor.run.call(
            runtime.context,
            bindings.entity,
            instance.sprite,
            bindings.body,
            bindings.scene,
            bindings.inputs,
            deltaSeconds,
            this.runtimeSnapshot,
            bindings.Input,
            bindings.Time,
            bindings.transform,
            bindings.components,
          );
          runtime.initialized = true;
          break;
        default:
          break;
      }
    } catch (error) {
      this.reportScriptError(entity, instance, error);
    }
  }

  private handleTriggers(scene: Scene, playerSprite?: Phaser.GameObjects.Sprite) {
    if (!playerSprite) {
      return;
    }

    const playerBounds = playerSprite.getBounds();

    for (const entity of scene.entities) {
      if (entity.id === this.playerEntityId) {
        continue;
      }

      const collider = getComponent<ColliderComponent>(entity, ComponentType.Collider);
      const behavior = getComponent<BehaviorComponent>(entity, ComponentType.Behavior);
      const instance = this.entityMap.get(entity.id);

      if (!collider?.isTrigger || !behavior?.enabled || !instance || !instance.sprite.visible) {
        continue;
      }

      if (!Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, instance.sprite.getBounds())) {
        continue;
      }

      switch (behavior.kind) {
        case 'collectible':
          if (!instance.triggerConsumed) {
            instance.triggerConsumed = true;
            instance.sprite.setVisible(false);
            const body = instance.sprite.body as Phaser.Physics.Arcade.Body | undefined;
            body?.setEnable(false);
            this.score += behavior.collectibleValue;
            this.collectiblesRemaining = Math.max(0, this.collectiblesRemaining - 1);
          }
          break;
        case 'goal':
          if (this.collectiblesRemaining === 0) {
            this.hasWon = true;
            this.isPlaying = false;
            this.physics.pause();
          }
          break;
        case 'hazard': {
          const body = playerSprite.body as Phaser.Physics.Arcade.Body | undefined;
          if (body) {
            this.handlePlayerRespawn(body);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private handlePlayerRespawn(body: Phaser.Physics.Arcade.Body) {
    const player = this.getPlayerInstance();

    if (!player) {
      return;
    }

    this.deaths += 1;
    body.reset(this.spawnPoint.x, this.spawnPoint.y);
  }

  private getPlayerInstance() {
    return this.playerEntityId ? this.entityMap.get(this.playerEntityId) : undefined;
  }

  private refreshRuntimeSnapshot(force = false) {
    if (!this.project || !this.cameras?.main) {
      return;
    }

    if (!force && !this.isPlaying) {
      return;
    }

    const scene = getActiveScene(this.project);
    const player = this.getPlayerInstance();
    const playerBody = player?.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    const previewFrame = this.getPreviewCameraFrame(scene);
    const activeCameraFrame = this.isPlaying
      ? {
          x: this.cameras.main.scrollX,
          y: this.cameras.main.scrollY,
          zoom: this.cameras.main.zoom,
          width: this.cameras.main.width / this.cameras.main.zoom,
          height: this.cameras.main.height / this.cameras.main.zoom,
        }
      : {
          ...previewFrame,
          zoom: 1,
        };

    this.runtimeSnapshot = {
      mode: this.hasWon ? 'win' : this.isPlaying ? 'play' : 'editor',
      score: this.score,
      collectiblesRemaining: this.collectiblesRemaining,
      deaths: this.deaths,
      player: player
        ? {
            x: round(player.sprite.x),
            y: round(player.sprite.y),
            vx: round(playerBody?.velocity.x ?? 0),
            vy: round(playerBody?.velocity.y ?? 0),
          }
        : undefined,
      camera: {
        x: round(activeCameraFrame.x),
        y: round(activeCameraFrame.y),
        zoom: round(activeCameraFrame.zoom),
        width: round(activeCameraFrame.width),
        height: round(activeCameraFrame.height),
      },
      scene: {
        id: scene.id,
        name: scene.name,
        worldWidth: scene.settings.worldSize.x,
        worldHeight: scene.settings.worldSize.y,
      },
      selectedEntityId: this.selectedEntityId,
      entities: scene.entities
        .map((entity) => {
          const instance = this.entityMap.get(entity.id);
          const sprite = getComponent<SpriteComponent>(entity, ComponentType.Sprite);
          const behavior = getComponent<BehaviorComponent>(entity, ComponentType.Behavior);

          if (!instance || !sprite) {
            return null;
          }

          return {
            id: entity.id,
            name: entity.name,
            prefab: entity.prefab,
            hidden: !instance.sprite.visible,
            x: round(instance.sprite.x),
            y: round(instance.sprite.y),
            width: round(sprite.width),
            height: round(sprite.height),
            behavior: behavior?.kind ?? 'none',
          };
        })
        .filter(Boolean) as RuntimeSnapshot['entities'],
    };
  }

  private resetRuntime() {
    this.score = 0;
    this.deaths = 0;
    this.collectiblesRemaining = 0;
    this.hasWon = false;
  }

  private loadAssets(project: Project) {
    for (const asset of project.assets) {
      if (asset.type !== 'image' || !asset.url || this.textures.exists(asset.id)) {
        continue;
      }

      const image = new Image();
      image.onload = () => {
        if (!this.textures.exists(asset.id)) {
          this.textures.addImage(asset.id, image);
        }
        if (this.project) {
          this.syncProject(this.project);
        }
      };
      image.src = asset.url;
    }
  }

  private drawSceneBackground() {
    if (!this.project || !this.backgroundGraphics || !this.cameras?.main) {
      return;
    }

    const scene = getActiveScene(this.project);
    const suppressWorldBoundsBorder = !this.isPlaying && this.editorViewportMode === 'camera';
    const width = scene.settings.worldSize.x;
    const height = scene.settings.worldSize.y;
    const innerMaxX = Math.max(0, width - 1);
    const innerMaxY = Math.max(0, height - 1);
    const borderInset = 1;
    const borderWidth = Math.max(0, width - borderInset * 2);
    const borderHeight = Math.max(0, height - borderInset * 2);

    this.backgroundGraphics.clear();
    this.backgroundGraphics.fillGradientStyle(
      parseHexColor(scene.settings.backgroundTop),
      parseHexColor(scene.settings.backgroundTop),
      parseHexColor(scene.settings.backgroundBottom),
      parseHexColor(scene.settings.backgroundBottom),
      1,
    );
    this.backgroundGraphics.fillRect(0, 0, width, height);

    if (this.isPlaying) {
      return;
    }

    if (!scene.settings.showGrid) {
      if (!suppressWorldBoundsBorder) {
        this.backgroundGraphics.lineStyle(2, 0x686d76, 0.55);
        this.backgroundGraphics.strokeRect(borderInset, borderInset, borderWidth, borderHeight);
      }
      return;
    }

    const baseColor = parseHexColor(scene.settings.ambientColor);
    const minorColor = tintColor(baseColor, 0.82);
    const majorColor = tintColor(baseColor, 1.12);
    const majorStep = scene.settings.gridSize * 4;

    this.backgroundGraphics.lineStyle(1, minorColor, 0.16);
    for (let x = 0; x <= scene.settings.worldSize.x; x += scene.settings.gridSize) {
      this.backgroundGraphics.moveTo(x, 0);
      this.backgroundGraphics.lineTo(x, innerMaxY);
    }
    for (let y = 0; y <= scene.settings.worldSize.y; y += scene.settings.gridSize) {
      this.backgroundGraphics.moveTo(0, y);
      this.backgroundGraphics.lineTo(innerMaxX, y);
    }
    this.backgroundGraphics.strokePath();

    this.backgroundGraphics.lineStyle(1, majorColor, 0.28);
    for (let x = 0; x <= scene.settings.worldSize.x; x += majorStep) {
      this.backgroundGraphics.moveTo(x, 0);
      this.backgroundGraphics.lineTo(x, innerMaxY);
    }
    for (let y = 0; y <= scene.settings.worldSize.y; y += majorStep) {
      this.backgroundGraphics.moveTo(0, y);
      this.backgroundGraphics.lineTo(innerMaxX, y);
    }
    this.backgroundGraphics.strokePath();

    if (!suppressWorldBoundsBorder) {
      this.backgroundGraphics.lineStyle(2, majorColor, 0.75);
      this.backgroundGraphics.strokeRect(borderInset, borderInset, borderWidth, borderHeight);
    }
  }

  private drawOverlay() {
    if (!this.overlayGraphics) {
      return;
    }

    this.overlayGraphics.clear();

    if (!this.project) {
      return;
    }

    const scene = getActiveScene(this.project);
    const previewFrame = this.getPreviewCameraFrame(scene);

    if (!this.isPlaying && this.editorViewportMode === 'world') {
      this.overlayGraphics.lineStyle(2, 0xc8a27a, 0.7);
      this.overlayGraphics.strokeRect(previewFrame.x, previewFrame.y, previewFrame.width, previewFrame.height);
    }

    if (!this.isPlaying && this.editorViewportMode === 'camera') {
      const frameInset = 1;
      this.overlayGraphics.lineStyle(2, 0xc8a27a, 0.7);
      this.overlayGraphics.strokeRect(
        previewFrame.x + frameInset,
        previewFrame.y + frameInset,
        Math.max(0, previewFrame.width - frameInset * 2),
        Math.max(0, previewFrame.height - frameInset * 2),
      );
    }

    if (!this.isPlaying) {
      for (const entity of scene.entities) {
        const collider = getComponent<ColliderComponent>(entity, ComponentType.Collider);
        const instance = this.entityMap.get(entity.id);
        const body = instance?.sprite.body as Phaser.Physics.Arcade.Body | undefined;

        if (!collider || !instance || !body || !instance.sprite.visible) {
          continue;
        }

        const colliderMetrics = this.resolveColliderMetrics(collider, instance.sprite);
        this.overlayGraphics.lineStyle(2, colliderMetrics.isTrigger ? 0xb7a57d : 0x7f8994, 0.85);
        if (colliderMetrics.shape === 'circle') {
          this.overlayGraphics.strokeCircle(
            instance.sprite.x + colliderMetrics.offsetX,
            instance.sprite.y + colliderMetrics.offsetY,
            colliderMetrics.radius,
          );
        } else {
          this.overlayGraphics.strokeRect(
            instance.sprite.x - colliderMetrics.width / 2 + colliderMetrics.offsetX,
            instance.sprite.y - colliderMetrics.height / 2 + colliderMetrics.offsetY,
            colliderMetrics.width,
            colliderMetrics.height,
          );
        }
      }
    }

  }

  private getPreviewCameraFrame(scene: Scene) {
    const cameraWidth = Math.max(1, scene.settings.cameraSize.x);
    const cameraHeight = Math.max(1, scene.settings.cameraSize.y);
    const width = Math.min(cameraWidth, scene.settings.worldSize.x);
    const height = Math.min(cameraHeight, scene.settings.worldSize.y);
    const maxScrollX = Math.max(0, scene.settings.worldSize.x - width);
    const maxScrollY = Math.max(0, scene.settings.worldSize.y - height);

    return {
      x: clamp(scene.settings.cameraStart.x, 0, maxScrollX),
      y: clamp(scene.settings.cameraStart.y, 0, maxScrollY),
      width,
      height,
    };
  }

  private getEditorZoom(scene: Scene) {
    const baseZoom = this.editorViewportMode === 'world' ? this.getWorldBaseZoom(scene) : this.getCameraBaseZoom(scene);

    return clamp(baseZoom * this.editorZoomFactor, 0.08, 6);
  }

  private getCameraViewport(scene: Scene) {
    const fullWidth = Math.max(1, this.scale.width);
    const fullHeight = Math.max(1, this.scale.height);

    if (this.editorViewportMode === 'world') {
      return {
        x: 0,
        y: 0,
        width: fullWidth,
        height: fullHeight,
      };
    }

    const previewFrame = this.getPreviewCameraFrame(scene);
    const scale = Math.min(
      fullWidth / Math.max(1, previewFrame.width),
      fullHeight / Math.max(1, previewFrame.height),
    );
    const width = Math.max(1, Math.round(previewFrame.width * scale));
    const height = Math.max(1, Math.round(previewFrame.height * scale));

    return {
      x: Math.round((fullWidth - width) / 2),
      y: Math.round((fullHeight - height) / 2),
      width,
      height,
    };
  }

  private getMinZoomFactor(scene: Scene) {
    const baseZoom = this.editorViewportMode === 'world' ? this.getWorldBaseZoom(scene) : this.getCameraBaseZoom(scene);
    const minimumZoom = this.editorViewportMode === 'world' ? this.getWorldFitZoom(scene) : baseZoom;
    const minimumFactor = minimumZoom / Math.max(baseZoom, 0.0001);

    return Math.max(0.08 / Math.max(baseZoom, 0.0001), minimumFactor);
  }

  private getCameraBaseZoom(scene: Scene) {
    if (!this.cameras?.main) {
      return 1;
    }

    const previewFrame = this.getPreviewCameraFrame(scene);
    return Math.min(
      this.cameras.main.width / Math.max(1, previewFrame.width),
      this.cameras.main.height / Math.max(1, previewFrame.height),
    );
  }

  private getWorldBaseZoom(scene: Scene) {
    const fillZoom = this.getWorldFillZoom(scene);
    if (!Number.isFinite(fillZoom) || fillZoom <= 0) {
      return 1;
    }

    if (!Number.isFinite(this.worldFillReferenceZoom ?? Number.NaN)) {
      this.worldFillReferenceZoom = fillZoom;
      return fillZoom;
    }
    // Keep world-view baseline stable while scene dimensions are being edited.
    // This prevents transient tiny values during typing from locking zoom behavior.
    return this.worldFillReferenceZoom;
  }

  private clampCameraToScene(scene: Scene) {
    if (!this.cameras?.main) {
      return;
    }

    const visibleWidth = this.cameras.main.width / this.cameras.main.zoom;
    const visibleHeight = this.cameras.main.height / this.cameras.main.zoom;
    const previewFrame = this.getPreviewCameraFrame(scene);
    const lockToCameraFrame = !this.isPlaying && this.editorViewportMode === 'camera';

    if (lockToCameraFrame) {
      const maxScrollX = previewFrame.x + Math.max(0, previewFrame.width - visibleWidth);
      const maxScrollY = previewFrame.y + Math.max(0, previewFrame.height - visibleHeight);
      this.cameras.main.setScroll(
        clamp(this.cameras.main.scrollX, previewFrame.x, maxScrollX),
        clamp(this.cameras.main.scrollY, previewFrame.y, maxScrollY),
      );
      return;
    }

    const maxScrollX = scene.settings.worldSize.x - visibleWidth;
    const maxScrollY = scene.settings.worldSize.y - visibleHeight;
    const allowFreePan = !this.isPlaying || this.manualCameraControlActive;
    const baseEditorPanPadding = scene.settings.gridSize * 3;
    const overflowX = Math.max(0, visibleWidth - scene.settings.worldSize.x);
    const overflowY = Math.max(0, visibleHeight - scene.settings.worldSize.y);
    const visualOutsidePaddingX = visibleWidth * 0.24;
    const visualOutsidePaddingY = visibleHeight * 0.24;
    const editorPanPaddingX = allowFreePan
      ? Math.max(baseEditorPanPadding, overflowX / 2 + scene.settings.gridSize * 2, visualOutsidePaddingX)
      : 0;
    const editorPanPaddingY = allowFreePan
      ? Math.max(baseEditorPanPadding, overflowY / 2 + scene.settings.gridSize * 2, visualOutsidePaddingY)
      : 0;
    const minScrollX = allowFreePan ? -editorPanPaddingX : maxScrollX >= 0 ? 0 : maxScrollX / 2;
    const minScrollY = allowFreePan ? -editorPanPaddingY : maxScrollY >= 0 ? 0 : maxScrollY / 2;
    const maxAllowedScrollX = allowFreePan ? maxScrollX + editorPanPaddingX : maxScrollX >= 0 ? maxScrollX : maxScrollX / 2;
    const maxAllowedScrollY = allowFreePan ? maxScrollY + editorPanPaddingY : maxScrollY >= 0 ? maxScrollY : maxScrollY / 2;
    const nextScrollX = clamp(this.cameras.main.scrollX, minScrollX, maxAllowedScrollX);
    const nextScrollY = clamp(this.cameras.main.scrollY, minScrollY, maxAllowedScrollY);

    this.cameras.main.setScroll(nextScrollX, nextScrollY);
  }

  private getWorldFitZoom(scene: Scene) {
    const worldWidth = Math.max(1, scene.settings.worldSize.x);
    const worldHeight = Math.max(1, scene.settings.worldSize.y);
    return Math.min(
      this.cameras.main.width / worldWidth,
      this.cameras.main.height / worldHeight,
    );
  }

  private getWorldFillZoom(scene: Scene) {
    const worldWidth = Math.max(1, scene.settings.worldSize.x);
    const worldHeight = Math.max(1, scene.settings.worldSize.y);
    return Math.max(
      this.cameras.main.width / worldWidth,
      this.cameras.main.height / worldHeight,
    );
  }

  private resolveColliderMetrics(collider: ColliderComponent, sprite: Phaser.GameObjects.Sprite) {
    const baseWidth = Math.max(8, Math.abs(sprite.displayWidth));
    const baseHeight = Math.max(8, Math.abs(sprite.displayHeight));
    const radians = (sprite.angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const width = collider.autoSize ? Math.max(8, baseWidth * cos + baseHeight * sin) : collider.width;
    const height = collider.autoSize ? Math.max(8, baseWidth * sin + baseHeight * cos) : collider.height;
    const radius = collider.autoSize ? Math.max(4, Math.min(width, height) / 2) : collider.radius;

    return {
      shape: collider.shape,
      width,
      height,
      radius,
      offsetX: collider.offsetX,
      offsetY: collider.offsetY,
      isTrigger: collider.isTrigger,
      isPassThrough: collider.isPassThrough,
    };
  }

  private resolveBodyColliderMetrics(collider: ColliderComponent, sprite: Phaser.GameObjects.Sprite) {
    const colliderMetrics = this.resolveColliderMetrics(collider, sprite);
    const scaleX = Math.max(0.0001, Math.abs(sprite.scaleX) || 1);
    const scaleY = Math.max(0.0001, Math.abs(sprite.scaleY) || 1);
    const minScale = Math.max(0.0001, Math.min(scaleX, scaleY));

    return {
      shape: colliderMetrics.shape,
      width: colliderMetrics.width / scaleX,
      height: colliderMetrics.height / scaleY,
      radius: colliderMetrics.radius / minScale,
      offsetX: colliderMetrics.offsetX / scaleX,
      offsetY: colliderMetrics.offsetY / scaleY,
      isTrigger: colliderMetrics.isTrigger,
      isPassThrough: colliderMetrics.isPassThrough,
    };
  }

  private resolveTextureKey(sprite: SpriteComponent) {
    if (sprite.assetId && this.textures.exists(sprite.assetId)) {
      return sprite.assetId;
    }

    return `nexus-${sprite.shape}`;
  }

  private generateShapeTextures() {
    if (!this.textures.exists('nexus-rectangle')) {
      const graphic = this.make.graphics({x: 0, y: 0}, false);
      graphic.fillStyle(0xffffff, 1);
      graphic.fillRect(0, 0, 128, 128);
      graphic.generateTexture('nexus-rectangle', 128, 128);
      graphic.clear();
      graphic.fillStyle(0xffffff, 1);
      graphic.fillEllipse(64, 64, 128, 128);
      graphic.generateTexture('nexus-ellipse', 128, 128);
      graphic.clear();
      graphic.fillStyle(0xffffff, 1);
      graphic.beginPath();
      graphic.moveTo(64, 0);
      graphic.lineTo(128, 64);
      graphic.lineTo(64, 128);
      graphic.lineTo(0, 64);
      graphic.closePath();
      graphic.fillPath();
      graphic.generateTexture('nexus-diamond', 128, 128);
      graphic.destroy();
    }
  }

  private isOperational() {
    return Boolean(
      this.ready &&
        !this.destroyed &&
        this.sys?.isActive() &&
        this.cameras?.main &&
        this.physics?.world &&
        this.scale &&
        this.input &&
        this.input.keyboard,
    );
  }
}

function parseHexColor(color: string) {
  return Number.parseInt(color.replace('#', '0x'), 16);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tintColor(color: number, factor: number) {
  const r = clamp(Math.round(((color >> 16) & 0xff) * factor), 0, 255);
  const g = clamp(Math.round(((color >> 8) & 0xff) * factor), 0, 255);
  const b = clamp(Math.round((color & 0xff) * factor), 0, 255);
  return (r << 16) + (g << 8) + b;
}

function detectRenderType() {
  try {
    const probe = document.createElement('canvas');
    const webgl =
      probe.getContext('webgl2') ||
      probe.getContext('webgl') ||
      probe.getContext('experimental-webgl');

    return webgl ? Phaser.WEBGL : Phaser.CANVAS;
  } catch {
    return Phaser.CANVAS;
  }
}
