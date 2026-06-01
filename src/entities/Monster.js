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
}

const TOUCH_COOLDOWN = 700 // délai entre 2 morsures au contact (ms)
const LEASH_RANGE = 200 // distance parcourue depuis l'endroit où elle t'a repéré avant d'abandonner (px)
const HOME_RADIUS = 16 // considéré "rentré" sous cette distance de son spawn (px)
const SPEED_SCALE = 0.62 // ralentit TOUS les monstres (joueur=65) -> kitables en courant
const NAMEPLATE_RANGE = 120 // distance (px) à laquelle on voit le niveau au-dessus du monstre
const LEVEL_STAT_STEP = 1 / 3 // +1/3 des stats de base par niveau -> niveau 4 = ×2 d'un niveau 1
const BOSS_HP_MUL = 8 // PV d'un boss = type × niveau × 8 (gros sac à PV)
const BOSS_DMG_MUL = 1.5 // dégâts du boss (kitable car plus lent que le joueur -> on encaisse rarement)
const BOSS_XP_MUL = 8 // XP massive
const BOSS_SCALE_MUL = 2.2 // taille imposante

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
    this.eliteName = opts.name ?? null

    // stats mises à l'échelle selon le NIVEAU (+12 %/niv) et le statut ÉLITE/BOSS
    const lvlMul = 1 + (level - 1) * LEVEL_STAT_STEP // niveau 4 = ×2 d'un niveau 1
    this.lvlMul = lvlMul
    const hpMul = boss ? BOSS_HP_MUL : elite ? 2.2 : 1
    const dmgMul = boss ? BOSS_DMG_MUL : elite ? 1.6 : 1
    const xpMul = boss ? BOSS_XP_MUL : elite ? 3 : 1
    this.maxHp = Math.round(def.hp * lvlMul * hpMul)
    this.hp = this.maxHp
    this.damage = Math.round(def.damage * lvlMul * dmgMul)
    this.xpReward = Math.round(def.xp * lvlMul * xpMul)
    this.displayName = opts.name ?? def.name // nom affiché (boss/élite nommés, sinon type)
    this.aggroRange = boss ? def.aggro + 70 : def.aggro // le boss repère de plus loin
    this.leashRange = boss ? 700 : LEASH_RANGE // ...et lâche beaucoup moins vite

    // taille : boss >> élite > normal. On scale AVANT setSize (la hitbox suit la taille affichée).
    const s = (def.scale ?? 1) * (boss ? BOSS_SCALE_MUL : elite ? 1.4 : 1)
    this.setScale(s)
    this.barOffsetY = Math.round(9 * s + 3) // barre de vie remontée pour les gros

    this.setCollideWorldBounds(true)
    this.body.setSize(11, 11, true) // hitbox proportionnelle au scale, centrée
    this.facing = 'down'
    this.anims.play(`mon-${typeKey}-down`, true)

    // teinte dorée permanente pour les élites "shiny"
    this.baseTint = elite ? 0xffd54a : null
    if (this.baseTint !== null) this.setTint(this.baseTint)

    this.nextBiteAt = 0
    this.repickAt = 0
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
      this.aura = scene.add.ellipse(x, y + 6, 34 * s, 13 * s, 0x8a0f12, 0.32).setDepth(0)
      scene.tweens.add({ targets: this.aura, scaleX: 1.3, scaleY: 1.3, alpha: 0.16, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
      this.hpBarBg.setVisible(false)
      this.hpBarFg.setVisible(false)
      this.infoText.setVisible(false)
    }
  }

  /** Inflige des dégâts au monstre ; renvoie true s'il meurt. */
  takeDamage(amount) {
    this.hp -= amount
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(80, () => {
      if (!this.active) return
      this.clearTint()
      if (this.baseTint !== null) this.setTint(this.baseTint) // re-applique l'or des élites
    })
    this.showHpBar()
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

    // la prairie est une zone sûre : un monstre qui y pénètre abandonne et rentre
    if (this.scene.biomeAt(Math.floor(this.x / 16), Math.floor(this.y / 16)) === 'prairie') {
      this.aggroed = false
      this.returning = true
    }

    // machine à états (patrouille / poursuite / retour) avec leash.
    // En "retour", la créature ignore le joueur jusqu'à être rentrée : ça évite le
    // ping-pong "rentre / re-poursuit" à la frontière (= l'effet "tourne en rond").
    if (this.returning) {
      if (homeDist <= HOME_RADIUS) this.returning = false // rentré : reprend la patrouille
    } else if (this.aggroed) {
      // abandonne après avoir parcouru LEASH_RANGE depuis l'endroit où il a repéré le joueur
      const leashDist = Math.hypot(this.leashX - this.x, this.leashY - this.y)
      if (leashDist > this.leashRange) {
        this.aggroed = false
        this.returning = true // a lâché le joueur : rentre au spawn
      }
    } else if (dist < this.aggroRange) {
      this.aggroed = true
      this.leashX = this.x // pose l'ancre du leash là où il commence à poursuivre
      this.leashY = this.y
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
      // errance normale autour du spawn
      if (time >= this.repickAt) {
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

    this.updateFacing(aimX, aimY)
    if (this.isBoss && this.aura) {
      this.aura.setPosition(this.x, this.y + 4) // l'aura suit le boss
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
  updateFacing(ax, ay) {
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
