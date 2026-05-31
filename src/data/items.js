/**
 * Catalogue des objets d'équipement (Phase 3 + marchand).
 * Chaque objet : id, nom, slot (weapon/armor/accessory), icône (clé de texture),
 * rareté, prix d'achat, et bonus de stats appliqués quand il est équipé.
 */

// raretés (couleur texte + teinte de bordure), façon WoW
export const RARITY = {
  common: { label: 'Commun', color: '#dcdcdc', tint: 0x9aa4b0, weight: 70 },
  rare: { label: 'Rare', color: '#4aa3ff', tint: 0x3a7fd0, weight: 25 },
  epic: { label: 'Épique', color: '#c77dff', tint: 0xa335ee, weight: 5 },
}

// `dur` = durabilité max (armes/armures s'usent au combat ; à 0 l'objet casse et se
// déséquipe -> à réparer chez le forgeron). Les accessoires n'ont pas de durabilité.
export const ITEMS = {
  // armes (slot 'weapon') -> attaque
  dagger: { id: 'dagger', name: 'Dague rouillée', slot: 'weapon', icon: 'weapon_sword', rarity: 'common', price: 15, stats: { attack: 4 }, dur: 40 },
  sword: { id: 'sword', name: 'Épée', slot: 'weapon', icon: 'weapon_sword', rarity: 'common', price: 40, stats: { attack: 8 }, dur: 50 },
  katana: { id: 'katana', name: 'Katana', slot: 'weapon', icon: 'weapon_katana', rarity: 'rare', price: 90, stats: { attack: 12 }, dur: 70 },
  axe: { id: 'axe', name: 'Hache de guerre', slot: 'weapon', icon: 'weapon_axe', rarity: 'rare', price: 120, stats: { attack: 16 }, dur: 80 },
  greatsword: { id: 'greatsword', name: 'Lame légendaire', slot: 'weapon', icon: 'weapon_bigsword', rarity: 'epic', price: 260, stats: { attack: 24 }, dur: 110 },

  // armures (slot 'armor') -> PV / défense
  leather: { id: 'leather', name: 'Tunique de cuir', slot: 'armor', icon: 'eq_armor', rarity: 'common', price: 30, stats: { hp: 20 }, dur: 50 },
  chainmail: { id: 'chainmail', name: 'Cotte de mailles', slot: 'armor', icon: 'eq_armor', rarity: 'rare', price: 100, stats: { hp: 30, defense: 5 }, dur: 80 },
  plate: { id: 'plate', name: 'Armure de plaques', slot: 'armor', icon: 'eq_armor', rarity: 'epic', price: 230, stats: { hp: 50, defense: 10 }, dur: 120 },

  // accessoires (slot 'accessory') -> bonus variés
  amulet: { id: 'amulet', name: 'Amulette de garde', slot: 'accessory', icon: 'eq_amulet', rarity: 'common', price: 35, stats: { defense: 3 } },
  ring: { id: 'ring', name: 'Anneau de force', slot: 'accessory', icon: 'eq_ring', rarity: 'rare', price: 80, stats: { attack: 5 } },
  signet: { id: 'signet', name: 'Sceau du champion', slot: 'accessory', icon: 'eq_ring', rarity: 'epic', price: 210, stats: { attack: 9, defense: 3 } },

  // consommables (type 'consumable') -> usage = soin immédiat (clic dans le sac)
  potion: { id: 'potion', name: 'Potion de soin', type: 'consumable', icon: 'drop_heart', rarity: 'common', price: 25, heal: 45 },
  potion_big: { id: 'potion_big', name: 'Grande potion', type: 'consumable', icon: 'drop_heart', rarity: 'rare', price: 70, heal: 120 },
}

// stock du marchand = tout le catalogue
export const SHOP_STOCK = Object.values(ITEMS)

// libellés FR des slots (ordre d'affichage de l'équipement)
export const SLOTS = ['weapon', 'armor', 'accessory']
export const SLOT_LABELS = { weapon: 'Arme', armor: 'Armure', accessory: 'Accessoire' }

// abréviations FR des stats (pour l'affichage des bonus)
export const STAT_LABELS = { attack: 'ATQ', defense: 'DEF', hp: 'PV' }

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
  if (item.type === 'consumable') return item.heal ? `Rend ${item.heal} PV (clic = boire)` : 'Consommable'
  let txt = describeStats(effectiveStats(item))
  if (hasDurability(item)) {
    const broken = (item.durability ?? item.dur) <= 0
    txt += `\nDurabilité ${item.durability ?? item.dur}/${item.dur}${broken ? ' (CASSÉ)' : ''}`
  }
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
