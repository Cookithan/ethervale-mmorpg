import Phaser from 'phaser'
import { ITEMS, effectiveStats, cloneItem, STARTER_WEAPON, refreshItemDef, setStatus } from '../data/items.js'
import { CLASSES, DEFAULT_CHARACTER, MAGE_KITS } from '../data/classes.js'
import { Audio, SFX } from '../data/sound.js'

const SPEED = 65 // vitesse de déplacement de base (px/s) — modulée par la classe (speedMul)
const ATTACK_MS = 260 // durée de l'animation d'attaque (déplacement bloqué)
const ATTACK_COOLDOWN = 340 // cadence de l'attaque de base : rapide/spammable mais pas "mitraillette"
const HURT_IFRAMES = 600 // invulnérabilité après avoir été touché (ms)
const SHOOT_COOLDOWN = 360 // délai mini entre deux tirs à distance (ms) — attaque de base à distance
const MANA_REGEN = 1.6 // mana/s de BASE (volontairement BAS : la barre se remplit lentement -> la mana limite les sorts ; les items de régén la complètent)
const INV_MAX = 6 // capacité du SAC (cap strict) — l'équipement des 4 slots est à part (= nb de cases de la hotbar)
const STACK_MAX = 6 // taille maxi d'une PILE (potions uniquement)

/** Empilable dans une seule case ? Seules les POTIONS/fioles (et le feu de camp) le sont — PAS les repas ni les
 *  boissons de la taverne (champ `cat` = 'food'|'drink'), qui prennent une case chacun. Une pile porte `qty` (1..STACK_MAX). */
function isStackable(item) {
  return !!item && item.type === 'consumable' && !item.cat
}

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
    this.sitting = false // assis sur un siège de taverne (figé jusqu'au lever)
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
    // MAGE ÉLÉMENTAIRE : l'élément vient de l'APPARENCE (feu/glace/ombre) -> kit de sorts propre (MAGE_KITS).
    this.element = heroDef?.element ?? null
    if (this.className === 'mage' && this.element && MAGE_KITS[this.element]) {
      this.spell = MAGE_KITS[this.element].spell
      this.spell2 = MAGE_KITS[this.element].spell2
    }
    this.charging2 = false // Charge du Tank en cours (buff de vitesse jusqu'à 4 s / impact)
    this.chargeSpeedMul = 1 // multiplicateur de vitesse pendant la Charge du Tank
    this.shieldUntil = 0 // fin du buff Bouclier (Tank) -> -80 % dégâts reçus
    this.shieldHp = 0 // POINTS d'absorption (Mot de pouvoir : Bouclier, Soigneur) : encaissés avant les PV
    this.shieldHpUntil = 0 // expiration de l'absorption

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
    // BANQUE : coffre PERSISTANT à l'abri de la mort (le sac de mort ne prend que gold + sac, jamais le coffre).
    this.bankGold = 0 // or déposé en banque
    this.bankItems = [] // objets stockés au coffre (cases supplémentaires)
    // SAC DE MORT (A1) : à la mort, or + sac tombent ici {gold, items, x, y} ; 1 seul à la fois.
    this.deathBag = null
    this.deathsSinceRecovery = 0 // (legacy, plus utilisé) — le sac se renouvelle à CHAQUE mort, plus de perte définitive
    this.respawnHome = false // a dormi au dortoir -> réapparaît dans son lit à la mort (sinon place du village)
    this.shopLevels = { apothecary: 1, tavern: 1 } // niveaux de rénovation des boutiques de lieu (1..4, par perso)
    this.foodBuff = { atk: 0, def: 0, regen: 0, until: 0 } // buff de repas/élixir en cours (temps absolu `until`)
    this.setPity = {} // pièces de panoplie : kills de boss depuis le dernier drop (par id) -> drop garanti à X

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
    this.consolidateInventory() // empile les consommables (migre les saves d'avant le stacking)
    // migration d'apparence : rafraîchit icônes/noms des objets sauvegardés depuis le catalogue actuel
    // (les sprites d'items ont changé -> sinon une vieille save garde les anciennes icônes Ninja).
    for (const slot of Object.keys(this.equipped)) if (this.equipped[slot]) refreshItemDef(this.equipped[slot])
    for (const it of this.inventory) if (it) refreshItemDef(it)
    this.hasBoat = s.hasBoat ?? false
    this.resources = s.resources ?? {}
    this.quest = s.quest ?? null
    this.questsDone = s.questsDone ?? []
    this.bankGold = s.bankGold ?? 0 // coffre (or + objets à l'abri de la mort)
    this.bankItems = s.bankItems ?? []
    for (const it of this.bankItems) if (it) refreshItemDef(it) // rafraîchit icônes/noms depuis le catalogue actuel
    this.deathBag = s.deathBag ?? null
    this.deathsSinceRecovery = s.deathsSinceRecovery ?? 0
    this.respawnHome = s.respawnHome ?? false // point de repos (dortoir) persistant
    this.shopLevels = s.shopLevels ?? { apothecary: 1, tavern: 1 } // anciennes saves -> palier 1
    this.foodBuff = s.foodBuff ?? { atk: 0, def: 0, regen: 0, until: 0 }
    this.setPity = s.setPity ?? {}
    this.reviveCharge = s.reviveCharge ?? false
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
    // PANOPLIES : cumule les bonus 2/4 pièces des sets équipés + détecte la panoplie COMPLÈTE (sort 3, étape 7)
    this.activeSet = null
    const setKeys = new Set(Object.values(this.equipped).filter((it) => it?.set).map((it) => it.set))
    for (const key of setKeys) {
      const st = setStatus(this.equipped, key)
      const b = st.bonus
      atk += b.attack ?? 0
      def += b.defense ?? 0
      hp += b.hp ?? 0
      mana += b.mana ?? 0
      manaRegen += b.manaRegen ?? 0
      spellPower += b.spellPower ?? 0
      spellDuration += b.spellDuration ?? 0
      if (st.count >= 4) this.activeSet = st.set // panoplie complète -> compétence de set débloquée
    }
    // BUFF DE REPAS (taverne) / élixir : +ATQ / +DÉF tant qu'il est actif (temps absolu `until`). La régén est
    // appliquée frame par frame dans GameScene.updateFoodBuff ; l'expiration y rappelle recomputeStats pour retirer ce bonus.
    const fbNow = this.scene?.time?.now ?? 0
    if (this.foodBuff && fbNow < (this.foodBuff.until || 0)) { atk += this.foodBuff.atk || 0; def += this.foodBuff.def || 0 }
    this.coldResist = coldResist
    this.heatResist = heatResist
    // MAINS NUES (aucune arme équipée — ex. après casse) : peu de dégâts (moins qu'une dague) pour
    // inciter à réparer/se rééquiper. Sinon attaque = base + bonus des items.
    this.unarmed = !this.equipped.weapon
    this.attackPower = this.unarmed ? Math.max(2, Math.round((this.baseAttack + atk) * 0.4)) : this.baseAttack + atk
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

  /** Vrai si on peut accueillir `item` : place libre, OU pile existante non pleine (consommable empilable). */
  canAccept(item) {
    if (!this.bagFull()) return true
    if (isStackable(item)) return this.inventory.some((it) => it.id === item.id && isStackable(it) && (it.qty ?? 1) < STACK_MAX)
    return false
  }

  /** Ajoute un objet au sac. Les consommables s'EMPILENT (max STACK_MAX par case) sur une pile existante
   *  avant d'occuper une nouvelle case. Renvoie false si tout n'a pas pu rentrer (sac plein). */
  addItem(item) {
    if (isStackable(item)) {
      let remaining = item.qty ?? 1
      // 1) compléter les piles existantes du même type
      for (const it of this.inventory) {
        if (remaining <= 0) break
        if (it.id === item.id && isStackable(it)) {
          const room = STACK_MAX - (it.qty ?? 1)
          if (room > 0) { const add = Math.min(room, remaining); it.qty = (it.qty ?? 1) + add; remaining -= add }
        }
      }
      // 2) ouvrir de nouvelles cases tant qu'il reste de la place
      while (remaining > 0 && !this.bagFull()) {
        const add = Math.min(STACK_MAX, remaining)
        this.inventory.push({ ...item, qty: add })
        remaining -= add
      }
      this.invVersion++
      return remaining <= 0
    }
    if (this.bagFull()) return false
    this.inventory.push(item)
    this.invVersion++
    return true
  }

  /** Retire ENTIÈREMENT une case du sac (la pile complète). Renvoie true si trouvée. */
  removeItem(item) {
    const i = this.inventory.indexOf(item)
    if (i === -1) return false
    this.inventory.splice(i, 1)
    this.invVersion++
    return true
  }

  /** Retire `n` unité(s) d'une pile (potion bue, vendue, lâchée). La case disparaît une fois vide. */
  takeOne(item, n = 1) {
    const i = this.inventory.indexOf(item)
    if (i === -1) return false
    const q = item.qty ?? 1
    if (q > n) item.qty = q - n
    else this.inventory.splice(i, 1)
    this.invVersion++
    return true
  }

  /** Fusionne les consommables identiques en piles (max STACK_MAX) — migre les vieilles sauvegardes
   *  (objets non empilés) et range le sac après récupération du sac de mort. */
  consolidateInventory() {
    const out = []
    for (const it of this.inventory) {
      if (!isStackable(it)) { out.push(it); continue }
      let remaining = it.qty ?? 1
      for (const s of out) {
        if (remaining <= 0) break
        if (s.id === it.id && isStackable(s)) {
          const room = STACK_MAX - (s.qty ?? 1)
          if (room > 0) { const add = Math.min(room, remaining); s.qty = (s.qty ?? 1) + add; remaining -= add }
        }
      }
      while (remaining > 0) { const add = Math.min(STACK_MAX, remaining); out.push({ ...it, qty: add }); remaining -= add }
    }
    this.inventory = out
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
    if (!it || it.durability == null || it.unbreakable || Object.values(STARTER_WEAPON).includes(it.id)) return null // incassable (flag OU arme de base)
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
    let dmg = Math.max(1, Math.round(amount - this.defense)) // la défense réduit les dégâts (min 1)
    // ABSORPTION (Mot de pouvoir : Bouclier, Soigneur) : encaisse avant les PV, jusqu'à épuisement/expiration
    if (this.shieldHp > 0 && now < this.shieldHpUntil) {
      const absorbed = Math.min(this.shieldHp, dmg)
      this.shieldHp -= absorbed
      dmg -= absorbed
      if (this.shieldHp <= 0) this.scene.onShieldBroken?.(this) // bulle disparaît quand le bouclier casse
    }
    if (dmg > 0) this.hp = Math.max(0, this.hp - dmg)
    // chiffre flottant : rouge = dégâts encaissés, bleu = entièrement absorbé par le bouclier
    if (dmg > 0) this.scene.floatingDamage?.(this, dmg, '#ff6b6b')
    else this.scene.floatingText?.(this.x, this.y - 14, 'absorbé', '#9fe0ff', { size: 10, rise: 18 })
    Audio.sfx(SFX.hurt, { vol: 0.5 }) // le héros encaisse (toutes sources : morsure, sort...)
    this.invulnUntil = now + HURT_IFRAMES
    this.setTintFill(dmg > 0 ? 0xffffff : 0x9fe0ff) // flash blanc, ou BLEU si entièrement absorbé
    this.scene.time.delayedCall(90, () => this.clearTint())
    if (dmg > 0) { const broke = this.wearSlot('armor'); if (broke) this.scene.notifyBreak?.(broke) } // l'armure ne s'use que sur de vrais dégâts
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
    const gained = this.hp - before
    if (gained > 0) this.scene.floatingDamage?.(this, gained, '#7cfc9a') // chiffre de soin (vert) au-dessus du héros
    return gained
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

  /** Retire UN niveau (service de rapatriement du sac par l'apothicaire) : annule les gains du niveau perdu
   *  (PV/mana/déf/atq) et repart au début du niveau inférieur. Renvoie false si déjà niveau 1. */
  deLevel() {
    if (this.level <= 1) return false
    this.level--
    this.baseMaxHp -= this.hpPerLevel
    this.baseDefense -= this.defPerLevel
    this.baseMana -= this.manaPerLevel
    this.baseAttack -= 4
    this.xpToNext = xpForLevel(this.level)
    this.xp = 0 // repart au début du niveau inférieur
    this.recomputeStats()
    this.hp = Math.min(this.hp, this.maxHp) // PV/mana plafonnés au nouveau max (réduit)
    this.mana = Math.min(this.mana, this.maxMana)
    this.invVersion++
    return true
  }

  /** Repousse le héros (recul) : vélocité imposée + input ignoré pendant `ms` (ex. contact du feu de camp). */
  knockback(vx, vy, ms = 240) {
    this.setVelocity(vx, vy)
    this.knockUntil = this.scene.time.now + ms
    this.moveTarget = null
    this.attacking = false
  }

  update(time) {
    // régénération LENTE de mana (tourne aussi pendant l'attaque)
    if (this.maxMana > 0 && this.mana < this.maxMana) {
      const dt = this._lastT ? time - this._lastT : 16
      this.mana = Math.min(this.maxMana, this.mana + ((this.manaRegen ?? MANA_REGEN) * dt) / 1000)
    }
    this._lastT = time
    // ASSIS (taverne) : FIGÉ sur le siège jusqu'à ce qu'on se relève (E). Aucun déplacement ni attaque (la mana régénère).
    if (this.sitting) {
      this.setVelocity(0, 0)
      this.moveTarget = null
      this.anims.play(`${this.heroKey}-idle-${this.facing}`, true)
      return
    }
    // RECUL (knockback, ex. au contact du feu de camp) : on garde la vélocité de recul, input ignoré
    if (time < (this.knockUntil ?? 0)) {
      this.anims.play(`${this.heroKey}-idle-${this.facing}`, true)
      return
    }
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
