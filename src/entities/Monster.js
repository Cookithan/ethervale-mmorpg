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
  mushroom: {
    key: 'mon_mushroom', hp: 90, speed: 22, damage: 24, xp: 36, aggro: 70, scale: 1.5, name: 'Champignon',
    tier: 'rare', loot: { gold: [4, 9] },
  },
  lizard: {
    key: 'mon_lizard', hp: 30, speed: 72, damage: 5, xp: 8, aggro: 130, scale: 0.9, name: 'Lézard',
    tier: 'common', loot: { gold: [1, 3] },
  },
  racoon: {
    key: 'mon_racoon', hp: 55, speed: 46, damage: 8, xp: 16, aggro: 105, scale: 1.1, name: 'Raton',
    tier: 'common', loot: { gold: [2, 5] },
  },

  // --- désert ---
  snake: {
    key: 'mon_snake', hp: 40, speed: 82, damage: 10, xp: 18, aggro: 135, scale: 1.0, name: 'Serpent',
    tier: 'common', loot: { gold: [2, 6] },
  },
  spider: {
    key: 'mon_spider', hp: 60, speed: 56, damage: 12, xp: 22, aggro: 110, scale: 1.1, name: 'Araignée',
    tier: 'rare', loot: { gold: [3, 7] },
  },

  // --- neige ---
  owl: {
    key: 'mon_owl', hp: 55, speed: 70, damage: 14, xp: 26, aggro: 120, scale: 1.0, name: 'Hibou',
    tier: 'rare', loot: { gold: [3, 8] },
  },
  bear: {
    key: 'mon_bear', hp: 130, speed: 30, damage: 22, xp: 42, aggro: 80, scale: 1.5, name: 'Ours',
    tier: 'epic', loot: { gold: [5, 11] },
  },

  // --- terres maudites ---
  skull: {
    key: 'mon_skull', hp: 80, speed: 50, damage: 18, xp: 34, aggro: 115, scale: 1.1, name: 'Crâne',
    tier: 'rare', loot: { gold: [5, 10] },
  },
  spirit: {
    key: 'mon_spirit', hp: 50, speed: 92, damage: 16, xp: 30, aggro: 140, scale: 1.0, name: 'Esprit',
    tier: 'rare', loot: { gold: [4, 9] },
  },
  flam: {
    key: 'mon_flam', hp: 105, speed: 40, damage: 26, xp: 48, aggro: 100, scale: 1.3, name: 'Démon de feu',
    tier: 'epic', loot: { gold: [7, 14] },
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
}

const TOUCH_COOLDOWN = 700 // délai entre 2 morsures au contact (ms)
const LEASH_RANGE = 200 // distance parcourue depuis l'endroit où elle t'a repéré avant d'abandonner (px)
const HOME_RADIUS = 16 // considéré "rentré" sous cette distance de son spawn (px)
const PATROL_RADIUS = 80 // rayon autour duquel un BOSS rôde/garde son repaire avant d'être provoqué (px)
const SPEED_SCALE = 0.62 // ralentit TOUS les monstres (joueur=65) -> kitables en courant
const NAMEPLATE_RANGE = 120 // distance (px) à laquelle on voit le niveau au-dessus du monstre
const LEVEL_STAT_STEP = 0.5 // +50 % des PV/XP de base par niveau -> zones lointaines TRÈS coriaces (brief)
const LEVEL_DMG_STEP = 0.28 // dégâts montent plus DOUCEMENT que les PV (dur mais pas one-shot injuste)
const BOSS_HP_MUL = 8 // PV d'un boss = type × niveau × 8 (gros sac à PV)
const BOSS_DMG_MUL = 1.5 // dégâts du boss (kitable car plus lent que le joueur -> on encaisse rarement)
const BOSS_XP_MUL = 8 // XP massive
const BOSS_SCALE_MUL = 2.2 // taille imposante (uniquement les boss = MONSTRES agrandis, PAS les sprites dédiés)
// BOSS DE RAID (sprites dédiés `rig`) : PV-mur infranchissable en solo + dégâts qui écrasent.
// Contenu verrouillé tant que le multijoueur (Phase 4) n'existe pas : on peut les approcher, pas les vaincre.
const RAID_HP_MUL = 28 // × le PV déjà scalé par niveau (=> dizaines de milliers de PV)
const RAID_DMG_MUL = 3 // chaque coup enlève une énorme part de vie -> facetank = mort

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
    this.isRaid = !!def.raid // boss de raid = intuable solo (PV-mur + dégâts qui écrasent)
    this.eliteName = opts.name ?? null

    // stats mises à l'échelle selon le NIVEAU (+12 %/niv) et le statut ÉLITE/BOSS/RAID
    const lvlMul = 1 + (level - 1) * LEVEL_STAT_STEP // PV/XP : forte montée par niveau
    const dmgLvlMul = 1 + (level - 1) * LEVEL_DMG_STEP // dégâts : montée plus douce
    this.lvlMul = lvlMul
    const hpMul = this.isRaid ? RAID_HP_MUL : boss ? BOSS_HP_MUL : elite ? 2.2 : 1
    const dmgMul = this.isRaid ? RAID_DMG_MUL : boss ? BOSS_DMG_MUL : elite ? 1.6 : 1
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
    const s = (def.scale ?? 1) * (this.rig ? 1 : boss ? BOSS_SCALE_MUL : elite ? 1.4 : 1)
    this.setScale(s)
    this.barOffsetY = Math.round(9 * s + 3) // barre de vie remontée pour les gros

    this.setCollideWorldBounds(true)
    // hitbox : boss à rig = body dédié (en px de texture) ; sinon 11x11 proportionnel au scale.
    if (this.rig && def.body) this.body.setSize(def.body.w, def.body.h, true)
    else this.body.setSize(11, 11, true)
    this.facing = 'down'
    this.rigState = null // état d'anim courant du rig (idle/walk/hit)
    this.rigLockUntil = 0 // pendant l'anim "hit" on ne change pas d'état
    if (this.rig) this.playRig('idle')
    else this.anims.play(`mon-${typeKey}-down`, true)

    // teinte dorée permanente pour les élites "shiny"
    this.baseTint = elite ? 0xffd54a : null
    if (this.baseTint !== null) this.setTint(this.baseTint)

    this.nextBiteAt = 0
    this.repickAt = 0
    this.knockbackUntil = 0 // fenêtre de RECUL : l'IA ne reprend pas la main tant qu'elle dure
    this.aggroed = false // poursuit-il le joueur en ce moment ?
    this.returning = false // rentre-t-il à son spawn après avoir abandonné ? (ignore le joueur)
    this.leashX = x // ancre posée au moment où il repère le joueur (origine du leash)
    this.leashY = y
    this.wander = new Phaser.Math.Vector2(0, 0)
    this.homeX = x
    this.homeY = y

    // barre de vie (cachée tant que le monstre est intact)
    this.hpBarBg = scene.add.rectangle(x, y - this.barOffsetY, 16, 3, 0x000000, 0.6).setDepth(50000).setVisible(false)
    this.hpBarFg = scene.add.rectangle(x, y - this.barOffsetY, 14, 1, elite ? 0xffaa33 : 0xff4444).setOrigin(0, 0.5).setDepth(50001).setVisible(false)
    this.hpHideAt = 0

    // étiquette : ÉLITE -> nom + niveau toujours visibles (or) ; NORMAL -> "Niv.X" qui
    // n'apparaît qu'avec la barre de vie (au combat) pour ne pas surcharger l'écran.
    const labelTxt = elite ? `★ ${this.eliteName} · Niv.${level}` : `Niv.${level}`
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
      const auraW = this.rig ? this.displayWidth * 0.7 : 34 * s
      const auraH = this.rig ? this.displayHeight * 0.22 : 13 * s
      const auraColor = this.isRaid ? 0x2a6bff : 0x8a0f12
      this.auraY = this.rig ? this.displayHeight * 0.36 : 6 // pieds du boss
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

  /** Joue l'anim d'un boss à rig (idle/walk/hit) sans la relancer si déjà en cours. */
  playRig(state) {
    if (this.rigState === state) return
    // certains rigs n'ont pas de "walk" (ex. GiantFlam) -> on retombe sur idle
    const key = `boss-${this.rig}-${state}`
    const finalKey = this.scene.anims.exists(key) ? key : `boss-${this.rig}-idle`
    this.rigState = state
    this.anims.play(finalKey, true)
  }

  /** Inflige des dégâts au monstre ; renvoie true s'il meurt. */
  takeDamage(amount) {
    this.hp -= amount
    this.engage() // frappé = engagé (un boss ne lâchera plus jamais ; un monstre normal contre-attaque)
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(80, () => {
      if (!this.active) return
      this.clearTint()
      if (this.baseTint !== null) this.setTint(this.baseTint) // re-applique l'or des élites
    })
    this.showHpBar()
    // boss à rig : joue l'anim "hit" (verrouille l'état le temps de l'anim) -> réaction visible aux coups
    if (this.rig && this.hp > 0) {
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

  die() {
    this.scene.onMonsterKilled?.(this)
    this.hpBarBg.destroy()
    this.hpBarFg.destroy()
    this.infoText.destroy()
    this.aura?.destroy()
    this.destroy()
  }

  update(time, player) {
    if (!this.active) return
    // FENÊTRE DE RECUL : on laisse la vélocité du knockback agir (légèrement amortie) sans que l'IA
    // ne reprenne le contrôle -> le coup repousse VRAIMENT le monstre, qui se replace ensuite.
    if (time < this.knockbackUntil) {
      this.body.velocity.scale(0.94)
      this.infoText.setPosition(this.x, this.y - this.barOffsetY - 4)
      this.aura?.setPosition(this.x, this.y + (this.auraY ?? 4))
      this.updateHpBar(time)
      return
    }
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

    // la prairie est une zone sûre : un monstre NORMAL qui y pénètre abandonne et rentre.
    // Les BOSS sont implacables (aucune fuite possible) -> ils ignorent la zone sûre.
    if (!this.isBoss && this.scene.biomeAt(Math.floor(this.x / 16), Math.floor(this.y / 16)) === 'prairie') {
      this.aggroed = false
      this.returning = true
    }

    // machine à états (patrouille / poursuite / retour) avec leash.
    // En "retour", la créature ignore le joueur jusqu'à être rentrée : ça évite le
    // ping-pong "rentre / re-poursuit" à la frontière (= l'effet "tourne en rond").
    if (this.returning) {
      if (homeDist <= HOME_RADIUS) this.returning = false // rentré : reprend la patrouille
    } else if (this.aggroed) {
      // BOSS = IMPLACABLE : une fois engagé, il poursuit SANS JAMAIS lâcher (aucune fuite possible).
      // Monstre normal : abandonne après LEASH_RANGE depuis l'endroit où il a repéré le joueur.
      if (!this.isBoss) {
        const leashDist = Math.hypot(this.leashX - this.x, this.leashY - this.y)
        if (leashDist > this.leashRange) {
          this.aggroed = false
          this.returning = true // a lâché le joueur : rentre au spawn
        }
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

    this.updateFacing(aimX, aimY, time)
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

  /** Tente de mordre le joueur au contact. Renvoie true si un coup a porté. */
  tryBite(player, now) {
    if (now < this.nextBiteAt) return false
    if (player.takeDamage(this.damage, now)) {
      this.nextBiteAt = now + TOUCH_COOLDOWN
      return true
    }
    return false
  }
}
