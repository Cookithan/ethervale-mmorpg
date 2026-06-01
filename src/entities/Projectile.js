import Phaser from 'phaser'

const SPEED = 240 // vitesse du projectile (px/s)
const LIFESPAN = 900 // durée de vie avant disparition (ms)
const HOMING_STRENGTH = 0.2 // % de correction d'angle vers la cible par frame (0 = tout droit, 1 = lock parfait)

/**
 * Projectile — boule d'énergie tirée par le héros (attaque à distance).
 * Texture générée par code dans BootScene ('proj'). Avance en ligne droite,
 * disparaît au bout de LIFESPAN, en sortant du monde, ou au contact d'un monstre.
 * Réutilisé via un group (classType + recyclage) : on (ré)arme avec fire().
 */
export default class Projectile extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'proj')
    scene.add.existing(this)
    scene.physics.add.existing(this)
    this.body.setCircle(4)
    this.setActive(false).setVisible(false)
    this.dieAt = 0
    this.damage = 0
    this.target = null
  }

  /**
   * Arme et lance le projectile depuis (x,y) vers (tx,ty).
   * Si `target` est fourni (cible verrouillée), la boule la suit jusqu'au contact.
   * `projFx` = {anim, tex, tint} -> sprite ANIMÉ du pack (energyball/fireball) ; sinon boule générée.
   */
  fire(x, y, tx, ty, damage, now, target = null, tint = 0xffffff, projFx = null) {
    this.damage = damage
    this.dieAt = now + LIFESPAN
    this.target = target
    this.enableBody(true, x, y, true, true)
    if (projFx && this.scene.anims.exists(projFx.anim)) {
      this.setTexture(projFx.tex)
      this.play(projFx.anim)
      this.setTint(projFx.tint ? tint : 0xffffff) // teinté par la couleur de magie, ou couleur d'origine
      this.setScale(0.95)
      this.body.setCircle(6, 2, 2)
    } else {
      this.anims.stop()
      this.setTexture('proj')
      this.setTint(tint)
      this.setScale(1)
      this.body.setCircle(4)
    }
    this.setDepth(y + 40)
    const a = Math.atan2(ty - y, tx - x)
    this.setVelocity(Math.cos(a) * SPEED, Math.sin(a) * SPEED)
  }

  /** Désactive le projectile et le remet dans le pool. */
  kill() {
    this.disableBody(true, true)
  }

  update(time) {
    if (!this.active) return
    // cible proche encore vivante : on courbe la boule vers elle (suivi progressif,
    // pas un verrouillage parfait -> une cible rapide/de côté peut être ratée)
    if (this.target) {
      if (this.target.active) {
        const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x)
        const cur = Math.atan2(this.body.velocity.y, this.body.velocity.x)
        const a = cur + Phaser.Math.Angle.Wrap(desired - cur) * HOMING_STRENGTH
        this.setVelocity(Math.cos(a) * SPEED, Math.sin(a) * SPEED)
        this.setRotation(a)
      } else {
        this.target = null // cible morte : la boule continue tout droit
      }
    }
    this.setDepth(this.y + 40)
    if (time >= this.dieAt) this.kill()
  }
}
