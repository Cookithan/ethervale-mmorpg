import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import MenuScene from './scenes/MenuScene.js'
import SelectScene from './scenes/SelectScene.js'
import IntroScene from './scenes/IntroScene.js'
import CharacterScene from './scenes/CharacterScene.js'
import GameScene from './scenes/GameScene.js'
import UIScene from './scenes/UIScene.js'
import EpilogueScene from './scenes/EpilogueScene.js'

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
      debug: false, // mettre à true pour visualiser les colliders (boîtes) — utile pour régler les hitbox
    },
  },
  scene: [BootScene, MenuScene, SelectScene, IntroScene, CharacterScene, GameScene, UIScene, EpilogueScene],
}

// eslint-disable-next-line no-new
new Phaser.Game(config)
