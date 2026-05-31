/**
 * Catalogue des objets d'équipement (MVP Phase 3).
 * Chaque objet : id, nom, slot (weapon/armor/accessory), icône (clé de texture
 * chargée dans BootScene), et bonus de stats appliqués quand il est équipé.
 */
export const ITEMS = {
  // armes (slot 'weapon') -> attaque
  sword: { id: 'sword', name: 'Épée', slot: 'weapon', icon: 'weapon_sword', stats: { attack: 8 } },
  katana: { id: 'katana', name: 'Katana', slot: 'weapon', icon: 'weapon_katana', stats: { attack: 11 } },
  axe: { id: 'axe', name: 'Hache', slot: 'weapon', icon: 'weapon_axe', stats: { attack: 16 } },

  // armures (slot 'armor') -> PV / défense
  leather: { id: 'leather', name: 'Tunique de cuir', slot: 'armor', icon: 'eq_armor', stats: { hp: 20 } },
  ironmail: { id: 'ironmail', name: 'Armure de fer', slot: 'armor', icon: 'eq_armor', stats: { hp: 30, defense: 5 } },

  // accessoires (slot 'accessory') -> bonus variés
  amulet: { id: 'amulet', name: 'Amulette', slot: 'accessory', icon: 'eq_amulet', stats: { defense: 3 } },
  ring: { id: 'ring', name: 'Anneau de force', slot: 'accessory', icon: 'eq_ring', stats: { attack: 5 } },
}

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
