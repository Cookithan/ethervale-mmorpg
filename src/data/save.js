/**
 * Sauvegarde locale (navigateur) — une seule partie.
 * Tout est sérialisable en JSON (les objets d'équipement sont des données pures).
 */
const KEY = 'mmorpg_save_v1'

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY)
  } catch {
    return false
  }
}

export function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* localStorage indisponible : on ignore */
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

/** Construit l'objet de sauvegarde à partir du joueur + de son personnage (apparence/nom/classe). */
export function makeSave(player, character) {
  return {
    character,
    level: player.level,
    xp: player.xp,
    xpToNext: player.xpToNext,
    gold: player.gold,
    baseMaxHp: player.baseMaxHp,
    baseAttack: player.baseAttack,
    baseDefense: player.baseDefense,
    baseMana: player.baseMana,
    hp: player.hp,
    equipped: player.equipped,
    inventory: player.inventory,
    hasBoat: player.hasBoat,
    resources: player.resources, // poche de matériaux empilables
    quest: player.quest, // quête active (chaîne)
    questsDone: player.questsDone,
    deathBag: player.deathBag, // sac de mort en attente de récupération (A1)
    deathsSinceRecovery: player.deathsSinceRecovery,
    x: Math.round(player.x),
    y: Math.round(player.y),
  }
}
