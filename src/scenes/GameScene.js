import Phaser from 'phaser'
import Player from '../entities/Player.js'
import Monster, { MONSTER_TYPES } from '../entities/Monster.js'
import Projectile from '../entities/Projectile.js'
import Drop from '../entities/Drop.js'
import { ITEMS, cloneItem, RARITY } from '../data/items.js'

const MONSTER_COUNT = 84 // nombre de monstres sur la map
const HOMING_RANGE = 90 // distance max pour qu'une boule "accroche" une créature proche (px)
const EDGE_INSET = 16 // marge intérieure caméra/monde (1 tuile) : empêche de voir le fond hors-map au bord
const MERCHANT_RANGE = 44 // distance pour pouvoir parler au marchand (px)
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
const MAP_W = 160
const MAP_H = 120

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
const MONSTERS_BY_BIOME = {
  prairie: ['lizard', 'lizard', 'racoon'],
  forest: ['lizard', 'racoon', 'racoon'],
  desert: ['racoon', 'mushroom'],
  snow: ['racoon', 'mushroom', 'mushroom'],
  cursed: ['mushroom'],
}

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

// --- eau (TilesetWater / water.png, 28 colonnes) ---
const RIVERS_ENABLED = false // rivières retirées : le tileset d'eau n'a pas de tuile "eau pleine" propre (que des berges)
const WATER_TILE = 201

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

  create() {
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
    map.createLayer(0, tileset, 0, 0).setDepth(-10) // herbe de base
    this.overlay = map.createBlankLayer('overlay', tileset).setDepth(-9) // blobs

    // --- terrain : chemins de terre qui serpentent (pas de gros blobs colorés) ---
    this.painted = new Set() // cellules de sol déjà peintes (évite les superpositions)
    this.pathCells = new Set() // cellules de chemin (pour dégager arbres/rochers)
    this.paintBiomes() // sols des biomes (anneaux) AVANT les chemins
    this.paintPaths()
    this.buildRivers() // rivières-frontières + ponts (après les chemins)

    // --- physique / héros ---
    this.physics.world.setBounds(EDGE_INSET, EDGE_INSET, this.worldW - 2 * EDGE_INSET, this.worldH - 2 * EDGE_INSET)
    this.player = new Player(this, this.worldW / 2, this.worldH / 2)

    // --- décors ---
    this.obstacles = this.physics.add.staticGroup()
    this.trees = []
    this.occupied = new Set()
    this.spawnForest()
    this.spawnBiomeTrees()
    this.spawnRocks()
    this.spawnDecor()
    this.physics.add.collider(this.player, this.obstacles)
    this.physics.add.collider(this.player, this.waterLayer) // l'eau bloque (sauf ponts)

    // --- monstres ---
    this.monsters = this.physics.add.group()
    this.spawnMonsters()
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

    // --- marchand (PNJ près du spawn) ---
    this.spawnMerchant()

    // --- caméra ---
    const cam = this.cameras.main
    cam.setBounds(EDGE_INSET, EDGE_INSET, this.worldW - 2 * EDGE_INSET, this.worldH - 2 * EDGE_INSET)
    // suivi instantané (pas de lerp) : avec l'arrondi pixel, le lissage créait
    // une vibration en diagonale (positions fractionnaires arrondies différemment).
    cam.startFollow(this.player, true)
    cam.setZoom(3)
    cam.setRoundPixels(true)

    // --- entrées combat ---
    this.input.mouse?.disableContextMenu() // le clic droit sert à tirer, pas au menu
    this.input.keyboard.on('keydown-SPACE', () => this.doAttack())
    this.input.keyboard.on('keydown-F', () => this.shootForward())
    this.input.keyboard.on('keydown-E', () => this.tryTalkMerchant())
    this.input.on('pointerdown', (p) => {
      // ignore les clics sur le panneau d'inventaire (géré par UIScene)
      const ui = this.scene.get('UIScene')
      if (ui?.pointerOverInventory?.(p.x, p.y)) return
      if (p.rightButtonDown()) {
        this.fireProjectile(p.worldX, p.worldY, null) // clic droit = tir libre vers le curseur
        return
      }
      this.player.moveTo(p.worldX, p.worldY)
      this.showMoveMarker(p.worldX, p.worldY)
    })

    this.gameOver = false
    // UI dans une scène séparée (non zoomée). Évite le double-lancement au restart.
    if (!this.scene.isActive('UIScene')) this.scene.launch('UIScene')

    // fin de la génération : on rend l'aléatoire réel au gameplay (IA, loot...)
    Math.random = origRandom
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

    this.paintBlob(cells, BLOB.dirt, true) // force : les chemins passent sur les biomes
  }

  /** Peint les sols des biomes en anneaux concentriques (bords ondulés organiques). */
  paintBiomes() {
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const b = this.biomeAt(tx, ty)
        if (b === 'prairie') continue // prairie = herbe de base, rien à peindre
        const fills = BIOME_BLOCKS[b].fills
        const tile = fills[Math.floor(tileNoise(tx, ty, 7) * fills.length)]
        this.overlay.putTileAt(tile, tx, ty)
        this.painted.add(this.key(tx, ty))
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
    const nx = (tx - this.cx) / this.cx
    const ny = (ty - this.cy) / this.cy
    const ang = Math.atan2(ny, nx)
    // ondulation LISSE seulement (pas de bruit par tuile, sinon frontières pixelisées
    // = rivières énormes). Bords organiques mais nets pour des rivières fines.
    const wob = Math.sin(ang * 3) * 0.06 + Math.sin(ang * 5 + 1.3) * 0.04
    const r = Math.hypot(nx, ny) + wob
    if (r < 0.24) return 'prairie' // hub central (sûr)
    if (r < 0.42) return 'forest' // anneau de forêt autour du spawn
    if (r < 0.84) {
      // grande zone intermédiaire : NEIGE en haut, DÉSERT en bas (bord ondulé lisse)
      const split = Math.sin(nx * 4) * 0.08
      return ny < split ? 'snow' : 'desert'
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
    this.waterLayer = wmap.createBlankLayer('water', wmap.addTilesetImage('water'), 0, 0).setDepth(-8)
    if (!RIVERS_ENABLED) return // rivières désactivées : map propre (biomes + déco + chemins)

    // cellules de bord = entre deux biomes différents (des DEUX côtés -> rivière ~2 large)
    for (let ty = 1; ty < MAP_H - 1; ty++) {
      for (let tx = 1; tx < MAP_W - 1; tx++) {
        const b = this.biomeAt(tx, ty)
        if (
          this.biomeAt(tx + 1, ty) !== b ||
          this.biomeAt(tx - 1, ty) !== b ||
          this.biomeAt(tx, ty + 1) !== b ||
          this.biomeAt(tx, ty - 1) !== b
        ) {
          this.waterCells.add(this.key(tx, ty))
        }
      }
    }
    // retirer les cellules de chemin (le chemin en terre fait le gué, marchable)
    for (const k of [...this.waterCells]) {
      const [x, y] = k.split(',').map(Number)
      if (this.onPath(x, y, 1)) this.waterCells.delete(k)
    }
    // rendu : eau pleine cyan (pas d'autotile)
    for (const k of this.waterCells) {
      const [x, y] = k.split(',').map(Number)
      this.waterLayer.putTileAt(WATER_TILE, x, y)
    }
    this.waterLayer.setCollisionByExclusion([-1]) // toute tuile d'eau bloque
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
    for (let g = 0; g < 16; g++) {
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
    for (let i = 0; i < 50; i++) {
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

    for (let c = 0; c < 24; c++) {
      const cx = Phaser.Math.Between(4, MAP_W - 4)
      const cy = Phaser.Math.Between(4, MAP_H - 4)
      const n = Phaser.Math.Between(2, 5)
      for (let i = 0; i < n; i++) {
        place(cx + Phaser.Math.Between(-2, 2), cy + Phaser.Math.Between(-2, 2))
      }
    }
    for (let i = 0; i < 34; i++) {
      place(Phaser.Math.Between(2, MAP_W - 3), Phaser.Math.Between(2, MAP_H - 3))
    }
  }

  /** Déco sans collision : massifs de fleurs serrées + touffes de buissons/herbes. */
  spawnDecor() {
    const place = (tx, ty, pool) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - 2 || ty > MAP_H - 2) return
      if (this.occupied.has(this.key(tx, ty))) return
      if (this.onWater(tx, ty, 1)) return // pas de déco dans une rivière
      const b = this.biomeAt(tx, ty)
      if (b !== 'prairie' && b !== 'forest') return // fleurs/herbes : prairie + forêt
      const px = tx * TILE + 8
      const py = ty * TILE + 8
      this.add.image(px, py, 'nature', Phaser.Utils.Array.GetRandom(pool)).setDepth(py - 4)
    }

    // massifs de fleurs serrées (côte à côte)
    for (let c = 0; c < 16; c++) {
      const cx = Phaser.Math.Between(4, MAP_W - 4)
      const cy = Phaser.Math.Between(4, MAP_H - 4)
      for (let i = 0; i < Phaser.Math.Between(3, 5); i++) {
        place(cx + Phaser.Math.Between(-1, 1), cy + Phaser.Math.Between(-1, 1), FLOWERS)
      }
    }

    // touffes de buissons / herbes hautes
    for (let c = 0; c < 34; c++) {
      const cx = Phaser.Math.Between(3, MAP_W - 3)
      const cy = Phaser.Math.Between(3, MAP_H - 3)
      for (let i = 0; i < Phaser.Math.Between(3, 6); i++) {
        place(cx + Phaser.Math.Between(-2, 2), cy + Phaser.Math.Between(-2, 2), BUSHES)
      }
    }
  }

  // ---------- combat ----------

  spawnMonsters() {
    const types = Object.keys(MONSTER_TYPES)
    const MIN_GAP = 6 // distance mini entre deux monstres (en tuiles)
    const spots = [] // positions déjà occupées par un monstre
    let placed = 0
    let tries = 0
    while (placed < MONSTER_COUNT && tries < MONSTER_COUNT * 60) {
      tries++
      const tx = Phaser.Math.Between(2, MAP_W - 3)
      const ty = Phaser.Math.Between(2, MAP_H - 3)
      if (this.nearSpawn(tx, ty, 8)) continue // pas trop près du joueur
      if (this.occupied.has(this.key(tx, ty))) continue // pas dans un arbre/rocher
      if (this.onWater(tx, ty, 1)) continue // pas dans une rivière
      if (spots.some((s) => this.dist(tx, ty, s.x, s.y) < MIN_GAP)) continue // pas collé à un autre monstre
      const pool = MONSTERS_BY_BIOME[this.biomeAt(tx, ty)] || types
      const type = Phaser.Utils.Array.GetRandom(pool)
      this.monsters.add(new Monster(this, tx * TILE + 8, ty * TILE + 8, type))
      spots.push({ x: tx, y: ty })
      placed++
    }
  }

  /** Place le marchand près du spawn (PNJ statique avec collision) + son indice "E". */
  spawnMerchant() {
    const mx = this.worldW / 2 + 3 * TILE
    const my = this.worldH / 2
    this.merchant = this.add.sprite(mx, my, 'npc_merchant', 0).setDepth(my)
    this.physics.add.existing(this.merchant, true)
    this.merchant.body.setSize(12, 12).setOffset(2, 4)
    this.physics.add.collider(this.player, this.merchant)

    // indice "Parler (E)" affiché quand le héros est proche
    this.merchantHint = this.add
      .text(mx, my - 16, 'Parler (E)', {
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

  /** Ouvre la boutique si le héros est assez proche du marchand. */
  tryTalkMerchant() {
    if (this.gameOver || !this.merchant) return
    if (this.dist(this.player.x, this.player.y, this.merchant.x, this.merchant.y) <= MERCHANT_RANGE) {
      this.scene.get('UIScene').openShop()
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
    const p = this.player
    if (!p.startAttack(this.time.now)) return

    const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing]
    const cx = p.x + dir[0] * 14 // centre de la zone, devant le perso
    const cy = p.y + dir[1] * 14
    const RANGE = 20 // rayon de la zone de frappe (généreux)

    this.showSlash(p.x, p.y, p.facing)

    this.monsters.getChildren().forEach((mon) => {
      if (!mon.active) return
      // touché si le monstre est dans le rayon autour du point devant le perso
      if (Phaser.Math.Distance.Between(cx, cy, mon.x, mon.y) <= RANGE) {
        // recul AVANT les dégâts : takeDamage peut détruire le monstre (body disparaît)
        const a = Math.atan2(mon.y - p.y, mon.x - p.x)
        mon.setVelocity(Math.cos(a) * 150, Math.sin(a) * 150)
        mon.takeDamage(p.attackPower)
      }
    })
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
    this.player.gainXp(mon.def.xp)
    this.spawnDrop(mon)
  }

  /** Fait apparaître un objet ramassable sur le cadavre, selon la table du monstre. */
  spawnDrop(mon) {
    const loot = mon.def.loot
    // équipement (chance + rareté propres au type de monstre), tombe dans le sac
    if (Phaser.Math.Between(1, 100) <= loot.equipChance) {
      this.drops.add(new Drop(this, mon.x, mon.y, 'equip', 0, this.randomEquipment(loot.rarity)))
      return
    }
    // sinon : consommable (or / gemme XP / cœur de soin)
    const roll = Phaser.Math.Between(1, 100)
    let type
    let amount
    if (roll <= 60) {
      type = 'gold'
      amount = Phaser.Math.Between(loot.gold[0], loot.gold[1]) // or selon le type de monstre
    } else if (roll <= 85) {
      type = 'gem'
      amount = Math.ceil(mon.def.xp * 0.5) // XP bonus
    } else {
      type = 'heart'
      amount = Phaser.Math.Between(12, 22) // PV soignés
    }
    this.drops.add(new Drop(this, mon.x, mon.y, type, amount))
  }

  /** Renvoie une COPIE d'un objet d'équipement, rareté tirée selon `weights` {common,rare,epic}. */
  randomEquipment(weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0)
    const total = entries.reduce((s, [, w]) => s + w, 0)
    let roll = Phaser.Math.Between(1, total)
    let chosen = entries[0][0]
    for (const [key, w] of entries) {
      if (roll <= w) {
        chosen = key
        break
      }
      roll -= w
    }
    const pool = Object.values(ITEMS).filter((it) => it.rarity === chosen)
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

  update(time) {
    if (this.gameOver) return
    this.player.update(time)
    const p = this.player
    p.setDepth(p.y)

    this.monsters.getChildren().forEach((mon) => {
      mon.update(time, p)
      mon.setDepth(mon.y)
    })

    if (p.hp <= 0) this.handleDeath()

    // indice du marchand quand on est proche
    this.merchantHint.setVisible(this.dist(p.x, p.y, this.merchant.x, this.merchant.y) <= MERCHANT_RANGE)

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
    this.player.setVelocity(0, 0)
    this.player.setTint(0x555555)
    this.physics.pause()
    // l'UIScene (non zoomée) affiche l'écran de Game Over
    this.events.emit('gameover', this.player.level)
  }
}
