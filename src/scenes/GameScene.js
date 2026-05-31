import Phaser from 'phaser'
import Player from '../entities/Player.js'
import Monster, { MONSTER_TYPES } from '../entities/Monster.js'
import Projectile from '../entities/Projectile.js'
import Drop from '../entities/Drop.js'
import { ITEMS, cloneItem, RARITY } from '../data/items.js'
import { DEFAULT_CHARACTER } from '../data/classes.js'
import { makeSave, writeSave } from '../data/save.js'

const MONSTER_COUNT = 70 // nombre de monstres sur la map
const MONSTER_GAP = 7 // distance mini entre deux monstres au spawn (en tuiles, anti-paquets)
const POND_COUNT = 13 // petits lacs (eau) dans forêt/neige/prairie
const DRY_COUNT = 9 // lacs asséchés (terre craquelée) dans le désert
const HOMING_RANGE = 90 // distance max pour qu'une boule "accroche" une créature proche (px)
const EDGE_INSET = 16 // marge intérieure caméra/monde (1 tuile) : empêche de voir le fond hors-map au bord
const MERCHANT_RANGE = 44 // distance pour pouvoir parler au marchand (px)
const NPC_TALK_RANGE = 60 // distance à laquelle on peut interagir avec un PNJ (px)
const HINT_RANGE = 26 // distance (plus courte) pour AFFICHER l'indice "(E)" -> il faut être collé
const PLAZA_R = 5 // rayon (tuiles) de la place verte du village
const PRAIRIE_TILE_R = 20 // rayon (tuiles) de la prairie centrale = CERCLE net
const WORLD_SEED = 1337 // graine fixe -> la map est TOUJOURS la même (monde persistant)

/** PRNG déterministe (mulberry32) : remplace Math.random pendant la génération du monde. */
function makeSeededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TILE = 16
const MAP_W = 200
const MAP_H = 150

// --- sol (TilesetField / field.png, 5 colonnes) ---
const GRASS = 21 // herbe verte claire = sol de base
// blobs autotile : 3x3 (coins/bords transparents) + fills pleins pour la variété
const BLOB = {
  darkGrass: {
    tl: 30, t: 31, tr: 32,
    l: 35, c: 36, r: 37,
    bl: 40, b: 41, br: 42,
    fills: [36, 33, 34, 38, 39],
  },
  dirt: {
    tl: 0, t: 1, tr: 2,
    l: 5, c: 6, r: 7,
    bl: 10, b: 11, br: 12,
    fills: [6, 3, 4, 8, 9],
  },
  // sable (désert) = même bloc que la terre des chemins
  cursed: {
    tl: 45, t: 46, tr: 47,
    l: 50, c: 51, r: 52,
    bl: 55, b: 56, br: 57,
    fills: [51, 48, 49, 53, 54],
  },
  snow: {
    tl: 60, t: 61, tr: 62,
    l: 65, c: 66, r: 67,
    bl: 70, b: 71, br: 72,
    fills: [66, 63, 64, 68, 69],
  },
}

// biomes en ANNEAUX concentriques autour du spawn (difficulté croissante vers l'extérieur).
const BIOME_BLOCKS = { forest: BLOB.darkGrass, desert: BLOB.dirt, snow: BLOB.snow, cursed: BLOB.cursed }
// monstres par biome : faibles au centre, costauds en s'éloignant
// noms affichés des zones (bandeau quand on change de biome)
const BIOME_NAMES = {
  prairie: 'Village',
  forest: 'Forêt',
  desert: 'Désert',
  snow: 'Terres gelées',
  cursed: 'Terres maudites',
}

const MONSTERS_BY_BIOME = {
  prairie: ['lizard'], // (zone sûre : pas de spawn de toute façon)
  forest: ['lizard', 'racoon', 'mushroom'],
  desert: ['snake', 'spider'],
  snow: ['owl', 'bear'],
  cursed: ['skull', 'spirit', 'flam'],
}

// niveau des monstres = selon la DISTANCE au village (cf. monsterLevelAt) : près de la
// prairie = niveau bas, plus on s'enfonce = plus haut. Le niveau scale PV/dégâts/XP/or.
const LEVEL_PER_TILES = 7 // +1 niveau tous les N tuiles d'éloignement du centre
const SHINY_CHANCE = 5 // % de chance qu'un monstre soit ÉLITE "shiny" (nommé, +fort, +butin)
const TIER_UP = { common: 'rare', rare: 'epic', epic: 'epic' } // élite = un cran de rareté au-dessus
const ELITE_NAMES = ['Kraugg', 'Morvex', 'Sslyth', 'Gorthak', 'Vnira', 'Brakka', 'Zhul', 'Naxxis', 'Ferrok', 'Ombrelle', 'Dargoth', 'Yssrah']

// BOSS DE BIOME (un par zone, repaire FIXE au fond du biome -> "boss de monde" style WoW).
// type = monstre emblématique du biome ; dir = direction du repaire depuis le centre ; dist = tuiles.
const BIOME_BOSSES = {
  forest: { type: 'mushroom', name: 'Gorthak, Gardien de la Forêt', dir: [1, 0], dist: 44 },
  desert: { type: 'spider', name: 'Sslyth, Reine des Sables', dir: [0, 1], dist: 66 },
  snow: { type: 'bear', name: 'Brakka, Colosse des Glaces', dir: [0, -1], dist: 66 },
  cursed: { type: 'flam', name: 'Dargoth, Seigneur des Maudits', dir: [1, 0], dist: 96 },
}
const BOSS_BAR_RANGE = 240 // distance (px) à laquelle la barre de boss apparaît en haut de l'écran

// groupe de décor par biome (les arbres ne doivent pas déborder sur un autre groupe)
const DECOR_GROUP = { prairie: 'green', forest: 'green', snow: 'snow', desert: 'dead', cursed: 'dead' }
const BORDER_MARGIN = 3 // distance mini (tuiles) entre un arbre et la frontière d'un autre groupe

/** Bruit déterministe [0,1) par tuile (varie les sols + bords de biome organiques). */
function tileNoise(x, y, salt = 0) {
  let n = ((x + 1) * 374761393 + (y + 1) * 668265263 + salt * 1442695040) >>> 0
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

// --- éléments du TilesetNature (nature.png, 24 colonnes) ---
const TREE = { tl: 0, tr: 1, bl: 24, br: 25 } // arbre vert (forêt/prairie)
const TREE_SNOW = { tl: 12, tr: 13, bl: 36, br: 37 } // sapin enneigé (neige)
const TREE_DEAD = { tl: 4, tr: 5, bl: 28, br: 29 } // arbre mort (maudit / désert sec)
const ROCKS = [295, 296, 297]
const FLOWERS = [264, 265, 267] // tournesol, fleur, tulipe
const BUSHES = [240, 241, 242, 268, 269, 273] // buissons / herbes hautes

// --- props SPÉCIFIQUES par biome (nature.png) pour différencier les zones ---
const CACTI = [203, 227] // désert : cactus (collision)
const DESERT_SHRUBS = [220, 221] // désert : arbustes secs (sans collision)
const STUMPS = [192, 193, 194, 195, 196, 197] // forêt : souches + troncs couchés (collision)
const FERNS = [268, 269, 271, 272] // forêt : fougères / herbes hautes (sans collision)
const CRYSTALS = [336, 337, 338, 339, 340, 341, 342] // maudites : cristaux + rochers à minerai (collision)
const SNOW_ROCKS = [292, 298, 322, 323] // neige : rochers enneigés / congères (collision)
const SNOW_TUFTS = [320, 321] // neige : herbes givrées (sans collision)

// --- bâtiments (TilesetHouse / house.png, 33 colonnes) : rectangles {col,row,w,h} ---
const HOUSE_COLS = 33
const BUILDINGS = {
  // village (bois, style spawn) — VÉRIFIÉS complets sur fond magenta. door = [dx,dy] de la porte
  cottage: { col: 26, row: 0, w: 3, h: 3, door: [1, 2] }, // orange 2 étages (bois)
  house_orange: { col: 8, row: 0, w: 4, h: 3, door: [1, 2] }, // orange chaume, 1 porte
  house_long: { col: 0, row: 0, w: 4, h: 3, door: [1, 2] }, // orange chaume (variante)
  cabin: { col: 25, row: 7, w: 4, h: 7, door: [1, 6] }, // grande cabane A-frame BOIS (trop grande pour la place)
  // neige — VÉRIFIÉ
  igloo: { col: 0, row: 11, w: 3, h: 3, door: [1, 2] },
}

// --- eau (TilesetWater / water.png, 28 colonnes) ---
const RIVERS_ENABLED = true // rivières avec eau GÉNÉRÉE PAR CODE ('water_gen', 4 variantes)

/**
 * GameScene — Phase 1, "vraie map".
 * Sol herbe + prairies foncées aux bords FONDUS (autotile blob) + clairière de
 * terre au spawn + forêt structurée (lisière dense + bosquets) + rochers en amas
 * + déco groupée. Tronc toujours derrière le perso, feuillage transparent au contact.
 */
export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene')
  }

  create(initData) {
    // personnage choisi (création) ou repris (sauvegarde)
    this.saveData = initData?.save ?? null
    this.character = this.saveData?.character ?? initData?.character ?? DEFAULT_CHARACTER
    this.preview = !!initData?.preview // mode aperçu = fond vivant de l'écran d'accueil (pas de HUD/combat)

    // monde DÉTERMINISTE : pendant toute la génération (terrain, chemins, forêt,
    // rochers, déco, monstres), Math.random est remplacé par un PRNG à graine fixe
    // -> exactement la même map à chaque chargement. Restauré à la fin pour que le
    // gameplay (IA, loot, attaques) reste aléatoire.
    const origRandom = Math.random
    Math.random = makeSeededRandom(WORLD_SEED)

    this.worldW = MAP_W * TILE
    this.worldH = MAP_H * TILE
    this.cx = Math.floor(MAP_W / 2)
    this.cy = Math.floor(MAP_H / 2)

    // --- couches de sol ---
    // fond herbe plein derrière la tilemap : masque les interstices d'1px entre tuiles
    // (seam de rendu au zoom ×3) qui laisseraient sinon voir la couleur de fond gris foncé.
    this.add.rectangle(0, 0, this.worldW, this.worldH, 0xadbc3a).setOrigin(0, 0).setDepth(-11)

    const data = []
    for (let y = 0; y < MAP_H; y++) data.push(new Array(MAP_W).fill(GRASS))
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE })
    const tileset = map.addTilesetImage('field')
    this.groundLayer = map.createLayer(0, tileset, 0, 0).setDepth(-10) // sol (herbe + biomes)
    this.overlay = map.createBlankLayer('overlay', tileset).setDepth(-9) // chemins (par-dessus)

    // --- terrain : chemins de terre qui serpentent (pas de gros blobs colorés) ---
    this.painted = new Set() // cellules de sol déjà peintes (évite les superpositions)
    this.pathCells = new Set() // cellules de chemin (pour dégager arbres/rochers)
    this.paintBiomes() // sols des biomes (anneaux) AVANT les chemins
    this.paintPaths()
    this.buildRivers() // rivières-frontières + ponts + petits lacs (après les chemins)
    this.spawnDryLakes() // lacs asséchés (terre craquelée) dans le désert

    // --- physique / héros ---
    this.physics.world.setBounds(EDGE_INSET, EDGE_INSET, this.worldW - 2 * EDGE_INSET, this.worldH - 2 * EDGE_INSET)
    const spawnX = this.saveData ? this.saveData.x : this.worldW / 2
    const spawnY = this.saveData ? this.saveData.y : this.worldH / 2
    this.player = new Player(this, spawnX, spawnY, { character: this.character, save: this.saveData })

    // --- décors ---
    this.obstacles = this.physics.add.staticGroup()
    this.trees = []
    this.occupied = new Set()
    this.spawnVillage() // village au spawn (avant la forêt : réserve l'emplacement)
    this.spawnForest()
    this.spawnBiomeTrees()
    this.spawnRocks()
    this.spawnDecor()
    this.spawnBiomeProps() // props par biome (cactus, cristaux, souches, congères...)
    this.physics.add.collider(this.player, this.obstacles)
    this.physics.add.collider(this.player, this.waterLayer) // l'eau bloque (sauf ponts)

    // --- monstres ---
    this.monsters = this.physics.add.group()
    this.spawnMonsters()
    this.spawnBosses() // boss de biome (repaires fixes au fond de chaque zone)
    this.physics.add.collider(this.monsters, this.obstacles)
    this.physics.add.collider(this.monsters, this.waterLayer) // monstres bloqués par l'eau
    this.physics.add.collider(this.monsters, this.monsters)
    this.physics.add.overlap(this.player, this.monsters, (pl, mon) => {
      if (mon.tryBite(pl, this.time.now)) this.flashHurt()
    })

    // --- projectiles (attaque à distance) ---
    this.projectiles = this.physics.add.group({ classType: Projectile, runChildUpdate: true })
    this.physics.add.overlap(this.projectiles, this.monsters, (proj, mon) => {
      if (!proj.active || !mon.active) return
      // recul AVANT les dégâts : takeDamage peut détruire le monstre (body disparaît)
      const a = Math.atan2(mon.y - proj.y, mon.x - proj.x)
      mon.setVelocity(Math.cos(a) * 120, Math.sin(a) * 120)
      proj.kill()
      mon.takeDamage(proj.damage)
    })
    // les projectiles s'arrêtent sur le décor
    this.physics.add.collider(this.projectiles, this.obstacles, (proj) => proj.kill())

    // --- objets ramassables (drops) ---
    this.drops = this.physics.add.group()
    this.physics.add.overlap(this.player, this.drops, (pl, drop) => this.collectDrop(drop))

    // --- village : marchand + villageois (props/clôture retirés : assets à revoir) ---
    this.spawnMerchant()
    this.spawnVillagers()

    // --- caméra ---
    const cam = this.cameras.main
    cam.setBounds(EDGE_INSET, EDGE_INSET, this.worldW - 2 * EDGE_INSET, this.worldH - 2 * EDGE_INSET)
    if (this.preview) {
      // aperçu d'accueil : caméra posée sur le village + léger pan cinématique (pas de suivi)
      cam.setZoom(2.8)
      cam.centerOn(this.worldW / 2, this.worldH / 2)
      const bx = cam.scrollX
      const by = cam.scrollY
      this.tweens.add({ targets: cam, scrollX: bx + 22, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
      this.tweens.add({ targets: cam, scrollY: by + 14, duration: 11000, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
      // de temps en temps, dézoom TRÈS lent (vue large du monde) puis retour au village.
      // on s'arrête AVANT les bords : zoom mini = celui qui couvre encore tout l'écran de map
      // (max des deux ratios) + une marge, pour ne jamais laisser apparaître le gris hors-map.
      const fitZoom = Math.max(this.scale.width / this.worldW, this.scale.height / this.worldH) * 1.08
      this.tweens.add({
        targets: cam,
        zoom: fitZoom,
        duration: 13000, // dézoom doux
        hold: 3000, // on reste sur la vue d'ensemble un instant
        yoyo: true, // puis on re-zoome sur le village
        repeat: -1,
        delay: 16000, // gros plan au démarrage
        repeatDelay: 16000, // gros plan entre deux cycles
        ease: 'Sine.inOut',
      })
      cam.setRoundPixels(false) // pan FLUIDE : sinon l'arrondi pixel fait avancer la caméra par à-coups
    } else {
      // suivi instantané (pas de lerp) : avec l'arrondi pixel, le lissage créait
      // une vibration en diagonale (positions fractionnaires arrondies différemment).
      cam.startFollow(this.player, true)
      cam.setZoom(3)
      cam.setRoundPixels(true)
    }

    // --- entrées combat (désactivées en mode aperçu) ---
    if (!this.preview) {
      this.input.mouse?.disableContextMenu() // le clic droit sert à tirer, pas au menu
      this.input.keyboard.on('keydown-SPACE', () => this.doAttack())
      this.input.keyboard.on('keydown-F', () => this.shootForward())
      this.input.keyboard.on('keydown-E', () => this.tryInteract())
      this.input.on('pointerdown', (p) => {
        // ignore les clics quand un panneau plein écran est ouvert (boutique/dialogue)
        if (this.uiBusy()) return
        // ignore les clics sur le panneau d'inventaire (géré par UIScene)
        const ui = this.scene.get('UIScene')
        if (ui?.pointerOverInventory?.(p.x, p.y)) return
        if (p.rightButtonDown()) {
          this.fireProjectile(p.worldX, p.worldY, null) // clic droit = tir libre vers le curseur
          return
        }
        // clic sur un PNJ / le marchand -> aller lui parler (interaction auto en arrivant)
        const target = this.npcAt(p.worldX, p.worldY)
        if (target) {
          this.clickNpc(target)
          return
        }
        this.pendingNpc = null // clic au sol : annule une interaction en attente
        this.player.moveTo(p.worldX, p.worldY)
        this.showMoveMarker(p.worldX, p.worldY)
      })
    }

    this.gameOver = false
    this.pendingNpc = null // interlocuteur cliqué vers lequel on marche (interaction auto en arrivant)
    this.currentBiome = 'prairie' // suivi pour le bandeau de zone
    this.activeBoss = null // boss actuellement engagé (alimente la barre de boss de l'UIScene)
    if (!this.preview) {
      // UI dans une scène séparée (non zoomée). Évite le double-lancement au restart.
      if (!this.scene.isActive('UIScene')) this.scene.launch('UIScene')
      // bandeau de bienvenue (laisse l'UIScene démarrer)
      this.time.delayedCall(600, () => this.scene.get('UIScene')?.showZoneBanner?.(BIOME_NAMES.prairie))
      // sauvegarde automatique périodique (toutes les 30 s)
      this.time.addEvent({ delay: 30000, loop: true, callback: () => this.saveGame() })
    } else {
      this.setupPreview() // village vivant en fond de l'écran d'accueil
    }

    // fin de la génération : on rend l'aléatoire réel au gameplay (IA, loot...)
    Math.random = origRandom
  }

  /** Sauvegarde la partie (personnage + progression + position) dans le navigateur. */
  saveGame() {
    if (this.gameOver || !this.player) return
    writeSave(makeSave(this.player, this.character))
  }

  // ---------- mode aperçu (fond vivant de l'écran d'accueil) ----------

  /** Prépare le village vivant : héros au centre + villageois qui se baladent. */
  setupPreview() {
    this.scene.sendToBack() // rester DERRIÈRE le menu (MenuScene) quel que soit l'ordre de boot

    // héros : pas de physique ni d'input, petite balade autour du centre de la place
    this.player.body.enable = false
    this.player.anims.play(`${this.player.heroKey}-idle-down`, true)
    this._heroW = this.makeWander(this.player, this.player.heroKey, this.player.x, this.player.y, 24, 18)

    // villageois : balade autour de leur maison (les sheets villageois ont des anims de marche)
    for (const npc of this.npcs || []) {
      this.tweens.killTweensOf(npc.sprite) // stoppe la "respiration" (sinon elle écrase l'anim de marche)
      npc.sprite.setScale(1)
      if (npc.sprite.body) npc.sprite.body.enable = false // ne se bloquent pas entre eux (collision gérée à la main)
      npc._w = this.makeWander(npc.sprite, npc.texture, npc.sprite.x, npc.sprite.y, 30, 18 + Math.random() * 10)
    }
    // le marchand reste à son étal (pas d'anim de marche pour sa planche) : juste sa respiration ;
    // on garde SON corps actif -> les villageois ne lui marchent pas dessus.
  }

  /** true si la position (pieds) chevauche un obstacle solide (maison, rocher, props, marchand). */
  previewBlocked(x, y) {
    return this.physics.overlapRect(x - 5, y, 10, 8, false, true).length > 0
  }

  /** Choisit une nouvelle cible LIBRE autour du point d'ancrage (sinon reste sur place). */
  previewRetarget(w, time) {
    w.pauseUntil = time + 600 + Math.random() * 2200
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2
      const r = w.radius * (0.3 + Math.random() * 0.7)
      const tx = w.hx + Math.cos(ang) * r
      const ty = w.hy + Math.sin(ang) * r
      if (!this.previewBlocked(tx, ty)) {
        w.tx = tx
        w.ty = ty
        return
      }
    }
    w.tx = w.sprite.x // aucune case libre trouvée : on ne bouge pas ce tour-ci
    w.ty = w.sprite.y
  }

  makeWander(sprite, texture, hx, hy, radius, speed) {
    return { sprite, texture, hx, hy, tx: hx, ty: hy, facing: 'down', pauseUntil: Math.random() * 1500, radius, speed }
  }

  /** Anime le village d'accueil : chaque PNJ erre, le héros reste au milieu. */
  updatePreview(time, delta) {
    const dt = delta / 1000
    if (this._heroW) this.wanderEntity(this._heroW, time, dt)
    for (const npc of this.npcs || []) {
      if (!npc._w) continue
      this.wanderEntity(npc._w, time, dt)
      if (npc.label) npc.label.setPosition(npc.sprite.x, npc.sprite.y - 14)
    }
  }

  /** IA de balade légère : marche vers une cible LIBRE, pause, recommence (sans traverser le décor). */
  wanderEntity(w, time, dt) {
    const s = w.sprite
    s.setDepth(s.y)
    if (time < w.pauseUntil) {
      s.anims.play(`${w.texture}-idle-${w.facing}`, true)
      return
    }
    const dx = w.tx - s.x
    const dy = w.ty - s.y
    const d = Math.hypot(dx, dy)
    if (d < 2) {
      this.previewRetarget(w, time)
      s.anims.play(`${w.texture}-idle-${w.facing}`, true)
      return
    }
    const step = w.speed * dt
    const nx = s.x + (dx / d) * step
    const ny = s.y + (dy / d) * step
    if (this.previewBlocked(nx, ny)) {
      this.previewRetarget(w, time) // mur devant (maison/rocher) -> on repart ailleurs
      s.anims.play(`${w.texture}-idle-${w.facing}`, true)
      return
    }
    s.x = nx
    s.y = ny
    w.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')
    s.anims.play(`${w.texture}-walk-${w.facing}`, true)
  }

  // ---------- helpers généraux ----------

  key(x, y) {
    return `${x},${y}`
  }

  dist(x, y, ox, oy) {
    return Math.hypot(x - ox, y - oy)
  }

  /** Région "organique" = union de quelques disques autour d'un centre. */
  blobRegion(cx, cy, radius, lobes = 3) {
    const cells = new Set()
    for (let i = 0; i < lobes; i++) {
      const ox = cx + Phaser.Math.Between(-radius, radius)
      const oy = cy + Phaser.Math.Between(-radius, radius)
      const r = Phaser.Math.Between(Math.ceil(radius * 0.5), radius)
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (dx * dx + dy * dy > r * r) continue
          const x = ox + dx
          const y = oy + dy
          if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) cells.add(this.key(x, y))
        }
      }
    }
    return cells
  }

  /** Peint une région avec autotile 3x3 (bords fondus) sur la couche overlay.
   *  `force` = écrase une cellule déjà peinte (utilisé pour que les chemins
   *  passent par-dessus les sols de biome). */
  paintBlob(cells, set, force = false, layer = this.overlay) {
    const has = (x, y) => cells.has(this.key(x, y))
    for (const k of cells) {
      if (!force && this.painted.has(k)) continue
      const [x, y] = k.split(',').map(Number)
      const n = has(x, y - 1)
      const s = has(x, y + 1)
      const w = has(x - 1, y)
      const e = has(x + 1, y)

      let tile
      if (!n && !w) tile = set.tl
      else if (!n && !e) tile = set.tr
      else if (!s && !w) tile = set.bl
      else if (!s && !e) tile = set.br
      else if (!n) tile = set.t
      else if (!s) tile = set.b
      else if (!w) tile = set.l
      else if (!e) tile = set.r
      else tile = Phaser.Utils.Array.GetRandom(set.fills) // intérieur : fill varié

      layer.putTileAt(tile, x, y)
      this.painted.add(k)
    }
  }

  // ---------- génération du sol ----------

  /**
   * Trace des chemins de terre qui RELIENT des points d'intérêt (le spawn au
   * centre + des "lieux" répartis sur la map). Chaque chemin serpente légèrement
   * mais avance toujours vers sa destination -> il mène quelque part. Les lieux
   * sont mémorisés pour y dégager le décor et y poser des amorces (clairières).
   */
  paintPaths() {
    const cells = new Set()
    const carve = (x, y, w) => {
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < w; dy++) {
          const tx = Math.round(x) + dx
          const ty = Math.round(y) + dy
          if (tx > 0 && ty > 0 && tx < MAP_W - 1 && ty < MAP_H - 1) {
            cells.add(this.key(tx, ty))
            this.pathCells.add(this.key(tx, ty))
          }
        }
      }
    }

    // points d'intérêt : le spawn (centre) + 4 lieux répartis (un par "quart")
    this.places = [
      { x: this.cx, y: this.cy }, // spawn
      { x: Math.floor(MAP_W * 0.18), y: Math.floor(MAP_H * 0.22) },
      { x: Math.floor(MAP_W * 0.82), y: Math.floor(MAP_H * 0.2) },
      { x: Math.floor(MAP_W * 0.2), y: Math.floor(MAP_H * 0.8) },
      { x: Math.floor(MAP_W * 0.8), y: Math.floor(MAP_H * 0.78) },
    ]

    // petite clairière de terre à chaque lieu (donne un "but" visible)
    for (const p of this.places) {
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) carve(p.x + dx, p.y + dy, 1)
    }

    // relie le spawn (places[0]) à chacun des autres lieux
    for (let i = 1; i < this.places.length; i++) {
      this.carvePathTo(carve, this.places[0], this.places[i])
    }

    // PAS de chemin dans la prairie : on retire du RENDU les cellules de chemin situées
    // dans la prairie (le joueur la traverse à l'herbe, sort par les ponts). On garde
    // pathCells (pour placer les ponts au bord) -> la prairie reste de l'herbe propre.
    this.plazaCells = new Set() // (plus de place carrée)
    const desertPath = new Set() // chemins en zone désert : à colorer différemment du sable
    for (const k of [...cells]) {
      const [x, y] = k.split(',').map(Number)
      const b = this.biomeAt(x, y)
      if (b === 'prairie') cells.delete(k)
      else if (b === 'desert') desertPath.add(k)
    }
    this.paintBlob(cells, BLOB.dirt, true) // chemins (terre) hors de la prairie
    // désert : le sol EST déjà de la terre/sable -> chemin invisible. On repeint le
    // chemin du désert avec le bloc "terre maudite" (argile rouge) PAR-DESSUS pour
    // qu'il ressorte du sable.
    this.paintBlob(desertPath, BLOB.cursed, true)
  }

  /** Peint les sols des biomes en anneaux concentriques (bords ondulés organiques). */
  paintBiomes() {
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const b = this.biomeAt(tx, ty)
        if (b === 'prairie') continue // prairie = herbe de base, rien à peindre
        const fills = BIOME_BLOCKS[b].fills
        const tile = fills[Math.floor(tileNoise(tx, ty, 7) * fills.length)]
        this.groundLayer.putTileAt(tile, tx, ty) // sol de biome SOUS le chemin
      }
    }
  }

  /** Groupe de décor d'une tuile (green / snow / dead). */
  decorGroup(tx, ty) {
    return DECOR_GROUP[this.biomeAt(tx, ty)]
  }

  /** true si la tuile est au "cœur" de son groupe de déco (loin d'une frontière). */
  isDecorCore(tx, ty, m = BORDER_MARGIN) {
    const g = this.decorGroup(tx, ty)
    return (
      this.decorGroup(tx - m, ty) === g &&
      this.decorGroup(tx + m, ty) === g &&
      this.decorGroup(tx, ty - m) === g &&
      this.decorGroup(tx, ty + m) === g
    )
  }

  /**
   * Biome d'une tuile selon sa distance (elliptique, suit le ratio de la map) au
   * centre -> anneaux concentriques. Ondulation d'angle + bruit = bords organiques.
   */
  biomeAt(tx, ty) {
    const dx = tx - this.cx
    const dy = ty - this.cy
    const dt = Math.hypot(dx, dy) // distance RÉELLE en tuiles -> biomes en cercles concentriques
    if (dt < PRAIRIE_TILE_R) return 'prairie' // cercle net (hub central sûr)
    if (dt < 50) return 'forest' // anneau de forêt
    if (dt < 92) {
      // grande zone intermédiaire : NEIGE en haut, DÉSERT en bas (frontière légèrement ondulée)
      const split = Math.sin(dx / 26) * 4
      return dy < split ? 'snow' : 'desert'
    }
    return 'cursed' // bord extérieur (le plus loin = le plus dur)
  }

  /**
   * Rivières le long des frontières de biomes (eau pleine ~2 tuiles) sur une couche
   * dédiée avec collision. Là où un chemin traverse, le chemin en terre fait le gué.
   * `this.waterCells` = cellules d'eau (bloque déco/spawn de monstres).
   */
  buildRivers() {
    this.waterCells = new Set()
    // couche d'eau (vide si désactivé) pour que les colliders existent toujours
    const wmap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    const wts = wmap.addTilesetImage('water_gen', 'water_gen', TILE, TILE) // eau générée par code
    this.waterLayer = wmap.createBlankLayer('water', wts, 0, 0).setDepth(-8)
    if (!RIVERS_ENABLED) return // rivières désactivées : map propre (biomes + déco + chemins)

    // cellules de bord = entre deux biomes différents (des DEUX côtés -> rivière ~2 large)
    const cursedMoat = new Set() // bord des terres maudites : large + PAS de gué (zone verrouillée)
    const prairieEdge = new Set() // bord de la prairie (zone sûre) : un peu plus large, AVEC gués
    const forestEdge = new Set() // bord forêt <-> neige/désert : élargi (passage vers les terres hostiles)
    for (let ty = 1; ty < MAP_H - 1; ty++) {
      for (let tx = 1; tx < MAP_W - 1; tx++) {
        const b = this.biomeAt(tx, ty)
        const n = [this.biomeAt(tx + 1, ty), this.biomeAt(tx - 1, ty), this.biomeAt(tx, ty + 1), this.biomeAt(tx, ty - 1)]
        if (n.some((nb) => nb !== b)) {
          this.waterCells.add(this.key(tx, ty))
          if (b === 'cursed' || n.includes('cursed')) cursedMoat.add(this.key(tx, ty))
          else if (b === 'prairie' || n.includes('prairie')) prairieEdge.add(this.key(tx, ty))
          else if (
            (b === 'forest' && (n.includes('snow') || n.includes('desert'))) ||
            ((b === 'snow' || b === 'desert') && n.includes('forest'))
          ) {
            forestEdge.add(this.key(tx, ty))
          }
        }
      }
    }
    // dilatation d'un ensemble de cellules d'eau (rayon r en tuiles)
    const widen = (set, r, alsoInto = null) => {
      for (const k of [...set]) {
        const [bx, by] = k.split(',').map(Number)
        for (let dx = -r; dx <= r; dx++) {
          for (let dy = -r; dy <= r; dy++) {
            const x = bx + dx
            const y = by + dy
            if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue
            this.waterCells.add(this.key(x, y))
            if (alsoInto) alsoInto.add(this.key(x, y))
          }
        }
      }
    }
    widen(cursedMoat, 2, cursedMoat) // douve large infranchissable autour des maudites
    widen(prairieEdge, 1) // rivière plus large autour de la prairie (mais gués conservés)
    widen(forestEdge, 1) // rivière plus large entre la forêt et la neige/le désert (gués conservés)
    // proche du moat maudit ? (pour ne pas y poser de pont troué)
    const nearCursed = (x, y) => {
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -2; dy <= 2; dy++) if (cursedMoat.has(this.key(x + dx, y + dy))) return true
      return false
    }
    // gués (pont entier marchable) vs pont en RUINE (chemin dans le moat maudit : reste eau)
    const fords = []
    const ruined = []
    for (const k of [...this.waterCells]) {
      const [x, y] = k.split(',').map(Number)
      if (!this.onPath(x, y, 1)) continue
      if (cursedMoat.has(k)) {
        ruined.push([x, y]) // chemin coupé par le lac maudit -> pont en ruine (infranchissable)
      } else if (!nearCursed(x, y)) {
        this.waterCells.delete(k) // gué normal : devient marchable
        fords.push([x, y])
      }
      // proche du moat (sans y être) : reste eau, pas de pont
    }
    // couche de pont (au-dessus de l'eau)
    const bmap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    const bts = bmap.addTilesetImage('bridge_gen', 'bridge_gen', TILE, TILE)
    this.bridgeLayer = bmap.createBlankLayer('bridge', bts, 0, 0).setDepth(-7)
    for (const [fx, fy] of fords) this.bridgeLayer.putTileAt(0, fx, fy) // ponts entiers
    // pont en ruine vers les terres maudites : ~82% de planches, quelques trous (eau visible)
    for (const [rx, ry] of ruined) {
      if (tileNoise(rx, ry, 5) < 0.82) this.bridgeLayer.putTileAt(0, rx, ry)
    }
    // petits lacs décoratifs (eau) dans forêt / neige / prairie — pas désert ni maudit
    this.spawnPonds()

    // rendu : eau générée (les lacs gelés sont sur la couche de glace, pas ici)
    for (const k of this.waterCells) {
      if (this.iceCells.has(k)) continue // glace = marchable, rendue ailleurs (pas de collision)
      const [x, y] = k.split(',').map(Number)
      this.waterLayer.putTileAt(Math.floor(tileNoise(x, y, 3) * 4), x, y)
    }
    this.waterLayer.setCollisionByExclusion([-1]) // toute tuile d'eau (hors glace) bloque
  }

  /**
   * Petits lacs : eau (forêt/prairie, collision) ou GLACE (neige, marchable).
   * Les cellules vont dans `this.waterCells` (exclusion déco/monstres) ; la glace
   * est listée à part (`this.iceCells`) pour un rendu glace sans collision.
   */
  spawnPonds() {
    this.iceCells = new Set()
    const imap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    this.iceLayer = imap.createBlankLayer('ice', imap.addTilesetImage('ice_gen', 'ice_gen', TILE, TILE), 0, 0).setDepth(-8)
    let placed = 0
    for (let i = 0; i < POND_COUNT * 25 && placed < POND_COUNT; i++) {
      const cx = Phaser.Math.Between(6, MAP_W - 6)
      const cy = Phaser.Math.Between(6, MAP_H - 6)
      const b = this.biomeAt(cx, cy)
      if (b !== 'forest' && b !== 'snow' && b !== 'prairie') continue
      if (this.nearSpawn(cx, cy, 9)) continue
      const cells = this.smallBlob(cx, cy, 3, 5) // petite flaque de 3-5 cases
      let ok = cells.length >= 3
      for (const [x, y] of cells) {
        if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2 || this.nearPath(x, y, 2) || this.waterCells.has(this.key(x, y))) {
          ok = false
          break
        }
      }
      if (!ok) continue
      const ice = b === 'snow'
      for (const [x, y] of cells) {
        this.waterCells.add(this.key(x, y))
        if (ice) {
          this.iceCells.add(this.key(x, y))
          this.iceLayer.putTileAt(Math.floor(tileNoise(x, y, 13) * 4), x, y) // glace (marchable)
        }
      }
      placed++
    }
  }

  /** Lacs asséchés (terre craquelée, marchable) dans le désert sur une couche dédiée. */
  spawnDryLakes() {
    const dmap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    const dts = dmap.addTilesetImage('dry_lake', 'dry_lake', TILE, TILE)
    this.dryLayer = dmap.createBlankLayer('dry', dts, 0, 0).setDepth(-9.5)
    let placed = 0
    for (let i = 0; i < DRY_COUNT * 25 && placed < DRY_COUNT; i++) {
      const cx = Phaser.Math.Between(6, MAP_W - 6)
      const cy = Phaser.Math.Between(6, MAP_H - 6)
      if (this.biomeAt(cx, cy) !== 'desert') continue
      const cells = this.smallBlob(cx, cy, 4, 7) // cuvette asséchée un peu plus large
      let ok = cells.length >= 4
      for (const [x, y] of cells) {
        if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2 || this.nearPath(x, y, 2) || this.onWater(x, y, 1)) {
          ok = false
          break
        }
      }
      if (!ok) continue
      for (const [x, y] of cells) this.dryLayer.putTileAt(Math.floor(tileNoise(x, y, 11) * 4), x, y)
      placed++
    }
  }

  /** Sentier de A vers B : avance vers la cible avec un léger zigzag. */
  carvePathTo(carve, a, b) {
    let x = a.x
    let y = a.y
    let ang = Math.atan2(b.y - a.y, b.x - a.x)
    let guard = 0
    while (this.dist(x, y, b.x, b.y) > 1.5 && guard++ < MAP_W * MAP_H) {
      carve(x, y, 2)
      const toTarget = Math.atan2(b.y - y, b.x - x)
      // se rapproche de la direction de la cible + un peu de bruit (virages doux)
      ang = Phaser.Math.Angle.RotateTo(ang, toTarget, 0.25)
      ang += Phaser.Math.FloatBetween(-0.3, 0.3)
      x += Math.cos(ang)
      y += Math.sin(ang)
    }
    carve(b.x, b.y, 2)
  }

  // ---------- décors ----------

  nearSpawn(tx, ty, r = 5) {
    return Math.abs(tx - this.cx) <= r && Math.abs(ty - this.cy) <= r
  }

  /** true si une des cellules du bloc w×w est un chemin. */
  onPath(tx, ty, w = 1) {
    for (let dx = 0; dx < w; dx++)
      for (let dy = 0; dy < w; dy++)
        if (this.pathCells.has(this.key(tx + dx, ty + dy))) return true
    return false
  }

  /** true si un chemin se trouve à `m` tuiles ou moins de (tx,ty). */
  nearPath(tx, ty, m = 2) {
    for (let dx = -m; dx <= m; dx++)
      for (let dy = -m; dy <= m; dy++)
        if (this.pathCells.has(this.key(tx + dx, ty + dy))) return true
    return false
  }

  /** Petit blob connecté de `min`..`max` cases autour de (cx,cy). */
  smallBlob(cx, cy, min, max) {
    const target = Phaser.Math.Between(min, max)
    const set = new Set([this.key(cx, cy)])
    const list = [[cx, cy]]
    let guard = 0
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    while (list.length < target && guard++ < 50) {
      const [bx, by] = Phaser.Utils.Array.GetRandom(list)
      const d = Phaser.Utils.Array.GetRandom(dirs)
      const k = this.key(bx + d[0], by + d[1])
      if (!set.has(k)) {
        set.add(k)
        list.push([bx + d[0], by + d[1]])
      }
    }
    return list
  }

  /** true si une des cellules du bloc w×w est de l'eau (rivière). */
  onWater(tx, ty, w = 1) {
    for (let dx = 0; dx < w; dx++)
      for (let dy = 0; dy < w; dy++)
        if (this.waterCells.has(this.key(tx + dx, ty + dy))) return true
    return false
  }

  /** Réserve un bloc de w×h cellules si libre ; renvoie true si placé. */
  reserve(tx, ty, w, h) {
    for (let dx = -1; dx <= w; dx++)
      for (let dy = -1; dy <= h; dy++)
        if (this.occupied.has(this.key(tx + dx, ty + dy))) return false
    for (let dx = 0; dx < w; dx++)
      for (let dy = 0; dy < h; dy++) this.occupied.add(this.key(tx + dx, ty + dy))
    return true
  }

  /** Forêt : lisière dense sur les bords + bosquets + quelques arbres épars. */
  spawnForest() {
    const tryTree = (tx, ty) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - 3 || ty > MAP_H - 3) return
      if (this.nearSpawn(tx, ty, 6)) return
      if (this.onPath(tx, ty, 2)) return // pas d'arbre sur un chemin
      if (this.onWater(tx, ty, 2)) return // pas d'arbre dans/sur une rivière
      const b = this.biomeAt(tx, ty)
      if (b !== 'prairie' && b !== 'forest') return // arbres verts : prairie + forêt seulement
      if (!this.isDecorCore(tx, ty)) return // pas collé à une frontière (désert/neige)
      if (this.reserve(tx, ty, 2, 2)) this.addTree(tx, ty)
    }

    // 1) forêt dense : remplit l'anneau de forêt autour de la prairie
    for (let x = 1; x < MAP_W - 2; x += 2) {
      for (let y = 1; y < MAP_H - 2; y += 2) {
        if (this.biomeAt(x, y) === 'forest' && Phaser.Math.Between(0, 100) < 55) tryTree(x, y)
      }
    }

    // 2) bosquets : amas denses d'arbres (surtout prairie/forêt)
    for (let g = 0; g < 22; g++) {
      const gx = Phaser.Math.Between(12, MAP_W - 12)
      const gy = Phaser.Math.Between(12, MAP_H - 12)
      if (this.nearSpawn(gx, gy, 10)) continue
      const r = Phaser.Math.Between(4, 7)
      for (let i = 0; i < 30; i++) {
        const tx = gx + Phaser.Math.Between(-r, r)
        const ty = gy + Phaser.Math.Between(-r, r)
        if (this.dist(tx, ty, gx, gy) <= r) tryTree(tx, ty)
      }
    }

    // 3) quelques arbres isolés (prairie)
    for (let i = 0; i < 70; i++) {
      tryTree(Phaser.Math.Between(2, MAP_W - 4), Phaser.Math.Between(2, MAP_H - 4))
    }
  }

  /** Arbres propres aux biomes : sapins enneigés (neige), arbres morts (maudit + désert sec). */
  spawnBiomeTrees() {
    const place = (tx, ty, frames) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - 3 || ty > MAP_H - 3) return
      if (this.onPath(tx, ty, 2)) return
      if (this.onWater(tx, ty, 2)) return
      if (!this.isDecorCore(tx, ty)) return // pas d'arbre de biome collé à une frontière
      if (this.reserve(tx, ty, 2, 2)) this.addTree(tx, ty, frames)
    }
    for (let x = 1; x < MAP_W - 2; x += 2) {
      for (let y = 1; y < MAP_H - 2; y += 2) {
        const b = this.biomeAt(x, y)
        if (b === 'snow' && Phaser.Math.Between(0, 100) < 24) place(x, y, TREE_SNOW)
        else if (b === 'cursed' && Phaser.Math.Between(0, 100) < 32) place(x, y, TREE_DEAD)
        else if (b === 'desert' && Phaser.Math.Between(0, 100) < 7) place(x, y, TREE_DEAD)
      }
    }
  }

  addTree(tx, ty, frames = TREE) {
    const px = tx * TILE
    const py = ty * TILE
    const baseY = py + 2 * TILE
    const TRUNK_DEPTH = -5 // tronc toujours derrière le perso, jamais devant la tête

    const leaves = []
    this.add.image(px + 8, py + 24, 'nature', frames.bl).setDepth(TRUNK_DEPTH)
    this.add.image(px + 24, py + 24, 'nature', frames.br).setDepth(TRUNK_DEPTH)
    leaves.push(this.add.image(px + 8, py + 8, 'nature', frames.tl).setDepth(baseY))
    leaves.push(this.add.image(px + 24, py + 8, 'nature', frames.tr).setDepth(baseY))

    const trunk = this.add.rectangle(px + TILE, py + TILE + 8, 16, 9)
    this.physics.add.existing(trunk, true)
    this.obstacles.add(trunk)

    this.trees.push({
      leaves,
      bounds: new Phaser.Geom.Rectangle(px, py, 2 * TILE, TILE + 12),
    })
  }

  /** Rochers : surtout en petits amas, un peu en isolé. */
  spawnRocks() {
    const place = (tx, ty) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - 2 || ty > MAP_H - 2) return
      if (this.nearSpawn(tx, ty, 4)) return
      if (this.onPath(tx, ty, 1)) return // pas de rocher sur un chemin
      if (this.onWater(tx, ty, 1)) return // pas de rocher dans une rivière
      if (!this.reserve(tx, ty, 1, 1)) return
      const px = tx * TILE + 8
      const py = ty * TILE + 8
      this.add.image(px, py, 'nature', Phaser.Utils.Array.GetRandom(ROCKS)).setDepth(py)
      const rock = this.add.rectangle(px, py + 2, 13, 10)
      this.physics.add.existing(rock, true)
      this.obstacles.add(rock)
    }

    for (let c = 0; c < 34; c++) {
      const cx = Phaser.Math.Between(4, MAP_W - 4)
      const cy = Phaser.Math.Between(4, MAP_H - 4)
      const n = Phaser.Math.Between(2, 5)
      for (let i = 0; i < n; i++) {
        place(cx + Phaser.Math.Between(-2, 2), cy + Phaser.Math.Between(-2, 2))
      }
    }
    for (let i = 0; i < 48; i++) {
      place(Phaser.Math.Between(2, MAP_W - 3), Phaser.Math.Between(2, MAP_H - 3))
    }
    // pierres ISOLÉES et espacées dans la prairie (décor du village)
    for (let c = 0; c < 14; c++) {
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const r = Phaser.Math.FloatBetween(6, PRAIRIE_TILE_R - 2)
      place(Math.round(this.cx + Math.cos(a) * r), Math.round(this.cy + Math.sin(a) * r))
    }
  }

  /**
   * Props SPÉCIFIQUES par biome : donne une identité à chaque zone (cactus au désert,
   * souches/fougères en forêt, cristaux aux terres maudites, congères en neige).
   */
  spawnBiomeProps() {
    // objet SOLIDE (collision) : cactus, cristal, souche, rocher enneigé
    const solid = (tx, ty, frames) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - 2 || ty > MAP_H - 2) return
      if (this.nearSpawn(tx, ty, 4)) return
      if (this.onPath(tx, ty, 1) || this.onWater(tx, ty, 1)) return
      if (!this.reserve(tx, ty, 1, 1)) return
      const px = tx * TILE + 8
      const py = ty * TILE + 8
      this.add.image(px, py, 'nature', Phaser.Utils.Array.GetRandom(frames)).setDepth(py)
      const rect = this.add.rectangle(px, py + 3, 12, 8)
      this.physics.add.existing(rect, true)
      this.obstacles.add(rect)
    }
    // flore TRAVERSABLE (sans collision) : arbustes secs, fougères, herbes givrées
    const flora = (tx, ty, frames) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - 2 || ty > MAP_H - 2) return
      if (this.occupied.has(this.key(tx, ty))) return
      if (this.onPath(tx, ty, 1) || this.onWater(tx, ty, 1)) return
      this.add.image(tx * TILE + 8, ty * TILE + 8, 'nature', Phaser.Utils.Array.GetRandom(frames)).setDepth(ty * TILE + 4)
    }

    for (let i = 0; i < 520; i++) {
      const tx = Phaser.Math.Between(2, MAP_W - 3)
      const ty = Phaser.Math.Between(2, MAP_H - 3)
      const roll = Phaser.Math.Between(0, 100)
      switch (this.biomeAt(tx, ty)) {
        case 'desert': // cactus + arbustes secs (clairsemé)
          if (roll < 30) solid(tx, ty, CACTI)
          else if (roll < 60) flora(tx, ty, DESERT_SHRUBS)
          break
        case 'forest': // souches/troncs + fougères (sous-bois)
          if (roll < 22) solid(tx, ty, STUMPS)
          else flora(tx, ty, FERNS)
          break
        case 'snow': // congères + herbes givrées
          if (roll < 40) solid(tx, ty, SNOW_ROCKS)
          else if (roll < 75) flora(tx, ty, SNOW_TUFTS)
          break
        case 'cursed': // cristaux + rochers à minerai + arbustes secs
          if (roll < 38) solid(tx, ty, CRYSTALS)
          else if (roll < 58) flora(tx, ty, DESERT_SHRUBS)
          break
      }
    }
  }

  /** Déco sans collision : massifs de fleurs serrées + touffes de buissons/herbes. */
  spawnDecor() {
    // renvoie true si la déco a bien été posée (sinon emplacement refusé)
    const place = (tx, ty, pool) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - 2 || ty > MAP_H - 2) return false
      if (this.occupied.has(this.key(tx, ty))) return false
      if (this.onWater(tx, ty, 1)) return false // pas de déco dans une rivière
      if (this.onPath(tx, ty, 1)) return false // pas de déco sur un chemin / pont
      if (this.plazaCells.has(this.key(tx, ty))) return false // pas de déco sur la place du village
      const b = this.biomeAt(tx, ty)
      if (b !== 'prairie' && b !== 'forest') return false // fleurs/herbes : prairie + forêt
      const px = tx * TILE + 8
      const py = ty * TILE + 8
      this.add.image(px, py, 'nature', Phaser.Utils.Array.GetRandom(pool)).setDepth(py - 4)
      return true
    }

    // herbes : on suit les touffes déjà posées pour qu'au MAX 2 se touchent (groupes de 2)
    const DIRS8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]
    const grass = new Set()
    const grassNeighbors = (tx, ty) => DIRS8.filter(([ax, ay]) => grass.has(this.key(tx + ax, ty + ay)))
    const placeGrass = (tx, ty) => {
      const n = grassNeighbors(tx, ty)
      if (n.length > 1) return // toucherait déjà 2 touffes -> ferait un groupe de 3+
      if (n.length === 1) {
        const [nx, ny] = n[0]
        if (grassNeighbors(nx, ny).length > 0) return // ce voisin est déjà en paire
      }
      if (place(tx, ty, BUSHES)) grass.add(this.key(tx, ty))
    }

    // massifs de fleurs serrées (côte à côte) — les fleurs restent groupées, c'est voulu
    for (let c = 0; c < 24; c++) {
      const cx = Phaser.Math.Between(4, MAP_W - 4)
      const cy = Phaser.Math.Between(4, MAP_H - 4)
      for (let i = 0; i < Phaser.Math.Between(3, 5); i++) {
        place(cx + Phaser.Math.Between(-1, 1), cy + Phaser.Math.Between(-1, 1), FLOWERS)
      }
    }

    // touffes de buissons / herbes hautes (espacées : 2 max collées)
    for (let c = 0; c < 48; c++) {
      const cx = Phaser.Math.Between(3, MAP_W - 3)
      const cy = Phaser.Math.Between(3, MAP_H - 3)
      for (let i = 0; i < Phaser.Math.Between(3, 6); i++) {
        placeGrass(cx + Phaser.Math.Between(-2, 2), cy + Phaser.Math.Between(-2, 2))
      }
    }

    // herbe verte dans la prairie (village) : la verdit, toujours 2 max collées
    for (let c = 0; c < 60; c++) {
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2)
      const r = Phaser.Math.FloatBetween(5, PRAIRIE_TILE_R - 1)
      const tx = Math.round(this.cx + Math.cos(a) * r)
      const ty = Math.round(this.cy + Math.sin(a) * r)
      for (let i = 0; i < Phaser.Math.Between(2, 4); i++) {
        placeGrass(tx + Phaser.Math.Between(-1, 1), ty + Phaser.Math.Between(-1, 1))
      }
    }
  }

  // ---------- combat ----------

  spawnMonsters() {
    for (let i = 0; i < MONSTER_COUNT; i++) this.spawnOneMonster(true)
  }

  /**
   * Place UN monstre à un endroit valide (hors spawn/décor/eau, type selon le biome).
   * `initial` = false pour un respawn -> évite d'apparaître trop près du joueur.
   */
  /** Niveau d'un monstre selon la DISTANCE au village : niv1 au bord de la prairie,
   *  +1 tous les LEVEL_PER_TILES tuiles vers l'extérieur (il faut s'enfoncer pour le haut niveau). */
  monsterLevelAt(tx, ty) {
    const dist = Math.hypot(tx - this.cx, ty - this.cy)
    const lvl = 1 + Math.floor((dist - PRAIRIE_TILE_R) / LEVEL_PER_TILES)
    return Phaser.Math.Clamp(lvl, 1, 18)
  }

  spawnOneMonster(initial = false, near = null, forceElite = null) {
    for (let tries = 0; tries < 80; tries++) {
      // `near` = respawn d'un CAMP : on tire un point autour du lieu de mort (sinon partout)
      const tx = near ? near.tx + Phaser.Math.Between(-near.r, near.r) : Phaser.Math.Between(2, MAP_W - 3)
      const ty = near ? near.ty + Phaser.Math.Between(-near.r, near.r) : Phaser.Math.Between(2, MAP_H - 3)
      if (tx < 2 || ty < 2 || tx > MAP_W - 3 || ty > MAP_H - 3) continue
      if (this.nearSpawn(tx, ty, 8)) continue
      if (this.occupied.has(this.key(tx, ty))) continue
      if (this.onWater(tx, ty, 1)) continue
      const biome = this.biomeAt(tx, ty)
      if (biome === 'prairie') continue // prairie = zone sûre, aucun monstre
      if (!initial && biome === 'cursed' && !near) continue // pas de respawn aléatoire dans la zone verrouillée
      if (near && near.biome && biome !== near.biome) continue // le camp se repeuple dans SON biome
      // pas pile sur le joueur (pop devant lui = moche). Exclusion réduite pour un respawn
      // de camp -> la zone peut se repeupler dès que le joueur s'écarte un peu.
      const pExcl = near ? 6 : 16
      if (!initial && this.dist(tx, ty, this.player.x / TILE, this.player.y / TILE) < pExcl) continue
      // espacement : pas collé à un autre monstre (évite les paquets -> meutes qui poursuivent)
      let tooClose = false
      for (const m of this.monsters.getChildren()) {
        if (m.active && this.dist(tx, ty, m.x / TILE, m.y / TILE) < MONSTER_GAP) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue
      const pool = MONSTERS_BY_BIOME[biome] || Object.keys(MONSTER_TYPES)
      const typeKey = Phaser.Utils.Array.GetRandom(pool)
      // élite : forcée (respawn d'élite) si demandé ; sinon tirage seulement au spawn INITIAL
      // (les respawns normaux ne créent jamais d'élite -> elles restent rares dans le temps)
      const elite = forceElite !== null ? forceElite : initial && Phaser.Math.Between(1, 100) <= SHINY_CHANCE
      const level = this.monsterLevelAt(tx, ty) + (elite ? 2 : 0) // + haut quand on s'enfonce
      const name = elite ? `${Phaser.Utils.Array.GetRandom(ELITE_NAMES)} le ${MONSTER_TYPES[typeKey].name}` : null
      this.monsters.add(new Monster(this, tx * TILE + 8, ty * TILE + 8, typeKey, { level, elite, name }))
      return true
    }
    // le respawn de camp a échoué (joueur qui campe / zone pleine) -> réapparaît ailleurs
    // pour garder la population mondiale constante (en gardant le statut élite demandé)
    if (near) return this.spawnOneMonster(initial, null, forceElite)
    return false
  }

  /** Pose les boss de biome à leurs repaires fixes (un par zone). */
  spawnBosses() {
    this.bosses = []
    for (const biome of Object.keys(BIOME_BOSSES)) this.spawnBoss(biome)
  }

  /** (Re)crée le boss d'un biome à son repaire (tuile fixe, ajustée si occupée/eau). */
  spawnBoss(biome) {
    const cfg = BIOME_BOSSES[biome]
    if (!cfg) return null
    const tile = this.findBossTile(this.cx + cfg.dir[0] * cfg.dist, this.cy + cfg.dir[1] * cfg.dist, biome)
    if (!tile) return null
    const level = Phaser.Math.Clamp(this.monsterLevelAt(tile.tx, tile.ty) + 3, 1, 20)
    const boss = new Monster(this, tile.tx * TILE + 8, tile.ty * TILE + 8, cfg.type, { level, boss: true, name: cfg.name })
    boss.bossBiome = biome
    boss.homeX = tile.tx * TILE + 8 // ancre de patrouille = son repaire
    boss.homeY = tile.ty * TILE + 8
    this.monsters.add(boss)
    this.bosses.push(boss)
    return boss
  }

  /** Cherche une tuile libre (bon biome, hors eau/déco/chemin) en spirale autour de (tx,ty). */
  findBossTile(tx, ty, biome) {
    tx = Math.round(tx)
    ty = Math.round(ty)
    for (let r = 0; r <= 16; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue // périmètre de l'anneau r
          const x = tx + dx
          const y = ty + dy
          if (x < 3 || y < 3 || x > MAP_W - 4 || y > MAP_H - 4) continue
          if (this.biomeAt(x, y) !== biome) continue
          if (this.onWater(x, y, 1) || this.occupied.has(this.key(x, y)) || this.onPath(x, y, 1)) continue
          return { tx: x, ty: y }
        }
      }
    }
    return null
  }

  /** Pose un bâtiment (bloc de tuiles 'house') à (tx,ty) si l'emplacement est libre. */
  placeBuilding(tx, ty, key) {
    const b = BUILDINGS[key]
    // emplacement libre ? (pas chemin / eau / déjà occupé / hors map)
    for (let dx = 0; dx < b.w; dx++) {
      for (let dy = 0; dy < b.h; dy++) {
        const x = tx + dx
        const y = ty + dy
        if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) return null
        if (this.onPath(x, y, 1) || this.onWater(x, y, 1) || this.occupied.has(this.key(x, y))) return null
      }
    }
    // tuiles du bâtiment (tri Y sur la base, comme les arbres)
    const depth = (ty + b.h) * TILE
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const frame = (b.row + dy) * HOUSE_COLS + (b.col + dx)
        this.add.image((tx + dx) * TILE + 8, (ty + dy) * TILE + 8, 'house', frame).setDepth(depth)
      }
    }
    // collision sur la BASE (2 rangées du bas) ; le toit déborde au-dessus (walk-behind)
    const wpx = b.w * TILE
    const collRows = Math.min(2, b.h)
    const top = ty + b.h - collRows
    const rect = this.add.rectangle(tx * TILE + wpx / 2, (top + collRows / 2) * TILE, wpx - 2, collRows * TILE)
    this.physics.add.existing(rect, true)
    this.obstacles.add(rect)
    // empreinte (+1 de marge) occupée : déco/monstres l'évitent
    for (let dx = -1; dx <= b.w; dx++)
      for (let dy = -1; dy <= b.h; dy++) this.occupied.add(this.key(tx + dx, ty + dy))
    return { tx, ty } // position réellement posée (pour aligner le PNJ devant)
  }

  /** Village au spawn : CHAQUE villageois a sa maison, éparpillées dans la prairie
   *  (pour la remplir). Le villageois se tient devant sa porte. + maisons au désert. */
  spawnVillage() {
    const cx = this.cx
    const cy = this.cy
    // plan partagé (maison + PNJ) : positions étalées autour du marchand central
    this.villagers = [
      {
        hx: cx - 1, hy: cy - 6, key: 'cottage', tex: 'npc_villager', name: 'Aldric le Forgeron', role: 'forge',
        lines: [
          'Je suis Aldric, le forgeron. Apporte-moi tes armes et armures.',
          'Je peux les réparer quand elles s\'usent, et les améliorer contre de l\'or.',
        ],
      },
      {
        hx: cx + 5, hy: cy - 2, key: 'house_orange', tex: 'npc_woman', name: 'Mira',
        lines: [
          'Le marchand est au centre du village. Parle-lui avec la touche E.',
          'Appuie sur C pour ouvrir ta fiche : équipe armes et armures dans ton sac.',
          'Les monstres lâchent de l\'or et de l\'équipement, ramasse tout en marchant dessus !',
          'Reviens vendre ton butin au marchand pour t\'acheter mieux.',
        ],
      },
      {
        hx: cx - 8, hy: cy - 2, key: 'house_long', tex: 'npc_boy', name: 'Tom',
        lines: [
          'Franchis les ponts pour sortir de la prairie et explorer le monde !',
          'À l\'est et au sud : la forêt puis le désert. Au nord : les terres gelées.',
          'Plus tu t\'éloignes du village, plus les monstres sont coriaces.',
          'Au-delà du grand lac noir, les terres maudites... personne n\'en revient !',
        ],
      },
    ]
    for (const v of this.villagers) {
      // pose la maison ; si bloquée (chemin invisible/lac), repli en spirale -> garantit l'apparition
      let pos = this.placeBuilding(v.hx, v.hy, v.key)
      for (let r = 1; !pos && r <= 6; r++) {
        for (const [dx, dy] of [[0, -r], [r, 0], [-r, 0], [0, r], [r, -r], [-r, -r], [r, r], [-r, r]]) {
          pos = this.placeBuilding(v.hx + dx, v.hy + dy, v.key)
          if (pos) break
        }
      }
      const b = BUILDINGS[v.key]
      const hx = pos ? pos.tx : v.hx
      const hy = pos ? pos.ty : v.hy
      v.nx = hx + b.door[0] // PNJ devant la porte (même colonne)
      v.ny = hy + b.h // une rangée sous la base de la maison réellement posée
    }
    this.paintVillageGround() // place + chemins reliant les 3 maisons (look "village")
    // hameaux inhabités du désert (bande du bas) : coins OPPOSÉS, loin du centre
    this.placeBuildingNear(cx - 52, cy + 44, 'house_long') // désert sud-ouest
    this.placeBuildingNear(cx + 50, cy + 44, 'house_orange') // désert sud-est
  }

  /** Sol du village : une place (herbe foncée) au centre + des chemins de terre qui
   *  relient chaque porte au centre (où se tient le marchand) -> ambiance "village". */
  paintVillageGround() {
    const cx = this.cx
    const cy = this.cy
    // place centrale (herbe foncée) : ellipse autour du spawn/marchand
    const plaza = new Set()
    for (let dx = -8; dx <= 8; dx++) {
      for (let dy = -5; dy <= 5; dy++) {
        if ((dx * dx) / 64 + (dy * dy) / 25 <= 1) plaza.add(this.key(cx + dx, cy + dy))
      }
    }
    // rabote les "tétons" d'1 tuile (haut/bas) : retire les cellules isolées horizontalement
    for (const k of [...plaza]) {
      const [x, y] = k.split(',').map(Number)
      if (!plaza.has(this.key(x - 1, y)) && !plaza.has(this.key(x + 1, y))) plaza.delete(k)
    }
    // chemins de terre : de chaque porte vers le centre (tracé en L, largeur 2)
    const road = new Set()
    const put = (x, y) => {
      if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) road.add(this.key(x, y))
    }
    const carveLine = (x0, y0, x1, y1) => {
      const sx = Math.sign(x1 - x0) || 1
      for (let x = x0; x !== x1 + sx; x += sx) {
        put(x, y0)
        put(x, y0 + 1) // largeur 2
      }
      const sy = Math.sign(y1 - y0) || 1
      for (let y = y0; y !== y1 + sy; y += sy) {
        put(x1, y)
        put(x1 + 1, y)
      }
    }
    for (const v of this.villagers) carveLine(v.nx, v.ny, cx, cy)

    // place SOUS (couche sol), chemins de terre PAR-DESSUS (couche overlay)
    this.paintBlob(plaza, BLOB.darkGrass, true, this.groundLayer)
    this.paintBlob(road, BLOB.dirt, true)
    // la déco (fleurs/herbes) évite la place et les chemins du village
    this.plazaCells = plaza
    for (const k of road) this.pathCells.add(k)
  }

  /** Animation d'idle "respiration" : léger souffle (le pack n'a pas de frames d'idle). */
  addBreathing(sprite, period = 1100) {
    this.tweens.add({
      targets: sprite,
      scaleY: sprite.scaleY * 1.05,
      scaleX: sprite.scaleX * 0.985,
      duration: period,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })
  }

  /** Place un bâtiment en cherchant un spot libre en spirale autour de (tx,ty). */
  placeBuildingNear(tx, ty, key) {
    if (this.placeBuilding(tx, ty, key)) return true
    for (let r = 1; r <= 10; r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
        if (this.placeBuilding(tx + dx, ty + dy, key)) return true
      }
    }
    return false
  }

  /** Place le marchand près du spawn (PNJ statique avec collision) + son indice "E". */
  spawnMerchant() {
    const mx = this.worldW / 2 + 3 * TILE
    const my = this.worldH / 2
    this.merchant = this.add.sprite(mx, my, 'npc_merchant', 0).setDepth(my)
    this.physics.add.existing(this.merchant, true)
    this.merchant.body.setSize(12, 12).setOffset(2, 4)
    this.physics.add.collider(this.player, this.merchant)

    // nom du marchand au-dessus (ORANGE = personnage important, se démarque des villageois)
    this.add
      .text(mx, my - 14, 'Marchand', { fontFamily: 'monospace', fontSize: '7px', color: '#ff9d3c', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(60000)
      .setResolution(3)
    this.addBreathing(this.merchant, 1300) // idle vivant

    // indice "Parler (E)" affiché quand le héros est proche (au-dessus du nom)
    this.merchantHint = this.add
      .text(mx, my - 24, 'Parler (E)', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 3, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(60000)
      .setResolution(3) // net malgré le zoom caméra x3
      .setVisible(false)
  }

  /** true si un panneau plein écran de l'UI est ouvert (boutique/dialogue) -> on gèle les actions monde. */
  uiBusy() {
    const ui = this.scene.get('UIScene')
    return !!(ui && (ui.dialogueOpen || ui.shopOpen || ui.forgeOpen || ui.pauseOpen))
  }

  /** Touche E : parle au marchand (boutique) ou au villageois le plus proche. */
  tryInteract() {
    if (this.gameOver || this.uiBusy()) return
    const p = this.player
    if (this.merchant && this.dist(p.x, p.y, this.merchant.x, this.merchant.y) <= MERCHANT_RANGE) {
      this.interactWith(this.merchant)
      return
    }
    // villageois le plus proche à portée
    let best = null
    let bestD = NPC_TALK_RANGE
    for (const npc of this.npcs || []) {
      const d = this.dist(p.x, p.y, npc.x, npc.y)
      if (d <= bestD) {
        bestD = d
        best = npc
      }
    }
    if (best) this.interactWith(best)
  }

  /**
   * Villageois style WoW : IMMOBILE, avec son NOM affiché au-dessus, et CLIQUABLE.
   * Clic dessus (ou touche E si proche) -> ouvre une vraie fenêtre de dialogue (UIScene).
   */
  addNpc(tx, ty, texture, name, lines, role = 'talk') {
    const x = tx * TILE + 8
    const y = ty * TILE + 8
    const sprite = this.add.sprite(x, y, texture, 0).setDepth(y)
    this.physics.add.existing(sprite, true) // corps STATIQUE (il ne bouge pas)
    sprite.body.setSize(12, 12).setOffset(2, 4)
    this.physics.add.collider(this.player, sprite)
    sprite.anims.play(`${texture}-idle-down`, true)

    // étiquette de nom au-dessus (toujours visible) ; orange = PNJ de service (forgeron)
    const label = this.add
      .text(x, y - 14, name, { fontFamily: 'monospace', fontSize: '7px', color: role === 'forge' ? '#ff9d3c' : '#ffe066', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(60000)
      .setResolution(3)

    // indice d'interaction (caché ; visible quand le héros est proche)
    const hintTxt = role === 'forge' ? 'Forger (E)' : 'Parler (E)'
    const hint = this.add
      .text(x, y - 23, hintTxt, { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } })
      .setOrigin(0.5, 1)
      .setDepth(60001)
      .setResolution(3)
      .setVisible(false)

    this.addBreathing(sprite, 1000 + this.npcs.length * 160) // idle vivant (souffle désynchronisé)

    const npc = { sprite, x, y, texture, name, lines, facing: 'down', label, role, hint }
    this.occupied.add(this.key(tx, ty))
    this.npcs.push(npc)

    sprite.setInteractive({ useHandCursor: true }) // curseur "main" (clic géré globalement)
    return npc
  }

  /** PNJ/marchand cliqué (sous le curseur monde), sinon null. */
  npcAt(wx, wy) {
    const R = 12 // rayon de clic (px)
    if (this.merchant && this.dist(wx, wy, this.merchant.x, this.merchant.y) <= R) return this.merchant
    for (const npc of this.npcs || []) {
      if (this.dist(wx, wy, npc.x, npc.y) <= R) return npc
    }
    return null
  }

  /** Clic sur un interlocuteur : interagit si proche, sinon marche vers lui (et interagit en arrivant). */
  clickNpc(t) {
    if (this.dist(this.player.x, this.player.y, t.x, t.y) <= NPC_TALK_RANGE) {
      this.interactWith(t)
    } else {
      this.pendingNpc = t // on interagira automatiquement une fois arrivé
      this.player.moveTo(t.x, t.y + 10)
      this.showMoveMarker(t.x, t.y + 10)
    }
  }

  /** Ouvre le bon panneau selon l'interlocuteur (marchand / forgeron / villageois). */
  interactWith(t) {
    if (this.uiBusy()) return
    const ui = this.scene.get('UIScene')
    if (t === this.merchant) ui.openShop()
    else if (t.role === 'forge') ui.openForge()
    else ui.openDialogue(t.name, t.lines, t.texture)
  }

  /** Oriente les villageois vers le héros à portée + affiche l'indice "(E)" de proximité.
   *  Gère aussi l'interaction AUTO quand on a cliqué un PNJ et qu'on vient d'arriver. */
  updateNpcs() {
    const p = this.player
    for (const npc of this.npcs || []) {
      const s = npc.sprite
      const near = this.dist(p.x, p.y, s.x, s.y)
      let dir = 'down'
      if (near <= NPC_TALK_RANGE + 20) {
        const dx = p.x - s.x
        const dy = p.y - s.y
        dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')
      }
      if (dir !== npc.facing) {
        npc.facing = dir
        s.anims.play(`${npc.texture}-idle-${dir}`, true)
      }
      npc.hint.setVisible(near <= HINT_RANGE) // indice "(E)" seulement quand on est collé
    }

    // interaction AUTO : on a cliqué un interlocuteur, on l'a rejoint -> on ouvre le panneau
    if (this.pendingNpc) {
      const t = this.pendingNpc
      if (this.dist(p.x, p.y, t.x, t.y) <= NPC_TALK_RANGE) {
        this.pendingNpc = null
        this.interactWith(t)
      }
    }
  }

  /** Notifie la casse d'un équipement (durabilité 0) via un toast de l'UI. */
  notifyBreak(item) {
    this.scene.get('UIScene')?.showToast?.(`${item.name} cassé ! (réparer chez Aldric)`, '#e06666')
  }

  /** Décorations du village : lampadaires, barriques, caisses, fleurs (spots libres). */
  spawnVillageDecor() {
    const cx = this.cx
    const cy = this.cy
    const free = (tx, ty) =>
      tx > 1 && ty > 1 && tx < MAP_W - 1 && ty < MAP_H - 1 && !this.occupied.has(this.key(tx, ty)) && !this.onPath(tx, ty, 1) && !this.onWater(tx, ty, 1)
    const prop = (tx, ty, key, tall = false) => {
      if (!free(tx, ty) || (tall && !free(tx, ty - 1))) return
      const x = tx * TILE + 8
      const img = tall ? this.add.image(x, (ty + 1) * TILE, key) : this.add.image(x, ty * TILE + 12, key)
      img.setOrigin(0.5, 1).setDepth(ty * TILE + 12)
      const rect = this.add.rectangle(x, ty * TILE + 12, 12, 7)
      this.physics.add.existing(rect, true)
      this.obstacles.add(rect)
      this.occupied.add(this.key(tx, ty))
    }
    const flower = (tx, ty) => {
      if (!free(tx, ty)) return
      this.add.image(tx * TILE + 8, ty * TILE + 8, 'nature', Phaser.Utils.Array.GetRandom(FLOWERS)).setDepth(ty * TILE + 4)
      this.occupied.add(this.key(tx, ty))
    }
    // lampadaires (vers les coins, flanquent les zones)
    for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 3], [3, -1]]) prop(cx + dx, cy + dy, 'lamppost', true)
    // barriques / caisses près des maisons
    for (const [dx, dy, k] of [[4, -4, 'barrel'], [-4, -3, 'crate'], [2, 4, 'barrel'], [-3, -4, 'crate'], [4, 3, 'barrel']]) prop(cx + dx, cy + dy, k)
    // fleurs en touffes
    for (const [dx, dy] of [[-4, -4], [4, -2], [-2, 4], [3, 4], [-4, 2], [2, -4]]) flower(cx + dx, cy + dy)
  }

  /** Feu de camp central (élément focal de la place, avec collision). */
  spawnCampfire() {
    const tx = this.cx
    const ty = this.cy - 2 // au nord du spawn, bien visible
    this.add.image(tx * TILE + 8, ty * TILE + 8, 'campfire').setDepth((ty + 1) * TILE)
    const rect = this.add.rectangle(tx * TILE + 8, ty * TILE + 12, 14, 8)
    this.physics.add.existing(rect, true)
    this.obstacles.add(rect)
    this.occupied.add(this.key(tx, ty))
  }

  /** Clôture en bois autour de la place (juste à l'extérieur), avec entrées aux chemins. */
  buildFence() {
    const R = PLAZA_R + 1 // un cran à l'extérieur de la place verte
    const cx = this.cx
    const cy = this.cy
    const add = (tx, ty, key) => {
      if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return
      if (this.onPath(tx, ty, 1) || this.onWater(tx, ty, 1) || this.occupied.has(this.key(tx, ty))) return // gap aux entrées
      this.add.image(tx * TILE + 8, ty * TILE + 8, key).setDepth(ty * TILE)
      const rect = this.add.rectangle(tx * TILE + 8, ty * TILE + 10, 14, 8)
      this.physics.add.existing(rect, true)
      this.obstacles.add(rect)
      this.occupied.add(this.key(tx, ty))
    }
    for (let dx = -R; dx <= R; dx++) {
      add(cx + dx, cy - R, 'fence_h') // haut
      add(cx + dx, cy + R, 'fence_h') // bas
    }
    for (let dy = -R + 1; dy <= R - 1; dy++) {
      add(cx - R, cy + dy, 'fence_v') // gauche
      add(cx + R, cy + dy, 'fence_v') // droite
    }
  }

  /** Villageois du spawn : immobiles, nommés, chacun devant SA maison (cf. spawnVillage). */
  spawnVillagers() {
    this.npcs = []
    for (const v of this.villagers || []) {
      this.addNpc(v.nx, v.ny, v.tex, v.name, v.lines, v.role ?? 'talk')
    }
  }

  /** Marqueur visuel à l'endroit cliqué (anneau qui se rétracte puis disparaît). */
  showMoveMarker(x, y) {
    if (this.moveMarker) this.moveMarker.destroy()
    const ring = this.add.circle(x, y, 6, 0xffffff, 0)
    ring.setStrokeStyle(2, 0xffe066, 0.9)
    ring.setDepth(y) // suit le tri Y comme le reste
    this.moveMarker = ring
    this.tweens.add({
      targets: ring,
      scale: { from: 1.4, to: 0.5 },
      alpha: { from: 1, to: 0 },
      duration: 500,
      onComplete: () => {
        ring.destroy()
        if (this.moveMarker === ring) this.moveMarker = null
      },
    })
  }

  /** Coup d'épée : arc devant le héros, dégâts aux monstres dans la zone. */
  doAttack() {
    if (this.uiBusy()) return
    const p = this.player
    if (!p.startAttack(this.time.now)) return

    const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing]
    const cx = p.x + dir[0] * 14 // centre de la zone, devant le perso
    const cy = p.y + dir[1] * 14
    const RANGE = 20 // rayon de la zone de frappe (généreux)

    this.showSlash(p.x, p.y, p.facing)

    let hitAny = false
    this.monsters.getChildren().forEach((mon) => {
      if (!mon.active) return
      // touché si le monstre est dans le rayon autour du point devant le perso
      if (Phaser.Math.Distance.Between(cx, cy, mon.x, mon.y) <= RANGE) {
        hitAny = true
        // recul AVANT les dégâts : takeDamage peut détruire le monstre (body disparaît)
        const a = Math.atan2(mon.y - p.y, mon.x - p.x)
        mon.setVelocity(Math.cos(a) * 150, Math.sin(a) * 150)
        mon.takeDamage(p.attackPower)
      }
    })
    // l'arme s'use quand le coup porte ; casse à 0 -> notif
    if (hitAny) {
      const broke = p.wearSlot('weapon')
      if (broke) this.notifyBreak(broke)
    }
  }

  /** Monstre actif le plus proche de (x,y) dans `radius`, sinon null. */
  nearestMonster(x, y, radius) {
    let best = null
    let bestD = radius
    this.monsters.getChildren().forEach((m) => {
      if (!m.active) return
      const d = Phaser.Math.Distance.Between(x, y, m.x, m.y)
      if (d < bestD) {
        bestD = d
        best = m
      }
    })
    return best
  }

  /**
   * F : tir dans la direction du héros. Si une créature est proche (HOMING_RANGE),
   * la boule la prend pour cible et la suit jusqu'au contact.
   */
  shootForward() {
    if (this.uiBusy()) return
    const p = this.player
    const target = this.nearestMonster(p.x, p.y, HOMING_RANGE)
    if (target) {
      this.fireProjectile(target.x, target.y, target)
    } else {
      const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing]
      this.fireProjectile(p.x + dir[0] * 120, p.y + dir[1] * 120, null)
    }
  }

  /**
   * Lance une boule d'énergie du héros vers (tx,ty). Si `target` est fourni, la
   * boule suit ce monstre (homing). Oriente le héros vers le tir et respecte le cooldown.
   */
  fireProjectile(tx, ty, target) {
    const p = this.player
    if (p.attacking || p.hp <= 0) return
    if (!p.startShoot(this.time.now)) return

    const dx = tx - p.x
    const dy = ty - p.y
    if (Math.abs(dx) > Math.abs(dy)) p.facing = dx < 0 ? 'left' : 'right'
    else p.facing = dy < 0 ? 'up' : 'down'

    const proj = this.projectiles.get(p.x, p.y)
    if (!proj) return
    proj.fire(p.x, p.y, tx, ty, p.attackPower, this.time.now, target)
  }

  /** Petit éclair blanc en arc pour matérialiser le coup d'épée. */
  showSlash(x, y, facing) {
    const ang = { down: 90, up: -90, left: 180, right: 0 }[facing]
    const g = this.add.graphics().setDepth(y + 50)
    g.lineStyle(2, 0xffffff, 0.9)
    const base = Phaser.Math.DegToRad(ang)
    g.beginPath()
    g.arc(x, y, 16, base - 0.7, base + 0.7)
    g.strokePath()
    this.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() })
  }

  onMonsterKilled(mon) {
    this.player.gainXp(mon.xpReward ?? mon.def.xp)
    if (mon.isBoss) {
      this.onBossKilled(mon)
      return
    }
    this.spawnDrop(mon)
    // respawn de CAMP : le monstre réapparaît dans SON biome, près de là où il est mort
    // (la zone se repeuple comme dans un MMORPG ; fallback ailleurs si l'endroit est pris).
    const near = {
      tx: Math.round(mon.x / TILE),
      ty: Math.round(mon.y / TILE),
      biome: this.biomeAt(Math.round(mon.x / TILE), Math.round(mon.y / TILE)),
      r: 9,
    }
    if (mon.elite) {
      // une ÉLITE tuée ne revient que ~10 min plus tard (rare), et revient en élite
      this.time.delayedCall(Phaser.Math.Between(540000, 660000), () => {
        if (!this.gameOver) this.spawnOneMonster(false, near, true)
      })
    } else {
      // monstre normal : repop rapide du camp (6-11 s), jamais en élite
      this.time.delayedCall(Phaser.Math.Between(6000, 11000), () => {
        if (!this.gameOver) this.spawnOneMonster(false, near, false)
      })
    }
  }

  /** Mort d'un BOSS de biome : butin garanti (épique + or + soin), annonce, respawn long. */
  onBossKilled(mon) {
    const i = this.bosses.indexOf(mon)
    if (i >= 0) this.bosses.splice(i, 1)
    if (this.activeBoss === mon) this.activeBoss = null

    // butin GARANTI : 2 équipements épiques + gros tas d'or + un gros soin
    this.drops.add(new Drop(this, mon.x - 12, mon.y, 'equip', 0, this.equipmentOfTier('epic')))
    this.drops.add(new Drop(this, mon.x + 12, mon.y, 'equip', 0, this.equipmentOfTier('epic')))
    const gold = Phaser.Math.Between(120, 240) + mon.level * 20
    this.drops.add(new Drop(this, mon.x, mon.y + 10, 'gold', gold))
    this.drops.add(new Drop(this, mon.x, mon.y - 10, 'heart', Math.max(20, Math.round(this.player.maxHp * 0.5))))

    // annonce + respawn long (boss de monde : ~8-10 min)
    this.scene.get('UIScene')?.showToast?.(`⚔ ${mon.displayName} vaincu !`, '#ffd86b')
    const biome = mon.bossBiome
    this.time.delayedCall(Phaser.Math.Between(480000, 600000), () => {
      if (!this.gameOver) this.spawnBoss(biome)
    })
  }

  /** Fait apparaître un objet ramassable sur le cadavre, selon la table du monstre. */
  spawnDrop(mon) {
    const loot = mon.def.loot
    const lvlMul = mon.lvlMul ?? 1
    // BUTIN DÉTERMINISTE (pas de hasard de rareté) : chaque type lâche un équipement de SA
    // rareté fixe (lézard=commun, etc.). L'élite monte d'un cran de rareté.
    const tier = mon.elite ? TIER_UP[mon.def.tier] : mon.def.tier
    this.drops.add(new Drop(this, mon.x, mon.y, 'equip', 0, this.equipmentOfTier(tier)))
    // + de l'or (montant selon le niveau ; élite = ×3)
    const g = Math.max(1, Math.round(Phaser.Math.Between(loot.gold[0], loot.gold[1]) * lvlMul * (mon.elite ? 3 : 1)))
    this.drops.add(new Drop(this, mon.x + 6, mon.y + 4, 'gold', g))
  }

  /** Renvoie une COPIE d'un objet d'équipement de la rareté `tier` (commun/rare/épique). */
  equipmentOfTier(tier) {
    let pool = Object.values(ITEMS).filter((it) => it.rarity === tier)
    if (pool.length === 0) pool = Object.values(ITEMS) // garde-fou si la rareté n'existe pas
    return cloneItem(Phaser.Utils.Array.GetRandom(pool))
  }

  /** Applique l'effet d'un drop ramassé + texte flottant, puis le retire. */
  collectDrop(drop) {
    if (!drop.collect()) return // déjà ramassé/expiré
    const p = this.player
    let text
    let color
    if (drop.type === 'gold') {
      p.gold += drop.amount
      text = `+${drop.amount} or`
      color = '#ffe066'
    } else if (drop.type === 'gem') {
      p.gainXp(drop.amount)
      text = `+${drop.amount} XP`
      color = '#9beaf5'
    } else if (drop.type === 'heart') {
      const healed = p.heal(drop.amount)
      if (healed <= 0) return // PV déjà au max : pas de texte trompeur
      text = `+${healed} PV`
      color = '#ff8088'
    } else if (drop.type === 'equip') {
      p.addItem(drop.item)
      text = drop.item.name
      color = RARITY[drop.item.rarity]?.color ?? '#9be1ff'
      this.scene.get('UIScene')?.showItemToast?.('Obtenu', drop.item) // toast HUD lisible
    }
    this.floatingText(drop.x, drop.y, text, color)
  }

  /** Petit texte qui monte et s'efface (ramassage, soin...). */
  floatingText(x, y, text, color) {
    const t = this.add
      .text(x, y - 8, text, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20000)
    this.tweens.add({ targets: t, y: t.y - 14, alpha: 0, duration: 800, onComplete: () => t.destroy() })
  }

  onLevelUp() {
    const p = this.player
    const t = this.add
      .text(p.x, p.y - 18, 'NIVEAU ' + p.level + ' !', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffe066',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20000)
    this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, duration: 900, onComplete: () => t.destroy() })
    this.saveGame() // sauvegarde à chaque montée de niveau
  }

  /** Retour visuel quand le héros encaisse : léger flash rouge sur les bords + shake doux. */
  flashHurt() {
    this.cameras.main.shake(90, 0.004)
    const r = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0xff0000, 0.18)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(25000)
    this.tweens.add({ targets: r, alpha: 0, duration: 200, onComplete: () => r.destroy() })
  }

  update(time, delta) {
    if (this.preview) {
      this.updatePreview(time, delta)
      return
    }
    if (this.gameOver) return
    this.player.update(time)
    const p = this.player
    p.setDepth(p.y)

    this.monsters.getChildren().forEach((mon) => {
      mon.update(time, p)
      mon.setDepth(mon.y)
    })

    // barre de boss : on suit le boss engagé (en aggro, ou simplement proche du joueur)
    let engagedBoss = null
    for (const b of this.bosses || []) {
      if (b.active && (b.aggroed || this.dist(p.x, p.y, b.x, b.y) < BOSS_BAR_RANGE)) {
        engagedBoss = b
        break
      }
    }
    this.activeBoss = engagedBoss

    if (p.hp <= 0) this.handleDeath()

    // bandeau de zone quand le héros change de biome
    const biome = this.biomeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE))
    if (biome !== this.currentBiome) {
      this.currentBiome = biome
      this.scene.get('UIScene')?.showZoneBanner?.(BIOME_NAMES[biome])
    }

    this.updateNpcs(time) // villageois qui se baladent

    // indice "Parler (E)" du marchand quand on est proche (les villageois parlent tout seuls)
    this.merchantHint.setVisible(this.dist(p.x, p.y, this.merchant.x, this.merchant.y) <= HINT_RANGE)

    const body = new Phaser.Geom.Rectangle(p.x - 6, p.y - 14, 12, 20)
    for (const tree of this.trees) {
      const touching = Phaser.Geom.Rectangle.Overlaps(tree.bounds, body)
      const target = touching ? 0.5 : 1
      for (const leaf of tree.leaves) {
        leaf.alpha = Phaser.Math.Linear(leaf.alpha, target, 0.2)
      }
    }
  }

  handleDeath() {
    this.gameOver = true
    this.activeBoss = null // cache la barre de boss
    this.player.setVelocity(0, 0)
    this.player.setTint(0x555555)
    this.physics.pause()
    // l'UIScene (non zoomée) affiche l'écran de Game Over
    this.events.emit('gameover', this.player.level)
  }
}
