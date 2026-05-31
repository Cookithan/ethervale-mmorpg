import Phaser from 'phaser'

/**
 * Définitions des 3 types de monstres (MVP du brief).
 * Sprites 16x16, spritesheet 4x4 (la 1re ligne = frames 0-3 d'animation).
 */
export const MONSTER_TYPES = {
  mushroom: { key: 'mon_mushroom', hp: 90, speed: 22, damage: 12, xp: 25, aggro: 70, scale: 1.5, name: 'Champignon' },
  lizard: { key: 'mon_lizard', hp: 30, speed: 72, damage: 5, xp: 10, aggro: 130, scale: 0.9, name: 'Lézard' },
  racoon: { key: 'mon_racoon', hp: 55, speed: 46, damage: 8, xp: 15, aggro: 105, scale: 1.1, name: 'Raton' },
}

const TOUCH_COOLDOWN = 700 // délai entre 2 morsures au contact (ms)
const LEASH_RANGE = 200 // distance parcourue depuis l'endroit où elle t'a repéré avant d'abandonner (px)
const HOME_RADIUS = 16 // considéré "rentré" sous cette distance de son spawn (px)

/**
 * Monster — IA simple : patrouille aléatoire, puis poursuite si le joueur entre
 * dans son rayon d'aggro. Inflige des dégâts au contact, meurt à 0 PV (drop + XP).
 */
export default class Monster extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, typeKey) {
    const def = MONSTER_TYPES[typeKey]
    super(scene, x, y, def.key, 0)
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.typeKey = typeKey
    this.def = def
    this.hp = def.hp
    this.maxHp = def.hp

    // taille selon le type (tank plus gros, rapide plus petit) : on scale AVANT
    // setSize pour que la hitbox physique suive la taille affichée.
    const s = def.scale ?? 1
    this.setScale(s)
    this.barOffsetY = Math.round(9 * s + 3) // barre de vie remontée pour les gros

    this.setCollideWorldBounds(true)
    this.body.setSize(11, 11, true) // hitbox proportionnelle au scale, centrée
    this.facing = 'down'
    this.anims.play(`mon-${typeKey}-down`, true)

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
    this.hpBarFg = scene.add.rectangle(x, y - this.barOffsetY, 14, 1, 0xff4444).setOrigin(0, 0.5).setDepth(50001).setVisible(false)
    this.hpHideAt = 0
  }

  /** Inflige des dégâts au monstre ; renvoie true s'il meurt. */
  takeDamage(amount) {
    this.hp -= amount
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(80, () => this.active && this.clearTint())
    this.showHpBar()
    if (this.hp <= 0) {
      this.die()
      return true
    }
    return false
  }

  showHpBar() {
    this.hpBarBg.setVisible(true)
    this.hpBarFg.setVisible(true)
    this.hpHideAt = this.scene.time.now + 2500 // se cache 2,5 s après le dernier coup
  }

  die() {
    this.scene.onMonsterKilled?.(this)
    this.hpBarBg.destroy()
    this.hpBarFg.destroy()
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
    let aimX
    let aimY

    // machine à états (patrouille / poursuite / retour) avec leash.
    // En "retour", la créature ignore le joueur jusqu'à être rentrée : ça évite le
    // ping-pong "rentre / re-poursuit" à la frontière (= l'effet "tourne en rond").
    if (this.returning) {
      if (homeDist <= HOME_RADIUS) this.returning = false // rentré : reprend la patrouille
    } else if (this.aggroed) {
      // abandonne après avoir parcouru LEASH_RANGE depuis l'endroit où il a repéré le joueur
      const leashDist = Math.hypot(this.leashX - this.x, this.leashY - this.y)
      if (leashDist > LEASH_RANGE) {
        this.aggroed = false
        this.returning = true // a lâché le joueur : rentre au spawn
      }
    } else if (dist < def.aggro) {
      this.aggroed = true
      this.leashX = this.x // pose l'ancre du leash là où il commence à poursuivre
      this.leashY = this.y
    }

    if (this.aggroed) {
      // poursuite du joueur
      const d = dist || 1
      this.setVelocity((dx / d) * def.speed, (dy / d) * def.speed)
      aimX = dx
      aimY = dy
    } else if (this.returning) {
      // a abandonné : retourne à son point de départ
      const hx = this.homeX - this.x
      const hy = this.homeY - this.y
      const d = homeDist || 1
      this.setVelocity((hx / d) * def.speed, (hy / d) * def.speed)
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
      this.setVelocity(this.wander.x * def.speed * 0.5, this.wander.y * def.speed * 0.5)
      aimX = this.wander.x
      aimY = this.wander.y
    }

    this.updateFacing(aimX, aimY)
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
    if (player.takeDamage(this.def.damage, now)) {
      this.nextBiteAt = now + TOUCH_COOLDOWN
      return true
    }
    return false
  }
}
