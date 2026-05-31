import Phaser from 'phaser'

const SPEED = 65 // vitesse de déplacement (px/s)
const ATTACK_MS = 320 // durée de l'animation d'attaque (déplacement bloqué)
const ATTACK_COOLDOWN = 380 // délai mini entre deux attaques
const HURT_IFRAMES = 600 // invulnérabilité après avoir été touché (ms)
const SHOOT_COOLDOWN = 450 // délai mini entre deux tirs à distance (ms)

/**
 * Player — héros contrôlé au clavier (ZQSD/WASD/flèches) ET au clic (click-to-move).
 * Gère aussi : attaque épée (espace), PV, XP/niveau, dégâts reçus avec i-frames.
 */
export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player', 0)
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)
    this.body.setSize(10, 8).setOffset(3, 7)

    this.facing = 'down'
    this.anims.play('idle-down')

    // état combat / progression
    this.level = 1
    this.maxHp = 100
    this.hp = 100
    this.attackPower = 12
    this.xp = 0
    this.xpToNext = 50
    this.gold = 0

    this.attacking = false
    this.attackUntil = 0
    this.nextAttackAt = 0
    this.invulnUntil = 0
    this.nextShootAt = 0 // cooldown du tir à distance

    this.moveTarget = null // {x, y} pour le click-to-move

    this.cursors = scene.input.keyboard.createCursorKeys()
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,Z,Q')
  }

  /** Déplace le perso vers un point du monde (annulé dès qu'on utilise le clavier). */
  moveTo(x, y) {
    if (this.attacking) return
    this.moveTarget = { x, y }
  }

  /** Lance une attaque si pas en cooldown. Renvoie true si l'attaque démarre. */
  startAttack(now) {
    if (this.attacking || now < this.nextAttackAt) return false
    this.attacking = true
    this.attackUntil = now + ATTACK_MS
    this.nextAttackAt = now + ATTACK_COOLDOWN
    this.moveTarget = null
    this.setVelocity(0, 0)
    this.anims.play('attack-' + this.facing, true)
    return true
  }

  /** Autorise un tir si le cooldown est passé et arme le prochain. Renvoie true si OK. */
  startShoot(now) {
    if (now < this.nextShootAt) return false
    this.nextShootAt = now + SHOOT_COOLDOWN
    return true
  }

  /** Inflige des dégâts au héros (respecte les i-frames). Renvoie true si touché. */
  takeDamage(amount, now) {
    if (now < this.invulnUntil || this.hp <= 0) return false
    this.hp = Math.max(0, this.hp - amount)
    this.invulnUntil = now + HURT_IFRAMES
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(90, () => this.clearTint())
    return true
  }

  /** Soigne le héros (plafonné aux PV max). Renvoie les PV réellement rendus. */
  heal(amount) {
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + amount)
    return this.hp - before
  }

  /** Ajoute de l'XP, gère le(s) passage(s) de niveau (cap 10). */
  gainXp(amount) {
    if (this.level >= 10) return
    this.xp += amount
    while (this.xp >= this.xpToNext && this.level < 10) {
      this.xp -= this.xpToNext
      this.level++
      this.maxHp += 20
      this.hp = this.maxHp // soin complet au level up
      this.attackPower += 4
      this.xpToNext = Math.round(this.xpToNext * 1.4)
      this.scene.onLevelUp?.()
    }
    if (this.level >= 10) this.xp = 0
  }

  update(time) {
    // fin de l'attaque
    if (this.attacking && time >= this.attackUntil) this.attacking = false
    if (this.attacking) return // déplacement bloqué pendant l'attaque

    const c = this.cursors
    const k = this.keys
    const left = c.left.isDown || k.A.isDown || k.Q.isDown
    const right = c.right.isDown || k.D.isDown
    const up = c.up.isDown || k.W.isDown || k.Z.isDown
    const down = c.down.isDown || k.S.isDown
    const usingKeyboard = left || right || up || down

    let vx = 0
    let vy = 0

    if (usingKeyboard) {
      this.moveTarget = null // le clavier annule le click-to-move
      vx = (right ? 1 : 0) - (left ? 1 : 0)
      vy = (down ? 1 : 0) - (up ? 1 : 0)
      if (vx !== 0 && vy !== 0) {
        const inv = 1 / Math.SQRT2
        vx *= inv
        vy *= inv
      }
    } else if (this.moveTarget) {
      const dx = this.moveTarget.x - this.x
      const dy = this.moveTarget.y - this.y
      const d = Math.hypot(dx, dy)
      if (d < 3) {
        this.moveTarget = null
      } else {
        vx = dx / d
        vy = dy / d
      }
    }

    this.setVelocity(vx * SPEED, vy * SPEED)

    if (vx < 0) this.facing = 'left'
    else if (vx > 0) this.facing = 'right'
    else if (vy < 0) this.facing = 'up'
    else if (vy > 0) this.facing = 'down'

    const moving = vx !== 0 || vy !== 0
    this.anims.play((moving ? 'walk-' : 'idle-') + this.facing, true)
  }
}
