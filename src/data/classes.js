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
    mana: 60,
    // GAINS PAR NIVEAU (identité de rôle, style trinité) : DPS mêlée équilibré.
    hpPerLevel: 20, defPerLevel: 0, manaPerLevel: 0,
    spell: { id: 'charge', name: 'Charge', cost: 25, cd: 6000, desc: 'Bond/esquive ; blesse les ennemis traversés' }, // bond + dégâts
    spell2: { id: 'whirlwind', name: 'Tourbillon', cost: 45, cd: 12000, level: 10, desc: 'Tournoie : dégâts à TOUS les ennemis autour (déverrouillé niv 10)' },
    abilities: { melee: true, ranged: false, heal: false },
    kit: 'Épée (Espace) · Charge (1)',
    heroes: [
      { key: 'hero_gladiator_blue', name: 'Gladiateur' },
      { key: 'hero_barbarian', name: 'Barbare' }, // Caveman (remplace le samouraï), au MILIEU
      { key: 'hero_gladiator_red', name: 'Gladiateur rouge' },
    ],
  },
  mage: {
    key: 'mage', name: 'Mage', desc: 'Sorts à distance, fragile',
    hp: 70, attack: 20, defense: 0, speedMul: 1.0,
    mana: 120,
    // Fragile mais gros dégâts : peu de PV, beaucoup de mana pour enchaîner les sorts.
    hpPerLevel: 11, defPerLevel: 0, manaPerLevel: 5,
    shootCdMul: 1.5, // tir de base plus RAPIDE (~1.7/sec)
    rangedDmgMul: 1.1, // ...mais qui tape MOINS fort par boule
    spell: { id: 'meteor', name: 'Météore', cost: 45, cd: 8000, desc: 'Incantation puis grosse zone de dégâts' }, // AoE incantée
    spell2: { id: 'mirror', name: 'Image miroir', cost: 55, cd: 18000, level: 10, desc: 'Invoque des copies qui tirent et détournent les coups (déverrouillé niv 10)' },
    abilities: { melee: false, ranged: true, heal: false },
    kit: 'Boule (F) · Météore incanté (1)',
    // magie PROPRE à chaque apparence (couleur du projectile + du Météore)
    heroes: [
      // spellFx = effet d'impact du Météore (anim, texture, taille de frame, teinté ou non par `magic`)
      { key: 'hero_spirit', name: 'Mage des cieux', magic: 0xeaf2ff, spellFx: { anim: 'fx-spirit', tex: 'fx_spirit', frame: 32, tint: true }, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // blanc
      { key: 'hero_mage_black', name: 'Mage de l’ombre', magic: 0x9b4dff, spellFx: { anim: 'fx-spirit', tex: 'fx_spirit', frame: 32, tint: true }, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // violet (au MILIEU)
      { key: 'hero_flam', name: 'Mage de flamme', magic: 0xff3b30, spellFx: { anim: 'fx-explosion', tex: 'fx_explosion', frame: 40, tint: false }, proj: { anim: 'fx-fireball', tex: 'fx_fireball', tint: false } }, // rouge, boule de feu
    ],
  },
  tank: {
    key: 'tank', name: 'Tank', desc: 'Très lent, énormément de PV',
    hp: 200, attack: 9, defense: 5, speedMul: 0.6,
    mana: 70,
    // Mur : énormément de PV ET défense qui monte (encaisse de mieux en mieux), dégâts faibles.
    hpPerLevel: 30, defPerLevel: 1, manaPerLevel: 0,
    attackCdMul: 2.0, // attaque de base nettement plus LENTE (coup lourd de tank)
    meleeKnock: 200, // son coup REPOUSSE l'ennemi
    spell: { id: 'shieldcharge', name: 'Charge de bouclier', cost: 40, cd: 13000, desc: 'Fonce (vitesse) ; gros dégâts d\'impact selon la distance parcourue' }, // sort PRINCIPAL (niv 1)
    spell2: { id: 'provoke', name: 'Provocation', cost: 50, cd: 14000, level: 10, desc: 'Provoque les ennemis proches ET active le Bouclier (-80% dégâts) pendant 5 s (déverrouillé niv 10)' },
    abilities: { melee: true, ranged: false, heal: false },
    kit: 'Coup lent qui repousse (Espace) · Charge (1) · Provocation+Bouclier (2, niv 10) · lent',
    heroes: [
      { key: 'hero_knight', name: 'Chevalier' },
      { key: 'hero_robot', name: 'Golem de fer' }, // au MILIEU
      { key: 'hero_knight_gold', name: 'Chevalier doré' },
    ],
  },
  healer: {
    key: 'healer', name: 'Soigneur', desc: 'Soigne, sorts légers',
    hp: 100, attack: 11, defense: 1, speedMul: 1.0,
    mana: 110,
    // Soutien : PV moyens, beaucoup de mana pour soigner sur la durée.
    hpPerLevel: 14, defPerLevel: 0, manaPerLevel: 4,
    spell: { id: 'heal', name: 'Soin', cost: 30, cd: 4000, desc: 'Rend 35% de tes PV' }, // soin (soi / allié blessé)
    spell2: { id: 'sanctuary', name: 'Sanctuaire', cost: 50, cd: 16000, level: 10, desc: 'Zone de lumière au sol : soigne sur la durée (déverrouillé niv 10)' },
    abilities: { melee: false, ranged: true, heal: true },
    kit: 'Projectile (F) · Soin (1)',
    heroes: [
      { key: 'hero_sorcerer', name: 'Soigneuse des ombres', magic: 0x8ef0a0, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // SorcererBlack ; magie de soin (vert sacré)
      { key: 'hero_cavegirl', name: 'Mia la soigneuse', magic: 0x8ef0a0, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // Cavegirl, au MILIEU
      { key: 'hero_sorcerer_orange', name: 'Soigneuse de la lumière', magic: 0x8ef0a0, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // SorcererOrange
    ],
  },
}
export const CLASS_LIST = Object.values(CLASSES)

/** Toutes les apparences à plat (pour le chargement + les animations dans BootScene). */
export const HEROES = CLASS_LIST.flatMap((c) => c.heroes)

/** Personnage par défaut (sécurité si on lance le jeu sans passer par la création). */
export const DEFAULT_CHARACTER = { hero: 'hero_gladiator_blue', name: 'Héros', classKey: 'warrior' }

/** Chevalier : héros affiché sur l'accueil quand aucune partie n'a encore été lancée. */
export const KNIGHT_CHARACTER = { hero: 'hero_knight', name: 'Chevalier', classKey: 'tank' }
