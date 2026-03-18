import * as Phaser from 'phaser';
import {Controls} from '../types';

type InputAction = keyof Controls;

const KEY_ALIASES: Record<string, number> = {
  ArrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
  ArrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
  ArrowUp: Phaser.Input.Keyboard.KeyCodes.UP,
  ArrowDown: Phaser.Input.Keyboard.KeyCodes.DOWN,
  Space: Phaser.Input.Keyboard.KeyCodes.SPACE,
  ShiftLeft: Phaser.Input.Keyboard.KeyCodes.SHIFT,
  ShiftRight: Phaser.Input.Keyboard.KeyCodes.SHIFT,
  KeyW: Phaser.Input.Keyboard.KeyCodes.W,
  KeyA: Phaser.Input.Keyboard.KeyCodes.A,
  KeyS: Phaser.Input.Keyboard.KeyCodes.S,
  KeyD: Phaser.Input.Keyboard.KeyCodes.D,
  KeyE: Phaser.Input.Keyboard.KeyCodes.E,
  KeyQ: Phaser.Input.Keyboard.KeyCodes.Q,
  KeyF: Phaser.Input.Keyboard.KeyCodes.F,
};

export class InputManager {
  private keys: Partial<Record<InputAction, Phaser.Input.Keyboard.Key>> = {};

  constructor(scene: Phaser.Scene, controls: Controls) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      return;
    }

    (Object.entries(controls) as Array<[InputAction, string]>).forEach(([action, key]) => {
      this.keys[action] = keyboard.addKey(this.getKeyCode(key), false);
    });
  }

  private getKeyCode(key: string) {
    if (KEY_ALIASES[key]) {
      return KEY_ALIASES[key];
    }

    const normalized = key.toUpperCase();
    return (
      KEY_ALIASES[normalized] ??
      Phaser.Input.Keyboard.KeyCodes[normalized as keyof typeof Phaser.Input.Keyboard.KeyCodes] ??
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
  }

  isDown(action: InputAction) {
    return this.keys[action]?.isDown ?? false;
  }

  isLeftDown() {
    return this.isDown('left');
  }

  isRightDown() {
    return this.isDown('right');
  }

  isUpDown() {
    return this.isDown('up');
  }

  isDownDown() {
    return this.isDown('down');
  }

  isJumpDown() {
    return this.isDown('jump');
  }

  isActionDown() {
    return this.isDown('action');
  }

  isAltActionDown() {
    return this.isDown('altAction');
  }
}
