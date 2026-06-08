import Phaser from 'phaser'
import Player from '../entities/Player.js'
import Monster, { MONSTER_TYPES } from '../entities/Monster.js'
import Projectile from '../entities/Projectile.js'
import Drop from '../entities/Drop.js'
import { ITEMS, cloneItem, RARITY, itemColor, itemTint, ELITE_DROP } from '../data/items.js'
import { QUESTS, questGoal, questProgress, questComplete, nextQuestId } from '../data/quests.js'
import { DEFAULT_CHARACTER, KNIGHT_CHARACTER, SPELL3_COST } from '../data/classes.js'
import { makeSave, saveCharacter, getCharacterSave, lastPlayedSave } from '../data/save.js'
import { Audio, SFX } from '../data/sound.js'
import { FONT } from '../ui/font.js'

const MONSTER_COUNT = 170 // base de population (répartie par surface de biome × mult ci-dessous)
const MONSTER_GAP = 10 // distance mini entre deux monstres au spawn/respawn (en tuiles) — espacés, pas de paquets
const MAX_CHASERS = 2 // PLAFOND d'aggro : nb max de monstres normaux qui poursuivent le joueur en même temps
// réglage par biome : forêt (jungle) = un peu plus dense ; tous BIEN espacés (distance mini accrue).
const BIOME_SPAWN = {
  forest: { mult: 1.3, gap: 10 }, // jungle : densité un cran au-dessus, mais espacée
  desert: { mult: 1.1, gap: 12 }, // plus aéré
  snow: { mult: 1.1, gap: 12 },
}
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

// thème NOCTURNE par biome : prend le relais de la musique de zone quand il fait nuit (fondu via playMusic)
const NIGHT_MUSIC = { forest: 'mus_forest_night', cursed: 'mus_cursed_night' }

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
  desert: ['snake', 'spider', 'trex'],
  snow: ['owl', 'bear', 'bluebat'],
  cursed: ['skull', 'spirit', 'flam'],
}

// MONDE type CONTINENT en ZONES (façon WoW) : le continent est un PATCHWORK de zones de biome
// (forêt/neige/désert) défini par Voronoi sur des graines (cf. this.zoneSeeds dans create), avec des
// frontières déformées par le bruit -> régions qui s'emboîtent, PAS d'anneaux ni de bandes. Le
// village est dans une petite clairière au sein d'une zone de forêt.
const ZONE_WARP = 16 // déformation (tuiles) des frontières de zones (Voronoi) -> bords organiques, pas droits
// rayon (tuiles) de la CLAIRIÈRE de prairie autour du village (= zone sûre). Agrandi pour un vrai hub
// « façon WoW » (objectif 50 joueurs). Utilisé par biomeAt, paintGrassBiomes et le mur de zone sûre.
const VILLAGE_CLEAR_R = 20
const VILLAGE_OFF_X = 16 // décalage (tuiles) du village vs centre de l'île -> casse la symétrie (décalé à l'EST)
const VILLAGE_OFF_Y = -2
const LEVEL_REACH = 92 // distance (tuiles) au village où le niveau atteint le max ; près du village = niv1
const MONSTER_MAX_LEVEL = 6 // mobs niv 1 (village) -> 6 (zones lointaines = end-game) ; PV ×2/niv, dégâts ×1.6/niv (cf. Monster.js)
// TEMPÉRATURE (froid neige / chaud désert) : jauge -100…+100. Dérive vers l'extrême du biome, revient à
// 0 ailleurs. |temp| élevé -> ralenti progressif puis dégâts. Atténuée par les items coldResist/heatResist.
const TEMP_MAX = 100
const TEMP_DRIFT = 5.5 // unités/s vers l'extrême (≈18 s d'exposition pour atteindre le max sans résistance)
const TEMP_RECOVER = 20 // unités/s de retour vers neutre (rapide -> ressortir du biome soulage vite)
const TEMP_NEAR = 45 // cible DOUCE quand on est à la lisière d'un biome extrême (pont voisin) : on chauffe/refroidit dans le TEMPÉRÉ (< seuil de ralenti 55), sans pénalité tant qu'on n'est pas entré
const TEMP_SLOW_START = 55 // |temp| où le ralenti commence
const TEMP_MAX_SLOW = 0.45 // ralenti maxi (-45 % de vitesse au tout froid/chaud)
const TEMP_CHIP_START = 90 // |temp| où les dégâts (gelure/coup de chaud) commencent
const TEMP_CHIP_INTERVAL = 1000 // ms entre deux ticks de dégâts
const TEMP_CHIP_DPS = 15 // dégâts par tick (= par seconde, intervalle 1 s) en zone Glacial/Brûlant
// CYCLE JOUR/NUIT : voile bleu nuit plein écran dont l'opacité suit l'heure. Cycle complet = 20 min.
const DAY_CYCLE_MS = 1200000 // durée d'un cycle jour->nuit->jour (20 min)
const NIGHT_MAX_ALPHA = 0.8 // opacité du voile au plus profond de la nuit (nuit BIEN sombre, encore jouable)
const VILLAGE_LIGHT_R = 10 * TILE // rayon (px) du trou de lumière : STRICTEMENT le cœur du VILLAGE ; tout autour (prairie incluse) reste dans la nuit
const NIGHT_TEMP_SHIFT = 28 // refroidissement maxi à minuit (renforce la température : neige plus dure, désert qui se rafraîchit)
const TEST_UNLOCK_SKILLS = false // débloque les 3 compétences (sort niv.10 + sort de panoplie) sans condition — passer à true pour TESTER
// Tuile du tablier de pont (tileset Sprout bridge_wood, 5×3) : la tuile 8 = milieu plein sans bord, se
// carrelle sans couture. Les gués utilisent un sprite de pont AGRANDI (cf. renderFordBridges).
const BRIDGE_H = 8 // ponts de rivière (bridgeSpan) : tablier plein
const BRIDGE_V = 8
const SHINY_CHANCE = 2 // % de chance qu'un monstre soit ÉLITE "shiny" (nommé, +fort, +butin) — RARE
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
// DÉLAI entre deux quêtes (respiration) : la 1re est immédiate ; ensuite délai croissant, plafonné.
const QUEST_GAP_BASE = 25000 // 25 s de base après une remise
const QUEST_GAP_STEP = 12000 // +12 s par quête déjà accomplie (les quêtes de fin = plus longues -> on farme)
const QUEST_GAP_MAX = 180000 // plafond 3 min
const ARENA_RADIUS = 160 // rayon de la zone scellée (px), centrée sur le repaire du boss
// teinte de l'arène selon le BIOME (ambiance), volontairement CLAIRE/vive pour rester visible sur tout sol
// (forêt = ambre doré, PAS vert -> contraste sur l'herbe ; désert orange · neige bleu glacé · maudit violet · côte cyan).
const ARENA_BIOME_COLOR = { forest: 0xe6b13c, desert: 0xf2743a, snow: 0x8fd4f5, cursed: 0xc86ef0, coast: 0x5fd8d8 }
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

// Échelle des TACHES de teinte des sols (désert/neige/forêt) : multiplie les coords du bruit continu.
// Plus GRAND = taches plus PETITES. 1 ≈ énormes nappes, ~4 ≈ moyennes (quelques tuiles), élevé ≈ damier.
const TINT_PATCH = 3.2
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
const TREE_SNOW = { tl: 12, tr: 13, bl: 36, br: 37 } // sapin enneigé (neige) — tout blanc
// 3 variantes de sapins de neige (TilesetNature) -> variété dans le biome neige : givré léger, enneigé, tout blanc
const SNOW_TREES = [
  { tl: 8, tr: 9, bl: 32, br: 33 }, // sapin givré (vert + neige)
  { tl: 10, tr: 11, bl: 34, br: 35 }, // sapin enneigé
  { tl: 12, tr: 13, bl: 36, br: 37 }, // sapin tout blanc
]
const TREE_DEAD = { tl: 4, tr: 5, bl: 28, br: 29 } // arbre mort (maudit / désert sec)
const ROCKS = [295, 296, 297]
const FLOWERS = [264, 265, 267] // tournesol, fleur, tulipe
const BUSHES = [240, 241, 242, 268, 269, 273] // buissons / herbes hautes

// --- props SPÉCIFIQUES par biome (nature.png) pour différencier les zones ---
const CACTI = [203, 227] // désert : cactus (collision)
const DESERT_SHRUBS = [220] // désert : buisson SEC brun (sans collision) — pas de plante verte (221 retiré : faisait "herbe", c'est la forêt)
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
  tavern: { col: 12, row: 0, w: 4, h: 4, door: [1, 3] }, // grande bâtisse à TOIT ROUGE (taverne) — vérifié sur la grille
  bank: { col: 16, row: 0, w: 3, h: 3, door: [1, 2] }, // bâtisse BLEUE/pierre à emblème (banque) — vérifié sur la grille
  apothecary: { col: 19, row: 0, w: 4, h: 3, door: [3, 2], flip: true }, // échoppe à TOIT VERT + comptoir (apothicaire), RETOURNÉE (porte à gauche)
  store: { col: 26, row: 0, w: 3, h: 3, door: [1, 2] }, // boutique ORANGE à 2 étages (marchand) — vérifié sur la grille
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
    this.charId = initData?.charId ?? null // slot multi-perso du personnage joué (null en aperçu)
    this.saveData = initData?.save ?? getCharacterSave(this.charId) ?? null
    this.preview = !!initData?.preview // mode aperçu = fond vivant de l'écran d'accueil (pas de HUD/combat)
    let character = this.saveData?.character ?? initData?.character ?? null
    // ACCUEIL (aperçu sans perso explicite) : montrer le DERNIER perso joué (sauvegarde),
    // sinon le CHEVALIER tant qu'aucune partie n'a été lancée.
    if (!character && this.preview) character = lastPlayedSave()?.character ?? KNIGHT_CHARACTER
    this.character = character ?? DEFAULT_CHARACTER
    this.testUnlockSkills = TEST_UNLOCK_SKILLS // expose le flag de test à l'UI (retire le cadenas des sorts 2/3)

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
    this.paintPaths() // chemins (routés par les ponts pour franchir les rivières)
    // eau ANIMÉE Sprout (cycle des 4 frames sur les tuiles VISIBLES) + teinte bleu foncé
    this.waterFrame = 0
    this.time.addEvent({ delay: 170, loop: true, callback: this.animateWater, callbackScope: this })
    this.waterLayer.forEachTile((t) => { if (t.index >= 0) t.tint = WATER_TINT })

    // --- physique / héros ---
    this.physics.world.setBounds(EDGE_INSET, EDGE_INSET, this.worldW - 2 * EDGE_INSET, this.worldH - 2 * EDGE_INSET)
    const vSpawnX = this.cx * TILE + 8 // place du village (juste au sud du feu de camp central)
    const vSpawnY = (this.cy + 2) * TILE + 8
    // VALIDATION : une position sauvegardée HORS-MAP (ex. sauvegardé dans un intérieur hors-map) -> spawn village
    const sx = this.saveData?.x
    const sy = this.saveData?.y
    const validSpawn = sx != null && sy != null && sx > 0 && sy > 0 && sx < this.worldW && sy < this.worldH
    const spawnX = validSpawn ? sx : vSpawnX
    const spawnY = validSpawn ? sy : vSpawnY
    this.player = new Player(this, spawnX, spawnY, { character: this.character, save: this.saveData })
    // le pseudo au-dessus du héros est dessiné par UIScene (scène non-zoomée) pour rester net/stable
    // barque (A3) : sprite affiché SOUS le héros quand il navigue sur l'eau (caché par défaut)
    this.boatSprite = this.add.image(spawnX, spawnY, 'boat').setOrigin(0.5, 0.42).setScale(0.5).setVisible(false)
    if (!this.preview && this.player.deathBag) this.spawnDeathBagSprite() // sac de mort en attente (depuis la save)
    // CIBLAGE (clic / Tab) : cible verrouillée + réticule rouge ; les tirs et sorts la visent en priorité.
    this.lockedTarget = null
    // anneau de sélection PLAT sous les pieds de la cible (ne couvre pas le sprite, même pour un gros boss)
    this.targetReticle = this.add.ellipse(0, 0, 24, 11, 0xff5050, 0).setStrokeStyle(2, 0xff6464).setVisible(false)

    // --- décors ---
    this.obstacles = this.physics.add.staticGroup()
    this.trees = []
    this.destructibles = [] // obstacles (arbres de forêt) détruits par l'onde de choc à l'ouverture d'une arène
    this.campfires = [] // foyers posés par le joueur (zone-refuge de température)
    // VOILE de nuit : rectangle couvrant TOUT le monde (depth au-dessus des sprites, sous les flashs/toasts
    // et sous le HUD qui est dans UIScene). Opacité/couleur pilotées par updateDayNight. Inactif en preview.
    this.dayDarkness = 0
    this.nightOverlay = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, 0x070d28, 1).setOrigin(0, 0).setDepth(9000).setAlpha(0)
    // REFUGE : le village + la prairie ne subissent PAS la nuit. On PERCE un trou dans le voile via un
    // masque radial inversé (plein jour au cœur, fondu doux vers la nuit au bord de la prairie).
    if (!this.textures.exists('nightHole')) {
      const S = 256
      const ctex = this.textures.createCanvas('nightHole', S, S)
      const cx = ctex.getContext()
      const grd = cx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
      grd.addColorStop(0, 'rgba(255,255,255,1)') // cœur du VILLAGE = plein jour (aucune nuit)
      grd.addColorStop(0.8, 'rgba(255,255,255,1)') // village pleinement éclairé jusqu'à ~ses bords
      grd.addColorStop(1, 'rgba(255,255,255,0)') // fondu TRÈS court au bord du village -> tout le reste (prairie incluse) = nuit
      cx.fillStyle = grd
      cx.fillRect(0, 0, S, S)
      ctex.refresh()
    }
    this.nightHoleImg = this.add.image((this.icx + VILLAGE_OFF_X) * TILE, (this.icy + VILLAGE_OFF_Y) * TILE, 'nightHole')
      .setDisplaySize(VILLAGE_LIGHT_R * 2, VILLAGE_LIGHT_R * 2).setVisible(false)
    const nightMask = this.nightHoleImg.createBitmapMask()
    nightMask.invertAlpha = true // le voile est RETIRÉ là où le masque est opaque (= sur le village/prairie)
    this.nightOverlay.setMask(nightMask)
    this.occupied = new Set()
    this.spawnVillage() // village au spawn (avant la forêt : réserve l'emplacement)
    this.spawnWatermill() // moulin à eau sur la berge de la rivière sud (réserve avant la forêt)
    // (plus de spawnForest : il ne posait que des arbres verts Ninja en PRAIRIE -> la prairie est une zone SÛRE, sans arbres ;
    //  la forêt est peuplée par scatterForestTrees ci-dessous)
    this.spawnBiomeTrees()
    this.scatterForestTrees() // chênes Mystic Woods dans la forêt
    this.scatterForestUndergrowth() // sous-bois Ninja TOUFFU : fougères + buissons + fleurs (traversable)
    this.spawnRocks()
    // spawnDecor() retiré : plus de buissons/touffes d'herbe en prairie (demandé)
    this.spawnBiomeProps() // props par biome (cactus, cristaux, souches, congères...)
    this.scatterDesertProps() // déco étoffée du désert : palmiers nains + rochers de grès
    this.scatterSnowProps() // déco étoffée de la neige : sapins de neige variés (grille uniforme)
    this.physics.add.collider(this.player, this.obstacles)
    // l'eau bloque (sauf ponts) — SAUF si le joueur a le bateau (A3) : le processCallback annule alors
    // la collision -> il navigue librement sur l'eau (l'île maudite devient atteignable).
    this.physics.add.collider(this.player, this.waterLayer, null, () => !this.player.hasBoat)

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
      // CHARGE du Tank en cours : percuter un ennemi déclenche le coup d'élan (et termine la charge)
      if (pl.charging2) { this.tankChargeHit(mon); return }
      // le contact NE réveille PAS un boss endormi (il faut l'ATTAQUER -> combatEngaged via hitMonster) ;
      // tryBite est verrouillé tant qu'il dort, donc un boss assoupi ne te mord pas si tu le frôles.
      if (mon.tryBite(pl, this.time.now)) {
        this.flashHurt()
        if (mon.isBoss) this.bossAttackFx(mon) // retour visuel net quand un BOSS frappe
      }
    })

    // CLONES du Mage (Image miroir) : leurres physiques avec PV. Les monstres les mordent (overlap) ->
    // ils soakent les coups + détournent l'aggro (cf. Monster.update -> scene.nearestLure).
    this.mageClones = this.physics.add.group()
    this.physics.add.overlap(this.mageClones, this.monsters, (clone, mon) => this.monsterBiteClone(clone, mon))
    this.physics.add.collider(this.mageClones, this.obstacles) // les clones ne traversent PAS arbres/maisons
    this.physics.add.collider(this.mageClones, this.waterLayer) // ni l'eau (sauf ponts -> collision retirée)

    // --- projectiles (attaque à distance) ---
    this.projectiles = this.physics.add.group({ classType: Projectile, runChildUpdate: true })
    this.physics.add.overlap(this.projectiles, this.monsters, (proj, mon) => {
      if (!proj.active || !mon.active) return
      const px = proj.x
      const py = proj.y
      const dmg = proj.damage
      const fromClone = proj.fromClone // tir d'un CLONE du Mage -> le mob doit le poursuivre
      proj.kill()
      Audio.sfx(SFX.hit, { vol: 0.4 }) // impact du projectile
      this.hitMonster(mon, dmg, px, py, 0) // pas de recul (seul le Tank repousse) ; dégâts seuls
      // l'arme s'use quand un tir DU JOUEUR (pas d'un clone du Mage) porte -> Mage/Soigneur ET armes
      // lancées usent leur arme comme la mêlée (avant : seules les classes de mêlée l'usaient = bug).
      if (!fromClone) this.wearWeapon() // use l'arme (tir) + toast casse + avertissement durabilité faible
      // un clone qui TOUCHE un mob l'oblige à changer de cible (poursuit le 1er clone qui l'a touché)
      if (fromClone && fromClone.active && (!mon.lureTarget || !mon.lureTarget.active)) mon.lureTarget = fromClone
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
      this.setupFog() // ACCUEIL : la TERRE reste nuageuse (prairie + forêt) ; SEUL le VILLAGE est dégagé
      // ÉCLAIRCIE douce LIMITÉE au village (serrée -> ne déborde ni sur la prairie autour ni sur la forêt)
      if (this.textures.exists('nightHole')) {
        const clearD = 26 // diamètre (fogtex 1 px/tuile) ~ taille du village uniquement
        const cImg = this.make.image({ x: 0, y: 0, key: 'nightHole', add: false }).setOrigin(0, 0).setDisplaySize(clearD, clearD)
        this.fogRT.erase(cImg, this.cx - clearD / 2, this.cy - clearD / 2)
      }
      this.revealCoast() // la MER est dégagée (effacement DUR à la cellule -> aucune bavure sur la terre, bords couverts)
      // PROGRESSION : l'accueil reflète l'EXPLORATION du DERNIER perso joué -> le brouillard est retiré PARTOUT où il a
      // déjà vu (prairie incluse puisqu'elle est découverte, + forêt/zones explorées). Inexploré = reste brumeux.
      const prog = lastPlayedSave()?.exploredFog
      if (Array.isArray(prog)) {
        for (const key of prog) {
          const [ecx, ecy] = key.split(',').map(Number)
          this._eraseFogCell(ecx, ecy)
        }
      }
    } else {
      cam.useBounds = true // (l'instance peut avoir été utilisée en preview où on l'a mis à false)
      // suivi instantané (pas de lerp) : avec l'arrondi pixel, le lissage créait
      // une vibration en diagonale (positions fractionnaires arrondies différemment).
      cam.startFollow(this.player, true)
      cam.setZoom(3)
      cam.setRoundPixels(true)
      this.setupMinimap() // 2e caméra dézoomée (haut-droite) qui suit le joueur
      this.setupFog() // brouillard de guerre : carte/minimap se dévoilent en explorant
      // CHUTE DE NEIGE (particules) : émetteur unique en avant-plan, activé seulement dans le biome neige
      // (updateSnowfall repositionne la zone d'émission sur le bord haut de la vue + start/stop selon le biome).
      this.snowEmitter = this.add.particles(0, 0, 'snow', {
        frame: [0, 1, 2, 3, 5, 6],
        lifespan: 1900, // chute RAPIDE -> durée de vie plus courte (les flocons traversent vite)
        speedY: { min: 220, max: 360 }, // neige RAPIDE (avant : 40-80, lente)
        speedX: { min: -22, max: 22 },
        scale: { min: 0.7, max: 1.25 },
        alpha: { start: 0.9, end: 0.4 },
        frequency: 35,
        quantity: 3,
        rotate: { min: 0, max: 360 },
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 0, 900, 6) },
      }).setDepth(8500)
      this.snowEmitter.stop()
      // PLUIE (particules) : même principe que la neige (émetteur monde, zone repositionnée en haut de la vue),
      // mais démarrée/arrêtée par le CYCLE météo (updateWeather), uniquement sur les biomes tempérés.
      this.rainEmitter = this.add.particles(0, 0, 'wx_rain', {
        frame: [0, 1, 2],
        lifespan: 650,
        speedY: { min: 620, max: 800 },
        speedX: { min: -130, max: -80 }, // vent oblique
        scaleX: 1, scaleY: { min: 1, max: 1.8 },
        alpha: { start: 0.85, end: 0.5 },
        frequency: 20,
        quantity: 3,
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 0, 600, 6) },
      }).setDepth(8600)
      this.rainEmitter.stop()
    }

    // --- entrées combat (désactivées en mode aperçu) ---
    if (!this.preview) {
      this.input.mouse?.disableContextMenu() // le clic droit sert à tirer, pas au menu
      this.input.keyboard.on('keydown-SPACE', () => this.basicAttack())
      this.input.keyboard.on('keydown-F', () => this.shootForward())
      this.input.keyboard.on('keydown-ONE', () => this.castSpell()) // LE sort de la classe (touche 1)
      this.input.keyboard.on('keydown-R', () => this.castSpell()) // alias pratique (R)
      this.input.keyboard.on('keydown-TWO', () => this.castSpell2()) // 2e compétence (touche 2, déverrouillée niv 10)
      this.input.keyboard.on('keydown-THREE', () => this.castSpell3()) // compétence de PANOPLIE (touche 3, panoplie complète)
      this.input.keyboard.on('keydown-E', () => this.tryInteract())
      this.input.keyboard.addCapture('TAB') // empêche Tab de changer le focus du navigateur
      this.input.keyboard.on('keydown-TAB', () => this.cycleTarget()) // Tab = cible l'ennemi visible le plus proche / cycle
      this.input.keyboard.on('keydown-X', () => { this._heldOn = !this._heldOn }) // X = afficher/masquer l'arme tenue en main en permanence
      this.input.on('pointerdown', (p) => {
        // ignore les clics quand un panneau plein écran est ouvert (boutique/dialogue)
        if (this.uiBusy()) return
        if (this.player?.sitting) return // ASSIS : aucun clic (pas de déplacement à la souris, pas de tir)
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
        // clic sur un ENNEMI -> le verrouille comme cible (ne déplace pas)
        const mob = this.monsterAt(p.worldX, p.worldY)
        if (mob) {
          this.setTarget(mob)
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
    if (this.gameOver || !this.player || !this.charId) return // pas de slot (aperçu) -> on ne sauvegarde pas
    if (this.exploredCells) this.player.exploredFog = [...this.exploredCells] // brouillard : cellules explorées (carte révélée)
    const save = makeSave(this.player, this.character)
    if (this.inInterior && this._villageReturn) { save.x = Math.round(this._villageReturn.x); save.y = Math.round(this._villageReturn.y) } // dans un intérieur (hors-map) -> sauve la position VILLAGE, jamais hors-map
    saveCharacter(this.charId, save) // sauvegarde dans LE slot du perso courant
  }

  // ---------- minimap (brief §7) ----------

  /** Pré-génère une IMAGE schématique de TOUTE la map (1 px/tuile : couleurs de biome + eau + chemins),
   *  comme la carte du monde (M) mais en texture. UIScene en affiche une fenêtre ZOOMÉE qui suit le joueur. */
  setupMinimap() {
    if (this.textures.exists('mmtex')) this.textures.remove('mmtex')
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    const COL = { ocean: 0x274b78, prairie: 0x9bcf5a, forest: 0x3e8b41, snow: 0xe9f1ff, desert: 0xd9bd72, cursed: 0x7c4a63 }
    // assombrit/éclaircit une couleur d'un facteur f (texture par tuile -> moins plat)
    const shade = (hex, f) => {
      const r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * f)))
      const gg = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * f)))
      const b = Math.max(0, Math.min(255, Math.round((hex & 255) * f)))
      return (r << 16) | (gg << 8) | b
    }
    let minX = MAP_W; let minY = MAP_H; let maxX = 0; let maxY = 0
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const ocean = this.isOcean(tx, ty)
        let base
        if (ocean) {
          base = COL.ocean
        } else {
          base = COL[this.biomeAt(tx, ty)] ?? COL.forest
          if (tx < minX) minX = tx
          if (ty < minY) minY = ty
          if (tx > maxX) maxX = tx
          if (ty > maxY) maxY = ty
        }
        // VARIATION par tuile (3 paliers de bruit) -> relief/texture au lieu d'aplats unis
        const n = tileNoise(tx, ty, 9)
        const f = n < 0.34 ? 0.88 : n < 0.67 ? 1.0 : 1.12
        g.fillStyle(shade(base, f), 1)
        g.fillRect(tx, ty, 1, 1)
      }
    }
    for (const k of this.waterCells) {
      const [x, y] = k.split(',').map(Number)
      if (this.isOcean(x, y)) continue // garde la couleur d'océan ; on ne repeint que les rivières
      g.fillStyle(this.iceCells?.has(k) ? 0xcfe6f5 : 0x3f7fc0, 1) // glace = bleu pâle, rivière = bleu
      g.fillRect(x, y, 1, 1)
    }
    for (const k of this.pathCells) {
      const [x, y] = k.split(',').map(Number)
      g.fillStyle(0xb5915c, 1)
      g.fillRect(x, y, 1, 1)
    }
    // repère VILLAGE (point doré 2×2) pour s'orienter
    g.fillStyle(0xffe066, 1)
    g.fillRect(this.cx - 1, this.cy - 1, 2, 2)
    g.generateTexture('mmtex', MAP_W, MAP_H)
    g.destroy()
    this.landBounds = { minX, minY, maxX, maxY } // pour cadrer la carte du monde (M) sur l'île
  }

  // ---------- brouillard de guerre (carte M + minimap) ----------

  /** Prépare le brouillard : une RenderTexture (1 px/tuile, calée sur mmtex) entièrement SOMBRE au départ ;
   *  explorer y EFFACE des disques -> les zones vues réapparaissent sur la minimap ET la carte M. La grille
   *  grossière `exploredCells` est la vérité LOGIQUE (persistée + masquage des marqueurs non vus). */
  setupFog() {
    this.fogCell = 4 // tuiles par cellule logique d'exploration (grille pour la save + les marqueurs)
    this.fogRevealCells = 4 // rayon de révélation autour du joueur, en cellules (~16 tuiles + pinceau) : PLUS LARGE
    //                          que l'écran -> le brouillard reste HORS CHAMP quand on se balade (visible surtout sur la carte)
    this.exploredCells = new Set()
    this._lastFogKey = null
    // PINCEAU d'effacement = disque blanc TRÈS adouci (centre opaque -> long fondu vers le bord) -> contours doux
    this._fogBrushR = 5
    if (!this.textures.exists('fogbrush')) {
      const br = this._fogBrushR
      const bg = this.make.graphics({ add: false })
      for (let i = 0; i < 9; i++) { const t = i / 8; bg.fillStyle(0xffffff, 0.08 + 0.92 * t); bg.fillCircle(br, br, br * (1 - t * 0.9)) }
      bg.generateTexture('fogbrush', br * 2, br * 2)
      bg.destroy()
    }
    this._fogBrushImg = this.make.image({ x: 0, y: 0, key: 'fogbrush', add: false }).setOrigin(0, 0) // pinceau réutilisable -> effacement PROGRESSIF (alpha réglable)
    this._fogFade = [] // cellules en cours de FONDU à la découverte (opacité 100 -> 0 sur ~2 s, cf. updateFogFade)
    if (!this.textures.exists('fogsquare')) { // carré PLEIN (taille d'une cellule) -> effacement à la cellule, sans bavure
      const sg = this.make.graphics({ add: false })
      sg.fillStyle(0xffffff, 1).fillRect(0, 0, this.fogCell, this.fogCell)
      sg.generateTexture('fogsquare', this.fogCell, this.fogCell)
      sg.destroy()
    }
    if (!this.textures.exists('fogtile')) { // 1×1 -> effacement à la TUILE (révéler finement les rivières)
      const tg = this.make.graphics({ add: false })
      tg.fillStyle(0xffffff, 1).fillRect(0, 0, 1, 1)
      tg.generateTexture('fogtile', 1, 1)
      tg.destroy()
    }
    // RenderTexture NUAGEUSE couvrant toute la map, exposée en texture 'fogtex' (minimap + carte M + masque du monde)
    if (this.textures.exists('fogtex')) this.textures.remove('fogtex')
    this.fogRT = this.make.renderTexture({ width: MAP_W, height: MAP_H }, false)
    this.fogRT.fill(0x3f4a5e, 1) // base OPAQUE bleu-gris -> alpha plein partout (= masque d'exploration, pas un noir total)
    if (this.textures.exists('fog_clouds')) { // motif NUAGEUX par-dessus -> aspect « nuages » sur la carte M + la minimap
      for (let yy = 0; yy < MAP_H; yy += 180) for (let xx = 0; xx < MAP_W; xx += 320) this.fogRT.draw('fog_clouds', xx, yy, 0.5, 0xcdd9ec)
    }
    this.fogRT.saveTexture('fogtex')
    // CALQUE DE NUAGES dans le MONDE (brouillard de guerre visuel) : couvre tout, puis l'exploration le « déchire »
    // autour du joueur. Masqué par 'fogtex' (opaque = inexploré -> nuages visibles ; effacé = vu -> ciel clair). Dérive douce.
    if (this.textures.exists('fog_clouds')) {
      this.fogWorldMask = this.add.image(0, 0, 'fogtex').setOrigin(0, 0).setScale(TILE).setVisible(false)
      // VOILE OPAQUE sous les nuages : cache VRAIMENT le terrain inexploré (sinon on voyait les biomes ENTRE les
      // bouffées). UNE seule couche de nuages diffus par-dessus pour le relief.
      this.fogVeil = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, 0xb0bccd, 1).setOrigin(0, 0)
      this.worldClouds = this.add.tileSprite(0, 0, MAP_W * TILE, MAP_H * TILE, 'fog_clouds')
        .setOrigin(0, 0).setTileScale(3.6).setTint(0xeef3fb).setAlpha(0.5) // une SEULE couche de nuages, discrète
      // voile + nuages dans UN SEUL container masqué UNE fois -> 1 passe GPU
      this.fogGroup = this.add.container(0, 0, [this.fogVeil, this.worldClouds]).setDepth(8000)
      this.fogGroup.setMask(this.fogWorldMask.createBitmapMask())
      this.fogGroup.setAlpha(0.7) // brouillard à 70 % partout (jeu ET menu) -> on voit un peu le terrain à travers
    }
    // RAYLIGHT (god rays) : calque FIXE dans le monde (ne suit PAS la caméra -> on passe DESSOUS au lieu qu'il
    // « colle » au perso). Subtil + blend additif, affiché UNIQUEMENT près de la MER et le JOUR (cf. updateDayNight).
    if (this.textures.exists('raylight')) {
      this.raylight = this.add.tileSprite(0, 0, MAP_W * TILE, MAP_H * TILE, 'raylight')
        .setOrigin(0, 0).setDepth(8900).setBlendMode(Phaser.BlendModes.ADD).setTileScale(2.4).setTint(0xfff1c4).setAlpha(0)
      this._rayAlpha = 0 // alpha lissé -> fondu doux en entrant/sortant du bord de mer
    }
    // EN JEU UNIQUEMENT (le MENU/preview gère sa propre éclaircie autour du village -> tout le reste reste nuageux) :
    if (!this.preview) {
      // recharge l'exploration sauvegardée (efface les disques correspondants, instantané)
      const saved = this.saveData?.exploredFog
      if (Array.isArray(saved)) {
        for (const key of saved) {
          this.exploredCells.add(key)
          const [cx, cy] = key.split(',').map(Number)
          this._eraseFogCell(cx, cy)
        }
      }
      this.revealArea(this.cx, this.cy, 22, true) // village connu d'emblée (instant, pas de fondu au lancement)
      this.revealFog(this.player.x, this.player.y) // + autour du spawn (en fondu)
      // PRAIRIE révélée d'office : le brouillard S'ARRÊTE au bord de la prairie (toute la zone de départ est connue)
      const cc = this.fogCell
      const gw = Math.ceil(MAP_W / cc)
      const gh = Math.ceil(MAP_H / cc)
      for (let cy = 0; cy < gh; cy++) {
        for (let cx = 0; cx < gw; cx++) {
          const key = cx + ',' + cy
          if (this.exploredCells.has(key)) continue
          if (this.biomeAt(cx * cc + 2, cy * cc + 2) !== 'prairie') continue
          this.exploredCells.add(key)
          this._eraseFogCell(cx, cy)
        }
      }
    }
  }

  /** Efface le brouillard au centre d'une cellule logique (cx,cy) -> la map apparaît dessous (texture 1 px/tuile). */
  _eraseFogCell(cx, cy) {
    const r = this._fogBrushR
    const px = (cx + 0.5) * this.fogCell
    const py = (cy + 0.5) * this.fogCell
    this.fogRT?.erase('fogbrush', px - r, py - r)
  }

  /** Marque explorées les cellules autour de (px,py) et efface le brouillard correspondant. Ne fait du travail
   *  qu'au CHANGEMENT de cellule (appel chaque frame = quasi gratuit le reste du temps). */
  revealFog(px, py) {
    if (!this.fogRT) return
    const ccx = Math.floor(px / TILE / this.fogCell)
    const ccy = Math.floor(py / TILE / this.fogCell)
    const key0 = ccx + ',' + ccy
    if (key0 === this._lastFogKey) return // toujours dans la même cellule -> rien à recalculer
    this._lastFogKey = key0
    this.revealArea(Math.floor(px / TILE), Math.floor(py / TILE), this.fogRevealCells * this.fogCell)
  }

  /** Révèle toutes les cellules dans un rayon de `radTiles` autour de (tx,ty). Par défaut le brouillard s'efface
   *  en FONDU (opacité 100->0 sur ~2 s, cf. updateFogFade) ; `instant=true` l'efface d'un coup (setup/menu). */
  revealArea(tx, ty, radTiles, instant = false) {
    if (!this.fogRT) return
    const cc = this.fogCell
    const R = Math.max(1, Math.round(radTiles / cc))
    const ccx = Math.floor(tx / cc)
    const ccy = Math.floor(ty / cc)
    const gw = Math.ceil(MAP_W / cc)
    const gh = Math.ceil(MAP_H / cc)
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R + R) continue // disque (coins arrondis)
        const cx = ccx + dx
        const cy = ccy + dy
        if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue
        const key = cx + ',' + cy
        if (this.exploredCells.has(key)) continue
        this.exploredCells.add(key) // exploré tout de suite (logique/marqueurs) ; le VISUEL fond sur 2 s
        if (instant) this._eraseFogCell(cx, cy)
        else this._fogFade.push({ cx, cy, t: 0 })
      }
    }
  }

  /** FONDU de découverte : efface un PEU le brouillard à chaque frame sur les cellules fraîchement révélées,
   *  jusqu'à disparition totale au bout de ~2 s (opacité 100 -> 0 en douceur, au lieu d'un effacement net). */
  updateFogFade(delta) {
    const list = this._fogFade
    if (!list || !list.length) return
    const r = this._fogBrushR
    const aStep = Phaser.Math.Clamp(0.03 * delta / 16.67, 0, 1) // ~3 %/frame @60fps -> ~2 s pour s'effacer (ERASE = multiplicatif)
    const remain = []
    for (const c of list) {
      c.t += delta
      const done = c.t >= 2000
      this._fogBrushImg.setAlpha(done ? 1 : aStep) // dernier passage = effacement PLEIN (pas de résidu)
      this.fogRT.erase(this._fogBrushImg, (c.cx + 0.5) * this.fogCell - r, (c.cy + 0.5) * this.fogCell - r)
      if (!done) remain.push(c)
    }
    this._fogFade = remain
  }

  /** true si la tuile (tx,ty) a déjà été explorée (utilisé par l'UI pour masquer les marqueurs non vus). */
  isExplored(tx, ty) {
    if (!this.exploredCells) return true // pas de brouillard (mode aperçu) -> tout visible
    return this.exploredCells.has(Math.floor(tx / this.fogCell) + ',' + Math.floor(ty / this.fogCell))
  }

  /** true si une tuile d'OCÉAN est à moins de `rad` tuiles de la position monde (x,y) -> « bord de mer »
   *  (échantillonné par pas de 3 pour le coût ; utilisé par le raylight pour ne s'allumer qu'au littoral). */
  nearSea(x, y, rad = 7) {
    const tx = Math.floor(x / TILE)
    const ty = Math.floor(y / TILE)
    for (let dy = -rad; dy <= rad; dy += 3) {
      for (let dx = -rad; dx <= rad; dx += 3) {
        if (this.isOcean(tx + dx, ty + dy)) return true
      }
    }
    return false
  }

  /** ACCUEIL : la TERRE des îles reste 100 % sous les nuages, toute la MER est dégagée (nette). Le 100 % suit la
   *  terre RÉELLE (pas l'eau pure) -> les chenaux entre îles restent visibles = îles SÉPARÉES. (au setup du menu) */
  revealCoast() {
    if (!this.fogRT) return
    const cc = this.fogCell
    const gw = Math.ceil(MAP_W / cc)
    const gh = Math.ceil(MAP_H / cc)
    const e = cc - 1
    const m = cc >> 1
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        const x0 = cx * cc
        const y0 = cy * cc
        // nb de points d'EAU parmi 4 coins + centre de la cellule
        const n = (this.isOcean(x0, y0) ? 1 : 0) + (this.isOcean(x0 + e, y0) ? 1 : 0) + (this.isOcean(x0, y0 + e) ? 1 : 0) + (this.isOcean(x0 + e, y0 + e) ? 1 : 0) + (this.isOcean(x0 + m, y0 + m) ? 1 : 0)
        if (n === 5) {
          this.fogRT.erase('fogsquare', x0, y0) // PLEINE MER -> efface toute la cellule (rapide)
        } else if (n > 0) {
          // CELLULE CÔTIÈRE (mer + terre) : effacement TUILE par tuile, uniquement l'eau -> le brouillard s'arrête
          // EXACTEMENT au trait de côte (aucun débordage sur l'eau). La terre, elle, reste 100 % sous le brouillard.
          for (let ty = y0; ty < y0 + cc; ty++) for (let tx = x0; tx < x0 + cc; tx++) {
            if (this.isOcean(tx, ty)) this.fogRT.erase('fogtile', tx, ty)
          }
        }
        // n === 0 -> pleine terre : on n'y touche pas (100 % brouillard)
      }
    }
    // RIVIÈRES UNIQUEMENT (pas les lacs) : on suit la centerline de chaque rivière et on n'efface QUE les tuiles
    // d'EAU autour (gate `waterCells` -> pas de berge, pas de lac) -> fines lignes claires qui divisent les biomes.
    if (this.riverPaths && this.waterCells) {
      for (const path of this.riverPaths) {
        for (const p of path) {
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const tx = p.x + dx
            const ty = p.y + dy
            if (!this.isOcean(tx, ty) && this.waterCells.has(tx + ',' + ty)) this.fogRT.erase('fogtile', tx, ty)
          }
        }
      }
    }
  }

  // ---------- mode aperçu (fond vivant de l'écran d'accueil) ----------

  /** Prépare le village vivant : héros au centre + villageois qui se baladent. */
  setupPreview() {
    this.scene.sendToBack() // rester DERRIÈRE le menu (MenuScene) quel que soit l'ordre de boot

    // héros : pas de physique ni d'input, petite balade autour du centre de la place
    this.player.body.enable = false
    this.player.anims.play(`${this.player.heroKey}-idle-down`, true)
    this._heroW = this.makeWander(this.player, this.player.heroKey, this.player.x, this.player.y, 24, 18)

    // SEULS les civils baladeurs de la prairie (déjà dotés de _w) errent à l'accueil ; les villageois
    // de service (marchand/forgeron/Mira/Tom) restent STATIQUES partout (demandé).
    for (const npc of this.npcs || []) {
      if (!npc._w) continue
      this.tweens.killTweensOf(npc.sprite) // stoppe la "respiration" (sinon elle écrase l'anim de marche)
      npc.sprite.setScale(1)
      if (npc.sprite.body) this.physics.world.disable(npc.sprite) // retire le corps de l'arbre (pas juste enable=false)
      const lock = npc._w.biomeLock // garde le confinement prairie aussi à l'accueil
      // rayon/vitesse plus grands -> errance VISIBLE même à l'accueil dézoomé
      npc._w = this.makeWander(npc.sprite, npc.texture, npc.sprite.x, npc.sprite.y, 64, 24 + Math.random() * 12)
      if (lock) npc._w.biomeLock = lock
    }
    // le marchand reste à son étal (pas d'anim de marche pour sa planche) : juste sa respiration ;
    // on garde SON corps actif -> les villageois ne lui marchent pas dessus.
  }

  /** true si la position (pieds) chevauche un obstacle solide (maison, rocher, props, marchand). */
  previewBlocked(x, y) {
    return this.physics.overlapRect(x - 5, y, 10, 8, false, true).length > 0
  }

  /** true si la tuile est dans l'emprise (toit compris) d'un bâtiment du village. */
  onBuilding(tx, ty) {
    for (const f of this.villageFootprints || []) {
      if (tx >= f.tx && tx < f.tx + f.w && ty >= f.ty && ty < f.ty + f.h) return true
    }
    return false
  }

  /** Blocage de balade : obstacles solides + (pour les baladeurs verrouillés en biome) hors biome,
   *  chemins et emprise des bâtiments -> les civils ne marchent ni sur les chemins ni sur les maisons. */
  wanderBlocked(w, x, y) {
    if (this.previewBlocked(x, y)) return true
    // DISTANCE entre BALADEURS : seules les entités qui errent (état `_w`) comptent — les PNJ statiques non.
    const sep2 = (TILE * 3) * (TILE * 3)
    if (this._heroW && this._heroW !== w && this._heroW.sprite) {
      if ((x - this._heroW.sprite.x) ** 2 + (y - this._heroW.sprite.y) ** 2 < sep2) return true
    }
    for (const npc of this.npcs || []) {
      const ow = npc._w
      if (!ow || ow === w || !ow.sprite) continue
      if ((x - ow.sprite.x) ** 2 + (y - ow.sprite.y) ** 2 < sep2) return true
    }
    if (!w.biomeLock) return false
    const tx = Math.floor(x / TILE)
    const ty = Math.floor(y / TILE)
    if (this.biomeAt(tx, ty) !== w.biomeLock) return true
    if (this.pathCells && this.pathCells.has(this.key(tx, ty))) return true
    if (this.onBuilding(tx, ty)) return true
    return false
  }

  /** Choisit une nouvelle cible LIBRE autour du point d'ancrage (sinon reste sur place). */
  previewRetarget(w, time) {
    w.pauseUntil = time + 600 + Math.random() * 2200
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2
      const r = w.radius * (0.3 + Math.random() * 0.7)
      const tx = w.hx + Math.cos(ang) * r
      const ty = w.hy + Math.sin(ang) * r
      // refuse une cible hors biome / sur un chemin / sur un bâtiment (pour les baladeurs verrouillés)
      if (!this.wanderBlocked(w, tx, ty)) {
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
    if (this.worldClouds) { this.worldClouds.tilePositionX = time * 0.006; this.worldClouds.tilePositionY = time * 0.0032 } // nuages qui dérivent sur le menu
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
    if (this.wanderBlocked(w, nx, ny)) {
      this.previewRetarget(w, time) // mur/chemin/bâtiment devant -> on repart ailleurs
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
        // sol surtout UNI (tuile pleine fills[0]) -> accents décorés RARES et dispersés (moins de "détail")
        const fr = tileNoise(tx, ty, 7)
        const tile = fr < 0.86 ? fills[0] : fills[1 + Math.floor(tileNoise(tx, ty, 19) * (fills.length - 1))]
        const t = this.groundLayer.putTileAt(tile, tx, ty) // sol de biome SOUS le chemin
        // FILM de teinte par TACHES MOYENNES (bruit CONTINU quantifié en 3 nuances) -> ni damier par tuile,
        // ni énormes nappes : zones de quelques tuiles. Désert = sables orangés, neige = blancs/blanc-gris.
        if (t) {
          const r = Phaser.Math.Clamp((this.noise2D(tx * TINT_PATCH, ty * TINT_PATCH) + 1) / 2, 0, 1)
          if (b === 'desert') t.tint = r < 0.42 ? 0xe6a45c : r < 0.72 ? 0xf3c684 : 0xffe6b0
          else if (b === 'snow') t.tint = r < 0.42 ? 0xbfcfe2 : r < 0.72 ? 0xe2ebf5 : 0xffffff
        }
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
    const PRAIRIE_FILL = [56, 57] // herbe pleine uniquement (pousses/fleurs retirées : prairie sans plantes)
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
            const clearR = this.villageClearR(ang) + this.noise2D(tx, ty) * 2.6 // = bord de prairie (forme organique + bruit)
            const k = Phaser.Math.Clamp((dv - clearR) / 3 + this.noise2D(tx, ty) * 0.06, 0, 1) // bande courte (~3 tuiles)
            // forêt profonde : 3 verts proches par TACHES MOYENNES (bruit CONTINU quantifié) -> ni damier par
            // tuile, ni énormes nappes : des zones de vert de quelques tuiles.
            const r = Phaser.Math.Clamp((this.noise2D(tx * TINT_PATCH, ty * TINT_PATCH) + 1) / 2, 0, 1)
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
  /** Rayon de la clairière de prairie à l'angle `ang` — forme ORGANIQUE (variation multi-fréquences, pas un cercle). */
  villageClearR(ang) {
    return VILLAGE_CLEAR_R * (1 + 0.2 * Math.sin(ang * 2 + 1) + 0.12 * Math.sin(ang * 3 + 2.4) + 0.07 * Math.sin(ang * 5 + 0.7))
  }

  biomeAt(tx, ty) {
    if (this.isCursedIsland(tx, ty)) return 'cursed' // île maudite au large (end-game verrouillé)
    // petit bourg dégagé autour du village (clairière irrégulière ~11 tuiles) -> le village est DANS
    // la forêt, ce n'est PAS un grand ovale concentrique
    const dv = Math.hypot(tx - this.cx, ty - this.cy)
    const clearR = this.villageClearR(Math.atan2(ty - this.cy, tx - this.cx)) + this.noise2D(tx, ty) * 2.6
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
    // ...mais setCollisionByExclusion vient de RÉ-activer la collision sur TOUTES les tuiles d'eau, y
    // compris celles (visibles) sous les ponts/gués posés par buildRivers -> on les re-libère, sinon les
    // traversées redeviennent des murs invisibles (piège Phaser vécu : "on voit le pont mais il bloque").
    this.clearCrossingCollision()
  }

  /** Retire la collision des tuiles d'eau situées sous les PONTS et les GUÉS, puis recalcule les faces
   *  Arcade (sans quoi les anciennes faces persistent). À rappeler après TOUT setCollisionByExclusion
   *  sur this.waterLayer, sinon les traversées se re-bloquent. */
  clearCrossingCollision() {
    for (const set of [this.bridgeCells, this.fordCells]) {
      for (const k of set || []) {
        const [x, y] = k.split(',').map(Number)
        const t = this.waterLayer.getTileAt(x, y)
        if (t) t.setCollision(false)
      }
    }
    this.waterLayer.calculateFacesWithin(0, 0, MAP_W, MAP_H)
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
    const bts = bmap.addTilesetImage('bridge_wood', 'bridge_wood', TILE, TILE) // pont en bois Sprout (5×3 tuiles)
    this.bridgeLayer = bmap.createBlankLayer('bridge', bts, 0, 0).setDepth(-7)
    // couche des GUÉS (terre battue marron clair) au-dessus de l'eau/sol
    const fmap = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    const fts = fmap.addTilesetImage('bridge_wood', 'bridge_wood', TILE, TILE) // gués rendus en PONT bois (comme les ponts)
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
    this.renderFordBridges() // eau visible (sans collision) + sprite de pont agrandi sous chaque traversée
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
    const px = -Math.sin(flowAng) // direction perpendiculaire (en travers de la rivière) = LONGUEUR du pont
    const py = Math.cos(flowAng)
    const fx = Math.cos(flowAng) // direction du courant (pour la largeur du pont)
    const fy = Math.sin(flowAng)
    // orientation du tablier : si le pont s'étend surtout horizontalement -> pont HORIZONTAL (planches
    // verticales), sinon VERTICAL (planches horizontales). Tuiles du sprite bridge_wood (cf. BRIDGE_H/V).
    const tile = Math.abs(px) >= Math.abs(py) ? BRIDGE_H : BRIDGE_V
    const place = (x, y) => {
      const tx = Math.round(x)
      const ty = Math.round(y)
      if (tx < 1 || ty < 1 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return
      const k = this.key(tx, ty)
      if (this.iceCells.has(k)) return
      this.bridgeCells.add(k)
      this.bridgeLayer.putTileAt(tile, tx, ty) // planches orientées selon le sens du pont
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
    this.fordBridgeRects = [] // rectangles {px,py,w,h} où poser UN sprite de pont agrandi (rendu plus tard)
    for (const fx of fordXs) {
      let run = null // segment contigu de traversée en cours {minX,maxX,minY,maxY}
      const flush = () => {
        if (!run) return
        // UN SEUL sprite de pont couvre la traversée + 1 case de TERRE à chaque bout (touche les 2 rives,
        // ne s'arrête pas dans l'eau). Rendu après le setup de collision.
        const y0 = Math.max(0, run.minY - 1)
        const y1 = Math.min(MAP_H - 1, run.maxY + 1)
        this.fordBridgeRects.push({ px: run.minX * TILE, py: y0 * TILE, w: (run.maxX - run.minX + 1) * TILE, h: (y1 - y0 + 1) * TILE })
        run = null
      }
      for (let ty = 2; ty < MAP_H - 2; ty++) {
        let onRiver = false
        for (let dx = -1; dx <= 1; dx++) if (wide.has(this.key(fx + dx, ty))) onRiver = true
        if (!onRiver) { flush(); continue }
        let rowHasCell = false
        for (let dx = -1; dx <= 1; dx++) { // gué étroit (3 cases, centré sur la porte) : juste de quoi passer
          const k = this.key(fx + dx, ty)
          if (!wide.has(k)) continue
          this.waterCells.delete(k) // marchable garanti (sort de la logique d'eau) ; l'eau VISUELLE est re-posée sans collision après
          this.frontierCells.delete(k)
          this.fordCells.add(k)
          this.pathCells.add(k) // déco/spawns évitent le pont
          const cx = fx + dx
          if (!run) run = { minX: cx, maxX: cx, minY: ty, maxY: ty }
          else { run.minX = Math.min(run.minX, cx); run.maxX = Math.max(run.maxX, cx); run.maxY = ty }
          rowHasCell = true
        }
        if (!rowHasCell) flush()
      }
      flush()
    }
  }

  /** Pose, APRÈS le setup de collision de l'eau : (1) de l'eau VISUELLE sans collision sous chaque gué,
   *  (2) un seul sprite de pont AGRANDI par traversée. Appelé en fin de buildRivers. */
  renderFordBridges() {
    const btex = this.textures.get('bridge_wood')
    if (btex && !btex.has('vbridge')) btex.add('vbridge', 0, 0, 0, 16, 48) // UNE colonne = UN pont vertical complet (rambardes + bouts)
    for (const k of this.fordCells || []) {
      const [x, y] = k.split(',').map(Number)
      const t = this.waterLayer.putTileAt(Math.floor(tileNoise(x, y, 3) * 4), x, y) // eau VISIBLE sous le pont
      if (t) t.setCollision(false) // ...mais marchable (on passe dessus)
    }
    // IMPORTANT : recalcule les "faces" de collision de la couche d'eau APRÈS avoir retiré la collision des
    // gués/ponts. Sans ça, Arcade garde les anciennes faces et le pont reste INFRANCHISSABLE (piège Phaser).
    this.waterLayer.calculateFacesWithin(0, 0, MAP_W, MAP_H)
    for (const r of this.fordBridgeRects || []) {
      this.add.image(r.px, r.py, 'bridge_wood', 'vbridge').setOrigin(0, 0).setDisplaySize(r.w, r.h).setDepth(-7)
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
      if (b !== 'forest') continue // étangs en FORÊT uniquement (plus d'eau dans la prairie du village ni en neige)
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
        // neige : sapins répartis en grille jittered dans scatterSnowProps (couverture uniforme + remplit les arènes)
        if (b === 'cursed' && Phaser.Math.Between(0, 100) < 32) place(x, y, TREE_DEAD)
        // désert : arbres morts répartis en grille jittered dans scatterDesertProps (couverture uniforme, sans amas/trous)
      }
    }
  }

  addTree(tx, ty, frames = TREE, destructible = false) {
    const px = tx * TILE
    const py = ty * TILE
    const baseY = py + 2 * TILE
    const TRUNK_DEPTH = -5 // tronc toujours derrière le perso, jamais devant la tête

    const leaves = []
    const sprites = [] // tous les sprites de l'arbre (pour la pulvérisation par l'onde de choc)
    sprites.push(this.add.image(px + 8, py + 24, 'nature', frames.bl).setDepth(TRUNK_DEPTH))
    sprites.push(this.add.image(px + 24, py + 24, 'nature', frames.br).setDepth(TRUNK_DEPTH))
    leaves.push(this.add.image(px + 8, py + 8, 'nature', frames.tl).setDepth(baseY))
    leaves.push(this.add.image(px + 24, py + 8, 'nature', frames.tr).setDepth(baseY))
    sprites.push(...leaves)

    const trunk = this.add.rectangle(px + TILE, py + TILE + 8, 16, 9)
    this.physics.add.existing(trunk, true)
    this.obstacles.add(trunk)

    const entry = { leaves, bounds: new Phaser.Geom.Rectangle(px, py, 2 * TILE, TILE + 12) }
    this.trees.push(entry)
    // destructible : pulvérisé par l'onde de choc à l'ouverture de l'arène (comme les chênes de forêt)
    if (destructible) this.destructibles.push({ x: px + TILE, y: py + TILE, body: trunk, sprites, entry })
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

  /** Déco ÉTOFFÉE du DÉSERT (assets Ninja extraits) : palmiers nains + rochers de grès, dispersés.
   *  Objets multi-tuiles (réservation) avec collision au pied, tri en profondeur (depth = base au sol). */
  scatterDesertProps() {
    this.quicksands ||= [] // pièges de sable (aspiration) : {x, y, r}
    // place un objet w×h tuiles UNIQUEMENT si toute l'emprise est du désert, libre, hors chemin/eau/arène.
    const free = (tx, ty, w, h) => {
      if (tx < 1 || ty < 1 || tx > MAP_W - w - 1 || ty > MAP_H - h - 1) return false
      if (this.nearSpawn(tx, ty, 5)) return false
      if (this.onPath(tx, ty, 1) || this.onWater(tx, ty, 1)) return false
      if (this.nearBossLair(tx, ty)) return false // clairière d'arène = dégagée
      for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) if (this.biomeAt(tx + dx, ty + dy) !== 'desert') return false
      return this.reserve(tx, ty, w, h)
    }
    // ARBRES MORTS en GRILLE JITTERED : un nœud tous les STEP tuiles + décalage aléatoire -> couverture
    // UNIFORME du désert (pas de gros trous sans arbre, pas d'amas). Posés EN PREMIER (priorité d'espace).
    // les arbres REMPLISSENT aussi les arènes (juste une clairière ~4 tuiles autour du boss) ; ils sont
    // DESTRUCTIBLES -> pulvérisés par l'onde de choc à l'ouverture de l'arène (comme la forêt). Plus de
    // grand cercle vide autour des repaires.
    const lairs = Object.values(this.bossLairs || {}).flat()
    const STEP = 5
    for (let gy = 2; gy < MAP_H - 3; gy += STEP) {
      for (let gx = 2; gx < MAP_W - 3; gx += STEP) {
        const tx = gx + Phaser.Math.Between(-1, 2)
        const ty = gy + Phaser.Math.Between(-1, 2)
        if (this.biomeAt(tx, ty) !== 'desert') continue
        if (this.nearSpawn(tx, ty, 5) || this.onPath(tx, ty, 2) || this.onWater(tx, ty, 2)) continue
        if (lairs.some((l) => this.dist(tx, ty, l.tx, l.ty) < 4)) continue // petite clairière autour du boss
        if (this.reserve(tx, ty, 2, 2)) this.addTree(tx, ty, TREE_DEAD, true)
      }
    }
    for (let y = 2; y < MAP_H - 3; y++) {
      for (let x = 2; x < MAP_W - 3; x++) {
        if (this.biomeAt(x, y) !== 'desert') continue
        const roll = Phaser.Math.Between(0, 1000)
        if (roll < 16) { if (free(x, y, 1, 1)) this.addDesertPalm(x, y) } // palmiers nains (clairsemés)
        else if (roll < 23) { const big = Phaser.Math.Between(0, 1) === 0; if (free(x, y, big ? 4 : 2, big ? 3 : 2)) this.addDesertRock(x, y, big) } // rochers de grès
        else if (roll < 26) { if (free(x, y, 2, 2)) this.addQuicksand(x, y) } // sables mouvants (piège rare)
      }
    }
  }

  /** Palmier nain du désert : image (pied centré) + petite collision de tronc. */
  addDesertPalm(tx, ty) {
    const px = tx * TILE + 8
    const baseY = ty * TILE + TILE
    this.add.image(px, baseY, 'palm_desert').setOrigin(0.5, 1).setDepth(baseY)
    const trunk = this.add.rectangle(px, baseY - 3, 6, 5)
    this.physics.add.existing(trunk, true)
    this.obstacles.add(trunk)
  }

  /** Rocher de grès : moyen (desert_rock1, 32×30, emprise 2×2) ou gros (desert_rock2, 62×46, emprise 4×3).
   *  Image pied centré sur l'emprise réservée, collision basse, tri en profondeur. */
  addDesertRock(tx, ty, big) {
    const w = big ? 4 : 2
    const h = big ? 3 : 2
    const px = tx * TILE + (w * TILE) / 2
    const baseY = ty * TILE + h * TILE
    this.add.image(px, baseY, big ? 'desert_rock2' : 'desert_rock1').setOrigin(0.5, 1).setDepth(baseY)
    const rect = this.add.rectangle(px, baseY - 6, big ? 50 : 26, 12)
    this.physics.add.existing(rect, true)
    this.obstacles.add(rect)
  }

  /** Sables mouvants (piège) : tourbillon animé au sol (sous le héros) + zone d'aspiration enregistrée
   *  (this.quicksands). Pas de collision physique : c'est updateQuicksand qui tire/blesse le joueur. */
  addQuicksand(tx, ty) {
    const cx = tx * TILE + TILE // centre de l'emprise 2×2
    const cy = ty * TILE + TILE
    this.add.sprite(cx, cy, 'quicksand').setDepth(-6).setAlpha(0.72).play('quicksand') // décal de sol semi-transparent (laisse voir le sable dessous)
    this.quicksands.push({ x: cx, y: cy, r: 17 })
  }

  /** Déco ÉTOFFÉE de la NEIGE : sapins de neige VARIÉS (3 variantes) en grille jittered -> couverture
   *  uniforme (pas d'amas/trous). Ils REMPLISSENT aussi les arènes (clairière 4 tuiles autour du boss)
   *  et sont DESTRUCTIBLES (pulvérisés par l'onde de choc), exactement comme la forêt et le désert. */
  scatterSnowProps() {
    const lairs = Object.values(this.bossLairs || {}).flat()
    const STEP = 5
    for (let gy = 2; gy < MAP_H - 3; gy += STEP) {
      for (let gx = 2; gx < MAP_W - 3; gx += STEP) {
        const tx = gx + Phaser.Math.Between(-1, 2)
        const ty = gy + Phaser.Math.Between(-1, 2)
        if (this.biomeAt(tx, ty) !== 'snow') continue
        if (this.nearSpawn(tx, ty, 5) || this.onPath(tx, ty, 2) || this.onWater(tx, ty, 2)) continue
        if (lairs.some((l) => this.dist(tx, ty, l.tx, l.ty) < 4)) continue // petite clairière autour du boss
        if (this.reserve(tx, ty, 2, 2)) this.addTree(tx, ty, Phaser.Utils.Array.GetRandom(SNOW_TREES), true)
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
      const conf = BIOME_SPAWN[biome] || { mult: 1, gap: MONSTER_GAP }
      const budget = Math.round((MONSTER_COUNT * land[biome] * conf.mult) / total)
      this.populateBiome(biome, budget, conf.gap)
    }
  }

  /** Peuple UN biome avec `budget` monstres ISOLÉS, bien espacés (couverture uniforme de la zone,
   *  pas de regroupement en camps -> pas de zones vides, et les élites restent seules). */
  populateBiome(biome, budget, gap = MONSTER_GAP) {
    if (budget <= 0) return
    for (let placed = 0, guard = 0; placed < budget && guard < budget * 20; guard++) {
      const t = this.findTileInBiome(biome, { gap })
      if (!t) continue // un échec ne doit PAS abandonner tout le budget (forêt dense)
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

  /** Variante FORÊT : on autorise les mobs SOUS les canopées (occupées mais walk-behind) ; on évite
   *  seulement les collisions réelles (troncs/rochers via previewBlocked), l'eau, le spawn et les arènes.
   *  -> la forêt dense ne bloque plus le peuplement (sinon budget abandonné, biome quasi vide). */
  spawnableForest(tx, ty) {
    return (
      tx >= 2 && ty >= 2 && tx <= MAP_W - 3 && ty <= MAP_H - 3 &&
      !this.nearSpawn(tx, ty, 8) && !this.onWater(tx, ty, 1) && !this.nearBossLair(tx, ty) &&
      !this.previewBlocked(tx * TILE + 8, ty * TILE + 8) // évite troncs/rochers, pas les canopées
    )
  }

  /** MUR INVISIBLE réservé aux MOBS au bord de la prairie : un monstre qui entre dans la prairie
   *  (zone sûre du village) voit sa vitesse radiale forcée vers l'EXTÉRIEUR (composante tangentielle
   *  gardée -> il longe le bord en suivant le joueur, sans jamais entrer). Le joueur n'est PAS affecté. */
  /** Mur invisible (MOBS ordinaires) sur les PONTS/GUÉS : un mob ne doit pas marcher sur un pont (ni traverser
   *  les rivières par les ponts). On le STOPPE à l'entrée du pont, et on le repousse s'il est déjà dessus. */
  keepMonsterOffBridge(mon) {
    if (!mon.body || !mon.active || mon.isBoss) return
    if (!this.bridgeCells && !this.fordCells) return
    const onCell = (x, y) => {
      const k = Math.floor(x / TILE) + ',' + Math.floor(y / TILE)
      return this.bridgeCells?.has(k) || this.fordCells?.has(k)
    }
    const v = mon.body.velocity
    const sp = Math.hypot(v.x, v.y)
    if (onCell(mon.x, mon.y)) { // déjà sur un pont -> fait demi-tour (repoussé vers la terre)
      if (sp > 1) { mon.body.velocity.x = -(v.x / sp) * 55; mon.body.velocity.y = -(v.y / sp) * 55 }
      return
    }
    if (sp >= 5 && onCell(mon.x + (v.x / sp) * 11, mon.y + (v.y / sp) * 11)) mon.body.velocity.set(0, 0) // stoppé au bord du pont
  }

  keepMonsterOutOfPrairie(mon) {
    if (!mon.body || !mon.active) return
    const cxp = this.cx * TILE
    const cyp = this.cy * TILE
    const dx = mon.x - cxp
    const dy = mon.y - cyp
    const ang = Math.atan2(dy, dx)
    const wallR = this.villageClearR(ang) + 2 // bord externe de la prairie (en tuiles)
    if (Math.hypot(dx, dy) / TILE >= wallR) return // déjà dehors -> rien
    const nx = Math.cos(ang) // direction VERS L'EXTÉRIEUR
    const ny = Math.sin(ang)
    const vIn = mon.body.velocity.x * nx + mon.body.velocity.y * ny // vitesse radiale (négatif = entrant)
    mon.body.velocity.x += (-vIn + 26) * nx // radial forcé à +26 (sortie), tangentiel conservé
    mon.body.velocity.y += (-vIn + 26) * ny
  }

  /** Mur invisible (MOBS ordinaires uniquement) au bord de l'ARÈNE de boss active : un mob qui erre
   *  jusque dans le cercle scellé est repoussé vers l'extérieur -> on n'affronte QUE le boss, pas une meute.
   *  (Le joueur et le boss, eux, sont CONFINÉS dedans par updateArena ; les mobs sont confinés DEHORS.) */
  keepMonsterOutOfArena(mon) {
    const a = this.activeArena
    const b = mon.body
    if (!a || !b || !mon.active || mon.isBoss) return
    // le CORPS ENTIER du mob doit rester DEHORS : on garde son centre à >= rayon + demi-corps + marge.
    const minD = a.r + Math.max(b.halfWidth, b.halfHeight) + 6
    const dx = b.center.x - a.cx
    const dy = b.center.y - a.cy
    const d = Math.hypot(dx, dy)
    if (d >= minD) return // déjà assez dehors -> rien
    const ux = d > 0.001 ? dx / d : 1 // direction VERS L'EXTÉRIEUR (mob pile au centre -> axe X par défaut)
    const uy = d > 0.001 ? dy / d : 0
    // CLAMP DUR de position (corps = source de vérité avant le step physique, comme le confinement du joueur) :
    // mur INFRANCHISSABLE même si le mob pousse en continu vers le joueur -> il ne grignote plus l'arène.
    b.position.set(a.cx + ux * minD - b.halfWidth, a.cy + uy * minD - b.halfHeight)
    // ...et on tue la vitesse RADIALE ENTRANTE (le mob glisse le long du mur au lieu de s'y enfoncer).
    const vr = b.velocity.x * ux + b.velocity.y * uy // < 0 = entrant
    if (vr < 0) { b.velocity.x -= vr * ux; b.velocity.y -= vr * uy }
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
    const okTile = biome === 'forest' ? (x, y) => this.spawnableForest(x, y) : (x, y) => this.spawnableTile(x, y)
    for (let tries = 0; tries < 120; tries++) {
      const tx = Phaser.Math.Between(2, MAP_W - 3)
      const ty = Phaser.Math.Between(2, MAP_H - 3)
      if (this.biomeAt(tx, ty) !== biome || !okTile(tx, ty)) continue
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
    let level = this.monsterLevelAt(tx, ty) + Phaser.Math.Between(-1, 1) // élite = multiplicateur à plat (Monster.js), pas +niveau
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
      if (this.activeArena && this.dist(tx * TILE + 8, ty * TILE + 8, this.activeArena.cx, this.activeArena.cy) <= this.activeArena.r) continue // ni dans l'arène scellée en cours (rayon élargi)
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
      let level = this.monsterLevelAt(tx, ty) + Phaser.Math.Between(-1, 1) // élite = multiplicateur à plat (Monster.js), pas +niveau
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
    // apparences DISTINCTES (ni villageois du bourg, ni perso de classe) -> une UNIQUE par PNJ = pas de doublon
    const texes = ['npc_noble', 'npc_princess', 'npc_oldman', 'npc_oldman2', 'npc_monk', 'npc_monk2', 'npc_hunter', 'npc_inspector', 'npc_master', 'npc_shaman', 'npc_mangreen', 'npc_eskimo', 'npc_fighterwhite', 'npc_fighterred']
    // dialogues d'AMBIANCE : chaque baladeur évoque une facette du monde d'Iroas (lore, pas de tuto)
    const pool = [
      // Edda — le désert du sud
      ['Au sud, le désert brûle sous un soleil sans pitié.', 'Les araignées y sont grosses comme des chiens, et un cyclope borgne hante les dunes. Beaucoup sont partis le chasser... peu sont revenus.'],
      // Rurik — le pic gelé du nord
      ['Le pic gelé du nord n\'est pas pour les âmes tièdes.', 'Là-haut, un Tengu des glaces déchaîne les tempêtes, et une gelée ancienne rampe entre les congères. Le froid mord plus fort que les bêtes.'],
      // Sylvane — la forêt ancienne
      ['La forêt qui nous entoure est vieille comme le monde.', 'Ses chênes ont vu passer des héros... et les ont vus tomber. Un samouraï sylvestre veille en son cœur ; on ne le défie pas seul.'],
      // Bram — la mer et le kraken
      ['La mer cache un kraken sur ses rivages ; ses tentacules ont coulé plus d\'un marin imprudent.', 'On dit que le marchand vend une barque. Avec elle, on pourrait enfin franchir les flots et voir ce qu\'il y a de l\'autre côté.'],
      // Oona — l'île maudite
      ['À l\'horizon sud-ouest, une île maudite flotte dans la brume.', 'Dargoth y règne sur les âmes damnées. Nul n\'en est jamais revenu — c\'est là-bas que finissent les légendes... ou qu\'elles commencent.'],
      // Tibert — l'histoire d'Iroas
      ['Iroas était jadis un grand royaume ; il n\'en reste que ce village et des ruines au loin.', 'Les anciens parlent d\'un dragon endormi sous les vagues. Réveille-le, dit-on, et le monde entier tremblera.'],
    ]
    // 6 baladeurs : 3 à GAUCHE du village, 3 à DROITE. On pioche dans toute la moitié correspondante de la
    // PRAIRIE (côté = signe de tx-cx) -> beaucoup de spots valides, donc les 6 se placent bien espacés.
    const TARGET = 6
    this.wildNpcs = []
    for (let guard = 0; this.wildNpcs.length < TARGET && guard < 12000; guard++) {
      const i = this.wildNpcs.length
      const left = i < TARGET / 2 // les 3 premiers à gauche du village, les 3 suivants à droite
      const tx = Phaser.Math.Between(this.cx - 20, this.cx + 20)
      const ty = Phaser.Math.Between(this.cy - 20, this.cy + 20)
      if (left ? tx > this.cx - 3 : tx < this.cx + 3) continue // garde le bon côté (petit couloir neutre au centre)
      if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) continue
      if (this.isOcean(tx, ty) || this.isIsland(tx, ty)) continue
      if (this.biomeAt(tx, ty) !== 'prairie') continue // UNIQUEMENT en prairie
      if (this.dist(tx, ty, this.cx, this.cy) < 11) continue // pas sur les bâtiments du centre
      if (this.wildNpcs.some((n) => this.dist(tx, ty, n.tx, n.ty) < 6)) continue // bien espacés au spawn
      this.wildNpcs.push({ tx, ty, tex: texes[i], name: names[i], lines: pool[i % pool.length] })
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
    return // DRAGON DE MER MASQUÉ temporairement (à réactiver plus tard) -> retirer ce return pour le réafficher
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
    const level = 6 // niveau AFFICHÉ du boss (cosmétique : ses stats sont FIXES, non scalées par niveau)
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
      () => !this.player.dashing && !boss.charging && !boss.slamming, // dash joueur / charge / saut-slam = traversée
    )
  }

  /** ARÈNE DE BOSS : verrouillage par proximité + mur invisible tant que le boss vit.
   *  Appelée chaque frame APRÈS player.update (la vélocité du joueur est déjà posée). */
  updateArena() {
    const p = this.player
    if (this.gameOver) return // mort en cours : ni verrouillage ni confinement (sinon re-piège au respawn)
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
          if (vr > 0) {
            // Boss en CHARGE qui percute le mur -> ARRÊT NET. Sinon on ne retire QUE la composante radiale et
            // il GLISSE tangentiellement le long du mur : il a alors l'air de ne PAS suivre la direction de son
            // dash (bug signalé). Le dash va donc droit jusqu'au mur puis s'arrête, conforme au télégraphe.
            if (a.boss.charging) bb.velocity.set(0, 0)
            else { bb.velocity.x -= vr * ux; bb.velocity.y -= vr * uy } // hors charge : glisse le long du mur (nav normale)
          }
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

  /** Cercle de danger au sol pour un SAUT-SLAM de boss : pulse pendant le télégraphe + le bond, puis
   *  s'efface à l'impact. Le joueur esquive en quittant le cercle avant que la gélée ne retombe. */
  bossSlamTelegraph(boss, x, y, cfg) {
    const r = cfg.hitRadius ?? 60
    const col = cfg.color ?? 0x7be0c8
    const zone = this.add.circle(x, y, r, col, 0.16).setDepth(y - 2)
    const ring = this.add.circle(x, y, r, col, 0).setStrokeStyle(3, col, 0.85).setDepth(y - 1)
    this.tweens.add({ targets: zone, fillAlpha: 0.42, duration: cfg.windup / 2, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    Audio.sfx(SFX.whoosh, { vol: 0.4, detune: -450 }) // grondement de mise en garde
    this.time.delayedCall(cfg.windup + cfg.jumpDur, () => {
      if (!zone.active) return
      this.tweens.killTweensOf(zone)
      this.tweens.add({ targets: [zone, ring], alpha: 0, duration: 200, onComplete: () => { zone.destroy(); ring.destroy() } })
    })
  }

  /** Impact d'un SAUT-SLAM : onde de choc circulaire qui s'étend + secousse + son lourd. Les dégâts (AoE)
   *  sont appliqués côté Monster (test de distance au point d'impact) ; ici on ne fait que le rendu. */
  onBossSlamImpact(boss, x, y, cfg) {
    const r = cfg.hitRadius ?? 60
    const col = cfg.color ?? 0x7be0c8
    const wave = this.add.circle(x, y, 8).setStrokeStyle(6, col, 0.95).setDepth(y + 1)
    this.tweens.add({
      targets: { v: 0 }, v: 1, duration: 360, ease: 'Cubic.out',
      onUpdate: (tw, t) => { wave.setRadius(8 + (r - 8) * t.v); wave.setAlpha(0.95 * (1 - t.v)) },
      onComplete: () => wave.destroy(),
    })
    this.cameras.main.shake(220, 0.012)
    Audio.sfx(SFX.hit, { vol: 0.8, detune: -400 }) // écrasement lourd
    if (this.dist(this.player.x, this.player.y, x, y) <= r) this.flashHurt() // n'a flashé QUE si le joueur était dans le cercle
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
    const col = ARENA_BIOME_COLOR[boss.bossBiome] ?? (boss.isRaid ? 0x8b2fd6 : 0xd23a3a) // teinte d'ambiance par biome
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
        const srcDx = b.flip ? (b.w - 1 - dx) : dx // miroir horizontal optionnel (b.flip) -> colonne source inversée
        const frame = (b.row + dy) * HOUSE_COLS + (b.col + srcDx)
        this.add.image((tx + dx) * TILE + 8, (ty + dy) * TILE + 8, 'house', frame).setDepth(depth).setFlipX(!!b.flip)
      }
    }
    // collision sur la BASE (2 rangées du bas) ; le toit déborde au-dessus (walk-behind).
    // RECTANGLE BLEU PLEIN. TAVERNE : base remontée de 16 px (rangée du bas vide). Les autres : collider d'origine.
    // (L'entrée est gérée par le carré VERT posé sur la porte DANS ce rectangle — cf. spawnVillage.)
    const wpx = b.w * TILE
    const collRows = Math.min(2, b.h)
    const top = ty + b.h - collRows
    const lift = key === 'tavern' ? 16 : 0
    const growTop = key === 'tavern' ? 6 : 0 // taverne : collider étendu de 6 px vers le HAUT
    const ch = collRows * TILE - lift + growTop
    const ccy = (top + collRows / 2) * TILE - lift / 2 - growTop / 2
    const rect = this.add.rectangle(tx * TILE + wpx / 2, ccy, wpx - 2, ch)
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
    // plan du village : maison de DROITE = marchand, GAUCHE = forgeron, HAUT = Mira, BAS = Tom.
    // (marchand = entrée `merchant:true` -> place la maison + porte, mais PAS de villageois bavard ;
    //  le sprite du marchand s'y tient, posé par spawnMerchant.)
    this.villagers = [
      { hx: cx + 7, hy: cy - 1, key: 'apothecary', merchant: true, enter: 'merchant', place: 'Marché' }, // EST du cercle = marchand (échoppe verte) — enterable
      {
        hx: cx - 9, hy: cy - 1, key: 'house_long', tex: 'npc_villager', name: 'Aldric le Forgeron', role: 'forge', enter: 'forge', place: 'Forge', // OUEST du cercle
        lines: [
          'Je suis Aldric, le forgeron. Apporte-moi tes armes et armures.',
          'Je peux les réparer quand elles s\'usent, et les améliorer contre de l\'or.',
        ],
      },
      // MIRA tient l'AUBERGE. Les QUÊTES se donnent à la RÉCEPTION (intérieur) : ce PNJ de seuil n'est qu'un
      // accueil (noQuest) qui invite à entrer — l'auberge affiche un marqueur ! / ? quand Mira a une tâche.
      {
        hx: cx - 2, hy: cy - 12, key: 'cabin', tex: 'npc_woman', name: 'Mira', enter: 'inn', place: 'Auberge', noQuest: true, // NORD du cercle
        lines: [
          'Bienvenue, voyageur ! Je suis Mira, je tiens l\'auberge.',
          'Appuie sur C pour ta fiche (équipe armes/armures). Le marchand est à droite — parle-lui avec E.',
          'Entre donc : je t\'accueille à la réception, et j\'ai souvent du travail pour un aventurier.',
        ],
      },
      // --- BÂTIMENTS DE SERVICE (entrées préparées via `enter` pour les intérieurs à venir) ---
      {
        hx: cx + 5, hy: cy - 8, key: 'tavern', tex: 'npc_noble', name: 'Brewen le tavernier', enter: 'tavern', place: 'Taverne', // NORD-EST du cercle (Brewen = Noble, cohérent avec le barman intérieur)
        lines: [
          'Bienvenue à la taverne du Dernier Repos, aventurier !',
          'Pousse la porte quand tu veux : bientôt, j\'aurai chopes et ragoûts qui requinquent (bonus passagers).',
        ],
      },
      {
        hx: cx + 6, hy: cy + 5, key: 'store', tex: 'npc_shaman', name: 'Ylva l\'apothicaire', enter: 'apothecary', place: 'Apothicaire', // SUD-EST du cercle
        lines: [
          'Je suis Ylva, apothicaire. Mes potions soignent, restaurent la mana, et bravent le froid comme la chaleur.',
          'Mon échoppe ouvrira bientôt — en attendant, le marchand en vend quelques-unes.',
        ],
      },
      {
        hx: cx - 7, hy: cy - 8, key: 'bank', tex: 'npc_inspector', name: 'Cornélius le banquier', enter: 'bank', place: 'Banque', // NORD-OUEST du cercle
        lines: [
          'La banque d\'Iroas gardera tes biens en sûreté — même après une mauvaise chute.',
          'Le coffre ouvrira bientôt. Patience, l\'or appelle l\'or.',
        ],
      },
      {
        hx: cx - 1, hy: cy + 7, key: 'house_orange', tex: 'npc_master', name: 'Sieur Aldwin', enter: 'house', place: 'Maison', // SUD du cercle (npc_master : plus de Noble en doublon, réservé au barman)
        lines: ['Un noble de passage ? Non, j\'habite ici. Ce bourg grandit vite, n\'est-ce pas ?'],
      },
      {
        hx: cx - 7, hy: cy + 5, key: 'cottage', tex: 'npc_princess', name: 'Dame Elara', enter: 'house', place: 'Maison', // SUD-OUEST du cercle
        lines: ['On dit qu\'avec assez d\'aventuriers, ce village deviendra une vraie cité. Tu y participes !'],
      },
    ]
    this.villageFootprints = [] // emprises des maisons du village -> herbe foncée (plaza) garantie dessous
    this.buildingEntrances = [] // portes des bâtiments enterables (préparé pour les intérieurs, étape C)
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
      v.nx = hx + (b.flip ? b.w - 1 - b.door[0] : b.door[0]) // PNJ devant la porte (colonne miroir si bâtiment retourné)
      v.ny = hy + b.h // une rangée sous la base de la maison réellement posée
      v.tx = hx; v.ty = hy // origine réellement posée (pour les panneaux/halo d'entrée)
      if (v.merchant) this.merchantHome = { nx: v.nx, ny: v.ny } // porte de la maison du marchand
      if (v.enter) {
        // CARRÉ INVISIBLE de porte (overlap du joueur -> on entre). Corps statique = invisible en jeu, dessiné en debug.
        // Posé PILE au seuil = juste sous le BAS DU COLLIDER du bâtiment (= là où le joueur s'arrête), colonne de la porte.
        // (Le collider de la taverne est remonté de 16 px -> on remonte aussi son carré d'autant.) Seulement taverne/apothicaire.
        let zone = null
        if (v.enter === 'tavern' || v.enter === 'apothecary' || v.enter === 'inn' || v.enter === 'forge' || v.enter === 'merchant' || v.enter === 'house' || v.enter === 'bank') {
          // carré VERT d'entrée = CONTOUR de l'ouverture de la PORTE, calé sur le BAS DU COLLIDER (= base VISIBLE
          // du bâtiment ; tient compte de la rangée vide remontée pour la taverne). Couvre la tuile de la porte +
          // 4 px sous le collider pour que le joueur collé à la porte le touche -> il entre.
          // Corps DYNAMIQUE immobile => dessiné en VERT en debug (distinct du bleu des bâtiments), invisible en jeu.
          const lift = v.key === 'tavern' ? 16 : 0
          const colBottom = (hy + b.h) * TILE - lift
          const doorOff = v.enter === 'merchant' ? 15 : 0 // bâtiment marchand RETOURNÉ : la porte visible est décalée -> +15px à droite pour aligner la hitbox
          zone = this.add.rectangle(v.nx * TILE + 8 + doorOff, colBottom - 9, 16, 26) // couvre la porte EN HAUT et descend jusqu'au seuil EN BAS -> le joueur collé au bâtiment le touche => il entre
          this.physics.add.existing(zone)
          zone.body.setAllowGravity(false); zone.body.moves = false; zone.body.immovable = true
        }
        this.buildingEntrances.push({ id: v.enter, x: v.nx * TILE + 8, y: v.ny * TILE + 8, zone, npcName: v.name, npcTex: v.tex, lines: v.lines }) // npc* = override du résident (maison Aldwin/Elara)
      }
    }
    this.paintVillageGround() // place + chemins reliant les maisons (look "village")
    // (anciens "hameaux inhabités" du désert retirés : le désert se remplit d'arbres morts via scatterDesertProps)
    // (bannières de marché / drapeau / fleurs retirés — déco définitive à venir avec les assets)
    this.drawBuildingSigns() // panneaux-noms + halo de porte sur les bâtiments enterables
    this.spawnVillageCampfire() // grand feu de camp animé au cœur du village
  }

  /** Feu de camp animé au centre du village (bûches + flamme animée + halo chaud + collision). */
  spawnVillageCampfire() {
    const x = this.cx * TILE + 8
    const y = this.cy * TILE + 8
    const depth = (this.cy + 1) * TILE // tri Y : le héros passe devant quand il est au sud
    // halo chaud (additif) qui respire
    const glow = this.add.circle(x, y + 2, 30, 0xff8a2a, 0.14).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.cy * TILE - 1)
    this.tweens.add({ targets: glow, scale: 1.12, alpha: 0.22, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    // bûches/pierres (base) + flamme animée par-dessus (plus petite)
    this.add.image(x, y + 4, 'campfire').setOrigin(0.5, 0.85).setDepth(depth)
    this.add.sprite(x, y - 1, 'fire_anim').setOrigin(0.5, 0.8).setScale(0.85).setDepth(depth + 1).play('fire-anim')
    // COLLISION SOLIDE + RECUL FORT : au contact du feu, le héros est violemment repoussé vers l'extérieur.
    const col = this.add.rectangle(x, y + 4, 15, 11)
    this.physics.add.existing(col, true)
    this.obstacles.add(col)
    this.physics.add.collider(this.player, col, () => {
      const dx = this.player.x - x; const dy = this.player.y - (y + 4); const d = Math.hypot(dx, dy) || 1
      this.player.knockback((dx / d) * 150, (dy / d) * 150, 260) // recul (modéré)
    })
    this.occupied.add(this.key(this.cx, this.cy))
  }

  /** Nom du LIEU (Forge, Marché, Taverne…) au-dessus de chaque bâtiment de service + halo de porte (enterables). */
  drawBuildingSigns() {
    this.buildingQuestMarks = [] // marqueurs ! / ? au-dessus des bâtiments dont le PNJ d'intérieur donne des quêtes (auberge = Mira)
    for (const v of this.villagers) {
      // (ancien « halo rond clignotant » sur la porte RETIRÉ : pris pour un obstacle, et inutile depuis l'entrée automatique)
      if (!v.place) continue
      // nom du lieu : texte lisible (crème + gros contour sombre), au-dessus du toit, sans panneau
      const b = BUILDINGS[v.key]
      const sx = (v.tx + b.w / 2) * TILE
      const sy = v.ty * TILE - 3
      this.add.text(sx, sy, v.place, { fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#ffb22e', stroke: '#241608', strokeThickness: 4 })
        .setOrigin(0.5, 1).setDepth(9500).setResolution(3)
      // si on PEUT entrer et que le PNJ d'intérieur est un donneur de quêtes -> on prépare un marqueur au-dessus du nom
      if (v.enter) {
        const giver = this.interiorConfig(v.enter).npcName
        if (giver && Object.values(QUESTS).some((q) => q.giver === giver)) this.buildingQuestMarks.push({ x: sx, y: sy - 12, giver, text: null })
      }
    }
  }

  /** Marqueur ! / ? flottant au-dessus d'un bâtiment enterable quand son PNJ d'intérieur a une quête à donner/rendre
   *  (auberge = Mira) -> guide le joueur à entrer (les quêtes se donnent à la réception). */
  updateBuildingQuestMarks() {
    for (const m of this.buildingQuestMarks || []) {
      const mark = this.questMark(m.giver)
      if (!mark) { m.text?.setVisible(false); continue }
      if (!m.text) m.text = this.add.text(m.x, m.y, '', { fontFamily: 'Georgia, serif', fontSize: '16px', fontStyle: 'bold', stroke: '#1a1206', strokeThickness: 5 }).setOrigin(0.5, 1).setResolution(3).setDepth(9600)
      m.text.setText(mark).setColor(mark === '?' ? '#6dfca0' : '#ffd21a').setVisible(true).setY(m.y + Math.sin(this.time.now / 360) * 1.5)
    }
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
    // grande esplanade centrale (herbe foncée) : ellipse autour du spawn/marchand (agrandie pour le hub)
    const plaza = new Set()
    for (let dx = -12; dx <= 12; dx++) {
      for (let dy = -10; dy <= 10; dy++) {
        if ((dx * dx) / 144 + (dy * dy) / 100 <= 1) plaza.add(this.key(cx + dx, cy + dy))
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
    // place (herbe foncée) SOUS, puis CHEMINS EN PLANCHES par-dessus.
    this.paintBlob(plaza, BLOB.darkGrass, true, this.groundLayer)
    const road = new Set()
    const placed = new Set() // anti-chevauchement (une planche par case)
    const houseCells = new Set() // le chemin s'arrête au bord des maisons (ne déborde pas dessous)
    for (const rc of this.villageFootprints || []) for (let dx = 0; dx < rc.w; dx++) for (let dy = 0; dy < rc.h; dy++) houseCells.add(this.key(rc.tx + dx, rc.ty + dy))
    const mark = (x, y) => { if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) road.add(this.key(x, y)) }
    // pose UNE planche "barreau" centrée sur (x,y), couvrant 3 cases perpendiculaires (2 au contact d'une maison).
    const rung = (x, y, horizontal) => {
      const key = this.key(x, y)
      if (placed.has(key)) return
      placed.add(key)
      if (horizontal) { // chemin E-O : planche verticale étirée sur les rangées y-1..y+1
        const up = houseCells.has(this.key(x, y - 1)); const dn = houseCells.has(this.key(x, y + 1))
        const py = up && !dn ? y + 0.5 : dn && !up ? y - 0.5 : y; const h = up !== dn ? 2 : 3
        this.add.image(x * TILE + 8, py * TILE + 8, 'plankpath', 14).setScale(1, h).setDepth(-1)
        mark(x, y - 1); mark(x, y); mark(x, y + 1)
      } else { // chemin N-S : planche horizontale étirée sur les colonnes x-1..x+1
        const lf = houseCells.has(this.key(x - 1, y)); const rt = houseCells.has(this.key(x + 1, y))
        const px = lf && !rt ? x + 0.5 : rt && !lf ? x - 0.5 : x; const w = lf !== rt ? 2 : 3
        this.add.image(px * TILE + 8, y * TILE + 8, 'plankpath', 4).setScale(w, 1).setDepth(-1)
        mark(x - 1, y); mark(x, y); mark(x + 1, y)
      }
    }
    // CHEMIN EN ROND : un ANNEAU de planches autour de la place centrale (+ soleil au centre). Les anciens RACCORDS
    // RADIAUX porte->anneau ont été RETIRÉS : leurs zigzags 8-connectés se croisaient (effet « spaghetti »).
    const RING_R = 6 // rayon de l'anneau (tuiles)
    for (let i = 0; i < 72; i++) { // parcourt le cercle ; orientation de la planche = tangente (haut/bas = horizontale, côtés = verticale)
      const a = (i / 72) * Math.PI * 2
      const x = Math.round(cx + RING_R * Math.cos(a))
      const y = Math.round(cy + RING_R * Math.sin(a))
      rung(x, y, Math.abs(Math.sin(a)) >= Math.abs(Math.cos(a)))
    }
    // MÉDAILLON central = l'étoile/soleil à 8 branches (4 tuiles centrales 5/6/9/10 de Paths.png), agrandie.
    const cxp = cx * TILE + 8
    const cyp = cy * TILE + 8
    const N = 2 // agrandissement du soleil central (réduit)
    for (const t of [{ f: 5, ox: -1, oy: -1 }, { f: 6, ox: 1, oy: -1 }, { f: 9, ox: -1, oy: 1 }, { f: 10, ox: 1, oy: 1 }]) {
      this.add.image(cxp + t.ox * 8 * N, cyp + t.oy * 8 * N, 'plankpath', t.f).setScale(N).setDepth(-1)
    }
    // la déco (fleurs/herbes) évite la place et les chemins du village
    this.plazaCells = plaza
    for (const k of road) this.pathCells.add(k)
    // RE-MARQUE la place du village : l'ancien sol foncé est masqué par l'herbe Sprout -> on assombrit
    // un peu la teinte de l'herbe sur la place (légère variation) pour retrouver le repère du village.
    for (const k of plaza) {
      const [x, y] = k.split(',').map(Number)
      const t = this.grassLayer?.getTileAt(x, y)
      if (t) t.tint = tileNoise(x, y, 63) < 0.5 ? 0xc8d4a2 : 0xbecb96 // teinte du bourg ÉCLAIRCIE (était 0xb0bd86/0xa6b47c)
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
    // devant la porte de la maison du HAUT (merchantHome, calculé dans spawnVillage) ; repli au centre
    const h = this.merchantHome
    const mx = (h ? h.nx + 1 : this.cx + 3) * TILE + 8 + 16 // À CÔTÉ de la porte, décalé à DROITE (la porte sert d'entrée vers l'intérieur marchand)
    const my = (h ? h.ny : this.cy) * TILE + 8
    this.merchant = this.add.sprite(mx, my, 'npc_merchant', 0).setDepth(my)
    this.physics.add.existing(this.merchant, true)
    this.merchant.body.setSize(12, 12).setOffset(2, 4)
    this.physics.add.collider(this.player, this.merchant)

    // (nom du marchand CACHÉ — on affiche le nom du LIEU au-dessus du bâtiment à la place, cf. drawBuildingSigns)
    this.addBreathing(this.merchant, 1300) // idle vivant

    // indice "Parler (E)" affiché quand le héros est proche (au-dessus du nom)
    this.merchantHint = this.add
      .text(mx, my - 24, 'Parler (E)', {
        fontFamily: FONT,
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
    if (this.gameOver) return
    if (this.inInterior) { if (!this.uiBusy()) this.interiorInteract(); return } // dans un bâtiment : parler/sortir
    if (this.uiBusy()) return
    const p = this.player
    // (entrée des bâtiments = AUTOMATIQUE au contact de la porte, cf. update — plus d'invite ici)
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

    // étiquette de nom au-dessus — CACHÉE pour l'instant (on affiche les noms de LIEUX sur les bâtiments)
    const label = this.add
      .text(x, y - 14, name, { fontFamily: FONT, fontSize: '7px', color: role === 'forge' ? '#ff9d3c' : '#ffe066', stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(60000)
      .setResolution(3)
      .setVisible(false)

    // indice d'interaction (caché ; visible quand le héros est proche)
    const hintTxt = role === 'forge' ? 'Forger (E)' : 'Parler (E)'
    const hint = this.add
      .text(x, y - 23, hintTxt, { fontFamily: FONT, fontSize: '8px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } })
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
    if (this.handleQuestInteraction(t)) return // offre/rendu de quête -> court-circuite l'interaction normale
    if (t === this.merchant) ui.openShop()
    else if (t.role === 'forge') ui.openForge()
    else ui.openDialogue(t.name, t.lines, t.texture)
  }

  // ===================== INTÉRIEURS (taverne / apothicaire) =====================
  // On entre par la porte (E près d'une `buildingEntrance` enterable) -> fondu -> SALLE construite HORS-MAP
  // (aucune collision/biome/mob là-bas ; le joueur n'est plus clampé à la map le temps de la visite). PNJ au
  // comptoir = service (1re tranche : dialogue ; potions/boissons-buffs à venir). On ressort par la porte du bas (E).

  interiorConfig(id) {
    if (id === 'tavern') return { title: 'Taverne du Dernier Repos', npcTex: 'npc_noble', npcName: 'Brewen', shop: 'tavern', floor: 0x6e4d2e, plank: 0x533a20, wall: 0x8a3a2c, wallTop: 0x5e241a, accent: 0xffb24a, lines: ['« Assieds-toi, l’ami ! Chopes et ragoûts qui requinquent, c’est par ici. »'] }
    if (id === 'inn') return { title: 'Auberge du Voyageur', npcTex: 'npc_woman', npcName: 'Mira', floor: 0x6e4d2e, plank: 0x533a20, wall: 0x8a6a3c, wallTop: 0x5e3a1a, accent: 0xffc46a, lines: ['« Bienvenue, voyageur ! Une tâche pour toi ? Et le dortoir est par la porte de droite pour te reposer. »'] }
    if (id === 'dorm') return { title: 'Dortoir', npcTex: null, npcName: null, floor: 0x6e4d2e, plank: 0x533a20, wall: 0x8a6a3c, wallTop: 0x5e3a1a, accent: 0xffc46a, lines: [] }
    if (id === 'forge') return { title: 'Forge d’Aldric', npcTex: 'npc_villager', npcName: 'Aldric', forge: true, floor: 0x6e4d2e, plank: 0x533a20, wall: 0x4a4a4a, wallTop: 0x2e2e2e, accent: 0xff8a3a, lines: ['« Apporte tes armes : je répare et j’améliore. »'] }
    if (id === 'merchant') return { title: 'Comptoir du marchand', npcTex: 'npc_merchant', npcName: 'Tobias', shopGeneral: true, floor: 0x6e4d2e, plank: 0x533a20, wall: 0xc89860, wallTop: 0x8a6a3c, accent: 0xffc46a, lines: ['« Tout s’achète, tout se vend ! Que te faut-il ? »'] }
    if (id === 'house') return { title: 'Maison', npcTex: 'npc_master', npcName: 'Résident', floor: 0x6e4d2e, plank: 0x533a20, wall: 0xb98a55, wallTop: 0x7a5a30, accent: 0xffba70, lines: ['Un foyer chaleureux du bourg.'] }
    if (id === 'bank') return { title: 'Banque d’Iroas', npcTex: 'npc_inspector', npcName: 'Cornélius', floor: 0x5c5238, plank: 0x453d2b, wall: 0x6a6a82, wallTop: 0x45455a, accent: 0xffe08a, lines: ['« La banque d’Iroas garde tes biens en sûreté. »', '« Le coffre ouvrira bientôt. Patience, l’or appelle l’or. »'] }
    return { title: 'Échoppe d’Ylva', npcTex: 'npc_shaman', npcName: 'Ylva', shop: 'apothecary', floor: 0x5c5238, plank: 0x453d2b, wall: 0x2f6a3a, wallTop: 0x214c29, accent: 0x8ef0a0, lines: ['« Mes potions soignent, restaurent la mana et bravent le froid comme la chaleur. »'] }
  }

  /** Entre dans l'intérieur d'un bâtiment depuis le VILLAGE (fondu + téléport hors-map). Déclenché AU contact de la porte. */
  enterInterior(id, ent = null) {
    if (this.inInterior || this.uiBusy() || this.gameOver) return
    this._interiorNpcOverride = (id === 'house' && ent && ent.npcName) ? { id, npcName: ent.npcName, npcTex: ent.npcTex, lines: ent.lines } : null // MAISON : résident variable (Aldwin / Elara)
    this._villageReturn = { x: this.player.x, y: this.player.y }
    this._savedZoom = this.cameras.main.zoom // pour restaurer le zoom du village à la sortie
    this.goInterior(id, {})
  }

  /** Fondu vers un intérieur — depuis le village OU depuis un autre intérieur (porte intérieure auberge->dortoir).
   *  opts.spawn = clé du point d'arrivée dans _interior (sinon entry) ; opts.exitTo = id de l'intérieur où la SORTIE ramène (sinon village). */
  goInterior(id, opts = {}) {
    if (this._exiting || this._transitioning) return // garde : empêche la re-bascule à chaque frame (sinon boucle de fondu = "porte qui bug")
    this._transitioning = true
    this.inInterior = id
    const cam = this.cameras.main
    Audio.sfx('ui_accept', { detune: -100 })
    cam.fadeOut(200, 6, 5, 10)
    cam.once('camerafadeoutcomplete', () => {
      if (this._interior) this.destroyInterior()
      this.buildInterior(id)
      this._interior.exitTo = opts.exitTo || null
      this._doorBusy = false; this._transitioning = false // verrous relâchés après bascule
      const p = this.player
      p.setCollideWorldBounds(false) // hors-map -> ne plus clamper à la map (les murs de la salle confinent)
      const spot = (opts.spawn && this._interior[opts.spawn]) || this._interior.entry
      p.setPosition(spot.x, spot.y).setVelocity(0, 0)
      p.moveTarget = null
      p.setDepth(7015)
      this.fitInteriorCamera() // caméra FIXE + zoomée sur la pièce (ne suit plus le joueur, moins de noir)
      this.fogGroup?.setVisible(false) // masque le monde extérieur
      this.nightOverlay?.setVisible(false)
      this.raylight?.setVisible(false)
      this.snowEmitter?.stop()
      this.rainEmitter?.stop()
      cam.fadeIn(220, 6, 5, 10)
    })
  }

  /** Caméra d'intérieur : FIXE (ne suit plus le joueur) + zoomée pour montrer toute la pièce (réduit le noir hors-map). */
  fitInteriorCamera() {
    if (!this._interior) return
    const b = this._interior.bounds
    const cam = this.cameras.main
    cam.stopFollow()
    cam.useBounds = false
    // zoom NORMAL du village pour les petites pièces ; mais si la pièce dépasse l'écran (dortoir), dézoome juste assez pour la faire tenir EN ENTIER (perso toujours visible, pas de défilement)
    const baseZoom = this._savedZoom || 3
    const fit = Math.min(this.scale.width / b.w, this.scale.height / b.h)
    cam.setZoom(Math.min(baseZoom, fit))
    cam.centerOn(b.x + b.w / 2, b.y + b.h / 2) // centrée sur la pièce -> FIXE
  }

  /** Génère (une fois) un disque radial doux -> lumière chaude d'ambiance des intérieurs (blend ADD). */
  ensureInteriorGlow() {
    if (this.textures.exists('int_glow')) return
    const S = 128
    const t = this.textures.createCanvas('int_glow', S, S)
    const cx = t.getContext()
    const grd = cx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
    cx.fillStyle = grd; cx.fillRect(0, 0, S, S); t.refresh()
  }

  /** Construit la salle d'intérieur HORS-MAP : FOND SOMBRE plein écran (plus de gris) + sol bois Mystic +
   *  murs pierre (tuile pleine) + porte + comptoir + PNJ + mobilier + LUMIÈRE chaude. */
  buildInterior(id) {
    const cfg = this.interiorConfig(id)
    // OVERRIDE de PNJ : pour la MAISON, le résident (nom/tex/dialogue) vient du villageois dont on a passé la porte (Aldwin vs Elara…).
    const ov = this._interiorNpcOverride
    if (ov && ov.id === id) { if (ov.npcName) cfg.npcName = ov.npcName; if (ov.npcTex) cfg.npcTex = ov.npcTex; if (ov.lines) cfg.lines = ov.lines; if (ov.title) cfg.title = ov.title }
    const ox = -3200
    const oy = -3200
    const cols = id === 'tavern' ? 17 : id === 'inn' ? 14 : id === 'dorm' ? 17 : id === 'forge' ? 14 : id === 'merchant' ? 14 : id === 'house' ? 13 : id === 'bank' ? 13 : 15
    const rows = id === 'tavern' ? 13 : id === 'inn' ? 10 : id === 'dorm' ? 18 : id === 'forge' ? 11 : id === 'merchant' ? 11 : id === 'house' ? 11 : id === 'bank' ? 11 : 12
    const W = cols * TILE
    const H = rows * TILE
    const D = 7000
    const objs = []
    const colliders = []
    const interiorBeds = [] // dortoir : zones de repos (corps des lits) -> soin complet + sauvegarde
    const interiorSeats = [] // taverne : places assises (sous les tables) -> s'asseoir appelle le barman
    const g0 = Math.floor(cols / 2) - 1
    const g1 = Math.floor(cols / 2) // trou de porte = 2 tuiles -> passage LARGE et confortable (le joueur ne reste plus coincé)
    const doorCx = ox + (g0 + 1) * TILE // centre du trou de porte (2 tuiles : g0 et g1)
    this.ensureInteriorGlow()
    // FOND SOMBRE plein écran (couvre le « gris » hors-map) — scrollFactor 0
    objs.push(this.add.rectangle(0, 0, this.scale.width + 80, this.scale.height + 80, 0x0a0810, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(D - 100))
    // SOL en bois (planches Penzilla, tuile répétée) — taverne = planches + bois plus FONCÉ
    const floorFrame = id === 'apothecary' ? 28 : 92, floorTint = id === 'apothecary' ? 0x8f8270 : id === 'forge' ? 0x5a5048 : id === 'bank' ? 0x6e6880 : 0xb5895a // apothicaire froid / forge cendre / banque pierre bleue / autres bois chaud
    objs.push(this.add.tileSprite(ox + W / 2, oy + H / 2, W, H, 'penz_floors', floorFrame).setTint(floorTint).setDepth(D))
    // MURS pierre (tuile PLEINE 33/34 alternée — l'analyse pixel a montré que les rangées 4-5 sont 100% pleines) :
    // mur du fond sur 2 rangées + côtés + bas avec un trou de porte au centre
    const wallTint = id === 'apothecary' ? 0x9a8aa8 : id === 'forge' ? 0x4a4a4a : id === 'bank' ? 0x6a6a82 : 0xc89860 // apothicaire violacé / forge pierre grise / banque pierre bleue
    const woodWall = id === 'inn' || id === 'dorm' || id === 'tavern' || id === 'merchant' || id === 'house' // murs BOIS (les autres = pierre mw_walls)
    const woodTint = id === 'tavern' ? 0x402a16 : id === 'merchant' ? 0x6e4a28 : id === 'house' ? 0x6b4c28 : 0x5a3520 // taverne foncé / marchand chaud / maison bois clair
    const wt = (cx, cy) => { const im = this.add.image(ox + cx * TILE + 8, oy + cy * TILE + 8, woodWall ? 'penz_floors' : 'mw_walls', woodWall ? 92 : ((cx + cy) % 2 ? 33 : 34)).setTint(woodWall ? woodTint : wallTint).setDepth(D + 6); if (woodWall) im.setAngle(90); objs.push(im) }
    for (let c = 0; c < cols; c++) { wt(c, 0); wt(c, 1) }
    for (let r = 2; r < rows; r++) { wt(0, r); wt(cols - 1, r) }
    for (let c = 1; c < cols - 1; c++) { if (c !== g0 && c !== g1) wt(c, rows - 1) }
    // OMBRE de profondeur : le sol s'assombrit contre les murs (rendu « intérieur épais »)
    const sg = this.add.graphics().setDepth(D + 1); const SD = 13, ix = ox + TILE, iy = oy + 2 * TILE, iw = W - 2 * TILE, ih = H - 3 * TILE
    sg.fillGradientStyle(0, 0, 0, 0, 0.5, 0.5, 0, 0); sg.fillRect(ix, iy, iw, SD)                 // haut
    sg.fillGradientStyle(0, 0, 0, 0, 0, 0, 0.5, 0.5); sg.fillRect(ix, iy + ih - SD, iw, SD)        // bas
    sg.fillGradientStyle(0, 0, 0, 0, 0.5, 0, 0.5, 0); sg.fillRect(ix, iy, SD, ih)                  // gauche
    sg.fillGradientStyle(0, 0, 0, 0, 0, 0.5, 0, 0.5); sg.fillRect(ix + iw - SD, iy, SD, ih)        // droite
    objs.push(sg)
    // LUMIÈRE chaude TAMISÉE d'ambiance (additif), cosy — pour les 2 pièces
    objs.push(this.add.image(ox + W / 2, oy + H / 2, 'int_glow').setDisplaySize(W * 1.2, H * 1.25).setTint(id === 'apothecary' ? 0x9a70d0 : 0xffba70).setAlpha(id === 'apothecary' ? 0.28 : 0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 2)) // ambiance : chaude (taverne/auberge) / violette renforcée (apothicaire)
    // PORTE de sortie (Sprout ANIMÉE, fermée par défaut) au bas — hauteur d'origine, ÉLARGIE (2 tuiles)
    const exitDoorSpr = this.add.sprite(doorCx, oy + (rows - 1) * TILE + 8, 'spr_door', 1).setScale(2, 1).setDepth(D + 5); objs.push(exitDoorSpr)
    // === MOBILIER Penzilla (vraies tuiles 16x16) — pp() pose une pièce multi-tuiles (origine haut-gauche) ===
    const pp = (sc, sr, w, h, dx, dy, depth, flip) => { for (let tr = 0; tr < h; tr++) for (let tc = 0; tc < w; tc++) objs.push(this.add.image(dx + tc * TILE, dy + tr * TILE, 'penz_furn', (sr + tr) * 13 + (sc + tc)).setOrigin(0, 0).setFlipX(!!flip).setDepth(depth + tr)) }
    const furnSolids = [] // colliders de meubles (px) créés plus bas, une fois le helper wall() défini
    const solid = (dx, dy, wpx, hpx) => furnSolids.push([dx, dy, wpx, hpx])
    const si = (frame, dx, dy, depth, scale, tint) => { const im = this.add.image(dx, dy, 'penz_items', frame).setDepth(depth); if (scale) im.setScale(scale); if (tint != null) im.setTint(tint); objs.push(im) } // objet posé (échelle + teinte optionnelles : fioles colorées de l'apothicaire)
    // helper portes/fenêtres (penz_doors = 18 colonnes) + clients assis
    const pd = (sc, sr, w, h, dx, dy, depth) => { for (let tr = 0; tr < h; tr++) for (let tc = 0; tc < w; tc++) objs.push(this.add.image(dx + tc * TILE, dy + tr * TILE, 'penz_doors', (sr + tr) * 18 + (sc + tc)).setOrigin(0, 0).setDepth(depth + tr)) }
    // (aucun client assis — choix utilisateur : pièces calmes, seul le PNJ de service)
    // FENÊTRES sur le mur du fond — TAVERNE seulement (l'apothicaire a un MUR DE FIOLES plein)
    if (id === 'tavern') { pd(6, 3, 2, 2, ox + 2 * TILE, oy, D + 7); pd(6, 3, 2, 2, ox + (cols - 4) * TILE, oy, D + 7) }
    let npc // PNJ de service, placé derrière le comptoir de CHAQUE pièce
    if (id === 'tavern') {
      // === TAVERNE : BAR PLEINE LARGEUR au fond (mur de bouteilles + barman + comptoir-ligne infranchissable) + tables à chaises tournées vers la table ===
      const cxm = cols / 2
      // table OVALE + 3 chaises qui REGARDENT la table (haut=face, gauche=profil MIROIR, droite=profil)
      const oval = (tx, ty, items) => {
        pp(8, 0, 1, 2, ox + (tx + 0.5) * TILE, oy + (ty - 1.7) * TILE, D + 9)         // HAUT : chaise FACE (regarde la table), décollée (place pour s'asseoir)
        pp(9, 0, 1, 2, ox + (tx - 1.05) * TILE, oy + (ty + 0.15) * TILE, D + 12)        // GAUCHE : profil (sens inversé)
        pp(5, 2, 2, 2, ox + tx * TILE, oy + ty * TILE, D + 10)                          // TABLE ovale
        ;(items || []).forEach((it, i) => si(it, ox + (tx + 1 + (i - (items.length - 1) / 2) * 0.6) * TILE, oy + (ty + 0.55) * TILE, D + 14))
        pp(9, 0, 1, 2, ox + (tx + 2.05) * TILE, oy + (ty + 0.15) * TILE, D + 12, true)  // DROITE : profil MIROIR (sens inversé)
        solid(ox + (tx + 0.3) * TILE, oy + (ty + 0.5) * TILE, 1.4 * TILE, 1.0 * TILE) // hitbox de table RÉDUITE
        // (AUCUNE hitbox sur les chaises : les 3 chaises de chaque table sont des PLACES ASSISES où le client peut se poser)
      }
      // tapis sous les 2 tables (recentrés + descendus de 10 px avec les tables)
      pp(10, 2, 3, 2, ox + 3.0 * TILE, oy + 8.625 * TILE, D + 2); pp(10, 2, 3, 2, ox + 10.0 * TILE, oy + 8.625 * TILE, D + 2)
      // MUR DE BOUTEILLES (3 étagères sombres collées au mur du fond)
      ;[3, 7, 11].forEach((c) => {
        pp(6, 4, 3, 3, ox + c * TILE, oy + 1.6 * TILE - 20, D + 8) // armoires remontées de 20 px
        solid(ox + c * TILE, oy + 1.6 * TILE - 20, 3 * TILE, 3 * TILE) // hitbox PROPRE à cette armoire
        si(6, ox + (c + 0.5) * TILE, oy + 2.05 * TILE - 20, D + 10); si(57, ox + (c + 1.1) * TILE, oy + 2.05 * TILE - 20, D + 10); si(49, ox + (c + 1.7) * TILE, oy + 2.05 * TILE - 20, D + 10)
        si(58, ox + (c + 0.6) * TILE, oy + 3.05 * TILE - 20, D + 10); si(56, ox + (c + 1.5) * TILE, oy + 3.05 * TILE - 20, D + 10)
      })
      // BARMAN (Brewen) dans la bande derrière le comptoir (remonté de 4 px)
      npc = this.add.sprite(ox + cxm * TILE, oy + 4.8 * TILE - 4, cfg.npcTex, 0).setDepth(D + 11)
      // COMPTOIR PLEINE LARGEUR (ligne) — 2 rangs ; INFRANCHISSABLE pour le JOUEUR. On laisse une OUVERTURE (porte du
      // barman) à la colonne 14 : visuellement le comptoir s'y interrompt -> le barman la franchit (il se déplace en
      // lerp, donc traverse le collider plein), mais le joueur reste bloqué partout (corps 10px > ouverture).
      const bL = 1, bR = cols - 1
      const barDoorCol = bR - 2 // = 14 : porte du barman, à droite du comptoir
      for (const row of [5.0, 5.4]) {
        pp(8, 14, 1, 1, ox + bL * TILE, oy + row * TILE, D + 13)
        for (let c = bL + 1; c < bR - 1; c++) { if (c === barDoorCol) continue; pp(9, 14, 1, 1, ox + c * TILE, oy + row * TILE, D + 13) }
        pp(11, 14, 1, 1, ox + (bR - 1) * TILE, oy + row * TILE, D + 13)
      }
      // PORTE DU BARMAN : MÊME porte Sprout animée que l'entrée (spr_door), ALIGNÉE sur la bande du comptoir (rangs 5.0 & 5.4)
      this._barmanDoorSpr = this.add.sprite(ox + (barDoorCol + 0.5) * TILE, oy + 5.7 * TILE - 2.5, 'spr_door', 1).setScale(1, 1.0875).setDepth(D + 14) // -5px par le bas au total (haut inchangé)
      objs.push(this._barmanDoorSpr)
      objs.push(this.add.image(ox + (barDoorCol + 0.5) * TILE, oy + 5.7 * TILE, 'int_glow').setScale(0.9).setTint(0xffcf8a).setAlpha(0.18).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 9))
      for (let c = 2; c < bR - 1; c += 2) si([54, 42, 49, 61, 54, 42][((c / 2) | 0) % 6], ox + (c + 0.5) * TILE, oy + 5.05 * TILE, D + 16) // chopes/plats sur le bar
      // TABOURETS du bar : on peut S'Y ASSEOIR (E) -> plus de hitbox (sinon on ne pourrait pas s'y poser)
      for (let i = 0; i < 6; i++) {
        const sxc = 2.5 + i * 2
        pp(12, 1, 1, 1, ox + sxc * TILE, oy + 6.6 * TILE, D + 12)
        interiorSeats.push({
          cx: ox + (sxc + 0.5) * TILE, cy: oy + 6.85 * TILE - 2, hw: 0.5 * TILE, hh: 0.6 * TILE, face: 'up', // assise PILE sur le tabouret (-2px vers le haut), face au comptoir
          bx: ox + (sxc + 0.5) * TILE, by: oy + 7.6 * TILE, bface: 'up', // le barman remonte de l'allée et s'arrête COLLÉ devant (sous) le client
        })
      }
      // LANTERNES + lueurs chaudes — AUCUN feu (+ petite hitbox sur le pied de chaque lampe)
      pp(6, 7, 1, 3, ox + 1 * TILE, oy + 7.0 * TILE, D + 10); pp(6, 7, 1, 3, ox + (cols - 2) * TILE, oy + 7.0 * TILE, D + 10)
      solid(ox + 1.3 * TILE, oy + 8.4 * TILE - 5, 0.5 * TILE, 1.2 * TILE + 5); solid(ox + (cols - 1.7) * TILE, oy + 8.4 * TILE - 5, 0.5 * TILE, 1.2 * TILE + 5)
      objs.push(this.add.image(ox + 1.5 * TILE, oy + 7.4 * TILE, 'int_glow').setScale(1.5).setTint(0xffcf8a).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 9))
      objs.push(this.add.image(ox + (cols - 1.5) * TILE, oy + 7.4 * TILE, 'int_glow').setScale(1.5).setTint(0xffcf8a).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 9))
      objs.push(this.add.image(ox + cxm * TILE, oy + 2.6 * TILE, 'int_glow').setScale(2.2).setTint(0xffce7a).setAlpha(0.18).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 9))
      // 2 GRANDES TABLES OVALES (3 chaises bois tournées vers la table, aérées) — rentrées vers le centre (tour de table possible)
      oval(3.5, 9.125, [54, 26])
      oval(10.5, 9.125, [49, 61])
      // PLACES ASSISES aux tables : on s'assoit PILE sur CHACUNE des 3 chaises (haut / gauche / droite), face à la table.
      // Le barman vient se poster à côté, dans une colonne DÉGAGÉE (pas à travers la table).
      for (const tx of [3.5, 10.5]) {
        const ty = 9.125
        // chaque chaise = place du barman JUSTE À CÔTÉ du client (collé), dans une colonne dégagée (pas à travers la table)
        interiorSeats.push({ cx: ox + (tx + 1.0) * TILE, cy: oy + (ty - 0.7) * TILE, hw: 0.5 * TILE, hh: 0.6 * TILE, face: 'down', bx: ox + tx * TILE, by: oy + (ty - 0.7) * TILE, bface: 'right' }) // chaise HAUT (barman à gauche)
        interiorSeats.push({ cx: ox + (tx - 0.55) * TILE, cy: oy + (ty + 1.05) * TILE, hw: 0.5 * TILE, hh: 0.7 * TILE, face: 'right', bx: ox + (tx - 1.6) * TILE, by: oy + (ty + 1.05) * TILE, bface: 'right' }) // chaise GAUCHE (barman à gauche)
        interiorSeats.push({ cx: ox + (tx + 2.55) * TILE, cy: oy + (ty + 1.15) * TILE, hw: 0.5 * TILE, hh: 0.7 * TILE, face: 'left', bx: ox + (tx + 3.6) * TILE, by: oy + (ty + 1.15) * TILE, bface: 'left' }) // chaise DROITE (barman à droite)
      }
      // COLLISION : comptoir EN DEUX TRONÇONS avec un TROU de 8px (la porte du barman, col 14.25-14.75). Le joueur
      // (corps 10px) ne peut pas franchir ce trou ; le barman, déplacé en lerp, le traverse. -> "porte que seul lui franchit".
      solid(ox + bL * TILE, oy + 5.0 * TILE, (14.25 - bL) * TILE, 1.4 * TILE - 6)         // tronçon GAUCHE (jusqu'à la porte) — +2px vers le bas
      solid(ox + 14.75 * TILE, oy + 5.0 * TILE, (bR - 14.75) * TILE, 1.4 * TILE - 6)       // tronçon DROIT (après la porte) — +2px vers le bas
    } else if (id === 'inn') {
      // === AUBERGE-RÉCEPTION FERMÉE : comptoir en L qui ENFERME Mira (inaccessible, on lui parle par-dessus) + PORTE Sprout animée EN HAUT À DROITE ===
      const cxm = cols / 2
      const glow = (gx, gy, rpx, color, alpha) => objs.push(this.add.image(ox + gx * TILE, oy + gy * TILE, 'int_glow').setDisplaySize(rpx * 2, rpx * 2).setTint(color).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 50))
      pp(10, 2, 3, 2, ox + 3.0 * TILE, oy + 7.4 * TILE, D + 2)         // tapis d'accueil (devant le banc, côté joueur)
      // ÉTAGÈRES garnies au fond (derrière Mira), cols 1-7 ; haut-droite libre pour la porte du dortoir
      ;[1, 4].forEach((c) => { pp(6, 4, 3, 3, ox + c * TILE, oy + 0.4 * TILE, D + 8); solid(ox + c * TILE, oy + 0.4 * TILE, 3 * TILE, 3 * TILE); si(57, ox + (c + 0.5) * TILE, oy + 0.85 * TILE, D + 10); si(49, ox + (c + 1.3) * TILE, oy + 0.85 * TILE, D + 10); si(24, ox + (c + 0.6) * TILE, oy + 1.85 * TILE, D + 10); si(58, ox + (c + 1.6) * TILE, oy + 1.85 * TILE, D + 10) })
      // COMPTOIR EN L : banc horizontal (cols 1-9, 2 rangs) + RETOUR vertical (col 9) -> alcôve de Mira scellée
      const bL = 1, bR = 9
      for (const row of [5.0, 5.4]) {
        pp(8, 14, 1, 1, ox + bL * TILE, oy + row * TILE, D + 13)
        for (let c = bL + 1; c < bR; c++) pp(9, 14, 1, 1, ox + c * TILE, oy + row * TILE, D + 13)
        pp(11, 14, 1, 1, ox + bR * TILE, oy + row * TILE, D + 13) // embout droit = coin du L
      }
      for (let r = 2; r <= 5; r++) objs.push(this.add.image(ox + 9 * TILE + 8, oy + r * TILE + 8, 'penz_furn', 14 * 13 + 9).setAngle(90).setDepth(D + 13)) // retour vertical (banc tourné 90°)
      si(24, ox + 2 * TILE, oy + 5.0 * TILE, D + 16); si(26, ox + 3.5 * TILE, oy + 4.95 * TILE, D + 16); si(54, ox + 6 * TILE, oy + 5.0 * TILE, D + 16); si(63, ox + 8 * TILE, oy + 5.0 * TILE, D + 16)
      solid(ox + bL * TILE, oy + 5.0 * TILE, 9 * TILE, 1.0 * TILE)     // banc horizontal infranchissable (cols 1-9)
      solid(ox + 9 * TILE, oy + 2 * TILE, 1 * TILE, 3 * TILE)          // retour vertical (col 9, rows 2-5) -> ferme l'alcôve à droite
      pp(8, 3, 2, 1, ox + 3.5 * TILE, oy + 4.2 * TILE, D + 2)          // petit tapis sous Mira
      npc = this.add.sprite(ox + 4.5 * TILE, oy + 4.0 * TILE, cfg.npcTex, 0).setDepth(D + 11) // Mira ENFERMÉE dans l'alcôve
      // PORTE du DORTOIR : Sprout ANIMÉE (fermée par défaut) EN HAUT À DROITE
      this._dormDoorSpr = this.add.sprite(ox + 11.5 * TILE, oy + 0.6 * TILE + 15, 'spr_door', 1).setScale(2, 1).setDepth(D + 7); objs.push(this._dormDoorSpr) // élargie (2 tuiles), abaissée de 15px
      objs.push(this.add.text(ox + 11.5 * TILE, oy + 2.7 * TILE, 'Dortoir', { fontFamily: FONT, fontSize: '8px', color: '#ffe1a8', stroke: '#3a2410', strokeThickness: 3 }).setOrigin(0.5).setDepth(D + 60).setResolution(3)) // panneau « Dortoir »
      glow(11.5, 2.4, 60, 0xffd9a0, 0.24)                            // halo porte du dortoir
      // DÉCO du passage / accueil
      pp(6, 7, 1, 3, ox + 12 * TILE, oy + 6.4 * TILE, D + 10); solid(ox + 12.3 * TILE, oy + 7.8 * TILE, 0.5 * TILE, 1.2 * TILE) // lampadaire (passage droit)
      si(15, ox + 1.5 * TILE, oy + (rows - 1.5) * TILE, D + 12, 1.4)   // plante (coin bas-gauche)
      si(15, ox + 12.5 * TILE, oy + 3.4 * TILE, D + 12, 1.3)           // plante (passage)
      glow(cxm, 6, 200, 0xffba70, 0.12); glow(2, 2, 90, 0xffce7a, 0.16)
    } else if (id === 'dorm') {
      // === GRAND DORTOIR : 20 lits (5x4) pour se reposer, allées praticables, porte de sortie -> réception ===
      const cxm = cols / 2
      const bed = (key, gx, gy) => {
        objs.push(this.add.image(ox + gx * TILE, oy + gy * TILE, key).setOrigin(0, 0).setDepth(D + 9))
        solid(ox + (gx + 0.2) * TILE, oy + (gy + 0.6) * TILE, 1.6 * TILE, 0.8 * TILE) // CHEVET (tête de lit) solide -> bloque le passage vers la rangée du fond
        // ZONE DE REPOS = corps du lit : en montant depuis l'allée, on s'y « allonge » (PV + mana au max + sauvegarde)
        interiorBeds.push({ cx: ox + (gx + 1.0) * TILE, cy: oy + (gy + 1.95) * TILE, hw: 0.8 * TILE, hh: 0.65 * TILE })
      }
      const colsX = [1.5, 4.5, 7.5, 10.5, 13.5], rowsY = [2.0, 6.0, 10.0, 14.0]
      const COL = ['nin_bed_tan', 'nin_bed_red', 'nin_bed_blue', 'nin_bed_green']
      rowsY.forEach((gy, r) => colsX.forEach((gx, c) => {
        if (r === 3 && c === 2) return // pas de lit pile au-dessus de la porte de sortie (passage dégagé)
        bed(COL[(r * 5 + c) % 4], gx, gy)
        if (gy + 3 < rows - 1) pp(8, 3, 2, 1, ox + gx * TILE, oy + (gy + 3) * TILE, D + 2) // descente de lit
      }))
      // lanternes aux 4 coins
      pp(6, 7, 1, 3, ox + 1 * TILE, oy + 2.2 * TILE, D + 10); pp(6, 7, 1, 3, ox + (cols - 2) * TILE, oy + 2.2 * TILE, D + 10)
      pp(6, 7, 1, 3, ox + 1 * TILE, oy + (rows - 4) * TILE, D + 10); pp(6, 7, 1, 3, ox + (cols - 2) * TILE, oy + (rows - 4) * TILE, D + 10)
      objs.push(this.add.image(ox + W / 2, oy + H / 2, 'int_glow').setDisplaySize(W, H).setTint(0xffba70).setAlpha(0.1).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 50))
    } else if (id === 'forge') {
      // === FORGE d'Aldric : fournaise rougeoyante + établi (comptoir) + étagère d'outils ===
      const cxm = cols / 2, bL = 1, bR = cols - 1
      const aglow = (x, y, s, t, a) => objs.push(this.add.image(ox + x * TILE, oy + y * TILE, 'int_glow').setScale(s).setTint(t).setAlpha(a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 11))
      pp(9, 7, 1, 3, ox + 1.3 * TILE, oy + 0.6 * TILE, D + 10); solid(ox + 1.35 * TILE, oy + 1.0 * TILE, 0.9 * TILE, 2.2 * TILE) // fournaise (poêle) — rougeoyante par le halo
      aglow(1.8, 2.0, 2.4, 0xff5533, 0.42); aglow(1.8, 3.0, 1.8, 0xffaa44, 0.24); si(37, ox + 3.0 * TILE, oy + 2.6 * TILE, D + 12) // chaudron de trempe
      pp(4, 14, 2, 1, ox + (cols - 3.3) * TILE, oy + 0.4 * TILE, D + 9) // outils suspendus au mur
      pp(0, 0, 2, 2, ox + (cols - 3.3) * TILE, oy + 1.0 * TILE, D + 8); solid(ox + (cols - 3.3) * TILE, oy + 1.0 * TILE, 2 * TILE, 2 * TILE) // commode à outils
      si(62, ox + (cols - 2.8) * TILE, oy + 1.4 * TILE, D + 12); si(26, ox + (cols - 1.9) * TILE, oy + 1.4 * TILE, D + 12)
      npc = this.add.sprite(ox + cxm * TILE, oy + 4.8 * TILE - 4, cfg.npcTex, 0).setDepth(D + 11) // Aldric derrière l'établi
      for (const row of [5.6, 6.0]) { pp(8, 14, 1, 1, ox + bL * TILE, oy + row * TILE, D + 13); for (let c = bL + 1; c < bR - 1; c++) pp(9, 14, 1, 1, ox + c * TILE, oy + row * TILE, D + 13); pp(11, 14, 1, 1, ox + (bR - 1) * TILE, oy + row * TILE, D + 13) }
      si(37, ox + (cxm - 1.5) * TILE, oy + 5.6 * TILE, D + 16); si(62, ox + (cxm + 0.4) * TILE, oy + 5.6 * TILE, D + 16); si(26, ox + (cxm + 2.0) * TILE, oy + 5.5 * TILE, D + 16) // chaudron/caisse/bougie sur l'établi
      solid(ox + bL * TILE, oy + 5.6 * TILE, (bR - bL) * TILE, 1.4 * TILE - 6)
      si(62, ox + 1.5 * TILE, oy + (rows - 1.5) * TILE, D + 12, 1.3); si(62, ox + (cols - 1.5) * TILE, oy + (rows - 1.5) * TILE, D + 12, 1.2) // caisses de charbon (coins)
      aglow(cxm, 7.0, 2.4, 0xffaa44, 0.16); aglow(cols - 2.6, 2.2, 1.6, 0xffcf8a, 0.18)
    } else if (id === 'merchant') {
      // === MARCHAND : mur d'étagères de marchandises + grand comptoir + Tobias ===
      const cxm = cols / 2, bL = 1, bR = cols - 1
      const aglow = (x, y, s, t, a) => objs.push(this.add.image(ox + x * TILE, oy + y * TILE, 'int_glow').setScale(s).setTint(t).setAlpha(a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 11))
      ;[1.5, 5.5, 9.5].forEach((c, i) => {
        pp(6, 4, 3, 3, ox + c * TILE, oy + 1.4 * TILE - 18, D + 8); solid(ox + c * TILE, oy + 1.4 * TILE - 18, 3 * TILE, 3 * TILE)
        si([6, 56, 54][i], ox + (c + 0.5) * TILE, oy + 1.9 * TILE - 18, D + 10, 0.9, [0xff7050, null, 0xffb050][i]); si([40, 57, 42][i], ox + (c + 1.4) * TILE, oy + 1.9 * TILE - 18, D + 10, 0.9, [0x8050d0, null, null][i]); si([49, 58, 61][i], ox + (c + 2.3) * TILE, oy + 1.9 * TILE - 18, D + 10, 0.88)
      })
      npc = this.add.sprite(ox + cxm * TILE, oy + 4.8 * TILE - 4, cfg.npcTex, 0).setDepth(D + 11)
      for (const row of [5.6, 6.0]) { pp(8, 14, 1, 1, ox + bL * TILE, oy + row * TILE, D + 13); for (let c = bL + 1; c < bR - 1; c++) pp(9, 14, 1, 1, ox + c * TILE, oy + row * TILE, D + 13); pp(11, 14, 1, 1, ox + (bR - 1) * TILE, oy + row * TILE, D + 13) }
      si(24, ox + (cxm - 2.5) * TILE, oy + 5.65 * TILE, D + 16); si(26, ox + (cxm - 1.6) * TILE, oy + 5.55 * TILE, D + 16); si(54, ox + (cxm + 0.4) * TILE, oy + 5.6 * TILE, D + 16); si(6, ox + (cxm + 1.5) * TILE, oy + 5.6 * TILE, D + 16, 0.9, 0xff7050); si(49, ox + (cxm + 2.6) * TILE, oy + 5.6 * TILE, D + 16)
      solid(ox + bL * TILE, oy + 5.6 * TILE, (bR - bL) * TILE, 1.4 * TILE - 6)
      pp(6, 7, 1, 3, ox + 1 * TILE, oy + 7.0 * TILE, D + 10); pp(6, 7, 1, 3, ox + (cols - 2) * TILE, oy + 7.0 * TILE, D + 10)
      solid(ox + 1.3 * TILE, oy + 8.4 * TILE, 0.5 * TILE, 1.2 * TILE); solid(ox + (cols - 1.7) * TILE, oy + 8.4 * TILE, 0.5 * TILE, 1.2 * TILE)
      si(15, ox + 2.5 * TILE, oy + (rows - 1.5) * TILE, D + 12, 1.3); si(14, ox + (cols - 2.5) * TILE, oy + (rows - 1.5) * TILE, D + 12, 1.2)
      aglow(cxm, 7.2, 2.4, 0xffcf8a, 0.18); aglow(2, 2.4, 1.6, 0xffd9a0, 0.16); aglow(cols - 2, 2.4, 1.6, 0xffd9a0, 0.16)
    } else if (id === 'house') {
      // === MAISON : foyer + lit + table à manger + étagère (cosy) — le résident est près de la table ===
      const cxm = cols / 2
      const glow = (gx, gy, rpx, color, alpha) => objs.push(this.add.image(ox + gx * TILE, oy + gy * TILE, 'int_glow').setDisplaySize(rpx * 2, rpx * 2).setTint(color).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 50))
      pp(9, 7, 1, 3, ox + 1.0 * TILE, oy + 0.8 * TILE, D + 10); solid(ox + 1.05 * TILE, oy + 1.2 * TILE, 0.9 * TILE, 2.2 * TILE); glow(1.5, 2.2, 80, 0xffb060, 0.28); si(37, ox + 2.2 * TILE, oy + 2.6 * TILE, D + 12) // foyer (poêle) + chaudron
      objs.push(this.add.image(ox + (cols - 3.5) * TILE, oy + 0.8 * TILE, 'nin_bed_red').setOrigin(0, 0).setDepth(D + 9)); solid(ox + (cols - 3.3) * TILE, oy + 1.4 * TILE, 1.6 * TILE, 2.0 * TILE) // vrai lit Ninja
      pp(10, 2, 3, 2, ox + (cxm - 1.5) * TILE, oy + 5.6 * TILE, D + 2) // tapis sous la table
      pp(5, 2, 2, 2, ox + (cxm - 1) * TILE, oy + 6.0 * TILE, D + 10); solid(ox + (cxm - 0.7) * TILE, oy + 6.4 * TILE, 1.4 * TILE, 1.0 * TILE) // table
      pp(5, 0, 1, 2, ox + (cxm - 0.5) * TILE, oy + 4.4 * TILE, D + 9); pp(7, 0, 1, 2, ox + (cxm - 0.5) * TILE, oy + 7.5 * TILE, D + 11) // chaise HAUT (vue de FACE) + chaise BAS (vue de DOS, devant la table)
      si(61, ox + cxm * TILE, oy + 6.5 * TILE, D + 13, 0.9) // pain sur la table
      npc = this.add.sprite(ox + (cxm + 2.2) * TILE, oy + 6.3 * TILE, cfg.npcTex, 0).setDepth(D + 11) // résident à côté de la table
      pp(3, 2, 2, 2, ox + (cols - 3) * TILE, oy + 6.2 * TILE, D + 10); solid(ox + (cols - 3) * TILE, oy + 6.6 * TILE, 1.4 * TILE, 1.2 * TILE) // étagère
      si(58, ox + (cols - 2.5) * TILE, oy + 6.4 * TILE, D + 12, 0.9); si(57, ox + (cols - 1.6) * TILE, oy + 6.4 * TILE, D + 12, 0.9)
      si(15, ox + 1.5 * TILE, oy + (rows - 1.5) * TILE, D + 12, 1.3)
      glow(cxm, 6.5, 150, 0xffba70, 0.14); glow(cols - 2.4, 6.4, 70, 0xffce7a, 0.12)
    } else if (id === 'bank') {
      // === BANQUE : coffre-fort + comptoir de guichet + Cornélius + or ===
      const cxm = cols / 2, bL = 2, bR = cols - 1
      const glow = (gx, gy, rpx, color, alpha) => objs.push(this.add.image(ox + gx * TILE, oy + gy * TILE, 'int_glow').setDisplaySize(rpx * 2, rpx * 2).setTint(color).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(D + 50))
      pp(2, 12, 2, 3, ox + 1.0 * TILE, oy + 0.6 * TILE, D + 8); solid(ox + 1.0 * TILE, oy + 1.0 * TILE, 2 * TILE, 2.6 * TILE); glow(2.0, 1.8, 90, 0x6a9aff, 0.16) // coffre-fort (frigo métal)
      pp(3, 2, 2, 2, ox + (cols - 3.5) * TILE, oy + 1.6 * TILE, D + 10); solid(ox + (cols - 3.5) * TILE, oy + 1.6 * TILE, 2 * TILE, 2 * TILE) // étagère à trésor
      si(29, ox + (cols - 3.0) * TILE, oy + 2.0 * TILE, D + 12, 0.9, 0xffd700); si(29, ox + (cols - 2.0) * TILE, oy + 2.0 * TILE, D + 12, 0.9, 0xffed4e); si(57, ox + (cols - 2.5) * TILE, oy + 2.8 * TILE, D + 12, 0.9, 0xffd700) // urnes/bocal dorés
      npc = this.add.sprite(ox + cxm * TILE, oy + 4.8 * TILE - 4, cfg.npcTex, 0).setDepth(D + 11) // Cornélius derrière le guichet
      for (const row of [5.6, 6.0]) { pp(8, 14, 1, 1, ox + bL * TILE, oy + row * TILE, D + 13); for (let c = bL + 1; c < bR - 1; c++) pp(9, 14, 1, 1, ox + c * TILE, oy + row * TILE, D + 13); pp(11, 14, 1, 1, ox + (bR - 1) * TILE, oy + row * TILE, D + 13) }
      si(24, ox + (bL + 0.6) * TILE, oy + 5.65 * TILE, D + 16); si(26, ox + (bL + 1.4) * TILE, oy + 5.55 * TILE, D + 16); si(29, ox + (cxm + 1.0) * TILE, oy + 5.6 * TILE, D + 16, 0.9, 0xffd700)
      solid(ox + bL * TILE, oy + 5.6 * TILE, (bR - bL) * TILE, 1.4 * TILE - 6)
      pp(6, 7, 1, 3, ox + 1 * TILE, oy + 7.0 * TILE, D + 10); pp(6, 7, 1, 3, ox + (cols - 2) * TILE, oy + 7.0 * TILE, D + 10)
      solid(ox + 1.3 * TILE, oy + 8.4 * TILE, 0.5 * TILE, 1.2 * TILE); solid(ox + (cols - 1.7) * TILE, oy + 8.4 * TILE, 0.5 * TILE, 1.2 * TILE)
      si(15, ox + 2.5 * TILE, oy + (rows - 1.5) * TILE, D + 12, 1.3); si(14, ox + (cols - 2.5) * TILE, oy + (rows - 1.5) * TILE, D + 12, 1.2)
      glow(cxm, 7.2, 120, 0xffd700, 0.18); glow(cols - 2.5, 2.2, 70, 0xffd700, 0.12)
    } else {
      // === APOTHICAIRE : modèle TAVERNE — Ylva CENTRÉE derrière un GRAND comptoir + mur de fioles JOINTIF + chaudron en COIN ===
      const cxm = cols / 2
      const WARMFLASK = [0xff7050, 0xffb050]                                   // fioles chaudes (flask orange -> rouge/ambre)
      const RICH = [0x8050d0, 0x40c0d0, 0x60d070, 0x5a6ae0, 0xc050c0]          // verre clair teinté = vrai violet/teal/vert/bleu
      // tapis central (habille le milieu à la place du chaudron ; marchable)
      pp(10, 2, 3, 2, ox + (cxm - 1.5) * TILE, oy + 7.9 * TILE, D + 1)
      // MUR DE FIOLES : 4 étagères EXACTEMENT jointives (espacées de 3 = AUCUN overlap, plus de meuble cassé)
      const shelfCols = [1.5, 4.5, 7.5, 10.5]
      shelfCols.forEach((c) => { pp(6, 4, 3, 3, ox + c * TILE, oy + 1.6 * TILE - 20, D + 8); solid(ox + c * TILE, oy + 1.6 * TILE - 20, 3 * TILE, 3 * TILE) }) // armoire + hitbox PROPRE
      shelfCols.forEach((c, sidx) => [2.25, 3.2].forEach((ry, ri) => {
        const k = sidx * 2 + ri
        si(6, ox + (c + 0.5) * TILE, oy + ry * TILE - 20, D + 10, 0.9, WARMFLASK[k % WARMFLASK.length])
        si(40, ox + (c + 1.4) * TILE, oy + ry * TILE - 20, D + 10, 0.88, RICH[k % RICH.length])
        si([56, 57, 58, 59][(sidx + ri) % 4], ox + (c + 2.35) * TILE, oy + ry * TILE - 20, D + 10, 0.88)
      }))
      // YLVA centrée derrière le comptoir (comme le barman)
      npc = this.add.sprite(ox + cxm * TILE, oy + 5.1 * TILE, cfg.npcTex, 0).setDepth(D + 11)
      // GRAND COMPTOIR PLEINE LARGEUR (2 rangs) — infranchissable
      const bL = 1, bR = cols - 1
      for (const row of [5.6, 6.0]) {
        pp(8, 14, 1, 1, ox + bL * TILE, oy + row * TILE, D + 13)
        for (let c = bL + 1; c < bR - 1; c++) pp(9, 14, 1, 1, ox + c * TILE, oy + row * TILE, D + 13)
        pp(11, 14, 1, 1, ox + (bR - 1) * TILE, oy + row * TILE, D + 13)
      }
      // clutter d'alchimie SUR le comptoir (registre, bougie, fioles, urne)
      si(24, ox + (cxm - 2.6) * TILE, oy + 5.65 * TILE, D + 16); si(26, ox + (cxm - 1.8) * TILE, oy + 5.55 * TILE, D + 16)
      si(6, ox + (cxm + 0.4) * TILE, oy + 5.6 * TILE, D + 16, 0.9, 0xff7050); si(40, ox + (cxm + 1.1) * TILE, oy + 5.6 * TILE, D + 16, 0.9, 0x8050d0); si(40, ox + (cxm + 1.8) * TILE, oy + 5.6 * TILE, D + 16, 0.9, 0x40c0d0)
      si(29, ox + (cxm + 2.7) * TILE, oy + 5.6 * TILE, D + 16, 0.95)
      si(56, ox + (cxm + 3.5) * TILE, oy + 5.6 * TILE, D + 16, 0.9); si(6, ox + (cxm + 4.3) * TILE, oy + 5.6 * TILE, D + 16, 0.9, 0x60d070)
      solid(ox + bL * TILE, oy + 5.6 * TILE, (bR - bL) * TILE, 1.4 * TILE - 6) // comptoir infranchissable (bas réduit de 6 px)
      // COIN PRÉPARATION (bas-gauche) : tapis + cabinet + MOINS d'objets (mortier + 1 fiole)
      pp(8, 3, 2, 1, ox + 1.7 * TILE, oy + 9.55 * TILE, D + 6)          // tapis sous le cabinet
      pp(0, 0, 2, 2, ox + 1.7 * TILE, oy + 7.9 * TILE, D + 12)          // commode = cabinet à ingrédients
      si(29, ox + 2.4 * TILE, oy + 7.95 * TILE, D + 14, 0.9)            // mortier (urne)
      si(6, ox + 3.2 * TILE, oy + 7.95 * TILE, D + 14, 0.85, 0x8050d0)  // fiole violette
      solid(ox + 2.0 * TILE, oy + 8.2 * TILE, 1.4 * TILE, 1.4 * TILE) // cabinet : hitbox réduite
      // COIN HERBORISTE (bas-droite) : tapis + étagère basse
      pp(8, 3, 2, 1, ox + (cols - 3.4) * TILE, oy + 9.8 * TILE, D + 6)  // tapis sous l'étagère
      pp(3, 2, 2, 2, ox + (cols - 3.4) * TILE, oy + 8.1 * TILE, D + 10)
      si(58, ox + (cols - 2.9) * TILE, oy + 8.35 * TILE, D + 12, 0.9); si(56, ox + (cols - 2.0) * TILE, oy + 8.35 * TILE, D + 12, 0.9)
      si(6, ox + (cols - 2.9) * TILE, oy + 9.25 * TILE, D + 12, 0.9, 0x60d070); si(40, ox + (cols - 2.0) * TILE, oy + 9.25 * TILE, D + 12, 0.9, 0x8050d0)
      solid(ox + (cols - 3.1) * TILE, oy + 8.4 * TILE, 1.4 * TILE, 1.4 * TILE) // étagère herboriste : hitbox réduite
      // HERBES en pot (coins bas)
      si(15, ox + 1.5 * TILE, oy + 10.1 * TILE, D + 12, 1.4); si(14, ox + (cols - 1.5) * TILE, oy + 10.1 * TILE, D + 12, 1.3)
      // LUMIÈRES violet alchimiste (ADD)
      const aglow = (x, y, s, t, a, dep) => objs.push(this.add.image(ox + x * TILE, oy + y * TILE, 'int_glow').setScale(s).setTint(t).setAlpha(a).setBlendMode(Phaser.BlendModes.ADD).setDepth(dep == null ? D + 11 : dep))
      aglow(cxm, 8.7, 2.8, 0xb070ff, 0.16)                 // lueur violette au sol du centre
      aglow(2.6, 8.0, 1.6, 0xb070ff, 0.30)                 // halo violet sur le cabinet (gauche)
      aglow(cols - 2.6, 8.6, 1.6, 0xb070ff, 0.28)          // halo violet sur l'étagère herboriste (droite)
      aglow(2.5, 6.1, 1.4, 0xcfa8ff, 0.30); aglow(cols - 2.5, 6.1, 1.4, 0xcfa8ff, 0.30) // lueurs aux bouts du comptoir
      aglow(cxm, 2.6, 2.6, 0xb070ff, 0.22) // halo sur le mur de fioles
    }
    if (npc) { if (this.anims.exists(`${cfg.npcTex}-idle-down`)) npc.anims.play(`${cfg.npcTex}-idle-down`, true); objs.push(npc) } // dortoir = pas de PNJ
    // tapis devant la porte de sortie (vraie tuile Penzilla, plus de rectangle dessiné)
    pp(8, 3, 2, 1, doorCx - TILE, oy + (rows - 1.6) * TILE, D + 1)
    // titre
    // TITRE de la salle : affiché dans l'UIScene (HUD, zoom 1) -> net et bien dimensionné, pas déformé par le zoom de la caméra de jeu
    this.scene.get('UIScene')?.showInteriorTitle?.(cfg.title) // (plus de toast d'entrée — le titre + l'indice d'assise suffisent)
    // COLLIDERS invisibles (murs + comptoir)
    const wall = (x, y, w, h) => {
      const rr = this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false)
      this.physics.add.existing(rr, true)
      colliders.push(this.physics.add.collider(this.player, rr))
      objs.push(rr)
    }
    wall(ox, oy, W, TILE)
    wall(ox, oy + TILE, TILE, H - TILE * 2)
    wall(ox + W - TILE, oy + TILE, TILE, H - TILE * 2)
    wall(ox, oy + H - TILE, g0 * TILE, TILE)
    wall(ox + (g1 + 1) * TILE, oy + H - TILE, W - (g1 + 1) * TILE, TILE)
    for (const s of furnSolids) wall(s[0], s[1], s[2], s[3]) // collisions des meubles (comptoir, tables, étagères, cheminée…)
    // HITBOX DE SIÈGE (taverne) : un collider par chaise/tabouret, ACTIVÉ quand le siège est LIBRE (on bute dessus comme
    // un meuble) et DÉSACTIVÉ quand quelqu'un est assis dessus (cf. updateSeatHint qui pilote `solidBody.enable`).
    for (const seat of interiorSeats) {
      const r = this.add.rectangle(seat.cx, seat.cy, 12, 12).setVisible(false)
      this.physics.add.existing(r, true)
      colliders.push(this.physics.add.collider(this.player, r))
      objs.push(r)
      seat.solidBody = r.body
    }
    // indice « Parler (E) » au-dessus du PNJ (la SORTIE est automatique en marchant sur la porte -> pas d'indice « Sortir »)
    const hint = npc ? this.add.text(npc.x, npc.y - 15, 'Parler (E)', { fontFamily: FONT, fontSize: '8px', color: '#fff', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } }).setOrigin(0.5, 1).setDepth(D + 60).setVisible(false).setResolution(3) : null
    if (hint) objs.push(hint)
    this._interior = {
      id, cfg, objs, colliders, npc, hint, exitDoorSprite: exitDoorSpr,
      npcHome: npc ? { x: npc.x, y: npc.y } : null, // position de DÉPART du PNJ (stable même s'il se déplace : ex. Ylva qui prépare) -> portée du E
      questGiver: !!cfg.npcName && Object.values(QUESTS).some((q) => q.giver === cfg.npcName), // PNJ d'intérieur donneur de quêtes (Mira) -> marqueur ! / ? + pont
      bounds: { x: ox, y: oy, w: W, h: H }, // pour fixer + zoomer la caméra sur la pièce
      entry: { x: doorCx, y: oy + (rows - 2.2) * TILE },
      exit: { x: doorCx, y: oy + (rows - 1) * TILE + 8 },
    }
    if (interiorBeds.length) { // dortoir : lits où se reposer + point d'apparition à la mort (sur un lit près de la porte)
      this._interior.beds = interiorBeds
      this._interior._restArmed = false // on apparaît peut-être SUR un lit (respawn) -> pas de re-repos immédiat tant qu'on n'a pas bougé
      this._interior.restSpawn = { x: ox + 5.5 * TILE, y: oy + 15.95 * TILE } // lit (col 4.5, rangée 14) : on réapparaît allongé ici
    }
    if (interiorSeats.length) { // taverne : places (tabourets + tables) où s'asseoir (E) pour appeler le barman
      this._interior.seats = interiorSeats
      this._interior.barDoor = { x: ox + 14.5 * TILE, behindY: oy + 4.5 * TILE, frontY: oy + 8.0 * TILE } // porte du barman (col 14) ; frontY = ALLÉE DÉGAGÉE (sous les tabourets, au-dessus des tables) où il circule sans rien traverser
      this._interior.barDoorSprite = this._barmanDoorSpr // porte Sprout animée (ouvre/referme quand le barman la franchit)
      this._interior.seatHint = this.add.text(0, 0, 'S\'asseoir (E)', { fontFamily: FONT, fontSize: '8px', color: '#fff', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } }).setOrigin(0.5, 1).setDepth(D + 60).setVisible(false).setResolution(3)
      this._interior.objs.push(this._interior.seatHint)
    }
    if (id === 'inn') { // porte intérieure vers le dortoir (EN HAUT À DROITE) : zone atteignable + porte animée + retour
      this._interior.dormDoor = { x: ox + 11.5 * TILE, y: oy + 2.0 * TILE }    // case sous la porte du fond (sol libre, atteignable)
      this._interior.dormReturn = { x: ox + 11.5 * TILE, y: oy + 3.3 * TILE }  // retour depuis le dortoir : plus bas, sans re-déclencher
      this._interior.dormDoorSprite = this._dormDoorSpr                        // porte Sprout animée (ouvre/referme à la bascule)
    }
    if (id === 'tavern' || id === 'apothecary' || id === 'inn') { // tenancier qui s'affaire ; Ylva ne s'anime que PENDANT une préparation (prepper)
      // hitbox du tenancier (corps dynamique immobile qui le SUIT) -> invisible en jeu, visible en debug
      const bhb = this.add.rectangle(npc.x, npc.y + 3, 11, 9).setVisible(false)
      this.physics.add.existing(bhb); bhb.body.setAllowGravity(false); bhb.body.moves = false; bhb.body.immovable = true
      objs.push(bhb); colliders.push(this.physics.add.collider(this.player, bhb))
      // géométrie propre à chaque salle (centres d'étagères / plage du comptoir / Y de la bande dégagée)
      const geo = id === 'tavern' ? { midY: 4.1, ax: [4.5, 8.5, 12.5], fxmin: 3, fxmax: 13 }
        : id === 'apothecary' ? { midY: 4.6, ax: [3.0, 6.0, 9.0, 12.0], fxmin: 3, fxmax: 12 }
        : { midY: 4.0, ax: [2.5, 5.5], fxmin: 1.5, fxmax: 9 } // auberge-réception (Mira) : étagères (cols 1-7) <-> banc (cols 1-10)
      this._interior.bw = {
        sprite: npc, hitbox: bhb, texture: cfg.npcTex, facing: 'down', pauseUntil: 0, zone: 'comptoir', phase: 'toX', speed: 26, tx: npc.x,
        midY: oy + geo.midY * TILE,
        armoireXs: geo.ax.map((c) => ox + c * TILE),
        frontXmin: ox + geo.fxmin * TILE, frontXmax: ox + geo.fxmax * TILE,
        prepper: id === 'apothecary', // Ylva : ne déambule (prépare) que tant qu'une potion mijote
      }
      this.pickBarmanTarget(this._interior.bw)
    }
  }

  /** Détruit la salle d'intérieur (objets + colliders). */
  destroyInterior() {
    if (!this._interior) return
    this.scene.get('UIScene')?.hideInteriorTitle?.() // retire le titre du HUD
    for (const c of this._interior.colliders) this.physics.world.removeCollider(c)
    for (const o of this._interior.objs) { try { o.destroy() } catch (e) { /* déjà détruit */ } }
    this._interior = null
  }

  /** Ressort de l'intérieur -> retour à l'intérieur précédent (dortoir->réception) si exitTo, sinon au village. */
  exitInterior() {
    if (!this.inInterior || this._exiting) return
    if (this._interior && this._interior.exitTo) { this.goInterior(this._interior.exitTo, { spawn: 'dormReturn' }); return } // dortoir -> réception
    this._exiting = true
    this._promptDismissed = this.inInterior // au retour devant la porte, l'invite « Entrer ? » ne repop pas tde suite
    const cam = this.cameras.main
    Audio.sfx('ui_cancel', { detune: 0 })
    cam.fadeOut(200, 6, 5, 10)
    cam.once('camerafadeoutcomplete', () => {
      this.destroyInterior()
      this.inInterior = null
      this._exiting = false; this._doorBusy = false
      const p = this.player
      p.setCollideWorldBounds(true)
      const r = this._villageReturn || { x: this.cx * TILE, y: this.cy * TILE }
      p.setPosition(r.x, r.y + 18).setVelocity(0, 0) // juste DEVANT la porte (pas dessus -> pas de re-entrée)
      p.moveTarget = null
      p.setDepth(p.y)
      cam.useBounds = true
      cam.setZoom(this._savedZoom || 3); cam.startFollow(this.player, true) // restaure la caméra du village (suivi + zoom)
      cam.centerOn(p.x, p.y)
      this.fogGroup?.setVisible(true)
      this.nightOverlay?.setVisible(true)
      this.raylight?.setVisible(true)
      cam.fadeIn(220, 6, 5, 10)
    })
  }

  /** Boucle d'update quand on est dans un intérieur (monde extérieur gelé). */
  updateInterior(time, delta) {
    const p = this.player
    p.update(time)
    p.setDepth(7030)
    // caméra FIXE en intérieur (réglée par fitInteriorCamera) : on ne recentre plus sur le joueur
    // mobs GELÉS tant qu'on est à l'intérieur : leur IA ne tourne plus mais la physique Arcade, si : sans ça,
    // un mob qui te poursuivait dérive (vitesse résiduelle) jusque dans le village pendant ton absence.
    this.monsters?.getChildren().forEach((m) => { if (m.body) m.body.velocity.set(0, 0) })
    const it = this._interior
    if (!it) return
    if (it.bw) { this.updateBarman(it.bw, time, (delta || 16) / 1000); if (it.hint) it.hint.setPosition(it.npc.x, it.npc.y - 15) } // tenancier qui s'affaire + indice qui le suit
    // PORTE INTÉRIEURE (auberge -> dortoir) : marcher dessus -> la porte s'OUVRE puis se referme, puis on bascule
    if (it.dormDoor && !this._doorBusy && Math.abs(p.x - it.dormDoor.x) < TILE * 0.9 && Math.abs(p.y - it.dormDoor.y) < TILE) {
      this._doorBusy = true
      Audio.sfx('ui_accept', { detune: -120 })
      if (it.dormDoorSprite && this.anims.exists('door-cycle')) it.dormDoorSprite.play('door-cycle') // ouvre puis referme
      this.time.delayedCall(230, () => this.goInterior('dorm', { exitTo: 'inn' })) // bascule quand la porte est ouverte
      return
    }
    // SORTIE en marchant sur la porte du bas : elle s'OUVRE puis se referme, puis on sort
    if (!this._doorBusy && Math.abs(p.x - it.exit.x) < TILE && p.y >= it.exit.y - 10) {
      this._doorBusy = true
      Audio.sfx('ui_cancel')
      if (it.exitDoorSprite && this.anims.exists('door-cycle')) it.exitDoorSprite.play('door-cycle')
      this.time.delayedCall(230, () => this.exitInterior())
      return
    }
    // indice « Parler (E) » près du PNJ — SAUF à la taverne (le barman n'est pas accessible : on s'assoit pour l'appeler) ni au dortoir
    if (it.npc && it.hint && it.id !== 'tavern') { it.hint.setVisible(this.dist(p.x, p.y, it.npc.x, it.npc.y) <= 52) }
    if (it.npc && it.questGiver) { // marqueur ! (quête dispo) / ? (à rendre) au-dessus de Mira à la réception
      it.npc.name = it.cfg.npcName
      this.updateQuestMark(it.npc, it.npc)
      if (it.npc.qmark && !it._qmarkTracked) { it.objs.push(it.npc.qmark); it._qmarkTracked = true } // suivi pour le nettoyage à la sortie
    }
    if (it.beds) this.updateDormRest(it) // dortoir : repos sur un lit -> soin + sauvegarde
    if (it.seats) this.updateSeatHint(it) // taverne : indice « S'asseoir (E) » près d'un siège / « Se lever (E) » une fois assis
    if (it.id === 'apothecary' && it.npc) { // indicateur « prépare… » au-dessus d'Ylva tant qu'une potion mijote
      const on = (this._brewing || 0) > 0
      if (on && !it.brewLabel) {
        it.brewLabel = this.add.text(it.npc.x, it.npc.y - 16, 'prépare…', { fontFamily: FONT, fontSize: '8px', color: '#d8c4ff', stroke: '#241038', strokeThickness: 3 }).setOrigin(0.5, 1).setResolution(3).setDepth(60002)
        it.objs.push(it.brewLabel)
      }
      if (it.brewLabel) it.brewLabel.setVisible(on).setPosition(it.npc.x, it.npc.y - 16 + Math.sin(time / 220) * 1.5)
    }
  }

  /** Siège de taverne le plus proche du héros (tabouret ou table), ou null. */
  nearSeat(it) {
    const p = this.player
    return it.seats?.find((s) => Math.abs(p.x - s.cx) <= s.hw + 6 && Math.abs(p.y - s.cy) <= s.hh + 8) || null
  }

  /** Hitbox des sièges (solides si LIBRES + joueur pas dessus), lever en bougeant, et indice flottant. */
  updateSeatHint(it) {
    const p = this.player
    // hitbox dynamique : un siège est SOLIDE quand il est libre ET que le joueur n'est pas dessus (sinon désactivé : on est assis, ou on vient de se lever et on n'a pas encore dégagé)
    for (const s of it.seats) {
      if (!s.solidBody) continue
      const on = Math.abs(p.x - s.cx) < 0.55 * TILE && Math.abs(p.y - s.cy) < 0.55 * TILE
      s.solidBody.enable = !s.takenBy && !on
    }
    // SE LEVER en appuyant sur une touche de déplacement — armé seulement APRÈS avoir relâché (anti-relevé immédiat)
    if (it._seated) {
      const c = p.cursors, k = p.keys
      const moving = c && k && (c.left.isDown || c.right.isDown || c.up.isDown || c.down.isDown || k.A.isDown || k.D.isDown || k.W.isDown || k.S.isDown || k.Q?.isDown || k.Z?.isDown)
      if (!moving) it._satReady = true
      else if (it._satReady) { this.standUp(it); return }
    }
    const h = it.seatHint
    if (!h) return
    if (it._seated) { h.setText('bouge = te lever').setVisible(true).setPosition(p.x, p.y - 16) } // une seule info essentielle
    else { const s = this.nearSeat(it); h.setVisible(!!s).setText('S\'asseoir (E)'); if (s) h.setPosition(p.x, p.y - 16) }
  }

  /** S'ASSEOIR : recale le héros sur le siège, le FIGE (sitting), et APPELLE le barman (il vient prendre la commande). */
  sitDown(it, seat) {
    const p = this.player
    if (seat.takenBy && seat.takenBy !== 'me') { this.scene.get('UIScene')?.showToast?.('Cette place est déjà prise', '#e0a866'); return } // MULTI : 1 chaise = 1 joueur
    seat.takenBy = 'me' // -> updateSeatHint désactive la hitbox de CE siège (les autres restent solides)
    it._seated = seat
    it._satReady = false // « bouger pour se lever » ne s'arme qu'après avoir RELÂCHÉ les touches (sinon on se relève dès l'assise)
    p.sitting = true
    p.setPosition(seat.cx, seat.cy).setVelocity(0, 0)
    p.moveTarget = null
    p.facing = seat.face || 'up'
    if (this.anims.exists(`${p.heroKey}-idle-${p.facing}`)) p.anims.play(`${p.heroKey}-idle-${p.facing}`, true)
    Audio.sfx('ui_accept', { detune: -60 })
    this.callBarman(it, seat) // appelle le serveur
  }

  /** Appelle le serveur à un siège : « J'arrive » + itinéraire (par sa porte) vers le client. Un seul client à la fois (multi). */
  callBarman(it, seat) {
    const bw = it.bw
    if (!bw) return
    if (bw.servingSeat && bw.servingSeat !== seat) { this.scene.get('UIScene')?.showToast?.('Le serveur est occupé — il arrive dès qu\'il a fini.', '#ffcf86'); return }
    bw.servingSeat = seat
    bw.serving = true; bw.served = false; bw.returning = false
    bw.path = this.barmanPath(it, seat); bw.pathIdx = 0; bw.faceAtTable = seat.bface
    if (bw.bubble) bw.bubble.destroy()
    bw.bubble = this.add.text(bw.sprite.x, bw.sprite.y - 16, 'J\'arrive, un instant !', { fontFamily: FONT, fontSize: '8px', color: '#fff', backgroundColor: '#000000bb', padding: { x: 3, y: 2 } }).setOrigin(0.5, 1).setDepth(7060).setResolution(3)
    it.objs.push(bw.bubble)
  }

  /** Le serveur REPART (carte fermée / payé / client levé) : retour au bar PAR SA PORTE, puis reprend son va-et-vient. */
  barmanReturn(it) {
    const bw = it.bw
    if (!bw || !bw.serving || bw.returning) return
    const seat = bw.servingSeat, d = it.barDoor
    bw.returning = true; bw.served = true // en retour : ne ré-ouvre pas la carte
    if (bw.bubble) { bw.bubble.destroy(); bw.bubble = null }
    bw.path = seat ? [{ x: seat.bx, y: d.frontY }, { x: d.x, y: d.frontY }, { x: d.x, y: d.behindY }] : [{ x: d.x, y: d.frontY }, { x: d.x, y: d.behindY }]
    bw.pathIdx = 0
  }

  /** Appelé par UIScene.closeShop quand on QUITTE la carte de la taverne -> le serveur repart. */
  onTavernShopClosed() {
    const it = this._interior
    if (it && it.id === 'tavern' && it.bw && it.bw.serving) this.barmanReturn(it)
  }

  /** Itinéraire du barman du COMPTOIR jusqu'au client, EN PASSANT PAR SA PORTE (col 14) et en longeant le devant du
   *  bar (corridor au-dessus des tables) -> il ne traverse plus les meubles. Étapes : porte(arrière) -> porte(avant)
   *  -> devant le bar à la colonne du client -> place du client. */
  barmanPath(it, seat) {
    const d = it.barDoor
    return [
      { x: d.x, y: d.behindY },   // 1) longe l'arrière du bar jusqu'à la porte
      { x: d.x, y: d.frontY },    // 2) franchit la porte vers l'avant
      { x: seat.bx, y: d.frontY }, // 3) longe le devant du bar jusqu'à la colonne du client (au-dessus des tables)
      { x: seat.bx, y: seat.by },  // 4) descend/monte jusqu'à la place du client
    ]
  }

  /** SE LEVER : libère le héros (réactive sa collision) et renvoie le barman à son va-et-vient. */
  standUp(it) {
    const p = this.player
    if (it._seated) it._seated.takenBy = null // libère la chaise -> sa hitbox redevient solide quand on s'en éloigne (updateSeatHint)
    it._seated = null
    p.sitting = false
    if (it.bw && it.bw.serving) this.barmanReturn(it) // s'il était en train de servir, il repart par sa porte
    Audio.sfx('ui_cancel', { detune: 0 })
  }

  /** Dortoir : si le héros monte sur le CORPS d'un lit -> repos (PV + mana au max + sauvegarde). Re-armé dès qu'on
   *  a quitté tous les lits (sinon on ne peut pas re-déclencher en restant dessus). */
  updateDormRest(it) {
    const p = this.player
    if (p.hp <= 0) return
    const onBed = it.beds.some((b) => Math.abs(p.x - b.cx) <= b.hw && Math.abs(p.y - b.cy) <= b.hh)
    if (!onBed) { it._restArmed = true; return }      // hors lit -> ré-arme
    if (it._restArmed === false) return               // déjà reposé sur ce lit (il faut le quitter d'abord)
    it._restArmed = false
    this.restInBed()
  }

  /** Repos d'auberge : PV et mana au maximum + sauvegarde de la partie (le dortoir sert de point de repos). */
  restInBed() {
    const p = this.player
    const healed = p.heal(p.maxHp)                    // soigne à fond (affiche le chiffre vert)
    const manaWas = p.mana
    if (p.maxMana > 0) p.mana = p.maxMana
    const firstTime = !p.respawnHome
    p.respawnHome = true                              // l'auberge devient ton POINT DE REPOS -> tu réapparais ICI à la mort
    this.saveGame()                                   // l'auberge fait office de point de sauvegarde
    Audio.sfx('ui_accept', { detune: -150 })
    this.showRestZzz()                                // petit « z Z z » au-dessus du héros
    const ui = this.scene.get('UIScene')
    if (firstTime) ui?.showToast?.('Point de repos enregistré — tu réapparaîtras ici', '#ffd86b')
    else ui?.showToast?.(healed > 0 || p.mana > manaWas ? 'Reposé — partie sauvegardée' : 'Partie sauvegardée', '#7cfc9a')
  }

  /** Petit « z Z z » qui s'élève en ondulant au-dessus du héros (feedback de repos). */
  showRestZzz() {
    const p = this.player
    const t = this.add.text(p.x + 8, p.y - 16, 'z Z z', { fontFamily: FONT, fontSize: '9px', color: '#bfe9ff', stroke: '#10202a', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(20000).setResolution(3)
    this.tweens.add({ targets: t, y: t.y - 18, x: t.x + 6, alpha: 0, duration: 1300, ease: 'Sine.out', onComplete: () => t.destroy() })
  }

  /** Nouvelle COLONNE cible du barman : devant une armoire au hasard, ou un endroit aléatoire du comptoir. */
  pickBarmanTarget(bw) {
    bw.tx = bw.zone === 'armoire'
      ? bw.armoireXs[Math.floor(Math.random() * bw.armoireXs.length)]
      : bw.frontXmin + Math.random() * (bw.frontXmax - bw.frontXmin)
  }

  /** Barman qui « prépare des boissons » : va-et-vient ALÉATOIRE entre une armoire (fond) et un endroit du comptoir
   *  (devant), avec pauses. Déplacement par lerp (sprite sans corps), anims de marche directionnelles. */
  updateBarman(bw, time, dt) {
    const s = bw.sprite
    if (bw.hitbox) { bw.hitbox.body.enable = !bw.serving; bw.hitbox.body.reset(s.x, s.y + 3) } // la hitbox suit le barman ; désactivée en service (ne bouscule pas le client assis)
    // YLVA (apothicaire) : IMMOBILE à son comptoir tant qu'elle n'a rien à préparer ; dès qu'une potion mijote, elle s'anime (va-et-vient « comme avant »)
    if (bw.prepper && (this._brewing || 0) === 0) { s.anims.play(`${bw.texture}-idle-${bw.facing || 'down'}`, true); return }
    // MODE SERVICE (taverne) : le barman a été APPELÉ -> il file directement à la table prendre la commande
    if (bw.serving) { // APPELÉ : suit son itinéraire (porte du bar -> devant -> client), tranquillement, sans traverser les meubles
      const wp = bw.path && bw.path[bw.pathIdx]
      if (bw.bubble) bw.bubble.setPosition(s.x, s.y - 16) // la bulle « J'arrive » le suit
      if (!wp) { // fin de parcours
        if (bw.returning) { bw.serving = false; bw.returning = false; bw.servingSeat = null; bw.phase = 'toX'; bw.zone = 'comptoir'; this.pickBarmanTarget(bw); return } // rentré derrière le bar -> reprend son va-et-vient (libre pour un autre client)
        bw.facing = bw.faceAtTable || 'down' // arrivé au client -> face à lui ; il demande « boisson ou repas ? »
        s.anims.play(`${bw.texture}-idle-${bw.facing}`, true)
        if (bw.bubble) { bw.bubble.destroy(); bw.bubble = null }
        if (!bw.served) { bw.served = true; this.scene.get('UIScene')?.openServerChoice?.() }
        return
      }
      const dx = wp.x - s.x, dy = wp.y - s.y, d = Math.hypot(dx, dy)
      if (d <= 3) { // étape atteinte -> suivante ; la PORTE s'ouvre quand il la franchit (aller ET retour)
        const door = this._interior?.barDoorSprite
        if (door && this._interior?.barDoor && Math.abs(s.x - this._interior.barDoor.x) < 0.6 * TILE && !door.anims?.isPlaying && this.anims.exists('door-cycle')) { door.play('door-cycle'); Audio.sfx('ui_accept', { detune: -150 }) }
        bw.pathIdx++
        return
      }
      const step = 58 * dt // allure tranquille (il prend son temps)
      s.x += (dx / d) * Math.min(step, d); s.y += (dy / d) * Math.min(step, d)
      bw.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')
      s.anims.play(`${bw.texture}-walk-${bw.facing}`, true)
      return
    }
    if (time < bw.pauseUntil) { s.anims.play(`${bw.texture}-idle-${bw.facing}`, true); return }
    const step = bw.speed * dt
    if (bw.phase === 'toX') { // 1) se placer horizontalement (dans la bande dégagée) sous le spot visé
      const dyMid = bw.midY - s.y, dx = bw.tx - s.x
      let moving = false
      if (Math.abs(dyMid) > 1) { s.y += Math.sign(dyMid) * Math.min(Math.abs(dyMid), step); bw.facing = dyMid < 0 ? 'up' : 'down'; moving = true }
      if (Math.abs(dx) >= 2) { s.x += Math.sign(dx) * Math.min(Math.abs(dx), step); bw.facing = dx < 0 ? 'left' : 'right'; moving = true }
      if (!moving) bw.phase = 'toWall'
      s.anims.play(`${bw.texture}-${moving ? 'walk' : 'idle'}-${bw.facing}`, true)
      return
    }
    // 2) 'toWall' : avance vers le meuble (haut=armoire / bas=comptoir) jusqu'à ce que SA HITBOX touche la hitbox du meuble
    const dir = bw.zone === 'armoire' ? -1 : 1
    const ny = s.y + dir * step
    const hb = bw.hitbox.body // la hitbox du barman suit à (s.x, s.y + 3)
    if (this.physics.overlapRect(s.x - hb.width / 2, ny + 3 - hb.height / 2, hb.width, hb.height, false, true).length > 0) { // sa hitbox touche une hitbox solide
      bw.facing = dir < 0 ? 'up' : 'down'
      s.anims.play(`${bw.texture}-idle-${bw.facing}`, true)
      bw.pauseUntil = time + 700 + Math.random() * 2000 // « préparation »
      bw.zone = bw.zone === 'armoire' ? 'comptoir' : 'armoire' // alterne armoire <-> comptoir
      bw.phase = 'toX'
      this.pickBarmanTarget(bw)
      return
    }
    s.y = ny
    bw.facing = dir < 0 ? 'up' : 'down'
    s.anims.play(`${bw.texture}-walk-${bw.facing}`, true)
  }

  /** E dans un intérieur : parle au PNJ si proche, sinon sort si on est sur la porte.
   *  TAVERNE = exception : le barman n'est pas « parlable » -> on s'assoit (auto) pour l'appeler ; E ne fait que
   *  ré-ouvrir le menu si on est déjà servi à table. */
  interiorInteract() {
    const it = this._interior
    if (!it) return
    const p = this.player
    if (it.id === 'tavern') { // E = s'asseoir près d'un siège / RAPPELER le serveur si déjà assis (pour se lever : bouger)
      if (it._seated) {
        if (it.bw && !it.bw.serving) this.callBarman(it, it._seated) // le serveur est reparti -> on le rappelle pour recommander
        else this.scene.get('UIScene')?.showToast?.('Le serveur arrive…', '#ffcf86')
        return
      }
      const seat = this.nearSeat(it)
      if (seat) { this.sitDown(it, seat); return }
      if (this.dist(p.x, p.y, it.exit.x, it.exit.y) <= 24) { this.exitInterior(); return }
      this.scene.get('UIScene')?.showToast?.('Approche-toi d\'un tabouret ou d\'une table, puis E pour t\'asseoir', '#ffcf86')
      return
    }
    // PNJ d'intérieur : on mesure la distance à sa POSITION DE DÉPART (npcHome), stable même s'il se déplace (Ylva qui prépare)
    const nx = it.npcHome?.x ?? it.npc?.x, ny = it.npcHome?.y ?? it.npc?.y
    if (it.npc && this.dist(p.x, p.y, nx, ny) <= 56) {
      // PONT vers les quêtes : un PNJ d'intérieur (Mira à la réception) donne/valide des quêtes comme un villageois.
      const npcW = { name: it.cfg.npcName, texture: it.cfg.npcTex, x: it.npc.x, y: it.npc.y }
      if (this.handleQuestInteraction(npcW)) return
      if (it.cfg.forge) { this.scene.get('UIScene')?.openForge?.(); return } // FORGE : Aldric ouvre la forge (réparation/amélioration/craft)
      if (it.cfg.shopGeneral) { this.scene.get('UIScene')?.openShop?.(); return } // MARCHAND : boutique générale
      if (it.cfg.shop) { this.scene.get('UIScene')?.openShop?.(it.cfg.shop); return } // apothicaire : Ylva ouvre sa carte (commande -> préparation)
      this.scene.get('UIScene')?.openDialogue(it.cfg.npcName, it.cfg.lines, it.cfg.npcTex)
    } else if (this.dist(p.x, p.y, it.exit.x, it.exit.y) <= 24) {
      this.exitInterior()
    }
  }

  /** Apothicaire : Ylva PRÉPARE la potion commandée (déjà payée). Délai selon la RARETÉ (plus rare = plus long),
   *  puis livraison DIRECTE au sac. Le minuteur tourne sur GameScene (la carte est fermée pendant l'attente).
   *  Si le sac est plein à la livraison, Ylva garde la potion et retente plus tard (jamais perdue). */
  prepPotion(item) {
    const ms = { common: 3000, rare: 6000, epic: 10000, legendary: 15000 }[item.rarity] || 4000
    const ui = () => this.scene.get('UIScene')
    ui()?.showToast?.(`Ylva prépare : ${item.name}…`, '#c7a3ff')
    this._brewing = (this._brewing || 0) + 1 // indicateur « prépare… » au-dessus d'Ylva (cf. updateInterior)
    let warned = false
    const deliver = () => {
      const it = cloneItem(item)
      if (this.player.addItem(it)) {
        this._brewing = Math.max(0, (this._brewing || 1) - 1)
        ui()?.showToast?.(`Prête : ${item.name} !`, '#9bf0a8')
        Audio.sfx('sfx_levelup', { vol: 0.4, detune: -300 })
      } else { // sac plein : Ylva la garde, on retente (elle n'est jamais perdue)
        if (!warned) { warned = true; ui()?.showToast?.('Sac plein — Ylva garde ta potion au comptoir', '#e0a866') }
        this.time.delayedCall(2500, deliver)
      }
    }
    this.time.delayedCall(ms, deliver)
  }

  // ---------- quêtes (brief §10) ----------

  /** Quête active (objet QUESTS) ou null. */
  activeQuest() {
    return this.player.quest ? QUESTS[this.player.quest.id] : null
  }

  /** id de la prochaine quête RÉELLEMENT proposable : nextQuestId + DÉLAI de respiration écoulé
   *  (après une remise, on attend un peu — délai croissant avec l'avancement, cf. claimQuest). */
  availableQuestId() {
    const nid = nextQuestId(this.player)
    if (!nid) return null
    if (this.player.questReadyAt && this.time.now < this.player.questReadyAt) return null
    return nid
  }

  /** Marqueur au-dessus d'un PNJ : '?' (quête à rendre), '!' (quête dispo), '' sinon. */
  questMark(npcName) {
    const p = this.player
    const aq = this.activeQuest()
    if (aq && aq.giver === npcName && questComplete(p, aq)) return '?'
    const nid = this.availableQuestId()
    if (nid && QUESTS[nid].giver === npcName) return '!'
    return ''
  }

  /** Côté quêtes : progresse un objectif TALK, ou offre/rend chez le donneur. true = interaction consommée. */
  handleQuestInteraction(t) {
    if (t.noQuest) return false // PNJ de seuil (accueil de l'auberge) : ne donne/valide aucune quête
    const p = this.player
    const aq = this.activeQuest()
    // progression d'une quête PARLER dont la cible est ce PNJ (ne consomme pas l'interaction)
    if (aq && aq.type === 'talk' && aq.target === t.name && (p.quest.progress ?? 0) < 1) {
      p.quest.progress = 1
      this.saveGame()
    }
    // RENDU : donneur de la quête active terminée
    if (aq && aq.giver === t.name && questComplete(p, aq)) {
      this.claimQuest(t)
      return true
    }
    // OFFRE : donneur de la prochaine quête disponible (délai de respiration écoulé)
    const nid = this.availableQuestId()
    if (nid && QUESTS[nid].giver === t.name) {
      this.acceptQuest(nid, t)
      return true
    }
    return false
  }

  acceptQuest(id, npc) {
    const q = QUESTS[id]
    if (!q) return
    this.player.quest = { id, progress: 0 }
    this.saveGame()
    Audio.sfx('ui_accept', { detune: 0 })
    this.scene.get('UIScene')?.openDialogue?.(q.giver + ' — ' + q.title, [q.desc, 'Objectif : ' + this.objectiveText(q) + '\nRécompense : ' + this.rewardText(q)], npc?.texture)
  }

  claimQuest(npc) {
    const p = this.player
    const q = this.activeQuest()
    if (!q || !questComplete(p, q)) return
    if (q.type === 'collect') p.removeResource(q.target, q.count) // on rend les matériaux
    const r = q.reward ?? {}
    if (r.gold) p.gold += r.gold
    let extra = ''
    if (r.item && ITEMS[r.item]) {
      const it = cloneItem(ITEMS[r.item])
      if (!p.addItem(it)) { this.dropItemOnGround(it); extra = ' (sac plein → posé au sol)' }
    }
    if (r.xp) p.gainXp(r.xp) // en dernier (peut déclencher un level up + son)
    p.questsDone.push(q.id)
    p.quest = null
    // DÉLAI de respiration avant la quête suivante (croissant avec l'avancement -> les quêtes de fin
    // forcent à farmer entre deux). Transitoire (non sauvegardé) : un rechargement le réinitialise.
    p.questReadyAt = this.time.now + Math.min(QUEST_GAP_MAX, QUEST_GAP_BASE + p.questsDone.length * QUEST_GAP_STEP)
    this.saveGame()
    Audio.sfx('sfx_levelup', { vol: 0.5, detune: -200 })
    this.scene.get('UIScene')?.openDialogue?.(q.giver + ' — Quête accomplie !', ['« ' + q.title + ' » terminée.', 'Récompense : ' + this.rewardText(q) + extra], npc?.texture)
  }

  objectiveText(q) {
    if (q.type === 'talk') return 'parler à ' + q.target
    if (q.type === 'kill') return 'tuer ' + q.count + ' ' + q.targetName
    if (q.type === 'collect') return 'rapporter ' + q.count + ' ' + q.targetName
    return ''
  }

  rewardText(q) {
    const r = q.reward ?? {}
    const parts = []
    if (r.xp) parts.push(r.xp + ' XP')
    if (r.gold) parts.push(r.gold + ' or')
    if (r.item && ITEMS[r.item]) parts.push(ITEMS[r.item].name)
    return parts.join(', ') || '—'
  }

  /** Progression d'une quête TUER au moment d'un kill. */
  questKill(mon) {
    const p = this.player
    const aq = this.activeQuest()
    if (!aq || aq.type !== 'kill' || mon.def !== MONSTER_TYPES[aq.target]) return
    if ((p.quest.progress ?? 0) >= aq.count) return
    p.quest.progress = (p.quest.progress ?? 0) + 1
    this.saveGame()
    const ui = this.scene.get('UIScene')
    if (p.quest.progress >= aq.count) ui?.showToast?.(`Objectif accompli ! Retourne voir ${aq.giver}`, '#7cfc9a')
    else ui?.showToast?.(`${aq.targetName} ${p.quest.progress}/${aq.count}`, '#cfe2ff')
  }

  /** Met à jour le marqueur de quête '!'/'?' au-dessus d'un PNJ : petit BADGE sombre cerclé (lisible sur
   *  n'importe quel sol) + symbole net, placé juste au-dessus du nom. */
  updateQuestMark(npc, s) {
    if (npc.noQuest) { npc.qmark?.setVisible(false); return } // PNJ de seuil : pas de marqueur (le bâtiment en porte un)
    const mark = this.questMark(npc.name)
    if (!mark) { npc.qmark?.setVisible(false); return }
    const ready = mark === '?'
    if (!npc.qmark) {
      // « ! » / « ? » doré épais + GROS contour sombre -> lisible sur n'importe quel sol (vert, sable, neige)
      npc.qmark = this.add.text(0, 0, '', { fontFamily: 'Georgia, serif', fontSize: '13px', fontStyle: 'bold', stroke: '#1a1206', strokeThickness: 4 }).setOrigin(0.5, 1).setResolution(3).setDepth(60003)
    }
    npc.qmark.setText(mark).setColor(ready ? '#6dfca0' : '#ffd21a').setVisible(true)
    npc.qmark.setPosition(s.x, s.y - 18 + Math.sin(this.time.now / 360) * 1.5)
  }

  /** Oriente les villageois vers le héros à portée + affiche l'indice "(E)" de proximité.
   *  Gère aussi l'interaction AUTO quand on a cliqué un PNJ et qu'on vient d'arriver. */
  updateNpcs(time, delta = 16) {
    const p = this.player
    const dt = delta / 1000
    for (const npc of this.npcs || []) {
      const s = npc.sprite
      const near = this.dist(p.x, p.y, s.x, s.y)
      // PNJ baladeur : erre EN CONTINU (plus de figeage quand le joueur approche -> on les voit bouger).
      if (npc._w) {
        this.wanderEntity(npc._w, time, dt)
        npc.x = s.x // synchronise la position de référence (clic / portée de dialogue)
        npc.y = s.y
        if (npc.hitbox) npc.hitbox.body.reset(s.x, s.y + 3) // la hitbox (dynamique) suit le baladeur
        npc.label.setPosition(s.x, s.y - 14)
        npc.hint.setPosition(s.x, s.y - 23)
        npc.hint.setVisible(near <= HINT_RANGE)
        this.updateQuestMark(npc, s)
        continue
      }
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
      this.updateQuestMark(npc, s)
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

  /** Use l'arme d'1 point. Toast à la CASSE (notifyBreak) + AVERTISSEMENT quand la durabilité passe sous 10
   *  (1 seule fois, réarmé après réparation) -> le temps d'aller réparer chez Aldric avant la casse. */
  wearWeapon() {
    const w = this.player.equipped.weapon
    const before = w?.durability ?? 0
    const broke = this.player.wearSlot('weapon')
    if (broke) { this.notifyBreak(broke); return }
    if (w && before > 10 && w.durability <= 10) { // vient de franchir le seuil 10 -> alerte unique (orange)
      this.scene.get('UIScene')?.showToast?.(`⚠ ${w.name} presque usée (${w.durability}) — répare chez Aldric`, '#ffae42')
    }
  }

  /** Rappel (throttlé) quand on attaque SANS ARME (cassée/aucune) : on retombe sur un coup de MÊLÉE faible
   *  (même pour un caster) -> va réparer/équiper une arme chez Aldric. */
  warnBrokenWeapon() {
    if (this._brokenWarnShown) return // UNE SEULE fois par "épisode sans arme" (réarmé dès qu'on rééquipe une arme)
    this._brokenWarnShown = true
    this.scene.get('UIScene')?.showToast?.('Sans arme : coup de mêlée faible — équipe/répare chez Aldric', '#e0a866')
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
    // fleurs en touffes (égayent la prairie du bourg) — lampadaires/barriques retirés en attendant les vrais assets de déco
    for (const [dx, dy] of [[-5, -5], [5, -3], [-3, 5], [4, 5], [-6, 1], [3, -5], [7, -2], [-8, -2], [1, 6], [-1, -7]]) flower(cx + dx, cy + dy)
  }

  /** Petit MARCHÉ : bannières colorées (tileset house, rows 20-21) + cagettes, côté est de la place. */
  spawnMarketStall() {
    const cx = this.cx
    const cy = this.cy
    const free = (tx, ty) => tx > 1 && ty > 1 && tx < MAP_W - 1 && ty < MAP_H - 1 && !this.occupied.has(this.key(tx, ty)) && !this.onPath(tx, ty, 1) && !this.onWater(tx, ty, 1)
    const banner = (tx, ty, col) => {
      if (!free(tx, ty)) return
      const x = tx * TILE + 8
      this.add.image(x, ty * TILE + 8, 'house', 20 * HOUSE_COLS + col).setDepth((ty + 1) * TILE + 20)
      this.add.image(x, (ty + 1) * TILE + 8, 'house', 21 * HOUSE_COLS + col).setDepth((ty + 1) * TILE + 20)
      this.occupied.add(this.key(tx, ty))
    }
    // rangée festive de bannières colorées -> ambiance de marché (déco bois/étals à venir avec les vrais assets)
    const cols = [22, 24, 26, 28] // rouge / diamant / S / crâne (variété)
    cols.forEach((c, i) => banner(cx - 3 + i * 2, cy - 5, c))
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
      if (v.merchant) continue // la maison du marchand n'a pas de villageois bavard (le marchand s'y tient)
      // PNJ d'un bâtiment enterable : DÉCALÉ d'1 tuile à CÔTÉ de la porte → on peut PARLER (près du PNJ) OU
      // ENTRER (en marchant sur la porte), jamais les deux en même temps. La tuile de porte (v.nx,v.ny) reste libre.
      const ntx = v.enter ? v.nx + 1 : v.nx
      const n = this.addNpc(ntx, v.ny, v.tex, v.name, v.lines, v.role ?? 'talk')
      if (n && v.noQuest) n.noQuest = true // PNJ de seuil (Mira à l'auberge) : pas de quête ici, elles se donnent à l'intérieur
    }
    // PNJ baladeurs de la prairie : cliquables / "Parler (E)" comme les autres, MAIS ils errent
    // (corps physique désactivé -> pas de mur fantôme là où le sprite n'est plus ; on les traverse).
    for (const npc of this.wildNpcs || []) {
      const n = this.addNpc(npc.tx, npc.ty, npc.tex, npc.name, npc.lines, 'talk')
      if (!n) continue
      this.tweens.killTweensOf(n.sprite) // stoppe la "respiration" (sinon elle écrase l'anim de marche)
      n.sprite.setScale(1)
      // RETIRE le corps statique de l'arbre de collision (enable=false ne suffit pas : overlapRect
      // détecterait encore le propre corps du PNJ -> il se croit bloqué et ne bouge jamais).
      if (n.sprite.body) this.physics.world.disable(n.sprite)
      n._w = this.makeWander(n.sprite, n.texture, n.sprite.x, n.sprite.y, 64, 24 + Math.random() * 12)
      n._w.biomeLock = 'prairie' // ne sortent jamais de la prairie
      // HITBOX qui SUIT le baladeur (corps statique repositionné chaque frame dans updateNpcs) -> le joueur ne
      // traverse plus les PNJ qui bougent. Invisible en jeu, visible en debug. (Séparée du sprite pour ne pas gêner l'errance.)
      const hb = this.add.rectangle(n.sprite.x, n.sprite.y + 3, 11, 10).setVisible(false)
      this.physics.add.existing(hb) // DYNAMIQUE (pas statique) -> ignoré par l'overlapRect(static) de l'errance => le PNJ se déplace toujours
      hb.body.setAllowGravity(false); hb.body.immovable = true; hb.body.moves = false
      this.physics.add.collider(this.player, hb)
      n.hitbox = hb
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

  /** ARME TENUE EN MAIN (toggle X) : affiche l'arme équipée à côté du héros, orientée selon la direction.
   *  Se CACHE pendant une action d'attaque (le swing/poke montre l'arme à la place) et REVIENT à la fin.
   *  Aura de rareté permanente (épique=violet / légendaire=or). Appelé chaque frame depuis update(). */
  updateHeldWeapon() {
    const p = this.player
    if (!p) return
    const weapon = p.equipped?.weapon
    const now = this.time.now
    // affiché SEULEMENT si le toggle X est actif ; caché si : pas d'arme, en pleine attaque, navigation, mort
    const busy = !this._heldOn || !weapon?.icon || !this.textures.exists(weapon.icon) || p.attacking || p.casting || p.sailing || p.hp <= 0 || now < (this._heldHideUntil ?? 0)
    if (busy) { this._heldWeapon?.setVisible(false); this._heldGlow?.setVisible(false); return }
    if (!this._heldWeapon) this._heldWeapon = this.add.image(0, 0, weapon.icon)
    if (!this._heldGlow) this._heldGlow = this.add.image(0, 0, weapon.icon).setBlendMode(Phaser.BlendModes.ADD)
    // position/rotation de la main selon la direction du héros (le héros fait ~16px ; la main est sur le côté)
    const POSE = {
      down: { dx: 5, dy: 2, rot: 0.35, behind: false, flip: false },
      up: { dx: -5, dy: 0, rot: 0.35, behind: true, flip: false },
      right: { dx: 6, dy: 1, rot: 0.5, behind: false, flip: false },
      left: { dx: -6, dy: 1, rot: -0.5, behind: false, flip: true },
    }[p.facing] || { dx: 5, dy: 2, rot: 0.35, behind: false, flip: false }
    const scale = this.weaponScale(weapon.icon, 13) * (weapon.heldScale ?? 1)
    const x = p.x + POSE.dx, y = p.y + POSE.dy, depth = p.y + (POSE.behind ? -2 : 2)
    const w = this._heldWeapon.setTexture(weapon.icon).setVisible(true).setPosition(x, y).setDepth(depth).setRotation(POSE.rot).setScale((POSE.flip ? -1 : 1) * scale, scale)
    const r = weapon.rarity
    if (r === 'epic' || r === 'legendary') {
      const t = 0.45 + 0.2 * Math.sin(now / 240) // pulsation douce
      this._heldGlow.setTexture(weapon.icon).setVisible(true).setPosition(x, y).setDepth(depth - 1).setRotation(POSE.rot).setScale((POSE.flip ? -1 : 1) * scale * 1.25, scale * 1.25).setTint(RARITY[r].tint).setAlpha(t)
    } else this._heldGlow.setVisible(false)
    void w
  }

  /** Attaque de base déclenchée par le bouton ATK : épée (melee) ou projectile (ranged) selon la classe. */
  basicAttack() {
    const p = this.player
    if (!p) return
    if (this.inInterior) return // zone sûre : aucune attaque dans un intérieur (taverne, auberge, apothicaire, dortoir)
    if (this.sailBlocked()) return // pas d'attaque en navigation
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
    const target = this.currentTarget(220) // cible verrouillée prioritaire
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
    proj.fromClone = null // tir du JOUEUR (réinitialise un éventuel marquage de clone du pool)
    proj.fire(p.x, p.y, tx, ty, p.attackPower, this.time.now, target, 0xffffff, weapon.proj)
  }

  doAttack(force = false) {
    if (this.uiBusy()) return
    const p = this.player
    if (!p.abilities.melee && !force) return // classe sans corps à corps (Mage/Soigneur) — SAUF coup désespéré sans arme (force=true)
    if (!p.startAttack(this.time.now)) return

    const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing]
    const cx = p.x + dir[0] * 14 // centre de la zone, devant le perso
    const cy = p.y + dir[1] * 14
    const RANGE = 20 // rayon de la zone de frappe (généreux)

    // arme équipée -> son sprite fait un MOUVEMENT DE COUP (swing) ; sinon simple arc blanc.
    // `swingTex` (optionnel) = sprite dédié à l'animation de coup quand l'icône d'inventaire (ex. Admurin,
    // orientée en diagonale) ne s'aligne pas sur l'arc du swing -> on swingue le sprite Ninja à la place.
    const weapon = p.equipped?.weapon
    const wIcon = weapon?.swingTex || weapon?.icon
    if (wIcon && this.textures.exists(wIcon)) this.showWeaponSwing(p.x, p.y, p.facing, wIcon)
    else this.showSlash(p.x, p.y, p.facing)
    // tranche FX selon le TYPE d'arme (lame = tranche courbée, masse = slash circulaire)
    if (weapon?.fx && this.anims.exists(weapon.fx)) this.showSlashFx(p.x, p.y, p.facing, weapon.fx)
    // MAINS NUES (arme cassée) : coup de poing -> son sourd (whoosh) + rappel de réparation ; sinon lame.
    if (p.unarmed) { Audio.sfx(SFX.whoosh, { vol: 0.45 }); this.warnBrokenWeapon() }
    else { Audio.sfx(SFX.slash, { vol: 0.5 }); this._brokenWarnShown = false } // lame en main -> réarme l'avertissement

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
      this.wearWeapon() // use l'arme (mêlée) + toast casse + avertissement durabilité faible
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
    this.floatingDamage(mon, amount, '#fff3b0') // chiffre de dégâts (jaune) au-dessus du monstre, AVANT sa mort éventuelle
    mon.takeDamage(Math.round(amount))
  }

  /** Monstre actif le plus proche de (x,y) dans `radius`, sinon null. Si `visibleOnly`, on ignore les
   *  monstres HORS de la vue caméra -> on ne peut pas cibler/toucher un mob qu'on ne voit pas. */
  /** Ennemi cliqué (boîte du sprite + tolérance de clic généreuse), ou null. */
  monsterAt(wx, wy) {
    let best = null
    let bestD = 28 // tolérance (px) pour viser facilement au clic
    this.monsters.getChildren().forEach((m) => {
      if (!m.active || m.hp <= 0) return
      const halfW = (m.displayWidth || 16) / 2 + 4
      const halfH = (m.displayHeight || 16) / 2 + 4
      if (Math.abs(wx - m.x) <= halfW && Math.abs(wy - m.y) <= halfH) { best = m; bestD = -1; return }
      if (bestD < 0) return // déjà un hit direct
      const d = Phaser.Math.Distance.Between(wx, wy, m.x, m.y)
      if (d < bestD) { bestD = d; best = m }
    })
    return best
  }

  /** Verrouille un ennemi comme cible active (clic ou Tab). */
  setTarget(m) {
    if (!m || !m.active || m.hp <= 0) return
    this.lockedTarget = m
    Audio.sfx('ui_move', { vol: 0.4, detune: 300 }) // petit bip de ciblage
  }

  /** Lève le verrouillage de cible (cible morte / hors-jeu). */
  clearTarget() {
    this.lockedTarget = null
    this.targetReticle?.setVisible(false)
  }

  /** Tab : verrouille / cycle vers l'ennemi VISIBLE le plus proche. */
  cycleTarget() {
    if (this.uiBusy() || this.gameOver) return
    const p = this.player
    const view = this.cameras.main.worldView
    const vis = this.monsters.getChildren()
      .filter((m) => m.active && m.hp > 0 && Phaser.Geom.Rectangle.Contains(view, m.x, m.y))
      .sort((a, b) => Phaser.Math.Distance.Between(p.x, p.y, a.x, a.y) - Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y))
    if (!vis.length) { this.clearTarget(); return }
    const idx = vis.indexOf(this.lockedTarget) // -1 si rien/invalide -> (idx+1)%n = 0 = le plus proche
    this.setTarget(vis[(idx + 1) % vis.length])
  }

  /** Cible verrouillée si encore valide (peu importe la distance), sinon l'ennemi visible le plus proche. */
  currentTarget(radius = 300) {
    const t = this.lockedTarget
    if (t && t.active && t.hp > 0) return t
    return this.nearestMonster(this.player.x, this.player.y, radius, true)
  }

  /** Suit la cible avec le réticule + libère le verrouillage si elle meurt. */
  updateTarget(time) {
    const t = this.lockedTarget
    if (t && (!t.active || t.hp <= 0)) { this.clearTarget(); return }
    const ret = this.targetReticle
    if (!ret) return
    if (t) {
      // anneau plat sous les pieds : largeur ~ celle de la cible (plafonnée), posé juste DERRIÈRE le sprite
      const w = Phaser.Math.Clamp((t.displayWidth || 16) * 0.95, 16, 44)
      const pulse = 1 + 0.08 * Math.sin(time / 200)
      ret.setScale((w / 24) * pulse)
      ret.setPosition(t.x, t.y + (t.displayHeight || 16) * 0.3).setVisible(true).setDepth(t.y - 1)
    } else if (ret.visible) {
      ret.setVisible(false)
    }
  }

  /** Plafond d'aggro : vrai s'il reste de la place pour un nouveau poursuivant NORMAL (anti-meute +
   *  en multi, empêche un joueur de "ramasser" tout un biome). Les boss ne comptent pas. */
  aggroSlotFree() {
    let n = 0
    this.monsters.getChildren().forEach((m) => { if (m.active && m.aggroed && !m.isBoss) n++ })
    return n < MAX_CHASERS
  }

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
    if (this.uiBusy() || this.inInterior) return // pas de tir dans un intérieur
    const p = this.player
    if (p.unarmed) return this.doAttack(true) // SANS ARME : le caster « passe en mêlée » (coup faible) au lieu de tirer
    this._brokenWarnShown = false // arme en main -> on réarme l'avertissement "sans arme"
    const target = this.currentTarget(HOMING_RANGE) // cible verrouillée prioritaire, sinon le plus proche visible
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
    if (this.uiBusy() || this.gameOver || this.inInterior) return // pas de sort dans un intérieur
    if (this.sailBlocked()) return // pas de sort en navigation
    const p = this.player
    const sp = p.spell
    if (!sp || p.hp <= 0) return
    const now = this.time.now
    if (now < p.nextSpellAt) return this.floatingText(p.x, p.y - 18, 'Pas prêt', '#ffd27a')
    if (p.mana < sp.cost) return this.floatingText(p.x, p.y - 18, 'Mana !', '#7fb3ff')
    const effects = {
      charge: () => this.spellCharge(),
      shieldcharge: () => this.spellShieldCharge(), // Tank : sort principal = Charge
      blizzard: () => this.spellBlizzard(), // Mage GLACE : zone + ralentit
      firestorm: () => this.spellFirestorm(), // Mage FEU : zone + brûlure
      voidstorm: () => this.spellVoidstorm(), // Mage OMBRE : zone + affaiblit
      wordshield: () => this.spellShield(), // Soigneur : sort 1 = Mot de pouvoir : Bouclier (absorption + soin)
    }
    const fn = effects[sp.id]
    if (!fn || fn() === false) return // sort inconnu / non exécuté -> on ne consomme ni mana ni cd
    p.spendMana(sp.cost)
    p.nextSpellAt = now + sp.cd // cooldown fixe (la Relique n'agit plus sur le cooldown : effet/durée)
  }

  /** 2e COMPÉTENCE (touche 2), déverrouillée au niveau `spell2.level` (10). Mêmes règles que castSpell
   *  (cooldown propre `nextSpell2At`, coût mana). */
  castSpell2() {
    if (this.uiBusy() || this.gameOver || this.inInterior) return // pas de sort dans un intérieur
    if (this.sailBlocked()) return
    const p = this.player
    const sp = p.spell2
    if (!sp || p.hp <= 0) return
    if (!TEST_UNLOCK_SKILLS && p.level < (sp.level ?? 10)) return this.floatingText(p.x, p.y - 18, `Niv ${sp.level ?? 10}`, '#ffd27a')
    const now = this.time.now
    if (now < p.nextSpell2At) return this.floatingText(p.x, p.y - 18, 'Pas prêt', '#ffd27a')
    if (p.mana < sp.cost) return this.floatingText(p.x, p.y - 18, 'Mana !', '#7fb3ff')
    const effects = {
      whirlwind: () => this.spellWhirlwind(),
      provoke: () => this.spellProvoke(), // Tank : 2e compétence = Provocation (niv 10)
      pyroblast: () => this.spellPyroblast(), // Mage FEU : mono-cible + brûlure (niv 10)
      frostlance: () => this.spellFrostlance(), // Mage GLACE : mono-cible + ralentit (niv 10)
      shadowbolt: () => this.spellShadowbolt(), // Mage OMBRE : mono-cible + affaiblit (niv 10)
      sanctuary: () => this.spellSanctuary(),
    }
    const fn = effects[sp.id]
    if (!fn || fn() === false) return
    p.spendMana(sp.cost)
    p.nextSpell2At = now + sp.cd // cooldown fixe (cf. castSpell)
  }

  /** COMPÉTENCE DE PANOPLIE (touche 3) : disponible seulement si la panoplie de classe est COMPLÈTE
   *  (p.activeSet, 4 pièces). Cooldown long + coût mana. Plus forte que les sorts 1/2. (Brief §5/§7) */
  castSpell3() {
    if (this.uiBusy() || this.gameOver || this.inInterior) return // pas de sort dans un intérieur
    if (this.sailBlocked()) return
    const p = this.player
    if (p.hp <= 0) return
    let set = p.activeSet
    if (!set && TEST_UNLOCK_SKILLS) {
      const skill = { warrior: 'warcry', tank: 'shockwave', mage: 'mirror', healer: 'resurrect' }[this.character?.classKey]
      if (skill) set = { skill } // TEST : panoplie simulée -> sort de panoplie utilisable sans les 4 pièces
    }
    if (!set) return this.floatingText(p.x, p.y - 18, 'Panoplie incomplète (4/4)', '#ffd27a')
    const now = this.time.now
    if (now < (p.nextSpell3At ?? 0)) return this.floatingText(p.x, p.y - 18, 'Pas prêt', '#ffd27a')
    const COST = SPELL3_COST[this.character?.classKey] ?? 45 // l'ULTIME : le plus cher (au-dessus du sort 2)
    if (p.mana < COST) return this.floatingText(p.x, p.y - 18, 'Mana !', '#7fb3ff')
    const effects = {
      mirror: () => this.spellMirrorImage(), // Mage : Image miroir (clones)
      warcry: () => this.spellWarcry?.(), // Guerrier : Cri intimidant (à venir étape 7)
      shockwave: () => this.spellShockwave?.(), // Tank : Onde de choc (à venir)
      resurrect: () => this.spellResurrect?.(), // Soigneur : Résurrection (à venir)
    }
    const fn = effects[set.skill]
    if (!fn || fn() === false) return this.floatingText(p.x, p.y - 18, 'Bientôt', '#ffd27a')
    p.spendMana(COST)
    p.nextSpell3At = now + 35000 // cooldown long (~35 s)
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
      const staff = this.add.image(p.x + 5, p.y + 1, wIcon).setDepth(p.y + 60).setScale(this.weaponScale(wIcon, 18) * (p.equipped?.weapon?.heldScale ?? 1)).setRotation(-0.4)
      this.tweens.add({ targets: staff, y: p.y - 4, duration: 200, yoyo: true, onComplete: () => staff.destroy() })
    }
    this.floatingText(p.x, p.y - 6, `+${healed}`, '#7CFC9A')
    return true
  }

  /** MOT DE POUVOIR : BOUCLIER (Soigneur, sort 1) : petit soin immédiat + BOUCLIER d'absorption (encaisse
   *  des dégâts avant les PV) pendant un temps. Bulle bleue qui suit le héros, éclate quand il casse/expire. */
  spellShield() {
    const p = this.player
    const now = this.time.now
    const heal = p.heal(Math.round(p.maxHp * 0.12 * (p.spellPowerMul ?? 1))) // petit soin immédiat (0.18->0.12 : nerf Soigneuse)
    const shield = Math.max(1, Math.round(p.maxHp * 0.22 * (p.spellPowerMul ?? 1))) // points d'absorption (0.3->0.22 : nerf)
    const dur = Math.round(9000 * (p.spellDurationMul ?? 1))
    p.shieldHp = shield
    p.shieldHpUntil = now + dur
    Audio.sfx(SFX.shield, { vol: 0.6 })
    const aura = this.add.sprite(p.x, p.y - 2, 'fx_aura').setDepth(p.y + 61).setScale(1.6).setTint(0x9fe0ff)
    if (this.anims.exists('fx-aura')) { aura.play('fx-aura'); aura.once('animationcomplete', () => aura.destroy()) } else aura.destroy()
    if (heal > 0) this.floatingText(p.x, p.y - 6, `+${heal}`, '#7CFC9A')
    this.floatingText(p.x, p.y - 16, `Bouclier ${shield}`, '#bfe9ff')
    this.spawnShieldBubble()
    return true
  }

  /** Bulle de bouclier (Soigneur) qui suit le héros tant que l'absorption tient. */
  spawnShieldBubble() {
    const p = this.player
    this.onShieldBroken(p) // nettoie une bulle précédente
    const bubble = this.add.sprite(p.x, p.y, 'fx_shield').setDepth(p.y + 60).setScale(1.8).setAlpha(0.8).setTint(0x9fe0ff)
    if (this.anims.exists('fx-shield')) bubble.play('fx-shield')
    this._shieldBubble = bubble
    this._shieldBubbleEv = this.time.addEvent({ delay: 30, loop: true, callback: () => {
      if (!this._shieldBubble) return
      if (p.shieldHp <= 0 || this.time.now >= p.shieldHpUntil) { this.onShieldBroken(p); return }
      bubble.setPosition(p.x, p.y).setDepth(p.y + 60)
    } })
  }

  /** Le bouclier d'absorption casse / expire : annule l'absorption et fait éclater la bulle. */
  onShieldBroken(p) {
    p.shieldHp = 0
    this._shieldBubbleEv?.remove(); this._shieldBubbleEv = null
    if (this._shieldBubble) { const b = this._shieldBubble; this._shieldBubble = null; this.tweens.add({ targets: b, alpha: 0, scale: 2.1, duration: 200, onComplete: () => b.destroy() }) }
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
    const dur = Math.round(200 * (p.spellDurationMul ?? 1)) // bond (allongé par la Relique) -> esquive / repositionnement
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

  /** PROVOCATION (Tank, sort principal) : 2-EN-1 -> active le Bouclier (-80 % dégâts 4 s, cf. takeDamage)
   *  ET provoque tous les ennemis proches (les force à t'attaquer, ignore le plafond de poursuivants). */
  spellProvoke() {
    const p = this.player
    const now = this.time.now
    // 1) BOUCLIER : bulle animée qui suit le héros (5 s, allongé par la Relique)
    const dur = 5000 * (p.spellDurationMul ?? 1)
    p.shieldUntil = now + dur
    Audio.sfx(SFX.shield, { vol: 0.6 })
    const bubble = this.add.sprite(p.x, p.y, 'fx_shield').setDepth(p.y + 60).setScale(1.7).setAlpha(0.9)
    bubble.play('fx-shield')
    const ev = this.time.addEvent({ delay: 30, loop: true, callback: () => bubble.setPosition(p.x, p.y).setDepth(p.y + 60) })
    this.time.delayedCall(dur, () => { ev.remove(); bubble.destroy() })
    // 2) PROVOCATION : aggro forcé des mobs proches + onde + "!" au-dessus d'eux
    const R = 150
    this.monsters.getChildren().forEach((m) => {
      if (m.active && !m.isBoss && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) <= R) {
        m.engage?.(true) // force l'aggro (frappé=force -> ignore le plafond MAX_CHASERS)
        m.showAlert?.(now)
      }
    })
    const ring = this.add.circle(p.x, p.y, 12, 0xffcf6b, 0).setStrokeStyle(3, 0xffcf6b, 0.85).setDepth(p.y + 1)
    this.tweens.add({ targets: { v: 0 }, v: 1, duration: 420, ease: 'Cubic.out', onUpdate: (tw, t) => { ring.setRadius(12 + (R - 12) * t.v); ring.setAlpha(0.85 * (1 - t.v)) }, onComplete: () => ring.destroy() })
    this.floatingText(p.x, p.y - 18, 'Provocation !', '#ffcf6b')
    return true
  }

  /** TOURBILLON (Guerrier, 2e compétence) : tournoie sur place -> 2 salves de dégâts AoE à TOUS les ennemis
   *  autour (+ léger recul). Complète la Charge (mono-cible). */
  spellWhirlwind() {
    const p = this.player
    const now = this.time.now
    const DUR = 750
    p.attacking = true
    p.attackUntil = now + DUR
    p.setVelocity(0, 0)
    p.anims.play(`${p.heroKey}-attack-` + p.facing, true)
    // BRUIT DE VENT : whooshs échelonnés + détunés -> bourrasque qui tournoie pendant toute la durée
    Audio.sfx(SFX.whoosh, { vol: 0.6, detune: -250 })
    this.time.delayedCall(150, () => Audio.sfx(SFX.whoosh, { vol: 0.5, detune: 250 }))
    this.time.delayedCall(340, () => Audio.sfx(SFX.whoosh, { vol: 0.55, detune: -100 }))
    this.time.delayedCall(540, () => Audio.sfx(SFX.whoosh, { vol: 0.45, detune: 450 }))
    // le GUERRIER TOURNE physiquement sur lui-même pendant le tourbillon
    this.tweens.add({ targets: p, rotation: Math.PI * 4, duration: DUR, ease: 'Sine.inOut', onComplete: () => p.setRotation(0) })
    const fx = this.add.sprite(p.x, p.y, 'fx_circslash').setDepth(p.y + 60).setScale(2.8)
    fx.play('fx-circslash')
    const ev = this.time.addEvent({ delay: 30, loop: true, callback: () => { fx.setPosition(p.x, p.y).setDepth(p.y + 60); fx.rotation += 0.5 } })
    const R = 58
    const dmg = p.attackPower * 1.7
    const tick = () => this.monsters.getChildren().forEach((m) => {
      const half = m.body ? (m.body.halfWidth + m.body.halfHeight) / 2 : 0
      if (m.active && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) <= R + half) this.hitMonster(m, dmg, p.x, p.y, 90)
    })
    tick()
    this.time.delayedCall(250, tick)
    this.time.delayedCall(500, tick)
    this.time.delayedCall(DUR, () => { ev.remove(); fx.destroy(); p.attacking = false; p.setRotation(0) })
    return true
  }

  /** CHARGE DE BOUCLIER (Tank, 2e compétence) : BUFF de vitesse -> le Tank passe de LENT à RAPIDE (déplacement
   *  libre au clavier/clic). Dure jusqu'à 4 s OU jusqu'à ce qu'il PERCUTE un ennemi. Le coup d'impact fait
   *  d'autant PLUS de dégâts que la distance parcourue depuis le départ est grande (élan). */
  spellShieldCharge() {
    const p = this.player
    const now = this.time.now
    p.charging2 = true
    p.chargeSpeedMul = 1.8 // Tank lent (×0,6) -> rapide mais CONTRÔLABLE (passe les ponts étroits)
    p.chargeStartX = p.x
    p.chargeStartY = p.y
    p.chargeUntil = now + 4000 // 4 s
    Audio.sfx(SFX.shield, { vol: 0.55 })
    Audio.sfx(SFX.whoosh, { vol: 0.4, detune: -200 })
    // bulle de bouclier qui suit le héros pendant la charge (suivie/détruite dans update / endTankCharge)
    this.tankChargeFx?.destroy()
    this.tankChargeFx = this.add.sprite(p.x, p.y, 'fx_shield').setDepth(p.y + 61).setScale(1.5).setAlpha(0.85)
    this.tankChargeFx.play('fx-shield')
    this.floatingText(p.x, p.y - 18, 'Charge !', '#9fd0ff')
    return true
  }

  /** Le Tank en charge percute un ennemi : dégâts ∝ distance parcourue (élan) + recul + étourdissement, puis
   *  la charge se termine. */
  tankChargeHit(mon) {
    const p = this.player
    if (!p.charging2 || !mon.active || mon.hp <= 0) return
    if (mon.isBoss && !mon.combatEngaged) return // ne réveille pas un boss endormi par simple contact
    const dist = Phaser.Math.Distance.Between(p.chargeStartX, p.chargeStartY, p.x, p.y)
    const mult = 1.3 + Phaser.Math.Clamp(dist / 350, 0, 1) * 3.2 // ×1,3 (court) -> ×4,5 (longue charge)
    this.hitMonster(mon, p.attackPower * mult, p.x, p.y, 340)
    if (!mon.isBoss) mon.stunnedUntil = this.time.now + 1500
    this.showSlash(p.x, p.y, p.facing)
    this.cameras.main.shake(170, 0.009)
    this.endTankCharge()
  }

  /** Termine la charge du Tank (impact ou fin des 4 s) : retire le boost de vitesse + la bulle. */
  endTankCharge() {
    const p = this.player
    if (!p.charging2) return
    p.charging2 = false
    p.chargeSpeedMul = 1
    this.tankChargeFx?.destroy()
    this.tankChargeFx = null
  }

  /** IMAGE MIROIR (Mage, 2e compétence) : 1 s d'INCANTATION (le mage est enraciné) puis invoque les clones. */
  spellMirrorImage() {
    return this.incant(1000, 'Image miroir…', this.player.magicColor, () => this.spawnMirrorClones())
  }

  /** Incantation générique : enracine le héros `ms` ms avec une barre au-dessus de la tête, puis `onDone`.
   *  Annulée s'il prend un coup (castInterrupted). Renvoie true si elle DÉMARRE (-> paie mana + cooldown). */
  incant(ms, label, color, onDone) {
    const p = this.player
    if (p.casting) return false
    const start = this.time.now
    p.casting = true
    p.castInterrupted = false
    p.setVelocity(0, 0)
    const s = this.spellSfx()
    Audio.sfx(s.cast, { vol: 0.6, detune: s.castDetune ?? 0 })
    const W = 30
    const yOff = 24
    const bg = this.add.rectangle(p.x, p.y - yOff, W + 2, 6, 0x000000, 0.65).setDepth(99998)
    const bar = this.add.rectangle(p.x - W / 2, p.y - yOff, 0, 4, color).setOrigin(0, 0.5).setDepth(99999)
    const lbl = this.add.text(p.x, p.y - yOff - 7, label, { fontFamily: FONT, fontSize: '8px', color: '#ffd27a', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(99999).setResolution(3)
    // ANIMATION DE CANALISATION : aura magique qui pulse au sol + anneau + arme brandie qui tourne
    const aura = this.add.circle(p.x, p.y + 4, 15, color, 0.22).setDepth(p.y - 2)
    const ring = this.add.circle(p.x, p.y + 4, 17, color, 0).setStrokeStyle(2, color, 0.85).setDepth(p.y - 2)
    this.tweens.add({ targets: [aura, ring], scale: 1.35, duration: ms / 2, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    const wIcon = p.equipped?.weapon?.icon
    const staff = wIcon && this.textures.exists(wIcon) ? this.add.image(p.x + 5, p.y - 4, wIcon).setDepth(p.y + 60).setScale(this.weaponScale(wIcon, 18) * (p.equipped?.weapon?.heldScale ?? 1)).setRotation(-0.3) : null
    const cleanup = () => { bg.destroy(); bar.destroy(); lbl.destroy(); this.tweens.killTweensOf([aura, ring]); aura.destroy(); ring.destroy(); staff?.destroy(); p.casting = false }
    const ev = this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        if (!p.active || p.castInterrupted || this.gameOver) {
          if (p.castInterrupted) this.floatingText(p.x, p.y - 18, 'Incantation interrompue', '#ff8a8a')
          ev.remove(); cleanup(); return
        }
        const t = Phaser.Math.Clamp((this.time.now - start) / ms, 0, 1)
        bg.setPosition(p.x, p.y - yOff)
        lbl.setPosition(p.x, p.y - yOff - 7)
        bar.setPosition(p.x - W / 2, p.y - yOff).setSize(W * t, 4)
        aura.setPosition(p.x, p.y + 4).setDepth(p.y - 2)
        ring.setPosition(p.x, p.y + 4).setDepth(p.y - 2)
        if (staff) staff.setPosition(p.x + 5, p.y - 4).setDepth(p.y + 60).rotation += 0.25 // l'arme tourne pendant la canalisation
        if (t >= 1) { ev.remove(); cleanup(); onDone() }
      },
    })
    return true
  }

  /** Crée les clones (après l'incantation) + une ZONE de la couleur du perso qui délimite leur rayon max. */
  spawnMirrorClones() {
    const p = this.player
    const now = this.time.now
    const DUR = 6000
    const N = 3
    const LEASH = 78
    const cloneHp = Math.max(20, Math.round(p.maxHp * 0.35))
    const col = p.magicColor || 0x9fd8ff
    Audio.sfx(SFX.magic, { vol: 0.6, detune: 120 })
    Audio.sfx(SFX.whoosh, { vol: 0.4, detune: 300 })
    this.floatingText(p.x, p.y - 18, 'Image miroir !', '#bfe0ff')
    // ZONE (couleur du perso) : cercle qui SUIT le joueur et borne le rayon des clones (cf. updateMageClones)
    this.mirrorZone?.destroy()
    this.mirrorZone = this.add.circle(p.x, p.y, LEASH, col, 0.08).setStrokeStyle(2, col, 0.55).setDepth(p.y - 3)
    // onde de mana à l'invocation
    const wave = this.add.circle(p.x, p.y, 8, col, 0).setStrokeStyle(3, col, 0.9).setDepth(p.y + 2)
    this.tweens.add({ targets: { v: 0 }, v: 1, duration: 420, ease: 'Cubic.out', onUpdate: (tw, t) => { wave.setRadius(8 + 46 * t.v); wave.setAlpha(0.9 * (1 - t.v)) }, onComplete: () => wave.destroy() })
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.5
      const cx = p.x + Math.cos(a) * 34
      const cy = p.y + Math.sin(a) * 34
      const c = this.mageClones.create(cx, cy, p.heroKey, 0)
      c.setTint(col).setDepth(cy)
      c.tintColor = col // mémorise la couleur du Mage pour la ré-appliquer après un flash de coup
      c.hp = cloneHp
      c.maxHp = cloneHp
      c.facing = p.facing
      c.expireAt = now + DUR
      c.nextShot = now + 250 + i * 180
      // ENTRÉE : surgit du héros (part de sa position), grandit depuis 0, devient translucide
      c.setPosition(p.x, p.y).setAlpha(0).setScale(0.2)
      this.tweens.add({ targets: c, x: cx, y: cy, alpha: 0.62, scale: 1, duration: 260, ease: 'Back.out' })
      if (this.textures.exists('fx_spirit')) {
        const poof = this.add.sprite(cx, cy, 'fx_spirit').setDepth(cy + 2).setScale(0.9).setTint(col)
        poof.play('fx-spirit')
        poof.once('animationcomplete', () => poof.destroy())
      }
      c.barBg = this.add.rectangle(cx, cy - 14, 18, 3, 0x000000, 0.6).setDepth(cy + 50)
      c.barFg = this.add.rectangle(cx - 8, cy - 14, 16, 1.5, 0x6fd8ff).setOrigin(0, 0.5).setDepth(cy + 51)
    }
  }

  /** Mise à jour des clones du Mage (chaque frame). IA d'ALLIÉ INDÉPENDANT à PORTÉE LIMITÉE : chaque clone
   *  choisit la cible du joueur (assist) si elle est à portée, sinon le mob proche le plus dangereux ;
   *  il S'EN RAPPROCHE (les mobs le prennent alors pour cible = protège le joueur) puis tire à portée.
   *  Sans cible, il revient près du joueur. Barre de vie + expiration gérées ici. */
  updateMageClones(time) {
    if (!this.mageClones) return
    const p = this.player
    const ENGAGE_R = 190 // portée d'engagement (ne snipe PAS tout l'écran)
    const SHOOT_R = 110 // distance idéale de tir
    const TOO_CLOSE = 60 // si un mob est plus près que ça -> le clone RECULE (kite)
    const SPEED = 45 // déplacement LENT et fluide (anti-"téléport")
    const LEASH = 78 // rayon max autour du joueur : un clone ne s'éloigne pas plus (suit le joueur)
    const RETURN_SPEED = 78 // hors zone : accélère un peu pour revenir vite vers le joueur
    // ZONE (couleur du perso) : suit le joueur tant que des clones existent, sinon disparaît
    if (this.mirrorZone) {
      if (this.mageClones.countActive(true) === 0) { this.mirrorZone.destroy(); this.mirrorZone = null }
      else this.mirrorZone.setPosition(p.x, p.y).setDepth(p.y - 3)
    }
    const pt = this.currentTarget ? this.currentTarget(360) : null // cible commune du joueur
    for (const c of this.mageClones.getChildren()) {
      if (!c.active) continue
      if (time >= c.expireAt || c.hp <= 0) { this.removeMageClone(c); continue }
      c.setDepth(c.y)
      c.barBg.setPosition(c.x, c.y - 14)
      c.barFg.setPosition(c.x - 8, c.y - 14).setSize(16 * Phaser.Math.Clamp(c.hp / c.maxHp, 0, 1), 1.5)
      // cible de TIR : celle du joueur si à portée (assist), sinon le mob le plus proche dans la portée
      let target = pt && pt.active && Phaser.Math.Distance.Between(c.x, c.y, pt.x, pt.y) <= ENGAGE_R ? pt : null
      if (!target) {
        let bd = ENGAGE_R
        this.monsters.getChildren().forEach((m) => {
          if (!m.active || m.hp <= 0 || (m.isBoss && !m.combatEngaged)) return
          const d = Phaser.Math.Distance.Between(c.x, c.y, m.x, m.y)
          if (d < bd) { bd = d; target = m }
        })
      }
      // menace la plus proche (pour kiter) : un mob qui poursuit CE clone, ou n'importe quel mob trop près
      let threat = null
      let td = TOO_CLOSE
      this.monsters.getChildren().forEach((m) => {
        if (!m.active || m.hp <= 0) return
        const d = Phaser.Math.Distance.Between(c.x, c.y, m.x, m.y)
        if (d < td) { td = d; threat = m }
      })
      const distP = Phaser.Math.Distance.Between(c.x, c.y, p.x, p.y) // distance au joueur (pour le tether)
      let vx = 0
      let vy = 0
      let moving = false
      if (distP > LEASH) { // TETHER : a touché la limite -> revient un peu PLUS VITE vers le joueur
        vx = ((p.x - c.x) / distP) * RETURN_SPEED; vy = ((p.y - c.y) / distP) * RETURN_SPEED; moving = true
      } else if (threat) { // RECULE pour garder ses distances (kite)
        const dx = c.x - threat.x
        const dy = c.y - threat.y
        const d = Math.hypot(dx, dy) || 1
        vx = (dx / d) * SPEED; vy = (dy / d) * SPEED; moving = true
      } else if (target) {
        const dx = target.x - c.x
        const dy = target.y - c.y
        const d = Math.hypot(dx, dy) || 1
        if (d > SHOOT_R) { vx = (dx / d) * SPEED; vy = (dy / d) * SPEED; moving = true } // s'approche (dans le leash)
      } else if (distP > 72) { // pas de cible -> se replace près du joueur
        vx = ((p.x - c.x) / distP) * SPEED; vy = ((p.y - c.y) / distP) * SPEED; moving = true
      }
      c.setVelocity(vx, vy)
      // TIR (que le clone bouge ou kite) : oblige le mob à le poursuivre (cf. overlap projectile->lureTarget)
      if (target && time >= c.nextShot && Phaser.Math.Distance.Between(c.x, c.y, target.x, target.y) <= ENGAGE_R) {
        c.nextShot = time + 800
        const pr = this.projectiles.get(c.x, c.y)
        if (pr) { pr.fromClone = c; pr.fire(c.x, c.y, target.x, target.y, Math.round(p.attackPower * 0.55), time, target, p.magicColor, p.projFx) }
      }
      if (moving) {
        c.facing = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down')
        c.anims.play(`${p.heroKey}-walk-${c.facing}`, true)
      } else {
        c.anims.play(`${p.heroKey}-idle-${c.facing || 'down'}`, true)
      }
    }
  }

  /** Un monstre mord un clone du Mage (overlap) : le clone perd des PV (cooldown par monstre), meurt à 0. */
  monsterBiteClone(clone, mon) {
    if (!clone.active || !mon.active || mon.hp <= 0) return
    if (mon.isBoss && !mon.combatEngaged) return // boss endormi ne mord pas
    const now = this.time.now
    if (now < (mon.nextCloneBiteAt || 0)) return
    mon.nextCloneBiteAt = now + 700
    clone.hp -= mon.damage
    clone.setTintFill(0xffffff)
    this.time.delayedCall(80, () => clone.active && clone.setTint(clone.tintColor ?? 0x9fd8ff)) // ré-applique la couleur du Mage
    if (clone.hp <= 0) this.removeMageClone(clone)
  }

  /** Retire un clone du Mage (PV épuisés ou expiré) : barre + sprite, avec un petit fondu. */
  removeMageClone(clone) {
    if (!clone.active) return
    clone.barBg?.destroy()
    clone.barFg?.destroy()
    this.tweens.add({ targets: clone, alpha: 0, duration: 180, onComplete: () => clone.destroy() })
  }

  /** SANCTUAIRE (Soigneur, 2e compétence) : pose une zone de lumière au sol qui SOIGNE sur la durée (~6 s)
   *  le héros qui s'y tient (tic chaque seconde). */
  spellSanctuary() {
    const p = this.player
    const x = p.x
    const y = p.y
    const R = 52
    const heal = Math.max(15, Math.round(p.maxHp * 0.08 * (p.spellPowerMul ?? 1))) // par tic (1 s) : au moins +15
    Audio.sfx(SFX.heal, { vol: 0.6 })
    const zone = this.add.circle(x, y, R, 0x8ef0a0, 0.16).setDepth(y - 2)
    const ring = this.add.circle(x, y, R, 0x8ef0a0, 0).setStrokeStyle(2, 0x8ef0a0, 0.7).setDepth(y - 1)
    this.tweens.add({ targets: [zone, ring], alpha: 0.4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    const ev = this.time.addEvent({
      delay: 1000, repeat: 5, // 6 tics (~6 s)
      callback: () => {
        if (Phaser.Math.Distance.Between(p.x, p.y, x, y) > R) return
        const h = p.heal(heal)
        if (h > 0) { this.floatingText(p.x, p.y - 6, `+${h}`, '#7CFC9A'); this.showHealEffect(p.x, p.y) }
      },
    })
    this.time.delayedCall(6200, () => { this.tweens.killTweensOf([zone, ring]); zone.destroy(); ring.destroy() })
    this.floatingText(x, y - 18, 'Sanctuaire !', '#9bf0a8')
    return true
  }

  // ===== SORTS ÉLÉMENTAIRES DU MAGE (élément selon l'apparence : feu / glace / ombre) =====
  // Helper générique de ZONE (sort 1) : cercle de sort teinté + jets FX répétés + dégâts par tics + EFFET
  // secondaire par monstre (opts.onHit : ralenti/brûlure/affaiblissement). Centré sur la cible (ou devant).
  elementalStorm(opts) {
    const p = this.player
    const target = this.currentTarget(300)
    let tx = p.x, ty = p.y
    if (target) { tx = target.x; ty = target.y }
    else { const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing] || [0, 1]; tx = p.x + dir[0] * 80; ty = p.y + dir[1] * 80 }
    const R = Math.round(54 * (p.spellPowerMul ?? 1))
    const circle = this.add.sprite(tx, ty, 'fx_magic_circle').setDepth(ty - 2).setScale((R * 2) / 32).setTint(opts.color).setAlpha(0.9)
    if (this.anims.exists('fx-magic-circle')) circle.play('fx-magic-circle')
    Audio.sfx(SFX.magic, { vol: 0.5, detune: opts.detune ?? 0 })
    this.cameras.main.shake(90, 0.003)
    const burst = (x, y) => {
      const s = this.add.sprite(x, y, opts.tex).setOrigin(0.5, opts.originY ?? 0.5).setDepth(y + 4).setScale(opts.scale ?? 1)
      if (opts.tint) s.setTint(opts.color)
      if (this.anims.exists(opts.anim)) { s.play(opts.anim); s.once('animationcomplete', () => s.destroy()) } else this.time.delayedCall(500, () => s.destroy())
    }
    burst(tx, ty)
    const DUR = 2600, TICK = 500
    const tickDmg = Math.max(1, Math.round(p.attackPower * 0.7 * (p.spellPowerMul ?? 1)))
    let elapsed = 0
    const ev = this.time.addEvent({ delay: TICK, loop: true, callback: () => {
      elapsed += TICK
      const a = Math.random() * Math.PI * 2, rr = Math.random() * R * 0.8
      burst(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr)
      this.monsters.getChildren().forEach((m) => {
        if (m.active && Phaser.Math.Distance.Between(tx, ty, m.x, m.y) <= R) { this.hitMonster(m, tickDmg, tx, ty, 0); opts.onHit?.(m) }
      })
      if (elapsed >= DUR) { ev.remove(); this.tweens.add({ targets: circle, alpha: 0, duration: 300, onComplete: () => circle.destroy() }) }
    } })
  }

  // Helper générique de TRAIT mono-cible (sort 2 niv 10) : orbe rapide vers la cible -> gros dégât + effet.
  elementalBolt(opts) {
    const p = this.player
    const target = this.currentTarget(340)
    if (!target || !target.active) return
    const orb = this.add.image(p.x, p.y - 6, 'proj').setTint(opts.color).setScale(2.2).setDepth(p.y + 5)
    this.tweens.add({ targets: orb, x: target.x, y: target.y, duration: 200, ease: 'Quad.easeIn', onComplete: () => {
      orb.destroy()
      if (!target.active) return
      const dmg = Math.max(1, Math.round(p.attackPower * (opts.dmgMul ?? 5) * (p.spellPowerMul ?? 1)))
      const tex = opts.tex ?? 'fx_explosion', anim = opts.anim ?? 'fx-explosion'
      if (this.anims.exists(anim)) { const boom = this.add.sprite(target.x, target.y, tex).setDepth(target.y + 6).setScale(opts.boomScale ?? 1.7); if (opts.tint) boom.setTint(opts.color); boom.play(anim); boom.once('animationcomplete', () => boom.destroy()) }
      else { const boom = this.add.circle(target.x, target.y, 28, opts.color, 0.6).setDepth(target.y + 1); this.tweens.add({ targets: boom, alpha: 0, scale: 1.4, duration: 320, onComplete: () => boom.destroy() }) }
      this.cameras.main.shake(150, 0.005)
      Audio.sfx(SFX.meteor, { vol: 0.75 })
      this.hitMonster(target, dmg, p.x, p.y, 0)
      opts.onHit?.(target)
    } })
  }

  /** Précheck commun aux sorts mage incantés : refuse si déjà en incantation ou aucune cible visible. */
  mageCast(ms, label, color, onDone) {
    const p = this.player
    if (p.casting) return false
    if (!this.currentTarget(340)) { this.floatingText(p.x, p.y - 18, 'Aucune cible', '#ffd27a'); return false }
    return this.incant(ms, label, color, onDone)
  }

  // --- SORT 1 (zone) par élément ---
  spellBlizzard() { return this.mageCast(1100, 'Blizzard…', 0x8fd8ff, () => this.elementalStorm({ color: 0x8fd8ff, tex: 'fx_ice_spike', anim: 'fx-ice-spike', originY: 0.82, detune: 500, onHit: (m) => m.applySlow?.(1300, 0.45) })) }
  spellFirestorm() { return this.mageCast(1100, 'Tempête de feu…', 0xff5a2a, () => this.elementalStorm({ color: 0xff5a2a, tex: 'fx_explosion', anim: 'fx-explosion', scale: 1.2, tint: false, detune: -200, onHit: (m) => m.applyBurn?.(Math.max(1, Math.round(this.player.attackPower * 0.5)), 3000) })) }
  spellVoidstorm() { return this.mageCast(1100, "Tempête d'ombre…", 0x9b4dff, () => this.elementalStorm({ color: 0x9b4dff, tex: 'fx_spirit', anim: 'fx-spirit', scale: 1.5, tint: true, detune: -400, onHit: (m) => m.applyWeaken?.(0.5, 4000) })) }
  // --- SORT 2 (mono-cible niv 10) par élément ---
  spellPyroblast() { return this.mageCast(950, 'Pyroblast…', 0xff5a2a, () => this.elementalBolt({ color: 0xff5a2a, dmgMul: 3.5, tex: 'fx_explosion', anim: 'fx-explosion', onHit: (m) => m.applyBurn?.(Math.max(1, Math.round(this.player.attackPower * 0.6)), 3000) })) }
  spellFrostlance() { return this.mageCast(950, 'Lance de givre…', 0x8fd8ff, () => this.elementalBolt({ color: 0x8fd8ff, dmgMul: 3.2, tex: 'fx_ice_burst', anim: 'fx-ice-burst', boomScale: 1.6, onHit: (m) => m.applySlow?.(2000, 0.4) })) }
  spellShadowbolt() { return this.mageCast(950, "Trait d'ombre…", 0x9b4dff, () => this.elementalBolt({ color: 0x9b4dff, dmgMul: 3.2, tex: 'fx_spirit', anim: 'fx-spirit', tint: true, boomScale: 1.8, onHit: (m) => m.applyWeaken?.(0.5, 5000) })) }

  /** ONDE DE CHOC (Tank, compétence de set) : slam au sol -> anneau de pics de ROCHE, dégâts + ÉTOURDIT
   *  les ennemis autour ET les FORCE à te cibler (provocation). */
  spellShockwave() {
    const p = this.player
    const R = 92
    Audio.sfx('sfx_roar', { vol: 0.45, detune: 300 })
    Audio.sfx(SFX.shield, { vol: 0.6 })
    this.cameras.main.shake(240, 0.009)
    // onde de choc (cercle qui s'étend) + anneau de pics de roche
    const wave = this.add.circle(p.x, p.y, R, 0xffe0a0, 0.22).setStrokeStyle(3, 0xffd27a, 0.9).setDepth(p.y - 1).setScale(0.15)
    this.tweens.add({ targets: wave, scale: 1, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => wave.destroy() })
    const spike = (x, y, sc = 0.85) => {
      const s = this.add.sprite(x, y, 'fx_rock_spike').setOrigin(0.5, 0.85).setDepth(y + 4).setScale(sc)
      if (this.anims.exists('fx-rock-spike')) { s.play('fx-rock-spike'); s.once('animationcomplete', () => s.destroy()) } else this.time.delayedCall(500, () => s.destroy())
    }
    spike(p.x, p.y, 1)
    const N = 9
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; spike(p.x + Math.cos(a) * R * 0.7, p.y + Math.sin(a) * R * 0.7) }
    const dmg = Math.round(p.attackPower * 2.2)
    this.monsters.getChildren().forEach((m) => {
      if (m.active && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) <= R) {
        this.hitMonster(m, dmg, p.x, p.y, 140) // dégâts + recul
        m.stun?.(m.isBoss ? 4000 : 3000) // étourdi (boss inclus : 4 s sur boss) + "zzz"
        m.lureTarget = null; m.aggroed = true; m.returning = false // PROVOQUÉ : te cible
      }
    })
    return true
  }

  /** CRI DE GUERRE (Guerrier, compétence de set) : onde rouge + flash + 4 ondes sonores -> ÉTOURDIT les ennemis
   *  proches (mob 7 s, boss 2 s). Marche AUSSI sur les boss (gel + "zzz"). */
  spellWarcry() {
    const p = this.player
    const R = 120
    Audio.sfx('sfx_roar', { vol: 0.78 })
    this.cameras.main.shake(260, 0.011)
    this.cameras.main.flash(150, 255, 120, 80) // flash rouge bref (impact du cri)
    const burst = this.add.sprite(p.x, p.y - 2, 'fx_spark').setDepth(p.y + 6).setScale(4).setTint(0xff5a4a)
    if (this.anims.exists('fx-spark')) { burst.play('fx-spark'); burst.once('animationcomplete', () => burst.destroy()) } else burst.destroy()
    // halo rouge plein qui pulse
    const halo = this.add.circle(p.x, p.y, R, 0xff4a3a, 0.3).setDepth(p.y - 2).setScale(0.2)
    this.tweens.add({ targets: halo, scale: 1, alpha: 0, duration: 500, ease: 'Quad.easeOut', onComplete: () => halo.destroy() })
    // ONDES DE CRI : 4 anneaux concentriques qui jaillissent en décalé (effet "cri sonore")
    for (let k = 0; k < 4; k++) {
      const ring = this.add.circle(p.x, p.y, R, 0xff4a3a, 0).setStrokeStyle(5, 0xff7a5a, 0.95).setDepth(p.y - 1).setScale(0.12)
      this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 560, delay: k * 120, ease: 'Quad.easeOut', onComplete: () => ring.destroy() })
    }
    this.monsters.getChildren().forEach((m) => {
      if (m.active && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) <= R) {
        m.stun?.(m.isBoss ? 2000 : 7000) // ÉTOURDI : boss inclus (mob 7 s, boss 2 s) -> "zzz"
      }
    })
    return true
  }

  /** MULTIJOUEUR (à venir) : renvoie l'ALLIÉ MORT le plus proche dans le rayon de réanimation, ou null.
   *  Tant que le multijoueur n'existe pas, il n'y a pas d'autres joueurs (`this.allies` absent) -> renvoie
   *  toujours null, et le sort retombe sur l'auto-résurrection solo. À l'arrivée du multi : alimenter
   *  `this.allies` (les coéquipiers, avec `.dead`/`.x`/`.y`) et la cible se branche toute seule. */
  findDeadAlly(range = 130) {
    const allies = this.allies
    if (!allies?.length) return null
    const p = this.player
    let best = null
    let bd = range
    for (const a of allies) {
      if (!a?.dead || !a.active) continue
      const d = Phaser.Math.Distance.Between(p.x, p.y, a.x, a.y)
      if (d <= bd) { bd = d; best = a }
    }
    return best
  }

  /** Applique une RÉSURRECTION à `target` (le héros en solo, ou un allié mort en multi) : 50 % PV, mana pleine,
   *  3 s d'INVULNÉRABILITÉ + animation (aura + cercle + bulle protectrice qui SUIT la cible). */
  applyResurrect(target) {
    target.hp = Math.round(target.maxHp * 0.5)
    if (target.maxMana != null) target.mana = target.maxMana
    target.invulnUntil = this.time.now + 3000
    target.setVelocity?.(0, 0)
    const aura = this.add.sprite(target.x, target.y - 2, 'fx_aura').setDepth(target.y + 6).setScale(2.6).setTint(0xfff0a0)
    if (this.anims.exists('fx-aura')) { aura.play('fx-aura'); aura.once('animationcomplete', () => aura.destroy()) } else aura.destroy()
    const circle = this.add.sprite(target.x, target.y, 'fx_magic_circle').setDepth(target.y - 1).setScale(2.6).setTint(0xfff0a0)
    if (this.anims.exists('fx-magic-circle')) circle.play('fx-magic-circle')
    this.tweens.add({ targets: circle, alpha: 0, duration: 600, delay: 2400, onComplete: () => circle.destroy() }) // l'anim dure ~3 s
    // BULLE PROTECTRICE dorée qui SUIT la cible pendant les 3 s d'invulnérabilité (montre qu'elle est protégée)
    const shield = this.add.circle(target.x, target.y - 4, 26, 0xffe9a0, 0.16).setStrokeStyle(2, 0xffe9a0, 0.8).setDepth(target.y + 5)
    const shieldEnd = this.time.now + 3000
    const shieldEv = this.time.addEvent({ delay: 16, loop: true, callback: () => {
      if (this.time.now >= shieldEnd || !target.active) { shieldEv.remove(); shield.destroy(); return }
      shield.setPosition(target.x, target.y - 4).setDepth(target.y + 5).setScale(0.85 + 0.15 * Math.sin(this.time.now / 120)).setAlpha(0.12 + 0.1 * (0.5 + 0.5 * Math.sin(this.time.now / 160)))
    } })
    Audio.sfx(SFX.heal, { vol: 0.9 })
    this.cameras.main.flash(300, 255, 240, 180)
    this.floatingText(target.x, target.y - 22, 'RÉSURRECTION !', '#ffe9a0')
  }

  /** RÉSURRECTION (Soigneur, compétence de set) : en MULTI, réanime un ALLIÉ MORT proche (cf. findDeadAlly).
   *  En SOLO (aucun allié), accorde une AUTO-RÉSURRECTION -> à la prochaine mort, le héros se relève (handleDeath). */
  spellResurrect() {
    const p = this.player
    // MULTIJOUEUR : réanime l'ALLIÉ MORT le plus proche (vraie cible du sort : on relève un coéquipier tombé).
    const ally = this.findDeadAlly()
    if (ally) {
      ally.dead = false
      this.applyResurrect(ally)
      this.floatingText(p.x, p.y - 18, 'Allié réanimé !', '#ffe9a0')
      return true
    }
    // SOLO (aucun allié à proximité) : auto-résurrection -> à la prochaine mort, le héros se relève (cf. handleDeath).
    if (p.reviveCharge) { this.floatingText(p.x, p.y - 18, 'Déjà béni', '#ffd27a'); return false }
    p.reviveCharge = true
    const circle = this.add.sprite(p.x, p.y, 'fx_magic_circle').setDepth(p.y - 1).setScale(2.2).setTint(0xfff0a0).setAlpha(0.95)
    if (this.anims.exists('fx-magic-circle')) circle.play('fx-magic-circle')
    const aura = this.add.sprite(p.x, p.y - 2, 'fx_aura').setDepth(p.y + 6).setScale(2.2).setTint(0xfff0a0)
    if (this.anims.exists('fx-aura')) { aura.play('fx-aura'); aura.once('animationcomplete', () => aura.destroy()) } else aura.destroy()
    // motes de lumière dorées qui montent (bénédiction)
    for (let k = 0; k < 8; k++) {
      const mote = this.add.circle(p.x + Phaser.Math.Between(-12, 12), p.y + 6, Phaser.Math.Between(1, 2), 0xfff3b0, 0.95).setDepth(p.y + 61)
      this.tweens.add({ targets: mote, y: p.y - Phaser.Math.Between(22, 38), alpha: 0, duration: Phaser.Math.Between(750, 1150), delay: k * 70, ease: 'Sine.out', onComplete: () => mote.destroy() })
    }
    this.time.delayedCall(2500, () => this.tweens.add({ targets: circle, alpha: 0, duration: 400, onComplete: () => circle.destroy() }))
    Audio.sfx(SFX.heal, { vol: 0.75 })
    this.floatingText(p.x, p.y - 20, 'Bénédiction de résurrection', '#ffe9a0')
    return true
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
    if (this.inInterior) return // pas de tir (clic droit inclus) dans un intérieur
    if (this.sailBlocked()) return // pas de tir en navigation
    if (!p.abilities.ranged) return // classe sans sort à distance (Guerrier/Tank)
    if (p.attacking || p.hp <= 0) return
    if (!p.startShoot(this.time.now)) return

    const dx = tx - p.x
    const dy = ty - p.y
    if (Math.abs(dx) > Math.abs(dy)) p.facing = dx < 0 ? 'left' : 'right'
    else p.facing = dy < 0 ? 'up' : 'down'

    const proj = this.projectiles.get(p.x, p.y)
    if (!proj) return
    proj.fromClone = null // tir du JOUEUR (réinitialise un éventuel marquage de clone du pool)
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
    proj.dieOnWater = true // ne traverse pas l'eau
    const def = boss.def || {}
    const dmg = Math.round((def.projDamage ?? 14) * (boss.dmgScale ?? 1)) // boss = stats fixes (dmgScale, plus lvlMul)
    const fx = { anim: 'fx-fireball', tex: 'fx_fireball', scale: 1.6 } // boule de feu ROUGE (asset du pack, pas de teinte)
    // léger biais d'avance : on vise un peu DEVANT le joueur s'il bouge (rend l'esquive moins triviale,
    // mais sans homing -> un changement de direction franc évite l'orbe).
    const lead = 90 // ms d'anticipation
    const tx = player.x + (player.body?.velocity.x ?? 0) * (lead / 1000)
    const ty = player.y + (player.body?.velocity.y ?? 0) * (lead / 1000)
    proj.fire(boss.x, boss.y - 6, tx, ty, dmg, this.time.now, null, 0xffffff, fx, def.projSpeed ?? 155)
    Audio.sfx(SFX.magic, { vol: 0.5, detune: -300 }) // "blop" magique grave
  }

  /** Tir d'un MOB normal (def.mobAtk type 'shoot') : projectile ESQUIVABLE (pas de homing, léger lead). */
  mobFireProjectile(mon, player, cfg) {
    if (!mon?.active || mon.hp <= 0 || !player?.active || player.hp <= 0) return
    const proj = this.enemyProjectiles.get(mon.x, mon.y)
    if (!proj) return
    proj.dieOnWater = true // ne traverse pas l'eau (anti-tir à travers une rivière)
    const dmg = Math.max(1, Math.round(mon.damage * (cfg.dmgMul ?? 1)))
    const fx = cfg.fx ?? { tex: 'fx_energyball', anim: 'fx-energyball', tint: true, scale: 1 }
    const lead = cfg.lead ?? 80 // léger biais d'avance -> esquive moins triviale mais possible
    const tx = player.x + (player.body?.velocity.x ?? 0) * (lead / 1000)
    const ty = player.y + (player.body?.velocity.y ?? 0) * (lead / 1000)
    proj.fire(mon.x, mon.y - 4, tx, ty, dmg, this.time.now, null, cfg.projTint ?? 0xffffff, fx, cfg.projSpeed ?? 165)
    Audio.sfx(SFX.magic, { vol: 0.4, detune: cfg.sfxDetune ?? -120 })
  }

  /** Cercle de danger au sol pendant le télégraphe d'une attaque de ZONE d'un mob (def.mobAtk type 'zone'). */
  mobZoneTelegraph(x, y, cfg) {
    const r = cfg.hitRadius ?? 40
    const col = cfg.color ?? 0xff7a3a
    const zone = this.add.circle(x, y, r, col, 0.16).setDepth(y - 2)
    const ring = this.add.circle(x, y, r, col, 0).setStrokeStyle(2, col, 0.85).setDepth(y - 1)
    this.tweens.add({ targets: zone, fillAlpha: 0.4, duration: (cfg.windup ?? 500) / 2, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.time.delayedCall((cfg.windup ?? 500) + 90, () => { this.tweens.killTweensOf(zone); zone.destroy(); ring.destroy() })
  }

  /** Impact d'une attaque de ZONE d'un mob : onde qui s'étend + dégâts au joueur s'il est dans le rayon. */
  mobZoneImpact(mon, x, y, cfg) {
    const r = cfg.hitRadius ?? 40
    const col = cfg.color ?? 0xff7a3a
    const wave = this.add.circle(x, y, 8).setStrokeStyle(5, col, 0.95).setDepth(y + 1)
    this.tweens.add({ targets: { v: 0 }, v: 1, duration: 320, ease: 'Cubic.out', onUpdate: (tw, t) => { wave.setRadius(8 + (r - 8) * t.v); wave.setAlpha(0.9 * (1 - t.v)) }, onComplete: () => wave.destroy() })
    if (this.dist(this.player.x, this.player.y, x, y) <= r) { this.player.takeDamage(Math.round(mon.damage * (cfg.dmgMul ?? 1.4)), this.time.now); this.flashHurt() }
    Audio.sfx(SFX.hit, { vol: 0.5, detune: -200 })
  }

  /** DÉLUGE d'un boss (Tengu) : une VOLÉE de boules de feu en éventail vers le joueur (sans homing ->
   *  esquivable en se décalant). Le nombre/écartement/dégâts viennent de def.barrage. */
  bossFireBarrage(boss, player) {
    if (!boss?.active || boss.hp <= 0 || !player?.active || player.hp <= 0) return
    const b = boss.def?.barrage || {}
    const shots = b.shots ?? 5
    const gap = b.gap ?? 0.3 // ÉCART angulaire entre deux orbes (radians) -> espace pour se faufiler ENTRE
    const speed = b.projSpeed ?? 150
    const dmg = Math.round((b.projDamage ?? 9) * (boss.dmgScale ?? 1))
    const base = Math.atan2(player.y - boss.y, player.x - boss.x)
    const fx = { anim: 'fx-fireball', tex: 'fx_fireball', scale: 1.5 }
    for (let i = 0; i < shots; i++) {
      const ang = base + (i - (shots - 1) / 2) * gap // orbes régulièrement espacés autour de la visée
      const proj = this.enemyProjectiles.get(boss.x, boss.y)
      if (!proj) continue
      proj.dieOnWater = true // ne traverse pas l'eau
      proj.fire(boss.x, boss.y - 6, boss.x + Math.cos(ang) * 200, boss.y + Math.sin(ang) * 200, dmg, this.time.now, null, 0xffffff, fx, speed)
    }
    Audio.sfx(SFX.magic, { vol: 0.6, detune: -150 })
    this.cameras.main.shake(120, 0.004)
  }

  /** TRANSFORMATION (fureur) d'un boss à 50 % PV : flash rouge + onde + rugissement + annonce. Le boost de
   *  stats est appliqué côté Monster ; ici on ne fait que le retour visuel/sonore. */
  bossEnrage(boss) {
    this.cameras.main.shake(320, 0.009)
    Audio.sfx('sfx_roar', { vol: 0.95, rate: 0.7, detune: -150 })
    boss.setTintFill(0xff5030)
    this.time.delayedCall(170, () => boss.active && boss.clearTint())
    const ring = this.add.circle(boss.x, boss.y, 10, 0xff5030, 0).setStrokeStyle(4, 0xff5030, 0.9).setDepth(boss.y + 2)
    this.tweens.add({
      targets: { v: 0 }, v: 1, duration: 520, ease: 'Cubic.out',
      onUpdate: (tw, t) => { ring.setRadius(10 + 64 * t.v); ring.setAlpha(0.9 * (1 - t.v)) },
      onComplete: () => ring.destroy(),
    })
    this.scene.get('UIScene')?.showToast?.(`${boss.displayName ?? boss.def?.name ?? 'Le boss'} entre en FUREUR !`, '#ff6b6b')
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
  /** Échelle pour qu'une arme s'affiche à `targetPx` de haut à l'écran, quelle que soit sa taille native
   *  (sprites d'armes hétérogènes : Ninja ~16px, Admurin rognés ~18-20px) -> taille proportionnée au héros. */
  weaponScale(iconKey, targetPx) {
    const img = this.textures.get(iconKey)?.getSourceImage?.()
    const native = img ? Math.max(img.width, img.height) : 16
    return targetPx / native
  }

  /** Lueur de RARETÉ derrière une arme affichée : copie teintée (épique=violet, légendaire=or) en mode
   *  ADD qui suit le sprite. Renvoie le sprite de lueur (ou null si arme commune/rare). + JOUE le son spécial. */
  weaponRarityFlair(sprite, iconKey, withSound = true) {
    const weapon = this.player?.equipped?.weapon
    const r = weapon?.rarity
    if (r !== 'epic' && r !== 'legendary') return null
    const tint = RARITY[r]?.tint ?? 0xffffff
    const glow = this.add.image(sprite.x, sprite.y, iconKey).setScale(sprite.scaleX * 1.05).setRotation(sprite.rotation).setDepth(sprite.depth - 1).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85)
    if (withSound) {
      if (r === 'legendary') Audio.sfx('sfx_spirit', { vol: 0.4 })
      else Audio.sfx(SFX.magic, { vol: 0.32 })
    }
    return glow
  }

  showWeaponSwing(px, py, facing, iconKey) {
    const center = { right: 0, down: 90, left: 180, up: -90 }[facing] ?? 0
    const SWING = 80 // amplitude de l'arc (degrés)
    const r = 15 // distance de la lame au héros (PORTÉE conservée)
    this._heldHideUntil = this.time.now + 170 // cache l'arme tenue le temps du coup, puis elle revient
    const hs = this.player?.equipped?.weapon?.heldScale ?? 1
    const w = this.add.image(px, py, iconKey).setDepth(py + 51).setScale(this.weaponScale(iconKey, 22) * hs) // ~22px à l'écran
    const glow = this.weaponRarityFlair(w, iconKey) // lueur épique/légendaire + son
    const st = { a: center - SWING / 2 }
    const place = () => {
      const rad = Phaser.Math.DegToRad(st.a)
      const x = px + Math.cos(rad) * r, y = py + Math.sin(rad) * r, rot = rad + Phaser.Math.DegToRad(90)
      w.setPosition(x, y).setRotation(rot) // sprite d'arme VERTICAL (pointe en haut) -> aligné sur l'arc
      glow?.setPosition(x, y).setRotation(rot)
    }
    place()
    this.tweens.add({ targets: st, a: center + SWING / 2, duration: 150, ease: 'Quad.easeInOut', onUpdate: place, onComplete: () => { w.destroy(); glow?.destroy() } })
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
   *  SUIT le joueur tant qu'elle est affichée (sinon elle reste sur place quand on tire en courant).
   *  Elle NE pivote PAS vers le curseur/l'ennemi (la visée auto faisait "tourner" l'arme = moche). */
  showWeaponPoint(px, py, facing, iconKey) {
    const p = this.player
    this._heldHideUntil = this.time.now + 200 // cache l'arme tenue le temps du tir, puis elle revient
    const hs = p.equipped?.weapon?.heldScale ?? 1
    const w = this.add.image(p.x + 5, p.y + 1, iconKey).setScale(this.weaponScale(iconKey, 18) * hs).setRotation(-0.3)
    const glow = this.weaponRarityFlair(w, iconKey) // lueur épique/légendaire + son
    const st = { t: 0 }
    const ev = this.time.addEvent({ delay: 16, loop: true, callback: () => {
      st.t += 16
      const poke = Math.sin(Math.min(1, st.t / 90) * Math.PI) * 5 // "poke" vers le haut (aller-retour)
      const x = p.x + 5, y = p.y + 1 - poke
      w.setPosition(x, y).setDepth(p.y + 51)
      glow?.setPosition(x, y).setDepth(p.y + 50)
      if (st.t >= 180) { ev.remove(); w.destroy(); glow?.destroy() }
    } })
  }

  onMonsterKilled(mon) {
    this.player.gainXp(mon.xpReward ?? mon.def.xp)
    if (mon.isBoss) {
      this.onBossKilled(mon)
      return
    }
    this.spawnDrop(mon)
    this.questKill(mon) // progression d'une quête TUER
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
    Audio.playVictory(this, 'mus_victory') // jingle de victoire (coupe le thème de combat, puis la zone reprend)
    this.questKill(mon) // progression d'une quête « battre un boss » (cible = clé du boss, count 1)

    // butin de BOSS : UN SEUL légendaire (biaisé classe) + 2 objets épiques/rares + gros or + gros soin
    const cls = this.player.className
    this.drops.add(new Drop(this, mon.x, mon.y - 2, 'equip', 0, this.equipmentOfTier('legendary', cls)))
    this.drops.add(new Drop(this, mon.x - 16, mon.y + 4, 'equip', 0, this.equipmentOfTier('epic', cls)))
    this.drops.add(new Drop(this, mon.x + 16, mon.y + 4, 'equip', 0, this.equipmentOfTier(Math.random() < 0.5 ? 'epic' : 'rare', cls)))
    const gold = Phaser.Math.Between(120, 240) + mon.level * 20
    this.drops.add(new Drop(this, mon.x, mon.y + 10, 'gold', gold))
    this.drops.add(new Drop(this, mon.x, mon.y - 10, 'heart', Math.max(20, Math.round(this.player.maxHp * 0.5))))
    this.trySetPieceDrop(mon) // pièce de PANOPLIE (selon biome/raid + classe) avec pity anti-malchance

    // annonce + respawn long (boss de monde : ~8-10 min)
    this.scene.get('UIScene')?.showToast?.(`⚔ ${mon.displayName} vaincu !`, '#ffd86b')
    const biome = mon.bossBiome
    const index = mon.bossIndex ?? 0
    this.time.delayedCall(Phaser.Math.Between(480000, 600000), () => {
      if (!this.gameOver) this.spawnBoss(biome, index)
    })
  }

  /** Drop d'une PIÈCE DE PANOPLIE (brief §2) selon le biome du boss + la classe du joueur :
   *  forêt→Armure · désert→Relique · neige→Anneau · raid neige→Arme. Chance ~30 % + PITY (garanti après
   *  5 boss sans la pièce). Jamais de doublon (si déjà possédée). Cursed=Dargoth (légendaire).
   *  ⚠️ Les 4 pièces viennent de boss SOLOABLES (panoplie complétable solo) : l'ARME = le Kraken de la
   *  CÔTE (`squidred`, boss solo à distance), PAS le raid neige (intuable solo). */
  trySetPieceDrop(mon) {
    const p = this.player
    const PREFIX = { warrior: 'war', tank: 'tank', mage: 'mage', healer: 'heal' }[p.className]
    if (!PREFIX) return
    let slot = null
    if (mon.bossBiome === 'forest') slot = 'armor'
    else if (mon.bossBiome === 'desert') slot = 'relic'
    else if (mon.bossBiome === 'snow') slot = 'ring'
    else if (mon.bossBiome === 'coast') slot = 'weapon' // Kraken (solo) -> arme de set
    if (!slot) return
    const id = `set_${PREFIX}_${slot}`
    const item = ITEMS[id]
    if (!item) return
    // déjà possédée (équipée ou dans le sac) -> on ne la redonne pas
    if (p.equipped[item.slot]?.id === id || p.inventory.some((it) => it?.id === id)) return
    const PITY_MAX = 5, CHANCE = 0.3
    const seen = p.setPity[id] ?? 0
    if (Math.random() < CHANCE || seen + 1 >= PITY_MAX) {
      p.setPity[id] = 0
      this.drops.add(new Drop(this, mon.x, mon.y - 14, 'equip', 0, cloneItem(item)))
      this.scene.get('UIScene')?.showToast?.(`✦ Pièce de panoplie : ${item.name} !`, '#3ddc84')
    } else {
      p.setPity[id] = seen + 1
    }
  }

  /** Fait apparaître le butin sur le cadavre. Drops SERRÉS (brief §9c) : OR à chaque kill, mais
   *  l'ÉQUIPEMENT ne tombe qu'à faible probabilité, avec une rareté pondérée (les bons objets se
   *  méritent). L'élite : drop garanti + 1 cran de rareté. (Légendaire = boss uniquement.) */
  spawnDrop(mon) {
    const loot = mon.def.loot
    const lvlMul = mon.lvlMul ?? 1
    const lvl = mon.level ?? 1
    // OR (toujours)
    const g = Math.max(1, Math.round(Phaser.Math.Between(loot.gold[0], loot.gold[1]) * lvlMul * (mon.elite ? 3 : 1)))
    this.drops.add(new Drop(this, mon.x + 6, mon.y + 4, 'gold', g))
    // MATÉRIAU (table par espèce) : drop fréquent, va dans la poche de ressources (empilable)
    if (loot.mat && ITEMS[loot.mat] && Math.random() < (loot.matChance ?? 0)) {
      this.drops.add(new Drop(this, mon.x - 8, mon.y + 6, 'equip', 0, cloneItem(ITEMS[loot.mat])))
    }
    // ÉQUIPEMENT. ÉLITE = drop ÉPIQUE GARANTI (biaisé classe), rare seulement en zone de bas niveau (≤2).
    // Mob normal : faible proba, rareté pondérée + scaling de zone, smart loot MIX (60 % classe).
    if (mon.elite) {
      // ÉLITE : item DÉDIÉ à l'espèce (épique, universel) en zone normale ; en zone de bas niveau (≤2) on
      // reste sur un rare générique (pacing début de jeu). Item dédié = récompense unique propre à la famille.
      const eliteId = ELITE_DROP[mon.typeKey]
      const item = (lvl > 2 && eliteId && ITEMS[eliteId])
        ? cloneItem(ITEMS[eliteId])
        : this.equipmentOfTier(lvl <= 2 ? 'rare' : 'epic', this.player.className)
      this.drops.add(new Drop(this, mon.x, mon.y, 'equip', 0, item))
    } else if (Math.random() < (loot.gear ?? 0.18)) {
      const tier = this.rollDropRarity(lvl)
      this.drops.add(new Drop(this, mon.x, mon.y, 'equip', 0, this.equipmentOfTier(tier, this.player.className)))
    }
  }

  /** Tire une rareté de drop pondérée. SCALING DE ZONE : plus le mob est de haut niveau (1→5 par
   *  distance), plus les bonnes raretés montent. Le Légendaire ne tombe JAMAIS ici (boss only). */
  rollDropRarity(level = 1) {
    const t = Phaser.Math.Clamp((level - 1) / (MONSTER_MAX_LEVEL - 1), 0, 1) // 0 au niv1 -> 1 au niv max (6)
    const epic = level <= 2 ? 0 : Math.max(0, 44 * t - 6) // AUCUN épique aux niv 1-2 ; monte ensuite jusqu'à ~38 % au niv max (se MÉRITE en zone lointaine)
    const rare = 22 + 13 * t // 22 % -> 35 %
    const r = Math.random() * 100
    if (r < epic) return 'epic' // = Épique (violet) — jamais sur un mob de bas niveau
    if (r < epic + rare) return 'rare' // = Rare (bleu)
    return level >= 5 ? 'rare' : 'common' // niv 5-6 (zones end-game) : plus aucun commun, le plancher = Rare (bleu)
  }

  /** Renvoie une COPIE d'un ÉQUIPEMENT de rareté `tier`. `biasClass` (smart loot MIX) : 60 % du temps on
   *  restreint aux objets utilisables par la classe (les ARMES surtout ; armure/focus/anneau restent universels). */
  equipmentOfTier(tier, biasClass = null) {
    let pool = Object.values(ITEMS).filter((it) => it.rarity === tier && it.slot && !it.ranged && !it.set && !it.craftedOnly && !it.eliteOnly) // slot = équipement ; lancer/set/forgé/élite = exclus du butin normal
    if (pool.length === 0) pool = Object.values(ITEMS).filter((it) => it.slot && !it.ranged && !it.set && !it.craftedOnly && !it.eliteOnly) // garde-fou
    if (biasClass && Math.random() < 0.6) {
      const usable = pool.filter((it) => !it.classes || it.classes.includes(biasClass))
      if (usable.length) pool = usable
    }
    return cloneItem(Phaser.Utils.Array.GetRandom(pool))
  }

  /** Applique l'effet d'un drop ramassé + texte flottant, puis le retire. */
  collectDrop(drop) {
    if (drop.pickableAt && this.time.now < drop.pickableAt) return // pas encore ramassable (objet lâché à l'instant)
    const p = this.player
    // SAC PLEIN (cap strict) : l'équipement reste au sol (sauf MATÉRIAU -> poche de ressources à part).
    if (drop.type === 'equip' && drop.item?.type !== 'material' && !p.canAccept(drop.item)) {
      this.scene.get('UIScene')?.showBagFull?.()
      return
    }
    if (!drop.collect()) return // déjà ramassé/expiré
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
      Audio.sfx('sfx_pickup', { vol: 0.5, detune: 0 })
      return // le chiffre vert est déjà affiché par heal() — pas de double texte
    } else if (drop.type === 'equip') {
      const it = drop.item
      if (it?.type === 'material') {
        // MATÉRIAU : empilé dans la poche de ressources (pas dans le sac)
        p.addResource(it.id)
        text = `${it.name} (${p.resources[it.id]})`
        color = RARITY[it.rarity]?.color ?? '#cfe8ff'
        Audio.sfx('sfx_pickup', { vol: 0.5, detune: 0 })
      } else {
        p.addItem(it)
        text = it.name
        color = itemColor(it)
        Audio.sfx('sfx_loot', { vol: 0.6, detune: 0 }) // équipement = son plus marquant
        this.scene.get('UIScene')?.showItemToast?.('Obtenu', it) // toast HUD lisible
      }
    }
    this.floatingText(drop.x, drop.y, text, color)
  }

  /** Lâche un objet du sac sur le sol, aux pieds du héros (appelé par l'UI, sac plein -> faire de la place).
   *  Délai anti-reprise immédiate : on peut s'éloigner avant qu'il ne soit ramassable. */
  dropItemOnGround(item) {
    const p = this.player
    if (!p) return
    const d = new Drop(this, p.x + Phaser.Math.Between(-6, 6), p.y + 9, 'equip', 0, item, 1000)
    this.drops.add(d)
    this.floatingText(p.x, p.y - 4, 'Lâché', '#cdd6e0')
  }

  /** Vrai si (x,y) est sur une tuile d'eau qui bloque (océan/rivière, hors pont). */
  isOnWater(x, y) {
    const t = this.waterLayer?.getTileAtWorldXY(x, y)
    return !!(t && t.collides)
  }

  /** Affiche la barque sous le héros quand il a le bateau ET navigue sur l'eau (sinon la cache).
   *  Met aussi à jour `player.sailing` (= en navigation -> attaques bloquées) et l'orientation du bateau. */
  updateBoat() {
    if (!this.boatSprite) return
    const p = this.player
    p.sailing = p.hasBoat && this.isOnWater(p.x, p.y)
    if (p.sailing) {
      // ORIENTATION 4 DIRECTIONS selon le cap du héros (bateau vu de côté, proue à droite par défaut) :
      // gauche = miroir (reste à l'endroit), haut/bas = rotation ±90°.
      if (p.facing === 'left') this.boatSprite.setFlipX(true).setRotation(0)
      else if (p.facing === 'right') this.boatSprite.setFlipX(false).setRotation(0)
      else if (p.facing === 'up') this.boatSprite.setFlipX(false).setRotation(-Math.PI / 2)
      else this.boatSprite.setFlipX(false).setRotation(Math.PI / 2) // down
      this.boatSprite.setVisible(true).setPosition(p.x, p.y + 5).setDepth(p.y - 1)
      // le héros reste ASSIS dans la barque : pose idle figée (ni marche ni pas — voir Player.update)
      p.anims.play(`${p.heroKey}-idle-${p.facing}`, true)
    } else if (this.boatSprite.visible) {
      this.boatSprite.setVisible(false).setRotation(0).setFlipX(false)
    }
  }

  /** Vrai (et affiche un message throttlé) si le joueur NAVIGUE : aucune attaque possible en bateau
   *  (sinon on pourrait battre les boss depuis l'eau, hors de leur portée). */
  sailBlocked() {
    if (!this.player?.sailing) return false
    const now = this.time.now
    if (now >= (this._sailMsgAt || 0)) {
      this._sailMsgAt = now + 1500
      this.scene.get('UIScene')?.showToast?.('Impossible d\'attaquer en bateau', '#9fc4e0')
    }
    return true
  }

  /** Petit texte qui monte et s'efface (ramassage, soin, chiffres de dégâts...).
   *  `opts` : { size (px), rise (montée px), duration (ms) }. */
  floatingText(x, y, text, color, opts = {}) {
    const t = this.add
      .text(x, y - 8, text, {
        fontFamily: FONT,
        fontSize: `${opts.size ?? 9}px`,
        fontStyle: opts.size ? 'bold' : 'normal',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20000)
    this.tweens.add({ targets: t, y: t.y - (opts.rise ?? 14), alpha: 0, duration: opts.duration ?? 800, onComplete: () => t.destroy() })
  }

  /** Chiffre de dégâts qui jaillit au-dessus d'une entité touchée (léger décalage aléatoire anti-chevauchement). */
  floatingDamage(target, amount, color) {
    const n = Math.round(amount)
    if (n <= 0 || !target) return
    const top = target.y - (target.displayHeight || 16) / 2 - 2
    this.floatingText(target.x + Phaser.Math.Between(-5, 5), top, `${n}`, color, { size: 12, rise: 20, duration: 700 })
  }

  onLevelUp() {
    const p = this.player
    const t = this.add
      .text(p.x, p.y - 18, 'NIVEAU ' + p.level + ' !', {
        fontFamily: FONT,
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
    if (this.inInterior) { this.updateInterior(time, delta); return } // dans un bâtiment : monde extérieur gelé
    this.player.update(time)
    const p = this.player
    p.setDepth(p.y)
    // ENTRÉE AUTOMATIQUE au CONTACT de la porte (taverne/apothicaire) — aucun message ni bouton.
    // _promptDismissed (posé à la sortie) évite la ré-entrée immédiate : il faut s'éloigner puis revenir.
    // ENTRÉE : le joueur touche le CARRÉ INVISIBLE de la porte (overlap AABB) -> il entre. Aucun message.
    // _promptDismissed (posé à la sortie) évite la ré-entrée immédiate : il faut sortir du carré puis y revenir.
    let nearDoor = null
    const pb = p.body
    for (const e of this.buildingEntrances || []) {
      if (!e.zone) continue // tout bâtiment avec un carré d'entrée est enterable (tavern/apothicaire/auberge/forge/marchand/maison/banque)
      const zb = e.zone.body
      if (pb.x + pb.width > zb.x && pb.x < zb.x + zb.width && pb.y + pb.height > zb.y && pb.y < zb.y + zb.height) { nearDoor = e; break }
    }
    if (nearDoor && !this.uiBusy() && !this.inInterior) { if (this._promptDismissed !== nearDoor.id) this.enterInterior(nearDoor.id, nearDoor) }
    else if (!nearDoor) { this._promptDismissed = null }
    this.updateHeldWeapon() // arme tenue en main (cachée pendant l'attaque, revient après)
    this.updateBoat() // barque sous le héros quand il navigue (A3)
    this.updateQuicksand(time) // sables mouvants du désert : aspiration + dégâts (après player.update)
    this.updateTarget(time) // réticule de la cible verrouillée + libération si elle meurt
    this.revealFog(p.x, p.y) // brouillard de guerre : dévoile la carte/minimap autour du joueur
    this.updateFogFade(delta) // fondu de découverte : l'opacité des zones fraîchement vues passe de 100 à 0 sur ~2 s
    // récupération du sac de mort (A1) : il faut d'abord s'en éloigner (armement), puis remarcher dessus
    if (p.deathBag && this.deathBagSprite) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, this.deathBagSprite.x, this.deathBagSprite.y)
      if (d > 40) this._bagArmed = true // on s'est éloigné -> le sac est désormais ramassable
      if (this._bagArmed && d < 14) this.recoverDeathBag()
    }

    this.updateArena() // arène de boss : verrouillage de proximité + mur invisible

    this.monsters.getChildren().forEach((mon) => {
      mon.update(time, p)
      this.keepMonsterOutOfPrairie(mon) // mur invisible (MOBS only) au bord de la prairie
      this.keepMonsterOutOfArena(mon) // mur invisible (MOBS only) au bord de l'arène de boss active
      this.keepMonsterOffBridge(mon) // les mobs ne marchent pas sur les ponts/gués (pas de traversée de rivière)
      mon.setDepth(mon.y)
    })
    this.seaDragon?.update(time, p) // dragon de mer d'ambiance (orbite autour de l'île)
    this.updateMageClones(time) // clones du Mage (Image miroir) : tir + barre de vie + expiration
    if (p.charging2) { // Charge du Tank : la bulle suit, fin au bout de 4 s
      this.tankChargeFx?.setPosition(p.x, p.y).setDepth(p.y + 61)
      if (time >= p.chargeUntil) this.endTankCharge()
    }

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

    this.updateDayNight(time) // cycle jour/nuit (20 min) : voile de nuit + dayDarkness
    this.updateTemperature(biome, time, delta) // froid neige / chaud désert : dérive + ralenti + dégâts
    this.updateFoodBuff(time) // buff de repas/élixir : régén PV/s + expiration (retire ATQ/DÉF)
    this.updateSnowfall(biome) // chute de neige (particules) dans le biome neige
    this.updateWeather(time, biome, p) // CYCLE pluie (biomes tempérés) + feuilles en forêt + traînée d'herbe au pas
    this.updateCampfires(time) // foyers posés : animation + extinction (zone-refuge de température)

    // musique : un boss engagé impose un thème de combat (tiré au hasard au début du combat,
    // gardé jusqu'au désengagement), sinon la musique de la zone. playMusic court-circuite si
    // le morceau voulu joue déjà -> pas de coût par frame.
    if (this.activeBoss) {
      // boss de RAID (très durs, intuables solo) = thème dédié ; boss normaux = un des 3 thèmes au hasard
      if (!this.bossTrack) this.bossTrack = this.activeBoss.isRaid ? 'mus_boss_raid' : Phaser.Utils.Array.GetRandom(BOSS_MUSIC)
      Audio.playMusic(this, this.bossTrack)
    } else {
      this.bossTrack = null
      let track = MUSIC_BY_BIOME[biome] || 'mus_village'
      // thème NOCTURNE de zone (forêt, terres maudites) : prend le relais la nuit (fondu via playMusic).
      // Hystérésis (0.42↔0.5) pour ne pas osciller à la frontière jour/nuit.
      const nightTrack = NIGHT_MUSIC[biome]
      if (nightTrack) {
        const dark = this.dayDarkness ?? 0
        const playingNight = Audio.curKey === nightTrack
        track = playingNight ? (dark < 0.42 ? track : nightTrack) // reste nocturne jusqu'à dark<0.42
          : (dark > 0.5 ? nightTrack : track) // bascule en nocturne au-delà de 0.5
      }
      Audio.playMusic(this, track)
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

    this.updateNpcs(time, delta) // villageois (statiques) + PNJ baladeurs de la prairie
    this.updateBuildingQuestMarks() // ! / ? au-dessus de l'auberge quand Mira a une quête (les quêtes se donnent à la réception)

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

  /** Petit nuage de poussière sous les pieds du héros à chaque pas, teinté selon le biome (sable au désert,
   *  neige en hiver, terre ailleurs). Joué une fois puis détruit. */
  spawnFootDust(x, y) {
    const b = this.biomeAt(Math.floor(x / TILE), Math.floor(y / TILE))
    const tint = b === 'desert' ? 0xe8c987 : b === 'snow' ? 0xeaf3ff : b === 'cursed' ? 0x9a8aa0 : 0xcdbf9a
    const d = this.add.sprite(x, y + 6, 'fx_dust').setDepth(y - 1).setScale(0.8).setAlpha(0.7).setTint(tint)
    d.play('fx-dust')
    d.once('animationcomplete', () => d.destroy())
  }

  /** BUFF DE REPAS / ÉLIXIR : applique la régénération PV/s tant que le buff est actif, et à l'expiration
   *  le remet à zéro + recalcule les stats (retire le +ATQ/+DÉF). Le +ATQ/+DÉF lui-même est lu dans recomputeStats. */
  updateFoodBuff(time) {
    const p = this.player
    const fb = p?.foodBuff
    if (!fb || !fb.until) return
    if (time >= fb.until) { // buff expiré -> on l'efface et on recalcule (sinon le +ATQ/+DÉF resterait dans les stats)
      p.foodBuff = { atk: 0, def: 0, regen: 0, until: 0 }
      p.recomputeStats()
      this.scene.get('UIScene')?.showToast?.('Effet du repas dissipé', '#c9b48a')
      return
    }
    if (fb.regen > 0 && time >= (this._nextFoodRegen || 0)) { // régén : une bouffée de soin par seconde (1 chiffre vert/s, pas de spam)
      this._nextFoodRegen = time + 1000
      if (p.hp < p.maxHp) p.heal(fb.regen)
    }
  }

  /** TEMPÉRATURE : fait dériver la jauge du joueur vers l'extrême du biome (neige=froid, désert=chaud),
   *  atténuée par les items de résistance, puis applique le ralenti progressif et les dégâts au max. */
  updateTemperature(biome, time, delta) {
    const p = this.player
    if (!p || p.hp <= 0 || p.sailing) { if (p) p.envSpeedMul = 1; return }
    const inBiome = biome === 'snow' || biome === 'desert'
    // potions actives : feu = immunité au FROID, givre = immunité au CHAUD (cf. items potion_fire/frost)
    const fireOn = time < (p.tempBuff?.fire ?? 0)
    const frostOn = time < (p.tempBuff?.frost ?? 0)
    // CIBLE de température : pleine dans un biome extrême (atténuée par la résistance/potions) ; DOUCE
    // (tempérée) à la LISIÈRE (pont/bordure voisine) -> on sent venir le chaud/froid SANS pénalité.
    let target
    if (inBiome) {
      const raw = biome === 'snow' ? -TEMP_MAX : TEMP_MAX
      const coldRes = (p.coldResist ?? 0) + (fireOn ? 999 : 0)
      const heatRes = (p.heatResist ?? 0) + (frostOn ? 999 : 0)
      target = raw > 0 ? Math.max(0, raw - heatRes) : Math.min(0, raw + coldRes)
    } else {
      target = this.nearHostileBiome(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) * TEMP_NEAR // -1 neige / +1 désert / 0
      if (target < 0 && fireOn) target = 0 // potion de feu -> pas de froid de lisière
      if (target > 0 && frostOn) target = 0 // potion de givre -> pas de chaleur de lisière
    }
    // NUIT : il fait plus froid (renforce la température) -> décale la cible vers le froid. La potion de feu
    // (immunité au froid) annule ce refroidissement. neige plus dure / désert qui se rafraîchit / léger frais ailleurs.
    if (!fireOn && this.dayDarkness > 0) target = Phaser.Math.Clamp(target - this.dayDarkness * NIGHT_TEMP_SHIFT, -TEMP_MAX, TEMP_MAX)
    // FEU DE CAMP : un foyer RÉCHAUFFE -> il n'annule que le FROID (cible < 0). Aucun effet sur la chaleur du désert.
    if (target < 0 && this.nearCampfire(p.x, p.y)) target = 0
    const dt = Math.min(delta, 60) / 1000 // borne le pas (onglet en arrière-plan -> pas de saut géant)
    let temp = p.temp ?? 0
    const recovering = Math.abs(target) < Math.abs(temp)
    const rate = recovering ? TEMP_RECOVER : TEMP_DRIFT
    if (temp < target) temp = Math.min(target, temp + rate * dt)
    else if (temp > target) temp = Math.max(target, temp - rate * dt)
    p.temp = temp

    const a = Math.abs(temp)
    // ralenti progressif (0 à TEMP_SLOW_START -> max à TEMP_MAX)
    const slowT = Phaser.Math.Clamp((a - TEMP_SLOW_START) / (TEMP_MAX - TEMP_SLOW_START), 0, 1)
    p.envSpeedMul = 1 - TEMP_MAX_SLOW * slowT
    // BRÛLURE : le héros prend FEU seulement quand c'est TRÈS chaud (zone « Brûlant » = dégâts), pas dès « Chaud »
    this.updateBurnFx(p, temp > 0 && a >= TEMP_CHIP_START ? Phaser.Math.Clamp((a - TEMP_CHIP_START) / (TEMP_MAX - TEMP_CHIP_START), 0, 1) : 0)
    // DÉGÂTS : uniquement tant qu'on est DANS le biome hostile (en sortant on ne « gèle/brûle » plus, même
    // si la jauge est encore haute -> à l'abri = plus de dégâts immédiatement).
    const inDanger = inBiome && a >= TEMP_CHIP_START
    p.envDanger = inDanger // lu par l'UI pour le bandeau d'alerte
    if (inDanger) {
      const cold = temp < 0
      if (!this._tempDanger) { // entrée en zone critique -> message d'alerte (une fois)
        this._tempDanger = true
        this.scene.get('UIScene')?.showToast?.(
          cold ? '❄ Tu gèles ! Mets-toi à l’abri ou équipe une Cape de fourrure' : '☀ Tu brûles ! Mets-toi à l’abri ou équipe un Habit du désert',
          cold ? '#8fd0ff' : '#ff9a4a',
        )
      }
      if (time >= (this._tempChipAt ?? 0)) {
        this._tempChipAt = time + TEMP_CHIP_INTERVAL
        p.envHurt?.(TEMP_CHIP_DPS)
        p.setTintFill(cold ? 0x8fd0ff : 0xff6a2a)
        this.time.delayedCall(110, () => p.active && p.clearTint())
        this.cameras.main.shake(120, 0.005)
      }
    } else {
      this._tempChipAt = 0 // hors zone de danger -> prêt à re-piquer dès qu'on y retourne
      if (a < TEMP_SLOW_START) this._tempDanger = false // revenu au calme -> message réarmé
    }
  }

  /** Sables mouvants : si le héros est dans une zone, il est ASPIRÉ vers le centre (force constante) et
   *  ralenti (sable collant), avec dégâts progressifs tant qu'il y reste. Il s'en extrait en marchant vers
   *  l'extérieur (le dash du Guerrier le traverse). Appelé APRÈS player.update (qui a posé la vélocité). */
  updateQuicksand(time) {
    const p = this.player
    if (!this.quicksands?.length || !p || p.hp <= 0 || p.sailing || p.dashing) { this._qsIn = false; return }
    let q = null
    let best = Infinity
    for (const s of this.quicksands) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y)
      if (d < s.r && d < best) { best = d; q = s }
    }
    if (!q) { this._qsIn = false; return }
    const dx = q.x - p.x
    const dy = q.y - p.y
    const d = Math.hypot(dx, dy) || 1
    const b = p.body
    if (b) {
      b.velocity.x = b.velocity.x * 0.7 + (dx / d) * 22 // sable collant (×0.7) + aspiration douce vers le centre
      b.velocity.y = b.velocity.y * 0.7 + (dy / d) * 22
    }
    if (!this._qsIn) {
      this._qsIn = true
      this.scene.get('UIScene')?.showToast?.('🌀 Sables mouvants ! Bouge pour t’en extraire', '#d9b073')
    }
    if (time >= (this._qsHurtAt ?? 0)) {
      this._qsHurtAt = time + 700
      p.envHurt?.(4)
      p.setTintFill(0xd9b073)
      this.time.delayedCall(100, () => p.active && p.clearTint())
      this.cameras.main.shake(90, 0.004)
    }
  }

  /** Chute de neige : déplace la zone d'émission sur le bord HAUT de la vue (zone large centrée) et
   *  démarre/arrête l'émetteur selon qu'on est dans le biome neige. Les flocons déjà tombés finissent
   *  leur chute (fondu) en sortant du biome. */
  updateSnowfall(biome) {
    const e = this.snowEmitter
    if (!e) return
    const v = this.cameras.main.worldView
    e.setPosition(v.centerX - 450, v.y - 14) // zone large (900) centrée sur la vue
    const snowing = biome === 'snow'
    if (snowing && !e.emitting) e.start()
    else if (!snowing && e.emitting) { e.stop(); e.killAll() } // purge les flocons en vol -> plus de neige hors biome (ni à la mort)
  }

  /** Météo dynamique : CYCLE clair<->pluie (sur biomes tempérés) + éclaboussures, FEUILLES qui tombent en
   *  forêt, et TRAÎNÉE d'herbe quand le héros marche dans l'herbe/forêt. (La neige = biome neige, à part.) */
  updateWeather(time, biome, p) {
    // 1) CYCLE DE PLUIE (clair <-> pluie) sur biomes tempérés, avec PHASES averse (rapide/dense) / bruine (lente)
    if (this.rainEmitter) {
      if (this._weatherUntil == null) this._weatherUntil = time + 120000 // 2 min de beau temps au départ
      if (time >= this._weatherUntil) {
        this.raining = !this.raining
        // averse 30-45 s ; temps clair entre deux pluies 200-280 s
        this._weatherUntil = time + (this.raining ? Phaser.Math.Between(30000, 45000) : Phaser.Math.Between(200000, 280000))
        this._rainPhaseAt = 0 // relance le tirage d'intensité (pas d'annonce texte)
      }
      const showRain = !!this.raining && biome !== 'snow' && biome !== 'desert' && !p.sailing // pluie partout sauf désert + neige
      const e = this.rainEmitter
      const v = this.cameras.main.worldView
      e.setPosition(v.centerX - 300, v.y - 22) // zone large (600) en haut de la vue
      if (showRain) {
        if (!e.emitting) e.start()
        if (time >= (this._rainPhaseAt ?? 0)) { // alterne averse / bruine toutes les ~3-6 s
          this._rainPhaseAt = time + Phaser.Math.Between(3000, 6000)
          this._rainHeavy = !this._rainHeavy
          e.setFrequency(this._rainHeavy ? 12 : 55, this._rainHeavy ? 4 : 2)
        }
        if (time >= (this._splashAt ?? 0)) { this._splashAt = time + (this._rainHeavy ? 90 : 260); this.spawnRainSplash(); if (this._rainHeavy) this.spawnRainSplash() }
      } else if (e.emitting) { e.stop() }
    }
    // 2) FEUILLES qui tombent DES ARBRES en forêt (plus espacées)
    if (biome === 'forest' && time >= (this._leafAt ?? 0)) { this._leafAt = time + Phaser.Math.Between(1400, 2800); this.spawnLeaf() }
  }

  /** Éclaboussure de pluie au sol, à une position aléatoire de la vue. */
  spawnRainSplash() {
    const v = this.cameras.main.worldView
    const x = v.x + Math.random() * v.width
    const y = v.y + v.height * 0.35 + Math.random() * v.height * 0.62
    const s = this.add.sprite(x, y, 'wx_rainfloor').setDepth(y).setAlpha(0.6).setScale(1.1)
    if (this.anims.exists('wx-rainfloor')) { s.play('wx-rainfloor'); s.once('animationcomplete', () => s.destroy()) } else s.destroy()
  }

  /** Feuille qui tombe D'UN ARBRE de la vue (depuis la canopée vers le sol), en tournoyant + fondu en fin. */
  spawnLeaf() {
    const v = this.cameras.main.worldView
    const trees = (this.destructibles || []).filter((d) => d.x >= v.x - 24 && d.x <= v.right + 24 && d.y >= v.y - 24 && d.y <= v.bottom + 80)
    if (!trees.length) return // pas d'arbre en vue -> pas de feuille
    const t = Phaser.Utils.Array.GetRandom(trees)
    const x = t.x + Phaser.Math.Between(-12, 12)
    const y = t.y - Phaser.Math.Between(44, 70) // part de la canopée
    const leaf = this.add.sprite(x, y, 'wx_leaf').setDepth(y).setScale(1.3).setAlpha(0.95)
    if (this.anims.exists('wx-leaf')) leaf.play('wx-leaf')
    const sway = 10 + Math.random() * 18
    this.tweens.add({ targets: leaf, y: t.y + Phaser.Math.Between(2, 10), duration: 2600 + Math.random() * 1600, ease: 'Sine.in', onComplete: () => leaf.destroy() })
    this.tweens.add({ targets: leaf, x: x + (Math.random() < 0.5 ? -sway : sway), duration: 900 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.tweens.add({ targets: leaf, alpha: 0, delay: 1700, duration: 1100 }) // se fond au sol
  }

  /** Renvoie -1 si de la NEIGE est proche, +1 si du DÉSERT est proche, 0 sinon (échantillonne 8 directions
   *  à ~3 tuiles). Sert à pré-chauffer/refroidir doucement quand on longe un biome extrême (pont voisin). */
  nearHostileBiome(tx, ty) {
    const R = 3
    let res = 0
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      const b = this.biomeAt(Math.round(tx + Math.cos(ang) * R), Math.round(ty + Math.sin(ang) * R))
      if (b === 'snow') return -1 // priorité au froid s'il y a les deux
      if (b === 'desert') res = 1
    }
    return res
  }

  /** Petites flammes qui lèchent les PIEDS du héros quand il a trop chaud (intensité 0→1). Origine en bas
   *  (montent depuis le sol), petite échelle pour ne pas recouvrir tout le perso. Masquées à intensité 0. */
  updateBurnFx(p, intensity) {
    if (intensity <= 0) { this.burnFx?.setVisible(false); return }
    if (!this.burnFx) {
      this.burnFx = this.add.sprite(p.x, p.y, 'fx_flam').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).play('fx-flam')
    }
    this.burnFx.setVisible(true).setPosition(p.x, p.y + 8).setDepth(p.y + 1).setScale(0.42 + 0.28 * intensity).setAlpha(0.7 + 0.3 * intensity)
  }

  /** Pose un FEU DE CAMP temporaire à l'endroit du héros : foyer + flamme animée + halo chaud au sol.
   *  Crée une zone-refuge (cf. updateTemperature : la jauge revient au neutre à portée). 3 foyers max
   *  (le plus ancien s'éteint si on dépasse). Renvoie false si on ne peut pas (mort / en bateau). */
  placeCampfire(item) {
    if (this.gameOver || this.player?.sailing) return false
    this.campfires ||= []
    if (this.campfires.length >= 3) this.extinguishCampfire(this.campfires.shift(), 300) // remplace le plus vieux
    const x = Math.round(this.player.x)
    const y = Math.round(this.player.y)
    const radius = item?.fireRadius ?? 64
    const dur = item?.fireDur ?? 90000
    const seed = this.campfires.length * 1.7
    const glow = this.add.circle(x, y + 4, radius, 0xff7a1a, 0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(y - 1)
    const sprite = this.add.image(x, y, 'campfire').setOrigin(0.5, 0.82).setScale(1.5).setDepth(y)
    const flame = this.add.sprite(x, y - 10, 'fx_flam').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setDepth(y + 1).play('fx-flam')
    this.campfires.push({ x, y, radius, until: this.time.now + dur, sprite, flame, glow, seed })
    Audio.sfx('sfx_el_fire', { vol: 0.55 })
    return true
  }

  /** Éteint un foyer : fondu puis destruction des sprites (le retire de la liste active AVANT, donc il ne
   *  réchauffe plus pendant l'extinction). `delay` = durée du fondu. */
  extinguishCampfire(f, delay = 700) {
    if (!f || f.dying) return
    f.dying = true
    this.tweens.add({
      targets: [f.sprite, f.flame, f.glow], alpha: 0, duration: delay,
      onComplete: () => { f.sprite.destroy(); f.flame.destroy(); f.glow.destroy() },
    })
  }

  /** Anime les foyers (halo qui respire) et éteint ceux dont la durée est écoulée. */
  updateCampfires(time) {
    if (!this.campfires?.length) return
    for (let i = this.campfires.length - 1; i >= 0; i--) {
      const f = this.campfires[i]
      if (time >= f.until) { this.campfires.splice(i, 1); this.extinguishCampfire(f); continue }
      const t = time / 240 + f.seed
      const night = 1 + 1.3 * (this.dayDarkness ?? 0) // halo plus marqué la nuit (le voile assombrit le reste)
      f.glow.setAlpha((0.10 + 0.05 * Math.sin(t)) * night).setScale(1 + 0.06 * Math.sin(t * 1.3))
    }
  }

  /** CYCLE JOUR/NUIT : fait varier l'opacité (et la teinte) du voile de nuit sur DAY_CYCLE_MS.
   *  `dayDarkness` (0 = plein jour, 1 = minuit) est lu par la température (nuit = plus froid) et par
   *  l'icône soleil/lune du HUD. f=0 (début de partie) = lever du jour. */
  updateDayNight(time) {
    if (!this.nightOverlay) return
    const f = (time % DAY_CYCLE_MS) / DAY_CYCLE_MS
    const n = (1 - Math.cos(f * Math.PI * 2)) / 2 // courbe douce : 0 au lever (f=0) -> 1 à minuit (f=0.5)
    this.dayDarkness = n
    // ANNONCE jour/nuit : bandeau quand on franchit le seuil (n=0.5). Pas d'annonce à l'initialisation ni en aperçu.
    const night = n > 0.5
    if (this._wasNight === undefined) this._wasNight = night
    else if (night !== this._wasNight && !this.preview) {
      this._wasNight = night
      const ui = this.scene.get('UIScene')
      if (night) ui?.showZoneBanner?.('La nuit tombe', '#9fb6ff')
      else ui?.showZoneBanner?.('Le jour se lève', '#ffe9a8')
    } else { this._wasNight = night }
    // teinte : crépuscule/aube mauve (n modéré) -> bleu nuit profond (minuit), opacité ∝ n
    this.nightOverlay.setFillStyle(lerpHex(0x3a2e54, 0x070d28, n), 1)
    this.nightOverlay.setAlpha(NIGHT_MAX_ALPHA * n)
    // (le village/prairie reste de jour : trou permanent dans le voile via le masque radial inversé)
    // AMBIANCE : nuages du monde qui DÉRIVENT doucement + GOD RAYS forts le jour (n=0), nuls la nuit (n=1)
    if (this.worldClouds) { this.worldClouds.tilePositionX = time * 0.006; this.worldClouds.tilePositionY = time * 0.0032 }
    if (this.raylight) { // god rays SUBTILS, UNIQUEMENT au bord de mer et le JOUR (n=0 plein jour -> 1 minuit) ; fondu doux
      const p = this.player
      const target = (p && this.nearSea(p.x, p.y, 7)) ? 0.12 * (1 - n) : 0
      this._rayAlpha += (target - this._rayAlpha) * 0.05 // lissage -> pas de « pop » en entrant/sortant de la zone
      this.raylight.setAlpha(this._rayAlpha)
    }
  }

  /** true si (x,y) est à portée d'un foyer ALLUMÉ (zone-refuge de température). */
  nearCampfire(x, y) {
    if (!this.campfires?.length) return false
    for (const f of this.campfires) {
      const dx = x - f.x, dy = y - f.y
      if (dx * dx + dy * dy <= f.radius * f.radius) return true
    }
    return false
  }

  handleDeath() {
    if (this.gameOver) return // évite un double déclenchement
    const pl = this.player
    // RÉSURRECTION (compétence de set Soigneur, solo) : auto-revive UNE fois -> on ANNULE la mort.
    if (pl.reviveCharge) {
      pl.reviveCharge = false
      this.applyResurrect(pl) // 50 % PV + mana + 3 s invuln + animation (helper mutualisé avec la réanimation d'allié en multi)
      return
    }
    this.gameOver = true
    this.clearTarget() // libère la cible verrouillée (sinon le réticule reste après le respawn)
    this.snowEmitter?.stop(); this.snowEmitter?.killAll() // pas de neige pendant le voile de mort
    this.rainEmitter?.stop(); this.rainEmitter?.killAll()
    this.raining = false
    this.endTankCharge() // coupe un éventuel buff de Charge du Tank
    this.activeBoss = null // cache la barre de boss
    this.bossTrack = null
    Audio.stopMusic() // coupure IMMÉDIATE (pas de fondu) pour laisser le jingle de mort seul
    Audio.stopAmbient()
    Audio.sfx('sfx_gameover', { vol: 0.9, detune: 0 })
    this.releaseArena() // libère l'arène (le joueur respawn au village, pas piégé)
    // DÉSENGAGE les boss engagés : sinon `updateArena` re-verrouille l'arène au respawn et téléporte
    // le joueur dedans (combatEngaged ne retombait que parce que l'ancienne mort recréait la scène).
    // Le boss se rendort, repart à son repaire et récupère ses PV (raid intuable solo : pas de grignotage).
    for (const b of this.bosses || []) {
      if (!b.active || !b.combatEngaged) continue
      b.combatEngaged = false
      b.charging = false
      b.hp = b.maxHp
      if (b.leashX != null) b.setPosition(b.leashX, b.leashY) // retour au repaire
    }
    const p = this.player
    p.setVelocity(0, 0)
    p.setTint(0x555555)
    this.physics.pause()

    // SAC DE MORT (A1) : or + sac tombent à l'endroit de la mort. On GARDE équipement + niveau.
    const gold = p.gold
    const items = p.inventory.slice()
    p.deathsSinceRecovery = (p.deathsSinceRecovery || 0) + 1
    this.clearDeathBagSprite() // un seul sac : l'ancien (non récupéré) est perdu
    const lost = p.deathsSinceRecovery >= 3 // 3e mort sans récupération -> tout est définitivement perdu
    if (!lost && (gold > 0 || items.length > 0)) {
      p.deathBag = { gold, items, x: p.x, y: p.y }
      this.spawnDeathBagSprite()
    } else {
      p.deathBag = null
    }
    p.gold = 0
    p.inventory = []
    p.invVersion++

    // l'UIScene affiche un voile bref (ce qu'on a laissé, avec icônes), puis appelle respawnAtVillage()
    this.events.emit('died', { gold, items, lost })
  }

  /** Réapparition au village après le voile de mort (PV pleins). Appelé par UIScene. */
  respawnAtVillage() {
    const p = this.player
    // SÉCURITÉ anti-piège : on relibère l'arène et on désengage tout boss resté actif AVANT de
    // replacer le joueur (au cas où un état d'arène aurait survécu pendant le voile de mort).
    this.releaseArena()
    this.activeBoss = null
    this.bossTrack = null
    for (const b of this.bosses || []) {
      if (!b.active || !b.combatEngaged) continue
      b.combatEngaged = false
      b.charging = false
      b.hp = b.maxHp
      if (b.leashX != null) b.setPosition(b.leashX, b.leashY)
    }
    p.hp = p.maxHp
    p.mana = p.maxMana // mana pleine au respawn
    p.nextSpellAt = 0
    p.nextSpell2At = 0
    p.nextSpell3At = 0 // COMPÉTENCES RESET à la mort : tous les cooldowns purgés -> kit prêt au respawn
    p.clearTint()
    p.setVelocity(0, 0)
    p.moveTarget = null
    this.gameOver = false
    this.physics.resume()
    // POINT DE REPOS : si le héros a dormi au dortoir, il se RÉVEILLE DANS SON LIT (intérieur dortoir) au lieu de la place du village.
    if (p.respawnHome) {
      const innE = this.buildingEntrances?.find((e) => e.id === 'inn')
      this._villageReturn = innE ? { x: innE.x, y: innE.y } : { x: this.cx * TILE, y: this.cy * TILE } // sortir de l'auberge -> devant sa porte
      this._savedZoom = this._savedZoom || this.cameras.main.zoom
      this.goInterior('dorm', { spawn: 'restSpawn', exitTo: 'inn' }) // réapparition allongé sur son lit (puis on ressort dortoir->réception->village)
      this.saveGame()
      return
    }
    p.setPosition(this.cx * TILE, this.cy * TILE)
    this.cameras.main.centerOn(p.x, p.y)
    this.saveGame() // persiste le sac de mort + le respawn
  }

  /** Crée le sprite du sac de mort au sol (pulsation douce, pas de déplacement du corps). */
  spawnDeathBagSprite() {
    this.clearDeathBagSprite()
    const b = this.player.deathBag
    if (!b) return
    const s = this.add.image(b.x, b.y, 'moneybag').setDepth(b.y)
    s.setScale(18 / Math.max(s.width, s.height))
    this.tweens.add({ targets: s, scale: s.scale * 1.12, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    this.deathBagSprite = s
    this._bagArmed = false // ne se ramasse qu'APRÈS s'en être éloigné une fois (sinon respawn dessus = pickup instantané)
  }

  /** Retire le sprite du sac de mort (récupéré, perdu, ou remplacé). */
  clearDeathBagSprite() {
    if (this.deathBagSprite) {
      this.tweens.killTweensOf(this.deathBagSprite)
      this.deathBagSprite.destroy()
      this.deathBagSprite = null
    }
  }

  /** Récupère le sac de mort (or + objets) quand le héros marche dessus. */
  recoverDeathBag() {
    const p = this.player
    const b = p.deathBag
    if (!b) return
    p.gold += b.gold
    for (const it of b.items) p.inventory.push(it) // on récupère TOUT (peut dépasser le cap le temps de gérer/vendre)
    p.consolidateInventory() // ré-empile les consommables récupérés
    p.invVersion++
    p.deathBag = null
    p.deathsSinceRecovery = 0
    this.clearDeathBagSprite()
    const parts = []
    if (b.gold > 0) parts.push(`${b.gold} or`)
    if (b.items.length) parts.push(`${b.items.length} objet${b.items.length > 1 ? 's' : ''}`)
    this.scene.get('UIScene')?.showToast?.('Sac récupéré : ' + (parts.join(' + ') || 'rien'), '#7cfc9a')
    Audio.sfx('sfx_loot', { vol: 0.6, detune: 0 })
    this.saveGame()
  }
}
