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

export const ITEMS = {
  // armes (slot 'weapon') -> attaque
  dagger: { id: 'dagger', name: 'Dague rouillée', slot: 'weapon', icon: 'weapon_sword', rarity: 'common', price: 15, stats: { attack: 4 } },
  sword: { id: 'sword', name: 'Épée', slot: 'weapon', icon: 'weapon_sword', rarity: 'common', price: 40, stats: { attack: 8 } },
  katana: { id: 'katana', name: 'Katana', slot: 'weapon', icon: 'weapon_katana', rarity: 'rare', price: 90, stats: { attack: 12 } },
  axe: { id: 'axe', name: 'Hache de guerre', slot: 'weapon', icon: 'weapon_axe', rarity: 'rare', price: 120, stats: { attack: 16 } },
  greatsword: { id: 'greatsword', name: 'Lame légendaire', slot: 'weapon', icon: 'weapon_bigsword', rarity: 'epic', price: 260, stats: { attack: 24 } },

  // armures (slot 'armor') -> PV / défense
  leather: { id: 'leather', name: 'Tunique de cuir', slot: 'armor', icon: 'eq_armor', rarity: 'common', price: 30, stats: { hp: 20 } },
  chainmail: { id: 'chainmail', name: 'Cotte de mailles', slot: 'armor', icon: 'eq_armor', rarity: 'rare', price: 100, stats: { hp: 30, defense: 5 } },
  plate: { id: 'plate', name: 'Armure de plaques', slot: 'armor', icon: 'eq_armor', rarity: 'epic', price: 230, stats: { hp: 50, defense: 10 } },

  // accessoires (slot 'accessory') -> bonus variés
  amulet: { id: 'amulet', name: 'Amulette de garde', slot: 'accessory', icon: 'eq_amulet', rarity: 'common', price: 35, stats: { defense: 3 } },
  ring: { id: 'ring', name: 'Anneau de force', slot: 'accessory', icon: 'eq_ring', rarity: 'rare', price: 80, stats: { attack: 5 } },
  signet: { id: 'signet', name: 'Sceau du champion', slot: 'accessory', icon: 'eq_ring', rarity: 'epic', price: 210, stats: { attack: 9, defense: 3 } },
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

/** Prix de revente (moitié du prix d'achat, au moins 1). */
export function sellPrice(item) {
  return Math.max(1, Math.floor((item.price ?? 0) / 2))
}

/** Copie indépendante d'un objet (pour le sac : objets distincts). */
export function cloneItem(item) {
  return { ...item, stats: { ...item.stats } }
}
