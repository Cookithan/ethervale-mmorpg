import Phaser from 'phaser'
import { RARITY } from '../data/items.js'

// table des types ramassables : texture + libellé du texte flottant + couleur
export const DROP_TYPES = {
  gold: { texture: 'drop_gold', color: '#ffe066' },
  heart: { texture: 'drop_heart', color: '#ff8088' },
  gem: { texture: 'drop_gem', color: '#9beaf5' },
  equip: { texture: null, color: '#9be1ff' }, // texture = icône de l'objet (passée au constructeur)
}

const LIFESPAN = 15000 // disparaît au bout de 15 s s'il n'est pas ramassé
const BLINK_AT = 12000 // commence à clignoter 3 s avant

/**
 * Drop — objet lâché par un monstre, ramassable au contact du joueur.
 * `type` ∈ {gold, heart, gem}, `amount` = valeur (or / PV soignés / XP).
 * Apparition en "pop", léger flottement, puis disparition si non ramassé.
 */
export default class Drop extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type, amount, item = null, pickupDelay = 0) {
    const def = DROP_TYPES[type]
    // pour un équipement, la texture est l'icône de l'objet
    super(scene, x, y, item ? item.icon : def.texture)
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.type = type
    this.amount = amount
    this.item = item // objet d'équipement (si type 'equip'), sinon null
    // instant avant lequel l'objet n'est PAS ramassable (objet qu'on vient de lâcher : on évite
    // qu'il soit ré-aspiré aussitôt alors qu'on est encore dessus). 0 = ramassable tout de suite.
    this.pickableAt = pickupDelay ? scene.time.now + pickupDelay : 0
    this.def = def
    this.collected = false
    this.setDepth(y)
    if (type === 'gold') this.play('coin-spin') // pièce animée

    // les sprites du pack font 6 à 24px : on normalise la taille affichée
    const target = type === 'equip' ? 18 : 14
    const baseScale = target / Math.max(this.width, this.height)
    this.body.setSize(12, 12, true) // hitbox de ramassage généreuse, centrée

    // halo coloré selon la RARETÉ (seulement pour les équipements) : lecture immédiate de la
    // valeur d'un objet au sol. Plus la rareté est haute, plus le halo est large/vif (légendaire = doré).
    const RANK = { common: 0, rare: 1, epic: 2, legendary: 3 }
    if (item && item.rarity && RARITY[item.rarity]) {
      const rank = RANK[item.rarity] ?? 0
      const tint = RARITY[item.rarity].tint
      const radius = 9 + rank * 3 // 9..18 px selon la rareté
      this.glow = scene.add
        .ellipse(x, y + 2, radius * 2, radius * 1.25, tint, 0.18 + rank * 0.1)
        .setDepth(y - 1)
        .setBlendMode(Phaser.BlendModes.ADD)
      // pulsation douce (plus marquée sur les hautes raretés)
      this.glowPulse = scene.tweens.add({
        targets: this.glow,
        scale: 1.18 + rank * 0.06,
        alpha: { from: this.glow.alpha, to: Math.min(0.85, this.glow.alpha + 0.18) },
        duration: 700 - rank * 60,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      })
    }

    // pop à l'apparition + flottement vertical doux
    this.setScale(0)
    scene.tweens.add({ targets: this, scale: baseScale, duration: 200, ease: 'Back.out' })
    // le drop ET son halo flottent ensemble (le halo reste 2px plus bas, posé au sol)
    this.bob = scene.tweens.add({
      targets: this.glow ? [this, this.glow] : this,
      y: '-=3',
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })

    // durée de vie limitée (anti-encombrement) : clignote puis disparaît
    this.blink = scene.time.delayedCall(BLINK_AT, () => {
      this.blinkTween = scene.tweens.add({ targets: this, alpha: 0.2, duration: 200, yoyo: true, repeat: -1 })
    })
    this.expire = scene.time.delayedCall(LIFESPAN, () => this.collect())
  }

  /** Ramassé (ou expiré) : stoppe les tweens/timers et se détruit. Renvoie false si déjà pris. */
  collect() {
    if (this.collected) return false
    this.collected = true
    this.bob?.stop()
    this.blinkTween?.stop()
    this.glowPulse?.stop()
    this.glow?.destroy()
    this.blink?.remove()
    this.expire?.remove()
    this.destroy()
    return true
  }
}
