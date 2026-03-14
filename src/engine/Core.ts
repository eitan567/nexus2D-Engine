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
  private editorZoomFactor = 1;
  private editorCameraCenter: Vector2 | null = null;
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

  panEditor(screenDeltaX: number, screenDeltaY: number) {
    if (!this.project || !this.cameras?.main || this.isPlaying) {
      return;
    }

    const scene = getActiveScene(this.project);
    this.cameras.main.setScroll(
      this.cameras.main.scrollX - screenDeltaX / this.cameras.main.zoom,
      this.cameras.main.scrollY - screenDeltaY / this.cameras.main.zoom,
    );
    this.clampCameraToScene(scene);

    const visibleWidth = this.scale.width / this.cameras.main.zoom;
    const visibleHeight = this.scale.height / this.cameras.main.zoom;
    this.editorCameraCenter = {
      x: this.cameras.main.scrollX + visibleWidth / 2,
      y: this.cameras.main.scrollY + visibleHeight / 2,
    };

    this.drawOverlay();
    this.refreshRuntimeSnapshot(true);
  }

  adjustEditorZoom(deltaY: number, screenX: number, screenY: number) {
    if (!this.project || !this.cameras?.main || this.isPlaying) {
      return;
    }

    const scene = getActiveScene(this.project);
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

    const visibleWidth = this.scale.width / this.cameras.main.zoom;
    const visibleHeight = this.scale.height / this.cameras.main.zoom;
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
      width: this.scale.width / this.cameras.main.zoom,
      height: this.scale.height / this.cameras.main.zoom,
      zoom: this.cameras.main.zoom,
    };
  }

  setRunning(value: boolean) {
    this.isPlaying = value;

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

    const previewFrame = this.getPreviewCameraFrame(scene);
    const player = this.getPlayerInstance();

    if (scene.settings.cameraFollowPlayer && player && this.isPlaying) {
      this.cameras.main.stopFollow();
      this.cameras.main.setZoom(1);
      this.cameras.main.setScroll(previewFrame.x, previewFrame.y);
      this.cameras.main.setDeadzone(this.scale.width * 0.52, this.scale.height * 0.58);
      this.clampCameraToScene(scene);
      this.cameras.main.startFollow(player.sprite, true, 0.12, 0.12);
    } else {
      this.cameras.main.stopFollow();
      this.cameras.main.setDeadzone();

      const zoom = this.getEditorZoom(scene);
      this.cameras.main.setZoom(zoom);
      const visibleWidth = this.scale.width / zoom;
      const visibleHeight = this.scale.height / zoom;
      const defaultCenter = {
        x: previewFrame.x + visibleWidth / 2,
        y: previewFrame.y + visibleHeight / 2,
      };
      const center = this.editorCameraCenter ?? defaultCenter;
      this.cameras.main.setScroll(center.x - visibleWidth / 2, center.y - visibleHeight / 2);
      this.clampCameraToScene(scene);
    }
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
      };
      this.entityMap.set(entity.id, instance);
    }

    const sprite = instance.sprite;
    instance.authoredPosition = {...transform.position};
    instance.patrolOrigin = {...transform.position};
    instance.triggerConsumed = false;

    sprite.setVisible(true);
    sprite.setTexture(textureKey);
    sprite.setPosition(transform.position.x, transform.position.y);
    sprite.setAngle(transform.rotation);
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

    if (!sprite.body) {
      this.physics.add.existing(sprite);
    }

    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setEnable(Boolean(rigidBody || collider));
    body.setCollideWorldBounds(true);
    body.moves = true;

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
        body.setVelocity(rigidBody.velocity.x, rigidBody.velocity.y);
      }
    } else {
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setVelocity(0, 0);
      body.gravity.set(0, 0);
    }

    if (collider) {
      if (collider.shape === 'circle') {
        body.setCircle(collider.radius);
        body.setOffset(
          sprite.displayWidth / 2 - collider.radius + collider.offsetX,
          sprite.displayHeight / 2 - collider.radius + collider.offsetY,
        );
      } else {
        body.setSize(collider.width, collider.height);
        body.setOffset(
          sprite.displayWidth / 2 - collider.width / 2 + collider.offsetX,
          sprite.displayHeight / 2 - collider.height / 2 + collider.offsetY,
        );
      }

      body.checkCollision.none = collider.isTrigger;
      body.checkCollision.up = !collider.isTrigger;
      body.checkCollision.down = !collider.isTrigger && !collider.isPassThrough;
      body.checkCollision.left = !collider.isTrigger;
      body.checkCollision.right = !collider.isTrigger;

      if (!collider.isTrigger) {
        this.solidGroup.add(sprite);
      }
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

      this.runEntityScript(entity, instance, deltaSeconds);
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

  private runEntityScript(entity: Entity, instance: EntityInstance, deltaSeconds: number) {
    const script = getComponent<ScriptComponent>(entity, ComponentType.Script);

    if (!script?.enabled || !script.code.trim()) {
      return;
    }

    try {
      const body = instance.sprite.body as Phaser.Physics.Arcade.Body | undefined;

      new Function(
        'entity',
        'sprite',
        'body',
        'scene',
        'inputs',
        'deltaSeconds',
        'runtime',
        script.code,
      )(
        entity,
        instance.sprite,
        body,
        this,
        this.virtualInputs,
        deltaSeconds,
        this.runtimeSnapshot,
      );
    } catch (error) {
      console.error(`Script error in entity ${entity.name}`, error);
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
    player.sprite.setPosition(this.spawnPoint.x, this.spawnPoint.y);
    body.setVelocity(0, 0);
    body.updateFromGameObject();
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
          width: this.scale.width / this.cameras.main.zoom,
          height: this.scale.height / this.cameras.main.zoom,
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

    if (!scene.settings.showGrid) {
      this.backgroundGraphics.lineStyle(2, 0x686d76, 0.55);
      this.backgroundGraphics.strokeRect(borderInset, borderInset, borderWidth, borderHeight);
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

    this.backgroundGraphics.lineStyle(2, majorColor, 0.75);
    this.backgroundGraphics.strokeRect(borderInset, borderInset, borderWidth, borderHeight);
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

    if (!this.isPlaying) {
      for (const entity of scene.entities) {
        const collider = getComponent<ColliderComponent>(entity, ComponentType.Collider);
        const instance = this.entityMap.get(entity.id);
        const body = instance?.sprite.body as Phaser.Physics.Arcade.Body | undefined;

        if (!collider || !instance || !body || !instance.sprite.visible) {
          continue;
        }

        this.overlayGraphics.lineStyle(2, collider.isTrigger ? 0xb7a57d : 0x7f8994, 0.85);
        if (collider.shape === 'circle') {
          this.overlayGraphics.strokeCircle(
            instance.sprite.x + collider.offsetX,
            instance.sprite.y + collider.offsetY,
            collider.radius,
          );
        } else {
          this.overlayGraphics.strokeRect(
            instance.sprite.x - collider.width / 2 + collider.offsetX,
            instance.sprite.y - collider.height / 2 + collider.offsetY,
            collider.width,
            collider.height,
          );
        }
      }
    }

    if (this.selectedEntityId && !this.isPlaying) {
      const instance = this.entityMap.get(this.selectedEntityId);

      if (instance && instance.sprite.visible) {
        const bounds = instance.sprite.getBounds();
        this.overlayGraphics.lineStyle(2, 0xe1e4e8, 0.68);
        this.overlayGraphics.strokeRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);

        if (this.transformMode === 'move') {
          this.overlayGraphics.lineStyle(3, 0xc58a57, 1);
          this.overlayGraphics.lineBetween(instance.sprite.x, instance.sprite.y, instance.sprite.x + 72, instance.sprite.y);
          this.overlayGraphics.lineStyle(3, 0xbfc6cf, 1);
          this.overlayGraphics.lineBetween(instance.sprite.x, instance.sprite.y, instance.sprite.x, instance.sprite.y - 72);
        } else if (this.transformMode === 'rotate') {
          this.overlayGraphics.lineStyle(2, 0xc58a57, 1);
          this.overlayGraphics.strokeCircle(instance.sprite.x, instance.sprite.y, Math.max(bounds.width, bounds.height) * 0.7);
        } else {
          this.overlayGraphics.fillStyle(0xbfc6cf, 1);
          const handle = 10;
          this.overlayGraphics.fillRect(bounds.right - handle / 2, bounds.bottom - handle / 2, handle, handle);
          this.overlayGraphics.fillRect(bounds.x - handle / 2, bounds.y - handle / 2, handle, handle);
        }
      }
    }

  }

  private getPreviewCameraFrame(scene: Scene) {
    const viewportWidth = this.scale.width;
    const viewportHeight = this.scale.height;
    const width = Math.min(viewportWidth, scene.settings.worldSize.x);
    const height = Math.min(viewportHeight, scene.settings.worldSize.y);
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
    const baseZoom = this.editorViewportMode === 'world' ? this.getWorldFillZoom(scene) : 1;

    return clamp(baseZoom * this.editorZoomFactor, 0.08, 6);
  }

  private getMinZoomFactor(scene: Scene) {
    const baseZoom = this.editorViewportMode === 'world' ? this.getWorldFillZoom(scene) : 1;
    const minimumZoom = this.editorViewportMode === 'world' ? this.getWorldFitZoom(scene) : 0.08;
    const minimumFactor = minimumZoom / Math.max(baseZoom, 0.0001);

    return this.editorViewportMode === 'world' ? Math.max(0.08 / Math.max(baseZoom, 0.0001), minimumFactor) : Math.max(0.08, minimumFactor);
  }

  private clampCameraToScene(scene: Scene) {
    if (!this.cameras?.main) {
      return;
    }

    const visibleWidth = this.scale.width / this.cameras.main.zoom;
    const visibleHeight = this.scale.height / this.cameras.main.zoom;
    const maxScrollX = scene.settings.worldSize.x - visibleWidth;
    const maxScrollY = scene.settings.worldSize.y - visibleHeight;
    const editorPanPaddingX =
      !this.isPlaying &&
      this.editorViewportMode === 'world' &&
      maxScrollX > 0 &&
      maxScrollX < scene.settings.gridSize
        ? scene.settings.gridSize - maxScrollX
        : 0;
    const editorPanPaddingY =
      !this.isPlaying &&
      this.editorViewportMode === 'world' &&
      maxScrollY > 0 &&
      maxScrollY < scene.settings.gridSize
        ? scene.settings.gridSize - maxScrollY
        : 0;
    const nextScrollX =
      maxScrollX >= 0
        ? clamp(this.cameras.main.scrollX, 0, maxScrollX + editorPanPaddingX)
        : maxScrollX / 2;
    const nextScrollY =
      maxScrollY >= 0
        ? clamp(this.cameras.main.scrollY, 0, maxScrollY + editorPanPaddingY)
        : maxScrollY / 2;

    this.cameras.main.setScroll(nextScrollX, nextScrollY);
  }

  private getWorldFitZoom(scene: Scene) {
    return Math.min(
      this.cameras.main.width / scene.settings.worldSize.x,
      this.cameras.main.height / scene.settings.worldSize.y,
    );
  }

  private getWorldFillZoom(scene: Scene) {
    return Math.max(
      this.cameras.main.width / scene.settings.worldSize.x,
      this.cameras.main.height / scene.settings.worldSize.y,
    );
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
