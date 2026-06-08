import Phaser from 'phaser'

/**
 * Définitions des 3 types de monstres (MVP du brief).
 * Sprites 16x16, spritesheet 4x4 (la 1re ligne = frames 0-3 d'animation).
 */
// loot : or (min/max), % de drop d'équipement, pondération de rareté de cet équipement.
// Plus la créature est forte, plus le butin est généreux et rare.
// `tier` = rareté FIXE du butin de ce type (déterministe, pas de hasard de rareté) :
// chaque mort lâche un équipement de cette rareté. `gold` = fourchette d'or lâchée.
export const MONSTER_TYPES = {
  // `loot` (table par ESPÈCE) : gold [min,max] ; mat = MATÉRIAU empilable lâché (id, drop fréquent) ;
  // matChance = proba du matériau ; gear = proba d'un ÉQUIPEMENT (rareté pondérée + scaling de zone).
  mushroom: {
    key: 'mon_mushroom', hp: 180, speed: 20, damage: 22, xp: 42, aggro: 70, scale: 1.5, name: 'Champignon',
    tier: 'rare', loot: { gold: [4, 9], mat: 'mat_essence', matChance: 0.5, gear: 0.14 },
    mobAtk: { type: 'zone', range: 92, windup: 720, cooldown: 5200, hitRadius: 50, dmgMul: 1.3, color: 0x9be04a }, // nuage de spores (cadence lente)
  },
  lizard: {
    key: 'mon_lizard', hp: 22, speed: 76, damage: 5, xp: 8, aggro: 130, scale: 0.9, name: 'Lézard',
    tier: 'common', loot: { gold: [1, 3], mat: 'mat_leather', matChance: 0.45, gear: 0.1 },
    mobAtk: { type: 'shoot', range: 150, windup: 520, cooldown: 3200, projSpeed: 150, dmgMul: 0.85, projTint: 0xbfe04a, fx: { tex: 'fx_energyball', anim: 'fx-energyball', tint: true, scale: 0.85 } }, // crachat (pression sur les classes à distance dès le début)
  },
  racoon: {
    key: 'mon_racoon', hp: 55, speed: 46, damage: 8, xp: 16, aggro: 105, scale: 1.1, name: 'Raton',
    tier: 'common', loot: { gold: [2, 5], mat: 'mat_bone', matChance: 0.45, gear: 0.12 }, // Os dès la zone de départ (base des potions)
    mobAtk: { type: 'lunge', range: 110, windup: 480, speed: 240, duration: 220, dmgMul: 1.5, cooldown: 3000, hitRadius: 16 }, // charge griffue
  },

  // --- désert ---
  snake: {
    key: 'mon_snake', hp: 40, speed: 82, damage: 10, xp: 18, aggro: 135, scale: 1.0, name: 'Serpent',
    tier: 'common', loot: { gold: [2, 6], mat: 'mat_leather', matChance: 0.45, gear: 0.12 },
    mobAtk: { type: 'lunge', range: 120, windup: 380, speed: 300, duration: 230, dmgMul: 1.6, cooldown: 2600, hitRadius: 16 }, // morsure-éclair
  },
  spider: {
    key: 'mon_spider', hp: 60, speed: 56, damage: 12, xp: 22, aggro: 110, scale: 1.1, name: 'Araignée',
    tier: 'rare', loot: { gold: [3, 7], mat: 'mat_essence', matChance: 0.5, gear: 0.16 },
    mobAtk: { type: 'shoot', range: 170, windup: 520, cooldown: 2400, projSpeed: 165, dmgMul: 1, projTint: 0x9be04a, fx: { tex: 'fx_energyball', anim: 'fx-energyball', tint: true, scale: 1.0 } }, // crachat venimeux
  },

  // --- neige ---
  owl: {
    key: 'mon_owl', hp: 55, speed: 70, damage: 14, xp: 26, aggro: 120, scale: 1.0, name: 'Hibou',
    tier: 'rare', loot: { gold: [3, 8], mat: 'mat_essence', matChance: 0.5, gear: 0.16 },
    mobAtk: { type: 'lunge', range: 150, windup: 360, speed: 320, duration: 240, dmgMul: 1.6, cooldown: 2800, hitRadius: 16 }, // plongée
  },
  bear: {
    key: 'mon_bear', hp: 130, speed: 30, damage: 22, xp: 42, aggro: 80, scale: 1.5, name: 'Ours',
    tier: 'epic', loot: { gold: [5, 11], mat: 'mat_leather', matChance: 0.55, gear: 0.2 },
    mobAtk: { type: 'zone', range: 72, windup: 560, cooldown: 3400, hitRadius: 56, dmgMul: 1.5, color: 0xffcaa0 }, // coup de terre
  },

  // --- terres maudites ---
  skull: {
    key: 'mon_skull', hp: 80, speed: 50, damage: 18, xp: 34, aggro: 115, scale: 1.1, name: 'Crâne',
    tier: 'rare', loot: { gold: [5, 10], mat: 'mat_bone', matChance: 0.5, gear: 0.18 },
    mobAtk: { type: 'shoot', range: 180, windup: 560, cooldown: 2400, projSpeed: 165, dmgMul: 1, projTint: 0xc070ff, fx: { tex: 'fx_energyball', anim: 'fx-energyball', tint: true, scale: 1.1 } }, // orbe maudite
  },
  spirit: {
    key: 'mon_spirit', hp: 50, speed: 92, damage: 16, xp: 30, aggro: 140, scale: 1.0, name: 'Esprit',
    tier: 'rare', loot: { gold: [4, 9], mat: 'mat_bone', matChance: 0.5, gear: 0.18 },
    mobAtk: { type: 'shoot', range: 190, windup: 460, cooldown: 2000, projSpeed: 185, dmgMul: 0.9, projTint: 0x9fe0ff, fx: { tex: 'fx_energyball', anim: 'fx-energyball', tint: true, scale: 0.95 } }, // orbe spectrale rapide
  },
  flam: {
    key: 'mon_flam', hp: 105, speed: 40, damage: 26, xp: 48, aggro: 100, scale: 1.3, name: 'Démon de feu',
    tier: 'epic', loot: { gold: [7, 14], mat: 'mat_crystal', matChance: 0.5, gear: 0.22 },
    mobAtk: { type: 'shoot', range: 180, windup: 520, cooldown: 2400, projSpeed: 165, dmgMul: 1.1, fx: { tex: 'fx_fireball', anim: 'fx-fireball', scale: 1.3 } }, // boule de feu
  },
  // mobs supplémentaires (brief polish) : DÉSERT = Raptor (charge vite, peu de PV) ; NEIGE = Chauve-souris givrée (plonge).
  trex: {
    key: 'mon_trex', hp: 28, speed: 90, damage: 12, xp: 26, aggro: 145, scale: 1.0, name: 'Raptor',
    tier: 'common', loot: { gold: [2, 6], mat: 'mat_leather', matChance: 0.45, gear: 0.12 },
    mobAtk: { type: 'lunge', range: 165, windup: 340, speed: 370, duration: 240, dmgMul: 1.7, cooldown: 2400, hitRadius: 16 }, // ruée éclair (glass cannon)
  },
  bluebat: {
    key: 'mon_bluebat', hp: 36, speed: 100, damage: 14, xp: 28, aggro: 150, scale: 0.9, name: 'Chauve-souris givrée',
    tier: 'rare', loot: { gold: [3, 8], mat: 'mat_essence', matChance: 0.5, gear: 0.16 },
    mobAtk: { type: 'lunge', range: 175, windup: 320, speed: 390, duration: 230, dmgMul: 1.6, cooldown: 2200, hitRadius: 15 }, // plongée rapide
  },

  // --- BOSS DE RAID (intuables en solo, contenu verrouillé / multijoueur Phase 4) ---
  // rig = sprites dédiés (mono-orientation, anims idle/walk/hit) ; raid = PV-mur + dégâts qui écrasent.
  // key = texture initiale (idle) ; body = hitbox en px de texture (scalée ensuite par `scale`).
  tengublue: {
    key: 'boss_tengublue_idle', rig: 'tengublue', raid: true, face: 'face_tengublue',
    hp: 220, speed: 34, damage: 18, xp: 0, aggro: 95, scale: 1.7, body: { w: 26, h: 32 },
    tier: 'epic', loot: { gold: [0, 0] }, name: 'Tengu des Glaces',
    // RAID : déluge plus large + transfo à 50 % PV (dégâts de raid -> esquive obligatoire).
    barrage: { range: 340, windup: 650, recover: 420, shots: 7, gap: 0.3, projSpeed: 160, projDamage: 5, cooldown: 2300, color: 0x9fd8ff, fx: 'fx-fireball' },
    enrage: { hpPct: 0.5, dmgMul: 1.5, cdMul: 0.6, scale: 1.1, dur: 950, fx: 'fx-spirit', color: 0x9fd8ff },
    // KIT WoW : barrage+nova d'emblée ; le sol se ferme (voidzone) à 70% ; FUREUR + vague d'adds (3 chauves-souris) à 50%.
    nova: { range: 150, radius: 76, windup: 1250, active: 160, recover: 320, dmgMul: 1.3, knock: 470, knockMs: 280, cooldown: 4200, color: 0x7be0ff, fx: 'fx-ice-burst' },
    voidzone: { range: 300, windup: 1100, recover: 320, count: 3, radius: 38, spread: 95, lifetime: 4200, tick: 600, dmgMul: 0.55, cooldown: 5200, anchorPlayer: true, color: 0x7be0ff, fx: 'fx-ice-burst' },
    phases: [
      { atPct: 0.70, add: ['voidzone'] },
      { atPct: 0.50, dmgMul: 1.5, cdMul: 0.6, scale: 1.1, trans: true, summon: { type: 'bluebat', count: 3 } },
    ],
  },
  samurai: {
    key: 'boss_samurai_idle', rig: 'samurai', raid: true, face: 'face_samurai',
    hp: 260, speed: 30, damage: 20, xp: 0, aggro: 90, scale: 1.5, body: { w: 40, h: 28 },
    tier: 'epic', loot: { gold: [0, 0] }, name: 'Samouraï Sylvestre',
    // CHARGE TÉLÉGRAPHIÉE : zone au sol pendant `windup` ms (anim charge), puis dash à `speed` px/s
    // pendant `duration` ms le long de l'angle verrouillé ; touche dans `hitRadius` px de l'axe (×`dmgMul`).
    // Esquive : se décaler hors de l'axe pendant le windup (long + bande étroite -> dodge confortable).
    charge: { range: 340, windup: 720, speed: 430, duration: 520, dmgMul: 1.7, cooldown: 2600, hitRadius: 28, color: 0x4aa3ff, chargeOriginY: 0.75 },
    // KIT WoW : charge+cône d'emblée ; nova de recul débloquée à 70% (pas d'enrage : rig sans anim Trans).
    cone: { range: 165, halfAngle: 0.45, windup: 1150, active: 180, recover: 320, dmgMul: 1.5, cooldown: 2800, color: 0x4aa3ff, knockback: 60 },
    nova: { range: 140, radius: 70, windup: 1250, active: 160, recover: 320, dmgMul: 1.3, knock: 360, knockMs: 250, cooldown: 4000, color: 0x4aa3ff },
    phases: [{ atPct: 0.70, add: ['nova'] }],
  },

  // --- BOSS SOLO à sprite dédié (rig, mais PAS raid -> tuable seul) ---
  democyclop: {
    key: 'boss_democyclop_idle', rig: 'democyclop', face: 'face_democyclop',
    hp: 70, speed: 28, damage: 15, xp: 32, aggro: 110, scale: 2.2, body: { w: 26, h: 34 },
    tier: 'epic', loot: { gold: [6, 12] }, name: 'Cyclope démon',
    // BULL-RUSH : ruée lourde et télégraphiée (pas de feuille charge -> garde l'idle). Mêlée sûre entre 2 ruées.
    charge: { range: 320, windup: 760, speed: 400, duration: 540, dmgMul: 1.6, cooldown: 2800, hitRadius: 30, color: 0xc97b3a, fx: 'fx-rock' },
    // KIT : bull-rush + onde de choc au sol (stomp) débloquée à 45 % PV.
    nova: { range: 150, radius: 72, windup: 1200, active: 160, recover: 320, dmgMul: 1.3, knock: 380, knockMs: 240, cooldown: 4000, color: 0xc97b3a, fx: 'fx-explosion' },
    phases: [{ atPct: 0.45, add: ['nova'] }],
  },
  // Seigneur de flamme (Terres Maudites) : rig SANS walk (reste sur place, lent) -> playRig retombe sur idle
  giantflam: {
    key: 'boss_giantflam_idle', rig: 'giantflam', face: 'face_giantflam',
    hp: 230, speed: 18, damage: 24, xp: 40, aggro: 120, scale: 2.2, body: { w: 24, h: 34 },
    tier: 'epic', loot: { gold: [8, 16] }, name: 'Seigneur de flamme',
    // DARGOTH (boss FINAL de l'île maudite) — 3 PHASES façon Ragnaros (rig sans walk -> sorts télégraphiés au sol).
    // P1 : souffle (cône) + mares de feu (flaques). P2@60 % : +nova de feu + 2 imbraises (adds flam). P3@30 % : +météore (slam) + boost.
    cone: { range: 175, halfAngle: 0.6, windup: 1200, active: 200, recover: 340, dmgMul: 1.5, cooldown: 2900, color: 0xff7a3a, fx: 'fx-flam' },
    voidzone: { range: 280, windup: 1150, recover: 320, count: 3, radius: 44, spread: 100, lifetime: 4600, tick: 650, dmgMul: 0.6, cooldown: 4800, anchorPlayer: true, color: 0xff7a3a, fx: 'fx-flam' },
    nova: { range: 160, radius: 78, windup: 1250, active: 160, recover: 320, dmgMul: 1.35, knock: 420, knockMs: 260, cooldown: 3800, color: 0xff7a3a, fx: 'fx-explosion' },
    slam: { range: 230, windup: 1050, jumpDur: 480, hitRadius: 60, dmgMul: 1.6, cooldown: 3200, color: 0xff5030, fx: 'fx-explosion' },
    phases: [
      { atPct: 0.65, add: ['nova'], trans: true, summon: { type: 'flam', count: 2 } },
      { atPct: 0.35, add: ['slam'], dmgMul: 1.3, cdMul: 0.78, trans: true },
    ],
  },

  democyclop2: {
    key: 'boss_democyclop2_idle', rig: 'democyclop2', face: 'face_democyclop2',
    hp: 85, speed: 26, damage: 17, xp: 36, aggro: 115, scale: 2.2, body: { w: 26, h: 34 },
    tier: 'epic', loot: { gold: [7, 14] }, name: 'Cyclope ancien',
    // Cyclope ancien : bull-rush plus rapide, plus large et plus fort.
    charge: { range: 330, windup: 720, speed: 440, duration: 540, dmgMul: 1.7, cooldown: 2500, hitRadius: 32, color: 0xd49a4a, fx: 'fx-rock' },
    // KIT (ANCIEN) : bull-rush + stomp d'emblée ; écrasement (slam) débloqué à 40 % PV.
    nova: { range: 155, radius: 76, windup: 1150, active: 160, recover: 320, dmgMul: 1.35, knock: 410, knockMs: 250, cooldown: 3700, color: 0xd49a4a, fx: 'fx-explosion' },
    slam: { range: 200, windup: 780, jumpDur: 460, hitRadius: 56, dmgMul: 1.45, cooldown: 3500, color: 0xd49a4a, fx: 'fx-rock' },
    phases: [{ atPct: 0.40, add: ['slam'] }],
  },
  giantbamboo: {
    key: 'boss_giantbamboo_idle', rig: 'giantbamboo', face: 'face_giantbamboo',
    hp: 80, speed: 24, damage: 16, xp: 34, aggro: 110, scale: 1.8, body: { w: 28, h: 40 },
    tier: 'epic', loot: { gold: [6, 13] }, name: 'Colosse de bambou',
    // KIT WoW (golem lent) : balayage en cône d'emblée ; écrasement (slam) à 70% ; nova de recul à 40%.
    cone: { range: 175, halfAngle: 0.62, windup: 1150, active: 200, recover: 360, dmgMul: 1.5, cooldown: 2900, color: 0x8fd24a, knockback: 0, fx: 'fx-plant' },
    slam: { range: 210, windup: 720, jumpDur: 460, hitRadius: 62, dmgMul: 1.5, cooldown: 3400, color: 0x8fd24a, fx: 'fx-rock' },
    nova: { range: 150, radius: 70, windup: 1250, active: 160, recover: 320, dmgMul: 1.2, knock: 380, knockMs: 240, cooldown: 4200, color: 0x8fd24a },
    phases: [{ atPct: 0.70, add: ['slam'] }, { atPct: 0.40, add: ['nova'] }],
  },
  giantslime: {
    key: 'boss_giantslime_idle', rig: 'giantslime', face: 'face_giantslime',
    hp: 78, speed: 22, damage: 15, xp: 34, aggro: 105, scale: 1.8, body: { w: 34, h: 26 },
    tier: 'epic', loot: { gold: [6, 13] }, name: 'Gelée polaire',
    // SAUT-SLAM : bondit sur la position du joueur (cercle de danger télégraphié) puis écrase = AoE.
    slam: { range: 230, windup: 650, jumpDur: 460, hitRadius: 62, dmgMul: 1.6, cooldown: 2200, color: 0x7be0c8, fx: 'fx-water' },
    // KIT : saut-slam + mares de gel à 50 % + nova de givre à 25 %.
    voidzone: { range: 240, windup: 1100, recover: 320, count: 3, radius: 40, spread: 95, lifetime: 4200, tick: 600, dmgMul: 0.55, cooldown: 4600, anchorPlayer: true, color: 0x7be0c8, fx: 'fx-ice-burst' },
    nova: { range: 150, radius: 72, windup: 1250, active: 160, recover: 320, dmgMul: 1.3, knock: 360, knockMs: 240, cooldown: 4200, color: 0x7be0c8, fx: 'fx-ice-burst' },
    phases: [{ atPct: 0.50, add: ['voidzone'] }, { atPct: 0.25, add: ['nova'] }],
  },
  giantspirit: {
    key: 'boss_giantspirit_idle', rig: 'giantspirit', face: 'face_giantspirit',
    hp: 82, speed: 30, damage: 18, xp: 38, aggro: 120, scale: 2.0, body: { w: 22, h: 30 },
    tier: 'epic', loot: { gold: [8, 15] }, name: 'Âme damnée',
    // KIT (spectre) : mares d'âmes (flaques) d'emblée ; vortex (nova) à 55 % ; salve de bolts spectraux à 30 %.
    voidzone: { range: 260, windup: 1100, recover: 320, count: 3, radius: 42, spread: 100, lifetime: 4200, tick: 600, dmgMul: 0.55, cooldown: 4800, anchorPlayer: true, color: 0xb060ff, fx: 'fx-spirit' },
    nova: { range: 155, radius: 76, windup: 1200, active: 160, recover: 320, dmgMul: 1.35, knock: 400, knockMs: 250, cooldown: 3800, color: 0xb060ff, fx: 'fx-slash-circular' },
    barrage: { range: 300, windup: 850, recover: 420, shots: 5, gap: 0.34, projSpeed: 150, projDamage: 6, cooldown: 2800, color: 0xb060ff, fx: 'fx-spirit' },
    phases: [{ atPct: 0.55, add: ['nova'] }, { atPct: 0.30, add: ['barrage'] }],
  },
  redsamurai: {
    key: 'boss_redsamurai_idle', rig: 'redsamurai', face: 'face_redsamurai',
    hp: 88, speed: 32, damage: 19, xp: 38, aggro: 95, scale: 1.5, body: { w: 40, h: 28 },
    tier: 'epic', loot: { gold: [8, 15] }, name: 'Samouraï Rouge',
    charge: { range: 340, windup: 780, speed: 430, duration: 520, dmgMul: 1.7, cooldown: 2800, hitRadius: 28, color: 0xff3030, chargeOriginY: 0.75, fx: 'fx-slash' },
    // KIT (samouraï rouge = plus dur) : charge + cône de lame d'emblée ; nova de recul à 55 %.
    cone: { range: 165, halfAngle: 0.45, windup: 1100, active: 180, recover: 320, dmgMul: 1.55, cooldown: 2700, color: 0xff3030, knockback: 70, fx: 'fx-slash' },
    nova: { range: 145, radius: 74, windup: 1200, active: 160, recover: 320, dmgMul: 1.35, knock: 400, knockMs: 260, cooldown: 3800, color: 0xff3030, fx: 'fx-slash-circular' },
    phases: [{ atPct: 0.55, add: ['nova'] }],
  },
  tengured: {
    key: 'boss_tengured_idle', rig: 'tengured', face: 'face_tengured',
    hp: 84, speed: 36, damage: 18, xp: 38, aggro: 95, scale: 1.7, body: { w: 26, h: 32 },
    tier: 'epic', loot: { gold: [8, 15] }, name: 'Tengu Rouge',
    // DÉLUGE : volée de boules de feu en éventail (anim Attack) ; TRANSFO à 50 % PV (anim Trans) -> enrage.
    barrage: { range: 320, windup: 700, recover: 450, shots: 5, gap: 0.34, projSpeed: 150, projDamage: 6, cooldown: 2600, color: 0xff8a4a, fx: 'fx-fireball' },
    enrage: { hpPct: 0.5, dmgMul: 1.4, cdMul: 0.62, scale: 1.12, dur: 950, fx: 'fx-flam', color: 0xff6a3a },
    // KIT (Tengu rouge) : barrage + nova de feu d'emblée ; mares de feu à 70 % ; FUREUR + 3 imbraises à 50 %.
    nova: { range: 150, radius: 74, windup: 1250, active: 160, recover: 320, dmgMul: 1.3, knock: 420, knockMs: 260, cooldown: 4200, color: 0xff6a3a, fx: 'fx-explosion' },
    voidzone: { range: 300, windup: 1100, recover: 320, count: 3, radius: 40, spread: 95, lifetime: 4200, tick: 600, dmgMul: 0.55, cooldown: 5200, anchorPlayer: true, color: 0xff6a3a, fx: 'fx-flam' },
    phases: [
      { atPct: 0.70, add: ['voidzone'] },
      { atPct: 0.50, dmgMul: 1.4, cdMul: 0.62, scale: 1.12, trans: true, summon: { type: 'flam', count: 3 } },
    ],
  },
  giantslime2: {
    key: 'boss_giantslime2_idle', rig: 'giantslime2', face: 'face_giantslime2',
    hp: 80, speed: 22, damage: 16, xp: 36, aggro: 105, scale: 1.9, body: { w: 34, h: 26 },
    tier: 'epic', loot: { gold: [7, 14] }, name: 'Gelée ancienne',
    // Gelée ancienne : saut-slam plus rapide, plus large et plus fort.
    slam: { range: 240, windup: 720, jumpDur: 460, hitRadius: 58, dmgMul: 1.5, cooldown: 2600, color: 0x9fe8ff, fx: 'fx-water' },
    // KIT (ANCIEN) : saut-slam + mares de gel d'emblée ; nova de givre à 40 %.
    voidzone: { range: 240, windup: 1000, recover: 320, count: 4, radius: 40, spread: 100, lifetime: 4400, tick: 600, dmgMul: 0.6, cooldown: 4200, anchorPlayer: true, color: 0x9fe8ff, fx: 'fx-ice-burst' },
    nova: { range: 155, radius: 76, windup: 1150, active: 160, recover: 300, dmgMul: 1.35, knock: 400, knockMs: 250, cooldown: 3600, color: 0x9fe8ff, fx: 'fx-ice-burst' },
    phases: [{ atPct: 0.40, add: ['nova'] }],
  },

  // --- BOSS CÔTIER À DISTANCE (tire des orbes que le joueur ESQUIVE ; mêlée faible -> garde tes distances ou approche) ---
  // ranged = il télégraphe (anim shoot) puis lance un projectile vers le joueur. Lent et peu mobile : il garde son rivage.
  squidred: {
    key: 'boss_squidred_idle', rig: 'squidred', face: 'face_squidred',
    hp: 96, speed: 18, damage: 12, xp: 42, aggro: 240, scale: 1.5, body: { w: 30, h: 30 },
    ranged: true, shootRange: 230, shootCd: 1700, projSpeed: 155, projDamage: 16,
    solid: true, // gros corps : le joueur ne le traverse pas (collision, en plus de l'overlap de morsure)
    tier: 'epic', loot: { gold: [9, 17] }, name: 'Kraken',
    // KIT (Kraken) : orbes (ranged) ; salve d'encre (barrage) débloquée à 55 % ; mares d'encre (flaques) à 30 %.
    barrage: { range: 300, windup: 900, recover: 420, shots: 6, gap: 0.32, projSpeed: 150, projDamage: 6, cooldown: 2900, color: 0x4a90d0, fx: 'fx-fireball' },
    voidzone: { range: 280, windup: 1150, recover: 320, count: 3, radius: 42, spread: 100, lifetime: 4400, tick: 600, dmgMul: 0.55, cooldown: 5000, anchorPlayer: true, color: 0x4a90d0, fx: 'fx-water' },
    phases: [{ atPct: 0.55, add: ['barrage'] }, { atPct: 0.30, add: ['voidzone'] }],
  },

  giantfrog: {
    key: 'boss_giantfrog_idle', rig: 'giantfrog', face: 'face_giantfrog',
    hp: 76, speed: 30, damage: 16, xp: 34, aggro: 110, scale: 2.0, body: { w: 26, h: 22 },
    tier: 'epic', loot: { gold: [6, 13] }, name: 'Crapaud colossal',
    charge: { range: 320, windup: 760, speed: 420, duration: 500, dmgMul: 1.6, cooldown: 2900, hitRadius: 24, color: 0x7bd86a },
    // KIT WoW : charge+flaques de poison d'emblée ; saut-slam débloqué à 40%.
    voidzone: { range: 240, windup: 1100, recover: 320, count: 3, radius: 40, spread: 95, lifetime: 4200, tick: 600, dmgMul: 0.55, cooldown: 4600, anchorPlayer: true, color: 0x7bd86a, fx: 'fx-plant' },
    slam: { range: 220, windup: 700, jumpDur: 470, hitRadius: 60, dmgMul: 1.5, cooldown: 3200, color: 0x7bd86a, fx: 'fx-water' },
    phases: [{ atPct: 0.40, add: ['slam'] }],
  },
  giantracoon: {
    key: 'boss_giantracoon_idle', rig: 'giantracoon', face: 'face_giantracoon',
    hp: 82, speed: 34, damage: 17, xp: 36, aggro: 100, scale: 1.7, body: { w: 30, h: 30 },
    tier: 'epic', loot: { gold: [7, 14] }, name: 'Raton géant',
    charge: { range: 320, windup: 740, speed: 460, duration: 470, dmgMul: 1.5, cooldown: 2700, hitRadius: 24, color: 0xe0a24a, fx: 'fx-clawdouble' },
    // KIT WoW : charge+nova de recul (tournoiement) d'emblée ; cône débloqué à 50%.
    nova: { range: 150, radius: 70, windup: 1250, active: 160, recover: 300, dmgMul: 1.3, knock: 430, knockMs: 260, cooldown: 3400, color: 0xe0a24a, fx: 'fx-explosion' },
    cone: { range: 170, halfAngle: 0.58, windup: 1150, active: 180, recover: 320, dmgMul: 1.4, cooldown: 3000, color: 0xe0a24a, knockback: 0, fx: 'fx-clawdouble' },
    phases: [{ atPct: 0.50, add: ['cone'] }],
  },
  giantbamboo2: {
    key: 'boss_giantbamboo2_idle', rig: 'giantbamboo2', face: 'face_giantbamboo2',
    hp: 86, speed: 24, damage: 17, xp: 36, aggro: 110, scale: 1.8, body: { w: 28, h: 40 },
    tier: 'epic', loot: { gold: [7, 15] }, name: 'Colosse de bambou ancien',
    // KIT WoW (ANCIEN = plus dur) : cône+slam d'emblée ; flaques à 60% ; nova à 35%. Valeurs majorées.
    cone: { range: 180, halfAngle: 0.6, windup: 1200, active: 200, recover: 320, dmgMul: 1.5, cooldown: 2800, color: 0x6fae2e, knockback: 60, fx: 'fx-plant' },
    slam: { range: 220, windup: 740, jumpDur: 460, hitRadius: 62, dmgMul: 1.5, cooldown: 3200, color: 0x6fae2e, fx: 'fx-rock' },
    voidzone: { range: 250, windup: 1100, recover: 300, count: 4, radius: 40, spread: 105, lifetime: 4600, tick: 600, dmgMul: 0.6, cooldown: 4000, anchorPlayer: true, color: 0x6fae2e, fx: 'fx-plant' },
    nova: { range: 160, radius: 76, windup: 1250, active: 160, recover: 300, dmgMul: 1.35, knock: 420, knockMs: 260, cooldown: 3600, color: 0x6fae2e },
    phases: [{ atPct: 0.60, add: ['voidzone'] }, { atPct: 0.35, add: ['nova'] }],
  },

  // --- BOSS DE RAID SEGMENTÉ (tête + chaîne de corps qui ondule) ---
  dragonblue: {
    key: 'boss_dragon_head', dragon: true, raid: true, face: 'face_dragon',
    hp: 240, speed: 78, damage: 20, xp: 0, aggro: 100, scale: 1.3, body: { w: 20, h: 20 },
    tier: 'epic', loot: { gold: [0, 0] }, name: 'Dragon des Abysses',
    // RAID : souffle d'orbes (barrage) + nova de givre à 55 % -> vrai combat de groupe (avant : simple éponge à PV).
    // ⚠️ segmenté : pendant un sort, le dispatch coupe updateDragon -> les anneaux se figent brièvement (à vérifier en jeu).
    barrage: { range: 360, windup: 700, recover: 420, shots: 6, gap: 0.30, projSpeed: 170, projDamage: 5, cooldown: 2400, color: 0x6fd0ff, fx: 'fx-fireball' },
    nova: { range: 160, radius: 78, windup: 1250, active: 160, recover: 320, dmgMul: 1.3, knock: 460, knockMs: 280, cooldown: 4400, color: 0x6fd0ff, fx: 'fx-ice-burst' },
    phases: [{ atPct: 0.55, dmgMul: 1.4, cdMul: 0.7, add: ['nova'] }],
  },
}

const TOUCH_COOLDOWN = 700 // délai entre 2 morsures au contact (ms)
const LEASH_RANGE = 120 // distance parcourue depuis l'endroit où elle t'a repéré avant d'abandonner (px) — poursuite courte
const HIT_AGGRO_GRACE = 5000 // tant qu'un mob a été FRAPPÉ il y a moins de ça (ms), il n'abandonne PAS (ne rentre pas au spawn)
const HOME_RADIUS = 16 // considéré "rentré" sous cette distance de son spawn (px)
const PATROL_RADIUS = 80 // rayon autour duquel un BOSS rôde/garde son repaire avant d'être provoqué (px)
const BOSS_GUARD_LEASH = 220 // tant que le combat n'a PAS commencé, le boss ne poursuit pas au-delà (revient au repaire)
const BOSS_WAKE_DELAY = 2000 // au réveil (1re attaque reçue), le boss patiente 2 s avant TOUTE attaque -> on a le temps de se replacer (anti one-shot d'ouverture)
const SPEED_SCALE = 0.62 // ralentit TOUS les monstres (joueur=65) -> kitables en courant
const NAMEPLATE_RANGE = 120 // distance (px) à laquelle on voit le niveau au-dessus du monstre
// SCALING DES MOBS par niveau de ZONE (1→6 selon la distance) : PV ×2/niv (murs de zone nets),
// dégâts ×1.6/niv (plus doux -> dur mais pas one-shot). Les BOSS NE sont PAS scalés (stats fixes ci-dessous).
const MOB_HP_MUL = 2 // PV × ce facteur par niveau de zone
const MOB_DMG_MUL = 1.6 // dégâts × ce facteur par niveau (plus doux que les PV)
const MOB_XP_MUL = 1.4 // XP × ce facteur par niveau (COURBE PLATE : un mob de bas niveau près du village
//                        ne rapporte presque rien de plus qu'un niv1 -> pas de farm facile au spawn ;
//                        cf. PV qui font ×2/niv, l'XP volontairement bien plus douce)
// BOSS = stats PRÉDÉFINIES (indépendantes de la courbe des mobs) : PV/dégâts/XP = type × ces multiplicateurs.
// (valeurs gonflées pour garder la puissance d'avant, quand le boss était "niveau 7" scalé.)
const BOSS_HP_MUL = 91 // PV d'un boss = type × 91 (gros sac à PV, fixe)
const BOSS_DMG_MUL = 12 // dégâts du boss (fixes) -> sert aux attaques SPÉCIALES (charge, projectiles)
// Dégâts de CONTACT (morsure) d'un boss = dégâts × ce facteur. Bien plus bas que ses attaques spéciales :
// le tank/guerrier collé au boss échange des coups SOUTENABLES, et le vrai danger = les attaques esquivables.
const BOSS_BITE_MUL = 0.5
const BOSS_XP_MUL = 91 // XP massive
const BOSS_SCALE_MUL = 2.2 // taille imposante (uniquement les boss = MONSTRES agrandis, PAS les sprites dédiés)
// BOSS DE RAID (sprites dédiés `rig`) : PV-mur infranchissable en solo + dégâts qui écrasent.
const RAID_HP_MUL = 319 // dizaines de milliers de PV (fixe)
const RAID_DMG_MUL = 34 // chaque coup enlève une énorme part de vie -> facetank = mort

// DRAGON SEGMENTÉ : la tête (= le Monster) tire une chaîne de segments. Chaque segment est CONTRAINT
// en continu à distance fixe derrière celui qui le précède (suivi fluide, pas de saut de point).
const DRAGON_BODY = ['body1', 'body2', 'body1', 'body2', 'body1', 'body2', 'body1', 'body2', 'body1', 'bodyend'] // long serpent crème/bleu + queue
const DRAGON_SEG_DIST = 20 // espacement (px, avant scale) entre 2 segments

/**
 * Monster — IA simple : patrouille aléatoire, puis poursuite si le joueur entre
 * dans son rayon d'aggro. Inflige des dégâts au contact, meurt à 0 PV (drop + XP).
 */
export default class Monster extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, typeKey, opts = {}) {
    const def = MONSTER_TYPES[typeKey]
    super(scene, x, y, def.key, 0)
    scene.add.existing(this)
    scene.physics.add.existing(this)

    const level = opts.level ?? 1
    const elite = opts.elite ?? false
    const boss = opts.boss ?? false
    this.typeKey = typeKey
    this.def = def
    this.level = level
    this.elite = elite
    this.isBoss = boss
    this.rig = def.rig ?? null // boss à sprites dédiés (anims idle/walk/hit) au lieu des anims directionnelles
    this.dragon = !!def.dragon // boss SEGMENTÉ (tête + chaîne de corps qui ondule) -> rendu custom
    this.seaPatrol = opts.seaPatrol ?? null // dragon de mer d'AMBIANCE : orbite autour de l'île, sans interaction
    this.isRaid = !!def.raid // boss de raid = intuable solo (PV-mur + dégâts qui écrasent)
    this.ranged = !!def.ranged // boss à DISTANCE : télégraphe (anim shoot) puis tire un projectile à esquiver
    this.eliteName = opts.name ?? null

    // SCALING : mob normal = par niveau de ZONE (1→6) ; BOSS = stats FIXES (lvlMul=1) ; ÉLITE = ×2 PV/×1.5 dmg à plat.
    const scaleLevel = level // niveau de zone (1→6)
    const lvlMul = boss ? 1 : Math.pow(MOB_HP_MUL, scaleLevel - 1) // PV/XP (boss non scalé)
    const dmgLvlMul = boss ? 1 : Math.pow(MOB_DMG_MUL, scaleLevel - 1) // dégâts (plus doux que les PV)
    this.lvlMul = lvlMul
    this.displayLevel = scaleLevel
    const eliteHpMul = elite ? 4 : 1 // élite = RARE mais un vrai défi : énormément de PV (mini-boss)...
    const eliteDmgMul = elite ? 2 : 1 // ...et de dégâts (pas juste +x%)
    const hpMul = this.isRaid ? RAID_HP_MUL : boss ? BOSS_HP_MUL : 1
    const dmgMul = this.isRaid ? RAID_DMG_MUL : boss ? BOSS_DMG_MUL : 1
    const xpMul = boss ? BOSS_XP_MUL : elite ? 3 : 1
    this.maxHp = Math.round(def.hp * lvlMul * hpMul * eliteHpMul)
    this.hp = this.maxHp
    this.damage = Math.round(def.damage * dmgLvlMul * dmgMul * eliteDmgMul)
    this.dmgScale = dmgLvlMul * dmgMul * eliteDmgMul // facteur de dégâts total (utilisé pour les projectiles de boss)
    const xpLvlMul = boss ? 1 : Math.pow(MOB_XP_MUL, scaleLevel - 1) // XP : courbe PLATE (pas ×2/niv comme les PV)
    this.xpReward = Math.round(def.xp * xpLvlMul * xpMul)
    this.displayName = opts.name ?? def.name // nom affiché (boss/élite nommés, sinon type)
    this.aggroRange = boss ? def.aggro + 70 : def.aggro // le boss repère de plus loin
    this.leashRange = boss ? 700 : LEASH_RANGE // ...et lâche beaucoup moins vite

    // taille : les boss à sprite dédié sont DÉJÀ grands (scale ~1) ; seuls les boss = monstres
    // agrandis prennent BOSS_SCALE_MUL.
    const dedicated = this.rig || this.dragon // sprite(s) dédié(s) -> on n'applique PAS BOSS_SCALE_MUL
    const s = (def.scale ?? 1) * (dedicated ? 1 : boss ? BOSS_SCALE_MUL : elite ? 1.4 : 1)
    this.setScale(s)
    this.barOffsetY = Math.round(9 * s + 3) // barre de vie remontée pour les gros

    this.setCollideWorldBounds(!this.seaPatrol) // le dragon de mer va dans l'océan -> pas de clamp aux bords
    // hitbox : boss à sprite dédié = body dédié (en px de texture) ; sinon 11x11 proportionnel au scale.
    if (dedicated && def.body) this.body.setSize(def.body.w, def.body.h, true)
    else this.body.setSize(11, 11, true)
    if (def.solid || (boss && !this.dragon)) this.setImmovable(true) // boss = mur : le joueur bute dessus, ne le traverse pas
    this.facing = 'down'
    this.rigState = null // état d'anim courant du rig (idle/walk/hit)
    this.rigLockUntil = 0 // pendant l'anim "hit" on ne change pas d'état
    this.rigShootUntil = 0 // boss à distance : fenêtre du télégraphe d'anim "shoot" (immobile pendant)
    this.shootFireAt = 0 // instant où le projectile part réellement (vers la fin du télégraphe)
    this.nextShootAt = 0 // cooldown entre deux tirs
    this.attackPhase = 'idle' // pattern télégraphié : idle | telegraph | dash/jump | impact | recover
    this.attackUntil = 0 // fin de la phase d'attaque courante
    this.nextAttackAt = 0 // cooldown avant la prochaine charge
    this.slamming = false // saut-slam en cours (bond) -> le collider joueur est ignoré (le boss passe au-dessus)
    this.enraged = false // transfo à 50 % PV déclenchée (def.enrage)
    this.transUntil = 0 // fin de l'anim de transformation (boss figé pendant)
    this.barrageFireAt = 0 // instant où la volée du déluge part (def.barrage)
    this.attackAngle = 0 // direction verrouillée de la charge (posée au début du télégraphe)
    this.charging = false // en plein dash (dégâts majorés au contact)
    this.chargeHitDone = false // un seul gros coup par dash
    // ===== SYSTÈME DE PHASES + CAPACITÉS TÉLÉGRAPHIÉES (WoW-like) =====
    this.attackOwner = null // capacité qui POSSÈDE le cycle d'attaque en cours (attackPhase partagé entre briques)
    this._transApplied = false
    this.phaseIndex = 0 // nb de paliers de phase FRANCHIS
    this.phaseCdMul = 1 // cumul des cdMul des paliers franchis (raccourcit les cooldowns en fin de combat)
    this.phases = this._buildPhases(def) // paliers triés (def.phases OU migration de def.enrage)
    this._pendingScale = null // grossissement différé appliqué en fin de gel Trans
    // capacités DÉBLOQUÉES : on seed le kit de DÉPART = capacités de la def NON verrouillées par un palier (add:[...])
    this.phaseAbilities = new Set()
    {
      const gated = new Set()
      for (const ph of this.phases) if (Array.isArray(ph.add)) for (const k of ph.add) gated.add(k)
      for (const k of ['charge', 'slam', 'barrage', 'cone', 'voidzone', 'nova', 'adds']) if (def[k] && !gated.has(k)) this.phaseAbilities.add(k)
    }
    this.coneNextAt = 0; this.coneAngle = 0; this.coneHitDone = false // cône frontal
    this.novaNextAt = 0; this.novaHitDone = false // nova de recul
    this.voidNextAt = 0; this.voidSpots = null // flaques persistantes
    this.addsNextAt = 0 // invocation d'adds
    this.attackGraceUntil = 0 // répit d'ouverture posé par wake() (anti one-shot au réveil)
    this.globalAbilityCd = 0 // TEMPS MORT après CHAQUE capacité -> empêche d'enchaîner A->B->C sans répit
    this._wasAttacking = false // suivi de la transition (capacité en cours -> idle) pour poser le temps mort
    this.summonedBy = null; this.isAdd = false // marqueurs d'add (sbire invoqué par un boss)
    // ATTAQUE SPÉCIALE DES MOBS normaux (def.mobAtk : lunge/shoot/zone) — moteur léger, distinct des boss
    this.mobPhase = 'idle' // idle | telegraph | dash | recover
    this.mobUntil = 0
    this.nextMobAtk = 0
    this.mobAngle = 0
    this.mobDashHit = false
    if (this.dragon) this.setupDragon()
    else if (this.rig) this.playRig('idle')
    else this.anims.play(`mon-${typeKey}-down`, true)

    // teinte dorée permanente pour les élites "shiny"
    this.baseTint = elite ? 0xffd54a : null
    if (this.baseTint !== null) this.setTint(this.baseTint)

    this.nextBiteAt = 0
    this.repickAt = 0
    this.knockbackUntil = 0 // fenêtre de RECUL : l'IA ne reprend pas la main tant qu'elle dure
    this.aggroed = false // poursuit-il le joueur en ce moment ?
    this.combatEngaged = false // BOSS : le combat a-t-il VRAIMENT commencé (joueur l'a tapé / touché) -> scelle l'arène
    this.returning = false // rentre-t-il à son spawn après avoir abandonné ? (ignore le joueur)
    this.leashX = x // ancre posée au moment où il repère le joueur (origine du leash)
    this.leashY = y
    this.wander = new Phaser.Math.Vector2(0, 0)
    this.homeX = x
    this.homeY = y
    this.homeBiome = scene.biomeAt(Math.floor(x / 16), Math.floor(y / 16)) // biome de spawn (ne le quitte pas en poursuivant)

    // barre de vie (cachée tant que le monstre est intact)
    this.hpBarBg = scene.add.rectangle(x, y - this.barOffsetY, 16, 3, 0x000000, 0.6).setDepth(50000).setVisible(false)
    this.hpBarFg = scene.add.rectangle(x, y - this.barOffsetY, 14, 1, elite ? 0xffaa33 : 0xff4444).setOrigin(0, 0.5).setDepth(50001).setVisible(false)
    this.hpHideAt = 0

    // étiquette : ÉLITE -> nom + niveau toujours visibles (or) ; NORMAL -> "Niv.X" qui
    // n'apparaît qu'avec la barre de vie (au combat) pour ne pas surcharger l'écran.
    const labelTxt = elite ? `★ ${this.eliteName} · Niv.${this.displayLevel}` : `Niv.${this.displayLevel}`
    this.infoText = scene.add
      .text(x, y - this.barOffsetY - 4, labelTxt, {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: elite ? '#ffe066' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(50002)
      .setResolution(3)
      .setVisible(elite)

    // BOSS : aura menaçante au sol ; sa vie s'affiche dans la barre de boss en haut de l'écran
    // (donc on masque sa barre/étiquette au-dessus de la tête pour éviter le doublon).
    if (boss) {
      // largeur de l'aura calée sur la taille AFFICHÉE du boss ; raid = bleu glacial, sinon rouge sang.
      const auraW = dedicated ? this.displayWidth * 0.7 : 34 * s
      const auraH = dedicated ? this.displayHeight * 0.22 : 13 * s
      const auraColor = this.isRaid ? 0x2a6bff : 0x8a0f12
      this.auraY = dedicated ? this.displayHeight * 0.36 : 6 // pieds du boss
      this.aura = scene.add.ellipse(x, y + this.auraY, auraW, auraH, auraColor, 0.34).setDepth(0)
      scene.tweens.add({ targets: this.aura, scaleX: 1.3, scaleY: 1.3, alpha: 0.18, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
      this.hpBarBg.setVisible(false)
      this.hpBarFg.setVisible(false)
      this.infoText.setVisible(false)
    }
  }

  /** Engage le combat (poursuite). Pour un BOSS, c'est définitif (aucune fuite possible).
   *  `force` = true quand le monstre a été FRAPPÉ (il contre-attaque toujours, hors plafond). */
  engage(force = false) {
    if (this.aggroed) return
    if (!this.isBoss && this.scene.currentBiome === 'prairie') return // joueur dans la zone sûre -> les mobs le snobent (même frappés)
    // PLAFOND D'AGGRO : seul un petit nombre de monstres NORMAUX peut poursuivre le joueur à la fois
    // (sinon un biome dense te submerge ; en multi, un joueur ne pourrait pas "ramasser" tout le biome).
    if (!force && !this.isBoss && this.scene.aggroSlotFree && !this.scene.aggroSlotFree()) return
    this.aggroed = true
    this.returning = false
    this.leashX = this.x // ancre du leash (ignorée par les boss)
    this.leashY = this.y
    if (!this.isBoss) this.showAlert() // « ! » : le monstre vient de te REPÉRER
  }

  /** « ! » rouge au-dessus de la tête au moment où le monstre te repère (pop + disparition). */
  showAlert() {
    if (!this.alert) {
      this.alert = this.scene.add
        .text(this.x, this.y, '!', { fontFamily: 'Georgia, serif', fontSize: '13px', fontStyle: 'bold', color: '#ff5140', stroke: '#1a0a06', strokeThickness: 3 })
        .setOrigin(0.5, 1)
        .setResolution(3)
        .setDepth(60004)
    }
    this.scene.tweens.killTweensOf(this.alert)
    this.alert.setVisible(true).setAlpha(1).setScale(0.5).setPosition(this.x, this.y - this.barOffsetY - 6)
    this.scene.tweens.add({ targets: this.alert, scale: 1, duration: 160, ease: 'Back.out' })
    this.scene.tweens.add({ targets: this.alert, alpha: 0, delay: 700, duration: 250, onComplete: () => this.alert?.setVisible(false) })
  }

  /** Réveille un BOSS (1re attaque reçue) : il s'engage définitivement (combatEngaged -> arène + musique),
   *  mais PATIENTE BOSS_WAKE_DELAY avant de mordre/charger -> le joueur a le temps de se replacer après
   *  son coup/dash. Appelé une seule fois (transition endormi -> réveillé). */
  wake(now) {
    if (this.combatEngaged) return
    this.combatEngaged = true
    this.engage()
    this.nextBiteAt = now + BOSS_WAKE_DELAY
    this.nextAttackAt = now + BOSS_WAKE_DELAY
    this.attackGraceUntil = now + BOSS_WAKE_DELAY // répit d'ouverture : AUCUNE capacité (cône/nova/flaques/adds inclus) ne démarre avant
  }

  /** RALENTI (Blizzard du Mage) : réduit la vitesse de nav de `factor` pendant `durationMs`. (Contrôle ->
   *  PAS sur les boss, comme stun/fear : on ne contrôle pas un boss, on le blesse seulement.) */
  applySlow(durationMs, factor = 0.5) {
    if (this.isBoss) return
    const now = this.scene?.time?.now ?? 0
    this.slowUntil = now + durationMs
    this.slowFactor = factor
  }

  /** ÉTOURDISSEMENT (Onde de choc du Tank, Cri de guerre du Guerrier) : gel DUR (immobile + passif + "z Z z",
   *  cf. update). Marche AUSSI sur les boss — la durée est fixée par l'appelant (mob long, boss court). */
  stun(durationMs) {
    this.stunnedUntil = (this.scene?.time?.now ?? 0) + durationMs
  }

  /** PEUR (Cri intimidant du Guerrier) : fuit le joueur et ne mord pas pendant `durationMs`. (Pas sur les boss.) */
  fear(durationMs) {
    if (this.isBoss) return
    this.fearUntil = (this.scene?.time?.now ?? 0) + durationMs
    this.aggroed = false
  }

  /** BRÛLURE (Mage feu) : `dmg` dégâts toutes les 0,5 s pendant `durationMs` (DoT). */
  applyBurn(dmg, durationMs) {
    const now = this.scene?.time?.now ?? 0
    this.burnDmg = dmg
    this.burnUntil = now + durationMs
    this.burnTickAt = now + 500
  }

  /** AFFAIBLISSEMENT (Mage ombre) : réduit les dégâts de morsure de `factor` pendant `durationMs`.
   *  (Contrôle -> PAS sur les boss, comme stun/fear/ralenti.) */
  applyWeaken(factor, durationMs) {
    if (this.isBoss) return
    this.weakenFactor = factor
    this.weakenUntil = (this.scene?.time?.now ?? 0) + durationMs
  }

  /** Joue l'anim d'un boss à rig (idle/walk/hit) sans la relancer si déjà en cours. */
  playRig(state) {
    if (this.rigState === state) return
    // certains rigs n'ont pas de "walk" (ex. GiantFlam) -> on retombe sur idle
    const key = `boss-${this.rig}-${state}`
    const finalKey = this.scene.anims.exists(key) ? key : `boss-${this.rig}-idle`
    this.rigState = state
    this.anims.play(finalKey, true)
  }

  /** Indicateur "endormi" : petit "z Z z" flottant qui ondule au-dessus du boss tant qu'il dort.
   *  Créé à la demande, masqué/réaffiché selon `on`, détruit avec le boss. */
  showSleep(time, on) {
    if (!on) { this.sleepText?.setVisible(false); return }
    if (!this.sleepText) {
      this.sleepText = this.scene.add.text(this.x, this.y, 'z Z z', {
        fontFamily: 'monospace', fontSize: '11px', color: '#bfe0ff', stroke: '#10204a', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(50002)
    }
    this.sleepText.setPosition(this.x, this.y - this.barOffsetY - 6 + Math.sin(time / 400) * 2)
    this.sleepText.setAlpha(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time / 480)))
    this.sleepText.setVisible(true)
  }

  /** Normalise les paliers de phase : def.phases (copie triée) OU migration de def.enrage en 1 palier trans
   *  (rétro-compat tengu) OU [] (boss sans palier). Trié par seuil de PV DÉCROISSANT. */
  _buildPhases(def) {
    let list
    if (Array.isArray(def.phases) && def.phases.length) list = def.phases.map((p) => ({ ...p }))
    else if (def.enrage) { const e = def.enrage; list = [{ atPct: e.hpPct ?? 0.5, dmgMul: e.dmgMul ?? 1.4, cdMul: e.cdMul ?? 1, scale: e.scale ?? null, trans: true }] }
    else list = []
    return list.sort((a, b) => (b.atPct ?? 0) - (a.atPct ?? 0))
  }

  /** Franchit les paliers de phase passés sous leur seuil de PV (généralise l'enrage 50%) : déverrouille des
   *  capacités, boost dégâts/cadence/taille, joue Trans (gel), invoque des adds. Renvoie true SEULEMENT pendant
   *  le gel de transformation -> l'appelant saute la frame. */
  updatePhases(time) {
    if (time < this.transUntil) { this.setVelocity(0, 0); return true } // gel Trans en cours
    if (this._pendingScale && !this._transApplied) { // applique le grossissement différé en fin de gel
      this._transApplied = true
      this.setScale(Math.abs(this.scaleX) * this._pendingScale, this.scaleY * this._pendingScale)
      this._pendingScale = null; this.rigState = null
    }
    if (this.phaseIndex >= this.phases.length) return false
    const ph = this.phases[this.phaseIndex]
    if (this.hp > this.maxHp * (ph.atPct ?? 0)) return false // seuil pas encore atteint
    this.phaseIndex++
    if (Array.isArray(ph.add)) for (const k of ph.add) this.phaseAbilities.add(k) // le kit GRANDIT
    if (ph.dmgMul && ph.dmgMul !== 1) { this.damage = Math.round(this.damage * ph.dmgMul); this.dmgScale *= ph.dmgMul }
    if (ph.cdMul && ph.cdMul !== 1) this.phaseCdMul *= ph.cdMul
    if (ph.trans) this.enraged = true // flag legacy (raccourcit le windup du barrage)
    if (ph.trans) {
      const tk = `boss-${this.rig}-trans`
      if (this.rig && this.scene.anims.exists(tk)) {
        this.transUntil = time + (ph.dur ?? this.def.enrage?.dur ?? 950)
        this.attackPhase = 'idle'; this.attackOwner = null; this.rigState = 'trans'; this.anims.play(tk)
      }
      if (ph.scale) { this._pendingScale = ph.scale; this._transApplied = false }
      this.scene.bossEnrage?.(this) // flash/onde/rugissement/annonce
    } else if (ph.scale) {
      this.setScale(Math.abs(this.scaleX) * ph.scale, this.scaleY * ph.scale)
    }
    if (ph.summon) this.scene.bossSummonAdds?.(this, ph.summon) // vague d'adds à l'entrée de phase
    return time < this.transUntil
  }

  /** Garde-fou : une capacité ne peut DÉMARRER que si aucun pattern n'occupe le boss et qu'il n'est ni étourdi
   *  ni en transfo. (Un pattern EN COURS continue via attackOwner dans le dispatch.) */
  abilityOn(_name) {
    if (this.attackPhase !== 'idle') return false
    const now = this.scene.time.now
    if (now < this.attackGraceUntil) return false // répit d'ouverture après le réveil (anti one-shot)
    if (now < this.globalAbilityCd) return false // TEMPS MORT entre deux capacités (pas d'enchaînement instantané)
    if (this.stunnedUntil && now < this.stunnedUntil) return false
    if (this.fearUntil && now < this.fearUntil) return false
    if (now < this.transUntil) return false
    return true
  }

  /** CHARGE TÉLÉGRAPHIÉE. Renvoie true tant qu'une attaque occupe le boss (télégraphe/dash/récup) ->
   *  l'appelant saute alors la nav normale. Cycle : idle -> telegraph (immobile, zone au sol) ->
   *  dash (ruée le long de l'angle verrouillé, gros coup au contact) -> recover (brève pause). */
  updateBossCharge(time, player, dx, dy, dist) {
    const cfg = this.def.charge
    if (this.attackPhase === 'telegraph') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) {
        this.attackPhase = 'dash'
        this.attackUntil = time + cfg.duration
        this.charging = true
        this.chargeHitDone = false
        this.setVelocity(Math.cos(this.attackAngle) * cfg.speed, Math.sin(this.attackAngle) * cfg.speed)
        if (Math.abs(Math.cos(this.attackAngle)) > 0.2) this.setFlipX(Math.cos(this.attackAngle) < 0) // s'oriente DANS le sens de la ruée
      }
      return true
    }
    if (this.attackPhase === 'dash') {
      // pendant la charge, le collider joueur↔boss est désactivé (le boss fonce DROIT à travers) -> les
      // dégâts du dash se font ICI par test de distance (un seul gros coup, ×dmgMul). Esquive = sortir de l'axe.
      if (!this.chargeHitDone) {
        const reach = cfg.hitRadius ?? (Math.max(this.body.halfWidth, this.body.halfHeight) + 14)
        if (dist <= reach && player.takeDamage(Math.round(this.damage * (cfg.dmgMul ?? 1.5)), time)) {
          this.chargeHitDone = true
          this.scene.onBossChargeHit?.(this)
        }
      }
      if (time >= this.attackUntil) {
        this.attackPhase = 'recover'
        this.attackUntil = time + 360
        this.charging = false
        this.setVelocity(0, 0)
      }
      return true
    }
    if (this.attackPhase === 'recover') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) {
        this.attackPhase = 'idle'
        this.setOrigin(0.5, 0.5) // restaure l'origine (le rig charge l'avait calée plus bas)
        this.rigState = null // force le rejeu de l'anim idle/walk au prochain updateFacing
      }
      return true
    }
    // idle : déclenche une charge si le joueur est à portée et le cooldown est écoulé
    if (time >= this.nextAttackAt && dist <= cfg.range) {
      this.attackPhase = 'telegraph'
      this.attackUntil = time + cfg.windup
      this.attackAngle = Math.atan2(dy, dx)
      this.nextAttackAt = time + cfg.windup + cfg.duration + cfg.cooldown // prochaine décision après tout le cycle
      this.setVelocity(0, 0)
      // anim de ruée (boucle) ; origine éventuellement recalée (frame de charge plus grande que l'idle,
      // ex. samouraï 96×96 vs 96×48 -> chargeOriginY pour aligner les pieds ; frog/racoon = même taille -> 0.5)
      this.setOrigin(0.5, cfg.chargeOriginY ?? 0.5)
      this.rigState = 'charge'
      // certains boss n'ont pas de feuille "charge" dédiée (ex. Cyclopes : bull-rush) -> on garde l'idle pendant la ruée
      const ck = `boss-${this.rig}-charge`
      this.anims.play(this.scene.anims.exists(ck) ? ck : `boss-${this.rig}-idle`, true)
      if (Math.abs(dx) > 0.3) this.setFlipX(dx < 0)
      this.scene.bossChargeTelegraph?.(this, this.attackAngle, cfg) // zone de danger au sol
      return true
    }
    return false
  }

  /** SAUT-SLAM TÉLÉGRAPHIÉ (boss avec def.slam, ex. Gélées). Cycle : idle -> telegraph (immobile, cercle
   *  de danger au sol VERROUILLÉ sur la position du joueur) -> jump (bond en arc vers ce point) ->
   *  impact (onde de choc + AoE circulaire) -> recover. Esquive = quitter le cercle avant l'impact.
   *  Renvoie true tant qu'une phase occupe le boss. */
  updateBossSlam(time, player, dx, dy, dist) {
    const cfg = this.def.slam
    if (this.attackPhase === 'telegraph') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) {
        this.attackPhase = 'jump'
        this.attackUntil = time + cfg.jumpDur
        this.jumpStart = time
        this.jumpFromX = this.x
        this.jumpFromY = this.y
        this.slamScaleX = Math.abs(this.scaleX)
        this.slamScaleY = this.scaleY
        this.slamHitDone = false
        this.slamming = true // collider joueur ignoré -> le boss passe AU-DESSUS pendant le bond
      }
      return true
    }
    if (this.attackPhase === 'jump') {
      const t = Phaser.Math.Clamp((time - this.jumpStart) / cfg.jumpDur, 0, 1)
      this.setPosition(Phaser.Math.Linear(this.jumpFromX, this.slamX, t), Phaser.Math.Linear(this.jumpFromY, this.slamY, t))
      this.setVelocity(0, 0)
      const hop = Math.sin(t * Math.PI) // 0 -> 1 -> 0 : la gélée gonfle au sommet du bond
      this.setScale(this.slamScaleX * (1 + 0.4 * hop), this.slamScaleY * (1 + 0.4 * hop))
      if (t >= 1 && !this.slamHitDone) {
        this.slamHitDone = true
        this.setScale(this.slamScaleX, this.slamScaleY)
        const pd = Math.hypot(player.x - this.slamX, player.y - this.slamY)
        if (pd <= cfg.hitRadius) player.takeDamage(Math.round(this.damage * (cfg.dmgMul ?? 1.6)), time)
        this.scene.onBossSlamImpact?.(this, this.slamX, this.slamY, cfg)
        this.attackPhase = 'impact'
        this.attackUntil = time + 220
        this.slamming = false
      }
      return true
    }
    if (this.attackPhase === 'impact') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) { this.attackPhase = 'recover'; this.attackUntil = time + 320 }
      return true
    }
    if (this.attackPhase === 'recover') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) { this.attackPhase = 'idle'; this.rigState = null } // force le rejeu de l'idle
      return true
    }
    // idle : déclenche un slam si le joueur est à portée et le cooldown est écoulé
    if (time >= this.nextAttackAt && dist <= cfg.range) {
      this.attackPhase = 'telegraph'
      this.attackUntil = time + cfg.windup
      this.slamX = player.x // point d'impact VERROUILLÉ au début du télégraphe -> esquivable
      this.slamY = player.y
      this.nextAttackAt = time + cfg.windup + cfg.jumpDur + cfg.cooldown
      this.setVelocity(0, 0)
      if (Math.abs(dx) > 0.3) this.setFlipX(dx < 0)
      this.scene.bossSlamTelegraph?.(this, this.slamX, this.slamY, cfg) // cercle de danger au sol
      return true
    }
    return false
  }

  /** DÉLUGE TÉLÉGRAPHIÉ (boss avec def.barrage, ex. Tengu). Cycle : idle -> telegraph (immobile, anim
   *  Attack ; à ~70 % du geste, une VOLÉE en éventail part vers le joueur) -> recover. En FUREUR (enraged),
   *  windup et cooldown sont raccourcis. Renvoie true tant qu'une phase occupe le boss. */
  updateBossBarrage(time, player, dx, dy, dist) {
    const cfg = this.def.barrage
    if (this.attackPhase === 'telegraph') {
      this.setVelocity(0, 0)
      if (this.barrageFireAt && time >= this.barrageFireAt) {
        this.barrageFireAt = 0
        this.scene.bossFireBarrage?.(this, player)
      }
      if (time >= this.attackUntil) { this.attackPhase = 'recover'; this.attackUntil = time + (cfg.recover ?? 450) }
      return true
    }
    if (this.attackPhase === 'recover') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) { this.attackPhase = 'idle'; this.rigState = null }
      return true
    }
    // idle : déclenche un déluge si le joueur est à portée et le cooldown est écoulé
    if (time >= this.nextAttackAt && dist <= cfg.range) {
      const enr = this.phaseCdMul ?? 1 // paliers de phase franchis : geste + cooldown raccourcis
      const windup = cfg.windup * enr
      this.attackPhase = 'telegraph'
      this.attackUntil = time + windup
      this.barrageFireAt = time + windup * 0.7 // la volée part vers la fin du geste
      this.nextAttackAt = time + windup + (cfg.recover ?? 450) + cfg.cooldown * enr
      this.setVelocity(0, 0)
      if (Math.abs(dx) > 0.3) this.setFlipX(dx < 0)
      this.rigState = null
      const ak = `boss-${this.rig}-attack`
      this.anims.play(this.scene.anims.exists(ak) ? ak : `boss-${this.rig}-idle`, true)
      this.rigState = 'attack'
      return true
    }
    return false
  }

  /** CÔNE FRONTAL (cleave/souffle). idle -> telegraph (immobile, secteur de danger VERROUILLÉ dans l'axe
   *  boss->joueur) -> active (le secteur flashe, tout ce qui est DANS le cône est touché : portée + angle) ->
   *  recover. Esquive = passer DERRIÈRE/SUR LE CÔTÉ du boss avant la résolution. */
  updateBosscone(time, player, dx, dy, dist) {
    const cfg = this.def.cone
    if (this.attackPhase === 'telegraph') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) {
        this.attackPhase = 'active'; this.attackUntil = time + (cfg.active ?? 180)
        if (!this.coneHitDone) {
          const range = cfg.range ?? 150, half = cfg.halfAngle ?? 0.6
          const toP = Math.atan2(player.y - this.y, player.x - this.x)
          const diff = Phaser.Math.Angle.Wrap(toP - this.coneAngle)
          if (dist <= range && Math.abs(diff) <= half && player.takeDamage(Math.round(this.damage * (cfg.dmgMul ?? 1.5)), time)) {
            this.coneHitDone = true; this.scene.onBossConeHit?.(this, this.coneAngle, cfg)
          }
        }
      }
      return true
    }
    if (this.attackPhase === 'active') { this.setVelocity(0, 0); if (time >= this.attackUntil) { this.attackPhase = 'recover'; this.attackUntil = time + (cfg.recover ?? 320) } ; return true }
    if (this.attackPhase === 'recover') { this.setVelocity(0, 0); if (time >= this.attackUntil) { this.attackPhase = 'idle'; this.rigState = null } ; return true }
    if (time >= this.coneNextAt && dist <= (cfg.range ?? 150)) {
      const cd = this.phaseCdMul ?? 1, windup = (cfg.windup ?? 700) * cd
      this.attackPhase = 'telegraph'; this.attackUntil = time + windup
      this.coneAngle = Math.atan2(dy, dx); this.coneHitDone = false
      this.coneNextAt = time + windup + (cfg.active ?? 180) + (cfg.recover ?? 320) + (cfg.cooldown ?? 2600) * cd
      this.setVelocity(0, 0); if (Math.abs(dx) > 0.3) this.setFlipX(dx < 0); this.rigState = null
      if (this.rig) this.anims.play(`boss-${this.rig}-idle`, true)
      this.scene.bossConeTelegraph?.(this, this.coneAngle, cfg)
      return true
    }
    return false
  }

  /** NOVA POINT-BLANK (anneau de choc qui éjecte le joueur). idle -> telegraph (anneau CENTRÉ SUR LE BOSS) ->
   *  active (test de rayon : <= radius touché ET repoussé) -> recover. Esquive = SORTIR du rayon avant la résolution. */
  updateBossnova(time, player, dx, dy, dist) {
    const cfg = this.def.nova
    if (this.attackPhase === 'telegraph') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) {
        this.attackPhase = 'active'; this.attackUntil = time + (cfg.active ?? 160)
        if (!this.novaHitDone && dist <= (cfg.radius ?? 120) && player.takeDamage(Math.round(this.damage * (cfg.dmgMul ?? 1.3)), time)) {
          this.novaHitDone = true
          const d = dist || 1, k = cfg.knock ?? 0
          if (k > 0) player.knockback((dx / d) * k, (dy / d) * k, cfg.knockMs ?? 260)
          this.scene.onBossNovaHit?.(this, cfg)
        }
      }
      return true
    }
    if (this.attackPhase === 'active') { this.setVelocity(0, 0); if (time >= this.attackUntil) { this.attackPhase = 'recover'; this.attackUntil = time + (cfg.recover ?? 320) } ; return true }
    if (this.attackPhase === 'recover') { this.setVelocity(0, 0); if (time >= this.attackUntil) { this.attackPhase = 'idle'; this.rigState = null } ; return true }
    if (time >= this.novaNextAt && dist <= (cfg.range ?? 150)) {
      const cd = this.phaseCdMul ?? 1, windup = (cfg.windup ?? 800) * cd
      this.attackPhase = 'telegraph'; this.attackUntil = time + windup; this.novaHitDone = false
      this.novaNextAt = time + windup + (cfg.active ?? 160) + (cfg.recover ?? 320) + (cfg.cooldown ?? 4000) * cd
      this.setVelocity(0, 0); if (Math.abs(dx) > 0.3) this.setFlipX(dx < 0); this.rigState = null
      if (this.rig) this.anims.play(`boss-${this.rig}-idle`, true)
      this.scene.bossNovaTelegraph?.(this, cfg)
      return true
    }
    return false
  }

  /** FLAQUES PERSISTANTES (voidzone). idle -> telegraph (marqueurs au sol VERROUILLÉS) -> spawn (flaques réelles
   *  qui tiquent côté GameScene) -> recover. La 1re flaque ancre sous le joueur si anchorPlayer. */
  updateBossvoidzone(time, player, dx, dy, dist) {
    const cfg = this.def.voidzone
    if (this.attackPhase === 'telegraph') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) { this.scene.bossSpawnVoidzones?.(this, this.voidSpots, cfg); this.attackPhase = 'recover'; this.attackUntil = time + (cfg.recover ?? 320) }
      return true
    }
    if (this.attackPhase === 'recover') { this.setVelocity(0, 0); if (time >= this.attackUntil) { this.attackPhase = 'idle'; this.rigState = null } ; return true }
    if (time >= this.voidNextAt && dist <= (cfg.range ?? 300)) {
      const cd = this.phaseCdMul ?? 1, windup = (cfg.windup ?? 760) * cd
      const count = cfg.count ?? 3, spread = cfg.spread ?? 95
      this.voidSpots = []
      for (let i = 0; i < count; i++) {
        if (i === 0 && cfg.anchorPlayer) this.voidSpots.push({ x: player.x, y: player.y })
        else { const a = Phaser.Math.FloatBetween(0, Math.PI * 2), rr = Phaser.Math.FloatBetween(spread * 0.35, spread); this.voidSpots.push({ x: player.x + Math.cos(a) * rr, y: player.y + Math.sin(a) * rr }) }
      }
      this.attackPhase = 'telegraph'; this.attackUntil = time + windup
      this.voidNextAt = time + windup + (cfg.recover ?? 320) + (cfg.cooldown ?? 5000) * cd
      this.setVelocity(0, 0); if (Math.abs(dx) > 0.3) this.setFlipX(dx < 0); this.rigState = null
      if (this.rig) this.anims.play(`boss-${this.rig}-idle`, true)
      this.scene.bossVoidzoneTelegraph?.(this, this.voidSpots, cfg)
      return true
    }
    return false
  }

  /** INVOCATION D'ADDS (def.adds récurrent). windup court -> pop (côté GameScene, exemptés d'arène) -> recover. */
  updateBossadds(time, player, dx, dy, dist) {
    const cfg = this.def.adds
    if (this.attackPhase === 'telegraph') {
      this.setVelocity(0, 0)
      if (time >= this.attackUntil) { this.scene.bossSummonAdds?.(this, cfg); this.attackPhase = 'recover'; this.attackUntil = time + (cfg.recover ?? 300) }
      return true
    }
    if (this.attackPhase === 'recover') { this.setVelocity(0, 0); if (time >= this.attackUntil) { this.attackPhase = 'idle'; this.rigState = null } ; return true }
    if (time >= this.addsNextAt) {
      const cd = this.phaseCdMul ?? 1, windup = (cfg.windup ?? 700) * cd
      this.attackPhase = 'telegraph'; this.attackUntil = time + windup
      this.addsNextAt = time + windup + (cfg.recover ?? 300) + (cfg.cooldown ?? 12000) * cd
      this.setVelocity(0, 0); this.rigState = null
      if (this.rig) this.anims.play(`boss-${this.rig}-idle`, true)
      this.scene.bossAddsTelegraph?.(this, cfg)
      return true
    }
    return false
  }

  /** Crée la chaîne de segments + les ailes du dragon. La tête (=`this`) reste l'entité de combat. */
  setupDragon() {
    const sc = this.scaleX
    this.segDist = DRAGON_SEG_DIST * sc
    this.setDepth(this.y)
    // segments alignés DERRIÈRE la tête (qui regarde par défaut vers le bas -> corps au-dessus au départ)
    this.segs = DRAGON_BODY.map((p, i) =>
      this.scene.add.image(this.x, this.y - (i + 1) * this.segDist, `boss_dragon_${p}`).setScale(sc).setDepth(this.y - 1 - i)
    )
    // 2 ailes flanquant la tête (miroir via le SIGNE du scaleX), battent en vol
    this.wingL = this.scene.add.image(this.x, this.y, 'boss_dragon_wing').setScale(sc).setDepth(this.y - 0.5)
    this.wingL.wingSign = 1
    this.wingR = this.scene.add.image(this.x, this.y, 'boss_dragon_wing').setScale(sc).setDepth(this.y - 0.5)
    this.wingR.wingSign = -1
    this.updateDragon(0)
  }

  /** Dragon de MER d'ambiance : suit une orbite elliptique au large de l'île (rôde sans fin),
   *  tête orientée dans le sens de la nage. Aucune interaction (ni aggro, ni dégâts, ni arène). */
  updateSeaPatrol(time) {
    const sp = this.seaPatrol
    const path = sp.path // boucle de points qui ÉPOUSE la côte (dans l'océan) -> ne traverse pas la terre
    const n = path.length
    // point + direction du chemin à un index FRACTIONNAIRE (interpolé, bouclé)
    const at = (ff) => {
      const f = ((ff % n) + n) % n
      const i = Math.floor(f)
      const t = f - i
      const a = path[i]
      const b = path[(i + 1) % n]
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) }
    }
    const headF = (time / 1000) * sp.speed // avance le long du chemin
    const h = at(headF)
    this.rotation = h.a - Math.PI / 2 // tête (défaut bas) vers le sens de nage
    this.setPosition(h.x, h.y).setDepth(h.y)
    // TOUT le corps suit le CHEMIN derrière la tête -> le serpent entier longe la côte (pas de corde sur terre)
    for (let i = 0; i < this.segs.length; i++) {
      const pt = at(headF - (i + 1) * sp.segGap)
      this.segs[i].setPosition(pt.x, pt.y).setDepth(h.y - 1 - i).setRotation(pt.a - Math.PI / 2)
    }
    const beat = 1 + Math.sin(time / 80) * 0.22
    for (const w of [this.wingL, this.wingR]) {
      if (!w) continue
      w.setPosition(h.x, h.y).setRotation(this.rotation).setDepth(h.y - 0.5)
      w.scaleX = w.wingSign * this.scaleX * beat
    }
  }

  /** Suivi FLUIDE : chaque segment est tiré à distance fixe derrière celui qui le précède (tête en 1er). */
  updateDragon(time) {
    const v = this.body.velocity
    if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) this.rotation = Math.atan2(v.y, v.x) - Math.PI / 2 // tête face au mouvement (défaut = bas)
    let lx = this.x // position du "leader" (segment précédent / tête)
    let ly = this.y
    for (let i = 0; i < this.segs.length; i++) {
      const seg = this.segs[i]
      let dx = seg.x - lx
      let dy = seg.y - ly
      let d = Math.hypot(dx, dy)
      if (d < 0.001) { dx = 0; dy = this.segDist; d = this.segDist } // cas dégénéré -> sous le leader
      const nx = lx + (dx / d) * this.segDist // placé pile à segDist derrière le leader
      const ny = ly + (dy / d) * this.segDist
      seg.setPosition(nx, ny).setDepth(this.y - 1 - i) // tout le corps derrière la tête, ordonné
      seg.setRotation(Math.atan2(ly - ny, lx - nx) - Math.PI / 2) // orienté vers le leader
      lx = nx
      ly = ny
    }
    // ailes : sur la tête, suivent sa rotation, battent (oscillation de la largeur), DERRIÈRE la tête
    const beat = 1 + Math.sin(time / 80) * 0.22
    for (const w of [this.wingL, this.wingR]) {
      if (!w) continue
      w.setPosition(this.x, this.y).setRotation(this.rotation).setDepth(this.y - 0.5)
      w.scaleX = w.wingSign * this.scaleX * beat // signe = côté (miroir), |valeur| = battement
    }
  }

  /** Inflige des dégâts au monstre ; renvoie true s'il meurt. */
  takeDamage(amount) {
    if (this.seaPatrol) return false // dragon de mer d'ambiance : intouchable tant que la nage n'existe pas
    this.hp -= amount
    this.engage(true) // frappé = engagé TOUJOURS (hors plafond d'aggro) : un monstre frappé contre-attaque
    // ...SAUF si le joueur est dans la zone sûre (prairie) : on le snobe même frappé (anti-cheese du bord)
    if (this.isBoss || this.scene.currentBiome !== 'prairie') {
      this.lastHitAt = this.scene.time.now // frappé : ne lâchera pas tant qu'on le tape (cf. HIT_AGGRO_GRACE)
      this.returning = false // s'il rentrait au spawn, il fait demi-tour et revient au combat
      this.aggroed = true
      this.leashX = this.x // ré-ancre le leash là où il vient d'être frappé (poursuite repart de zéro)
      this.leashY = this.y
    }
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(80, () => {
      if (!this.active) return
      this.clearTint()
      if (this.baseTint !== null) this.setTint(this.baseTint) // re-applique l'or des élites
    })
    this.showHpBar()
    // boss à rig : joue l'anim "hit" (verrouille l'état le temps de l'anim) -> réaction visible aux coups.
    // PAS pendant une charge (telegraph/dash/recover) : on ne veut pas casser la lecture de la ruée.
    if (this.rig && this.hp > 0 && this.attackPhase === 'idle' && this.scene.anims.exists(`boss-${this.rig}-hit`)) {
      this.rigState = null // force le rejeu même si on était déjà sur un autre état
      this.anims.play(`boss-${this.rig}-hit`)
      this.rigState = 'hit'
      this.rigLockUntil = this.scene.time.now + 8 / 14 * 1000 // durée approx de l'anim hit (8 frames @14fps)
    }
    if (this.hp <= 0) {
      this.die()
      return true
    }
    return false
  }

  showHpBar() {
    if (this.isBoss) return // le boss a sa propre barre, en haut de l'écran
    this.hpBarBg.setVisible(true)
    this.hpBarFg.setVisible(true)
    this.hpHideAt = this.scene.time.now + 2500 // se cache 2,5 s après le dernier coup
  }

  /** Retire le monstre SANS récompense (ni loot ni XP ni respawn) — ex. mobs évacués d'une arène de boss. */
  despawn() {
    this.hpBarBg.destroy()
    this.hpBarFg.destroy()
    this.infoText.destroy()
    this.aura?.destroy()
    this.sleepText?.destroy()
    this.alert?.destroy()
    this.segs?.forEach((s) => s.destroy())
    this.wingL?.destroy()
    this.wingR?.destroy()
    this.destroy()
  }

  die() {
    this.scene.onMonsterKilled?.(this)
    this.hpBarBg.destroy()
    this.hpBarFg.destroy()
    this.infoText.destroy()
    this.aura?.destroy()
    this.sleepText?.destroy()
    this.alert?.destroy()
    this.segs?.forEach((s) => s.destroy()) // dragon : détruire la chaîne de segments + les ailes
    this.wingL?.destroy()
    this.wingR?.destroy()
    this.destroy()
  }

  update(time, player) {
    if (!this.active) return
    if (this.seaPatrol) {
      this.updateSeaPatrol(time)
      return
    }
    // FENÊTRE DE RECUL : on laisse la vélocité du knockback agir (légèrement amortie) sans que l'IA
    // ne reprenne le contrôle -> le coup repousse VRAIMENT le monstre, qui se replace ensuite.
    if (time < this.knockbackUntil) {
      this.body.velocity.scale(0.94)
      this.infoText.setPosition(this.x, this.y - this.barOffsetY - 4)
      this.aura?.setPosition(this.x, this.y + (this.auraY ?? 4))
      this.updateHpBar(time)
      return
    }
    // ÉTOURDISSEMENT (Onde de choc / Cri de guerre / Charge de bouclier) : immobile + passif + "z Z z" tant que
    // `stunnedUntil` court. Marche aussi sur les BOSS (gèle leurs actions le temps du stun).
    if (time < this.stunnedUntil) {
      this.setVelocity(0, 0)
      if (this.rig && !(this.rigState === 'hit' && time < this.rigLockUntil)) this.playRig('idle')
      this.showSleep(time, true) // "z Z z" pendant l'étourdissement
      this.infoText.setPosition(this.x, this.y - this.barOffsetY - 4)
      this.aura?.setPosition(this.x, this.y + (this.auraY ?? 4))
      this.updateHpBar(time)
      return
    }
    // BOSS ENDORMI : tant qu'on ne lui a pas infligé de DÉGÂTS (combatEngaged, posé par hitMonster), il
    // DORT sur son repaire — immobile, idle, ne mord pas, n'aggro pas. Passer à côté ne le réveille plus :
    // seule une ATTAQUE le réveille. À la mort/respawn, combatEngaged retombe -> il se rendort.
    if (this.isBoss && !this.combatEngaged && !this.dragon) {
      this.setVelocity(0, 0)
      this.aggroed = false
      this.returning = false
      if (this.rig && !(this.rigState === 'hit' && time < this.rigLockUntil)) this.playRig('idle')
      this.showSleep(time, true)
      if (this.aura) { this.aura.setPosition(this.x, this.y + (this.auraY ?? 4)); this.aura.setDepth(this.y - 1) }
      this.infoText.setPosition(this.x, this.y - this.barOffsetY - 4)
      this.updateHpBar(time)
      return
    }
    this.showSleep(time, false) // réveillé (ou monstre normal) : pas de "Zzz"

    // BRÛLURE (Mage feu) : dégâts par tics (0,5 s). takeDamage gère la mort -> on sort si le monstre meurt.
    if (this.burnUntil && time < this.burnUntil && time >= (this.burnTickAt ?? 0)) {
      this.burnTickAt = time + 500
      this.scene.floatingText?.(this.x, this.y - 10, `${this.burnDmg ?? 1}`, '#ff8a3a')
      if (this.takeDamage(this.burnDmg ?? 1)) return
    }

    const def = this.def
    // LEURRE (Image miroir du Mage) : le monstre POURSUIT le clone qui l'a touché (mon.lureTarget, posé à
    // l'impact d'un projectile de clone). Tant que ce clone vit, il vise le clone au lieu du joueur.
    if (this.lureTarget && !this.lureTarget.active) this.lureTarget = null
    const lure = !this.isBoss ? this.lureTarget : null
    const tgt = lure || player
    const dx = tgt.x - this.x
    const dy = tgt.y - this.y
    const dist = Math.hypot(dx, dy)

    // direction visée : où il VEUT aller (vers le joueur en poursuite, sinon errance).
    // On l'utilise pour l'anim plutôt que la vitesse physique, qui rebondit quand
    // le monstre est collé au joueur (-> oscillation gauche/droite sans fin).
    const homeDist = Math.hypot(this.homeX - this.x, this.homeY - this.y)
    const slowed = this.slowUntil && time < this.slowUntil // RALENTI (Blizzard du Mage)
    const spd = def.speed * SPEED_SCALE * (slowed ? (this.slowFactor ?? 0.5) : 1)
    let aimX
    let aimY

    // ===== DISPATCH UNIFIÉ DES PATTERNS DE BOSS (phases WoW-like + capacités télégraphiées) =====
    // 1) GESTIONNAIRE DE PHASES (généralise l'enrage 50%) : franchit les paliers (def.phases OU def.enrage migré),
    //    applique boosts/unlocks/Trans/adds. Renvoie true s'il FIGE le boss (anim Trans) -> on saute la frame.
    if (this.combatEngaged && this.updatePhases(time)) {
      if (this.isBoss && this.aura) { this.aura.setPosition(this.x, this.y + (this.auraY ?? 4)); this.aura.setDepth(this.y - 1) }
      this.infoText.setPosition(this.x, this.y - this.barOffsetY - 4)
      this.updateHpBar(time)
      return
    }
    // 2) CAPACITÉS TÉLÉGRAPHIÉES : toutes partagent attackPhase (mutuellement exclusives au runtime). attackOwner =
    //    la capacité qui POSSÈDE le cycle en cours -> une capacité ne reprend jamais le geste d'une autre. Une
    //    nouvelle ne démarre que si débloquée par phase (has) + le boss est libre (abilityOn). Priorité = ordre.
    if (this.combatEngaged) {
      const has = (k) => def[k] && this.phaseAbilities.has(k)
      const busy = this.attackPhase !== 'idle'
      if (this._wasAttacking && !busy) this.globalAbilityCd = time + 650 // une capacité vient de FINIR -> répit ~0,65 s avant d'en démarrer une autre (anti-enchaînement)
      this._wasAttacking = busy
      if (!busy) this.attackOwner = null
      const ABIL = [
        ['charge', () => this.updateBossCharge(time, player, dx, dy, dist)],
        ['slam', () => this.updateBossSlam(time, player, dx, dy, dist)],
        ['cone', () => this.updateBosscone(time, player, dx, dy, dist)],
        ['nova', () => this.updateBossnova(time, player, dx, dy, dist)],
        ['voidzone', () => this.updateBossvoidzone(time, player, dx, dy, dist)],
        ['adds', () => this.updateBossadds(time, player, dx, dy, dist)],
        ['barrage', () => this.updateBossBarrage(time, player, dx, dy, dist)],
      ]
      for (const [k, fn] of ABIL) {
        if (!has(k)) continue
        if (busy ? this.attackOwner !== k : !this.abilityOn(k)) continue
        if (fn()) {
          if (!busy) this.attackOwner = k // vient de démarrer -> il possède le cycle
          if (this.isBoss && this.aura) { this.aura.setPosition(this.x, this.y + (this.auraY ?? 4)); this.aura.setDepth(this.y - 1) }
          this.infoText.setPosition(this.x, this.y - this.barOffsetY - 4)
          this.updateHpBar(time)
          return
        }
      }
    }

    // biome courant du monstre (sert à la zone sûre prairie ET au verrou de biome ci-dessous)
    const curBiome = this.scene.biomeAt(Math.floor(this.x / 16), Math.floor(this.y / 16))
    // ZONE SÛRE (prairie/village) : un mob NORMAL SNOBE le joueur si LUI-MÊME y est OU si LE JOUEUR y est.
    // -> pas d'aggro, pas de poursuite contre le mur invisible, pas de tir dans la prairie. Les BOSS l'ignorent.
    const playerInPrairie = this.scene.currentBiome === 'prairie'
    if (!this.isBoss && (curBiome === 'prairie' || playerInPrairie)) {
      this.aggroed = false
      if (homeDist > HOME_RADIUS) this.returning = true
      if (this.mobPhase !== 'idle') { this.mobPhase = 'idle'; this.setVelocity(0, 0); this.clearTint(); if (this.baseTint != null) this.setTint(this.baseTint) } // annule un pattern en cours
    }

    // machine à états (patrouille / poursuite / retour) avec leash.
    // En "retour", la créature ignore le joueur jusqu'à être rentrée : ça évite le
    // ping-pong "rentre / re-poursuit" à la frontière (= l'effet "tourne en rond").
    if (this.returning) {
      if (homeDist <= HOME_RADIUS) this.returning = false // rentré : reprend la patrouille
    } else if (this.aggroed) {
      // Monstre normal : abandonne après LEASH_RANGE, OU dès qu'il QUITTE son biome d'origine.
      if (!this.isBoss) {
        const recentlyHit = this.lastHitAt && time - this.lastHitAt < HIT_AGGRO_GRACE // tant qu'on le tape : n'abandonne pas
        const leashDist = Math.hypot(this.leashX - this.x, this.leashY - this.y)
        if (!recentlyHit && (leashDist > this.leashRange || curBiome !== this.homeBiome)) {
          this.aggroed = false
          this.returning = true // a lâché le joueur (et plus frappé) : rentre au spawn
        }
      } else if (!this.combatEngaged && homeDist > BOSS_GUARD_LEASH) {
        // BOSS pas encore en COMBAT : il garde son repaire (te poursuit un peu puis revient) -> tu peux
        // l'observer/repartir. Une fois TAPÉ/TOUCHÉ (combatEngaged), il devient IMPLACABLE (aucune fuite).
        this.aggroed = false
        this.returning = true
      }
    } else if (dist < this.aggroRange) {
      // s'engage parce que le joueur est venu TROP PRÈS (l'engagement par coup reçu = takeDamage)
      this.engage()
    }

    // ATTAQUE SPÉCIALE DES MOBS (lunge/shoot/zone) : si engagé et un pattern occupe le mob -> on saute la nav.
    // PENDANT UNE ARÈNE de boss scellée : AUCUN mob ordinaire n'attaque le joueur (ni tir, ni zone, ni bond) ->
    // le combat reste un 1v1 avec le boss (ils sont déjà repoussés hors du cercle par keepMonsterOutOfArena ;
    // sans ce verrou, les mobs à distance crachaient leurs projectiles PAR-DESSUS le mur, dans l'arène).
    const arenaBlocksMe = this.scene.activeArena && this.summonedBy !== this.scene.activeArena.boss // un ADD du boss courant A LE DROIT d'attaquer dans l'arène
    if (arenaBlocksMe && this.mobPhase && this.mobPhase !== 'idle') { this.mobPhase = 'idle'; this.nextMobAtk = time + 600 } // coupe une attaque en cours
    if (!this.isBoss && this.def.mobAtk && this.aggroed && !arenaBlocksMe && this.updateMobAttack(time, player, dx, dy, dist)) {
      if (this.alert?.visible) this.alert.setPosition(this.x, this.y - this.barOffsetY - 6)
      this.infoText.setPosition(this.x, this.y - this.barOffsetY - 4)
      this.infoText.setVisible(this.elite || dist < NAMEPLATE_RANGE)
      this.updateHpBar(time)
      return
    }

    if (this.aggroed) {
      // poursuite du joueur
      const d = dist || 1
      let vx = (dx / d) * spd
      let vy = (dy / d) * spd
      // ANTI-BLOCAGE (IA simple) : s'il N'AVANCE PLUS alors qu'il devrait s'approcher (collé à un arbre / au bord de
      // la prairie), le mob LONGE l'obstacle (vélocité tangentielle) au lieu de faire du gauche-droite sur place.
      // Il s'engage sur un côté ~0,8 s ; si toujours bloqué, il essaie l'autre côté.
      if (time >= (this._stuckAt || 0)) {
        this._stuckAt = time + 240
        const moved = Math.hypot(this.x - (this._lx ?? this.x), this.y - (this._ly ?? this.y))
        this._lx = this.x; this._ly = this.y
        if (moved < 3 && dist > 22) {
          if (!this._sideDir || time >= (this._sideEnd || 0)) {
            this._sideToggle = this._sideToggle ? -this._sideToggle : (Phaser.Math.Between(0, 1) ? 1 : -1) // alterne le côté à chaque tentative
            this._sideDir = this._sideToggle
            this._sideEnd = time + 800
          }
        } else {
          this._sideDir = 0 // de nouveau libre -> poursuite directe
        }
      }
      if (this._sideDir && time < (this._sideEnd || 0)) {
        const tx = -dy / d, ty = dx / d // tangente (perpendiculaire au joueur) = contournement
        vx = (tx * this._sideDir * 0.9 + (dx / d) * 0.35) * spd
        vy = (ty * this._sideDir * 0.9 + (dy / d) * 0.35) * spd
      }
      this.setVelocity(vx, vy)
      aimX = vx
      aimY = vy
    } else if (this.returning) {
      // a abandonné : retourne à son point de départ
      const hx = this.homeX - this.x
      const hy = this.homeY - this.y
      const d = homeDist || 1
      this.setVelocity((hx / d) * spd, (hy / d) * spd)
      aimX = hx
      aimY = hy
    } else {
      // errance / patrouille autour du spawn.
      // BOSS : il RÔDE autour de son repaire. S'il s'est trop éloigné, il revient vers le centre
      // (patrouille tethered) au lieu de dériver -> il "garde" sa zone tant qu'on ne l'a pas provoqué.
      const tethered = this.isBoss && homeDist > PATROL_RADIUS
      if (tethered) {
        this.wander.set((this.homeX - this.x) / (homeDist || 1), (this.homeY - this.y) / (homeDist || 1))
        this.repickAt = time + Phaser.Math.Between(700, 1400) // garde ce cap un moment
      } else if (time >= this.repickAt) {
        this.repickAt = time + Phaser.Math.Between(900, 2200)
        if (Phaser.Math.Between(0, 100) < 35) {
          this.wander.set(0, 0) // pause
        } else {
          const a = Phaser.Math.FloatBetween(0, Math.PI * 2)
          this.wander.set(Math.cos(a), Math.sin(a))
        }
      }
      this.setVelocity(this.wander.x * spd * 0.5, this.wander.y * spd * 0.5)
      aimX = this.wander.x
      aimY = this.wander.y
    }

    // CONTRÔLE par compétence de set du joueur (override de la nav) : ÉTOURDI = immobile ; EFFRAYÉ = fuit.
    if (this.stunUntil && time < this.stunUntil) { this.setVelocity(0, 0); aimX = 0; aimY = 0 }
    else if (this.fearUntil && time < this.fearUntil) { const d = dist || 1; this.setVelocity(-(dx / d) * spd * 1.15, -(dy / d) * spd * 1.15); aimX = -dx; aimY = -dy }

    // BOSS À DISTANCE : tire des orbes que le joueur esquive. Le projectile part vers la FIN du
    // télégraphe (anim "shoot"), pas au début -> on a le temps de voir venir et de se décaler.
    if (this.ranged && this.hp > 0) {
      if (this.shootFireAt && time >= this.shootFireAt) {
        this.shootFireAt = 0
        this.scene.bossFireProjectile?.(this, player)
      }
      const busy = (this.rigState === 'hit' && time < this.rigLockUntil) || time < this.rigShootUntil
      if (this.aggroed && !busy && this.shootFireAt === 0 && time >= this.nextShootAt && dist <= (def.shootRange ?? 230)) {
        const dur = 5 / 12 * 1000 // durée de l'anim shoot (5 frames @ 12 fps)
        this.nextShootAt = time + (def.shootCd ?? 1700)
        this.rigShootUntil = time + dur
        this.shootFireAt = time + dur * 0.72 // l'orbe part juste avant la fin du geste
        this.setFlipX(dx < 0) // regarde sa cible
        this.rigState = null
        this.anims.play('boss-squidred-shoot')
        this.rigState = 'shoot'
      }
    }
    // immobile pendant le télégraphe de tir (il plante son geste)
    if (time < this.rigShootUntil) this.setVelocity(0, 0)

    if (this.dragon) this.updateDragon(time)
    else if (time >= this.rigShootUntil) this.updateFacing(aimX, aimY, time)
    if (this.isBoss && this.aura) {
      this.aura.setPosition(this.x, this.y + (this.auraY ?? 4)) // l'aura suit le boss
      this.aura.setDepth(this.y - 1)
    } else {
      this.infoText.setPosition(this.x, this.y - this.barOffsetY - 4) // l'étiquette suit le monstre
      // niveau VISIBLE dès qu'on s'approche (avant d'attaquer) ; l'élite est toujours affichée
      this.infoText.setVisible(this.elite || dist < NAMEPLATE_RANGE)
    }
    if (this.alert?.visible) this.alert.setPosition(this.x, this.y - this.barOffsetY - 6) // le « ! » suit le monstre
    this.updateHpBar(time)
  }

  updateHpBar(time) {
    if (!this.hpBarBg.visible) return
    if (time >= this.hpHideAt) {
      this.hpBarBg.setVisible(false)
      this.hpBarFg.setVisible(false)
      return
    }
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1)
    this.hpBarBg.setPosition(this.x, this.y - this.barOffsetY)
    this.hpBarFg.setPosition(this.x - 7, this.y - this.barOffsetY)
    this.hpBarFg.setSize(14 * ratio, 1)
  }

  /**
   * Oriente l'anim selon la direction visée, avec hystérésis : on ne bascule
   * entre horizontal et vertical que si une composante domine nettement l'autre
   * (évite le flip quand dx ≈ dy, typiquement collé au joueur).
   */
  updateFacing(ax, ay, time = 0) {
    // BOSS À RIG : sprite mono-orientation (face caméra). On gère l'état (idle/walk/hit) + flipX
    // horizontal. Pendant l'anim "hit" (rigLockUntil) on ne touche à rien -> la réaction se voit.
    if (this.rig) {
      if (this.rigState === 'hit' && time < this.rigLockUntil) return
      const moving = Math.abs(ax) > 0.3 || Math.abs(ay) > 0.3
      this.playRig(moving ? 'walk' : 'idle')
      if (Math.abs(ax) > 0.3) this.setFlipX(ax < 0) // regarde vers sa cible (gauche/droite)
      return
    }
    if (Math.abs(ax) < 0.5 && Math.abs(ay) < 0.5) return // immobile : garde l'orientation
    const horiz = this.facing === 'left' || this.facing === 'right'
    let dir = this.facing
    if (horiz) {
      // reste horizontal sauf si le vertical domine franchement
      if (Math.abs(ay) > Math.abs(ax) * 1.3) dir = ay < 0 ? 'up' : 'down'
      else dir = ax < 0 ? 'left' : 'right'
    } else {
      if (Math.abs(ax) > Math.abs(ay) * 1.3) dir = ax < 0 ? 'left' : 'right'
      else dir = ay < 0 ? 'up' : 'down'
    }
    if (dir !== this.facing) {
      this.facing = dir
      this.anims.play(`mon-${this.typeKey}-${dir}`, true)
    }
  }

  /** ATTAQUE SPÉCIALE d'un mob normal (def.mobAtk). Renvoie true tant qu'une phase l'occupe (l'appelant saute
   *  alors la nav/morsure). Types : `lunge` (bond télégraphié), `shoot` (tir esquivable), `zone` (AoE au sol). */
  updateMobAttack(time, player, dx, dy, dist) {
    const cfg = this.def.mobAtk
    if (!cfg) return false
    // mobs de bas niveau (zones de départ) = compétences PLUS LENTES : télégraphe + cadence allongés
    const slow = this.level <= 1 ? 1.7 : this.level <= 2 ? 1.4 : 1
    if (this.mobPhase === 'telegraph') {
      this.setVelocity(0, 0)
      this._mobBlink(time, cfg) // clignote en avertissement
      if (time >= this.mobUntil) {
        this.clearTint(); if (this.baseTint != null) this.setTint(this.baseTint)
        if (cfg.type === 'lunge') {
          this.mobPhase = 'dash'; this.mobUntil = time + (cfg.duration ?? 230); this.mobDashHit = false
          this.setVelocity(Math.cos(this.mobAngle) * cfg.speed, Math.sin(this.mobAngle) * cfg.speed)
        } else if (cfg.type === 'shoot') {
          this.scene.mobFireProjectile?.(this, player, cfg)
          this.mobPhase = 'recover'; this.mobUntil = time + (cfg.recover ?? 250)
        } else { // zone
          this.scene.mobZoneImpact?.(this, this.zoneX, this.zoneY, cfg)
          this.mobPhase = 'recover'; this.mobUntil = time + (cfg.recover ?? 300)
        }
      }
      return true
    }
    if (this.mobPhase === 'dash') {
      if (!this.mobDashHit) { // un seul coup par bond (test de distance, esquivable hors de l'axe)
        const reach = cfg.hitRadius ?? (this.body.halfWidth + 10)
        if (dist <= reach && player.takeDamage(Math.round(this.damage * (cfg.dmgMul ?? 1.5)), time)) this.mobDashHit = true
      }
      if (time >= this.mobUntil) { this.mobPhase = 'recover'; this.mobUntil = time + (cfg.recover ?? 260); this.setVelocity(0, 0) }
      return true
    }
    if (this.mobPhase === 'recover') {
      this.setVelocity(0, 0)
      if (time >= this.mobUntil) { this.mobPhase = 'idle'; this.nextMobAtk = time + (cfg.cooldown ?? 2500) * slow }
      return true
    }
    // idle : déclenche si à portée, cooldown écoulé, pas étourdi/effrayé
    const blocked = (this.stunUntil && time < this.stunUntil) || (this.fearUntil && time < this.fearUntil)
    if (!blocked && time >= this.nextMobAtk && dist <= cfg.range) {
      this.mobPhase = 'telegraph'; this.mobUntil = time + (cfg.windup ?? 450) * slow; this.mobAngle = Math.atan2(dy, dx)
      this.setVelocity(0, 0)
      this.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')
      if (!this.rig) this.anims.play(`mon-${this.typeKey}-${this.facing}`, true)
      if (cfg.type === 'zone') {
        this.zoneX = cfg.target === 'player' ? player.x : this.x
        this.zoneY = cfg.target === 'player' ? player.y : this.y
        this.scene.mobZoneTelegraph?.(this.zoneX, this.zoneY, cfg)
      }
      return true
    }
    return false
  }

  /** Clignotement orange d'avertissement pendant le télégraphe d'attaque d'un mob (tint blanc = neutre). */
  _mobBlink(time, cfg) {
    this.setTint(Math.floor(time / 110) % 2 === 0 ? (cfg.tellColor ?? 0xffd24a) : 0xffffff)
  }

  /** Tente de mordre le joueur au contact. Renvoie true si un coup a porté. Pendant une charge (dash),
   *  les dégâts sont majorés (×dmgMul). */
  tryBite(player, now) {
    if (!this.isBoss && this.mobPhase !== 'idle') return false // en plein pattern spécial : pas de morsure en plus
    if ((this.stunUntil && now < this.stunUntil) || (this.fearUntil && now < this.fearUntil)) return false // étourdi/effrayé : ne mord pas
    if (this.isBoss && !this.combatEngaged) return false // boss endormi : ne mord pas tant qu'on ne l'a pas réveillé
    if (this.def.charge) return false // boss à CHARGE : ne blesse QUE par son dash (test de distance) -> mêlée sûre entre 2 charges
    if (this.isBoss && this.attackPhase !== 'idle') return false // boss en plein pattern (saut-slam) -> pas de morsure en plus, l'AoE fait les dégâts
    if (now < this.nextBiteAt) return false
    let dmg = this.charging ? Math.round(this.damage * (this.def.charge?.dmgMul ?? 1.5)) : this.damage
    if (this.isBoss && !this.charging) dmg = Math.round(dmg * BOSS_BITE_MUL) // contact de boss = soutenable pour la mêlée (le danger = les attaques spéciales)
    if (this.weakenUntil && now < this.weakenUntil) dmg = Math.max(1, Math.round(dmg * (1 - (this.weakenFactor ?? 0.5)))) // AFFAIBLI (Mage ombre)
    if (player.takeDamage(dmg, now)) {
      this.nextBiteAt = now + TOUCH_COOLDOWN
      return true
    }
    return false
  }
}
