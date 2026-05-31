/**
 * Héros jouables (apparence) + classes (stats de départ).
 * Les héros sont tous des spritesheets 4×7 (16x16) chargés dans BootScene sous la clé `key`.
 */
export const HEROES = [
  { key: 'hero_green', name: 'Vert' },
  { key: 'hero_red', name: 'Rouge' },
  { key: 'hero_blue', name: 'Bleu' },
  { key: 'hero_yellow', name: 'Jaune' },
  { key: 'hero_dark', name: 'Sombre' },
  { key: 'hero_fire', name: 'Feu' },
]

// classes : modifient les stats de BASE de départ (PV / attaque / défense).
export const CLASSES = {
  warrior: { key: 'warrior', name: 'Guerrier', desc: 'Équilibré et robuste', hp: 110, attack: 14, defense: 1 },
  mage: { key: 'mage', name: 'Mage', desc: 'Frappe fort mais fragile', hp: 80, attack: 19, defense: 0 },
  tank: { key: 'tank', name: 'Tank', desc: 'Très résistant, cogne peu', hp: 160, attack: 9, defense: 4 },
}
export const CLASS_LIST = Object.values(CLASSES)

/** Personnage par défaut (sécurité si on lance le jeu sans passer par la création). */
export const DEFAULT_CHARACTER = { hero: 'hero_green', name: 'Héros', classKey: 'warrior' }
