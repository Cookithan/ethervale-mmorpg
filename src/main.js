import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import MenuScene from './scenes/MenuScene.js'
import CharacterScene from './scenes/CharacterScene.js'
import GameScene from './scenes/GameScene.js'
import UIScene from './scenes/UIScene.js'

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#2d2d2d',
  pixelArt: true, // désactive l'anticrénelage → pixel art net
  scale: {
    mode: Phaser.Scale.RESIZE, // s'adapte mobile + PC
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false, // passera à true en Étape 5 pour visualiser les collisions
    },
  },
  scene: [BootScene, MenuScene, CharacterScene, GameScene, UIScene],
}

// eslint-disable-next-line no-new
new Phaser.Game(config)
