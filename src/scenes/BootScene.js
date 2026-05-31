import Phaser from 'phaser'

// monstres (sprites mon_<nom>.png, grille 4x4) — chargement + animations directionnelles
const MONSTER_SPRITES = ['mushroom', 'lizard', 'racoon', 'snake', 'spider', 'bear', 'owl', 'skull', 'spirit', 'flam']

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
    for (const m of MONSTER_SPRITES) {
      this.load.spritesheet('mon_' + m, `assets/sprites/mon_${m}.png`, {
        frameWidth: 16,
        frameHeight: 16,
      })
    }

    // marchand : spritesheet 16x16 (on n'utilise que la frame 0 = face) + portrait
    this.load.spritesheet('npc_merchant', 'assets/sprites/npc_merchant.png', { frameWidth: 16, frameHeight: 16 })
    this.load.image('merchant_face', 'assets/items/merchant_face.png')

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

    // 'water_gen' : tileset d'eau 64x16 = 4 variantes 16x16 (bleu + reflets clairs).
    // Utilisé comme tileset d'une couche de tilemap pour les rivières.
    if (!this.textures.exists('water_gen')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      // reflets clairs par variante : [x, y, largeur]
      const ripples = [
        [[2, 4, 4], [9, 11, 5]],
        [[6, 3, 5], [1, 12, 4], [11, 8, 3]],
        [[8, 6, 4], [3, 13, 5]],
        [[12, 5, 3], [5, 10, 5], [1, 2, 3]],
      ]
      const specks = [
        [[12, 9], [4, 14]],
        [[3, 6], [13, 13]],
        [[10, 3], [1, 9]],
        [[7, 7], [14, 4]],
      ]
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        g.fillStyle(0x3f8ed0, 1) // bleu eau de base
        g.fillRect(ox, 0, 16, 16)
        g.fillStyle(0x357fbe, 1) // creux légèrement plus foncés
        for (const [sx, sy] of specks[i]) g.fillRect(ox + sx, sy, 2, 1)
        g.fillStyle(0x74b4e8, 1) // reflets clairs (vaguelettes)
        for (const [rx, ry, rw] of ripples[i]) {
          g.fillRect(ox + rx, ry, rw, 1)
          g.fillRect(ox + rx + 1, ry + 1, Math.max(1, rw - 2), 1)
        }
      }
      g.generateTexture('water_gen', 64, 16)
      g.destroy()
    }

    // 'bridge_gen' : tuile de pont en planches de bois (16x16) posée au-dessus de l'eau.
    if (!this.textures.exists('bridge_gen')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0xd49a58, 1) // bois clair (proche du chemin)
      g.fillRect(0, 0, 16, 16)
      g.fillStyle(0xab6f38, 1) // joints entre planches
      for (let y = 0; y < 16; y += 5) g.fillRect(0, y, 16, 1)
      g.fillStyle(0xeec394, 1) // reflets clairs en haut de chaque planche
      for (let y = 1; y < 16; y += 5) g.fillRect(0, y, 16, 1)
      g.generateTexture('bridge_gen', 16, 16)
      g.destroy()
    }

    // 'dry_lake' : 4 variantes 16x16 de terre craquelée (lacs asséchés du désert)
    if (!this.textures.exists('dry_lake')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      const cracks = [
        [[8, 1, 1, 14], [3, 7, 10, 1]],
        [[5, 0, 1, 9], [10, 5, 1, 11], [2, 11, 12, 1]],
        [[11, 2, 1,13], [4, 4, 8, 1]],
        [[7, 3, 1, 12], [1, 8, 14, 1], [9, 10, 6, 1]],
      ]
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        g.fillStyle(0xcaa86a, 1) // terre sèche
        g.fillRect(ox, 0, 16, 16)
        g.fillStyle(0xbb965a, 1) // nuances
        g.fillRect(ox + 2, 9, 5, 4)
        g.fillRect(ox + 9, 2, 4, 3)
        g.fillStyle(0x8f7440, 1) // craquelures
        for (const [sx, sy, w, h] of cracks[i]) g.fillRect(ox + sx, sy, w, h)
      }
      g.generateTexture('dry_lake', 64, 16)
      g.destroy()
    }

    // 'ice_gen' : 4 variantes 16x16 de glace (lacs gelés de la neige, marchables)
    if (!this.textures.exists('ice_gen')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      const cracks = [
        [[4, 2, 1, 11], [4, 8, 7, 1]],
        [[10, 3, 1, 10], [2, 6, 9, 1]],
        [[7, 1, 1, 13]],
        [[12, 4, 1, 9], [3, 10, 10, 1]],
      ]
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        g.fillStyle(0xb7e1ee, 1) // glace bleu clair
        g.fillRect(ox, 0, 16, 16)
        g.fillStyle(0x8fc6d8, 1) // craquelures bleutées
        for (const [sx, sy, w, h] of cracks[i]) g.fillRect(ox + sx, sy, w, h)
        g.fillStyle(0xeefaff, 1) // reflets blancs (brillance)
        g.fillRect(ox + 2, 2, 4, 1)
        g.fillRect(ox + 9, 12, 4, 1)
      }
      g.generateTexture('ice_gen', 64, 16)
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
    for (const m of MONSTER_SPRITES) {
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
