/**
 * Catalogue des objets d'équipement (Phase 3 + marchand).
 * Chaque objet : id, nom, slot (weapon/armor/focus/ring), icône (clé de texture),
 * rareté, prix d'achat, et bonus de stats appliqués quand il est équipé.
 */

// 4 paliers de rareté : Commun(gris) · Rare(bleu) · Épique(violet) · Légendaire(or, BOSS only).
// ⚠️ Les CLÉS internes sont conservées pour ne rien casser dans le code existant :
//   'rare' = palier RARE (bleu) · 'epic' = palier ÉPIQUE (violet) · 'legendary' (or).
export const RARITY = {
  common: { label: 'Commun', color: '#dcdcdc', tint: 0x9aa4b0, weight: 60 },
  rare: { label: 'Rare', color: '#4aa3ff', tint: 0x3a7fd0, weight: 25 },
  epic: { label: 'Épique', color: '#c77dff', tint: 0xa335ee, weight: 12 },
  legendary: { label: 'Légendaire', color: '#ffb02e', tint: 0xffae22, weight: 3 },
}

// Marquage des PIÈCES DE PANOPLIE (champ `item.set`) : couleur VERT ÉMERAUDE distincte, prioritaire
// sur la rareté pour la couleur/contour/filigrane (le palier reste légendaire/épique en interne pour
// le butin et le scaling). Vide pour les items normaux. Voir helpers itemColor/itemTint ci-dessous.
export const SET_COLOR = '#3ddc84' // émeraude (texte/contours)
export const SET_TINT = 0x2ecc71 // émeraude (teintes de sprite/filigrane)

// PANOPLIES (brief §4) : 1 par classe, 4 pièces (arme + armure + relique + anneau). Le champ `item.set`
// pointe vers une clé ici. 2 pièces équipées -> `bonus2` ; 4 pièces (complète) -> `bonus4` + débloque la
// COMPÉTENCE DE SET `skill` (sort 3 / touche 3, géré à l'étape 7). Bonus = stats cumulées dans recomputeStats.
export const SETS = {
  warrior: { name: 'Dernier Chevalier', class: 'warrior', skill: 'warcry', skillName: 'Cri intimidant',
    skillDesc: 'Les ennemis proches sont effrayés et fuient.',
    bonus2: { attack: 8 }, bonus4: { attack: 18, hp: 40 } },
  tank: { name: 'Cœur en Pierre', class: 'tank', skill: 'shockwave', skillName: 'Onde de choc',
    skillDesc: 'Étourdit les ennemis autour et les force à t\'attaquer.',
    bonus2: { hp: 40, defense: 6 }, bonus4: { hp: 110, defense: 16 } },
  mage: { name: 'Magie Ancienne', class: 'mage', skill: 'mirror', skillName: 'Image miroir',
    skillDesc: 'Invoque des clones qui tirent et détournent les coups.',
    bonus2: { mana: 40, spellPower: 0.12 }, bonus4: { mana: 100, spellPower: 0.3 } },
  healer: { name: 'Vie Sacrée', class: 'healer', skill: 'resurrect', skillName: 'Résurrection',
    skillDesc: 'Te relève automatiquement une fois (auto-résurrection solo).',
    bonus2: { mana: 40, manaRegen: 3 }, bonus4: { mana: 100, manaRegen: 6 } },
}

/** Nb de pièces de la panoplie `setKey` équipées + bonus actif. Renvoie { count, set, bonus } (bonus =
 *  cumul des stats actives : 0 si <2, bonus2 si 2-3, bonus2+bonus4 si 4). */
export function setStatus(equipped, setKey) {
  const set = SETS[setKey]
  if (!set) return { count: 0, set: null, bonus: {} }
  let count = 0
  for (const slot of Object.keys(equipped)) if (equipped[slot]?.set === setKey) count++
  const bonus = {}
  const add = (b) => { for (const [k, v] of Object.entries(b)) bonus[k] = (bonus[k] ?? 0) + v }
  if (count >= 2) add(set.bonus2)
  if (count >= 4) add(set.bonus4)
  return { count, set, bonus }
}

/** Couleur d'affichage (texte) d'un objet : émeraude si pièce de set, sinon couleur de rareté. */
export function itemColor(item) {
  if (item?.set) return SET_COLOR
  return RARITY[item?.rarity]?.color ?? '#ffffff'
}

/** Teinte (contours/filigranes) d'un objet : émeraude si pièce de set, sinon teinte de rareté. */
export function itemTint(item) {
  if (item?.set) return SET_TINT
  return RARITY[item?.rarity]?.tint ?? null
}

// `dur` = durabilité max (armes/armures s'usent au combat ; à 0 l'objet casse et se
// déséquipe -> à réparer chez le forgeron). Les accessoires n'ont pas de durabilité.
// `iconTint` (optionnel) = teinte appliquée à l'icône (différencie des items qui partagent un sprite :
// tiers d'armure, bâtons de soigneur teintés vert...). Appliqué partout où l'icône est dessinée.
export const ITEMS = {
  // ===== ARMES (slot 'weapon') -> +Attaque. `classes` = classes autorisées. L'icône `wpn_*` sert AUSSI
  // de sprite qui swingue à l'attaque (showWeaponSwing). =====
  // Guerrier (épées / lames, tranche 'fx-slash') :
  dagger: { id: 'dagger', name: 'Dague', slot: 'weapon', classes: ['warrior'], icon: 'aw_dagger', rarity: 'common', price: 45, stats: { attack: 4 }, dur: 40, fx: 'fx-slash' },
  sword: { id: 'sword', name: 'Épée', slot: 'weapon', classes: ['warrior'], icon: 'aw_sword', rarity: 'common', price: 100, stats: { attack: 7 }, dur: 50, fx: 'fx-slash' },
  sabre: { id: 'sabre', name: 'Sabre courbe', slot: 'weapon', classes: ['warrior'], icon: 'aw_sabre', rarity: 'rare', price: 200, stats: { attack: 11 }, dur: 65, fx: 'fx-slash' },
  katana: { id: 'katana', name: 'Katana', slot: 'weapon', classes: ['warrior'], icon: 'aw_katana', rarity: 'rare', price: 220, stats: { attack: 12 }, dur: 70, fx: 'fx-slash' },
  kris: { id: 'kris', name: "Kris de l'ombre", slot: 'weapon', classes: ['warrior'], icon: 'aw_kris', rarity: 'epic', price: 520, stats: { attack: 18 }, dur: 100, fx: 'fx-slash' },
  rapier: { id: 'rapier', name: 'Rapière du duelliste', slot: 'weapon', classes: ['warrior'], icon: 'aw_rapier', rarity: 'epic', price: 580, stats: { attack: 19 }, dur: 110, fx: 'fx-slash' },
  // Guerrier — armes à LANCER (`ranged: true` -> l'attaque PROJETTE l'arme vers l'ennemi visible) :
  throwknife: { id: 'throwknife', name: 'Couteaux de lancer', slot: 'weapon', classes: ['warrior'], icon: 'fx_kunai', ranged: true, proj: { tex: 'fx_kunai' }, rarity: 'common', price: 90, stats: { attack: 4 }, dur: 45 },
  shuriken: { id: 'shuriken', name: 'Shuriken', slot: 'weapon', classes: ['warrior'], icon: 'fx_shuriken', ranged: true, proj: { tex: 'fx_shuriken', anim: 'fx-shuriken' }, rarity: 'rare', price: 200, stats: { attack: 8 }, dur: 60 },
  // Tank (masses / lames lourdes -> slash circulaire 'fx-circslash') :
  club: { id: 'club', name: 'Gourdin', slot: 'weapon', classes: ['tank'], icon: 'at_club', rarity: 'common', price: 90, stats: { attack: 5 }, dur: 60, fx: 'fx-circslash' },
  warhammer: { id: 'warhammer', name: 'Marteau de guerre', slot: 'weapon', classes: ['tank'], icon: 'at_warhammer', rarity: 'rare', price: 240, stats: { attack: 10 }, dur: 90, fx: 'fx-circslash' },
  axe: { id: 'axe', name: 'Hache de guerre', slot: 'weapon', classes: ['tank'], icon: 'at_axe', rarity: 'rare', price: 250, stats: { attack: 11 }, dur: 85, fx: 'fx-circslash' },
  greatblade: { id: 'greatblade', name: 'Lame colossale', slot: 'weapon', classes: ['tank'], icon: 'at_greatblade', rarity: 'epic', price: 580, stats: { attack: 17 }, dur: 120, fx: 'fx-circslash' },
  warlance: { id: 'warlance', name: 'Pertuisane', slot: 'weapon', classes: ['tank'], icon: 'at_warlance', rarity: 'epic', price: 560, stats: { attack: 16 }, dur: 115, fx: 'fx-circslash' },
  // Mage (baguettes / bâtons / grimoire) — pas de swing (le mage incante/tire) :
  wand: { id: 'wand', name: 'Baguette arcanique', slot: 'weapon', classes: ['mage'], icon: 'am_wand', rarity: 'common', price: 100, stats: { attack: 7 }, dur: 40 },
  grimoire: { id: 'grimoire', name: 'Grimoire interdit', slot: 'weapon', classes: ['mage'], icon: 'am_grimoire', heldScale: 0.7, rarity: 'rare', price: 240, stats: { attack: 12 }, dur: 60 },
  archstaff: { id: 'archstaff', name: "Bâton de l'archimage", slot: 'weapon', classes: ['mage'], icon: 'am_archstaff', rarity: 'epic', price: 580, stats: { attack: 19 }, dur: 80 },
  // Soigneur (sceptres bénis) — pas de swing :
  healstick: { id: 'healstick', name: 'Bâton de soin', slot: 'weapon', classes: ['healer'], icon: 'ah_healstick', rarity: 'common', price: 90, stats: { attack: 4 }, dur: 40 },
  healwand: { id: 'healwand', name: 'Sceptre béni', slot: 'weapon', classes: ['healer'], icon: 'ah_healwand', rarity: 'rare', price: 220, stats: { attack: 8 }, dur: 60 },
  relic: { id: 'relic', name: 'Relique sacrée', slot: 'weapon', classes: ['healer'], icon: 'ah_relic', rarity: 'epic', price: 540, stats: { attack: 12 }, dur: 80 },

  // ===== ARMURES (slot 'armor') -> PV / défense. Icônes Kyrise DISTINCTES par pièce (armor_01 a/b/c/e). =====
  leather: { id: 'leather', name: 'Tunique de cuir', slot: 'armor', icon: 'eq_leather', rarity: 'common', price: 90, stats: { hp: 16 }, dur: 50 },
  chainmail: { id: 'chainmail', name: 'Cotte de mailles', slot: 'armor', icon: 'eq_mail', rarity: 'rare', price: 240, stats: { hp: 26, defense: 4 }, dur: 80 },
  plate: { id: 'plate', name: 'Armure de plaques', slot: 'armor', icon: 'eq_plate', rarity: 'epic', price: 560, stats: { hp: 42, defense: 8 }, dur: 120 },
  // Armures THÉMATIQUES (résistance à la température) : à équiper avant d'explorer neige/désert.
  furcloak: { id: 'furcloak', name: 'Cape de fourrure', slot: 'armor', icon: 'eq_armor', iconTint: 0xe6f0ff, rarity: 'rare', price: 230, stats: { hp: 22, defense: 2, coldResist: 55 }, dur: 70 },
  desertgarb: { id: 'desertgarb', name: 'Habit du désert', slot: 'armor', icon: 'eq_armor', iconTint: 0xe8c987, rarity: 'rare', price: 230, stats: { hp: 22, defense: 2, heatResist: 55 }, dur: 70 },

  // ===== RELIQUES (slot 'focus', label « Relique ») -> améliorent LA COMPÉTENCE. Une relique donne SOIT
  // +effet/dégâts du sort (`spellPower`), SOIT +durée d'effet (`spellDuration`). Plus de réduction de cooldown. =====
  focus1: { id: 'focus1', name: "Parchemin d'apprenti", slot: 'focus', icon: 'foc_scroll', rarity: 'common', price: 110, spellPower: 0.1 },
  focus2: { id: 'focus2', name: 'Cristal de givre', slot: 'focus', icon: 'rel_frost', rarity: 'rare', price: 260, spellDuration: 0.22, stats: { manaRegen: 2 } },
  focus3: { id: 'focus3', name: 'Cristal de foudre', slot: 'focus', icon: 'rel_thunder', rarity: 'epic', price: 580, spellPower: 0.32, stats: { manaRegen: 3 } },
  focus_fire: { id: 'focus_fire', name: 'Cristal de flammes', slot: 'focus', icon: 'rel_flame', rarity: 'epic', price: 600, spellPower: 0.4 },

  // ===== ANNEAUX (slot 'ring') -> +Mana max (+ bonus secondaire). Icônes Kyrise (anneaux à gemme sertie). =====
  amulet: { id: 'amulet', name: 'Anneau de mana', slot: 'ring', icon: 'eq_ring_band', rarity: 'common', price: 90, stats: { mana: 16, manaRegen: 1 } },
  ring: { id: 'ring', name: "Anneau d'émeraude", slot: 'ring', icon: 'eq_ring_emerald', rarity: 'rare', price: 220, stats: { mana: 34, attack: 3 } },
  ring_topaz: { id: 'ring_topaz', name: 'Anneau de topaze', slot: 'ring', icon: 'eq_ring_topaz', rarity: 'rare', price: 230, stats: { mana: 28, hp: 14 } },
  signet: { id: 'signet', name: 'Anneau de saphir', slot: 'ring', icon: 'eq_ring_sapphire', rarity: 'epic', price: 520, stats: { mana: 58, defense: 3, manaRegen: 3 } },

  // ===== LÉGENDAIRES (or) — EXCLUSIFS AUX BOSS (jamais au marchand/butin normal, cf. SHOP_STOCK / equipmentOfTier) =====
  // LÉGENDAIRES d'arme = sprites spectaculaires Admurin (icône). Les classes de mêlée gardent un `swingTex`
  // Ninja pour l'animation de coup (l'icône Admurin est orientée en diagonale, pas alignée sur l'arc du swing).
  legend_sword: { id: 'legend_sword', name: "Lame d'Excalibur", slot: 'weapon', classes: ['warrior'], icon: 'wpn_legend_sword', rarity: 'legendary', price: 600, stats: { attack: 40 }, dur: 200, fx: 'fx-slash' },
  legend_hammer: { id: 'legend_hammer', name: 'Marteau des Titans', slot: 'weapon', classes: ['tank'], icon: 'wpn_legend_mace', rarity: 'legendary', price: 600, stats: { attack: 34 }, dur: 220, fx: 'fx-circslash' },
  legend_staff: { id: 'legend_staff', name: 'Bâton Cosmique', slot: 'weapon', classes: ['mage'], icon: 'wpn_legend_staff', rarity: 'legendary', price: 600, stats: { attack: 40 }, dur: 160 },
  legend_relic: { id: 'legend_relic', name: 'Relique Divine', slot: 'weapon', classes: ['healer'], icon: 'wpn_legend_scepter', rarity: 'legendary', price: 560, stats: { attack: 26 }, dur: 160 },
  legend_armor: { id: 'legend_armor', name: 'Armure du Dragon', slot: 'armor', icon: 'eq_dragon', rarity: 'legendary', price: 560, stats: { hp: 90, defense: 18 }, dur: 240 },
  legend_focus: { id: 'legend_focus', name: 'Cristal Cosmique', slot: 'focus', icon: 'rel_cosmic', rarity: 'legendary', price: 560, spellPower: 0.6, spellDuration: 0.4, stats: { manaRegen: 4 } },
  legend_ring: { id: 'legend_ring', name: 'Anneau Cosmique', slot: 'ring', icon: 'eq_ring_ruby', rarity: 'legendary', price: 560, stats: { mana: 120, attack: 8, manaRegen: 5 } },

  // ===== PIÈCES DE PANOPLIE (champ `set`) — marquage VERT ÉMERAUDE, BOSS only (jamais marchand/butin normal).
  // 4 par classe (arme/armure/relique/anneau). Voir SETS pour les bonus 2/4 pièces. =====
  // -- Guerrier : « Dernier Chevalier » --
  set_war_weapon: { id: 'set_war_weapon', name: 'Lame du Dernier Chevalier', slot: 'weapon', classes: ['warrior'], icon: 'set_sword', set: 'warrior', rarity: 'epic', price: 800, stats: { attack: 22 }, dur: 200, fx: 'fx-slash' },
  set_war_armor: { id: 'set_war_armor', name: 'Cuirasse du Serment', slot: 'armor', classes: ['warrior'], icon: 'eq_plate', set: 'warrior', rarity: 'epic', price: 800, stats: { hp: 48, defense: 9 }, dur: 160 },
  set_war_relic: { id: 'set_war_relic', name: 'Étendard du Chevalier', slot: 'focus', classes: ['warrior'], icon: 'rel_emerald', set: 'warrior', rarity: 'epic', price: 800, spellDuration: 0.3 },
  set_war_ring: { id: 'set_war_ring', name: 'Anneau du Serment', slot: 'ring', classes: ['warrior'], icon: 'eq_ring_emerald', set: 'warrior', rarity: 'epic', price: 800, stats: { mana: 30, attack: 5 } },
  // -- Tank : « Cœur en Pierre » --
  set_tank_weapon: { id: 'set_tank_weapon', name: 'Masse du Cœur en Pierre', slot: 'weapon', classes: ['tank'], icon: 'set_glaive', set: 'tank', rarity: 'epic', price: 800, stats: { attack: 19 }, dur: 220, fx: 'fx-circslash' },
  set_tank_armor: { id: 'set_tank_armor', name: 'Carapace de Granit', slot: 'armor', classes: ['tank'], icon: 'eq_mail', set: 'tank', rarity: 'epic', price: 800, stats: { hp: 60, defense: 12 }, dur: 200 },
  set_tank_relic: { id: 'set_tank_relic', name: 'Pierre du Gardien', slot: 'focus', classes: ['tank'], icon: 'rel_emerald', set: 'tank', rarity: 'epic', price: 800, spellDuration: 0.3 },
  set_tank_ring: { id: 'set_tank_ring', name: 'Anneau Tellurique', slot: 'ring', classes: ['tank'], icon: 'eq_ring_emerald', set: 'tank', rarity: 'epic', price: 800, stats: { mana: 24, hp: 24, defense: 3 } },
  // -- Mage : « Magie Ancienne » --
  set_mage_weapon: { id: 'set_mage_weapon', name: 'Sceptre de la Magie Ancienne', slot: 'weapon', classes: ['mage'], icon: 'set_scepter', set: 'mage', rarity: 'epic', price: 800, stats: { attack: 21 }, dur: 160 },
  set_mage_armor: { id: 'set_mage_armor', name: 'Robe Runique', slot: 'armor', classes: ['mage'], icon: 'eq_leather', set: 'mage', rarity: 'epic', price: 800, stats: { hp: 32, mana: 30 }, dur: 140 },
  set_mage_relic: { id: 'set_mage_relic', name: 'Tome Ancien', slot: 'focus', classes: ['mage'], icon: 'rel_emerald', set: 'mage', rarity: 'epic', price: 800, spellPower: 0.35, stats: { manaRegen: 3 } },
  set_mage_ring: { id: 'set_mage_ring', name: 'Anneau Arcanique', slot: 'ring', classes: ['mage'], icon: 'eq_ring_emerald', set: 'mage', rarity: 'epic', price: 800, stats: { mana: 70, manaRegen: 3 } },
  // -- Soigneur : « Vie Sacrée » --
  set_heal_weapon: { id: 'set_heal_weapon', name: 'Sceptre de la Vie Sacrée', slot: 'weapon', classes: ['healer'], icon: 'set_scepter', set: 'healer', rarity: 'epic', price: 800, stats: { attack: 15 }, dur: 160 },
  set_heal_armor: { id: 'set_heal_armor', name: 'Robe Sacrée', slot: 'armor', classes: ['healer'], icon: 'eq_leather', set: 'healer', rarity: 'epic', price: 800, stats: { hp: 32, mana: 30 }, dur: 140 },
  set_heal_relic: { id: 'set_heal_relic', name: 'Reliquaire Béni', slot: 'focus', classes: ['healer'], icon: 'rel_emerald', set: 'healer', rarity: 'epic', price: 800, spellPower: 0.3, stats: { manaRegen: 3 } },
  set_heal_ring: { id: 'set_heal_ring', name: 'Anneau Béni', slot: 'ring', classes: ['healer'], icon: 'eq_ring_emerald', set: 'healer', rarity: 'epic', price: 800, stats: { mana: 70, manaRegen: 4 } },

  // ===== ÉQUIPEMENT FORGÉ (champ `craftedOnly`) — EXCLUSIF À L'ARTISANAT chez Aldric (jamais marchand/butin,
  // cf. SHOP_STOCK / equipmentOfTier). Gamme « milieu de gamme » qui comble le trou entre commun et épique :
  // se fabrique avec les matériaux qui dorment (Cuir/Os/Lingot/Cristal). Voir RECIPES. =====
  forged_blade: { id: 'forged_blade', name: 'Lame du Forgeron', slot: 'weapon', classes: ['warrior'], icon: 'aw_katana', craftedOnly: true, rarity: 'rare', price: 260, stats: { attack: 13 }, dur: 90, fx: 'fx-slash' },
  forged_maul: { id: 'forged_maul', name: 'Masse du Forgeron', slot: 'weapon', classes: ['tank'], icon: 'at_warhammer', craftedOnly: true, rarity: 'rare', price: 270, stats: { attack: 12 }, dur: 110, fx: 'fx-circslash' },
  forged_rod: { id: 'forged_rod', name: 'Bâton gravé', slot: 'weapon', classes: ['mage'], icon: 'am_archstaff', craftedOnly: true, rarity: 'rare', price: 270, stats: { attack: 13 }, dur: 80 },
  forged_scepter: { id: 'forged_scepter', name: 'Sceptre gravé', slot: 'weapon', classes: ['healer'], icon: 'ah_healwand', craftedOnly: true, rarity: 'rare', price: 240, stats: { attack: 9 }, dur: 80 },
  forged_mail: { id: 'forged_mail', name: 'Maille forgée', slot: 'armor', icon: 'eq_mail', craftedOnly: true, rarity: 'rare', price: 250, stats: { hp: 30, defense: 5 }, dur: 100 },
  forged_plate: { id: 'forged_plate', name: 'Harnois renforcé', slot: 'armor', icon: 'eq_plate', craftedOnly: true, rarity: 'epic', price: 600, stats: { hp: 50, defense: 11 }, dur: 150 },
  forged_focus: { id: 'forged_focus', name: 'Talisman gravé', slot: 'focus', icon: 'rel_emerald', craftedOnly: true, rarity: 'rare', price: 250, spellPower: 0.22, stats: { manaRegen: 2 } },
  forged_ring: { id: 'forged_ring', name: 'Anneau serti', slot: 'ring', icon: 'eq_ring_sapphire', craftedOnly: true, rarity: 'rare', price: 250, stats: { mana: 40, defense: 2, manaRegen: 2 } },

  // ===== CONSOMMABLES (type 'consumable') -> clic dans le sac. `heal` = +PV, `mana` = +mana. =====
  potion: { id: 'potion', name: 'Potion de soin', type: 'consumable', icon: 'pot_heal', rarity: 'common', price: 40, heal: 45 },
  potion_big: { id: 'potion_big', name: 'Grande potion de soin', type: 'consumable', icon: 'pot_heal_big', rarity: 'rare', price: 110, heal: 120 },
  potion_mana: { id: 'potion_mana', name: 'Potion de mana', type: 'consumable', icon: 'pot_mana', rarity: 'common', price: 45, mana: 40 },
  potion_mana_big: { id: 'potion_mana_big', name: 'Grande potion de mana', type: 'consumable', icon: 'pot_mana_big', rarity: 'rare', price: 120, mana: 90 },
  // potions de TEMPÉRATURE (10 min) : la potion de feu protège du FROID, la potion de givre protège de la CHALEUR.
  potion_fire: { id: 'potion_fire', name: 'Potion de feu', type: 'consumable', icon: 'pot_fire', rarity: 'rare', price: 150, tempBuff: 'fire', tempDur: 600000, desc: 'Protège du FROID 10 min (immunité gel)' },
  potion_frost: { id: 'potion_frost', name: 'Potion de givre', type: 'consumable', icon: 'pot_frost', rarity: 'rare', price: 150, tempBuff: 'frost', tempDur: 600000, desc: 'Protège de la CHALEUR 10 min (immunité feu)' },
  // feu de camp À POSER : crée un foyer temporaire (zone-refuge) qui neutralise le froid ET le chaud autour.
  campfire_kit: { id: 'campfire_kit', name: 'Feu de camp', type: 'consumable', icon: 'campfire', rarity: 'rare', price: 800, placeFire: true, fireDur: 90000, fireRadius: 64, desc: 'À poser : foyer ~90 s qui réchauffe — protège du FROID autour (sans effet au désert)' },

  // ===== MATÉRIAUX (type 'material') — ressources lâchées par les mobs, EMPILABLES dans une poche à part
  // (pas le sac d'équipement). Servent à VENDRE (or) ET à AMÉLIORER l'équipement à la forge. `price` =
  // prix de revente ×2 (sellPrice = price/2). =====
  mat_leather: { id: 'mat_leather', name: 'Cuir', type: 'material', icon: 'mat_leather', rarity: 'common', price: 16 },
  mat_bone: { id: 'mat_bone', name: 'Os', type: 'material', icon: 'mat_bone', rarity: 'common', price: 18 },
  mat_essence: { id: 'mat_essence', name: 'Lingot de fer', type: 'material', icon: 'mat_essence', rarity: 'rare', price: 32 },
  mat_crystal: { id: 'mat_crystal', name: 'Cristal', type: 'material', icon: 'mat_crystal', rarity: 'epic', price: 56 },
}

// matériaux exposés à part (ordre d'affichage de la poche de ressources)
export const MATERIALS = ['mat_leather', 'mat_bone', 'mat_essence', 'mat_crystal']

// ===== ARTISANAT (brief polish §5) — RECETTES data-driven fabriquées chez Aldric le Forgeron =====
// Chaque recette : `result` = id de l'objet produit (consommable existant OU item forgé) ; `mats` = matériaux
// consommés {id: qté} ; `gold` = or consommé ; `cat` = onglet ('potion' | 'gear'). Les recettes d'arme sont
// filtrées par classe (canEquip) à l'affichage. Chiffres = points de départ à équilibrer.
export const RECIPES = [
  // -- Potions & consommables (donne enfin un usage à l'Os, inutilisé par l'amélioration) --
  { id: 'r_potion', result: 'potion', mats: { mat_bone: 2 }, gold: 8, cat: 'potion' },
  { id: 'r_potion_mana', result: 'potion_mana', mats: { mat_bone: 2 }, gold: 10, cat: 'potion' },
  { id: 'r_potion_big', result: 'potion_big', mats: { mat_bone: 3, mat_leather: 1 }, gold: 30, cat: 'potion' },
  { id: 'r_potion_mana_big', result: 'potion_mana_big', mats: { mat_bone: 2, mat_crystal: 1 }, gold: 25, cat: 'potion' },
  { id: 'r_potion_fire', result: 'potion_fire', mats: { mat_leather: 2, mat_bone: 2 }, gold: 50, cat: 'potion' },
  { id: 'r_potion_frost', result: 'potion_frost', mats: { mat_leather: 2, mat_bone: 2 }, gold: 50, cat: 'potion' },
  { id: 'r_campfire', result: 'campfire_kit', mats: { mat_leather: 3, mat_essence: 1 }, gold: 150, cat: 'potion' },
  // -- Équipement forgé (milieu de gamme). Les armes sont propres à chaque classe (filtrées à l'affichage). --
  { id: 'r_forged_blade', result: 'forged_blade', mats: { mat_essence: 2, mat_leather: 2 }, gold: 100, cat: 'gear' },
  { id: 'r_forged_maul', result: 'forged_maul', mats: { mat_essence: 2, mat_leather: 2 }, gold: 100, cat: 'gear' },
  { id: 'r_forged_rod', result: 'forged_rod', mats: { mat_essence: 2, mat_crystal: 1 }, gold: 100, cat: 'gear' },
  { id: 'r_forged_scepter', result: 'forged_scepter', mats: { mat_essence: 2, mat_crystal: 1 }, gold: 100, cat: 'gear' },
  { id: 'r_forged_mail', result: 'forged_mail', mats: { mat_leather: 3, mat_essence: 1 }, gold: 90, cat: 'gear' },
  { id: 'r_forged_focus', result: 'forged_focus', mats: { mat_essence: 1, mat_crystal: 1 }, gold: 110, cat: 'gear' },
  { id: 'r_forged_ring', result: 'forged_ring', mats: { mat_essence: 1, mat_crystal: 1 }, gold: 110, cat: 'gear' },
  { id: 'r_forged_plate', result: 'forged_plate', mats: { mat_essence: 3, mat_crystal: 2 }, gold: 280, cat: 'gear' },
]

// stock du marchand = catalogue SAUF légendaires, pièces de set ET objets forgés (artisanat uniquement)
export const SHOP_STOCK = Object.values(ITEMS).filter((it) => it.rarity !== 'legendary' && !it.set && !it.craftedOnly)

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

// 4 slots d'équipement : Arme(+ATQ) / Armure(+DEF) / Relique(améliore la compétence, clé interne 'focus') / Anneau(+Mana)
export const SLOTS = ['weapon', 'armor', 'focus', 'ring']
export const SLOT_LABELS = { weapon: 'Arme', armor: 'Armure', focus: 'Relique', ring: 'Anneau' }

// abréviations FR des stats (pour l'affichage des bonus)
export const STAT_LABELS = { attack: 'ATQ', defense: 'DEF', hp: 'PV', mana: 'Mana', manaRegen: 'Mana/s', coldResist: 'Rés. froid', heatResist: 'Rés. chaud' }

const CLASS_FR = { warrior: 'Guerrier', mage: 'Mage', tank: 'Tank', healer: 'Soigneur' }
// arme de DÉPART par classe (équipée à la création du perso)
export const STARTER_WEAPON = { warrior: 'sword', tank: 'club', mage: 'wand', healer: 'healstick' }

/** Resynchronise les champs de PRÉSENTATION d'un objet (icône, nom, swing, fx…) depuis le catalogue,
 *  par `id`. Les icônes/noms évoluent au fil des mises à jour : une vieille sauvegarde garde l'objet
 *  sérialisé tel quel -> on rafraîchit l'apparence sans toucher à l'état d'instance (upgrade/durabilité). */
export function refreshItemDef(item) {
  const def = item && ITEMS[item.id]
  if (!def) return item
  item.icon = def.icon
  item.name = def.name
  if ('swingTex' in def) item.swingTex = def.swingTex; else delete item.swingTex
  if ('heldScale' in def) item.heldScale = def.heldScale; else delete item.heldScale
  if ('iconTint' in def) item.iconTint = def.iconTint; else delete item.iconTint
  if ('fx' in def) item.fx = def.fx
  if ('set' in def) item.set = def.set; else delete item.set
  return item
}

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
  if (item.spellPower || item.spellDuration) {
    const parts = []
    if (item.spellPower) parts.push(`+${Math.round(item.spellPower * 100)}% effet du sort`)
    if (item.spellDuration) parts.push(`+${Math.round(item.spellDuration * 100)}% durée du sort`)
    txt = (txt ? txt + '\n' : '') + parts.join('\n')
  }
  if (hasDurability(item)) {
    const broken = (item.durability ?? item.dur) <= 0
    txt += `\nDurabilité ${item.durability ?? item.dur}/${item.dur}${broken ? ' (CASSÉ)' : ''}`
  }
  if (item.set && SETS[item.set]) {
    const s = SETS[item.set]
    const fb = (b) => Object.entries(b).map(([k, v]) => (k === 'spellPower' || k === 'spellDuration') ? `+${Math.round(v * 100)}% ${k === 'spellPower' ? 'effet' : 'durée'}` : `+${v} ${STAT_LABELS[k] ?? k}`).join(', ')
    txt += `\nPanoplie « ${s.name} »\n  (2) ${fb(s.bonus2)}\n  (4) ${fb(s.bonus4)} + ${s.skillName}`
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
