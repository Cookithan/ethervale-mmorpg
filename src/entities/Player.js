import Phaser from 'phaser'
import { ITEMS, effectiveStats, cloneItem, STARTER_WEAPON } from '../data/items.js'
import { CLASSES, DEFAULT_CHARACTER } from '../data/classes.js'

const SPEED = 65 // vitesse de déplacement de base (px/s) — modulée par la classe (speedMul)
const ATTACK_MS = 260 // durée de l'animation d'attaque (déplacement bloqué)
const ATTACK_COOLDOWN = 340 // cadence de l'attaque de base : rapide/spammable mais pas "mitraillette"
const HURT_IFRAMES = 600 // invulnérabilité après avoir été touché (ms)
const SHOOT_COOLDOWN = 360 // délai mini entre deux tirs à distance (ms) — attaque de base à distance
const MANA_REGEN = 6 // mana régénéré par seconde (régén LENTE, brief §1)

/**
 * Player — héros contrôlé au clavier (ZQSD/WASD/flèches) ET au clic (click-to-move).
 * Gère aussi : attaque épée (espace), PV, XP/niveau, dégâts reçus avec i-frames.
 */
export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, opts = {}) {
    const character = opts.character ?? DEFAULT_CHARACTER
    const classKey = character.classKey ?? 'warrior'
    // repli si l'apparence sauvegardée n'existe plus (ancienne save) -> 1re apparence de la classe
    let heroKey = character.hero
    if (!heroKey || !scene.textures.exists(heroKey)) {
      heroKey = (CLASSES[classKey] ?? CLASSES.warrior).heroes[0].key
    }
    super(scene, x, y, heroKey, 0)
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.heroKey = heroKey // apparence -> texture + préfixe d'animation
    this.character = character
    this.className = character.classKey ?? 'warrior'

    this.setCollideWorldBounds(true)
    this.body.setSize(10, 8).setOffset(3, 7)

    this.facing = 'down'
    this.anims.play(`${heroKey}-idle-down`)

    // état combat / progression
    this.level = 1
    this.xp = 0
    this.xpToNext = 50
    this.gold = 0

    // stats de BASE selon la CLASSE (augmentent au niveau). Les totaux (maxHp/attackPower/
    // defense) = base + bonus des objets équipés, recalculés par recomputeStats().
    const cls = CLASSES[this.className] ?? CLASSES.warrior
    this.baseMaxHp = cls.hp
    this.baseAttack = cls.attack
    this.baseDefense = cls.defense

    // capacités EXCLUSIVES de la classe (verrouillées à la création) + vitesse
    this.abilities = cls.abilities ?? { melee: true, ranged: false, heal: false }
    this.speed = SPEED * (cls.speedMul ?? 1)
    this.attackCdMul = cls.attackCdMul ?? 1 // cadence de l'attaque de base (Tank = plus lent)
    this.meleeKnock = cls.meleeKnock ?? 0 // recul de l'attaque de base : SEUL le Tank repousse (les autres = 0)
    this.shootCdMul = cls.shootCdMul ?? 1 // cadence du tir à distance (Mage = plus lent, tape plus fort)
    this.rangedDmgMul = cls.rangedDmgMul ?? 1 // multiplicateur de dégâts du tir à distance
    // magie PROPRE à l'apparence : couleur (projectile + Météore) + clé d'anim FX d'impact (optionnel)
    const heroDef = (cls.heroes ?? []).find((h) => h.key === heroKey)
    this.magicColor = heroDef?.magic ?? 0xffffff
    this.spellFx = heroDef?.spellFx ?? null // ex: 'fx-explosion' -> anim jouée à l'impact du Météore
    this.projFx = heroDef?.proj ?? null // sprite/anim du projectile de base (ex: fx-fireball / fx-energyball teinté)
    this.casting = false // en incantation (Météore du Mage) -> déplacement bloqué
    this.castInterrupted = false // mis à true si on prend un coup pendant l'incantation -> sort annulé
    // MANA + LE sort de la classe (1 seul : coût mana + cooldown). Régén lente gérée dans update().
    this.baseMana = cls.mana ?? 0 // mana de base de la classe ; +Anneau via recomputeStats
    this.maxMana = this.baseMana
    this.mana = this.maxMana
    this.spell = cls.spell ?? null // { id, name, cost, cd }
    this.nextSpellAt = 0 // fin du cooldown du sort de classe
    this.shieldUntil = 0 // fin du buff Bouclier (Tank) -> -50 % dégâts reçus

    // équipement 4 SLOTS (Arme/Armure/Casque/Anneau) + sac. Arme de départ selon la classe + tunique.
    const starterId = STARTER_WEAPON[this.className] ?? 'sword'
    this.equipped = { weapon: cloneItem(ITEMS[starterId]), armor: cloneItem(ITEMS.leather), focus: null, ring: null }
    this.spellCdMul = 1 // <1 = cooldown de compétence réduit (Focus)
    this.spellPowerMul = 1 // >1 = effet de compétence renforcé (Focus)
    this.inventory = [cloneItem(ITEMS.amulet)] // un Anneau de mana de départ dans le sac
    // (les armes à LANCER ne sont pas de départ : trop fortes -> uniquement achetables au marché)
    this.invVersion = 0 // incrémenté à chaque changement (l'UI s'en sert pour rafraîchir)

    this.hp = this.baseMaxHp
    this.recomputeStats() // initialise maxHp / attackPower / defense
    this.hp = this.maxHp

    this.attacking = false
    this.attackUntil = 0
    this.nextAttackAt = 0
    this.invulnUntil = 0
    this.nextShootAt = 0 // cooldown du tir à distance

    this.moveTarget = null // {x, y} pour le click-to-move

    this.cursors = scene.input.keyboard.createCursorKeys()
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,Z,Q')

    if (opts.save) this.applySave(opts.save) // reprise d'une partie sauvegardée
  }

  /** Restaure la progression depuis une sauvegarde (la position est gérée par GameScene). */
  applySave(s) {
    this.level = s.level ?? this.level
    this.xp = s.xp ?? 0
    this.xpToNext = s.xpToNext ?? this.xpToNext
    this.gold = s.gold ?? 0
    this.baseMaxHp = s.baseMaxHp ?? this.baseMaxHp
    this.baseAttack = s.baseAttack ?? this.baseAttack
    this.baseDefense = s.baseDefense ?? this.baseDefense
    if (s.equipped) {
      // garantit les 4 slots + migre une ancienne sauvegarde (slot 'accessory' -> 'ring')
      this.equipped = { weapon: null, armor: null, focus: null, ring: null, ...s.equipped }
      if (this.equipped.accessory) {
        this.equipped.ring = this.equipped.ring || this.equipped.accessory
        delete this.equipped.accessory
      }
    }
    if (s.inventory) this.inventory = s.inventory
    this.recomputeStats()
    this.hp = Math.min(s.hp ?? this.maxHp, this.maxHp)
    this.mana = this.maxMana
    this.invVersion++
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
    this.attackUntil = now + ATTACK_MS * this.attackCdMul
    this.nextAttackAt = now + ATTACK_COOLDOWN * this.attackCdMul
    this.moveTarget = null
    this.setVelocity(0, 0)
    this.anims.play(`${this.heroKey}-attack-` + this.facing, true)
    return true
  }

  /** Recalcule les stats totales = base + bonus des objets équipés. */
  recomputeStats() {
    let atk = 0
    let def = 0
    let hp = 0
    let mana = 0
    let spellCd = 0
    let spellPower = 0
    for (const slot of Object.keys(this.equipped)) {
      const it = this.equipped[slot]
      if (!it) continue
      const s = effectiveStats(it) // stats boostées par le niveau d'amélioration
      atk += s.attack ?? 0
      def += s.defense ?? 0
      hp += s.hp ?? 0
      mana += s.mana ?? 0 // Anneau -> +Mana max
      spellCd += it.spellCd ?? 0 // Focus -> cooldown de compétence réduit
      spellPower += it.spellPower ?? 0 // Focus -> effet de compétence renforcé
    }
    this.attackPower = this.baseAttack + atk
    this.defense = this.baseDefense + def
    this.maxHp = this.baseMaxHp + hp
    this.maxMana = (this.baseMana ?? 0) + mana
    this.spellCdMul = Math.max(0.3, 1 - spellCd) // -X% cooldown (jamais sous 30 % du cd)
    this.spellPowerMul = 1 + spellPower // +X% effet du sort
    if (this.hp > this.maxHp) this.hp = this.maxHp // si on retire un bonus de PV max
    if (this.mana > this.maxMana) this.mana = this.maxMana
  }

  /** Ajoute un objet au sac. */
  addItem(item) {
    this.inventory.push(item)
    this.invVersion++
  }

  /** Retire un objet du sac (revente). Renvoie true si trouvé. */
  removeItem(item) {
    const i = this.inventory.indexOf(item)
    if (i === -1) return false
    this.inventory.splice(i, 1)
    this.invVersion++
    return true
  }

  /** Équipe un objet du sac (renvoie l'ancien du même slot au sac).
   *  Renvoie false si l'objet est CASSÉ (durabilité 0) -> à réparer chez le forgeron. */
  equip(item) {
    if (item.durability != null && item.durability <= 0) return false // cassé
    if (item.classes && !item.classes.includes(this.className)) return false // réservé à une autre classe
    const i = this.inventory.indexOf(item)
    if (i === -1) return false
    this.inventory.splice(i, 1)
    const prev = this.equipped[item.slot]
    this.equipped[item.slot] = item
    if (prev) this.inventory.push(prev)
    this.recomputeStats()
    this.invVersion++
    return true
  }

  /**
   * Use l'objet équipé d'un slot (-1 durabilité). À 0 il CASSE : déséquipé, renvoyé au sac.
   * Renvoie l'objet cassé (pour notifier) ou null.
   */
  wearSlot(slot) {
    const it = this.equipped[slot]
    if (!it || it.durability == null) return null
    it.durability -= 1
    if (it.durability <= 0) {
      it.durability = 0
      this.equipped[slot] = null
      this.inventory.push(it)
      this.recomputeStats()
      this.invVersion++
      return it // signale la casse
    }
    return null
  }

  /** Déséquipe un slot (renvoie l'objet au sac). */
  unequip(slot) {
    const item = this.equipped[slot]
    if (!item) return
    this.equipped[slot] = null
    this.inventory.push(item)
    this.recomputeStats()
    this.invVersion++
  }

  /** Autorise un tir si le cooldown est passé et arme le prochain. Renvoie true si OK. */
  startShoot(now) {
    if (now < this.nextShootAt) return false
    this.nextShootAt = now + SHOOT_COOLDOWN * this.shootCdMul
    return true
  }

  /** Dépense `cost` mana si dispo. Renvoie true si payé (sinon false -> pas assez de mana). */
  spendMana(cost) {
    if (this.mana < cost) return false
    this.mana -= cost
    return true
  }

  /** Inflige des dégâts au héros (respecte les i-frames). Renvoie true si touché. */
  takeDamage(amount, now) {
    if (now < this.invulnUntil || this.hp <= 0) return false
    if (this.casting) this.castInterrupted = true // un coup pendant l'incantation l'annule (sort perdu)
    if (now < this.shieldUntil) amount *= 0.2 // Bouclier (Tank) : le bouclier absorbe 80 % -> héros = 20 %
    const dmg = Math.max(1, Math.round(amount - this.defense)) // la défense réduit les dégâts (min 1)
    this.hp = Math.max(0, this.hp - dmg)
    this.invulnUntil = now + HURT_IFRAMES
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(90, () => this.clearTint())
    const broke = this.wearSlot('armor') // l'armure s'use quand on encaisse un coup
    if (broke) this.scene.notifyBreak?.(broke)
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
      this.baseMaxHp += 20
      this.baseAttack += 4
      this.recomputeStats()
      this.hp = this.maxHp // soin complet au level up
      this.xpToNext = Math.round(this.xpToNext * 1.4)
      this.scene.onLevelUp?.()
    }
    if (this.level >= 10) this.xp = 0
  }

  update(time) {
    // régénération LENTE de mana (tourne aussi pendant l'attaque)
    if (this.maxMana > 0 && this.mana < this.maxMana) {
      const dt = this._lastT ? time - this._lastT : 16
      this.mana = Math.min(this.maxMana, this.mana + (MANA_REGEN * dt) / 1000)
    }
    this._lastT = time
    // incantation (Météore) : le mage est ENRACINÉ (ne bouge pas) tant qu'il incante
    if (this.casting) {
      this.setVelocity(0, 0)
      this.moveTarget = null
      this.anims.play(`${this.heroKey}-idle-${this.facing}`, true)
      return
    }
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

    this.setVelocity(vx * this.speed, vy * this.speed)

    if (vx < 0) this.facing = 'left'
    else if (vx > 0) this.facing = 'right'
    else if (vy < 0) this.facing = 'up'
    else if (vy > 0) this.facing = 'down'

    const moving = vx !== 0 || vy !== 0
    this.anims.play(`${this.heroKey}-` + (moving ? 'walk-' : 'idle-') + this.facing, true)
  }
}
