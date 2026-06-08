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
    shopLevels: player.shopLevels, // niveaux de rénovation des boutiques de lieu (apothicaire/taverne) PAR PERSO
    foodBuff: player.foodBuff, // buff de repas/élixir en cours (atk/def/regen + until) — survit à une sauvegarde rapide
    resources: player.resources, // poche de matériaux empilables
    quest: player.quest, // quête active (chaîne)
    questsDone: player.questsDone,
    deathBag: player.deathBag, // sac de mort en attente de récupération (A1)
    deathsSinceRecovery: player.deathsSinceRecovery,
    respawnHome: player.respawnHome, // a dormi au dortoir -> respawn dans son lit à la mort
    setPity: player.setPity, // compteur anti-malchance des pièces de panoplie (par id)
    reviveCharge: player.reviveCharge, // bénédiction de résurrection (Soigneur, set) en attente
    exploredFog: player.exploredFog, // brouillard de guerre : cellules de carte déjà explorées
    x: Math.round(player.x),
    y: Math.round(player.y),
  }
}

// ============================ MULTI-PERSONNAGES (compte local) ============================
// Modèle WoW : un "compte" local = une LISTE de personnages INDÉPENDANTS (chacun a son niveau, son
// équipement, son or, ses quêtes…). Stocké sous ACCOUNT_KEY. L'ancienne save unique (KEY) est migrée
// automatiquement en perso #1 (aucune perte). On garde aussi l'ancienne KEY comme filet de sécurité.
const ACCOUNT_KEY = 'mmorpg_account_v1'
export const MAX_CHARACTERS = 6

/** id unique de personnage (jamais réutilisé). */
export function genCharId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Écrit l'objet compte. */
export function saveAccount(acc) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc))
    return true
  } catch {
    return false
  }
}

/** Lit le compte (liste de persos). MIGRE l'ancienne save unique en perso #1 si besoin. */
export function loadAccount() {
  let acc = null
  try {
    acc = JSON.parse(localStorage.getItem(ACCOUNT_KEY))
  } catch {
    acc = null
  }
  if (acc && Array.isArray(acc.characters)) return acc
  // MIGRATION : ancienne sauvegarde unique -> perso #1 d'un nouveau compte
  acc = { version: 1, lastPlayedId: null, characters: [] }
  const legacy = loadSave()
  if (legacy && legacy.character) {
    const id = genCharId()
    acc.characters.push({ id, save: legacy })
    acc.lastPlayedId = id
  }
  saveAccount(acc)
  return acc
}

/** Liste des personnages [{id, save}], le DERNIER JOUÉ en premier. */
export function listCharacters() {
  const acc = loadAccount()
  return acc.characters
    .slice()
    .sort((a, b) => (b.id === acc.lastPlayedId ? 1 : 0) - (a.id === acc.lastPlayedId ? 1 : 0))
}

/** Sauvegarde d'un perso par id (ou null). */
export function getCharacterSave(id) {
  if (!id) return null
  return loadAccount().characters.find((c) => c.id === id)?.save ?? null
}

/** Insère/met à jour la sauvegarde d'un perso + le marque "dernier joué". */
export function saveCharacter(id, saveObj) {
  if (!id) return false
  const acc = loadAccount()
  const e = acc.characters.find((c) => c.id === id)
  if (e) e.save = saveObj
  else acc.characters.push({ id, save: saveObj })
  acc.lastPlayedId = id
  return saveAccount(acc)
}

/** Supprime un perso (définitif). */
export function deleteCharacter(id) {
  const acc = loadAccount()
  acc.characters = acc.characters.filter((c) => c.id !== id)
  if (acc.lastPlayedId === id) acc.lastPlayedId = acc.characters[0]?.id ?? null
  return saveAccount(acc)
}

/** Sauvegarde du DERNIER perso joué (pour l'aperçu vivant du menu). */
export function lastPlayedSave() {
  const acc = loadAccount()
  const id = acc.lastPlayedId ?? acc.characters[0]?.id
  return acc.characters.find((c) => c.id === id)?.save ?? null
}
