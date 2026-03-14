import * as Phaser from 'phaser';
import { Entity, ComponentType, SpriteComponent, TransformComponent, RigidBodyComponent, ColliderComponent, ScriptComponent, Project } from '../types';
import { InputManager } from './InputManager';

export class GameEngine {
  private game: Phaser.Game;
  private scene: MainScene;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.WEBGL,
      canvas: this.canvas,
      width: canvas.width,
      height: canvas.height,
      transparent: true,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: true
        }
      },
      scene: MainScene
    };

    this.game = new Phaser.Game(config);
    // We need to wait for the scene to be created
    this.game.events.once('ready', () => {
      this.scene = this.game.scene.getAt(0) as MainScene;
    });
  }

  public setInput(input: string, value: boolean) {
    if (this.scene) {
      this.scene.setInput(input, value);
    }
  }

  public setProject(project: Project) {
    if (this.scene) {
      this.scene.syncProject(project);
    } else {
      // If scene not ready yet, retry shortly
      setTimeout(() => this.setProject(project), 100);
    }
  }

  public setSelectedEntity(id: string | null, mode: 'move' | 'rotate' | 'scale') {
    if (this.scene) {
      this.scene.setSelectedEntity(id, mode);
    } else {
      setTimeout(() => this.setSelectedEntity(id, mode), 100);
    }
  }

  public start() {
    if (this.scene) {
      this.scene.setRunning(true);
    } else {
      setTimeout(() => this.start(), 100);
    }
  }

  public stop() {
    if (this.scene) {
      this.scene.setRunning(false);
    } else {
      setTimeout(() => this.stop(), 100);
    }
  }

  public resize(width: number, height: number) {
    this.game.scale.resize(width, height);
    const updateBounds = () => {
      if (this.scene && this.scene.physics && this.scene.physics.world) {
        this.scene.physics.world.setBounds(0, 0, width, height);
      } else {
        setTimeout(updateBounds, 100);
      }
    };
    updateBounds();
  }

  public destroy() {
    this.game.destroy(true);
  }
}

class MainScene extends Phaser.Scene {
  private entityMap: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private physicsGroup!: Phaser.Physics.Arcade.Group;
  private playerObj: Phaser.GameObjects.Sprite | null = null;
  private editorGraphics: Phaser.GameObjects.Graphics;
  private isRunning: boolean = false;
  private colliderAdded: boolean = false;
  private selectedEntityId: string | null = null;
  private transformMode: 'move' | 'rotate' | 'scale' = 'move';
  private project: Project | null = null;
  private inputManager: InputManager | null = null;
  private inputs = {
    up: false,
    down: false,
    left: false,
    right: false,
    jump: false,
    action: false
  };
  private debugText!: Phaser.GameObjects.Text;

  constructor() {
    super('MainScene');
  }

  create() {
    this.editorGraphics = this.add.graphics();
    this.editorGraphics.setDepth(1000);
    
    this.debugText = this.add.text(10, 10, '', { color: '#00ff00', backgroundColor: '#000000' });
    this.debugText.setDepth(2000);

    
    // Create a default white box texture for entities without sprites
    const g = this.make.graphics({x:0,y:0});
    g.fillStyle(0xffffff);
    g.fillRect(0,0,100,100);
    g.generateTexture('white_box', 100, 100);
    g.destroy();
    
    this.physicsGroup = this.physics.add.group();
    this.physics.add.collider(this.physicsGroup, this.physicsGroup);
  }

  public setInput(input: string, value: boolean) {
    if (input in this.inputs) {
      (this.inputs as any)[input] = value;
    }
  }

  public setRunning(value: boolean) {
    this.isRunning = value;
    if (value) {
      this.physics.resume();
      if (this.playerObj && this.physicsGroup && !this.colliderAdded) {
        this.physics.add.collider(this.playerObj, this.physicsGroup);
        this.colliderAdded = true;
      }
    } else {
      this.physics.pause();
      // Reset physics or state if needed when stopping
    }
    
    // Re-sync entities to apply physics states (enabled/disabled) based on isRunning
    if (this.project) {
      const activeScene = this.project.scenes.find(s => s.id === this.project?.activeSceneId);
      if (activeScene) {
        this.syncEntities(activeScene.entities);
      }
    }
  }

  public setSelectedEntity(id: string | null, mode: 'move' | 'rotate' | 'scale') {
    this.selectedEntityId = id;
    this.transformMode = mode;
  }

  private runScripts(time: number, delta: number) {
    this.entityMap.forEach((obj, id) => {
      const entity = this.project?.scenes.find(s => s.id === this.project?.activeSceneId)?.entities.find(e => e.id === id);
      if (entity) {
        const script = entity.components.find(c => c.type === ComponentType.Script) as ScriptComponent;
        if (script && script.enabled) {
          try {
            new Function('entity', 'scene', 'time', 'delta', script.code)(entity, this, time, delta);
          } catch (e) {
            console.error(`Script error on entity ${entity.name}:`, e);
          }
        }
      }
    });
  }

  public syncProject(project: Project) {
    this.project = project;
    this.colliderAdded = false;
    this.inputManager = new InputManager(this, project.controls);
    // Load assets
    let assetsLoading = false;
    project.assets.forEach(asset => {
      if (!this.textures.exists(asset.id)) {
        assetsLoading = true;
        const img = new Image();
        img.onload = () => {
          if (!this.textures.exists(asset.id)) {
            this.textures.addImage(asset.id, img);
          }
          // Trigger a re-sync once loaded
          const activeScene = project.scenes.find(s => s.id === project.activeSceneId);
          if (activeScene) {
            this.syncEntities(activeScene.entities);
          }
        };
        img.src = asset.url;
      }
    });

    const activeScene = project.scenes.find(s => s.id === project.activeSceneId);
    if (activeScene && !assetsLoading) {
      this.syncEntities(activeScene.entities);
    }
  }

  public syncEntities(entities: Entity[]) {
    if (!this.physicsGroup && this.physics) {
      this.physicsGroup = this.physics.add.group();
      this.colliderAdded = false;
    }

    // Remove objects that are no longer in the list
    const entityIds = new Set(entities.map(e => e.id));
    for (const [id, obj] of this.entityMap.entries()) {
      if (!entityIds.has(id)) {
        obj.destroy();
        this.entityMap.delete(id);
      }
    }

    // Update or create objects
    entities.forEach(entity => {
      const transform = entity.components.find(c => c.type === ComponentType.Transform) as TransformComponent;
      const sprite = entity.components.find(c => c.type === ComponentType.Sprite) as SpriteComponent;
      const physics = entity.components.find(c => c.type === ComponentType.RigidBody) as RigidBodyComponent;
      const collider = entity.components.find(c => c.type === ComponentType.Collider) as ColliderComponent;

      if (!transform || !sprite || !sprite.enabled) {
        if (this.entityMap.has(entity.id)) {
          this.entityMap.get(entity.id)?.setVisible(false);
        }
        return;
      }

      let obj = this.entityMap.get(entity.id);
      
      const textureKey = (sprite.assetId && this.textures.exists(sprite.assetId)) ? sprite.assetId : 'white_box';
      
      if (!obj) {
        obj = this.add.sprite(0, 0, textureKey);
        this.entityMap.set(entity.id, obj);
      } else {
        if (obj.texture.key !== textureKey) {
          obj.setTexture(textureKey);
        }
      }

      obj.setVisible(true);
      
      // Set display size to match transform scale * 100 (since base unit is 100x100)
      const scaleX = (typeof transform.scale.x === 'number' && !isNaN(transform.scale.x)) ? transform.scale.x : 1;
      const scaleY = (typeof transform.scale.y === 'number' && !isNaN(transform.scale.y)) ? transform.scale.y : 1;
      obj.setDisplaySize(scaleX * 100, scaleY * 100);
      
      const rotation = (typeof transform.rotation === 'number' && !isNaN(transform.rotation)) ? transform.rotation : 0;
      obj.setAngle(rotation);

      if (textureKey === 'white_box') {
        obj.setTint(parseInt(sprite.color.replace('#', '0x')));
      } else {
        obj.clearTint();
      }
      obj.setAlpha(sprite.opacity);
      obj.setFlip(sprite.flipX, sprite.flipY);

      const needsBody = (physics && physics.enabled) || (collider && collider.enabled);
      const isStatic = physics ? physics.isStatic : true;
      const hasActivePhysics = this.isRunning && needsBody && !isStatic;

      if (!hasActivePhysics) {
        const posX = (typeof transform.position.x === 'number' && !isNaN(transform.position.x)) ? transform.position.x : 0;
        const posY = (typeof transform.position.y === 'number' && !isNaN(transform.position.y)) ? transform.position.y : 0;
        obj.setPosition(posX, posY);
      }

      // Handle Physics & Colliders
      if (needsBody) {
        if (!obj.body) {
          this.physics.add.existing(obj);
        }
        
        const body = obj.body as Phaser.Physics.Arcade.Body;
        body.setEnable(this.isRunning);
        
        if (this.isRunning) {
          // Apply physics properties if it has a physics component
          if (physics && physics.enabled) {
            body.setAllowGravity(!physics.isStatic);
            body.setImmovable(physics.isStatic);
            
            let gScale = physics.gravityScale;
            if (typeof gScale !== 'number' || isNaN(gScale)) {
              gScale = 1;
            }
            
            // Explicitly set gravity on the body
            body.gravity.y = gScale * 980;
            body.setMass(physics.mass || 1);
            
            if (physics.isStatic) {
              body.setVelocity(0, 0);
              body.setAcceleration(0, 0);
            }
            
            // Debugging
            if (entity.id === 'player') {
              console.log('Player Physics:', {
                gravity: body.gravity.y,
                velocity: body.velocity.y,
                position: body.position.y,
                isStatic: physics.isStatic,
                checkCollision: body.checkCollision,
                allowGravity: body.allowGravity
              });
            }
          } else {
            // No physics component, just a collider -> static obstacle
            body.setAllowGravity(false);
            body.setImmovable(true);
            body.setVelocity(0, 0);
            body.setAcceleration(0, 0);
            body.setMass(1);
          }

          // Apply collider properties if it has a collider component
          if (collider && collider.enabled) {
            if (entity.id === 'player') {
              this.playerObj = obj;
            } else if (collider && collider.enabled) {
              if (this.physicsGroup) this.physicsGroup.add(obj);
            }
            if (collider.isPassThrough) {
              body.checkCollision.up = true;
              body.checkCollision.down = false;
              body.checkCollision.left = false;
              body.checkCollision.right = false;
            } else {
              body.checkCollision.up = true;
              body.checkCollision.down = true;
              body.checkCollision.left = true;
              body.checkCollision.right = true;
            }
            
            // If it's static, it shouldn't be a dynamic collider for the player
            if (physics && physics.isStatic) {
              body.setImmovable(true);
              body.setAllowGravity(false);
              body.setVelocity(0, 0);
            }
            
            const scaleX = obj.scaleX || 1;
            const scaleY = obj.scaleY || 1;
            
            const offsetX = collider.offsetX || 0;
            const offsetY = collider.offsetY || 0;
            
            // Set size/offset (unscaled because Phaser scales the body by obj.scale)
            if (collider.shape === 'circle') {
              const unscaledRadius = (collider.radius || 50) / scaleX;
              body.setCircle(unscaledRadius);
              body.setOffset((obj.width / 2 - unscaledRadius) + (offsetX / scaleX), (obj.height / 2 - unscaledRadius) + (offsetY / scaleY));
            } else {
              const unscaledWidth = (collider.width || 100) / scaleX;
              const unscaledHeight = (collider.height || 100) / scaleY;
              body.setSize(unscaledWidth, unscaledHeight, true);
              const centeredOffsetX = (obj.width - unscaledWidth) / 2;
              const centeredOffsetY = (obj.height - unscaledHeight) / 2;
              body.setOffset(centeredOffsetX + (offsetX / scaleX), centeredOffsetY + (offsetY / scaleY));
            }
          } else {
            if (this.physicsGroup) this.physicsGroup.remove(obj);
            body.checkCollision.none = true;
          }

          body.setCollideWorldBounds(true); // Always collide with world bounds
        } else {
          body.setVelocity(0, 0);
          body.setAcceleration(0, 0);
        }
        
        if (!hasActivePhysics) {
          body.updateFromGameObject();
        }
      } else if (obj.body) {
        (obj.body as Phaser.Physics.Arcade.Body).setEnable(false);
      }
    });
  }

  update(time: number, delta: number) {
    const deltaTime = delta / 1000;
    const moveSpeed = 200;

    if (this.isRunning && this.inputManager) {
      this.inputs.left = this.inputManager.isLeftDown();
      this.inputs.right = this.inputManager.isRightDown();
      this.inputs.up = this.inputManager.isUpDown();
      this.inputs.down = this.inputManager.isDownDown();
      this.inputs.jump = this.inputManager.isJumpDown();
    }

    if (this.isRunning) {
      this.runScripts(time, delta);
      
      const playerObj = this.entityMap.get('player');
      if (playerObj) {
        const body = playerObj.body as Phaser.Physics.Arcade.Body;
        
        if (body && body.enable) {
          // Use velocity for physics-enabled objects
          let vx = 0;

          if (this.inputs.left) vx = -moveSpeed;
          else if (this.inputs.right) vx = moveSpeed;

          // If gravity is active, don't force vy to 0 when no input.
          if (body.allowGravity && body.gravity.y !== 0) {
            body.setVelocityX(vx);
            
            const onGround = body.touching.down || body.blocked.down;
            if (this.inputs.jump && onGround) {
              body.setVelocityY(-moveSpeed * 2.5); // Jump up
            }
            // Down could be fast fall
            if (this.inputs.down && !onGround) {
              body.setVelocityY(body.velocity.y + moveSpeed * 0.1); 
            }
          } else {
            // No gravity, manual movement
            let vy = 0;
            if (this.inputs.up) vy = -moveSpeed;
            else if (this.inputs.down) vy = moveSpeed;
            body.setVelocity(vx, vy);
          }
          
          if (this.debugText) {
            const onGround = body.touching.down || body.blocked.down;
            const inPhysicsGroup = this.physicsGroup ? this.physicsGroup.contains(playerObj) : false;
            this.debugText.setText(`Player Y: ${Math.round(playerObj.y)}\nVy: ${Math.round(body.velocity.y)}\nGravY: ${body.gravity.y}\nAllowGrav: ${body.allowGravity}\nOnGround: ${onGround}\nInPhysicsGroup: ${inPhysicsGroup}\nIsRunning: ${this.isRunning}`);
          }
        } else {
          // Manual position update for non-physics objects
          if (this.inputs.left) playerObj.x -= moveSpeed * deltaTime;
          if (this.inputs.right) playerObj.x += moveSpeed * deltaTime;
          if (this.inputs.up) playerObj.y -= moveSpeed * deltaTime;
          if (this.inputs.down) playerObj.y += moveSpeed * deltaTime;
          
          // Keep in bounds only for non-physics objects
          playerObj.x = Phaser.Math.Clamp(playerObj.x, 25, this.cameras.main.width - 25);
          playerObj.y = Phaser.Math.Clamp(playerObj.y, 25, this.cameras.main.height - 25);
        }
      }
    }

    this.drawEditorUI();
  }

  private drawEditorUI() {
    this.editorGraphics.clear();
    
    // Draw Grid
    const gridSize = 50;
    this.editorGraphics.lineStyle(1, 0xffffff, 0.05);
    for (let x = 0; x <= this.cameras.main.width; x += gridSize) {
      this.editorGraphics.moveTo(x, 0);
      this.editorGraphics.lineTo(x, this.cameras.main.height);
    }
    for (let y = 0; y <= this.cameras.main.height; y += gridSize) {
      this.editorGraphics.moveTo(0, y);
      this.editorGraphics.lineTo(this.cameras.main.width, y);
    }
    this.editorGraphics.strokePath();

    // Draw Colliders
    if (!this.isRunning) {
      this.entityMap.forEach((obj, id) => {
        const body = obj.body as Phaser.Physics.Arcade.Body;
        if (body && body.enable) {
          this.editorGraphics.save();
          this.editorGraphics.translateCanvas(obj.x, obj.y);
          this.editorGraphics.rotateCanvas(obj.rotation);
          
          this.editorGraphics.lineStyle(2, 0x10b981, 0.5); // Emerald green for colliders
          
          const sx = obj.scaleX;
          const sy = obj.scaleY;
          
          if (body.isCircle) {
            this.editorGraphics.strokeCircle((body.offset.x - obj.width/2) * sx + body.radius, (body.offset.y - obj.height/2) * sy + body.radius, body.radius);
          } else {
            this.editorGraphics.strokeRect((body.offset.x - obj.width/2) * sx, (body.offset.y - obj.height/2) * sy, body.width, body.height);
          }
          
          this.editorGraphics.restore();
        }
      });
    }

    // Draw Gizmos
    if (this.selectedEntityId && !this.isRunning) {
      const obj = this.entityMap.get(this.selectedEntityId);
      if (obj) {
        const width = obj.width * obj.scaleX;
        const height = obj.height * obj.scaleY;

        this.editorGraphics.save();
        this.editorGraphics.translateCanvas(obj.x, obj.y);
        this.editorGraphics.rotateCanvas(obj.rotation);

        // Selection Box
        this.editorGraphics.lineStyle(2, 0x10b981, 1);
        // Phaser doesn't have native dashed lines in Graphics easily, so we'll just use solid for now or skip dash
        this.editorGraphics.strokeRect(-width / 2 - 5, -height / 2 - 5, width + 10, height + 10);

        if (this.transformMode === 'move') {
          this.editorGraphics.fillStyle(0xef4444, 1);
          this.editorGraphics.fillRect(0, -2, 40, 4);
          this.editorGraphics.fillStyle(0x3b82f6, 1);
          this.editorGraphics.fillRect(-2, 0, 4, -40);
        } else if (this.transformMode === 'rotate') {
          this.editorGraphics.lineStyle(2, 0xf59e0b, 1);
          this.editorGraphics.strokeCircle(0, 0, 60);
        } else if (this.transformMode === 'scale') {
          this.editorGraphics.fillStyle(0x10b981, 1);
          this.editorGraphics.fillRect(width / 2, -height / 2 - 10, 10, 10);
          this.editorGraphics.fillRect(-width / 2 - 10, height / 2, 10, 10);
        }

        this.editorGraphics.restore();
      }
    }
  }
}
