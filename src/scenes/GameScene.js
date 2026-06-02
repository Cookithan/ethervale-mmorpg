import Phaser from 'phaser'
import Player from '../entities/Player.js'
import Monster, { MONSTER_TYPES } from '../entities/Monster.js'
import Projectile from '../entities/Projectile.js'
import Drop from '../entities/Drop.js'
import { ITEMS, cloneItem, RARITY } from '../data/items.js'
import { DEFAULT_CHARACTER } from '../data/classes.js'
import { makeSave, writeSave } from '../data/save.js'
import { Audio, SFX } from '../data/sound.js'

const MONSTER_COUNT = 110 // nombre de monstres sur la map (répartis ISOLÉS, couverture uniforme)
const MONSTER_GAP = 6 // distance mini entre deux monstres au spawn (en tuiles) -> répartition régulière
// Budget de mobs par biome proportionnel à sa surface jouable (aucune zone vide/surchargée),
// puis placés en ISOLÉS bien espacés (pas de camps -> pas de zones vides, élites jamais en nid).
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
// grille TOTALE agrandie : le continent est une ÎLE elliptique CENTRÉE, entourée d'OCÉAN de
// tous les côtés (marges nettes à gauche/droite ET haut/bas). Cf. isOcean/buildOcean.
// Grille agrandie de +50% par dimension (360x220 -> 540x330) : le continent (ISLAND_RX/RY FIXE) reste
// centré sur icx/icy et de même taille -> tout le surplus de grille devient de l'OCÉAN autour.
const MAP_W = 540
const MAP_H = 330
const ISLAND_RX = 96 // demi-largeur du continent (tuiles) -> marge océan gauche/droite = icx - RX
const ISLAND_RY = 82 // demi-hauteur du continent (tuiles) -> marge océan haut/bas = icy - RY
const OCEAN_BG = 0x3f8ed0 // couleur de fond (océan) : marges hors-map au dézoom + raccord avec l'eau générée

// --- sol (TilesetField / field.png, 5 colonnes) ---
const GRASS = 21 // herbe verte claire = sol de base
const WATER_TINT = 0x5f7fc0 // teinte MULTIPLY de l'eau Sprout -> bleu océan FONCÉ
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

// musique de fond par zone (clé chargée dans BootScene) ; un boss engagé prend le dessus
const MUSIC_BY_BIOME = {
  prairie: 'mus_village',
  forest: 'mus_forest',
  desert: 'mus_desert',
  snow: 'mus_snow',
  cursed: 'mus_cursed',
}

// musique de combat de boss : on tire l'un des 3 au hasard à chaque combat
const BOSS_MUSIC = ['mus_boss1', 'mus_boss2', 'mus_boss3']

// sons des sorts/projectiles magiques par ÉLÉMENT (incantation / tir / impact + detune optionnel).
// L'élément vient de l'APPARENCE du héros (cf. SPELL_ELEMENT_BY_HERO) : feu / lumière (blanc) /
// ombre (violet) / arcane (défaut, ex. Soigneur). detune permet de teinter un même son (grave=ombre…).
const SPELL_SFX = {
  fire: { cast: 'sfx_el_fire', proj: 'sfx_el_fireball', impact: 'sfx_el_explosion' },
  light: { cast: 'sfx_magic2', proj: 'sfx_magic1', impact: 'sfx_magic5', castDetune: 250, projDetune: 200, impactDetune: 300 },
  // ombre : tir = magie sombre ; explosion du Météore = son "esprit" + boom d'explosion (feu) superposés
  shadow: { cast: 'sfx_strange', proj: 'sfx_magic1', impact: 'sfx_spirit', impactExtra: 'sfx_el_explosion', projDetune: -250 },
  arcane: { cast: 'sfx_magic1', proj: 'sfx_launch', impact: 'sfx_magic5' },
}
const SPELL_ELEMENT_BY_HERO = { hero_flam: 'fire', hero_spirit: 'light', hero_mage_black: 'shadow' }

const MONSTERS_BY_BIOME = {
  prairie: ['lizard'], // (zone sûre : pas de spawn de toute façon)
  forest: ['lizard', 'racoon', 'mushroom'],
  desert: ['snake', 'spider'],
  snow: ['owl', 'bear'],
  cursed: ['skull', 'spirit', 'flam'],
}

// MONDE type CONTINENT en ZONES (façon WoW) : le continent est un PATCHWORK de zones de biome
// (forêt/neige/désert) défini par Voronoi sur des graines (cf. this.zoneSeeds dans create), avec des
// frontières déformées par le bruit -> régions qui s'emboîtent, PAS d'anneaux ni de bandes. Le
// village est dans une petite clairière au sein d'une zone de forêt.
const ZONE_WARP = 16 // déformation (tuiles) des frontières de zones (Voronoi) -> bords organiques, pas droits
const VILLAGE_OFF_X = 16 // décalage (tuiles) du village vs centre de l'île -> casse la symétrie (décalé à l'EST)
const VILLAGE_OFF_Y = -2
const LEVEL_REACH = 92 // distance (tuiles) au village où le niveau atteint le max ; près du village = niv1
const MONSTER_MAX_LEVEL = 5 // mobs niv 1 (normal) -> 5 max ; chaque niveau = ×1.5 PV & dégâts (cf. Monster.js)
const SHINY_CHANCE = 5 // % de chance qu'un monstre soit ÉLITE "shiny" (nommé, +fort, +butin)
const TIER_UP = { common: 'rare', rare: 'epic', epic: 'epic' } // élite = un cran de rareté au-dessus
const ELITE_NAMES = ['Kraugg', 'Morvex', 'Sslyth', 'Gorthak', 'Vnira', 'Brakka', 'Zhul', 'Naxxis', 'Ferrok', 'Ombrelle', 'Dargoth', 'Yssrah']

// BOSS DE BIOME (un par zone, repaire FIXE au fond du biome -> "boss de monde" style WoW).
// type = monstre emblématique du biome ; dir = direction du repaire depuis le centre ; dist = tuiles.
// repaires de boss : direction + distance depuis le centre ; findBossTile ajuste sur une
// tuile valide du bon biome. Forêt = ceinture Nord/Sud, neige = grand Nord, désert = grand Sud.
// PLUSIEURS boss par zone (repaires multiples, cf. computeBossLairs). 1er de chaque liste = souvent le raid.
const BIOME_BOSSES = {
  forest: [
    { type: 'samurai', name: 'Gankai, le Samouraï Sylvestre' }, // RAID (intuable solo)
    { type: 'giantbamboo', name: 'Sylvas, le Colosse de Bambou' }, // solo
    { type: 'redsamurai', name: 'Akaoni, le Samouraï Rouge' }, // solo
    { type: 'giantbamboo2', name: 'Daïkon, le Bambou Ancien' }, // solo
    { type: 'giantracoon', name: 'Tanu, le Raton Géant' }, // solo
    { type: 'giantfrog', name: 'Gluk, le Crapaud Colossal' }, // solo
  ],
  desert: [
    { type: 'democyclop', name: 'Gorehk, le Cyclope des Sables' }, // solo
    { type: 'democyclop2', name: 'Vorrn, le Cyclope Ancien' }, // solo
    { type: 'tengured', name: 'Fujin, le Tengu Rouge' }, // solo
  ],
  snow: [
    { type: 'tengublue', name: 'Raijin, le Tengu des Glaces' }, // RAID (intuable solo)
    { type: 'giantslime', name: 'Givralk, la Gelée Polaire' }, // solo
    { type: 'giantslime2', name: 'Cryos, la Gelée Ancienne' }, // solo
  ],
  cursed: [
    { type: 'giantflam', name: 'Dargoth, Seigneur Maudit' }, // solo (île maudite verrouillée)
    { type: 'giantspirit', name: 'Nyl, l’Âme Damnée' }, // solo
  ],
  // CÔTE : boss à DISTANCE qui surgit au bord de l'océan (repaire = tuile de terre au rivage, cf. computeBossLairs)
  coast: [
    { type: 'squidred', name: 'Vorakh, le Kraken des Récifs' }, // solo, tire des orbes à esquiver
  ],
}
// ÎLE MAUDITE (end-game) : GRANDE île détachée loin au SUD-OUEST, au-delà des mers. Biome `cursed` +
// boss Dargoth. Entourée d'océan, AUCUN gué -> VERROUILLÉE tant que la nage n'existe pas. Placée hors
// du cadre d'accueil (centré sur le village) -> on n'en voit qu'un BOUT au dézoom = secret end-game.
const CURSED_ISLE = { ox: -100, oy: 60, r: 28 } // [offset tuiles depuis le centre de l'île, rayon]
// ARÈNE DE BOSS : s'approcher trop près SCELLE une zone circulaire autour du boss -> impossible d'en
// sortir tant qu'il n'est pas mort (sur un boss de raid intuable solo = piège mortel : reviens en groupe).
const ARENA_RADIUS = 160 // rayon de la zone scellée (px), centrée sur le repaire du boss
const ARENA_TRIGGER = 110 // distance (px) au CENTRE du repaire qui déclenche le verrouillage (< rayon -> on est dedans)
const BOSS_CLEAR_TILES = 12 // rayon (tuiles) dégagé d'arbres/rochers/props autour de chaque repaire = clairière d'arène

// groupe de décor par biome (les arbres ne doivent pas déborder sur un autre groupe)
const DECOR_GROUP = { prairie: 'green', forest: 'green', snow: 'snow', desert: 'dead', cursed: 'dead' }
const BORDER_MARGIN = 3 // distance mini (tuiles) entre un arbre et la frontière d'un autre groupe

/** Bruit déterministe [0,1) par tuile (varie les sols + bords de biome organiques). */
function tileNoise(x, y, salt = 0) {
  let n = ((x + 1) * 374761393 + (y + 1) * 668265263 + salt * 1442695040) >>> 0
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

/** Interpolation linéaire entre deux couleurs hex 0xRRGGBB (t dans [0,1]). */
function lerpHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const c = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | c
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
const RIVERS_ENABLED = true // SEULES rivières = séparatrices de biomes (neige/forêt et forêt/désert)
const PATHS_ENABLED = false // PLUS de routes hors village (le village garde ses propres allées)

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
    this.mapW = MAP_W // exposés pour l'UI (carte du monde / minimap)
    this.mapH = MAP_H
    this.tile = TILE
    // centre de l'ÎLE gardé à l'ANCIEN emplacement (map d'avant = 360×220 -> 180,110) pour préserver
    // EXACTEMENT le contour d'avant l'agrandissement : le bruit de côte (rawOcean) dépend des coordonnées
    // ABSOLUES, donc recentrer l'île ailleurs changerait la forme. -> île décalée vers le haut-gauche de
    // la grande grille (plus d'océan à droite/en bas), mais contour identique à avant.
    this.icx = 180
    this.icy = 110
    // centre du VILLAGE (et de la ceinture de forêt + des niveaux de mobs) = DÉCALÉ du centre de
    // l'île -> le village n'est plus au centre géométrique du continent (casse la symétrie circulaire).
    this.cx = this.icx + VILLAGE_OFF_X
    this.cy = this.icy + VILLAGE_OFF_Y
    // ZONES de biome façon WoW (Voronoi) : graines [biome, x, y] qui s'emboîtent en régions. Le
    // village est dans une zone de FORÊT ; neige tend vers le Nord, désert vers le Sud, mais décalées
    // (staggered) -> patchwork organique, PAS des bandes ni un anneau radial.
    const { icx, icy, cx, cy } = this
    this.zoneSeeds = [
      ['forest', cx, cy], ['forest', icx - 32, icy + 6], ['forest', icx + 62, icy - 8], ['forest', icx + 4, icy + 8],
      ['snow', icx - 52, icy - 50], ['snow', icx + 2, icy - 64], ['snow', icx + 54, icy - 48], ['snow', icx - 78, icy - 30], ['snow', icx + 34, icy - 62],
      ['desert', icx - 58, icy + 52], ['desert', icx + 6, icy + 68], ['desert', icx + 60, icy + 50], ['desert', icx + 74, icy + 32], ['desert', icx - 24, icy + 56],
    ]
    // lissage de la CÔTE (masque d'océan) AVANT toute lecture (biomes/rivières/chemins/spawns/boss)
    this.computeCoast()
    // repaires de boss : un point PROFOND dans chaque zone, LOIN du village (= points d'intérêt pour
    // les sentiers). Calculés tôt (avant chemins/rivières) car les sentiers les relient.
    this.computeBossLairs()
    // points d'intérêt reliés par les sentiers organiques : village + repaires de boss
    this.pois = [{ tx: this.cx, ty: this.cy }, ...Object.values(this.bossLairs).flat()]
    // 15 PNJ dispersés sur la map (calculés tôt -> les petits chemins s'y greffent)
    this.computeWildNpcs()

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
    this.paintBiomes() // sols des biomes AVANT le reste
    this.paintGrassBiomes() // herbe Sprout : prairie/village (claire) + forêt (teintée vert sombre)
    this.buildRivers() // rivières + ponts (AVANT les chemins -> les chemins passent PAR les ponts)
    this.buildOcean() // océan autour du continent (île entourée d'eau)
    this.spawnDryLakes() // lacs asséchés (terre craquelée) dans le désert
    this.paintPaths() // chemins (routés par les ponts pour franchir les rivières)
    // eau ANIMÉE Sprout (cycle des 4 frames sur les tuiles VISIBLES) + teinte bleu foncé
    this.waterFrame = 0
    this.time.addEvent({ delay: 170, loop: true, callback: this.animateWater, callbackScope: this })
    this.waterLayer.forEachTile((t) => { if (t.index >= 0) t.tint = WATER_TINT })

    // --- physique / héros ---
    this.physics.world.setBounds(EDGE_INSET, EDGE_INSET, this.worldW - 2 * EDGE_INSET, this.worldH - 2 * EDGE_INSET)
    const spawnX = this.saveData ? this.saveData.x : this.cx * TILE // au VILLAGE (décalé du centre)
    const spawnY = this.saveData ? this.saveData.y : this.cy * TILE
    this.player = new Player(this, spawnX, spawnY, { character: this.character, save: this.saveData })
    // le pseudo au-dessus du héros est dessiné par UIScene (scène non-zoomée) pour rester net/stable

    // --- décors ---
    this.obstacles = this.physics.add.staticGroup()
    this.trees = []
    this.destructibles = [] // obstacles (arbres de forêt) détruits par l'onde de choc à l'ouverture d'une arène
    this.occupied = new Set()
    this.spawnVillage() // village au spawn (avant la forêt : réserve l'emplacement)
    this.spawnWatermill() // moulin à eau sur la berge de la rivière sud (réserve avant la forêt)
    this.spawnForest()
    this.spawnBiomeTrees()
    this.scatterForestTrees() // chênes Mystic Woods dans la forêt
    this.scatterForestUndergrowth() // sous-bois Ninja TOUFFU : fougères + buissons + fleurs (traversable)
    this.spawnRocks()
    this.spawnDecor()
    this.spawnBiomeProps() // props par biome (cactus, cristaux, souches, congères...)
    this.physics.add.collider(this.player, this.obstacles)
    this.physics.add.collider(this.player, this.waterLayer) // l'eau bloque (sauf ponts)

    // --- monstres --- (PAS en mode aperçu d'accueil : on garde le décor mais sans mobs -> moins lourd)
    this.monsters = this.physics.add.group()
    this.bosses = []
    if (!this.preview) {
      this.spawnMonsters()
      this.spawnBosses() // boss de biome (repaires fixes au fond de chaque zone)
    }
    this.physics.add.collider(this.monsters, this.obstacles)
    this.physics.add.collider(this.monsters, this.waterLayer) // monstres bloqués par l'eau
    this.physics.add.collider(this.monsters, this.monsters)
    this.physics.add.overlap(this.player, this.monsters, (pl, mon) => {
      // le contact NE réveille PAS un boss endormi (il faut l'ATTAQUER -> combatEngaged via hitMonster) ;
      // tryBite est verrouillé tant qu'il dort, donc un boss assoupi ne te mord pas si tu le frôles.
      if (mon.tryBite(pl, this.time.now)) {
        this.flashHurt()
        if (mon.isBoss) this.bossAttackFx(mon) // retour visuel net quand un BOSS frappe
      }
    })

    // --- projectiles (attaque à distance) ---
    this.projectiles = this.physics.add.group({ classType: Projectile, runChildUpdate: true })
    this.physics.add.overlap(this.projectiles, this.monsters, (proj, mon) => {
      if (!proj.active || !mon.active) return
      const px = proj.x
      const py = proj.y
      const dmg = proj.damage
      proj.kill()
      Audio.sfx(SFX.hit, { vol: 0.4 }) // impact du projectile
      this.hitMonster(mon, dmg, px, py, 0) // pas de recul (seul le Tank repousse) ; dégâts seuls
    })
    // les projectiles s'arrêtent sur le décor
    this.physics.add.collider(this.projectiles, this.obstacles, (proj) => proj.kill())

    // --- projectiles ENNEMIS (boss à distance, ex. Kraken) : touchent le JOUEUR, pas les monstres ---
    this.enemyProjectiles = this.physics.add.group({ classType: Projectile, runChildUpdate: true })
    this.physics.add.overlap(this.player, this.enemyProjectiles, (pl, proj) => {
      if (!proj.active) return
      proj.kill()
      if (pl.takeDamage(proj.damage, this.time.now)) this.flashHurt() // takeDamage joue déjà le son de douleur
    })
    this.physics.add.collider(this.enemyProjectiles, this.obstacles, (proj) => proj.kill())

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
      // aperçu d'accueil : animation cinématique DOUCE entre un gros plan sur le village et une vue
      // d'ensemble de l'île. zoom ET centre sont interpolés ENSEMBLE (un seul tween sur t) -> pas de
      // pan gauche/droite parasite. Le dézoom cadre l'ÎLE (pas toute la grille d'océan) -> on ne
      // s'éloigne pas trop.
      cam.setBackgroundColor(OCEAN_BG) // marges hors-map = océan (pas de gris)
      cam.setRoundPixels(false) // mouvement fluide (sinon arrondi pixel = à-coups)
      cam.useBounds = false // pas de clamp : la caméra reste PILE sur le village même dézoomée
      const vX = this.cx * TILE // centre FIXE = le village
      const vY = this.cy * TILE
      const closeZoom = 2.8
      // zoom dézoomé qui cadre toute l'île (basé sur la taille de l'île, pas la grille -> pas trop loin)
      // facteur 1.0 (au lieu de 1.2) -> dézoom MOINS large : on cadre l'île sans révéler les bords de la
      // grille (l'île est décalée près du haut-gauche, donc un dézoom trop large montrait la limite de map).
      const wideZoom = Math.min(
        this.scale.width / (2 * ISLAND_RX * TILE * 1.0),
        this.scale.height / (2 * ISLAND_RY * TILE * 1.0),
      )
      cam.setZoom(closeZoom)
      cam.centerOn(vX, vY)
      // on n'anime QUE le zoom ; on RECENTRE sur le village à chaque frame (sinon le zoom fait dériver
      // le centre) -> caméra parfaitement immobile sur le village, juste un zoom in/out doux.
      const cine = { z: closeZoom }
      this.tweens.add({
        targets: cine,
        z: wideZoom,
        duration: 9000,
        hold: 3500,
        yoyo: true,
        repeat: -1,
        delay: 5000,
        repeatDelay: 6000,
        ease: 'Sine.inOut',
        onUpdate: () => {
          cam.setZoom(cine.z)
          cam.centerOn(vX, vY)
        },
      })
      this.spawnSeaDragon() // dragon qui rôde au large -> visible lors du dézoom de l'accueil
    } else {
      cam.useBounds = true // (l'instance peut avoir été utilisée en preview où on l'a mis à false)
      // suivi instantané (pas de lerp) : avec l'arrondi pixel, le lissage créait
      // une vibration en diagonale (positions fractionnaires arrondies différemment).
      cam.startFollow(this.player, true)
      cam.setZoom(3)
      cam.setRoundPixels(true)
      this.setupMinimap() // 2e caméra dézoomée (haut-droite) qui suit le joueur
    }

    // --- entrées combat (désactivées en mode aperçu) ---
    if (!this.preview) {
      this.input.mouse?.disableContextMenu() // le clic droit sert à tirer, pas au menu
      this.input.keyboard.on('keydown-SPACE', () => this.basicAttack())
      this.input.keyboard.on('keydown-F', () => this.shootForward())
      this.input.keyboard.on('keydown-ONE', () => this.castSpell()) // LE sort de la classe (touche 1)
      this.input.keyboard.on('keydown-R', () => this.castSpell()) // alias pratique (R)
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
        // confirmation du clic-déplacement, mais THROTTLÉE : enchaîner les clics ne spamme plus le bip
        if (this.time.now >= (this._moveSfxAt || 0)) {
          Audio.sfx('ui_move', { vol: 0.35, detune: 0 })
          this._moveSfxAt = this.time.now + 600
        }
      })
    }

    this.gameOver = false
    this.pendingNpc = null // interlocuteur cliqué vers lequel on marche (interaction auto en arrivant)
    this.currentBiome = 'prairie' // suivi pour le bandeau de zone
    this.activeBoss = null // boss actuellement engagé (alimente la barre de boss de l'UIScene)
    this.activeArena = null // arène de boss scellée en cours ({boss, cx, cy, r, fill, ring})
    if (!this.preview) {
      // UI dans une scène séparée (non zoomée). Évite le double-lancement au restart.
      if (!this.scene.isActive('UIScene')) this.scene.launch('UIScene')
      // bandeau de bienvenue (laisse l'UIScene démarrer)
      this.time.delayedCall(600, () => this.scene.get('UIScene')?.showZoneBanner?.(BIOME_NAMES.prairie))
      // sauvegarde automatique périodique (toutes les 30 s)
      this.time.addEvent({ delay: 30000, loop: true, callback: () => this.saveGame() })
      Audio.playMusic(this, MUSIC_BY_BIOME[this.currentBiome] || 'mus_village') // musique de la zone de départ
      Audio.startAmbient('amb_wind') // calques côtiers (vent + vagues), volume piloté par la proximité de la mer
      Audio.startAmbient('amb_waves')
      Audio.setAmbientLevel('amb_wind', 0)
      Audio.setAmbientLevel('amb_waves', 0)
      this.ambLevel = 0 // intensité lissée de l'ambiance côtière
      this.ambTarget = 0
      this.ambCheckAt = 0 // throttle du calcul de proximité côte
      this.events.once('shutdown', () => Audio.stopAmbient()) // coupe toutes les ambiances en quittant la scène (menu)
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

  // ---------- minimap (brief §7) ----------

  /** Pré-génère une IMAGE schématique de TOUTE la map (1 px/tuile : couleurs de biome + eau + chemins),
   *  comme la carte du monde (M) mais en texture. UIScene en affiche une fenêtre ZOOMÉE qui suit le joueur. */
  setupMinimap() {
    if (this.textures.exists('mmtex')) this.textures.remove('mmtex')
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    const COL = { ocean: 0x274b78, prairie: 0x9bcf5a, forest: 0x3e8b41, snow: 0xe9f1ff, desert: 0xd9bd72, cursed: 0x7c4a63 }
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        g.fillStyle(this.isOcean(tx, ty) ? COL.ocean : COL[this.biomeAt(tx, ty)] ?? COL.forest, 1)
        g.fillRect(tx, ty, 1, 1)
      }
    }
    for (const k of this.waterCells) {
      const [x, y] = k.split(',').map(Number)
      if (this.isOcean(x, y)) continue // garde la couleur d'océan ; on ne repeint que les rivières
      g.fillStyle(0x3f7fc0, 1)
      g.fillRect(x, y, 1, 1)
    }
    for (const k of this.pathCells) {
      const [x, y] = k.split(',').map(Number)
      g.fillStyle(0xb5915c, 1)
      g.fillRect(x, y, 1, 1)
    }
    g.generateTexture('mmtex', MAP_W, MAP_H)
    g.destroy()
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
    this.seaDragon?.update(time) // le dragon rôde au large aussi à l'accueil (visible au dézoom)
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
    this.plazaCells = new Set()
    // points d'intérêt = village + repaires de boss (calculés tôt dans create)
    this.places = (this.pois ?? [{ tx: this.cx, ty: this.cy }]).map((p) => ({ x: p.tx, y: p.ty }))
    if (!PATHS_ENABLED) return
    const cells = new Set()
    const carve = (x, y, w) => {
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < w; dy++) {
          const tx = Math.round(x) + dx
          const ty = Math.round(y) + dy
          // jamais de terre peinte dans la MER (évite les pixels de terrain qui débordent sur l'océan
          // au ras de la côte) ; les gués/ponts sur les rivières restent gérés séparément.
          if (tx > 0 && ty > 0 && tx < MAP_W - 1 && ty < MAP_H - 1 && !this.isOcean(tx, ty)) {
            cells.add(this.key(tx, ty))
            this.pathCells.add(this.key(tx, ty))
          }
        }
      }
    }
    // RÉSEAU = ÉTOILE + ANNEAU.
    // Étoile : village -> chaque repaire de boss (une route directe par zone).
    const village = { x: this.cx, y: this.cy }
    const desert = this.bossLairs?.desert?.[0] // 1er repaire de chaque zone (bossLairs = tableau par biome)
    const snow = this.bossLairs?.snow?.[0]
    const forest = this.bossLairs?.forest?.[0]
    if (desert) this.routePath(carve, village, { x: desert.tx, y: desert.ty })
    if (snow) this.routePath(carve, village, { x: snow.tx, y: snow.ty })
    if (forest) this.routePath(carve, village, { x: forest.tx, y: forest.ty })
    // Anneau : relie les ZONES entre elles (les joueurs circulent zone-à-zone sans repasser au
    // village). On connecte en boucle des points à MI-CHEMIN village->boss (donc DANS chaque zone,
    // mais loin des repaires dangereux). Le BFS contourne l'eau -> l'anneau passe par les ponts.
    const lairs = [desert, snow, forest].filter(Boolean)
    const midOf = (l) => {
      const mx = Math.round((village.x + l.tx) / 2)
      const my = Math.round((village.y + l.ty) / 2)
      return this.nearestWalkable(mx, my) || { x: mx, y: my }
    }
    const mids = lairs.map(midOf)
    for (let i = 0; i < mids.length; i++) this.routePath(carve, mids[i], mids[(i + 1) % mids.length])
    // Les 15 sentiers PNJ en cul-de-sac d'avant sont RETIRÉS (map plus lisible) ; les PNJ dispersés
    // (this.wildNpcs) restent en place, simplement sans sentier dédié.

    // retire le rendu du chemin DANS la clairière du village (elle a ses propres allées) ; le chemin
    // qui traverse le DÉSERT est repeint en argile rouge (sinon invisible sur le sable = terre)
    const desertPath = new Set()
    for (const k of [...cells]) {
      const [x, y] = k.split(',').map(Number)
      const b = this.biomeAt(x, y)
      if (b === 'prairie') cells.delete(k)
      else if (b === 'desert') desertPath.add(k)
    }
    this.paintBlob(cells, BLOB.dirt, true)
    this.paintBlob(desertPath, BLOB.cursed, true)
    // GUÉS : là où un chemin traverse une rivière-FRONTIÈRE, on retire l'eau (le chemin fait le gué)
    // -> les routes franchissent les frontières tout droit, sans zigzaguer pour trouver un trou.
    for (const k of this.pathCells) {
      if (this.frontierCells && this.frontierCells.has(k)) {
        this.waterCells.delete(k)
        const [x, y] = k.split(',').map(Number)
        this.waterLayer.removeTileAt(x, y)
      }
    }
  }

  /** Trace une ROUTE de a vers b. On prend le PLUS COURT CHEMIN terrestre (BFS sur les cases
   *  marchables = terre + ponts, jamais rivière/océan) puis on le lisse (Chaikin) -> route DIRECTE et
   *  douce, SANS détour ni dédoublement. Si aucune voie terrestre n'existe, on ne trace RIEN (jamais
   *  de route dans l'eau). */
  routePath(carve, a, b) {
    const seg = this.findWalkPath(Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y))
    if (!seg || seg.length < 2) return // pas de voie terrestre -> on ne trace pas (zéro route en mer)
    // points de contrôle (1 cellule sur 4) sur le plus court chemin, puis lissage CHAIKIN -> route qui
    // suit le terrain en douceur, sans escalier ni S parasites.
    const ctrl = []
    for (let i = 0; i < seg.length; i += 4) ctrl.push(seg[i])
    if (ctrl[ctrl.length - 1] !== seg[seg.length - 1]) ctrl.push(seg[seg.length - 1])
    let pts = ctrl
    for (let it = 0; it < 3; it++) pts = this.chaikin(pts)
    for (let i = 1; i < pts.length; i++) {
      if (this.lineWalkable(pts[i - 1], pts[i])) this.carveLine(carve, pts[i - 1], pts[i])
      else {
        carve(Math.round(pts[i - 1].x), Math.round(pts[i - 1].y), 2)
        carve(Math.round(pts[i].x), Math.round(pts[i].y), 2)
      }
    }
  }

  /** Lissage de Chaikin (corner-cutting) : arrondit la polyligne en courbe douce. Chaque point coupé
   *  qui tomberait hors-terre est rapproché de la terre la plus proche (cf. smoothClamp) au lieu de
   *  revenir sur l'angle d'origine -> plus d'angles secs près des berges, la courbe reste douce. */
  chaikin(pts) {
    if (pts.length < 3) return pts
    const out = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const q = { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }
      const r = { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }
      out.push(this.smoothClamp(q, a))
      out.push(this.smoothClamp(r, b))
    }
    out.push(pts[pts.length - 1])
    return out
  }

  /** Garde le point lissé `p` s'il est sur une case marchable, sinon le rapproche de la case
   *  marchable la plus proche (repli sur `fb` si aucune trouvée) -> évite les angles secs. */
  smoothClamp(p, fb) {
    if (this.walkableForPath(Math.round(p.x), Math.round(p.y))) return p
    const nw = this.nearestWalkable(Math.round(p.x), Math.round(p.y))
    return nw || fb
  }

  /** Simplifie un chemin de cellules par LIGNE DE VUE : garde le point le plus loin atteignable en
   *  ligne droite marchable -> remplace l'escalier par de longs segments droits. */
  simplifyPath(path) {
    if (path.length <= 2) return path
    const out = [path[0]]
    let anchor = 0
    for (let i = 2; i < path.length; i++) {
      if (!this.lineWalkable(path[anchor], path[i])) {
        out.push(path[i - 1])
        anchor = i - 1
      }
    }
    out.push(path[path.length - 1])
    return out
  }

  /** true si le segment droit a->b ne passe que par des cases marchables (terre/pont). */
  lineWalkable(a, b) {
    const steps = Math.ceil(this.dist(a.x, a.y, b.x, b.y))
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / steps)
      const y = Math.round(a.y + ((b.y - a.y) * i) / steps)
      if (!this.walkableForPath(x, y)) return false
    }
    return true
  }

  /** Creuse un segment de chemin DROIT entre a et b (largeur 2). */
  carveLine(carve, a, b) {
    const steps = Math.ceil(this.dist(a.x, a.y, b.x, b.y))
    for (let i = 0; i <= steps; i++) {
      carve(Math.round(a.x + ((b.x - a.x) * i) / steps), Math.round(a.y + ((b.y - a.y) * i) / steps), 2)
    }
  }

  /** Points de passage en COURBES DOUCES de a vers b : on suit la ligne a->b mais avec un décalage
   *  latéral LISSE (sinus basse fréquence, nul aux deux bouts) -> 1 à 2 grandes courbes naturelles,
   *  PAS d'oscillation gauche/droite aléatoire. Chaque point est snappé sur une case marchable. */
  sinuousWaypoints(a, b) {
    const pts = []
    const d = this.dist(a.x, a.y, b.x, b.y)
    const dirAng = Math.atan2(b.y - a.y, b.x - a.x)
    const px = -Math.sin(dirAng) // perpendiculaire à la ligne a->b
    const py = Math.cos(dirAng)
    const bends = Phaser.Math.FloatBetween(0.8, 1.3) // peu de courbes -> routes plus directes (étoile nette)
    const amp = Math.min(7, d * 0.06) // amplitude latérale RÉDUITE -> plus de S qui se dédoublent / s'emmêlent
    const phase = Phaser.Math.FloatBetween(0, Math.PI)
    const steps = Math.max(4, Math.round(d / 9))
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      // sin(t*pi) = enveloppe -> décalage nul au départ et à l'arrivée (route alignée sur a et b)
      const off = Math.sin(t * Math.PI * bends + phase) * amp * Math.sin(t * Math.PI)
      const lx = Math.round(a.x + (b.x - a.x) * t + px * off)
      const ly = Math.round(a.y + (b.y - a.y) * t + py * off)
      // on NE garde que les points qui tombent sur la TERRE (pas de snap lointain qui crée des
      // détours parasites) ; si le point est dans l'eau, on l'ignore et le BFS relie directement.
      if (this.walkableForPath(lx, ly)) pts.push({ x: lx, y: ly })
    }
    return pts
  }

  /** Case marchable la plus proche de (x,y) (spirale courte) ou null. */
  nearestWalkable(x, y) {
    for (let r = 0; r <= 8; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue
          if (this.walkableForPath(x + dx, y + dy)) return { x: x + dx, y: y + dy }
        }
      }
    }
    return null
  }

  /** Case franchissable par une ROUTE : ni océan, ni grande rivière (sauf PONT). Les rivières-
   *  FRONTIÈRES (fines) sont franchissables tout droit -> on y posera un gué (cf. fin de paintPaths)
   *  au lieu de faire zigzaguer le chemin pour trouver un trou. */
  walkableForPath(x, y) {
    if (x <= 1 || y <= 1 || x >= MAP_W - 1 || y >= MAP_H - 1) return false
    if (this.isOcean(x, y)) return false
    const k = this.key(x, y)
    if (this.bridgeCells && this.bridgeCells.has(k)) return true
    if (this.frontierCells && this.frontierCells.has(k)) return true
    return !this.waterCells.has(k)
  }

  /** BFS 8 directions (sans couper les diagonales d'eau) de (sx,sy) à (gx,gy) sur les cases
   *  marchables -> renvoie la liste des cases du chemin (ou null si injoignable par voie terrestre). */
  findWalkPath(sx, sy, gx, gy) {
    const W = MAP_W
    const H = MAP_H
    const prev = new Int32Array(W * H).fill(-1)
    const idx = (x, y) => y * W + x
    const start = idx(sx, sy)
    prev[start] = start
    const q = [start]
    let head = 0
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    let found = false
    while (head < q.length) {
      const cur = q[head++]
      const cx = cur % W
      const cy = (cur - cx) / W
      if (cx === gx && cy === gy) {
        found = true
        break
      }
      for (const [dx, dy] of dirs) {
        const nx = cx + dx
        const ny = cy + dy
        if (!this.walkableForPath(nx, ny)) continue
        if (dx && dy && (!this.walkableForPath(cx + dx, cy) || !this.walkableForPath(cx, cy + dy))) continue // pas de coupe en diagonale
        const ni = idx(nx, ny)
        if (prev[ni] !== -1) continue
        prev[ni] = cur
        q.push(ni)
      }
    }
    if (!found) return null
    const path = []
    let c = idx(gx, gy)
    while (c !== start) {
      const x = c % W
      const y = (c - x) / W
      path.push({ x, y })
      c = prev[c]
    }
    path.push({ x: sx, y: sy })
    path.reverse()
    return path
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

  /** Herbe Sprout Lands sur PRAIRIE + FORÊT (une seule couche, au-dessus du sol field). La forêt réutilise
   *  les MÊMES tuiles d'herbe (variantes : pleine, pousses, touffes) mais avec un FILTRE vert sombre
   *  (teinte multiply) en 3 nuances par TACHES (bruit) -> sous-bois riche sans quadrillage. La prairie
   *  reste claire (sans teinte). Les chemins de terre du village (overlay, depth -9) restent par-dessus. */
  paintGrassBiomes() {
    const gmap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    const gts = gmap.addTilesetImage('grass_sprout', 'grass_sprout', TILE, TILE)
    this.grassLayer = gmap.createBlankLayer('grass', gts, 0, 0).setDepth(-9.8) // > field(-10), < overlay(-9)
    const PRAIRIE_FILL = [56, 57, 56, 57, 56, 57, 66, 67, 68, 60] // pleine (majorité) + pousses + fleurs (rare)
    const FOREST_FILL = [56, 57, 56, 57, 56, 57, 66, 58] // pleine (majorité) + rare pousse/touffe (peu de variation)
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const b = this.biomeAt(tx, ty)
        if (b !== 'prairie' && b !== 'forest') continue
        if (this.isOcean(tx, ty) || this.isIsland(tx, ty)) continue
        if (b === 'prairie') {
          const t = this.grassLayer.putTileAt(PRAIRIE_FILL[Math.floor(tileNoise(tx, ty, 29) * PRAIRIE_FILL.length)], tx, ty)
          // variation CLAIRE et douce (grandes taches lisses) -> la prairie respire sans mosaïque
          if (t) t.tint = lerpHex(0xffffff, 0xdcecac, Phaser.Math.Clamp((this.noise2D(tx, ty) + 1) / 2, 0, 1))
        } else {
          const t = this.grassLayer.putTileAt(FOREST_FILL[Math.floor(tileNoise(tx, ty, 29) * FOREST_FILL.length)], tx, ty)
          // TRANSITION uniquement sur les PREMIÈRES tuiles après la prairie (bande ~8 tuiles calée sur le
          // vrai bord = clearR par angle) : clair au contact de la prairie -> vert sombre ; au-delà = sombre.
          if (t) {
            const dv = Math.hypot(tx - this.cx, ty - this.cy)
            const ang = Math.atan2(ty - this.cy, tx - this.cx)
            const clearR = 14 * (1 + 0.25 * Math.sin(ang * 2 + 1)) + this.noise2D(tx, ty) * 2 // = bord de prairie
            const k = Phaser.Math.Clamp((dv - clearR) / 3 + this.noise2D(tx, ty) * 0.06, 0, 1) // bande courte (~3 tuiles)
            // forêt profonde : variation PAR TUILE en 3 verts proches -> alternance fine et dense (jungle)
            const r = tileNoise(tx, ty, 51)
            const deep = r < 0.45 ? 0x4e6e34 : r < 0.75 ? 0x5d7f3e : 0x6f9850 // foncé / moyen / un peu moins foncé
            t.tint = lerpHex(0xe9f4c6, deep, k) // bord clair (~prairie) -> patch de forêt
          }
        }
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
  /** Bruit 2D lisse et déterministe, ~[-1,1], avec DOMAIN-WARPING : les coordonnées sont
   *  elles-mêmes décalées par des sinus -> le champ devient "blobby"/isotrope (pas aligné
   *  horizontalement). C'est lui qui casse l'effet bandes des frontières de biomes. */
  noise2D(tx, ty) {
    const wx = tx + Math.sin(ty * 0.05) * 7 + Math.sin(ty * 0.11 + 1.0) * 3
    const wy = ty + Math.sin(tx * 0.045) * 7 + Math.sin(tx * 0.09 + 2.0) * 3
    const n =
      Math.sin(wx * 0.06) +
      Math.sin(wy * 0.075 + 1.3) +
      Math.sin((wx + wy) * 0.04 + 0.6) +
      Math.sin((wx - wy) * 0.05 + 2.2)
    return n / 4
  }

  /** 2e champ de bruit INDÉPENDANT (fréquences/phases différentes de noise2D). Sert à déformer les
   *  frontières de zones dans biomeAt (Voronoi) -> bords organiques qui s'emboîtent, pas droits. */
  noiseB(tx, ty) {
    const wx = tx + Math.sin(ty * 0.037 + 4) * 9
    const wy = ty + Math.sin(tx * 0.041 + 1.5) * 9
    return (Math.sin(wx * 0.052 + 0.3) + Math.sin(wy * 0.063 + 2.7) + Math.sin((wx - wy) * 0.045 + 1.1)) / 3
  }

  /** Biome type CONTINENT en ZONES (façon WoW) : le village est dans une petite clairière au sein
   *  d'une zone de FORÊT, et le reste du continent est un PATCHWORK de zones (forêt/neige/désert)
   *  défini par VORONOI sur des graines (this.zoneSeeds), avec distances DÉFORMÉES par le bruit ->
   *  frontières organiques qui s'emboîtent (pas de bandes, pas d'anneau radial). Les graines de
   *  neige tendent vers le Nord, celles de désert vers le Sud, mais décalées (patchwork). */
  biomeAt(tx, ty) {
    if (this.isCursedIsland(tx, ty)) return 'cursed' // île maudite au large (end-game verrouillé)
    // petit bourg dégagé autour du village (clairière irrégulière ~11 tuiles) -> le village est DANS
    // la forêt, ce n'est PAS un grand ovale concentrique
    const dv = Math.hypot(tx - this.cx, ty - this.cy)
    const clearR = 14 * (1 + 0.25 * Math.sin(Math.atan2(ty - this.cy, tx - this.cx) * 2 + 1)) + this.noise2D(tx, ty) * 2
    if (dv < clearR) return 'prairie'
    // zone (graine) la plus proche en distance DÉFORMÉE -> Voronoi à frontières organiques
    const wx = tx + this.noise2D(tx, ty) * ZONE_WARP
    const wy = ty + this.noiseB(tx, ty) * ZONE_WARP
    let best = 'forest'
    let bd = Infinity
    for (const z of this.zoneSeeds) {
      const dd = (wx - z[1]) * (wx - z[1]) + (wy - z[2]) * (wy - z[2])
      if (dd < bd) {
        bd = dd
        best = z[0]
      }
    }
    return best
  }

  /** Petites ÎLES détachées au large (archipel). Générées par DIRECTION : pour chaque angle on
   *  place l'île JUSTE au-delà de la côte locale (rayon ellipse + un petit bras de mer) -> elle est
   *  toujours séparée du continent par de l'eau. On vise surtout les diagonales (coins = plus
   *  d'océan). Biome selon la latitude (Nord => neige, Sud => désert). [deg, rayon, marge]. */
  islands() {
    const { icx, icy } = this
    // 3 GROSSES îles détachées au large (r=4-5 -> ~8-10 tuiles, lisibles comme de vraies îles, PAS des
    // pixels parasites). Directions différentes pour un effet archipel propre.
    const DIRS = [
      [-122, 5, 0.20], // NO -> au large de la neige
      [44, 5, 0.18], // SE -> au large du désert
      [150, 4, 0.22], // SO
    ]
    return DIRS.map(([deg, r, margin]) => {
      const a = (deg * Math.PI) / 180
      // rayon de côte local dans cette direction (même formule que isOcean, sans le bruit)
      const coast = 0.14 * Math.sin(a * 2 + 0.6) + 0.11 * Math.sin(a * 3 + 2.2) + 0.07 * Math.sin(a * 5 - 1.0)
      const f = 1 + Math.max(coast, 0) + margin + r * 0.02 // au-delà de la côte + bras de mer
      const ix = Math.round(icx + f * ISLAND_RX * Math.cos(a))
      const iy = Math.round(icy + f * ISLAND_RY * Math.sin(a))
      return [ix, iy, r]
    })
  }

  isIsland(tx, ty) {
    if (this.isCursedIsland(tx, ty)) return true // l'île maudite est de la terre (entourée d'océan)
    for (const [ix, iy, r] of this.islands())
      if (Math.hypot(tx - ix, ty - iy) <= r + this.noise2D(tx, ty)) return true
    return false
  }

  /** Vrai si la tuile est sur l'ÎLE MAUDITE (île détachée au large, biome cursed, end-game verrouillé). */
  isCursedIsland(tx, ty) {
    const cx = this.icx + CURSED_ISLE.ox
    const cy = this.icy + CURSED_ISLE.oy
    return Math.hypot(tx - cx, ty - cy) <= CURSED_ISLE.r + this.noise2D(tx, ty)
  }

  /** Vrai si la tuile est dans l'OCÉAN : tout ce qui est HORS du continent (et pas une petite île).
   *  Forme de base = ellipse (demi-axes ISLAND_RX/RY) mais RAYON DE CÔTE VARIABLE SELON L'ANGLE ->
   *  contour de continent irrégulier (caps, golfes, presqu'îles) au lieu d'un disque parfait :
   *  quelques lobes (forme générale) + le bruit 2D local (casse la régularité radiale -> aucune
   *  portion de côte ne ressemble à la voisine). Golfe borné pour ne JAMAIS mordre la ceinture de
   *  forêt (intrusion max ~0.30 du rayon -> reste loin du village). */
  isOcean(tx, ty) {
    // une fois le masque calculé (computeCoast), on lit la côte LISSÉE ; sinon on retombe sur la brute.
    if (this.oceanMask) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true
      return this.oceanMask[ty * MAP_W + tx] === 1
    }
    return this.rawOcean(tx, ty)
  }

  /** Forme BRUTE de l'océan (ellipse + lobes + bruit). Lissée ensuite par computeCoast. */
  rawOcean(tx, ty) {
    if (this.isIsland(tx, ty)) return false // île détachée = terre
    const dx = tx - this.icx
    const dy = ty - this.icy
    const r = Math.hypot(dx / ISLAND_RX, dy / ISLAND_RY) // rayon dans l'ellipse normalisée (1 = côte de base)
    const a = Math.atan2(dy, dx) // angle réel du point depuis le centre
    let coast =
      0.14 * Math.sin(a * 2 + 0.6) + // 2 grands lobes -> forme générale
      0.11 * Math.sin(a * 3 + 2.2) + // 3 lobes moyens
      0.07 * Math.sin(a * 5 - 1.0) + // découpe
      0.16 * this.noise2D(tx, ty) // bruit local -> golfes/caps organiques (anti-rond)
    coast = Phaser.Math.Clamp(coast, -0.30, 0.5) // -0.30 = golfe le plus profond (reste hors forêt)
    return r > 1 + coast
  }

  /** Calcule le masque d'océan LISSÉ : on part de la forme brute puis on retire les langues de terre
   *  isolées (1 tuile cernée de mer) et on comble les trous d'eau isolés -> rivage net, SANS dithering
   *  1px, tout en gardant le contour irrégulier (caps/golfes). Doit tourner AVANT toute lecture de la
   *  côte (paintBiomes/rivières/chemins/spawns). */
  computeCoast() {
    const W = MAP_W
    const H = MAP_H
    const mask = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = this.rawOcean(x, y) ? 1 : 0
    const NEI = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
    for (let pass = 0; pass < 2; pass++) {
      const src = mask.slice()
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          let sea = 0
          for (const [dx, dy] of NEI) sea += src[(y + dy) * W + (x + dx)]
          const i = y * W + x
          if (src[i] === 0 && sea >= 6) mask[i] = 1 // langue de terre isolée -> mer
          else if (src[i] === 1 && sea <= 2) mask[i] = 0 // trou d'eau isolé -> terre
        }
      }
    }
    this.oceanMask = mask
  }

  /** Anime l'eau : cycle la frame (0→3) sur les tuiles d'eau DANS LA VUE caméra (les 4 frames Sprout sont
   *  les images d'animation). Vue seule -> coût négligeable même sur un grand océan. */
  animateWater() {
    if (!this.waterLayer || this.gameOver) return
    this.waterFrame = (this.waterFrame + 1) % 4
    const v = this.cameras.main.worldView
    const tiles = this.waterLayer.getTilesWithinWorldXY(v.x - 16, v.y - 16, v.width + 32, v.height + 32)
    const f = this.waterFrame
    for (const t of tiles) if (t && t.index >= 0) t.index = f
  }

  /** Pose l'eau de l'OCÉAN (tuiles d'eau Sprout) sur le pourtour, avec collision. À appeler
   *  après buildRivers (qui a créé this.waterLayer / this.waterCells). */
  buildOcean() {
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (!this.isOcean(tx, ty)) continue
        this.waterCells.add(this.key(tx, ty)) // exclut déco/monstres/village
        this.waterLayer.putTileAt(Math.floor(tileNoise(tx, ty, 3) * 4), tx, ty)
      }
    }
    this.waterLayer.setCollisionByExclusion([-1]) // l'eau bloque le joueur et les monstres
  }

  /**
   * GRANDES RIVIÈRES qui serpentent depuis l'intérieur du continent jusqu'à la MER (eau ~2 tuiles,
   * collision) + petits lacs/lacs gelés (cf. spawnPonds). Là où un CHEMIN croise l'eau, on pose un
   * PONT en bois (gué marchable) -> passages obligés. `this.waterCells` = eau (bloque déco/spawn).
   */
  buildRivers() {
    this.waterCells = new Set()
    this.bridgeCells = new Set() // cellules de pont (marchables ; eau rendue dessous, visible)
    this.frontierCells = new Set() // (rivières-frontières retirées : laissé vide pour les gardes)
    this.riverPaths = [] // tracé (centerline) de chaque rivière -> sert à poser les ponts régulièrement
    const wmap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    const wts = wmap.addTilesetImage('water_sprout', 'water_sprout', TILE, TILE) // eau ANIMÉE Sprout (4 frames)
    this.waterLayer = wmap.createBlankLayer('water', wts, 0, 0).setDepth(-8)
    // couche de pont (au-dessus de l'eau)
    const bmap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    const bts = bmap.addTilesetImage('bridge_gen', 'bridge_gen', TILE, TILE)
    this.bridgeLayer = bmap.createBlankLayer('bridge', bts, 0, 0).setDepth(-7)
    // couche des GUÉS (terre battue marron clair) au-dessus de l'eau/sol
    const fmap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    const fts = fmap.addTilesetImage('ford_gen', 'ford_gen', TILE, TILE)
    this.fordLayer = fmap.createBlankLayer('ford', fts, 0, 0).setDepth(-7)

    this.spawnPonds() // petits lacs (forêt/prairie) + lacs gelés marchables (neige) -> crée iceCells

    if (RIVERS_ENABLED) {
      // SEULES rivières du monde : 2 rivières-SÉPARATRICES de biomes (neige|forêt et forêt|désert).
      // Elles longent uniquement ces 2 transitions (pas tous les bords -> pas de toile de bandes).
      // Les traversées sont des GUÉS en TUILE DE CHEMIN (terre), pas des ponts en planches.
      this.buildBiomeRivers()
    }

    // rendu : eau générée (rendue AUSSI sous les ponts -> on la voit à travers les planches).
    // La glace est rendue sur sa couche (marchable, sans collision).
    for (const k of this.waterCells) {
      if (this.iceCells.has(k)) continue
      const [x, y] = k.split(',').map(Number)
      this.waterLayer.putTileAt(Math.floor(tileNoise(x, y, 3) * 4), x, y)
    }
    this.waterLayer.setCollisionByExclusion([-1]) // toute tuile d'eau bloque...
    for (const k of this.bridgeCells) {
      const [x, y] = k.split(',').map(Number)
      const t = this.waterLayer.getTileAt(x, y)
      if (t) t.setCollision(false) // ...sauf sous un PONT (on marche dessus, l'eau reste visible)
    }
  }

  /** Pose plusieurs PONTS le long de chaque rivière, espacés, chacun PERPENDICULAIRE à l'écoulement
   *  (vraie travée de berge à berge, pas une ligne diagonale). */
  buildBridges() {
    const SPACING = 18 // espacement des ponts (resserré -> les routes trouvent une traversée plus directe)
    for (const path of this.riverPaths) {
      for (let i = SPACING; i < path.length - 6; i += SPACING) {
        const p = path[i]
        const prev = path[Math.max(0, i - 3)]
        const flow = Math.atan2(p.y - prev.y, p.x - prev.x)
        this.bridgeSpan(p.x, p.y, flow)
      }
    }
  }

  /** Une travée de pont (largeur 2 le long de l'écoulement) qui traverse toute la largeur de la
   *  rivière à (cx,cy), perpendiculairement au courant `flowAng`, + 1 tuile d'accostage sur chaque
   *  berge. Les cellules deviennent marchables (collision retirée dans buildRivers). */
  bridgeSpan(cx, cy, flowAng) {
    const px = -Math.sin(flowAng) // direction perpendiculaire (en travers de la rivière)
    const py = Math.cos(flowAng)
    const fx = Math.cos(flowAng) // direction du courant (pour la largeur du pont)
    const fy = Math.sin(flowAng)
    const place = (x, y) => {
      const tx = Math.round(x)
      const ty = Math.round(y)
      if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return
      const k = this.key(tx, ty)
      if (this.iceCells.has(k)) return
      this.bridgeCells.add(k)
      this.bridgeLayer.putTileAt(Math.floor(tileNoise(tx, ty, 9) * 4), tx, ty) // variante de planches
    }
    for (const along of [0, 1]) {
      // depuis le centre vers chaque berge, jusqu'à sortir de l'eau (+ 1 tuile d'accostage)
      for (const dir of [1, -1]) {
        for (let d = 0; d < 10; d++) {
          const x = cx + px * d * dir + fx * along
          const y = cy + py * d * dir + fy * along
          const water = this.waterCells.has(this.key(Math.round(x), Math.round(y)))
          place(x, y)
          if (d > 0 && !water) break // sorti de la rivière : on s'arrête après la cellule d'accostage
        }
      }
    }
  }

  /** Cherche 2 sources de rivière dans la NEIGE (le plus au Nord possible), une à gauche et une à
   *  droite du centre, pour que les rivières "descendent des montagnes". */
  findRiverSources() {
    const pick = (targetX) => {
      for (let ty = 6; ty < this.icy; ty++) {
        for (let off = 0; off <= 24; off++) {
          for (const tx of [targetX - off, targetX + off]) {
            if (tx > 4 && tx < MAP_W - 5 && !this.isOcean(tx, ty) && !this.isIsland(tx, ty) && this.biomeAt(tx, ty) === 'snow') {
              return { tx, ty }
            }
          }
        }
      }
      return null
    }
    return [pick(this.icx - 24), pick(this.icx + 24)].filter(Boolean)
  }

  /** Creuse UNE rivière LARGE (~3 tuiles) et sinueuse de (sx,sy) jusqu'à la MER. On vise une CIBLE
   *  d'océan (1er point d'eau en allant tout droit dans `baseAng`) et on garde un CAP FERME vers
   *  elle (+ méandres) -> la rivière serpente mais DESCEND toujours jusqu'à la mer, sans boucler. */
  carveRiver(sx, sy, baseAng) {
    // cible = premier point d'OCÉAN en partant tout droit dans baseAng (= "la mer en aval")
    let tx2 = sx
    let ty2 = sy
    for (let s = 0; s < 500; s++) {
      const rx = Math.round(tx2)
      const ry = Math.round(ty2)
      if (rx < 1 || ry < 1 || rx > MAP_W - 2 || ry > MAP_H - 2 || this.isOcean(rx, ry)) break
      tx2 += Math.cos(baseAng)
      ty2 += Math.sin(baseAng)
    }
    let x = sx
    let y = sy
    let ang = baseAng
    const center = [] // tracé (centerline) -> sert à poser les ponts
    for (let guard = 0; guard < 1500; guard++) {
      const rx = Math.round(x)
      const ry = Math.round(y)
      if (rx < 2 || ry < 2 || rx > MAP_W - 3 || ry > MAP_H - 3) break
      if (this.isOcean(rx, ry)) break // arrivée à la mer
      center.push({ x: rx, y: ry })
      // LARGE (~4 tuiles) : on creuse PERPENDICULAIREMENT à l'écoulement -> largeur constante et nette
      // (au lieu d'un petit bloc 2x2 qui faisait une rivière maigre).
      const px = -Math.sin(ang)
      const py = Math.cos(ang)
      for (const o of [-1.5, -0.5, 0.5, 1.5]) {
        const tx = Math.round(x + px * o)
        const ty = Math.round(y + py * o)
        if (tx > 1 && ty > 1 && tx < MAP_W - 1 && ty < MAP_H - 1 && this.biomeAt(tx, ty) !== 'prairie' && !this.isOcean(tx, ty)) {
          this.waterCells.add(this.key(tx, ty))
        }
      }
      // CAP FERME vers la cible mer (0.12 -> empêche les boucles) + méandres plus doux
      ang = Phaser.Math.Angle.RotateTo(ang, Math.atan2(ty2 - y, tx2 - x), 0.12)
      ang += Phaser.Math.FloatBetween(-0.38, 0.38)
      x += Math.cos(ang) * 1.3
      y += Math.sin(ang) * 1.3
    }
    if (center.length > 8) this.riverPaths.push(center)
  }

  /** SEULES rivières du monde : elles séparent NEIGE|FORÊT et FORÊT|DÉSERT (et RIEN d'autre -> pas de
   *  toile de bandes sur tous les bords). ~3 tuiles de large, épargne la prairie/le village. Quelques
   *  GUÉS en TUILE DE CHEMIN (terre) permettent de passer d'une zone à l'autre à pied. */
  buildBiomeRivers() {
    this.frontierCells = new Set()
    this.fordCells = new Set()
    // bords entre {neige,forêt} ou {forêt,désert} UNIQUEMENT
    const isSep = (a, b) => {
      const s = a + '|' + b
      return s === 'snow|forest' || s === 'forest|snow' || s === 'forest|desert' || s === 'desert|forest'
    }
    const border = new Set()
    for (let ty = 1; ty < MAP_H - 1; ty++) {
      for (let tx = 1; tx < MAP_W - 1; tx++) {
        if (this.isOcean(tx, ty)) continue
        const b = this.biomeAt(tx, ty)
        if (b === 'prairie') continue
        const nb = [this.biomeAt(tx + 1, ty), this.biomeAt(tx - 1, ty), this.biomeAt(tx, ty + 1), this.biomeAt(tx, ty - 1)]
        if (nb.some((o) => isSep(b, o))) border.add(this.key(tx, ty))
      }
    }
    // dilatation d'1 tuile -> rivière ~3 de large (épargne prairie/océan)
    const wide = new Set(border)
    for (const k of border) {
      const [x, y] = k.split(',').map(Number)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx > 1 && ny > 1 && nx < MAP_W - 1 && ny < MAP_H - 1 && !this.isOcean(nx, ny) && this.biomeAt(nx, ny) !== 'prairie') {
          wide.add(this.key(nx, ny))
        }
      }
    }
    for (const k of wide) {
      this.waterCells.add(k)
      this.frontierCells.add(k)
    }
    // GUÉS en TERRE : quelques colonnes traversantes (près du village + étalées) où on retire l'eau
    // et on pose la tuile de chemin -> traversée d'une zone à l'autre.
    const fordXs = [this.cx - 48, this.cx, this.cx + 48].map((x) => Phaser.Math.Clamp(Math.round(x), 3, MAP_W - 4))
    for (const fx of fordXs) {
      for (let ty = 2; ty < MAP_H - 2; ty++) {
        let onRiver = false
        for (let dx = -1; dx <= 1; dx++) if (wide.has(this.key(fx + dx, ty))) onRiver = true
        if (!onRiver) continue
        for (let dx = -2; dx <= 2; dx++) {
          const k = this.key(fx + dx, ty)
          if (!wide.has(k)) continue
          this.waterCells.delete(k)
          this.frontierCells.delete(k)
          this.fordCells.add(k)
          this.pathCells.add(k) // déco/spawns évitent le gué
        }
      }
    }
    // rendu des gués en TERRE BATTUE marron CLAIR (texture ford_gen) sur leur couche dédiée
    for (const k of this.fordCells) {
      const [x, y] = k.split(',').map(Number)
      this.fordLayer.putTileAt(Math.floor(tileNoise(x, y, 23) * 4), x, y)
    }
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
      if (this.nearBossLair(tx, ty)) return // pas d'arbre dans la clairière d'arène d'un boss
      const b = this.biomeAt(tx, ty)
      if (b !== 'prairie') return // arbres verts Ninja : PRAIRIE seulement (la forêt est redécorée en Sprout)
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
      if (this.nearBossLair(tx, ty)) return // clairière d'arène = sans arbre
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

  /** Pré-assemble le chêne Mystic Woods (3×4 tuiles) en 2 textures : canopée 48×48 + tronc 48×16.
   *  -> 2 images par arbre au lieu de 12 (forêt dense possible sans exploser le nombre d'objets). */
  buildOakTextures() {
    if (this.textures.exists('oak_canopy') || !this.textures.exists('mystic_obj')) return
    const canopy = [80, 81, 82, 96, 97, 98, 112, 113, 114] // 3×3 feuillage (rangées 5-7)
    const rtC = this.make.renderTexture({ width: 48, height: 48 }, false)
    canopy.forEach((fr, i) => rtC.drawFrame('mystic_obj', fr, (i % 3) * 16, Math.floor(i / 3) * 16))
    rtC.saveTexture('oak_canopy')
    // TRONC OPAQUE (colonne centrale rangée 7 + racines rangée 8) : superposé À LA canopée -> reste plein
    // quand le feuillage s'estompe (corrige "le bout du tronc devient transparent").
    const rtT = this.make.renderTexture({ width: 48, height: 32 }, false)
    rtT.drawFrame('mystic_obj', 113, 16, 0) // tronc (centre rangée 7)
    rtT.drawFrame('mystic_obj', 128, 0, 16)
    rtT.drawFrame('mystic_obj', 129, 16, 16)
    rtT.drawFrame('mystic_obj', 130, 32, 16) // racines (rangée 8)
    rtT.saveTexture('oak_trunk')
    this._oakRT = [rtC, rtT] // garder les RT en vie (sinon les textures sauvegardées sont libérées)
  }

  /** Pose un CHÊNE (Mystic, 3×4) : canopée (feuillage qui s'estompe) + tronc OPAQUE superposé + collision. */
  addOak(tx, ty) {
    const px = tx * TILE
    const py = ty * TILE
    const baseY = py + 4 * TILE
    const canopy = this.add.image(px + 24, py + 24, 'oak_canopy').setDepth(baseY) // feuillage (fade)
    const trunk = this.add.image(px + 24, py + 48, 'oak_trunk').setDepth(baseY) // tronc opaque PAR-DESSUS (créé après)
    const rect = this.add.rectangle(px + 24, py + 3 * TILE + 8, 2 * TILE, TILE - 4)
    this.physics.add.existing(rect, true)
    this.obstacles.add(rect)
    const entry = { leaves: [canopy], bounds: new Phaser.Geom.Rectangle(px, py, 3 * TILE, 4 * TILE) }
    this.trees.push(entry)
    this.destructibles.push({ x: px + 24, y: py + 4 * TILE - 8, body: rect, sprites: [canopy, trunk], entry })
  }

  /** Peuple la FORÊT de chênes Mystic Woods. On NE saute PAS les arènes (les arbres y sont pulvérisés par
   *  l'onde de choc à l'ouverture de l'arène) ; juste une petite clairière autour de chaque repaire pour
   *  voir le boss. (La VARIÉTÉ de déco viendra d'assets Ninja, à proposer avant de coder.) */
  scatterForestTrees() {
    this.buildOakTextures()
    if (!this.textures.exists('oak_canopy')) return
    const lairs = Object.values(this.bossLairs || {}).flat()
    const tryOak = (tx, ty) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - 4 || ty > MAP_H - 5) return
      if (this.nearSpawn(tx, ty, 6)) return
      if (lairs.some((l) => Math.hypot(tx - l.tx, ty - l.ty) < 4)) return
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 4; dy++) {
          if (this.biomeAt(tx + dx, ty + dy) !== 'forest' || this.onPath(tx + dx, ty + dy, 1) || this.onWater(tx + dx, ty + dy, 1)) return
        }
      }
      if (this.reserve(tx, ty, 3, 4)) this.addOak(tx, ty)
    }
    for (let y = 2; y < MAP_H - 5; y++) {
      for (let x = 2; x < MAP_W - 4; x++) {
        if (this.biomeAt(x, y) === 'forest' && Phaser.Math.Between(0, 100) < 8) tryOak(x, y)
      }
    }
  }

  /** Sous-bois TOUFFU de la forêt (assets Ninja `nature`, traversables) : fougères/hautes herbes + buissons
   *  + fleurs des bois, dense entre les chênes. Pas de collision (on marche à travers). Évite les tuiles
   *  déjà occupées (chênes), les chemins, l'eau et le village. */
  scatterForestUndergrowth() {
    const place = (tx, ty, pool, dyBias) => {
      if (this.occupied.has(this.key(tx, ty)) || this.onPath(tx, ty, 1) || this.onWater(tx, ty, 1)) return
      this.add.image(tx * TILE + 8, ty * TILE + 8, 'nature', Phaser.Utils.Array.GetRandom(pool)).setDepth(ty * TILE + dyBias)
    }
    for (let y = 2; y < MAP_H - 2; y++) {
      for (let x = 2; x < MAP_W - 2; x++) {
        if (this.biomeAt(x, y) !== 'forest' || this.nearSpawn(x, y, 6)) continue
        const roll = Phaser.Math.Between(0, 100)
        if (roll < 8) place(x, y, FERNS, -4) // fougères / hautes herbes
        else if (roll < 13) place(x, y, BUSHES, -4) // buissons
      }
    }
  }

  /** Rochers : surtout en petits amas, un peu en isolé. */
  spawnRocks() {
    const place = (tx, ty) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - 2 || ty > MAP_H - 2) return
      if (this.nearSpawn(tx, ty, 4)) return
      if (this.onPath(tx, ty, 1)) return // pas de rocher sur un chemin
      if (this.onWater(tx, ty, 1)) return // pas de rocher dans une rivière
      if (this.nearBossLair(tx, ty)) return // clairière d'arène = sans rocher
      const b = this.biomeAt(tx, ty)
      if (b === 'forest' || b === 'prairie') return // forêt redécorée + village SANS rochers
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
    // (plus de pierres dans la prairie/village : retiré à la demande)
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
      if (this.nearBossLair(tx, ty)) return // clairière d'arène = sans prop solide
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
      if (this.nearBossLair(tx, ty)) return // clairière d'arène = sans flore
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
        // forêt : pas de props ici (arbres Mystic via scatterForestTrees ; pas de sous-bois)
        case 'forest':
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
      if (b !== 'prairie') return false // fleurs/herbes Ninja : PRAIRIE seulement (forêt redécorée en Sprout)
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

    // (massifs de fleurs de la prairie retirés à la demande)

    // touffes de buissons / herbes hautes (espacées : 2 max collées)
    for (let c = 0; c < 20; c++) {
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
    // Budget de population par biome ∝ sa surface jouable (échantillon 1 tuile sur 4) :
    // aucune zone vide ni surchargée. Prairie (sûre) et cursed (verrouillé) hors-jeu.
    const land = { forest: 0, desert: 0, snow: 0 }
    for (let tx = 2; tx < MAP_W - 2; tx += 2)
      for (let ty = 2; ty < MAP_H - 2; ty += 2) {
        if (this.isOcean(tx, ty)) continue
        const b = this.biomeAt(tx, ty)
        if (land[b] !== undefined) land[b]++
      }
    const total = land.forest + land.desert + land.snow || 1
    for (const biome of ['forest', 'desert', 'snow']) {
      this.populateBiome(biome, Math.round((MONSTER_COUNT * land[biome]) / total))
    }
  }

  /** Peuple UN biome avec `budget` monstres ISOLÉS, bien espacés (couverture uniforme de la zone,
   *  pas de regroupement en camps -> pas de zones vides, et les élites restent seules). */
  populateBiome(biome, budget) {
    if (budget <= 0) return
    for (let placed = 0, guard = 0; placed < budget && guard < budget * 16; guard++) {
      const t = this.findTileInBiome(biome, { gap: MONSTER_GAP })
      if (!t) break
      this.placeMonsterAt(t.tx, t.ty, biome, {})
      placed++
    }
  }

  /** true si la tuile peut accueillir un monstre (dans la map, hors village/eau/objet réservé). */
  spawnableTile(tx, ty) {
    return (
      tx >= 2 && ty >= 2 && tx <= MAP_W - 3 && ty <= MAP_H - 3 &&
      !this.nearSpawn(tx, ty, 8) && !this.occupied.has(this.key(tx, ty)) && !this.onWater(tx, ty, 1) &&
      !this.nearBossLair(tx, ty) // l'arène du boss reste vide de mobs ordinaires
    )
  }

  /** true si un monstre vivant est à moins de `gap` tuiles de (tx,ty). */
  monsterTooClose(tx, ty, gap) {
    for (const m of this.monsters.getChildren())
      if (m.active && this.dist(tx, ty, m.x / TILE, m.y / TILE) < gap) return true
    return false
  }

  /** Tire une tuile valide AU HASARD dans un biome donné (espacée des autres mobs, et
   *  optionnellement loin de centres `awayFrom`). Renvoie {tx,ty} ou null après N essais. */
  findTileInBiome(biome, { gap = MONSTER_GAP, awayFrom = null, awayDist = 0 } = {}) {
    for (let tries = 0; tries < 120; tries++) {
      const tx = Phaser.Math.Between(2, MAP_W - 3)
      const ty = Phaser.Math.Between(2, MAP_H - 3)
      if (!this.spawnableTile(tx, ty) || this.biomeAt(tx, ty) !== biome) continue
      if (awayFrom && awayFrom.some((c) => this.dist(tx, ty, c.tx, c.ty) < awayDist)) continue
      if (this.monsterTooClose(tx, ty, gap)) continue
      return { tx, ty }
    }
    return null
  }

  /** Crée et enregistre un monstre à (tx,ty) : type imposé ou tiré du biome, niveau = base du
   *  biome ±1, élite éventuelle (tirage SHINY au spawn initial). Renvoie le monstre. */
  placeMonsterAt(tx, ty, biome, { type = null, elite = null } = {}) {
    const pool = MONSTERS_BY_BIOME[biome] || Object.keys(MONSTER_TYPES)
    const typeKey = type || Phaser.Utils.Array.GetRandom(pool)
    const isElite = elite !== null ? elite : Phaser.Math.Between(1, 100) <= SHINY_CHANCE
    let level = this.monsterLevelAt(tx, ty) + Phaser.Math.Between(-1, 1) + (isElite ? 1 : 0)
    level = Phaser.Math.Clamp(level, 1, MONSTER_MAX_LEVEL)
    const name = isElite ? `${Phaser.Utils.Array.GetRandom(ELITE_NAMES)} le ${MONSTER_TYPES[typeKey].name}` : null
    const m = new Monster(this, tx * TILE + 8, ty * TILE + 8, typeKey, { level, elite: isElite, name })
    this.monsters.add(m)
    return m
  }

  /**
   * Place UN monstre à un endroit valide (hors spawn/décor/eau, type selon le biome).
   * `initial` = false pour un respawn -> évite d'apparaître trop près du joueur.
   */
  /** Niveau de BASE d'un monstre (1 à 5) selon sa place DANS son biome : bord intérieur
   *  (côté village) = niv1, bord extérieur (le plus loin) = niv5. La variation aléatoire
   *  qui crée la diversité est ajoutée au moment du spawn (cf. spawnOneMonster). */
  monsterLevelAt(tx, ty) {
    if (this.biomeAt(tx, ty) === 'prairie') return 1 // prairie sûre (pas de monstre)
    const d = Math.hypot(tx - this.cx, ty - this.cy) // distance au village
    const t = (d - PRAIRIE_TILE_R) / (LEVEL_REACH - PRAIRIE_TILE_R) // 0 près du village -> 1 au loin
    return Phaser.Math.Clamp(Math.round(1 + t * (MONSTER_MAX_LEVEL - 1)), 1, MONSTER_MAX_LEVEL)
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
      if (this.nearBossLair(tx, ty)) continue // pas de mob ordinaire dans l'arène du boss
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
      // niveau = base du biome (1-5) + variation ±1 -> diversité sur un même type d'ennemi.
      // (déterministe au spawn initial car PRNG seedé ; varié sur les respawns.)
      let level = this.monsterLevelAt(tx, ty) + Phaser.Math.Between(-1, 1) + (elite ? 1 : 0)
      level = Phaser.Math.Clamp(level, 1, MONSTER_MAX_LEVEL)
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
  /** Calcule le repaire de chaque boss EN PROFONDEUR de sa zone : désert = le plus au SUD, neige =
   *  le plus au NORD, forêt = le plus à l'EST. On exige une marge intérieure (pas sur un cap
   *  de côte). Loin du spawn = exigence. Calculé tôt (avant les chemins) avec biome + océan. */
  computeBossLairs() {
    this.bossLairs = {}
    this.bossDefs = BIOME_BOSSES // exposé pour l'UI (noms des boss sur la carte du monde)
    // marge de TERRE autour (≈5 tuiles) -> l'arène ne tombe pas dans l'eau
    const inland = (tx, ty) => {
      for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-4, -4], [4, -4], [-4, 4], [4, 4]]) {
        if (this.isOcean(tx + dx, ty + dy)) return false
      }
      return true
    }
    // INTÉRIEUR du biome : entouré du même biome à ≈6 tuiles -> loin des FRONTIÈRES (donc des rivières/gués)
    const interior = (tx, ty, b) => {
      for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6], [-5, -5], [5, -5], [-5, 5], [5, 5]]) {
        if (this.biomeAt(tx + dx, ty + dy) !== b) return false
      }
      return true
    }
    // candidats de repaire par biome : intérieur de zone, terre ferme, PAS collé au village
    const cands = {}
    for (let ty = 8; ty < MAP_H - 8; ty += 3) {
      for (let tx = 8; tx < MAP_W - 8; tx += 3) {
        if (Math.hypot(tx - this.cx, ty - this.cy) < 36) continue // pas à côté du village
        if (this.isOcean(tx, ty) || this.isIsland(tx, ty)) continue
        const b = this.biomeAt(tx, ty)
        if (!BIOME_BOSSES[b] || b === 'cursed') continue // cursed = île, géré à part
        if (!inland(tx, ty) || !interior(tx, ty, b)) continue
        ;(cands[b] || (cands[b] = [])).push({ tx, ty })
      }
    }
    const MIN_SEP = 28 // distance mini (tuiles) entre 2 repaires, TOUTES ZONES CONFONDUES (jamais côte à côte)
    const placed = [] // tous les repaires déjà posés -> séparation globale
    const farFromPlaced = (c) => placed.every((p) => Math.hypot(p.tx - c.tx, p.ty - c.ty) >= MIN_SEP)
    for (const b of Object.keys(BIOME_BOSSES)) {
      if (b === 'cursed' || b === 'coast') continue // gérés à part (île / rivage)
      const need = BIOME_BOSSES[b].length
      const list = cands[b] || []
      if (!list.length) { this.bossLairs[b] = []; continue }
      list.sort((a, z) => Math.hypot(a.tx - this.cx, a.ty - this.cy) - Math.hypot(z.tx - this.cx, z.ty - this.cy))
      const picks = []
      while (picks.length < need) {
        const valid = list.filter(farFromPlaced) // assez loin de TOUS les repaires déjà posés
        if (!valid.length) break
        // 1er repaire = médian en distance au village ; suivants = le plus loin des repaires de la zone
        let bestC = picks.length === 0 ? valid[Math.floor(valid.length / 2)] : null
        if (bestC === null) {
          let bestMin = -1
          for (const c of valid) {
            let m = Infinity
            for (const p of picks) m = Math.min(m, Math.hypot(p.tx - c.tx, p.ty - c.ty))
            if (m > bestMin) { bestMin = m; bestC = c }
          }
        }
        picks.push(bestC)
        placed.push(bestC)
      }
      this.bossLairs[b] = picks.map((p) => ({ tx: p.tx, ty: p.ty }))
    }
    // CURSED = ÎLE MAUDITE (la boucle saute les îles) : repaires disposés autour du centre de l'île.
    const ccx = this.icx + CURSED_ISLE.ox
    const ccy = this.icy + CURSED_ISLE.oy
    const cn = BIOME_BOSSES.cursed.length
    this.bossLairs.cursed = []
    for (let i = 0; i < cn; i++) {
      const a = (i / cn) * Math.PI * 2
      this.bossLairs.cursed.push({ tx: Math.round(ccx + Math.cos(a) * 14), ty: Math.round(ccy + Math.sin(a) * 14) })
    }

    // CÔTE : repaire du Kraken = tuile de TERRE au bord de l'océan (rivage), la plus LOIN du village
    // possible (un cap au bout d'une contrée), avec assez de terre ferme au centre pour l'arène.
    this.bossLairs.coast = []
    if (BIOME_BOSSES.coast?.length) {
      const seaWithin = (tx, ty, rad) => { // de l'océan dans un rayon proche -> c'est un rivage
        for (let r = 1; r <= rad; r++) {
          for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r]]) {
            if (this.isOcean(tx + dx, ty + dy)) return true
          }
        }
        return false
      }
      const solidCenter = (tx, ty) => { // terre ferme à ≈2 tuiles tout autour -> l'arène ne tombe pas dans l'eau au centre
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]]) {
          if (this.isOcean(tx + dx, ty + dy)) return false
        }
        return true
      }
      let best = null
      let bestD = -1
      for (let ty = 8; ty < MAP_H - 8; ty += 2) {
        for (let tx = 8; tx < MAP_W - 8; tx += 2) {
          if (this.isOcean(tx, ty) || this.isIsland(tx, ty)) continue
          const b = this.biomeAt(tx, ty)
          if (b === 'prairie') continue // pas au village
          if (!seaWithin(tx, ty, 4) || !solidCenter(tx, ty)) continue
          if (!farFromPlaced({ tx, ty })) continue // pas collé à un autre repaire
          const d = Math.hypot(tx - this.cx, ty - this.cy)
          if (d < 40) continue
          if (d > bestD) { bestD = d; best = { tx, ty } }
        }
      }
      if (best) { this.bossLairs.coast = [best]; placed.push(best) }
    }
  }

  /** Tuile de TERRE du bon biome proche de (tx,ty), en spirale (test océan/île/biome uniquement). */
  findLairTile(tx, ty, biome) {
    tx = Math.round(tx)
    ty = Math.round(ty)
    for (let r = 0; r <= 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue
          const x = tx + dx
          const y = ty + dy
          if (x < 4 || y < 4 || x > MAP_W - 5 || y > MAP_H - 5) continue
          if (this.isOcean(x, y) || this.isIsland(x, y) || this.biomeAt(x, y) !== biome) continue
          return { tx: x, ty: y }
        }
      }
    }
    return null
  }

  /** Place 15 PNJ dispersés sur tout le continent (hors village/eau, espacés, dans tous les biomes).
   *  Positions calculées tôt (avant les chemins) pour que de petits sentiers s'y greffent. */
  computeWildNpcs() {
    const names = ['Edda', 'Rurik', 'Sylvane', 'Bram', 'Oona', 'Tibert', 'Maelis', 'Joran', 'Cwen', 'Hadric', 'Niamh', 'Osric', 'Veya', 'Doran', 'Liesel']
    const texes = ['npc_villager', 'npc_woman', 'npc_boy']
    const pool = [
      ['Bonjour, voyageur. La route est sûre tant qu\'on y reste.'],
      ['Plus tu t\'éloignes du village, plus les bêtes sont coriaces.'],
      ['On raconte qu\'un monstre colossal rôde au fond de cette contrée...'],
      ['Le marchand du village rachète tout ce que tu ramasses.'],
      ['Suis les chemins : ils mènent quelque part, l\'eau non.'],
      ['Repose-toi un instant, l\'aventurier. Puis repars plus fort.'],
    ]
    this.wildNpcs = []
    for (let guard = 0; this.wildNpcs.length < 15 && guard < 6000; guard++) {
      const tx = Phaser.Math.Between(8, MAP_W - 9)
      const ty = Phaser.Math.Between(8, MAP_H - 9)
      if (this.isOcean(tx, ty) || this.isIsland(tx, ty)) continue
      if (this.biomeAt(tx, ty) === 'prairie') continue // pas dans le village
      if (this.dist(tx, ty, this.cx, this.cy) < 24) continue // pas collé au village
      if (this.wildNpcs.some((n) => this.dist(tx, ty, n.tx, n.ty) < 20)) continue // espacés
      const i = this.wildNpcs.length
      this.wildNpcs.push({ tx, ty, tex: texes[i % texes.length], name: names[i], lines: pool[i % pool.length] })
    }
  }

  spawnBosses() {
    this.bosses = []
    for (const biome of Object.keys(BIOME_BOSSES)) {
      const list = BIOME_BOSSES[biome]
      for (let i = 0; i < list.length; i++) this.spawnBoss(biome, i)
    }
    this.spawnSeaDragon() // Dragon des Abysses : rôde dans l'océan autour de l'île (ambiance, pas un boss classique)
  }

  /** Construit une boucle de points qui ÉPOUSE la côte (juste dans l'océan) : pour chaque angle, on
   *  marche du centre de l'île vers l'extérieur jusqu'à la 1re tuile d'océan = la côte, puis on décale
   *  de SEA_OFFSET tuiles dans l'eau. -> le dragon longe la côte sans jamais monter sur la terre. */
  buildSeaPath() {
    const cx = this.icx
    const cy = this.icy
    const N = 240 // résolution de la boucle
    const SEA_OFFSET = 3 // tuiles au large de la côte (proche du rivage)
    const maxR = Math.max(ISLAND_RX, ISLAND_RY) + 30
    const pts = []
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      let coastR = maxR
      for (let r = 6; r <= maxR; r++) {
        if (this.isOcean(Math.round(cx + r * ca), Math.round(cy + r * sa))) { coastR = r; break }
      }
      const r = coastR + SEA_OFFSET
      pts.push({ x: (cx + r * ca) * TILE + 8, y: (cy + r * sa) * TILE + 8 })
    }
    return pts
  }

  /** Crée le Dragon de mer d'AMBIANCE : il LONGE la côte sans fin (chemin précalculé dans l'océan ;
   *  nage = ignore la collision ; aucune interaction tant que la nage n'existe pas). */
  spawnSeaDragon() {
    const path = this.buildSeaPath()
    // espacement des segments voulu (~28 px) converti en indices de chemin (selon l'écart moyen des points)
    let len = 0
    for (let i = 0; i < path.length; i++) {
      const a = path[i]
      const b = path[(i + 1) % path.length]
      len += Math.hypot(b.x - a.x, b.y - a.y)
    }
    const segGap = 28 / (len / path.length)
    this.seaDragon = new Monster(this, path[0].x, path[0].y, 'dragonblue', {
      seaPatrol: { path, speed: path.length / 70, segGap }, // ~70 s pour un tour complet
    })
  }

  /** (Re)crée le boss `index` d'un biome à SON repaire (un repaire par boss), re-calé sur tuile libre. */
  spawnBoss(biome, index = 0) {
    const cfg = BIOME_BOSSES[biome]?.[index]
    const lair = this.bossLairs?.[biome]?.[index]
    if (!cfg || !lair) return null
    const tile = this.findBossTile(lair.tx, lair.ty, biome) || lair
    if (!tile) return null
    const level = 7 // boss = niveau de scaling élevé (PV "comme avant", pas un mob) ; affiché plafonné à 5
    const boss = new Monster(this, tile.tx * TILE + 8, tile.ty * TILE + 8, cfg.type, { level, boss: true, name: cfg.name })
    boss.bossBiome = biome
    boss.bossIndex = index // pour le respawn ciblé
    boss.homeX = tile.tx * TILE + 8 // ancre de patrouille = son repaire
    boss.homeY = tile.ty * TILE + 8
    boss.arenaR = cfg.arenaR ?? ARENA_RADIUS // rayon de l'arène scellée (réglable par boss)
    // centre de l'arène = centre du REPAIRE (lair) = centre de la clairière dégagée d'arbres.
    boss.arenaCx = lair.tx * TILE + 8
    boss.arenaCy = lair.ty * TILE + 8
    this.monsters.add(boss)
    if (!boss.dragon) this.makeBossSolid(boss) // mur infranchissable + dégâts de contact (cf. méthode)
    this.bosses.push(boss)
    return boss
  }

  /** Rend un boss SOLIDE : immovable (fixé APRÈS l'ajout au groupe, sinon Arcade peut le réinitialiser ->
   *  boss poussable) + collider joueur portant les dégâts de contact. Le collider est IGNORÉ quand le
   *  Guerrier dash (il traverse pour esquiver) OU quand le boss lui-même charge (il fonce DROIT à travers
   *  le joueur ; les dégâts de la charge passent alors par le test de distance dans updateBossCharge). */
  makeBossSolid(boss) {
    boss.setImmovable(true)
    if (boss.body) boss.body.pushable = false
    this.physics.add.collider(
      this.player, boss,
      () => this.onBossContact(boss),
      () => !this.player.dashing && !boss.charging,
    )
  }

  /** ARÈNE DE BOSS : verrouillage par proximité + mur invisible tant que le boss vit.
   *  Appelée chaque frame APRÈS player.update (la vélocité du joueur est déjà posée). */
  updateArena() {
    const p = this.player
    if (this.activeArena) {
      const a = this.activeArena
      if (!a.boss.active || a.boss.hp <= 0) { this.releaseArena(); return } // boss mort -> ouverture
      // MUR INVISIBLE : on confine le CORPS du joueur dans le cercle (centre du body = source de vérité
      // avant le step physique). On supprime seulement la vitesse RADIALE sortante (glisse le long du mur).
      const b = p.body
      const dx = b.center.x - a.cx
      const dy = b.center.y - a.cy
      const d = Math.hypot(dx, dy)
      if (d > a.r) {
        const ux = dx / (d || 1)
        const uy = dy / (d || 1)
        b.position.set(a.cx + ux * a.r - b.halfWidth, a.cy + uy * a.r - b.halfHeight)
        const vr = b.velocity.x * ux + b.velocity.y * uy
        if (vr > 0) { b.velocity.x -= vr * ux; b.velocity.y -= vr * uy }
        p.moveTarget = null // annule un clic-vers hors arène (sinon le joueur pousse le mur en boucle)
      }
      // CONFINE AUSSI LE BOSS : sa charge (dash rapide) pourrait le faire sortir du cercle -> on garde
      // son centre dans l'arène et on coupe sa vitesse radiale sortante (il s'arrête au mur, ne s'échappe pas).
      const bb = a.boss.body
      if (bb) {
        const bmax = Math.max(20, a.r - Math.max(bb.halfWidth, bb.halfHeight)) // garde tout le CORPS dans le cercle
        const bx = bb.center.x - a.cx
        const by = bb.center.y - a.cy
        const bd = Math.hypot(bx, by)
        if (bd > bmax) {
          const ux = bx / (bd || 1)
          const uy = by / (bd || 1)
          bb.position.set(a.cx + ux * bmax - bb.halfWidth, a.cy + uy * bmax - bb.halfHeight)
          const vr = bb.velocity.x * ux + bb.velocity.y * uy
          if (vr > 0) { bb.velocity.x -= vr * ux; bb.velocity.y -= vr * uy }
        }
      }
      return
    }
    // pas encore verrouillée : l'arène se scelle quand le COMBAT commence vraiment (le joueur a TAPÉ le
    // boss ou s'est fait TOUCHER). Pas sur la simple approche -> on peut s'avancer, observer, repartir.
    for (const b of this.bosses || []) {
      if (b.active && b.hp > 0 && b.combatEngaged) {
        this.lockArena(b)
        break
      }
    }
  }

  /** Effet visuel quand un BOSS frappe le joueur : éclat de tranche + secousse + son d'impact +
   *  bref "coup" du boss vers le joueur (lunge tween). Marche pour tous les boss (rig/dragon/mob). */
  /** Contact joueur↔boss SOLIDE (callback du collider) : c'est ICI que se font les dégâts de contact des
   *  boss (l'overlap général ne se déclenche pas sur un corps solide, séparé par le collider). Pendant une
   *  charge, tryBite majore les dégâts (`charging`) -> retour visuel renforcé. */
  onBossContact(boss) {
    if (!boss.active || boss.hp <= 0) return
    if (boss.tryBite(this.player, this.time.now)) {
      if (boss.charging) this.onBossChargeHit(boss)
      else { this.flashHurt(); this.bossAttackFx(boss) }
    }
  }

  bossAttackFx(boss) {
    const p = this.player
    const col = boss.isRaid ? 0x6fb0ff : 0xff7a3a // raid = bleu glacial, sinon orange
    const fx = this.add.sprite(p.x, p.y - 4, 'fx_circslash').setDepth(p.y + 60).setScale(1.9).setTint(col)
    fx.play('fx-circslash')
    fx.once('animationcomplete', () => fx.destroy())
    this.cameras.main.shake(130, 0.006)
    Audio.sfx(SFX.hit, { vol: 0.7, detune: -200 }) // impact lourd
  }

  /** Zone de danger au sol pour une CHARGE de boss : un long rectangle dans l'axe de la ruée qui pulse
   *  pendant le télégraphe, puis flashe et s'efface pendant le dash. Le joueur esquive en sortant de l'axe. */
  bossChargeTelegraph(boss, angle, cfg) {
    let len = (cfg.speed * cfg.duration) / 1000 + Math.max(boss.body.halfWidth, boss.body.halfHeight)
    // CAPE la ligne sur le bord de l'arène (le boss y est confiné) -> elle ne dépasse jamais le cercle.
    const ar = this.activeArena
    if (ar && ar.boss === boss) {
      const fx = boss.x - ar.cx
      const fy = boss.y - ar.cy
      const b = 2 * (fx * Math.cos(angle) + fy * Math.sin(angle))
      const c = fx * fx + fy * fy - ar.r * ar.r
      const disc = b * b - 4 * c
      if (disc > 0) { const t = (-b + Math.sqrt(disc)) / 2; if (t > 0) len = Math.min(len, t) }
    }
    const w = (cfg.hitRadius ?? 30) * 2 // largeur affichée = bande réellement dangereuse (rayon de touche ×2)
    const col = cfg.color ?? (boss.isRaid ? 0x8b2fd6 : 0xff3030) // couleur du dash propre au boss (bleu/rouge)
    const zone = this.add.rectangle(boss.x, boss.y, len, w, col, 0.16).setOrigin(0, 0.5).setRotation(angle).setDepth(boss.y - 2)
    const core = this.add.rectangle(boss.x, boss.y, len, 3, col, 0.7).setOrigin(0, 0.5).setRotation(angle).setDepth(boss.y - 1)
    // pulse d'avertissement pendant le télégraphe
    this.tweens.add({ targets: zone, fillAlpha: 0.42, duration: cfg.windup / 2, yoyo: true, repeat: 1, ease: 'Sine.inOut' })
    Audio.sfx(SFX.whoosh, { vol: 0.45, detune: -500 }) // grondement de mise en garde
    this.time.delayedCall(cfg.windup, () => {
      if (!zone.active) return
      zone.setFillStyle(col, 0.5) // flash à l'instant du dash
      Audio.sfx(SFX.whoosh, { vol: 0.8, detune: 200 }) // souffle de la ruée
      this.tweens.add({ targets: [zone, core], alpha: 0, duration: cfg.duration, onComplete: () => { zone.destroy(); core.destroy() } })
    })
  }

  /** Gros coup d'une charge qui touche le joueur : retour visuel renforcé (par rapport à une morsure). */
  onBossChargeHit(boss) {
    const p = this.player
    const fx = this.add.sprite(p.x, p.y - 4, 'fx_circslash').setDepth(p.y + 60).setScale(2.4).setTint(boss.def.charge?.color ?? (boss.isRaid ? 0x8b2fd6 : 0xff7a3a))
    fx.play('fx-circslash')
    fx.once('animationcomplete', () => fx.destroy())
    this.flashHurt()
    this.cameras.main.shake(220, 0.011)
    Audio.sfx(SFX.hit, { vol: 0.85, detune: -350 })
  }

  /** Scelle l'arène autour du REPAIRE du boss (centre fixe = clairière dégagée d'arbres). */
  lockArena(boss) {
    boss.engage() // le boss s'engage définitivement
    const cx = boss.arenaCx ?? boss.x
    const cy = boss.arenaCy ?? boss.y
    // rayon : au moins ARENA_RADIUS, mais agrandi pour ENGLOBER le joueur au moment du lock
    // (il peut avoir aggro le boss depuis le bord/à distance) -> jamais piégé DEHORS du cercle.
    const base = boss.arenaR ?? ARENA_RADIUS
    const r = Phaser.Math.Clamp(this.dist(this.player.x, this.player.y, cx, cy) + 28, base, 360)
    const col = boss.isRaid ? 0x8b2fd6 : 0xd23a3a // raid = violet, boss solo = rouge
    const fill = this.add.circle(cx, cy, r, col, 0.07).setDepth(1) // sol scellé teinté
    const ring = this.add.circle(cx, cy, r, col, 0).setStrokeStyle(3, col, 0.9).setDepth(900000) // bord toujours visible
    this.tweens.add({ targets: [fill, ring], alpha: 0.45, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.activeArena = { boss, cx, cy, r, fill, ring }
    // ÉVACUE les mobs ordinaires présents dans le cercle -> on n'affronte QUE le boss (pas une meute)
    this.monsters.getChildren().slice().forEach((m) => {
      if (m.isBoss || !m.active) return
      if (this.dist(m.x, m.y, cx, cy) <= r) m.despawn()
    })
    this.shockwaveDestroy(cx, cy, r) // onde de choc : pulvérise les arbres présents dans l'arène
    const msg = boss.isRaid ? '☠ Arène scellée — aucune fuite possible !' : '⚔ Arène scellée !'
    this.scene.get('UIScene')?.showToast?.(msg, boss.isRaid ? '#d6a3ff' : '#ffd86b')
    this.cameras.main.shake(250, 0.006)
    // RUGISSEMENT : un cri descendu en hauteur (rate lent + detune grave) = grognement de boss.
    // Le raid (plus gros) gronde encore plus grave/fort que le boss solo.
    Audio.sfx('sfx_roar', boss.isRaid ? { vol: 1, rate: 0.5, detune: -700 } : { vol: 0.85, rate: 0.62, detune: -450 })
  }

  /** ONDE DE CHOC à l'ouverture d'une arène : un anneau blanc s'étend depuis le centre et PULVÉRISE tous
   *  les obstacles destructibles (arbres) dans le rayon -> l'arène se dégage pour le combat. */
  shockwaveDestroy(cx, cy, r) {
    // anneau qui s'étend (proxy {v} -> setRadius/alpha ; on ne tween pas l'objet directement)
    const wave = this.add.circle(cx, cy, 8).setStrokeStyle(5, 0xffffff, 0.9).setDepth(900001)
    this.tweens.add({
      targets: { v: 0 }, v: 1, duration: 480, ease: 'Cubic.out',
      onUpdate: (tw, t) => { wave.setRadius(8 + (r - 8) * t.v); wave.setAlpha(0.9 * (1 - t.v)) },
      onComplete: () => wave.destroy(),
    })
    const survivors = []
    for (const d of this.destructibles || []) {
      const dist = Math.hypot(d.x - cx, d.y - cy)
      if (dist > r) { survivors.push(d); continue }
      d.body?.destroy() // retire la collision
      const ti = this.trees.indexOf(d.entry) // retire le feuillage du suivi (sinon le fade référence des sprites détruits)
      if (ti >= 0) this.trees.splice(ti, 1)
      const delay = (dist / r) * 220 // les plus proches volent en éclats en premier (front de l'onde)
      for (const s of d.sprites) {
        this.tweens.add({ targets: s, alpha: 0, y: s.y - 10, scaleX: 0.7, scaleY: 0.7, duration: 300, delay, onComplete: () => s.destroy() })
      }
    }
    this.destructibles = survivors
    Audio.sfx(SFX.whoosh, { vol: 0.7, detune: -300 }) // souffle de l'onde
  }

  /** Libère l'arène (boss vaincu, ou mort du joueur). */
  releaseArena() {
    const a = this.activeArena
    if (!a) return
    a.fill?.destroy()
    a.ring?.destroy()
    this.activeArena = null
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

  /** Vrai si (tx,ty) tombe dans la CLAIRIÈRE d'arène d'un boss (rayon dégagé autour de son repaire).
   *  Sert à interdire arbres/rochers/props là -> l'arène reste un terrain ouvert (pas de cachette / bug). */
  nearBossLair(tx, ty) {
    const lairs = this.bossLairs
    if (!lairs) return false
    for (const k in lairs) {
      for (const l of lairs[k]) {
        if (this.dist(tx, ty, l.tx, l.ty) <= BOSS_CLEAR_TILES) return true
      }
    }
    return false
  }

  /** Vrai si AUCUN océan/île détachée dans un disque de rayon r tuiles autour de (tx,ty).
   *  -> garantit que l'arène/clairière du boss tient ENTIÈREMENT sur la terre ferme (pas dans l'eau).
   *  (Appelé pendant computeBossLairs, avant les rivières : seul l'océan est connu, ce qui suffit ici.) */
  hasLandClearance(tx, ty, r) {
    const r2 = r * r
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue
        if (this.isOcean(tx + dx, ty + dy) || this.isIsland(tx + dx, ty + dy)) return false
      }
    }
    return true
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
        hx: cx + 6, hy: cy - 3, key: 'house_orange', tex: 'npc_woman', name: 'Mira',
        lines: [
          'Le marchand est au centre du village. Parle-lui avec la touche E.',
          'Appuie sur C pour ouvrir ta fiche : équipe armes et armures dans ton sac.',
          'Les monstres lâchent de l\'or et de l\'équipement, ramasse tout en marchant dessus !',
          'Reviens vendre ton butin au marchand pour t\'acheter mieux.',
        ],
      },
      {
        hx: cx - 8, hy: cy - 3, key: 'house_long', tex: 'npc_boy', name: 'Tom',
        lines: [
          'Franchis les ponts pour sortir de la prairie et explorer le monde !',
          'À l\'est et au sud : la forêt puis le désert. Au nord : les terres gelées.',
          'Plus tu t\'éloignes du village, plus les monstres sont coriaces.',
          'Au-delà du grand lac noir, les terres maudites... personne n\'en revient !',
        ],
      },
    ]
    this.villageFootprints = [] // emprises des maisons du village -> herbe foncée (plaza) garantie dessous
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
      this.villageFootprints.push({ tx: hx, ty: hy, w: b.w, h: b.h })
      v.nx = hx + b.door[0] // PNJ devant la porte (même colonne)
      v.ny = hy + b.h // une rangée sous la base de la maison réellement posée
    }
    this.paintVillageGround() // place + chemins reliant les 3 maisons (look "village")
    // hameaux inhabités du désert (bande du bas) : coins OPPOSÉS, loin du centre
    this.placeBuildingNear(cx - 52, cy + 44, 'house_long') // désert sud-ouest
    this.placeBuildingNear(cx + 50, cy + 44, 'house_orange') // désert sud-est
    this.spawnVillageFlags() // bannières animées qui encadrent la place
  }

  /** Moulin à eau (maison-moulin ronde animée) posé sur la berge NORD de la rivière sud, près du
   *  gué central (~208,153). On cherche la tuile d'eau de rivière la plus proche dont la tuile au-dessus
   *  est de la terre = bord nord -> le moulin s'y adosse, base trempant dans l'eau. Collision + réservé. */
  spawnWatermill() {
    const TX = 208 // cible (cf. choix sur la carte : rivière forêt|désert, près du gué central)
    const TY = 153
    const isRiver = (x, y) => this.waterCells.has(this.key(x, y)) && !this.isOcean(x, y)
    let best = null
    let bestD = Infinity
    for (let y = TY - 10; y <= TY + 10; y++) {
      for (let x = TX - 14; x <= TX + 14; x++) {
        if (!isRiver(x, y)) continue
        if (isRiver(x, y - 1)) continue // au-dessus = encore de l'eau -> pas le bord nord
        if (this.fordCells && this.fordCells.has(this.key(x, y))) continue // pas sur un gué
        const d = Math.hypot(x - TX, y - TY)
        if (d < bestD) { bestD = d; best = { x, y } }
      }
    }
    if (!best) return
    const bx = best.x * TILE + 8
    const by = best.y * TILE // ligne d'eau (haut de la 1re rangée de rivière)
    const depth = (best.y + 1) * TILE + 50 // au-dessus de l'eau, trié avec le monde
    // corps du moulin (×1,3) : base posée à la ligne d'eau (le bas trempe un peu dans la rivière)
    this.add
      .sprite(bx, by + 10, 'watermill', 0)
      .setOrigin(0.5, 0.8)
      .setScale(1.3)
      .setDepth(depth) // au-dessus de l'eau, trié avec le monde
      .play('watermill')
    // collision sur la partie "terre" (au-dessus de la ligne d'eau) + réservation des tuiles
    const rect = this.add.rectangle(bx, (best.y - 1) * TILE + 4, 26, 16)
    this.physics.add.existing(rect, true)
    this.obstacles.add(rect)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -2; dy <= 0; dy++) this.occupied.add(this.key(best.x + dx, best.y + dy))
  }

  /** Bannière animée (déco, sans collision) au coin haut-droit de la place du village. */
  spawnVillageFlags() {
    const tx = this.cx + 4
    const ty = this.cy - 3
    this.add
      .sprite(tx * TILE + 8, ty * TILE + TILE, 'flag_blue', 0)
      .setOrigin(0.5, 1) // pied du mât posé au bas de la tuile
      .setDepth((ty + 1) * TILE) // tri Y : le héros passe devant quand il est en dessous
      .play('flag-blue')
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
    // étend la place SOUS chaque maison (+1 tuile de marge) -> la maison repose entièrement sur l'herbe
    // foncée du village (sinon le haut de la maison Nord déborde sur l'herbe claire de la prairie).
    for (const rc of this.villageFootprints || []) {
      for (let dx = 0; dx < rc.w; dx++) {
        for (let dy = 0; dy < rc.h; dy++) plaza.add(this.key(rc.tx + dx, rc.ty + dy))
      }
    }
    // chemins de terre : de chaque porte vers le centre (tracé en L, largeur 2)
    const road = new Set()
    const put = (x, y) => {
      if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) road.add(this.key(x, y))
    }
    // chemins LARGEUR 3 CENTRÉS sur la porte (v.nx = colonne de la porte) : largeur impaire -> reste
    // pile centré sous la porte (une largeur paire redécalerait), et assez large pour un vrai chemin.
    const carveLine = (x0, y0, x1, y1) => {
      const sx = Math.sign(x1 - x0) || 1
      for (let x = x0; x !== x1 + sx; x += sx) { put(x, y0 - 1); put(x, y0); put(x, y0 + 1) }
      const sy = Math.sign(y1 - y0) || 1
      for (let y = y0; y !== y1 + sy; y += sy) { put(x1 - 1, y); put(x1, y); put(x1 + 1, y) }
    }
    for (const v of this.villagers) carveLine(v.nx, v.ny, cx, cy)

    // place SOUS (couche sol), chemins de terre PAR-DESSUS (couche overlay)
    this.paintBlob(plaza, BLOB.darkGrass, true, this.groundLayer)
    this.paintBlob(road, BLOB.dirt, true)
    // la déco (fleurs/herbes) évite la place et les chemins du village
    this.plazaCells = plaza
    for (const k of road) this.pathCells.add(k)
    // RE-MARQUE la place du village : l'ancien sol foncé est masqué par l'herbe Sprout -> on assombrit
    // un peu la teinte de l'herbe sur la place (légère variation) pour retrouver le repère du village.
    for (const k of plaza) {
      const [x, y] = k.split(',').map(Number)
      const t = this.grassLayer?.getTileAt(x, y)
      if (t) t.tint = tileNoise(x, y, 63) < 0.5 ? 0xb0bd86 : 0xa6b47c
    }
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
    const mx = this.cx * TILE + 3 * TILE // au centre du VILLAGE (décalé), 3 cases à droite du spawn
    const my = this.cy * TILE
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
    return !!(ui && (ui.dialogueOpen || ui.shopOpen || ui.forgeOpen || ui.pauseOpen || ui.mapOpen))
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
    // PNJ dispersés sur la map (au bout des petits chemins) : cliquables / "Parler (E)" comme les autres
    for (const npc of this.wildNpcs || []) {
      this.addNpc(npc.tx, npc.ty, npc.tex, npc.name, npc.lines, 'talk')
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
  /** Attaque de base déclenchée par le bouton ATK : épée (melee) ou projectile (ranged) selon la classe. */
  basicAttack() {
    const p = this.player
    if (!p) return
    const w = p.equipped?.weapon
    if (w?.ranged) this.throwWeapon(w) // arme à LANCER (couteau/shuriken)
    else if (p.abilities.melee) this.doAttack()
    else if (p.abilities.ranged) this.shootForward()
  }

  /** Attaque d'une ARME À LANCER : projette le sprite de l'arme vers l'ennemi visible le plus proche
   *  (ou tout droit devant), aux dégâts d'attaque du héros. */
  throwWeapon(weapon) {
    if (this.uiBusy()) return
    const p = this.player
    if (p.attacking || p.hp <= 0) return
    if (!p.startShoot(this.time.now)) return
    const target = this.nearestMonster(p.x, p.y, 220, true)
    let tx
    let ty
    if (target) {
      tx = target.x
      ty = target.y
    } else {
      const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing] || [0, 1]
      tx = p.x + dir[0] * 120
      ty = p.y + dir[1] * 120
    }
    const dx = tx - p.x
    const dy = ty - p.y
    if (Math.abs(dx) > Math.abs(dy)) p.facing = dx < 0 ? 'left' : 'right'
    else p.facing = dy < 0 ? 'up' : 'down'
    const proj = this.projectiles.get(p.x, p.y)
    if (!proj) return
    proj.fire(p.x, p.y, tx, ty, p.attackPower, this.time.now, target, 0xffffff, weapon.proj)
  }

  doAttack() {
    if (this.uiBusy()) return
    const p = this.player
    if (!p.abilities.melee) return // classe sans corps à corps (Mage/Soigneur)
    if (!p.startAttack(this.time.now)) return

    const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing]
    const cx = p.x + dir[0] * 14 // centre de la zone, devant le perso
    const cy = p.y + dir[1] * 14
    const RANGE = 20 // rayon de la zone de frappe (généreux)

    // arme équipée -> son sprite fait un MOUVEMENT DE COUP (swing) ; sinon simple arc blanc
    const weapon = p.equipped?.weapon
    const wIcon = weapon?.icon
    if (wIcon && this.textures.exists(wIcon)) this.showWeaponSwing(p.x, p.y, p.facing, wIcon)
    else this.showSlash(p.x, p.y, p.facing)
    // tranche FX selon le TYPE d'arme (lame = tranche courbée, masse = slash circulaire)
    if (weapon?.fx && this.anims.exists(weapon.fx)) this.showSlashFx(p.x, p.y, p.facing, weapon.fx)
    Audio.sfx(SFX.slash, { vol: 0.5 }) // sifflement de la lame à chaque coup

    let hitAny = false
    this.monsters.getChildren().forEach((mon) => {
      if (!mon.active) return
      // touché si la zone de frappe atteint le CORPS du monstre (pas son centre) : on ajoute son
      // demi-gabarit -> on peut frapper les gros boss en étant à leur bord (sinon le centre est trop loin).
      const half = mon.body ? (mon.body.halfWidth + mon.body.halfHeight) / 2 : 0
      if (Phaser.Math.Distance.Between(cx, cy, mon.x, mon.y) <= RANGE + half) {
        hitAny = true
        this.hitMonster(mon, p.attackPower, p.x, p.y, p.meleeKnock) // dégât + recul (Tank repousse +)
      }
    })
    // l'arme s'use quand le coup porte ; casse à 0 -> notif
    if (hitAny) {
      Audio.sfx(SFX.hit, { vol: 0.45 }) // impact net quand le coup porte (1 fois par swing)
      const broke = p.wearSlot('weapon')
      if (broke) this.notifyBreak(broke)
    }
  }

  /** Inflige `amount` dégâts à un monstre + recul depuis (fromX,fromY). CENTRALISÉ ici : toute la
   *  logique de dégât (épée, projectile, sorts) passe par là -> facile à déplacer côté serveur (Phase 4).
   *  Le recul est appliqué AVANT takeDamage (qui peut détruire le monstre -> body disparu). */
  hitMonster(mon, amount, fromX, fromY, knock = 150) {
    if (!mon || !mon.active) return
    // recul AVANT les dégâts (takeDamage peut détruire le monstre -> body disparu). Les BOSS ne sont
    // JAMAIS repoussés (ce sont des murs) ; les mobs ET les élites le sont normalement.
    if (knock > 0 && !mon.isBoss) {
      const a = Math.atan2(mon.y - fromY, mon.x - fromX)
      mon.setVelocity(Math.cos(a) * knock, Math.sin(a) * knock)
      mon.knockbackUntil = this.time.now + 220 // l'IA ne reprend pas la main pendant le recul
    }
    if (mon.isBoss) mon.wake(this.time.now) // TAPER un boss le réveille (-> arène) + délai avant sa 1re attaque
    mon.takeDamage(Math.round(amount))
  }

  /** Monstre actif le plus proche de (x,y) dans `radius`, sinon null. Si `visibleOnly`, on ignore les
   *  monstres HORS de la vue caméra -> on ne peut pas cibler/toucher un mob qu'on ne voit pas. */
  nearestMonster(x, y, radius, visibleOnly = false) {
    let best = null
    let bestD = radius
    const view = visibleOnly ? this.cameras.main.worldView : null
    this.monsters.getChildren().forEach((m) => {
      if (!m.active) return
      if (view && !Phaser.Geom.Rectangle.Contains(view, m.x, m.y)) return // hors écran -> ignoré
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
    const target = this.nearestMonster(p.x, p.y, HOMING_RANGE, true)
    if (target) {
      this.fireProjectile(target.x, target.y, target)
    } else {
      const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing]
      this.fireProjectile(p.x + dir[0] * 120, p.y + dir[1] * 120, null)
    }
  }

  /**
   * Touche 1 : LE sort de la classe. SIMPLE : 1 sort, coût en MANA + cooldown. Auto-ciblé (ennemi le
   * plus proche / soi-même) -> aucune visée pour l'instant (le ciblage WoW = Étape B). Retours clairs :
   * "Pas prêt" (cooldown) / "Mana !" (mana insuffisant). On ne consomme rien si le sort ne part pas.
   */
  castSpell() {
    if (this.uiBusy() || this.gameOver) return
    const p = this.player
    const sp = p.spell
    if (!sp || p.hp <= 0) return
    const now = this.time.now
    if (now < p.nextSpellAt) return this.floatingText(p.x, p.y - 18, 'Pas prêt', '#ffd27a')
    if (p.mana < sp.cost) return this.floatingText(p.x, p.y - 18, 'Mana !', '#7fb3ff')
    const effects = {
      charge: () => this.spellCharge(),
      shield: () => this.spellShield(),
      meteor: () => this.spellMeteor(),
      heal: () => this.spellHeal(),
    }
    const fn = effects[sp.id]
    if (!fn || fn() === false) return // sort inconnu / non exécuté -> on ne consomme ni mana ni cd
    p.spendMana(sp.cost)
    p.nextSpellAt = now + sp.cd * (p.spellCdMul ?? 1) // Focus -> cooldown réduit
  }

  /** Jeu de sons magiques (cast/proj/impact + detune) selon l'APPARENCE du héros (feu/lumière/ombre/arcane). */
  spellSfx() {
    return SPELL_SFX[SPELL_ELEMENT_BY_HERO[this.player.heroKey] || 'arcane']
  }

  /** SOIN (Soigneur) : se soigne SOI-MÊME de 35 % des PV max (en solo il n'y a pas d'allié ; le choix
   *  de cible d'allié arrivera avec le multijoueur). Si déjà au max : message clair, et on ne consomme
   *  ni mana ni cooldown. */
  spellHeal() {
    const p = this.player
    if (p.hp >= p.maxHp) {
      this.floatingText(p.x, p.y - 18, 'PV au max', '#ffd27a')
      return false
    }
    const healed = p.heal(Math.round(p.maxHp * 0.35 * (p.spellPowerMul ?? 1)))
    Audio.sfx(SFX.heal, { vol: 0.6 })
    this.showHealEffect(p.x, p.y)
    const aura = this.add.sprite(p.x, p.y - 2, 'fx_aura').setDepth(p.y + 61).setScale(1.6).setTint(0x8ef0a0) // aura animée teintée vert
    aura.play('fx-aura')
    aura.once('animationcomplete', () => aura.destroy())
    // on voit le bâton de soin se lever pendant l'incantation
    const wIcon = p.equipped?.weapon?.icon
    if (wIcon && this.textures.exists(wIcon)) {
      const staff = this.add.image(p.x + 5, p.y + 1, wIcon).setDepth(p.y + 60).setScale(0.95).setRotation(-0.4)
      this.tweens.add({ targets: staff, y: p.y - 4, duration: 200, yoyo: true, onComplete: () => staff.destroy() })
    }
    this.floatingText(p.x, p.y - 6, `+${healed}`, '#7CFC9A')
    return true
  }

  /** CHARGE (Guerrier) : DASH dans la direction du héros = outil de MOBILITÉ / ESQUIVE (i-frames
   *  pendant le bond), utilisable même sans ennemi. Tout ennemi TRAVERSÉ pendant le dash prend de gros
   *  dégâts (une seule fois chacun). Le joueur choisit donc d'esquiver, de se déplacer, ou de foncer
   *  dans la mêlée. */
  spellCharge() {
    const p = this.player
    const now = this.time.now
    const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing] || [0, 1]
    const ang = Math.atan2(dir[1], dir[0])
    const SPD = 520
    const dur = Math.round(200 * (p.spellPowerMul ?? 1)) // bond (allongé par le Focus) -> esquive / repositionnement
    p.invulnUntil = now + dur + 130 // i-frames = vraie esquive pendant le dash
    p.attacking = true // bloque le déplacement normal pendant le bond
    p.dashing = true // TRAVERSE les boss solides pendant le dash (esquive + dégâts de traversée) -> processCallback du collider
    p.attackUntil = now + dur + 20
    p.setVelocity(Math.cos(ang) * SPD, Math.sin(ang) * SPD)
    p.anims.play(`${p.heroKey}-attack-` + p.facing, true)
    Audio.sfx(SFX.whoosh, { vol: 0.6 }) // souffle du bond
    // slash circulaire animé au départ de la charge
    const slash = this.add.sprite(p.x, p.y, 'fx_circslash').setDepth(p.y + 60).setScale(1.5)
    slash.play('fx-circslash')
    slash.once('animationcomplete', () => slash.destroy())
    // dégâts à tout ennemi TRAVERSÉ pendant le bond (échantillonné le long du trajet, chacun 1 seule fois)
    const hit = new Set()
    const dmg = p.attackPower * 2.2
    const ev = this.time.addEvent({
      delay: 24,
      repeat: Math.ceil(dur / 24),
      callback: () => {
        this.monsters.getChildren().forEach((m) => {
          // +demi-gabarit -> on touche aussi les GROS boss en les traversant (centre éloigné)
          const half = m.body ? (m.body.halfWidth + m.body.halfHeight) / 2 : 0
          if (m.active && !hit.has(m) && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) <= 22 + half) {
            hit.add(m)
            this.hitMonster(m, dmg, p.x, p.y, 0) // dash = dégâts seuls, pas de recul (réservé au Tank)
          }
        })
      },
    })
    this.time.delayedCall(dur, () => {
      p.setVelocity(0, 0)
      p.dashing = false // fin du dash : redevient bloqué par les boss solides
      ev.remove()
      if (hit.size) this.showSlash(p.x, p.y, p.facing)
    })
    return true
  }

  /** BOUCLIER (Tank) : le bouclier absorbe 80 % des dégâts (le héros n'en subit que 20 %) pendant 4 s
   *  (cf. Player.takeDamage) + aura bleue qui suit le héros. */
  spellShield() {
    const p = this.player
    const dur = 4000 * (p.spellPowerMul ?? 1) // Focus -> bouclier plus long
    p.shieldUntil = this.time.now + dur
    Audio.sfx(SFX.shield, { vol: 0.6 })
    // bulle de bouclier ANIMÉE (FX du pack) qui suit le héros pendant la durée
    const bubble = this.add.sprite(p.x, p.y, 'fx_shield').setDepth(p.y + 60).setScale(1.7).setAlpha(0.9)
    bubble.play('fx-shield')
    const ev = this.time.addEvent({ delay: 30, loop: true, callback: () => bubble.setPosition(p.x, p.y).setDepth(p.y + 60) })
    this.time.delayedCall(dur, () => {
      ev.remove()
      bubble.destroy()
    })
    this.floatingText(p.x, p.y - 18, 'Bouclier !', '#99ddff')
    return true
  }

  /** MÉTÉORE (Mage) : sort à INCANTATION (~1,3s). Le mage est ENRACINÉ et une barre se remplit au-dessus
   *  de sa tête ; s'il prend un COUP, l'incantation est ANNULÉE (sort perdu). À la fin, le météore tombe
   *  en AoE sur l'ennemi le plus proche. */
  spellMeteor() {
    const p = this.player
    if (p.casting) return false // déjà en incantation
    if (!this.nearestMonster(p.x, p.y, 300, true)) {
      this.floatingText(p.x, p.y - 18, 'Aucune cible', '#ffd27a')
      return false // pas d'ennemi VISIBLE à l'écran -> on n'incante pas (ni mana ni cooldown perdus)
    }
    const CAST = 1300
    const start = this.time.now
    p.casting = true
    p.castInterrupted = false
    p.setVelocity(0, 0)
    // incantation : son magique propre à l'apparence (feu / lumière / ombre / arcane)
    const s = this.spellSfx()
    Audio.sfx(s.cast, { vol: 0.6, detune: s.castDetune ?? 0 })
    // barre d'incantation au-dessus de la tête (espace monde) : fond + remplissage + libellé
    const W = 30
    const yOff = 24
    const bg = this.add.rectangle(p.x, p.y - yOff, W + 2, 6, 0x000000, 0.65).setDepth(99998)
    const bar = this.add.rectangle(p.x - W / 2, p.y - yOff, 0, 4, p.magicColor).setOrigin(0, 0.5).setDepth(99999)
    const lbl = this.add
      .text(p.x, p.y - yOff - 7, 'Météore…', { fontFamily: 'monospace', fontSize: '8px', color: '#ffd27a', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(99999)
      .setResolution(3)
    // sceptre/baguette brandi pendant l'incantation -> on voit l'arme du Mage
    const wIcon = p.equipped?.weapon?.icon
    const staff = wIcon && this.textures.exists(wIcon) ? this.add.image(p.x + 5, p.y + 1, wIcon).setDepth(p.y + 60).setScale(0.85) : null
    const cleanup = () => {
      bg.destroy()
      bar.destroy()
      lbl.destroy()
      staff?.destroy()
      p.casting = false
    }
    const ev = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (!p.active || p.castInterrupted || this.gameOver) {
          if (p.castInterrupted) this.floatingText(p.x, p.y - 18, 'Incantation interrompue', '#ff8a8a')
          ev.remove()
          cleanup()
          return
        }
        const t = Phaser.Math.Clamp((this.time.now - start) / CAST, 0, 1)
        bg.setPosition(p.x, p.y - yOff)
        lbl.setPosition(p.x, p.y - yOff - 7)
        bar.setPosition(p.x - W / 2, p.y - yOff).setSize(W * t, 4)
        if (staff) {
          if (this.time.now - start < CAST - 200) {
            staff.rotation += 0.3 // tourne pendant l'incantation
          } else {
            staff.rotation = 0 // 200ms avant la fin : il s'arrête et se BRANDIT (dressé), prêt à lancer
            staff.setPosition(p.x + 5, p.y - 5)
          }
        }
        if (t >= 1) {
          ev.remove()
          cleanup()
          this.meteorImpact()
        }
      },
    })
    return true // l'incantation a démarré -> on paie le mana + le cooldown (perdus si interrompu)
  }

  /** Impact du Météore (fin d'incantation) : AoE sur l'ennemi le plus proche (ou devant si aucun). */
  meteorImpact() {
    const p = this.player
    const target = this.nearestMonster(p.x, p.y, 280, true)
    let tx = p.x
    let ty = p.y
    if (target) {
      tx = target.x
      ty = target.y
    } else {
      const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing] || [0, 1]
      tx = p.x + dir[0] * 80
      ty = p.y + dir[1] * 80
    }
    const R = Math.round(46 * (p.spellPowerMul ?? 1)) // Focus -> zone plus large (pas plus de dégâts)
    const col = p.magicColor // couleur de la magie de l'apparence (violet / blanc / rouge...)
    const dealAoe = () => {
      const dmg = p.attackPower * 3.0 // gros dégâts AoE (récompense de l'incantation)
      this.monsters.getChildren().forEach((m) => {
        if (m.active && Phaser.Math.Distance.Between(tx, ty, m.x, m.y) <= R) this.hitMonster(m, dmg, tx, ty, 0)
      })
    }
    // zone télégraphiée (brève) + une boule qui TOMBE du ciel sur la zone -> vrai "météore"
    const tele = this.add.circle(tx, ty, R, col, 0.16).setStrokeStyle(2, col, 0.7).setDepth(ty)
    const orb = this.add.image(tx, ty - 96, 'proj').setTint(col).setScale(2.4).setDepth(ty + 5)
    this.tweens.add({
      targets: orb,
      y: ty,
      duration: 320,
      ease: 'Quad.easeIn',
      onComplete: () => {
        orb.destroy()
        tele.destroy()
        // belle anim d'impact propre à l'apparence (feu / spectre teinté) ; sinon cercle de repli
        const fx = p.spellFx
        if (fx && this.anims.exists(fx.anim)) {
          const boom = this.add.sprite(tx, ty, fx.tex).setDepth(ty + 6).setScale((R * 2) / fx.frame)
          if (fx.tint) boom.setTint(col)
          boom.play(fx.anim)
          boom.once('animationcomplete', () => boom.destroy())
        } else {
          const boom = this.add.circle(tx, ty, R, col, 0.6).setDepth(ty + 1)
          this.tweens.add({ targets: boom, alpha: 0, scale: 1.35, duration: 320, onComplete: () => boom.destroy() })
        }
        this.cameras.main.shake(120, 0.004) // petit choc d'impact
        // détonation propre à l'élément (feu = explosion, lumière = boom clair, ombre = esprit + explosion)
        const s = this.spellSfx()
        Audio.sfx(s.impact, { vol: 0.75, detune: s.impactDetune ?? 0 })
        if (s.impactExtra) Audio.sfx(s.impactExtra, { vol: 0.7, detune: 0 }) // son superposé (ex. boom de feu sur l'ombre)
        dealAoe()
      },
    })
  }

  /** Aura de soin verte qui s'élargit et s'estompe autour de (x,y). */
  showHealEffect(x, y) {
    const ring = this.add.circle(x, y + 2, 6, 0x7cfc9a, 0).setStrokeStyle(2, 0x7cfc9a, 0.9).setDepth(y + 60)
    this.tweens.add({ targets: ring, radius: 22, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => ring.destroy() })
    const glow = this.add.circle(x, y + 2, 16, 0x7cfc9a, 0.25).setDepth(y + 59)
    this.tweens.add({ targets: glow, alpha: 0, scale: 1.4, duration: 520, onComplete: () => glow.destroy() })
  }

  /**
   * Lance une boule d'énergie du héros vers (tx,ty). Si `target` est fourni, la
   * boule suit ce monstre (homing). Oriente le héros vers le tir et respecte le cooldown.
   */
  fireProjectile(tx, ty, target) {
    const p = this.player
    if (!p.abilities.ranged) return // classe sans sort à distance (Guerrier/Tank)
    if (p.attacking || p.hp <= 0) return
    if (!p.startShoot(this.time.now)) return

    const dx = tx - p.x
    const dy = ty - p.y
    if (Math.abs(dx) > Math.abs(dy)) p.facing = dx < 0 ? 'left' : 'right'
    else p.facing = dy < 0 ? 'up' : 'down'

    const proj = this.projectiles.get(p.x, p.y)
    if (!proj) return
    // tir propre à l'élément (feu = whoosh enflammé, lumière/ombre/arcane = magie teintée)
    const s = this.spellSfx()
    Audio.sfx(s.proj, { vol: 0.45, detune: s.projDetune ?? 0 })
    proj.fire(p.x, p.y, tx, ty, Math.round(p.attackPower * p.rangedDmgMul), this.time.now, target, p.magicColor, p.projFx)
    // on VOIT l'arme à distance (sceptre/baguette) pointer vers la cible
    const wi = p.equipped?.weapon?.icon
    if (wi && this.textures.exists(wi)) this.showWeaponPoint(p.x, p.y, p.facing, wi)
  }

  /** Un BOSS à distance (Kraken) lance une orbe vers la position ACTUELLE du joueur (sans homing ->
   *  esquivable). Tire depuis le centre du sprite du boss, projectile lent et bien visible. */
  bossFireProjectile(boss, player) {
    if (!boss?.active || boss.hp <= 0 || !player?.active || player.hp <= 0) return
    const proj = this.enemyProjectiles.get(boss.x, boss.y)
    if (!proj) return
    const def = boss.def || {}
    const dmg = Math.round((def.projDamage ?? 14) * (boss.lvlMul ?? 1))
    const fx = { anim: 'fx-fireball', tex: 'fx_fireball', scale: 1.6 } // boule de feu ROUGE (asset du pack, pas de teinte)
    // léger biais d'avance : on vise un peu DEVANT le joueur s'il bouge (rend l'esquive moins triviale,
    // mais sans homing -> un changement de direction franc évite l'orbe).
    const lead = 90 // ms d'anticipation
    const tx = player.x + (player.body?.velocity.x ?? 0) * (lead / 1000)
    const ty = player.y + (player.body?.velocity.y ?? 0) * (lead / 1000)
    proj.fire(boss.x, boss.y - 6, tx, ty, dmg, this.time.now, null, 0xffffff, fx, def.projSpeed ?? 155)
    Audio.sfx(SFX.magic, { vol: 0.5, detune: -300 }) // "blop" magique grave
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

  /** Le sprite de l'arme équipée fait un MOUVEMENT DE COUP : il décrit un arc autour du héros dans
   *  la direction visée (la lame reste orientée vers l'extérieur), puis disparaît. Marche pour
   *  n'importe quelle icône d'arme -> toutes les classes/armes. */
  showWeaponSwing(px, py, facing, iconKey) {
    const center = { right: 0, down: 90, left: 180, up: -90 }[facing] ?? 0
    const SWING = 80 // amplitude de l'arc (degrés)
    const r = 15 // distance de la lame au héros
    const w = this.add.image(px, py, iconKey).setDepth(py + 51).setScale(1.5)
    const st = { a: center - SWING / 2 }
    const place = () => {
      const rad = Phaser.Math.DegToRad(st.a)
      w.setPosition(px + Math.cos(rad) * r, py + Math.sin(rad) * r)
      w.setRotation(rad + Phaser.Math.DegToRad(90)) // sprite d'arme VERTICAL (pointe en haut) -> aligné sur l'arc
    }
    place()
    this.tweens.add({ targets: st, a: center + SWING / 2, duration: 150, ease: 'Quad.easeInOut', onUpdate: place, onComplete: () => w.destroy() })
  }

  /** Joue un effet de TRANCHE animé (FX du pack) devant le héros, orienté selon la direction d'attaque.
   *  `fxKey` = clé d'anim (ex. 'fx-slash' / 'fx-circslash') ; la texture est dérivée ('fx_slash'…). */
  showSlashFx(px, py, facing, fxKey) {
    const tex = fxKey.replace('-', '_')
    if (!this.textures.exists(tex)) return
    const deg = { right: 0, down: 90, left: 180, up: -90 }[facing] ?? 0
    const rad = Phaser.Math.DegToRad(deg)
    const fx = this.add.sprite(px + Math.cos(rad) * 16, py + Math.sin(rad) * 16, tex).setDepth(py + 52).setScale(1.4)
    fx.setRotation(rad + Phaser.Math.DegToRad(90)) // oriente la tranche vers la direction d'attaque
    fx.play(fxKey)
    fx.once('animationcomplete', () => fx.destroy())
  }

  /** Montre l'arme à distance (sceptre/baguette) TENUE DANS LA MAIN avec un petit "poke" vers le haut.
   *  Elle NE pivote PAS vers le curseur/l'ennemi (la visée auto faisait "tourner" l'arme = moche). */
  showWeaponPoint(px, py, facing, iconKey) {
    const w = this.add.image(px + 5, py + 1, iconKey).setDepth(py + 51).setScale(1.0).setRotation(-0.3)
    this.tweens.add({ targets: w, y: py - 4, duration: 90, yoyo: true, onComplete: () => w.destroy() })
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
    if (this.activeArena?.boss === mon) this.releaseArena() // l'arène s'ouvre quand le boss tombe

    // butin GARANTI : 2 équipements épiques + gros tas d'or + un gros soin
    this.drops.add(new Drop(this, mon.x - 12, mon.y, 'equip', 0, this.equipmentOfTier('legendary')))
    this.drops.add(new Drop(this, mon.x + 12, mon.y, 'equip', 0, this.equipmentOfTier('legendary')))
    const gold = Phaser.Math.Between(120, 240) + mon.level * 20
    this.drops.add(new Drop(this, mon.x, mon.y + 10, 'gold', gold))
    this.drops.add(new Drop(this, mon.x, mon.y - 10, 'heart', Math.max(20, Math.round(this.player.maxHp * 0.5))))

    // annonce + respawn long (boss de monde : ~8-10 min)
    this.scene.get('UIScene')?.showToast?.(`⚔ ${mon.displayName} vaincu !`, '#ffd86b')
    const biome = mon.bossBiome
    const index = mon.bossIndex ?? 0
    this.time.delayedCall(Phaser.Math.Between(480000, 600000), () => {
      if (!this.gameOver) this.spawnBoss(biome, index)
    })
  }

  /** Fait apparaître le butin sur le cadavre. Drops SERRÉS (brief §9c) : OR à chaque kill, mais
   *  l'ÉQUIPEMENT ne tombe qu'à faible probabilité, avec une rareté pondérée (les bons objets se
   *  méritent). L'élite : drop garanti + 1 cran de rareté. (Légendaire = boss uniquement.) */
  spawnDrop(mon) {
    const loot = mon.def.loot
    const lvlMul = mon.lvlMul ?? 1
    // OR (toujours)
    const g = Math.max(1, Math.round(Phaser.Math.Between(loot.gold[0], loot.gold[1]) * lvlMul * (mon.elite ? 3 : 1)))
    this.drops.add(new Drop(this, mon.x + 6, mon.y + 4, 'gold', g))
    // ÉQUIPEMENT : ~18 % sur un mob normal, garanti sur une élite
    if (mon.elite || Math.random() < 0.18) {
      let tier = this.rollDropRarity()
      if (mon.elite) tier = TIER_UP[tier] ?? tier
      this.drops.add(new Drop(this, mon.x, mon.y, 'equip', 0, this.equipmentOfTier(tier)))
    }
  }

  /** Tire une rareté de drop pondérée : Commun 60 % / Magique 25 % / Rare 12 % (clés internes
   *  common/rare/epic). Le Légendaire ne tombe JAMAIS ici (exclusif aux boss). */
  rollDropRarity() {
    const r = Math.random() * 97
    if (r < 60) return 'common'
    if (r < 85) return 'rare' // = Magique
    return 'epic' // = Rare
  }

  /** Renvoie une COPIE d'un objet d'équipement de la rareté `tier` (commun/rare/épique). */
  equipmentOfTier(tier) {
    let pool = Object.values(ITEMS).filter((it) => it.rarity === tier && !it.ranged) // armes à lancer = marché only
    if (pool.length === 0) pool = Object.values(ITEMS).filter((it) => !it.ranged) // garde-fou
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
      Audio.sfx('sfx_gold', { vol: 0.5, detune: 0 })
    } else if (drop.type === 'gem') {
      p.gainXp(drop.amount)
      text = `+${drop.amount} XP`
      color = '#9beaf5'
      Audio.sfx('sfx_pickup', { vol: 0.5, detune: 0 })
    } else if (drop.type === 'heart') {
      const healed = p.heal(drop.amount)
      if (healed <= 0) return // PV déjà au max : pas de texte trompeur
      text = `+${healed} PV`
      color = '#ff8088'
      Audio.sfx('sfx_pickup', { vol: 0.5, detune: 0 })
    } else if (drop.type === 'equip') {
      p.addItem(drop.item)
      text = drop.item.name
      color = RARITY[drop.item.rarity]?.color ?? '#9be1ff'
      Audio.sfx('sfx_loot', { vol: 0.6, detune: 0 }) // équipement = son plus marquant
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

    this.updateArena() // arène de boss : verrouillage de proximité + mur invisible

    this.monsters.getChildren().forEach((mon) => {
      mon.update(time, p)
      mon.setDepth(mon.y)
    })
    this.seaDragon?.update(time, p) // dragon de mer d'ambiance (orbite autour de l'île)

    // barre de boss + musique de boss = UNIQUEMENT pendant le COMBAT réel (`combatEngaged` : tu l'as
    // tapé ou il t'a touché), comme l'arène. Passer DEVANT un boss sans l'engager ne déclenche plus rien
    // (avant : déclenché par proximité/aggro -> la musique prenait le dessus et tardait à se libérer
    // tant que le boss rôdait/poursuivait ; parfois restait coincée). Le combat ne se termine que par la
    // mort du boss (arène scellée) ou du joueur -> activeBoss se libère alors proprement.
    let engagedBoss = null
    for (const b of this.bosses || []) {
      if (b.active && b.hp > 0 && b.combatEngaged) { engagedBoss = b; break }
    }
    this.activeBoss = engagedBoss

    if (p.hp <= 0) this.handleDeath()

    // bandeau de zone quand le héros change de biome
    const biome = this.biomeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE))
    if (biome !== this.currentBiome) {
      this.currentBiome = biome
      this.scene.get('UIScene')?.showZoneBanner?.(BIOME_NAMES[biome])
    }

    // musique : un boss engagé impose un thème de combat (tiré au hasard au début du combat,
    // gardé jusqu'au désengagement), sinon la musique de la zone. playMusic court-circuite si
    // le morceau voulu joue déjà -> pas de coût par frame.
    if (this.activeBoss) {
      if (!this.bossTrack) this.bossTrack = Phaser.Utils.Array.GetRandom(BOSS_MUSIC)
      Audio.playMusic(this, this.bossTrack)
    } else {
      this.bossTrack = null
      Audio.playMusic(this, MUSIC_BY_BIOME[biome] || 'mus_village')
    }

    // ambiance : vent qui monte près de la côte. On (re)calcule la proximité de l'océan
    // périodiquement (throttle) et on lisse le volume frame par frame -> fondu doux.
    if (time >= this.ambCheckAt) {
      this.ambCheckAt = time + 250
      this.ambTarget = this.coastProximity(Math.floor(p.x / TILE), Math.floor(p.y / TILE))
    }
    this.ambLevel = Phaser.Math.Linear(this.ambLevel, this.ambTarget || 0, 0.06)
    // vent un peu en retrait, vagues dominantes au bord de l'eau (montée plus marquée tout près)
    Audio.setAmbientLevel('amb_wind', this.ambLevel * 0.7)
    Audio.setAmbientLevel('amb_waves', Math.pow(this.ambLevel, 1.3))

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

  /** Proximité de l'océan (0 = aucune eau à portée, 1 = pieds dans l'eau) : cherche la tuile d'océan
   *  la plus proche dans un rayon de COAST_REACH tuiles autour de (tx,ty). Throttlé par l'appelant. */
  coastProximity(tx, ty) {
    const COAST_REACH = 14
    let best = Infinity
    for (let dy = -COAST_REACH; dy <= COAST_REACH; dy++) {
      for (let dx = -COAST_REACH; dx <= COAST_REACH; dx++) {
        if (this.isOcean(tx + dx, ty + dy)) {
          const d = Math.hypot(dx, dy)
          if (d < best) best = d
        }
      }
    }
    if (best === Infinity || best > COAST_REACH) return 0
    return Math.pow(1 - best / COAST_REACH, 0.6) // courbe douce : audible plus tôt en approchant (proche ~1)
  }

  handleDeath() {
    this.gameOver = true
    this.activeBoss = null // cache la barre de boss
    this.bossTrack = null
    Audio.stopMusic() // coupure IMMÉDIATE (pas de fondu) pour laisser le jingle de défaite seul
    Audio.stopAmbient() // coupe aussi le vent pendant le game over
    Audio.sfx('sfx_gameover', { vol: 0.9, detune: 0 })
    this.releaseArena() // libère l'arène (le joueur respawn au village, pas piégé)
    this.player.setVelocity(0, 0)
    this.player.setTint(0x555555)
    this.physics.pause()
    // l'UIScene (non zoomée) affiche l'écran de Game Over
    this.events.emit('gameover', this.player.level)
  }
}
