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
  fire(x, y, tx, ty, damage, now, target = null, tint = 0xffffff, projFx = null, speed = SPEED) {
    this.damage = damage
    this.dieAt = now + LIFESPAN
    this.target = target
    this.speed = speed
    this.enableBody(true, x, y, true, true)
    const a = Math.atan2(ty - y, tx - x)
    if (projFx) {
      this.setTexture(projFx.tex)
      if (projFx.anim && this.scene.anims.exists(projFx.anim)) {
        this.play(projFx.anim) // boule/shuriken animé (qui tourne)
        this.setRotation(0)
      } else {
        this.anims.stop()
        this.setRotation(a) // sprite STATIQUE (couteau/flèche) -> pointe dans la direction de tir
      }
      this.setTint(projFx.tint ? tint : 0xffffff) // teinté par la couleur de magie, ou couleur d'origine
      this.setScale(projFx.scale ?? 0.95)
      this.body.setCircle(6, 2, 2)
    } else {
      this.anims.stop()
      this.setTexture('proj')
      this.setTint(tint)
      this.setScale(1)
      this.body.setCircle(4)
      this.setRotation(a)
    }
    this.setDepth(y + 40)
    this.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed)
  }

  /** Désactive le projectile et le remet dans le pool. */
  kill() {
    this.disableBody(true, true)
  }

  update(time) {
    if (!this.active) return
    // projectile ENNEMI : meurt au-dessus de l'eau (ne franchit pas rivières/océan -> pas de tir à travers l'eau)
    if (this.dieOnWater && this.scene.isOnWater?.(this.x, this.y)) { this.kill(); return }
    // cible proche encore vivante : on courbe la boule vers elle (suivi progressif,
    // pas un verrouillage parfait -> une cible rapide/de côté peut être ratée)
    if (this.target) {
      if (!this.target.active) {
        this.target = null // cible morte : la boule continue tout droit
      } else if (!this.target.charging) {
        // un boss en DASH (charging) n'est PLUS suivi -> la boule garde son cap et le rate s'il esquive
        const dx = this.target.x - this.x
        const dy = this.target.y - this.y
        // à BOUT PORTANT on ne corrige plus : la boule file tout droit et TRAVERSE (au lieu d'orbiter
        // autour d'un boss qu'elle ne peut pas toucher, ex. en l'air). Elle meurt à LIFESPAN.
        if (dx * dx + dy * dy > 18 * 18) {
          const desired = Math.atan2(dy, dx)
          const cur = Math.atan2(this.body.velocity.y, this.body.velocity.x)
          const a = cur + Phaser.Math.Angle.Wrap(desired - cur) * HOMING_STRENGTH
          this.setVelocity(Math.cos(a) * SPEED, Math.sin(a) * SPEED)
          this.setRotation(a)
        }
      }
    }
    this.setDepth(this.y + 40)
    if (time >= this.dieAt) this.kill()
  }
}
