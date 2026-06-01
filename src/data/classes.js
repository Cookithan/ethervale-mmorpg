/**
 * Classes jouables + apparences. Flux de création : on choisit d'abord la CLASSE,
 * puis une APPARENCE parmi les 3 propres à cette classe (qui « ressemble » à la classe).
 * Chaque apparence est un spritesheet 4×7 (16×16) chargé dans BootScene sous sa clé.
 */

/**
 * Classes : stats de BASE de départ (PV / attaque / défense) + capacités EXCLUSIVES
 * verrouillées à la création (on ne peut plus en changer ensuite).
 *  - abilities.melee  : attaque au corps à corps (épée, touche Espace)
 *  - abilities.ranged : sort/tir à distance (touche F + clic droit)
 *  - abilities.heal   : sort de soin (touche R) — se soigne soi (alliés/réanimation plus tard)
 *  - speedMul : multiplicateur de vitesse de déplacement (1 = normal, Tank = lent)
 *  - kit : résumé court des capacités, affiché sur la carte de classe.
 *  - heroes : 3 apparences propres à la classe (clé de spritesheet + nom affiché).
 */
export const CLASSES = {
  warrior: {
    key: 'warrior', name: 'Guerrier', desc: 'Corps à corps robuste',
    hp: 110, attack: 14, defense: 1, speedMul: 1.0,
    abilities: { melee: true, ranged: false, heal: false },
    kit: 'Épée (Espace)',
    heroes: [
      { key: 'hero_gladiator_blue', name: 'Gladiateur' },
      { key: 'hero_gladiator_red', name: 'Gladiateur rouge' },
      { key: 'hero_samurai_blue', name: 'Samouraï bleu' },
    ],
  },
  mage: {
    key: 'mage', name: 'Mage', desc: 'Sorts à distance, fragile',
    hp: 70, attack: 20, defense: 0, speedMul: 1.0,
    abilities: { melee: false, ranged: true, heal: false },
    kit: 'Sorts (F) · pas d’épée',
    heroes: [
      { key: 'hero_mage_black', name: 'Mage de l’ombre' },
      { key: 'hero_samurai_red', name: 'Mage des cieux' },
      { key: 'hero_sorcerer', name: 'Sorcière de magie' },
    ],
  },
  tank: {
    key: 'tank', name: 'Tank', desc: 'Très lent, énormément de PV',
    hp: 200, attack: 9, defense: 5, speedMul: 0.6,
    abilities: { melee: true, ranged: false, heal: false },
    kit: 'Épée (Espace) · lent',
    heroes: [
      { key: 'hero_knight', name: 'Chevalier' },
      { key: 'hero_knight_gold', name: 'Chevalier doré' },
      { key: 'hero_robot', name: 'Golem de fer' },
    ],
  },
  healer: {
    key: 'healer', name: 'Soigneur', desc: 'Soigne, sorts légers',
    hp: 100, attack: 11, defense: 1, speedMul: 1.0,
    abilities: { melee: false, ranged: true, heal: true },
    kit: 'Soin (R) · sorts (F)',
    heroes: [
      { key: 'hero_monk', name: 'Moine' },
      { key: 'hero_master', name: 'Maître' },
      { key: 'hero_princess', name: 'Prêtresse' },
    ],
  },
}
export const CLASS_LIST = Object.values(CLASSES)

/** Toutes les apparences à plat (pour le chargement + les animations dans BootScene). */
export const HEROES = CLASS_LIST.flatMap((c) => c.heroes)

/** Personnage par défaut (sécurité si on lance le jeu sans passer par la création). */
export const DEFAULT_CHARACTER = { hero: 'hero_gladiator_blue', name: 'Héros', classKey: 'warrior' }
