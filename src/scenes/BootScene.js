import Phaser from 'phaser'
import { HEROES } from '../data/classes.js'
import { Audio } from '../data/sound.js'

// monstres (sprites mon_<nom>.png, grille 4x4) — chargement + animations directionnelles
const MONSTER_SPRITES = ['mushroom', 'lizard', 'racoon', 'snake', 'spider', 'bear', 'owl', 'skull', 'spirit', 'flam']

// audio : clés des fichiers (musiques .ogg + bruitages .wav) à précharger
const MUSIC_KEYS = ['mus_menu', 'mus_village', 'mus_forest', 'mus_snow', 'mus_desert', 'mus_cursed', 'mus_boss1', 'mus_boss2', 'mus_boss3', 'mus_shop']
const SFX_KEYS = [
  'sfx_slash', 'sfx_slash2', 'sfx_sword', 'sfx_whoosh', 'sfx_launch',
  'sfx_hit1', 'sfx_hit2', 'sfx_impact', 'sfx_magic1', 'sfx_magic2',
  'sfx_magic5', 'sfx_fx', 'sfx_spirit', 'sfx_heal',
  'sfx_levelup', 'sfx_gameover', // jingles (montée de niveau / défaite)
  'amb_wind', // ambiance : vent (monte près de la côte)
  'ui_accept', 'ui_move', 'ui_cancel', 'ui_coin', // sons d'interface (menus, panneaux, transactions)
  'sfx_step1', 'sfx_step2', // pas sur l'herbe (alternés pendant la marche)
]

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

    // bâtiments (maisons, igloos, portails...) : spritesheet 16x16, 33 colonnes
    this.load.spritesheet('house', 'assets/tiles/house.png', { frameWidth: 16, frameHeight: 16 })

    // héros : spritesheet 16x16 (NinjaGreen historique = 'player')
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: 16,
      frameHeight: 16,
    })
    // apparences jouables (choix du personnage) : spritesheets 16x16 (4×7)
    for (const h of HEROES) {
      this.load.spritesheet(h.key, `assets/sprites/${h.key}.png`, { frameWidth: 16, frameHeight: 16 })
      this.load.image('face_' + h.key, `assets/faces/${h.key}.png`) // portrait (38×38) pour la création de perso
    }

    // monstres : spritesheets 16x16 (4x4)
    for (const m of MONSTER_SPRITES) {
      this.load.spritesheet('mon_' + m, `assets/sprites/mon_${m}.png`, {
        frameWidth: 16,
        frameHeight: 16,
      })
    }

    // BOSS DE RAID (vrais sprites dédiés du pack, mono-orientation = face caméra, flipX pour gauche/droite).
    // Chaque anim a sa propre feuille car les frames diffèrent en taille (idle/hit vs walk).
    // TenguBlue (Forêt) : idle/hit 68x68, walk 82x82.
    this.load.spritesheet('boss_tengublue_idle', 'assets/boss/tengublue_idle.png', { frameWidth: 68, frameHeight: 68 })
    this.load.spritesheet('boss_tengublue_walk', 'assets/boss/tengublue_walk.png', { frameWidth: 82, frameHeight: 82 })
    this.load.spritesheet('boss_tengublue_hit', 'assets/boss/tengublue_hit.png', { frameWidth: 68, frameHeight: 68 })
    // GiantBlueSamurai (Forêt) : figure large et trapue -> frames 96x48 (idle/walk 6 frames, hit 4).
    this.load.spritesheet('boss_samurai_idle', 'assets/boss/samurai_idle.png', { frameWidth: 96, frameHeight: 48 })
    this.load.spritesheet('boss_samurai_walk', 'assets/boss/samurai_walk.png', { frameWidth: 96, frameHeight: 48 })
    this.load.spritesheet('boss_samurai_hit', 'assets/boss/samurai_hit.png', { frameWidth: 96, frameHeight: 48 })

    // logo du menu (titre "NINJA ADVENTURE" extrait de la cover du pack)
    this.load.image('title_logo', 'assets/ui/title.png')

    // marchand : spritesheet 16x16 (on n'utilise que la frame 0 = face) + portrait
    this.load.spritesheet('npc_merchant', 'assets/sprites/npc_merchant.png', { frameWidth: 16, frameHeight: 16 })
    this.load.image('merchant_face', 'assets/items/merchant_face.png')

    // villageois (PNJ statiques, frame 0 = face)
    for (const n of ['npc_villager', 'npc_woman', 'npc_boy']) {
      this.load.spritesheet(n, `assets/sprites/${n}.png`, { frameWidth: 16, frameHeight: 16 })
    }

    // sprites d'objets ramassables (pack Ninja Adventure)
    // la pièce est une spritesheet 10x10 (4 frames = rotation), cœur/gemme sont statiques
    this.load.spritesheet('drop_gold', 'assets/items/gold.png', { frameWidth: 10, frameHeight: 10 })
    this.load.image('drop_heart', 'assets/items/heart.png')
    this.load.image('drop_gem', 'assets/items/gem.png')

    // icônes d'équipement (armure / accessoires) — pack Ninja Adventure
    for (const key of ['eq_armor', 'eq_amulet', 'eq_ring', 'eq_helmet']) {
      this.load.image(key, `assets/items/${key}.png`)
    }
    // sprites d'ARMES (Items/Weapons) : servent d'icône d'inventaire ET de sprite qui swingue à l'attaque
    for (const key of ['wpn_sword', 'wpn_katana', 'wpn_rapier', 'wpn_dagger', 'wpn_club', 'wpn_hammer', 'wpn_bigsword', 'wpn_wand', 'wpn_book', 'wpn_stick', 'wpn_bone']) {
      this.load.image(key, `assets/weapons/${key}.png`)
    }

    // FX animés (effets de sorts, dossier FX du pack)
    this.load.spritesheet('fx_explosion', 'assets/fx/explosion.png', { frameWidth: 40, frameHeight: 40 }) // 9 frames (feu)
    this.load.spritesheet('fx_spirit', 'assets/fx/spirit.png', { frameWidth: 32, frameHeight: 32 }) // 5 frames (blanc, teintable)
    this.load.spritesheet('fx_shield', 'assets/fx/shield.png', { frameWidth: 24, frameHeight: 26 }) // 6 frames (bouclier Tank)
    this.load.spritesheet('fx_aura', 'assets/fx/aura.png', { frameWidth: 25, frameHeight: 24 }) // 5 frames (soin, teinté vert)
    this.load.spritesheet('fx_circslash', 'assets/fx/circslash.png', { frameWidth: 32, frameHeight: 32 }) // 4 frames (Charge + masses)
    this.load.spritesheet('fx_slash', 'assets/fx/slash.png', { frameWidth: 32, frameHeight: 32 }) // 4 frames (tranche lames)
    this.load.spritesheet('fx_energyball', 'assets/fx/energyball.png', { frameWidth: 16, frameHeight: 16 }) // 4 frames (projectile, teintable)
    this.load.spritesheet('fx_fireball', 'assets/fx/fireball.png', { frameWidth: 16, frameHeight: 16 }) // 4 frames (projectile feu)
    this.load.spritesheet('fx_shuriken', 'assets/fx/shuriken.png', { frameWidth: 16, frameHeight: 16 }) // 2 frames (shuriken qui tourne)
    this.load.image('fx_kunai', 'assets/fx/kunai.png') // dague de lancer (statique, pointe dans la direction)

    // --- AUDIO (pack Ninja Adventure, CC0) ---
    // musiques de fond (boucle) par zone + combat de boss + menu
    for (const m of MUSIC_KEYS) this.load.audio(m, `assets/audio/music/${m}.ogg`)
    // bruitages de combat (coups, slash, sorts, projectiles)
    for (const s of SFX_KEYS) this.load.audio(s, `assets/audio/sfx/${s}.wav`)
  }

  create() {
    this.createGeneratedTextures()
    this.createPlayerAnimations()
    this.createMonsterAnimations()
    this.createNpcAnimations()
    this.createItemAnimations()
    this.createFxAnimations()
    Audio.init(this.game) // moteur audio prêt (mute persisté + gestion autoplay verrouillé)
    this.scene.start('MenuScene') // écran d'accueil (puis création de perso -> jeu)
  }

  /** Animations des effets de sorts (FX du pack). */
  createFxAnimations() {
    if (!this.anims.exists('fx-explosion')) {
      this.anims.create({
        key: 'fx-explosion',
        frames: this.anims.generateFrameNumbers('fx_explosion', { start: 0, end: 8 }),
        frameRate: 20,
        repeat: 0,
      })
    }
    if (!this.anims.exists('fx-spirit')) {
      this.anims.create({
        key: 'fx-spirit',
        frames: this.anims.generateFrameNumbers('fx_spirit', { start: 0, end: 4 }),
        frameRate: 16,
        repeat: 0,
      })
    }
    if (!this.anims.exists('fx-shield')) {
      this.anims.create({ key: 'fx-shield', frames: this.anims.generateFrameNumbers('fx_shield', { start: 0, end: 5 }), frameRate: 12, repeat: -1 })
    }
    if (!this.anims.exists('fx-aura')) {
      this.anims.create({ key: 'fx-aura', frames: this.anims.generateFrameNumbers('fx_aura', { start: 0, end: 4 }), frameRate: 16, repeat: 0 })
    }
    if (!this.anims.exists('fx-circslash')) {
      this.anims.create({ key: 'fx-circslash', frames: this.anims.generateFrameNumbers('fx_circslash', { start: 0, end: 3 }), frameRate: 18, repeat: 0 })
    }
    if (!this.anims.exists('fx-slash')) {
      this.anims.create({ key: 'fx-slash', frames: this.anims.generateFrameNumbers('fx_slash', { start: 0, end: 3 }), frameRate: 26, repeat: 0 })
    }
    if (!this.anims.exists('fx-energyball')) {
      this.anims.create({ key: 'fx-energyball', frames: this.anims.generateFrameNumbers('fx_energyball', { start: 0, end: 3 }), frameRate: 14, repeat: -1 })
    }
    if (!this.anims.exists('fx-fireball')) {
      this.anims.create({ key: 'fx-fireball', frames: this.anims.generateFrameNumbers('fx_fireball', { start: 0, end: 3 }), frameRate: 14, repeat: -1 })
    }
    if (!this.anims.exists('fx-shuriken')) {
      this.anims.create({ key: 'fx-shuriken', frames: this.anims.generateFrameNumbers('fx_shuriken', { start: 0, end: 1 }), frameRate: 20, repeat: -1 })
    }
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
      // boule BLANCHE/grise -> TEINTÉE par la couleur de magie de l'apparence (setTint dans Projectile)
      g.fillStyle(0xdedede, 1) // halo (gris clair -> prend la teinte, un peu plus sombre = bord)
      g.fillCircle(5, 5, 5)
      g.fillStyle(0xffffff, 1) // cœur lumineux (blanc -> teinte pleine, centre brillant)
      g.fillCircle(5, 5, 2.5)
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

    // 'bridge_gen' : tileset 64x16 = 4 variantes 16x16. PONT = PLANCHES de bois USÉES séparées par
    // de l'EAU -> bandes alternées : planche (3px, bois) / eau (2px, rivière) / planche / eau ...
    // Tout opaque + détails >=2px -> on lit bien "planche+eau+planche" sans scintiller au dézoom.
    if (!this.textures.exists('bridge_gen')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      const woods = [0xc0894d, 0xad7740, 0xcf975a] // teintes de bois usé
      const knots = [[3, 1], [12, 5], [7, 10], [10, 1]] // un noeud par variante (sur une planche)
      // motif vertical, période 9 px : 2 PLANCHES (3px + joint 1px + 3px) puis une bande d'EAU (2px)
      // -> on voit surtout du bois, et un peu d'eau entre chaque PAIRE de planches (~22% d'eau).
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        const shift = (i * 4) % 9 // décale le motif d'une variante à l'autre (0,4,8,3 -> 4 motifs distincts)
        for (let y = 0; y < 16; y++) {
          const m = (y + shift) % 9
          if (m === 7 || m === 8) {
            g.fillStyle(m === 7 ? 0x2f6ea8 : 0x3f8ed0, 1) // EAU (2px)
            g.fillRect(ox, y, 16, 1)
          } else if (m === 3) {
            g.fillStyle(0x7c5128, 1) // joint sombre entre les 2 planches
            g.fillRect(ox, y, 16, 1)
          } else {
            const plank = m < 3 ? 0 : 1 // planche du haut / du bas de la paire
            g.fillStyle(woods[(plank + i) % 3], 1)
            g.fillRect(ox, y, 16, 1)
            if (m === 0 || m === 4) {
              g.fillStyle(0xe2b176, 1) // arête supérieure éclairée de chaque planche
              g.fillRect(ox, y, 16, 1)
            } else if (m === 6) {
              g.fillStyle(0x7c5128, 1) // ombre sous la planche basse
              g.fillRect(ox, y, 16, 1)
            }
          }
        }
        // reflet sur la bande d'eau + noeud usé sur une planche
        g.fillStyle(0x79b7ea, 1)
        for (let y = 0; y < 16; y++) if ((y + shift) % 9 === 8) g.fillRect(ox + 2 + ((y + i) % 6), y, 4, 1)
        g.fillStyle(0x70491f, 1)
        g.fillRect(ox + knots[i][0], knots[i][1], 2, 2) // noeud (tache sombre)
      }
      g.generateTexture('bridge_gen', 64, 16)
      g.destroy()
    }

    // 'ford_gen' : tileset 64x16 = 4 variantes 16x16 de TERRE BATTUE marron CLAIR -> gués (traversées
    // de rivière en chemin de terre clair, à la place des planches).
    if (!this.textures.exists('ford_gen')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      const dots = [
        [[3, 4], [11, 9], [6, 13]],
        [[8, 3], [2, 10], [13, 12]],
        [[5, 6], [12, 4], [9, 11]],
        [[2, 5], [7, 9], [14, 7]],
      ]
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        g.fillStyle(0xb5915c, 1) // terre battue marron clair (un peu plus foncé)
        g.fillRect(ox, 0, 16, 16)
        g.fillStyle(0xc7a877, 1) // éclaircis (terre tassée)
        g.fillRect(ox + 1, 2, 5, 3)
        g.fillRect(ox + 9, 10, 5, 3)
        g.fillStyle(0x97743f, 1) // petits cailloux / nuances plus foncées
        for (const [sx, sy] of dots[i]) g.fillRect(ox + sx, sy, 2, 2)
      }
      g.generateTexture('ford_gen', 64, 16)
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

    // 'campfire' : feu de camp 24x24 (pierres + bûches + flamme) — élément central du village
    if (!this.textures.exists('campfire')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x000000, 0.18) // ombre
      g.fillEllipse(12, 20, 20, 6)
      const stones = [[4, 18], [9, 21], [15, 21], [20, 18], [3, 15], [21, 15]]
      g.fillStyle(0x9a9a9a, 1) // pierres claires
      for (const [sx, sy] of stones) g.fillCircle(sx, sy, 3)
      g.fillStyle(0x767676, 1) // ombrage pierres
      for (const [sx, sy] of stones) g.fillCircle(sx, sy + 1, 2)
      g.fillStyle(0x6b4423, 1) // bûches
      g.fillRect(5, 16, 14, 3)
      g.fillRect(8, 14, 3, 6)
      g.fillStyle(0xe8541a, 1) // flamme externe
      g.fillTriangle(7, 17, 17, 17, 12, 3)
      g.fillStyle(0xff8a2a, 1) // flamme
      g.fillTriangle(9, 17, 15, 17, 12, 7)
      g.fillStyle(0xffd24d, 1) // cœur
      g.fillTriangle(10, 17, 14, 17, 12, 10)
      g.generateTexture('campfire', 24, 24)
      g.destroy()
    }

    // clôture en bois : 'fence_h' (course horizontale) + 'fence_v' (course verticale)
    if (!this.textures.exists('fence_h')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x8a5a2b, 1) // lisses horizontales
      g.fillRect(0, 6, 16, 2)
      g.fillRect(0, 10, 16, 2)
      g.fillStyle(0x6b4423, 1) // poteau
      g.fillRect(6, 3, 4, 12)
      g.fillStyle(0xa3702f, 1) // reflet haut du poteau
      g.fillRect(6, 3, 4, 1)
      g.generateTexture('fence_h', 16, 16)
      g.destroy()
    }
    if (!this.textures.exists('fence_v')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x8a5a2b, 1) // lisses verticales
      g.fillRect(6, 0, 2, 16)
      g.fillRect(10, 0, 2, 16)
      g.fillStyle(0x6b4423, 1) // poteau
      g.fillRect(3, 6, 12, 4)
      g.generateTexture('fence_v', 16, 16)
      g.destroy()
    }

    // 'lamppost' : lampadaire 16x32 (poteau + lanterne lumineuse)
    if (!this.textures.exists('lamppost')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x3a3340, 1) // poteau
      g.fillRect(7, 9, 3, 21)
      g.fillRect(5, 29, 7, 2) // base
      g.fillStyle(0x2a2530, 1) // cadre lanterne
      g.fillRect(5, 1, 7, 9)
      g.fillStyle(0xffe066, 1) // lumière
      g.fillRect(6, 2, 5, 7)
      g.fillStyle(0xfff6c0, 1) // cœur lumineux
      g.fillRect(7, 3, 3, 4)
      g.generateTexture('lamppost', 16, 32)
      g.destroy()
    }

    // 'barrel' : barrique 14x16 (bois + cerceaux)
    if (!this.textures.exists('barrel')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x8a5a2b, 1)
      g.fillRect(2, 2, 10, 13)
      g.fillStyle(0xa3702f, 1) // reflet
      g.fillRect(4, 2, 2, 13)
      g.fillStyle(0x5e3d1c, 1) // cerceaux
      g.fillRect(2, 4, 10, 1)
      g.fillRect(2, 8, 10, 1)
      g.fillRect(2, 12, 10, 1)
      g.generateTexture('barrel', 14, 16)
      g.destroy()
    }

    // 'crate' : caisse 16x16 (bois + cadre + planche)
    if (!this.textures.exists('crate')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x9a6a35, 1)
      g.fillRect(1, 2, 14, 13)
      g.fillStyle(0x6b4423, 1) // cadre
      g.fillRect(1, 2, 14, 1)
      g.fillRect(1, 14, 14, 1)
      g.fillRect(1, 2, 1, 13)
      g.fillRect(14, 2, 1, 13)
      g.fillRect(1, 8, 14, 1) // planche
      g.generateTexture('crate', 16, 16)
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
    // une série d'anims PAR apparence jouable (préfixe = clé du héros)
    for (const h of HEROES) {
      const key = h.key
      const add = (suffix, indices, frameRate = 8, repeat = -1) => {
        const k = `${key}-${suffix}`
        if (this.anims.exists(k)) return
        this.anims.create({ key: k, frames: this.anims.generateFrameNumbers(key, { frames: indices }), frameRate, repeat })
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
    this.createBossAnimations()
  }

  /**
   * Anims des BOSS DE RAID (sprites dédiés mono-orientation). Une anim par état :
   * idle (boucle), walk (boucle), hit (joué une fois quand le boss encaisse).
   * `rig` = préfixe des clés (boss-<rig>-<state>), nb de frames par feuille.
   */
  createBossAnimations() {
    const rigs = {
      tengublue: { idle: 6, walk: 10, hit: 8 },
      samurai: { idle: 6, walk: 6, hit: 4 },
    }
    for (const [rig, states] of Object.entries(rigs)) {
      for (const [state, count] of Object.entries(states)) {
        const key = `boss-${rig}-${state}`
        if (this.anims.exists(key)) continue
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(`boss_${rig}_${state}`, { start: 0, end: count - 1 }),
          frameRate: state === 'hit' ? 14 : state === 'walk' ? 10 : 6,
          repeat: state === 'hit' ? 0 : -1,
        })
      }
    }
  }

  /**
   * Anim des villageois : mêmes spritesheets 4x7 que le héros (par colonne = direction).
   * Marche directionnelle (frames espacées de 4) + idle (1re frame de chaque direction).
   */
  createNpcAnimations() {
    const dirs = { down: 0, up: 1, left: 2, right: 3 }
    for (const n of ['npc_villager', 'npc_woman', 'npc_boy']) {
      for (const [dir, col] of Object.entries(dirs)) {
        const wk = `${n}-walk-${dir}`
        if (!this.anims.exists(wk)) {
          this.anims.create({
            key: wk,
            frames: this.anims.generateFrameNumbers(n, { frames: [col, col + 4, col + 8, col + 12] }),
            frameRate: 6,
            repeat: -1,
          })
        }
        const idle = `${n}-idle-${dir}`
        if (!this.anims.exists(idle)) {
          this.anims.create({ key: idle, frames: this.anims.generateFrameNumbers(n, { frames: [col] }), frameRate: 1, repeat: 0 })
        }
      }
    }
  }
}
