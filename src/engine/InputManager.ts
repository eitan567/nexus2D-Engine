import Phaser from 'phaser';
import { Controls } from '../types';

export class InputManager {
  private keys: { [key: string]: Phaser.Input.Keyboard.Key } = {};

  constructor(scene: Phaser.Scene, controls: Controls) {
    this.keys['left'] = scene.input.keyboard!.addKey(this.getKeyCode(controls.left));
    this.keys['right'] = scene.input.keyboard!.addKey(this.getKeyCode(controls.right));
    this.keys['up'] = scene.input.keyboard!.addKey(this.getKeyCode(controls.up));
    this.keys['down'] = scene.input.keyboard!.addKey(this.getKeyCode(controls.down));
    this.keys['jump'] = scene.input.keyboard!.addKey(this.getKeyCode(controls.jump));
  }

  private getKeyCode(key: string): number {
    const keyMap: { [key: string]: number } = {
      'ArrowLeft': Phaser.Input.Keyboard.KeyCodes.LEFT,
      'ArrowRight': Phaser.Input.Keyboard.KeyCodes.RIGHT,
      'ArrowUp': Phaser.Input.Keyboard.KeyCodes.UP,
      'ArrowDown': Phaser.Input.Keyboard.KeyCodes.DOWN,
      ' ': Phaser.Input.Keyboard.KeyCodes.SPACE,
      'LEFT': Phaser.Input.Keyboard.KeyCodes.LEFT,
      'RIGHT': Phaser.Input.Keyboard.KeyCodes.RIGHT,
      'UP': Phaser.Input.Keyboard.KeyCodes.UP,
      'DOWN': Phaser.Input.Keyboard.KeyCodes.DOWN,
      'SPACE': Phaser.Input.Keyboard.KeyCodes.SPACE,
      'w': Phaser.Input.Keyboard.KeyCodes.W,
      'a': Phaser.Input.Keyboard.KeyCodes.A,
      's': Phaser.Input.Keyboard.KeyCodes.S,
      'd': Phaser.Input.Keyboard.KeyCodes.D,
    };
    return keyMap[key] || Phaser.Input.Keyboard.KeyCodes[key as keyof typeof Phaser.Input.Keyboard.KeyCodes] || Phaser.Input.Keyboard.KeyCodes.SPACE;
  }

  isLeftDown(): boolean { return this.keys['left'].isDown; }
  isRightDown(): boolean { return this.keys['right'].isDown; }
  isUpDown(): boolean { return this.keys['up'].isDown; }
  isDownDown(): boolean { return this.keys['down'].isDown; }
  isJumpDown(): boolean { return this.keys['jump'].isDown; }
}
