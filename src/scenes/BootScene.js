import Phaser from 'phaser'

/**
 * BootScene — précharge les assets puis crée les animations du héros.
 * Assets : pack "Ninja Adventure" (CC0). Héros = NinjaGreen, spritesheet 16x16
 * (3 frames par direction, 4 directions).
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload() {
    const { width, height } = this.scale
    const txt = this.add
      .text(width / 2, height / 2, 'Chargement...', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    this.load.on('complete', () => txt.destroy())

    // sol "prairie" (tileset image, découpé en tuiles 16x16 par la tilemap)
    this.load.image('field', 'assets/tiles/field.png')

    // nature (arbres, rochers...) en spritesheet 16x16 pour placer des tuiles
    this.load.spritesheet('nature', 'assets/tiles/nature.png', {
      frameWidth: 16,
      frameHeight: 16,
    })

    // héros : spritesheet 16x16
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: 16,
      frameHeight: 16,
    })
  }

  create() {
    this.createPlayerAnimations()
    this.scene.start('GameScene')
  }

  /**
   * Spritesheet NinjaGreen : 4 colonnes x 7 lignes (28 frames).
   * Organisé PAR COLONNE = direction : col0=Bas, col1=Haut, col2=Gauche, col3=Droite.
   * Chaque ligne (rangée de 4) est une frame du cycle de marche.
   * On prend les 4 premières lignes pour le walk -> indices espacés de 4.
   */
  createPlayerAnimations() {
    const add = (key, indices, frameRate = 8, repeat = -1) => {
      if (this.anims.exists(key)) return
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('player', { frames: indices }),
        frameRate,
        repeat,
      })
    }

    add('walk-down', [0, 4, 8, 12])
    add('walk-up', [1, 5, 9, 13])
    add('walk-left', [2, 6, 10, 14])
    add('walk-right', [3, 7, 11, 15])

    // immobile = 1re frame de chaque direction (1re ligne)
    add('idle-down', [0], 1, 0)
    add('idle-up', [1], 1, 0)
    add('idle-left', [2], 1, 0)
    add('idle-right', [3], 1, 0)
  }
}
