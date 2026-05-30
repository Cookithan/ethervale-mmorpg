import Phaser from 'phaser'

const SPEED = 65 // vitesse de déplacement (px/s, avant zoom caméra)

/**
 * Player — héros contrôlé au clavier.
 * Touches : flèches + WASD (QWERTY) + ZQSD (AZERTY). Déplacement 4/8 directions,
 * animation selon la direction, normalisation des diagonales.
 */
export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'player', 1)
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.setCollideWorldBounds(true)
    // hitbox plus petite que la tuile 16x16 (pieds du perso) — utile pour l'Étape 3
    this.body.setSize(10, 8).setOffset(3, 7)

    this.facing = 'down'
    this.anims.play('idle-down')

    this.cursors = scene.input.keyboard.createCursorKeys()
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,Z,Q')
  }

  update() {
    const c = this.cursors
    const k = this.keys

    const left = c.left.isDown || k.A.isDown || k.Q.isDown
    const right = c.right.isDown || k.D.isDown
    const up = c.up.isDown || k.W.isDown || k.Z.isDown
    const down = c.down.isDown || k.S.isDown

    let vx = (right ? 1 : 0) - (left ? 1 : 0)
    let vy = (down ? 1 : 0) - (up ? 1 : 0)

    // normaliser pour que la diagonale n'aille pas plus vite
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2
      vx *= inv
      vy *= inv
    }
    this.setVelocity(vx * SPEED, vy * SPEED)

    // direction regardée (priorité au mouvement horizontal pour l'anim)
    if (vx < 0) this.facing = 'left'
    else if (vx > 0) this.facing = 'right'
    else if (vy < 0) this.facing = 'up'
    else if (vy > 0) this.facing = 'down'

    const moving = vx !== 0 || vy !== 0
    this.anims.play((moving ? 'walk-' : 'idle-') + this.facing, true)
  }
}
