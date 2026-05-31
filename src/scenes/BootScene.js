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

    // monstres : spritesheets 16x16 (4x4)
    for (const m of ['mon_mushroom', 'mon_lizard', 'mon_racoon']) {
      this.load.spritesheet(m, `assets/sprites/${m}.png`, {
        frameWidth: 16,
        frameHeight: 16,
      })
    }

    // sprites d'objets ramassables (pack Ninja Adventure)
    // la pièce est une spritesheet 10x10 (4 frames = rotation), cœur/gemme sont statiques
    this.load.spritesheet('drop_gold', 'assets/items/gold.png', { frameWidth: 10, frameHeight: 10 })
    this.load.image('drop_heart', 'assets/items/heart.png')
    this.load.image('drop_gem', 'assets/items/gem.png')

    // icônes d'équipement (armes / armure / accessoires) — pack Ninja Adventure
    for (const key of ['weapon_sword', 'weapon_katana', 'weapon_axe', 'weapon_bigsword', 'eq_armor', 'eq_amulet', 'eq_ring']) {
      this.load.image(key, `assets/items/${key}.png`)
    }
  }

  create() {
    this.createGeneratedTextures()
    this.createPlayerAnimations()
    this.createMonsterAnimations()
    this.createItemAnimations()
    this.scene.start('GameScene')
  }

  /** Animations des objets (pièce qui tourne). */
  createItemAnimations() {
    if (!this.anims.exists('coin-spin')) {
      this.anims.create({
        key: 'coin-spin',
        frames: this.anims.generateFrameNumbers('drop_gold', { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      })
    }
  }

  /**
   * Textures dessinées par code (pas de fichier à charger).
   * - 'proj' : boule d'énergie verte (projectile du héros).
   * Les sprites de drops (or/cœur/gemme) viennent désormais du pack (cf. preload).
   */
  createGeneratedTextures() {
    if (!this.textures.exists('proj')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x9be15d, 1) // halo vert clair
      g.fillCircle(5, 5, 5)
      g.fillStyle(0xffffff, 1) // cœur lumineux
      g.fillCircle(5, 5, 2)
      g.generateTexture('proj', 10, 10)
      g.destroy()
    }
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

    // attaque : lignes 4-6 (frames 16-27), même logique par colonne=direction
    add('attack-down', [16, 20, 24], 14, 0)
    add('attack-up', [17, 21, 25], 14, 0)
    add('attack-left', [18, 22, 26], 14, 0)
    add('attack-right', [19, 23, 27], 14, 0)
  }

  /**
   * Anim des monstres : spritesheet 4x4 organisé PAR COLONNE = direction
   * (col0=Bas, col1=Haut, col2=Gauche, col3=Droite), chaque ligne = une frame.
   * Comme le héros : marche directionnelle avec frames espacées de 4.
   */
  createMonsterAnimations() {
    const dirs = { down: 0, up: 1, left: 2, right: 3 }
    for (const m of ['mushroom', 'lizard', 'racoon']) {
      for (const [dir, col] of Object.entries(dirs)) {
        const key = `mon-${m}-${dir}`
        if (this.anims.exists(key)) continue
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers('mon_' + m, {
            frames: [col, col + 4, col + 8, col + 12],
          }),
          frameRate: 6,
          repeat: -1,
        })
      }
    }
  }
}
