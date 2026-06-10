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
    hp: 110, attack: 16, defense: 1, speedMul: 1.0, // ATQ 14->16 (buff mêlée : la mêlée galérait face aux casters)
    mana: 60,
    // GAINS PAR NIVEAU (identité de rôle, style trinité) : DPS mêlée équilibré.
    hpPerLevel: 20, defPerLevel: 0, manaPerLevel: 0,
    abilities: { melee: true, ranged: false, heal: false },
    kit: 'Mêlée mobile · saignements 🩸 et cris de guerre',
    heroes: [
      { key: 'hero_gladiator_blue', name: 'Gladiateur' },
      { key: 'hero_blue', name: 'Ninja bleu' }, // NinjaBlue (remplace le Barbare), au MILIEU
      { key: 'hero_gladiator_red', name: 'Gladiateur rouge' },
    ],
  },
  mage: {
    key: 'mage', name: 'Mage', desc: 'Sorts à distance, très fragile',
    hp: 60, attack: 20, defense: 0, speedMul: 1.0,
    mana: 120,
    // TRÈS fragile mais gros dégâts : peu de PV (60), beaucoup de mana ; sorts INCANTÉS (annulables si touché).
    hpPerLevel: 11, defPerLevel: 0, manaPerLevel: 5,
    shootCdMul: 1.5, // tir de base plus RAPIDE (~1.7/sec) -> défense fiable de près
    rangedDmgMul: 0.95, // ...mais qui tape MOINS fort par boule (1.1->0.95 : nerf du Mage trop fort sans stuff)
    abilities: { melee: false, ranged: true, heal: false },
    kit: 'Sorts à distance · élément selon l\'apparence (feu 🔥 / glace ❄️ / ombre 💀)',
    // magie PROPRE à chaque apparence (couleur du projectile + du Météore)
    heroes: [
      // spellFx = effet d'impact du Météore (anim, texture, taille de frame, teinté ou non par `magic`)
      { key: 'hero_spirit', name: 'Mage des cieux', element: 'ice', magic: 0xeaf2ff, spellFx: { anim: 'fx-spirit', tex: 'fx_spirit', frame: 32, tint: true }, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // blanc -> GLACE
      { key: 'hero_mage_black', name: 'Mage de l’ombre', element: 'shadow', magic: 0x9b4dff, spellFx: { anim: 'fx-spirit', tex: 'fx_spirit', frame: 32, tint: true }, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // violet -> OMBRE (au MILIEU)
      { key: 'hero_flam', name: 'Mage de flamme', element: 'fire', magic: 0xff3b30, spellFx: { anim: 'fx-explosion', tex: 'fx_explosion', frame: 40, tint: false }, proj: { anim: 'fx-fireball', tex: 'fx_fireball', tint: false } }, // rouge -> FEU
    ],
  },
  tank: {
    key: 'tank', name: 'Tank', desc: 'Très lent, énormément de PV',
    hp: 200, attack: 11, defense: 5, speedMul: 0.78, // ATQ 9->11 ; vitesse 0.6->0.72->0.78 (assez mobile pour esquiver les AoE télégraphiées des boss)
    mana: 70,
    // Mur : énormément de PV ET défense qui monte (encaisse de mieux en mieux), dégâts faibles.
    hpPerLevel: 30, defPerLevel: 1, manaPerLevel: 0,
    attackCdMul: 1.6, // attaque de base plus LENTE que les autres mais moins pénalisante (2.0->1.6 : ~544 ms/coup)
    meleeKnock: 200, // son coup REPOUSSE l'ennemi
    abilities: { melee: true, ranged: false, heal: false },
    kit: 'Mur de PV · coups qui repoussent · provoque et gèle ❄️',
    heroes: [
      { key: 'hero_knight', name: 'Chevalier' },
      { key: 'hero_robot', name: 'Golem de fer' }, // au MILIEU
      { key: 'hero_knight_gold', name: 'Chevalier doré' },
    ],
  },
  healer: {
    key: 'healer', name: 'Soigneur', desc: 'Soutien, mais sait se défendre',
    hp: 100, attack: 15, defense: 1, speedMul: 1.0,
    mana: 110,
    // Soutien VIABLE EN SOLO : PV moyens, mana abondante, mais tir de base qui tape (attaque 15 + bonus).
    hpPerLevel: 14, defPerLevel: 0, manaPerLevel: 4,
    rangedDmgMul: 1.0, // son projectile sacré (1.15->1.0 : nerf, la Soigneuse cumulait trop tir + soin + bouclier)
    abilities: { melee: false, ranged: true, heal: true },
    kit: 'Soins et boucliers · marque ⚡ et dégâts sacrés',
    heroes: [
      { key: 'hero_sorcerer', name: 'Soigneuse des ombres', magic: 0x8ef0a0, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // SorcererBlack ; magie de soin (vert sacré)
      { key: 'hero_cavegirl', name: 'Mia la soigneuse', magic: 0x8ef0a0, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // Cavegirl, au MILIEU
      { key: 'hero_sorcerer_orange', name: 'Soigneuse de la lumière', magic: 0x8ef0a0, proj: { anim: 'fx-energyball', tex: 'fx_energyball', tint: true } }, // SorcererOrange
    ],
  },
}
export const CLASS_LIST = Object.values(CLASSES)

// (SPELL3_COST et MAGE_KITS — l'ancien système de sorts fixes — ont été SUPPRIMÉS : tout passe par le
//  catalogue SKILLS ci-dessous ; l'élément du mage filtre son pool via skillPoolFor.)

// Icônes de la BARRE DE COMPÉTENCES (pack RPG Ability Icons, CC0). Clé = id du sort / type d'attaque.
export const SKILL_ICONS = {
  // attaque de base (selon abilities.melee / ranged)
  atk_melee: 'skill_atk_melee', atk_ranged: 'skill_atk_ranged',
  // Guerrier
  charge: 'skill_charge', whirlwind: 'skill_whirlwind', warcry: 'skill_warcry',
  seismicstrike: 'skill_shockwave', ragecry: 'skill_warcry', // (icônes réutilisées en attendant des dédiées)
  cleave: 'skill_whirlwind', leap: 'skill_charge', bloodfury: 'skill_warcry',
  // Tank
  shieldcharge: 'skill_shieldcharge', provoke: 'skill_provoke', shockwave: 'skill_shockwave',
  banner: 'skill_provoke', frostward: 'skill_blizzard',
  guardwall: 'skill_shieldcharge', hook: 'skill_provoke', fortress: 'skill_shockwave',
  // Mage — par élément (feu/glace/ombre) + neutres
  firestorm: 'skill_firestorm', pyroblast: 'skill_pyroblast',
  blizzard: 'skill_blizzard', frostlance: 'skill_frostlance',
  voidstorm: 'skill_voidstorm', shadowbolt: 'skill_shadowbolt',
  mirror: 'skill_mirror', blink: 'skill_mirror', meteor: 'skill_pyroblast', cataclysm: 'skill_firestorm',
  // Soigneur
  wordshield: 'skill_wordshield', sanctuary: 'skill_sanctuary', resurrect: 'skill_resurrect',
  heal: 'skill_sanctuary', judgment: 'skill_resurrect', blessing: 'skill_wordshield',
  purify: 'skill_sanctuary', holynova: 'skill_wordshield', smite: 'skill_resurrect',
}

// ============================ BIBLIOTHÈQUE DE COMPÉTENCES (grimoire + loadout) ============================
// Chaque classe a un POOL de compétences ; le joueur en équipe 4 dans sa barre (swap dans l'onglet « Sorts » de la fiche perso,
// au village). Acquisition v1 = DÉBLOCAGE PAR NIVEAU ; les sources de contenu (boss/donjons/Sargèr) viendront
// par `player.unlockedSkills`. Une compétence peut POSER un ÉTAT (système de combos inter-classes) ; en SOLO
// les états jouent surtout en PASSIF (DoT / debuff), la détonation inter-classes brille en multi.
//   id     : identifiant (clé d'effet dans GameScene.SKILL_EFFECTS + icône SKILL_ICONS)
//   cost   : mana ; cd : cooldown (ms) ; level : niveau de déblocage
//   kind   : famille (mobility/aoe/bolt/buff/control/heal/summon) -> couleur de lecture
//   state  : état posé (vulnerable/freeze/burn/bleed/mark) ou absent
//   dmgMul : multiplicateur de dégâts ~ (infobulle), si offensif
export const SKILLS = {
  warrior: [
    { id: 'charge', name: 'Charge', cost: 15, cd: 6000, level: 1, kind: 'mobility', dmgMul: 2.2, desc: 'Bond/esquive ; blesse les ennemis traversés.' },
    { id: 'seismicstrike', name: 'Frappe sismique', cost: 22, cd: 8000, level: 4, kind: 'aoe', state: 'bleed', dmgMul: 1.6, desc: 'Onde au sol : dégâts autour + SAIGNEMENT (🩸 dégâts sur la durée).' },
    { id: 'whirlwind', name: 'Tourbillon', cost: 30, cd: 12000, level: 10, kind: 'aoe', dmgMul: 1.7, desc: 'Tournoie : dégâts à TOUS les ennemis autour.' },
    { id: 'ragecry', name: 'Cri de rage', cost: 28, cd: 16000, level: 16, kind: 'buff', state: 'vulnerable', desc: 'Rugit : +30% d\'attaque (8 s) et rend les ennemis proches VULNÉRABLES (💀).' },
    { id: 'cleave', name: 'Fendoir', cost: 20, cd: 7000, level: 7, kind: 'melee', dmgMul: 1.8, desc: 'Entaille devant soi ; dégâts DOUBLÉS sur une cible VULNÉRABLE (💀).' },
    { id: 'leap', name: 'Bond du bourreau', cost: 25, cd: 11000, level: 13, kind: 'mobility', dmgMul: 1.6, desc: 'Saut (i-frames) ; à l\'atterrissage, dégâts + ÉTOURDIT autour.' },
    { id: 'warcry', name: 'Cri de guerre', cost: 45, cd: 35000, level: 24, kind: 'control', desc: 'Cri intimidant : ÉTOURDIT les ennemis autour (boss inclus, plus bref).' },
    { id: 'bloodfury', name: 'Furie sanglante', cost: 50, cd: 30000, level: 28, kind: 'aoe', state: 'bleed', dmgMul: 2, desc: 'ULT : fait DÉTONER le SAIGNEMENT (🩸) des ennemis proches — gros dégâts cumulés.' },
  ],
  tank: [
    { id: 'shieldcharge', name: 'Charge de bouclier', cost: 20, cd: 13000, level: 1, kind: 'mobility', dmgMul: 2.5, desc: 'Fonce ; dégâts d\'impact selon la distance + étourdit.' },
    { id: 'provoke', name: 'Provocation', cost: 35, cd: 14000, level: 6, kind: 'buff', desc: 'Provoque les ennemis proches ET active le Bouclier (-80% dégâts, 5 s).' },
    { id: 'banner', name: 'Étendard', cost: 30, cd: 18000, level: 12, kind: 'control', state: 'vulnerable', desc: 'Plante un étendard : zone qui rend les ennemis VULNÉRABLES (💀) ~8 s.' },
    { id: 'shockwave', name: 'Onde de choc', cost: 55, cd: 35000, level: 18, kind: 'control', dmgMul: 2.2, desc: 'Slam : anneau de pics, dégâts + ÉTOURDIT + provoque.' },
    { id: 'frostward', name: 'Givre-bouclier', cost: 30, cd: 16000, level: 22, kind: 'buff', state: 'freeze', desc: 'Bouclier de givre (5 s) : tout ennemi qui te frappe est GELÉ (❄️).' },
    { id: 'guardwall', name: 'Mur de garde', cost: 30, cd: 16000, level: 8, kind: 'buff', desc: 'Lève un grand bouclier qui ABSORBE de gros dégâts (~50% des PV max) un moment.' },
    { id: 'hook', name: 'Heurtoir', cost: 20, cd: 10000, level: 14, kind: 'control', dmgMul: 1.4, desc: 'Harponne l\'ennemi le plus proche, l\'attire à toi et l\'ÉTOURDIT brièvement.' },
    { id: 'fortress', name: 'Forteresse', cost: 55, cd: 35000, level: 28, kind: 'buff', state: 'vulnerable', desc: 'ULT : −80% dégâts subis (4 s), provoque et rend VULNÉRABLES (💀) les ennemis autour.' },
  ],
  // MAGE : chaque sort élémentaire porte un `element` (feu/glace/ombre). Le mage est LIMITÉ à l'élément de son
  // APPARENCE (cf. skillPoolFor) -> un mage d'ombre n'a PAS accès au feu/glace. Les sorts SANS `element` (Image
  // miroir) sont neutres = accessibles à tous les mages. Progression par élément : zone niv.1, trait niv.10.
  mage: [
    { id: 'firestorm', name: 'Tempête de feu', element: 'fire', cost: 30, cd: 8000, level: 1, kind: 'aoe', state: 'burn', desc: 'Zone de feu : dégâts + EMBRASE (🔥 dégâts sur la durée).' },
    { id: 'blizzard', name: 'Blizzard', element: 'ice', cost: 30, cd: 8000, level: 1, kind: 'aoe', state: 'freeze', desc: 'Zone de givre : dégâts + GÈLE (❄️ immobilise/ralentit).' },
    { id: 'voidstorm', name: "Tempête d'ombre", element: 'shadow', cost: 30, cd: 8000, level: 1, kind: 'aoe', state: 'vulnerable', desc: "Zone d'ombre : dégâts + VULNÉRABLE (💀 +dégâts subis)." },
    { id: 'pyroblast', name: 'Pyroblast', element: 'fire', cost: 50, cd: 11000, level: 10, kind: 'bolt', state: 'burn', dmgMul: 3.5, desc: 'Trait de feu : ÉNORMES dégâts mono-cible + EMBRASE (🔥).' },
    { id: 'frostlance', name: 'Lance de givre', element: 'ice', cost: 50, cd: 11000, level: 10, kind: 'bolt', state: 'freeze', dmgMul: 3.2, desc: 'Trait de glace : gros dégâts mono-cible + GÈLE (❄️).' },
    { id: 'shadowbolt', name: "Trait d'ombre", element: 'shadow', cost: 50, cd: 11000, level: 10, kind: 'bolt', state: 'vulnerable', dmgMul: 3.2, desc: "Trait d'ombre : gros dégâts mono-cible + VULNÉRABLE (💀)." },
    { id: 'blink', name: 'Téléportation', cost: 20, cd: 7000, level: 6, kind: 'mobility', aim: true, desc: 'Vise une destination (clic) puis téléporte-toi (clic droit = annuler). Neutre, tous mages.' },
    { id: 'meteor', name: 'Météore', cost: 45, cd: 14000, level: 16, kind: 'aoe', dmgMul: 3, desc: 'Incantation : énorme impact de zone sur la cible. Neutre, tous mages.' },
    { id: 'mirror', name: 'Image miroir', cost: 70, cd: 35000, level: 20, kind: 'summon', desc: 'Invoque des clones qui combattent et détournent les ennemis (neutre, tous mages).' },
    { id: 'cataclysm', name: 'Cataclysme', cost: 75, cd: 36000, level: 28, kind: 'aoe', desc: 'ULT : déchaîne une zone immense qui DÉTONE tous les états (🔥❄️💀🩸) du champ. Neutre.' },
  ],
  healer: [
    { id: 'wordshield', name: 'Mot de pouvoir : Bouclier', cost: 25, cd: 7000, level: 1, kind: 'heal', desc: 'Bouclier d\'absorption + petit soin immédiat.' },
    { id: 'heal', name: 'Vague de soin', cost: 30, cd: 6000, level: 3, kind: 'heal', desc: 'Soin direct (≈35% des PV max).' },
    { id: 'judgment', name: 'Sceau de jugement', cost: 22, cd: 9000, level: 8, kind: 'control', state: 'mark', dmgMul: 1.2, desc: 'Marque une cible (⚡) : tes coups lui infligent un bonus sacré (passif).' },
    { id: 'sanctuary', name: 'Sanctuaire', cost: 40, cd: 16000, level: 10, kind: 'heal', desc: 'Zone de lumière : soigne sur la durée.' },
    { id: 'blessing', name: 'Bénédiction', cost: 30, cd: 18000, level: 14, kind: 'buff', desc: 'Bénédiction : +attaque et +défense (12 s).' },
    { id: 'purify', name: 'Purification', cost: 25, cd: 12000, level: 8, kind: 'heal', desc: 'Lumière purificatrice : te soigne et RALENTIT les ennemis proches.' },
    { id: 'holynova', name: 'Nova sacrée', cost: 35, cd: 12000, level: 16, kind: 'aoe', dmgMul: 1.5, desc: 'Explosion de lumière : te soigne ET inflige des dégâts sacrés autour.' },
    { id: 'smite', name: 'Châtiment', cost: 30, cd: 7000, level: 18, kind: 'bolt', state: 'mark', dmgMul: 2, desc: 'Trait sacré ; dégâts DOUBLÉS si la cible est MARQUÉE (⚡) ou VULNÉRABLE (💀).' },
    { id: 'resurrect', name: 'Intervention divine', cost: 65, cd: 35000, level: 24, kind: 'heal', desc: 'Réanime un allié / invulnérabilité + soin (solo : auto-soin d\'urgence).' },
  ],
}

// COMPÉTENCES GATED (fortes/rares) : NON déblocables par niveau — gagnées UNIQUEMENT en battant des boss
// (la « chasse à la compétence », cf. player.unlockedSkills + GameScene.tryUnlockSkillFromBoss). Le `level`
// reste l'ORDRE d'acquisition (on les apprend dans cet ordre, une par boss).
const GATED_SKILLS = new Set(['ragecry', 'warcry', 'bloodfury', 'shockwave', 'frostward', 'fortress', 'meteor', 'mirror', 'cataclysm', 'holynova', 'smite', 'resurrect'])
for (const list of Object.values(SKILLS)) for (const s of list) if (GATED_SKILLS.has(s.id)) s.gated = true

// Index plat : id -> def enrichie de `classKey` (pour cast/UI/save sans reparcourir).
export const SKILL_BY_ID = {}
for (const [cls, list] of Object.entries(SKILLS)) for (const s of list) SKILL_BY_ID[s.id] = { ...s, classKey: cls }

/** Pool de compétences DISPONIBLES pour un personnage (classe + apparence). Le MAGE est restreint à l'ÉLÉMENT
 *  de son apparence (feu/glace/ombre) + les sorts neutres (sans `element`) ; les autres classes = tout le pool. */
export function skillPoolFor(classKey, element = null) {
  const list = SKILLS[classKey] ?? []
  if (classKey !== 'mage') return list
  return list.filter((s) => !s.element || s.element === element)
}

/** Liste des compétences CONNUES (déverrouillées) pour une classe/apparence à un niveau donné (+ ids débloqués
 *  par le contenu). Ordre = ordre du catalogue (≈ ordre de déblocage). */
export function knownSkillsFor(classKey, level, unlocked = [], element = null) {
  const set = new Set(unlocked)
  // gated = jamais par niveau (uniquement via `unlocked`, gagné sur un boss) ; les autres = par niveau.
  return skillPoolFor(classKey, element).filter((s) => set.has(s.id) || (!s.gated && level >= s.level))
}

/** Loadout de DÉPART : remplit jusqu'à 4 slots avec les compétences connues (ordre catalogue). */
export function defaultLoadout(classKey, level = 1, unlocked = [], element = null) {
  return knownSkillsFor(classKey, level, unlocked, element).slice(0, 4).map((s) => s.id)
}

/** Toutes les apparences à plat (pour le chargement + les animations dans BootScene). */
export const HEROES = CLASS_LIST.flatMap((c) => c.heroes)

/** Personnage par défaut (sécurité si on lance le jeu sans passer par la création). */
export const DEFAULT_CHARACTER = { hero: 'hero_gladiator_blue', name: 'Héros', classKey: 'warrior' }

/** Chevalier : héros affiché sur l'accueil quand aucune partie n'a encore été lancée. */
export const KNIGHT_CHARACTER = { hero: 'hero_knight', name: 'Chevalier', classKey: 'tank' }
