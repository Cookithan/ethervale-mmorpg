import Phaser from 'phaser'
import { ITEMS, effectiveStats, cloneItem, STARTER_WEAPON } from '../data/items.js'
import { CLASSES, DEFAULT_CHARACTER } from '../data/classes.js'
import { Audio, SFX } from '../data/sound.js'

const SPEED = 65 // vitesse de déplacement de base (px/s) — modulée par la classe (speedMul)
const ATTACK_MS = 260 // durée de l'animation d'attaque (déplacement bloqué)
const ATTACK_COOLDOWN = 340 // cadence de l'attaque de base : rapide/spammable mais pas "mitraillette"
const HURT_IFRAMES = 600 // invulnérabilité après avoir été touché (ms)
const SHOOT_COOLDOWN = 360 // délai mini entre deux tirs à distance (ms) — attaque de base à distance
const MANA_REGEN = 3 // mana/s de BASE (compromis : la mana mord un peu ; des items de régén la complèteront)
const INV_MAX = 6 // capacité du SAC (cap strict) — l'équipement des 4 slots est à part (= nb de cases de la hotbar)

// Progression « façon WoW » (brief A2) : cap niveau 50, courbe d'XP exponentielle DOUCE.
// Montée très rapide au début (le joueur accroche), mur de plus en plus raide vers 50 (le farm
// hardcore est l'end-game, pas le leveling). Chiffres = points de départ à équilibrer.
const MAX_LEVEL = 50
const XP_BASE = 90 // XP du niveau 1 -> 2 (quelques kills) — leveling qui se mérite
const XP_GROWTH = 1.17 // chaque niveau coûte ~+17 % du précédent
/** XP nécessaire pour passer de `level` à `level+1`. */
function xpForLevel(level) {
  return Math.round(XP_BASE * Math.pow(XP_GROWTH, level - 1))
}

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
    this.maxLevel = MAX_LEVEL // cap de niveau (montée rapide au début, mur vers 50)
    this.xp = 0
    this.xpToNext = xpForLevel(1) // XP pour le niveau 2 (courbe exponentielle douce, cf. gainXp)
    this.gold = 0

    // stats de BASE selon la CLASSE (augmentent au niveau). Les totaux (maxHp/attackPower/
    // defense) = base + bonus des objets équipés, recalculés par recomputeStats().
    const cls = CLASSES[this.className] ?? CLASSES.warrior
    this.baseMaxHp = cls.hp
    this.baseAttack = cls.attack
    this.baseDefense = cls.defense
    // GAINS PAR NIVEAU propres à la CLASSE (identité de rôle trinité, cf. classes.js).
    // Tank = beaucoup de PV + défense ; Mage = peu de PV mais mana ; Guerrier = PV équilibré ; Soigneur = mana.
    this.hpPerLevel = cls.hpPerLevel ?? 12
    this.defPerLevel = cls.defPerLevel ?? 0
    this.manaPerLevel = cls.manaPerLevel ?? 0

    // capacités EXCLUSIVES de la classe (verrouillées à la création) + vitesse
    this.abilities = cls.abilities ?? { melee: true, ranged: false, heal: false }
    this.speed = SPEED * (cls.speedMul ?? 1)
    this.envSpeedMul = 1 // ralenti environnemental (température extrême) ; 1 = normal
    this.temp = 0 // température courante (-100 grand froid … +100 grosse chaleur), transitoire (non sauvegardée)
    this.tempBuff = { fire: 0, frost: 0 } // fin (temps absolu) des potions : feu = immunité froid, givre = immunité chaud
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
    this.spell2 = cls.spell2 ?? null // 2e compétence (déverrouillée à `spell2.level`, défaut niv 10)
    this.nextSpell2At = 0 // fin du cooldown du 2e sort
    this.charging2 = false // Charge du Tank en cours (buff de vitesse jusqu'à 4 s / impact)
    this.chargeSpeedMul = 1 // multiplicateur de vitesse pendant la Charge du Tank
    this.shieldUntil = 0 // fin du buff Bouclier (Tank) -> -80 % dégâts reçus

    // équipement 4 SLOTS (Arme/Armure/Relique[clé 'focus']/Anneau) + sac. Départ = SEULEMENT l'arme de base de la classe
    // (rien d'autre : ni armure, ni anneau -> tout le reste se gagne/s'achète).
    const starterId = STARTER_WEAPON[this.className] ?? 'sword'
    this.equipped = { weapon: cloneItem(ITEMS[starterId]), armor: null, focus: null, ring: null }
    this.spellPowerMul = 1 // >1 = effet/dégâts de compétence renforcé (Relique)
    this.spellDurationMul = 1 // >1 = durée d'effet de compétence allongée (Relique)
    this.inventory = [] // sac vide au départ
    this.resources = {} // poche de MATÉRIAUX empilables {id: quantité} (à part du sac, pour vendre/forger)
    // (les armes à LANCER ne sont pas de départ : trop fortes -> uniquement achetables au marché)
    this.invVersion = 0 // incrémenté à chaque changement (l'UI s'en sert pour rafraîchir)
    this.invMax = INV_MAX // taille max du sac (loot/achat refusés quand plein)
    this.hasBoat = false // bateau acheté au marchand -> peut naviguer sur l'eau (A3)
    this.sailing = false // en navigation (sur l'eau en bateau) -> attaques bloquées (mis à jour par GameScene)
    // QUÊTES (brief §10) : quête active { id, progress } ou null + ids des quêtes terminées (chaîne).
    this.quest = null
    this.questsDone = []
    // SAC DE MORT (A1) : à la mort, or + sac tombent ici {gold, items, x, y} ; 1 seul à la fois.
    this.deathBag = null
    this.deathsSinceRecovery = 0 // remourir sans récupérer remplace l'ancien sac ; 3 = tout perdu

    this.hp = this.baseMaxHp
    this.recomputeStats() // initialise maxHp / attackPower / defense
    this.hp = this.maxHp

    this.attacking = false
    this.attackUntil = 0
    this.nextAttackAt = 0
    this.invulnUntil = 0
    this.dashing = false // pendant la Charge du Guerrier : traverse les boss solides (collider ignoré)
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
    this.xpToNext = xpForLevel(this.level) // recalcule sur la courbe actuelle (cap 50) — vaut aussi pour vieilles saves
    this.gold = s.gold ?? 0
    this.baseMaxHp = s.baseMaxHp ?? this.baseMaxHp
    this.baseAttack = s.baseAttack ?? this.baseAttack
    this.baseDefense = s.baseDefense ?? this.baseDefense
    this.baseMana = s.baseMana ?? this.baseMana // mana de base acquise au fil des niveaux (casters)
    if (s.equipped) {
      // garantit les 4 slots + migre une ancienne sauvegarde (slot 'accessory' -> 'ring')
      this.equipped = { weapon: null, armor: null, focus: null, ring: null, ...s.equipped }
      if (this.equipped.accessory) {
        this.equipped.ring = this.equipped.ring || this.equipped.accessory
        delete this.equipped.accessory
      }
    }
    if (s.inventory) this.inventory = s.inventory
    this.hasBoat = s.hasBoat ?? false
    this.resources = s.resources ?? {}
    this.quest = s.quest ?? null
    this.questsDone = s.questsDone ?? []
    this.deathBag = s.deathBag ?? null
    this.deathsSinceRecovery = s.deathsSinceRecovery ?? 0
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
    let manaRegen = 0
    let coldResist = 0
    let heatResist = 0
    let spellPower = 0
    let spellDuration = 0
    for (const slot of Object.keys(this.equipped)) {
      const it = this.equipped[slot]
      if (!it) continue
      const s = effectiveStats(it) // stats boostées par le niveau d'amélioration
      atk += s.attack ?? 0
      def += s.defense ?? 0
      hp += s.hp ?? 0
      mana += s.mana ?? 0 // Anneau -> +Mana max
      manaRegen += s.manaRegen ?? 0 // Relique/Anneau -> +régén de mana/s (pour les casters)
      coldResist += s.coldResist ?? 0 // résiste au froid (biome neige)
      heatResist += s.heatResist ?? 0 // résiste à la chaleur (biome désert)
      spellPower += it.spellPower ?? 0 // Relique -> effet/dégâts de compétence renforcé
      spellDuration += it.spellDuration ?? 0 // Relique -> durée d'effet de compétence allongée
    }
    this.coldResist = coldResist
    this.heatResist = heatResist
    this.attackPower = this.baseAttack + atk
    this.defense = this.baseDefense + def
    this.maxHp = this.baseMaxHp + hp
    this.maxMana = (this.baseMana ?? 0) + mana
    this.manaRegen = MANA_REGEN + manaRegen // régén de base + bonus des items équipés (mana/s)
    this.spellPowerMul = 1 + spellPower // +X% effet/dégâts du sort
    this.spellDurationMul = 1 + spellDuration // +X% durée d'effet du sort
    if (this.hp > this.maxHp) this.hp = this.maxHp // si on retire un bonus de PV max
    if (this.mana > this.maxMana) this.mana = this.maxMana
  }

  /** Vrai s'il reste de la place dans le sac. */
  bagFull() {
    return this.inventory.length >= this.invMax
  }

  /** Ajoute `n` matériaux à la poche de ressources (empilable, sans limite de sac). */
  addResource(id, n = 1) {
    this.resources[id] = (this.resources[id] ?? 0) + n
    this.invVersion++
  }

  /** Retire `n` matériaux. Renvoie false s'il n'y en a pas assez. */
  removeResource(id, n = 1) {
    if ((this.resources[id] ?? 0) < n) return false
    this.resources[id] -= n
    if (this.resources[id] <= 0) delete this.resources[id]
    this.invVersion++
    return true
  }

  /** Ajoute un objet au sac. Renvoie false si le sac est PLEIN (cap strict). */
  addItem(item) {
    if (this.bagFull()) return false
    this.inventory.push(item)
    this.invVersion++
    return true
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

  /** Déséquipe un slot (renvoie l'objet au sac). Renvoie false si le sac est plein. */
  unequip(slot) {
    const item = this.equipped[slot]
    if (!item) return false
    if (this.bagFull()) return false // sac plein : impossible de retirer (libère une place d'abord)
    this.equipped[slot] = null
    this.inventory.push(item)
    this.recomputeStats()
    this.invVersion++
    return true
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
    Audio.sfx(SFX.hurt, { vol: 0.5 }) // le héros encaisse (toutes sources : morsure, sort...)
    this.invulnUntil = now + HURT_IFRAMES
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(90, () => this.clearTint())
    const broke = this.wearSlot('armor') // l'armure s'use quand on encaisse un coup
    if (broke) this.scene.notifyBreak?.(broke)
    return true
  }

  /** Dégâts d'ENVIRONNEMENT (gelure / coup de chaud) : ignorent les i-frames ET la défense (l'armure ne
   *  protège pas du froid/chaud — ce sont les items de résistance qui comptent). Pas de recul ni d'usure. */
  envHurt(amount) {
    if (this.hp <= 0) return
    this.hp = Math.max(0, this.hp - amount)
    Audio.sfx(SFX.hurt, { vol: 0.35, detune: -250 })
  }

  /** Soigne le héros (plafonné aux PV max). Renvoie les PV réellement rendus. */
  heal(amount) {
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + amount)
    return this.hp - before
  }

  /** Ajoute de l'XP, gère le(s) passage(s) de niveau (cap 50). */
  gainXp(amount) {
    if (this.level >= this.maxLevel) return
    const startLevel = this.level
    this.xp += amount
    while (this.xp >= this.xpToNext && this.level < this.maxLevel) {
      this.xp -= this.xpToNext
      this.level++
      this.baseMaxHp += this.hpPerLevel // gain de PV propre à la classe (Tank +30 ... Mage +11)
      this.baseDefense += this.defPerLevel // seul le Tank en gagne (+1/niv) -> encaisse de mieux en mieux
      this.baseMana += this.manaPerLevel // casters (Mage/Soigneur) -> plus de mana pour enchaîner les sorts
      this.baseAttack += 4
      this.recomputeStats()
      this.hp = this.maxHp // soin complet au level up
      this.xpToNext = xpForLevel(this.level) // coût du prochain niveau (×1,16 par palier)
      this.scene.onLevelUp?.()
    }
    if (this.level > startLevel) Audio.sfx('sfx_levelup', { vol: 0.7, detune: 0 }) // jingle de montée de niveau (1 fois)
    if (this.level >= this.maxLevel) this.xp = 0
  }

  update(time) {
    // régénération LENTE de mana (tourne aussi pendant l'attaque)
    if (this.maxMana > 0 && this.mana < this.maxMana) {
      const dt = this._lastT ? time - this._lastT : 16
      this.mana = Math.min(this.maxMana, this.mana + ((this.manaRegen ?? MANA_REGEN) * dt) / 1000)
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

    const spd = this.speed * (this.envSpeedMul ?? 1) * (this.chargeSpeedMul ?? 1) // ralenti température / boost Charge du Tank
    this.setVelocity(vx * spd, vy * spd)

    const moving = vx !== 0 || vy !== 0
    // direction = axe DOMINANT (sinon le clic-déplacement, dont vx est presque toujours ≠ 0,
    // regarde toujours sur le côté et jamais vers le haut/bas)
    if (moving) {
      if (Math.abs(vx) > Math.abs(vy)) this.facing = vx < 0 ? 'left' : 'right'
      else this.facing = vy < 0 ? 'up' : 'down'
    }

    // bruits de pas pendant la marche : alternés, cadence calée sur la vitesse (lent = pas espacés).
    // En navigation (bateau) : pas de pas — le héros est assis (this.sailing posé par GameScene).
    if (moving && !this.sailing) {
      const stepMs = 320 * (SPEED / this.speed)
      if (time >= (this._stepAt || 0)) {
        Audio.sfx(SFX.step, { vol: 0.32 })
        this.scene.spawnFootDust?.(this.x, this.y) // petit nuage de poussière sous les pieds (teinté par le biome)
        this._stepAt = time + stepMs
      }
    } else {
      this._stepAt = 0 // à l'arrêt : le prochain pas joue tout de suite quand on repart
    }
    this.anims.play(`${this.heroKey}-` + (moving ? 'walk-' : 'idle-') + this.facing, true)
  }
}
