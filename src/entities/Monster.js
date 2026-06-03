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
    key: 'mon_mushroom', hp: 90, speed: 22, damage: 24, xp: 36, aggro: 70, scale: 1.5, name: 'Champignon',
    tier: 'rare', loot: { gold: [4, 9], mat: 'mat_essence', matChance: 0.5, gear: 0.14 },
  },
  lizard: {
    key: 'mon_lizard', hp: 30, speed: 72, damage: 5, xp: 8, aggro: 130, scale: 0.9, name: 'Lézard',
    tier: 'common', loot: { gold: [1, 3], mat: 'mat_leather', matChance: 0.45, gear: 0.1 },
  },
  racoon: {
    key: 'mon_racoon', hp: 55, speed: 46, damage: 8, xp: 16, aggro: 105, scale: 1.1, name: 'Raton',
    tier: 'common', loot: { gold: [2, 5], mat: 'mat_leather', matChance: 0.45, gear: 0.12 },
  },

  // --- désert ---
  snake: {
    key: 'mon_snake', hp: 40, speed: 82, damage: 10, xp: 18, aggro: 135, scale: 1.0, name: 'Serpent',
    tier: 'common', loot: { gold: [2, 6], mat: 'mat_leather', matChance: 0.45, gear: 0.12 },
  },
  spider: {
    key: 'mon_spider', hp: 60, speed: 56, damage: 12, xp: 22, aggro: 110, scale: 1.1, name: 'Araignée',
    tier: 'rare', loot: { gold: [3, 7], mat: 'mat_essence', matChance: 0.5, gear: 0.16 },
  },

  // --- neige ---
  owl: {
    key: 'mon_owl', hp: 55, speed: 70, damage: 14, xp: 26, aggro: 120, scale: 1.0, name: 'Hibou',
    tier: 'rare', loot: { gold: [3, 8], mat: 'mat_essence', matChance: 0.5, gear: 0.16 },
  },
  bear: {
    key: 'mon_bear', hp: 130, speed: 30, damage: 22, xp: 42, aggro: 80, scale: 1.5, name: 'Ours',
    tier: 'epic', loot: { gold: [5, 11], mat: 'mat_leather', matChance: 0.55, gear: 0.2 },
  },

  // --- terres maudites ---
  skull: {
    key: 'mon_skull', hp: 80, speed: 50, damage: 18, xp: 34, aggro: 115, scale: 1.1, name: 'Crâne',
    tier: 'rare', loot: { gold: [5, 10], mat: 'mat_bone', matChance: 0.5, gear: 0.18 },
  },
  spirit: {
    key: 'mon_spirit', hp: 50, speed: 92, damage: 16, xp: 30, aggro: 140, scale: 1.0, name: 'Esprit',
    tier: 'rare', loot: { gold: [4, 9], mat: 'mat_bone', matChance: 0.5, gear: 0.18 },
  },
  flam: {
    key: 'mon_flam', hp: 105, speed: 40, damage: 26, xp: 48, aggro: 100, scale: 1.3, name: 'Démon de feu',
    tier: 'epic', loot: { gold: [7, 14], mat: 'mat_crystal', matChance: 0.5, gear: 0.22 },
  },

  // --- BOSS DE RAID (intuables en solo, contenu verrouillé / multijoueur Phase 4) ---
  // rig = sprites dédiés (mono-orientation, anims idle/walk/hit) ; raid = PV-mur + dégâts qui écrasent.
  // key = texture initiale (idle) ; body = hitbox en px de texture (scalée ensuite par `scale`).
  tengublue: {
    key: 'boss_tengublue_idle', rig: 'tengublue', raid: true, face: 'face_tengublue',
    hp: 220, speed: 34, damage: 18, xp: 0, aggro: 95, scale: 1.7, body: { w: 26, h: 32 },
    tier: 'epic', loot: { gold: [0, 0] }, name: 'Tengu des Glaces',
  },
  samurai: {
    key: 'boss_samurai_idle', rig: 'samurai', raid: true, face: 'face_samurai',
    hp: 260, speed: 30, damage: 20, xp: 0, aggro: 90, scale: 1.5, body: { w: 40, h: 28 },
    tier: 'epic', loot: { gold: [0, 0] }, name: 'Samouraï Sylvestre',
    // CHARGE TÉLÉGRAPHIÉE : zone au sol pendant `windup` ms (anim charge), puis dash à `speed` px/s
    // pendant `duration` ms le long de l'angle verrouillé ; touche dans `hitRadius` px de l'axe (×`dmgMul`).
    // Esquive : se décaler hors de l'axe pendant le windup (long + bande étroite -> dodge confortable).
    charge: { range: 300, windup: 850, speed: 430, duration: 400, dmgMul: 1.7, cooldown: 2600, hitRadius: 28, color: 0x4aa3ff, chargeOriginY: 0.75 },
  },

  // --- BOSS SOLO à sprite dédié (rig, mais PAS raid -> tuable seul) ---
  democyclop: {
    key: 'boss_democyclop_idle', rig: 'democyclop', face: 'face_democyclop',
    hp: 70, speed: 28, damage: 15, xp: 32, aggro: 110, scale: 2.2, body: { w: 26, h: 34 },
    tier: 'epic', loot: { gold: [6, 12] }, name: 'Cyclope démon',
  },
  // Seigneur de flamme (Terres Maudites) : rig SANS walk (reste sur place, lent) -> playRig retombe sur idle
  giantflam: {
    key: 'boss_giantflam_idle', rig: 'giantflam', face: 'face_giantflam',
    hp: 90, speed: 18, damage: 22, xp: 40, aggro: 120, scale: 2.2, body: { w: 24, h: 34 },
    tier: 'epic', loot: { gold: [8, 16] }, name: 'Seigneur de flamme',
  },

  democyclop2: {
    key: 'boss_democyclop2_idle', rig: 'democyclop2', face: 'face_democyclop2',
    hp: 85, speed: 26, damage: 17, xp: 36, aggro: 115, scale: 2.2, body: { w: 26, h: 34 },
    tier: 'epic', loot: { gold: [7, 14] }, name: 'Cyclope ancien',
  },
  giantbamboo: {
    key: 'boss_giantbamboo_idle', rig: 'giantbamboo', face: 'face_giantbamboo',
    hp: 80, speed: 24, damage: 16, xp: 34, aggro: 110, scale: 1.8, body: { w: 28, h: 40 },
    tier: 'epic', loot: { gold: [6, 13] }, name: 'Colosse de bambou',
  },
  giantslime: {
    key: 'boss_giantslime_idle', rig: 'giantslime', face: 'face_giantslime',
    hp: 78, speed: 22, damage: 15, xp: 34, aggro: 105, scale: 1.8, body: { w: 34, h: 26 },
    tier: 'epic', loot: { gold: [6, 13] }, name: 'Gelée polaire',
  },
  giantspirit: {
    key: 'boss_giantspirit_idle', rig: 'giantspirit', face: 'face_giantspirit',
    hp: 82, speed: 30, damage: 18, xp: 38, aggro: 120, scale: 2.0, body: { w: 22, h: 30 },
    tier: 'epic', loot: { gold: [8, 15] }, name: 'Âme damnée',
  },
  redsamurai: {
    key: 'boss_redsamurai_idle', rig: 'redsamurai', face: 'face_redsamurai',
    hp: 88, speed: 32, damage: 19, xp: 38, aggro: 95, scale: 1.5, body: { w: 40, h: 28 },
    tier: 'epic', loot: { gold: [8, 15] }, name: 'Samouraï Rouge',
    charge: { range: 300, windup: 1000, speed: 430, duration: 400, dmgMul: 1.7, cooldown: 2800, hitRadius: 28, color: 0xff3030, chargeOriginY: 0.75 },
  },
  tengured: {
    key: 'boss_tengured_idle', rig: 'tengured', face: 'face_tengured',
    hp: 84, speed: 36, damage: 18, xp: 38, aggro: 95, scale: 1.7, body: { w: 26, h: 32 },
    tier: 'epic', loot: { gold: [8, 15] }, name: 'Tengu Rouge',
  },
  giantslime2: {
    key: 'boss_giantslime2_idle', rig: 'giantslime2', face: 'face_giantslime2',
    hp: 80, speed: 22, damage: 16, xp: 36, aggro: 105, scale: 1.9, body: { w: 34, h: 26 },
    tier: 'epic', loot: { gold: [7, 14] }, name: 'Gelée ancienne',
  },

  // --- BOSS CÔTIER À DISTANCE (tire des orbes que le joueur ESQUIVE ; mêlée faible -> garde tes distances ou approche) ---
  // ranged = il télégraphe (anim shoot) puis lance un projectile vers le joueur. Lent et peu mobile : il garde son rivage.
  squidred: {
    key: 'boss_squidred_idle', rig: 'squidred', face: 'face_squidred',
    hp: 96, speed: 18, damage: 12, xp: 42, aggro: 240, scale: 1.5, body: { w: 30, h: 30 },
    ranged: true, shootRange: 230, shootCd: 1700, projSpeed: 155, projDamage: 16,
    solid: true, // gros corps : le joueur ne le traverse pas (collision, en plus de l'overlap de morsure)
    tier: 'epic', loot: { gold: [9, 17] }, name: 'Kraken',
  },

  giantfrog: {
    key: 'boss_giantfrog_idle', rig: 'giantfrog', face: 'face_giantfrog',
    hp: 76, speed: 30, damage: 16, xp: 34, aggro: 110, scale: 2.0, body: { w: 26, h: 22 },
    tier: 'epic', loot: { gold: [6, 13] }, name: 'Crapaud colossal',
    charge: { range: 280, windup: 950, speed: 420, duration: 380, dmgMul: 1.6, cooldown: 2900, hitRadius: 24, color: 0x7bd86a },
  },
  giantracoon: {
    key: 'boss_giantracoon_idle', rig: 'giantracoon', face: 'face_giantracoon',
    hp: 82, speed: 34, damage: 17, xp: 36, aggro: 100, scale: 1.7, body: { w: 30, h: 30 },
    tier: 'epic', loot: { gold: [7, 14] }, name: 'Raton géant',
    charge: { range: 280, windup: 900, speed: 460, duration: 360, dmgMul: 1.5, cooldown: 2700, hitRadius: 24, color: 0xe0a24a },
  },
  giantbamboo2: {
    key: 'boss_giantbamboo2_idle', rig: 'giantbamboo2', face: 'face_giantbamboo2',
    hp: 86, speed: 24, damage: 17, xp: 36, aggro: 110, scale: 1.8, body: { w: 28, h: 40 },
    tier: 'epic', loot: { gold: [7, 15] }, name: 'Colosse de bambou ancien',
  },

  // --- BOSS DE RAID SEGMENTÉ (tête + chaîne de corps qui ondule) ---
  dragonblue: {
    key: 'boss_dragon_head', dragon: true, raid: true, face: 'face_dragon',
    hp: 240, speed: 78, damage: 20, xp: 0, aggro: 100, scale: 1.3, body: { w: 20, h: 20 },
    tier: 'epic', loot: { gold: [0, 0] }, name: 'Dragon des Abysses',
  },
}

const TOUCH_COOLDOWN = 700 // délai entre 2 morsures au contact (ms)
const LEASH_RANGE = 200 // distance parcourue depuis l'endroit où elle t'a repéré avant d'abandonner (px)
const HOME_RADIUS = 16 // considéré "rentré" sous cette distance de son spawn (px)
const PATROL_RADIUS = 80 // rayon autour duquel un BOSS rôde/garde son repaire avant d'être provoqué (px)
const BOSS_GUARD_LEASH = 220 // tant que le combat n'a PAS commencé, le boss ne poursuit pas au-delà (revient au repaire)
const BOSS_WAKE_DELAY = 1000 // au réveil (1re attaque reçue), le boss patiente avant de mordre/charger -> laisse le temps de réagir
const SPEED_SCALE = 0.62 // ralentit TOUS les monstres (joueur=65) -> kitables en courant
const NAMEPLATE_RANGE = 120 // distance (px) à laquelle on voit le niveau au-dessus du monstre
// (le scaling de niveau est désormais exponentiel ×1.5/niv, calculé directement dans le constructeur)
const BOSS_HP_MUL = 8 // PV d'un boss = type × niveau × 8 (gros sac à PV)
const BOSS_DMG_MUL = 1.5 // dégâts du boss (kitable car plus lent que le joueur -> on encaisse rarement)
const BOSS_XP_MUL = 8 // XP massive
const BOSS_SCALE_MUL = 2.2 // taille imposante (uniquement les boss = MONSTRES agrandis, PAS les sprites dédiés)
// BOSS DE RAID (sprites dédiés `rig`) : PV-mur infranchissable en solo + dégâts qui écrasent.
// Contenu verrouillé tant que le multijoueur (Phase 4) n'existe pas : on peut les approcher, pas les vaincre.
const RAID_HP_MUL = 28 // × le PV déjà scalé par niveau (=> dizaines de milliers de PV)
const RAID_DMG_MUL = 3 // chaque coup enlève une énorme part de vie -> facetank = mort

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

    // NIVEAU DE SCALING (≠ niveau AFFICHÉ) : ×1.5 PV ET dégâts par niveau (exponentiel).
    // - mob normal : son niveau de zone (1-5) ; niv4 = 1.5× le niv3.
    // - ÉLITE : valeurs d'un niveau 7 (mais affiché 5).
    // - BOSS : niveau passé tel quel (élevé -> PV "comme avant", pas un mob).
    const scaleLevel = elite ? 7 : level
    const lvlMul = Math.pow(1.5, scaleLevel - 1) // PV/XP
    const dmgLvlMul = Math.pow(1.5, scaleLevel - 1) // dégâts (même facteur que les PV)
    this.lvlMul = lvlMul
    // niveau AFFICHÉ plafonné à 5 (élite niv7 -> "Niv.5", boss niv7 -> "Niv.5")
    this.displayLevel = Math.min(scaleLevel, 5)
    // élite : le boost vient déjà du niveau 7 -> pas de multiplicateur HP/dmg en plus (sinon ×2 de trop)
    const hpMul = this.isRaid ? RAID_HP_MUL : boss ? BOSS_HP_MUL : 1
    const dmgMul = this.isRaid ? RAID_DMG_MUL : boss ? BOSS_DMG_MUL : 1
    const xpMul = boss ? BOSS_XP_MUL : elite ? 3 : 1
    this.maxHp = Math.round(def.hp * lvlMul * hpMul)
    this.hp = this.maxHp
    this.damage = Math.round(def.damage * dmgLvlMul * dmgMul)
    this.xpReward = Math.round(def.xp * lvlMul * xpMul)
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
    this.attackPhase = 'idle' // charge télégraphiée : idle | telegraph | dash | recover
    this.attackUntil = 0 // fin de la phase d'attaque courante
    this.nextAttackAt = 0 // cooldown avant la prochaine charge
    this.attackAngle = 0 // direction verrouillée de la charge (posée au début du télégraphe)
    this.charging = false // en plein dash (dégâts majorés au contact)
    this.chargeHitDone = false // un seul gros coup par dash
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

  /** Engage le combat (poursuite). Pour un BOSS, c'est définitif (aucune fuite possible). */
  engage() {
    if (this.aggroed) return
    this.aggroed = true
    this.returning = false
    this.leashX = this.x // ancre du leash (ignorée par les boss)
    this.leashY = this.y
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
      this.anims.play(`boss-${this.rig}-charge`, true)
      if (Math.abs(dx) > 0.3) this.setFlipX(dx < 0)
      this.scene.bossChargeTelegraph?.(this, this.attackAngle, cfg) // zone de danger au sol
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
    this.engage() // frappé = engagé (un boss ne lâchera plus jamais ; un monstre normal contre-attaque)
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

    const def = this.def
    const dx = player.x - this.x
    const dy = player.y - this.y
    const dist = Math.hypot(dx, dy)

    // direction visée : où il VEUT aller (vers le joueur en poursuite, sinon errance).
    // On l'utilise pour l'anim plutôt que la vitesse physique, qui rebondit quand
    // le monstre est collé au joueur (-> oscillation gauche/droite sans fin).
    const homeDist = Math.hypot(this.homeX - this.x, this.homeY - this.y)
    const spd = def.speed * SPEED_SCALE
    let aimX
    let aimY

    // CHARGE TÉLÉGRAPHIÉE (boss avec def.charge, une fois réveillé) : si une attaque est en cours, elle
    // pilote la vélocité/anim -> on saute la nav + le facing normaux pour cette frame.
    if (this.combatEngaged && def.charge && this.updateBossCharge(time, player, dx, dy, dist)) {
      if (this.isBoss && this.aura) { this.aura.setPosition(this.x, this.y + (this.auraY ?? 4)); this.aura.setDepth(this.y - 1) }
      this.infoText.setPosition(this.x, this.y - this.barOffsetY - 4)
      this.updateHpBar(time)
      return
    }

    // biome courant du monstre (sert à la zone sûre prairie ET au verrou de biome ci-dessous)
    const curBiome = this.scene.biomeAt(Math.floor(this.x / 16), Math.floor(this.y / 16))
    // la prairie est une zone sûre : un monstre NORMAL qui y pénètre abandonne et rentre.
    // Les BOSS sont implacables (aucune fuite possible) -> ils ignorent la zone sûre.
    if (!this.isBoss && curBiome === 'prairie') {
      this.aggroed = false
      this.returning = true
    }

    // machine à états (patrouille / poursuite / retour) avec leash.
    // En "retour", la créature ignore le joueur jusqu'à être rentrée : ça évite le
    // ping-pong "rentre / re-poursuit" à la frontière (= l'effet "tourne en rond").
    if (this.returning) {
      if (homeDist <= HOME_RADIUS) this.returning = false // rentré : reprend la patrouille
    } else if (this.aggroed) {
      // Monstre normal : abandonne après LEASH_RANGE, OU dès qu'il QUITTE son biome d'origine.
      if (!this.isBoss) {
        const leashDist = Math.hypot(this.leashX - this.x, this.leashY - this.y)
        if (leashDist > this.leashRange || curBiome !== this.homeBiome) {
          this.aggroed = false
          this.returning = true // a lâché le joueur : rentre au spawn
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

    if (this.aggroed) {
      // poursuite du joueur
      const d = dist || 1
      this.setVelocity((dx / d) * spd, (dy / d) * spd)
      aimX = dx
      aimY = dy
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

  /** Tente de mordre le joueur au contact. Renvoie true si un coup a porté. Pendant une charge (dash),
   *  les dégâts sont majorés (×dmgMul). */
  tryBite(player, now) {
    if (this.isBoss && !this.combatEngaged) return false // boss endormi : ne mord pas tant qu'on ne l'a pas réveillé
    if (this.def.charge) return false // boss à CHARGE : ne blesse QUE par son dash (test de distance) -> mêlée sûre entre 2 charges
    if (now < this.nextBiteAt) return false
    const dmg = this.charging ? Math.round(this.damage * (this.def.charge?.dmgMul ?? 1.5)) : this.damage
    if (player.takeDamage(dmg, now)) {
      this.nextBiteAt = now + TOUCH_COOLDOWN
      return true
    }
    return false
  }
}
