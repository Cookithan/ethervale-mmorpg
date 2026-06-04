/**
 * Catalogue des objets d'équipement (Phase 3 + marchand).
 * Chaque objet : id, nom, slot (weapon/armor/focus/ring), icône (clé de texture),
 * rareté, prix d'achat, et bonus de stats appliqués quand il est équipé.
 */

// 4 paliers de rareté (brief §5) : Commun(gris) · Magique(bleu) · Rare(violet) · Légendaire(or).
// ⚠️ Les CLÉS internes sont conservées pour ne rien casser dans le code existant :
//   'rare' = palier MAGIQUE (bleu) · 'epic' = palier RARE (violet) · 'legendary' = nouveau (or, BOSS only).
export const RARITY = {
  common: { label: 'Commun', color: '#dcdcdc', tint: 0x9aa4b0, weight: 60 },
  rare: { label: 'Magique', color: '#4aa3ff', tint: 0x3a7fd0, weight: 25 },
  epic: { label: 'Rare', color: '#c77dff', tint: 0xa335ee, weight: 12 },
  legendary: { label: 'Légendaire', color: '#ffb02e', tint: 0xffae22, weight: 3 },
}

// `dur` = durabilité max (armes/armures s'usent au combat ; à 0 l'objet casse et se
// déséquipe -> à réparer chez le forgeron). Les accessoires n'ont pas de durabilité.
// `iconTint` (optionnel) = teinte appliquée à l'icône (différencie des items qui partagent un sprite :
// tiers d'armure, bâtons de soigneur teintés vert...). Appliqué partout où l'icône est dessinée.
export const ITEMS = {
  // ===== ARMES (slot 'weapon') -> +Attaque. `classes` = classes autorisées. L'icône `wpn_*` sert AUSSI
  // de sprite qui swingue à l'attaque (showWeaponSwing). =====
  // Guerrier (épées / lames, tranche 'fx-slash') :
  dagger: { id: 'dagger', name: 'Dague', slot: 'weapon', classes: ['warrior'], icon: 'wpn_dagger', rarity: 'common', price: 45, stats: { attack: 4 }, dur: 40, fx: 'fx-slash' },
  sword: { id: 'sword', name: 'Épée', slot: 'weapon', classes: ['warrior'], icon: 'wpn_sword', rarity: 'common', price: 100, stats: { attack: 7 }, dur: 50, fx: 'fx-slash' },
  sabre: { id: 'sabre', name: 'Sabre courbe', slot: 'weapon', classes: ['warrior'], icon: 'wpn_sword2', rarity: 'rare', price: 200, stats: { attack: 11 }, dur: 65, fx: 'fx-slash' },
  katana: { id: 'katana', name: 'Katana', slot: 'weapon', classes: ['warrior'], icon: 'wpn_katana', rarity: 'rare', price: 220, stats: { attack: 12 }, dur: 70, fx: 'fx-slash' },
  kris: { id: 'kris', name: "Kris de l'ombre", slot: 'weapon', classes: ['warrior'], icon: 'wpn_ninjaku', rarity: 'epic', price: 520, stats: { attack: 18 }, dur: 100, fx: 'fx-slash' },
  rapier: { id: 'rapier', name: 'Rapière du duelliste', slot: 'weapon', classes: ['warrior'], icon: 'wpn_rapier', rarity: 'epic', price: 580, stats: { attack: 19 }, dur: 110, fx: 'fx-slash' },
  // Guerrier — armes à LANCER (`ranged: true` -> l'attaque PROJETTE l'arme vers l'ennemi visible) :
  throwknife: { id: 'throwknife', name: 'Couteaux de lancer', slot: 'weapon', classes: ['warrior'], icon: 'fx_kunai', ranged: true, proj: { tex: 'fx_kunai' }, rarity: 'common', price: 90, stats: { attack: 4 }, dur: 45 },
  shuriken: { id: 'shuriken', name: 'Shuriken', slot: 'weapon', classes: ['warrior'], icon: 'fx_shuriken', ranged: true, proj: { tex: 'fx_shuriken', anim: 'fx-shuriken' }, rarity: 'rare', price: 200, stats: { attack: 8 }, dur: 60 },
  // Tank (masses / lames lourdes -> slash circulaire 'fx-circslash') :
  club: { id: 'club', name: 'Gourdin', slot: 'weapon', classes: ['tank'], icon: 'wpn_club', rarity: 'common', price: 90, stats: { attack: 5 }, dur: 60, fx: 'fx-circslash' },
  warhammer: { id: 'warhammer', name: 'Marteau de guerre', slot: 'weapon', classes: ['tank'], icon: 'wpn_hammer', rarity: 'rare', price: 240, stats: { attack: 10 }, dur: 90, fx: 'fx-circslash' },
  axe: { id: 'axe', name: 'Hache de guerre', slot: 'weapon', classes: ['tank'], icon: 'wpn_axe', rarity: 'rare', price: 250, stats: { attack: 11 }, dur: 85, fx: 'fx-circslash' },
  greatblade: { id: 'greatblade', name: 'Lame colossale', slot: 'weapon', classes: ['tank'], icon: 'wpn_bigsword', rarity: 'epic', price: 580, stats: { attack: 17 }, dur: 120, fx: 'fx-circslash' },
  warlance: { id: 'warlance', name: 'Pertuisane', slot: 'weapon', classes: ['tank'], icon: 'wpn_lance2', rarity: 'epic', price: 560, stats: { attack: 16 }, dur: 115, fx: 'fx-circslash' },
  // Mage (baguettes / grimoires) :
  wand: { id: 'wand', name: 'Baguette arcanique', slot: 'weapon', classes: ['mage'], icon: 'wpn_wand', rarity: 'common', price: 100, stats: { attack: 7 }, dur: 40 },
  grimoire: { id: 'grimoire', name: 'Grimoire interdit', slot: 'weapon', classes: ['mage'], icon: 'wpn_book', rarity: 'rare', price: 240, stats: { attack: 12 }, dur: 60 },
  archstaff: { id: 'archstaff', name: "Bâton de l'archimage", slot: 'weapon', classes: ['mage'], icon: 'wpn_stick', rarity: 'epic', price: 580, stats: { attack: 19 }, dur: 80 },
  // Soigneur (bâtons teintés VERT pour les distinguer du mage) :
  healstick: { id: 'healstick', name: 'Bâton de soin', slot: 'weapon', classes: ['healer'], icon: 'wpn_stick', iconTint: 0x9be88f, rarity: 'common', price: 90, stats: { attack: 4 }, dur: 40 },
  healwand: { id: 'healwand', name: 'Sceptre béni', slot: 'weapon', classes: ['healer'], icon: 'wpn_wand', iconTint: 0x9be88f, rarity: 'rare', price: 220, stats: { attack: 8 }, dur: 60 },
  relic: { id: 'relic', name: 'Relique sacrée', slot: 'weapon', classes: ['healer'], icon: 'wpn_bone', rarity: 'epic', price: 540, stats: { attack: 12 }, dur: 80 },

  // ===== ARMURES (slot 'armor') -> PV / défense. Un seul sprite `eq_armor`, TEINTÉ par tier. =====
  leather: { id: 'leather', name: 'Tunique de cuir', slot: 'armor', icon: 'eq_armor', iconTint: 0xc89a63, rarity: 'common', price: 90, stats: { hp: 16 }, dur: 50 },
  chainmail: { id: 'chainmail', name: 'Cotte de mailles', slot: 'armor', icon: 'eq_armor', iconTint: 0xb6c0cc, rarity: 'rare', price: 240, stats: { hp: 26, defense: 4 }, dur: 80 },
  plate: { id: 'plate', name: 'Armure de plaques', slot: 'armor', icon: 'eq_armor', iconTint: 0x9fb4d6, rarity: 'epic', price: 560, stats: { hp: 42, defense: 8 }, dur: 120 },
  // Armures THÉMATIQUES (résistance à la température) : à équiper avant d'explorer neige/désert.
  furcloak: { id: 'furcloak', name: 'Cape de fourrure', slot: 'armor', icon: 'eq_armor', iconTint: 0xe6f0ff, rarity: 'rare', price: 230, stats: { hp: 22, defense: 2, coldResist: 55 }, dur: 70 },
  desertgarb: { id: 'desertgarb', name: 'Habit du désert', slot: 'armor', icon: 'eq_armor', iconTint: 0xe8c987, rarity: 'rare', price: 230, stats: { hp: 22, defense: 2, heatResist: 55 }, dur: 70 },

  // ===== FOCUS (slot 'focus') -> améliore LA COMPÉTENCE (cooldown -%, effet +%). Parchemins élémentaires. =====
  focus1: { id: 'focus1', name: "Parchemin d'apprenti", slot: 'focus', icon: 'foc_scroll', rarity: 'common', price: 110, spellCd: 0.08, spellPower: 0.08 },
  focus2: { id: 'focus2', name: 'Parchemin de givre', slot: 'focus', icon: 'foc_ice', rarity: 'rare', price: 260, spellCd: 0.15, spellPower: 0.18, stats: { manaRegen: 2 } },
  focus_plant: { id: 'focus_plant', name: 'Parchemin de vie', slot: 'focus', icon: 'foc_plant', rarity: 'rare', price: 250, spellCd: 0.14, spellPower: 0.2, stats: { manaRegen: 2 } },
  focus3: { id: 'focus3', name: 'Parchemin de foudre', slot: 'focus', icon: 'foc_thunder', rarity: 'epic', price: 580, spellCd: 0.24, spellPower: 0.3, stats: { manaRegen: 3 } },
  focus_fire: { id: 'focus_fire', name: 'Parchemin de flammes', slot: 'focus', icon: 'foc_fire', rarity: 'epic', price: 600, spellCd: 0.2, spellPower: 0.38 },

  // ===== ANNEAUX (slot 'ring') -> +Mana max (+ bonus secondaire). Gemmes colorées. =====
  amulet: { id: 'amulet', name: 'Anneau de mana', slot: 'ring', icon: 'eq_ring', rarity: 'common', price: 90, stats: { mana: 16, manaRegen: 1 } },
  ring: { id: 'ring', name: "Anneau d'émeraude", slot: 'ring', icon: 'ring_green', rarity: 'rare', price: 220, stats: { mana: 34, attack: 3 } },
  ring_topaz: { id: 'ring_topaz', name: 'Anneau de topaze', slot: 'ring', icon: 'ring_yellow', rarity: 'rare', price: 230, stats: { mana: 28, hp: 14 } },
  signet: { id: 'signet', name: "Anneau d'améthyste", slot: 'ring', icon: 'ring_purple', rarity: 'epic', price: 520, stats: { mana: 58, defense: 3, manaRegen: 3 } },

  // ===== LÉGENDAIRES (or) — EXCLUSIFS AUX BOSS (jamais au marchand/butin normal, cf. SHOP_STOCK / equipmentOfTier) =====
  legend_sword: { id: 'legend_sword', name: "Lame d'Excalibur", slot: 'weapon', classes: ['warrior'], icon: 'wpn_sword', rarity: 'legendary', price: 600, stats: { attack: 40 }, dur: 200, fx: 'fx-slash' },
  legend_hammer: { id: 'legend_hammer', name: 'Marteau des Titans', slot: 'weapon', classes: ['tank'], icon: 'wpn_hammer', rarity: 'legendary', price: 600, stats: { attack: 34 }, dur: 220, fx: 'fx-circslash' },
  legend_staff: { id: 'legend_staff', name: 'Bâton Cosmique', slot: 'weapon', classes: ['mage'], icon: 'wpn_stick', rarity: 'legendary', price: 600, stats: { attack: 40 }, dur: 160 },
  legend_relic: { id: 'legend_relic', name: 'Relique Divine', slot: 'weapon', classes: ['healer'], icon: 'wpn_bone', iconTint: 0xffe6a0, rarity: 'legendary', price: 560, stats: { attack: 26 }, dur: 160 },
  legend_armor: { id: 'legend_armor', name: 'Armure du Dragon', slot: 'armor', icon: 'eq_armor', iconTint: 0xffd27a, rarity: 'legendary', price: 560, stats: { hp: 90, defense: 18 }, dur: 240 },
  legend_focus: { id: 'legend_focus', name: 'Cœur du Dragon', slot: 'focus', icon: 'foc_fire', rarity: 'legendary', price: 560, spellCd: 0.42, spellPower: 0.65, stats: { manaRegen: 4 } },
  legend_ring: { id: 'legend_ring', name: 'Anneau Cosmique', slot: 'ring', icon: 'ring_red', rarity: 'legendary', price: 560, stats: { mana: 120, attack: 8, manaRegen: 5 } },

  // ===== CONSOMMABLES (type 'consumable') -> clic dans le sac. `heal` = +PV, `mana` = +mana. =====
  potion: { id: 'potion', name: 'Potion de soin', type: 'consumable', icon: 'pot_heal', rarity: 'common', price: 40, heal: 45 },
  potion_big: { id: 'potion_big', name: 'Grande potion de soin', type: 'consumable', icon: 'pot_heal_big', rarity: 'rare', price: 110, heal: 120 },
  potion_mana: { id: 'potion_mana', name: 'Potion de mana', type: 'consumable', icon: 'pot_mana', rarity: 'common', price: 45, mana: 40 },
  potion_mana_big: { id: 'potion_mana_big', name: 'Grande potion de mana', type: 'consumable', icon: 'pot_mana_big', rarity: 'rare', price: 120, mana: 90 },
  // potions de TEMPÉRATURE (10 min) : la potion de feu protège du FROID, la potion de givre protège de la CHALEUR.
  potion_fire: { id: 'potion_fire', name: 'Potion de feu', type: 'consumable', icon: 'pot_fire', iconTint: 0xffb060, rarity: 'rare', price: 150, tempBuff: 'fire', tempDur: 600000, desc: 'Protège du FROID 10 min (immunité gel)' },
  potion_frost: { id: 'potion_frost', name: 'Potion de givre', type: 'consumable', icon: 'pot_frost', iconTint: 0xa0e6ff, rarity: 'rare', price: 150, tempBuff: 'frost', tempDur: 600000, desc: 'Protège de la CHALEUR 10 min (immunité feu)' },
  // feu de camp À POSER : crée un foyer temporaire (zone-refuge) qui neutralise le froid ET le chaud autour.
  campfire_kit: { id: 'campfire_kit', name: 'Feu de camp', type: 'consumable', icon: 'campfire', rarity: 'rare', price: 800, placeFire: true, fireDur: 90000, fireRadius: 64, desc: 'À poser : foyer ~90 s qui réchauffe — protège du FROID autour (sans effet au désert)' },

  // ===== MATÉRIAUX (type 'material') — ressources lâchées par les mobs, EMPILABLES dans une poche à part
  // (pas le sac d'équipement). Servent à VENDRE (or) ET à AMÉLIORER l'équipement à la forge. `price` =
  // prix de revente ×2 (sellPrice = price/2). =====
  mat_leather: { id: 'mat_leather', name: 'Cuir', type: 'material', icon: 'mat_leather', rarity: 'common', price: 16 },
  mat_bone: { id: 'mat_bone', name: 'Os', type: 'material', icon: 'wpn_bone', rarity: 'common', price: 18 },
  mat_essence: { id: 'mat_essence', name: 'Lingot de fer', type: 'material', icon: 'mat_essence', rarity: 'rare', price: 32 },
  mat_crystal: { id: 'mat_crystal', name: 'Cristal', type: 'material', icon: 'mat_crystal', rarity: 'epic', price: 56 },
}

// matériaux exposés à part (ordre d'affichage de la poche de ressources)
export const MATERIALS = ['mat_leather', 'mat_bone', 'mat_essence', 'mat_crystal']

// stock du marchand = tout le catalogue SAUF les légendaires (exclusifs aux boss, brief §8)
export const SHOP_STOCK = Object.values(ITEMS).filter((it) => it.rarity !== 'legendary')

// BATEAU (brief A3) : achat SPÉCIAL au marchand (onglet dédié) — déverrouille la navigation sur l'eau
// (le héros embarque dès qu'il marche sur l'eau) → accès aux Terres maudites end-game. Pas un objet de
// sac/équipement : l'achat pose juste le flag `player.hasBoat`. Cher mais accessible (puits à or).
export const BOAT_ITEM = {
  id: 'boat',
  name: 'Barque du large',
  icon: 'boat',
  rarity: 'epic',
  price: 3000,
  desc: "Navigue sur l'eau et atteins les Terres maudites.",
}

// 4 slots d'équipement : Arme(+ATQ) / Armure(+DEF) / Focus(améliore la compétence) / Anneau(+Mana)
export const SLOTS = ['weapon', 'armor', 'focus', 'ring']
export const SLOT_LABELS = { weapon: 'Arme', armor: 'Armure', focus: 'Focus', ring: 'Anneau' }

// abréviations FR des stats (pour l'affichage des bonus)
export const STAT_LABELS = { attack: 'ATQ', defense: 'DEF', hp: 'PV', mana: 'Mana', manaRegen: 'Mana/s', coldResist: 'Rés. froid', heatResist: 'Rés. chaud' }

const CLASS_FR = { warrior: 'Guerrier', mage: 'Mage', tank: 'Tank', healer: 'Soigneur' }
// arme de DÉPART par classe (équipée à la création du perso)
export const STARTER_WEAPON = { warrior: 'sword', tank: 'club', mage: 'wand', healer: 'healstick' }

/** true si la classe `classKey` peut équiper cet objet (pas de champ `classes` = universel). */
export function canEquip(item, classKey) {
  return !item.classes || item.classes.includes(classKey)
}

/** Mention de restriction de classe, ex. "Réservé : Guerrier" (chaîne vide si universel). */
export function classRestrictionLabel(item) {
  if (!item.classes) return ''
  return 'Réservé : ' + item.classes.map((c) => CLASS_FR[c] ?? c).join('/')
}

/** Formate les bonus d'un objet, ex. "+8 ATQ" ou "+30 PV, +5 DEF". */
export function describeStats(stats) {
  return Object.entries(stats)
    .map(([k, v]) => `+${v} ${STAT_LABELS[k] ?? k}`)
    .join(', ')
}

// --- amélioration (forge) ---
export const UPGRADE_MAX = 5 // niveau d'amélioration maxi (+5)
const UPGRADE_STEP = 0.2 // +20 % des stats de base par niveau d'amélioration

/** Stats EFFECTIVES d'un objet = stats de base boostées par son niveau d'amélioration. */
export function effectiveStats(item) {
  const up = item.upgrade ?? 0
  const out = {}
  for (const [k, v] of Object.entries(item.stats ?? {})) out[k] = Math.round(v * (1 + UPGRADE_STEP * up))
  return out
}

/** true si l'objet a une durabilité (armes/armures), false sinon (accessoires/consommables). */
export function hasDurability(item) {
  return item != null && item.dur != null
}

/** Coût en or pour réparer entièrement la durabilité (0 si plein / pas de durabilité). */
export function repairCost(item) {
  if (!hasDurability(item)) return 0
  const missing = item.dur - (item.durability ?? item.dur)
  if (missing <= 0) return 0
  return Math.max(1, Math.ceil((missing / item.dur) * item.price * 0.5))
}

/** Coût en or pour améliorer d'un niveau (null si déjà au max). */
export function upgradeCost(item) {
  const up = item.upgrade ?? 0
  if (up >= UPGRADE_MAX) return null
  return Math.max(5, Math.ceil(item.price * 0.6 * (up + 1)))
}

/** Nom affiché, suffixé du niveau d'amélioration (ex. "Épée +2"). */
export function itemName(item) {
  const up = item.upgrade ?? 0
  return up > 0 ? `${item.name} +${up}` : item.name
}

/** Texte descriptif d'un objet (consommable = soin ; équipement = stats + durabilité). */
export function describeItem(item) {
  if (item.desc) return item.desc // objet spécial décrit en clair (ex. bateau)
  if (item.type === 'material') return 'Matériau — à vendre ou à utiliser à la forge'
  if (item.type === 'consumable') {
    const e = []
    if (item.heal) e.push(`+${item.heal} PV`)
    if (item.mana) e.push(`+${item.mana} mana`)
    return (e.length ? e.join(', ') : 'Consommable') + ' (clic = boire)'
  }
  let txt = describeStats(effectiveStats(item))
  if (item.spellCd || item.spellPower) {
    const parts = []
    if (item.spellCd) parts.push(`-${Math.round(item.spellCd * 100)}% cooldown du sort`)
    if (item.spellPower) parts.push(`+${Math.round(item.spellPower * 100)}% effet du sort`)
    txt = (txt ? txt + '\n' : '') + parts.join('\n')
  }
  if (hasDurability(item)) {
    const broken = (item.durability ?? item.dur) <= 0
    txt += `\nDurabilité ${item.durability ?? item.dur}/${item.dur}${broken ? ' (CASSÉ)' : ''}`
  }
  const restr = classRestrictionLabel(item)
  if (restr) txt += `\n${restr}`
  return txt
}

/** Prix de revente (moitié du prix d'achat, au moins 1). */
export function sellPrice(item) {
  return Math.max(1, Math.floor((item.price ?? 0) / 2))
}

/** Copie indépendante d'un objet (pour le sac : objets distincts), durabilité/amélioration
 *  initialisées (durabilité pleine, +0) pour ne pas muter le modèle du catalogue. */
export function cloneItem(item) {
  return {
    ...item,
    stats: { ...item.stats },
    upgrade: item.upgrade ?? 0,
    durability: item.durability ?? item.dur ?? null,
  }
}
