import Phaser from 'phaser'
import { CLASSES, CLASS_LIST } from '../data/classes.js'

const GOLD = 0xc8a24a
const DIM = 0x49617f

/**
 * Création du personnage en 2 étapes :
 *   1. choisir la CLASSE (capacités + stats)
 *   2. choisir une APPARENCE parmi les 3 propres à la classe + saisir le nom
 * puis « Commencer » lance la partie.
 */
export default class CharacterScene extends Phaser.Scene {
  constructor() {
    super('CharacterScene')
  }

  create() {
    this.cw = this.scale.width
    this.ch = this.scale.height
    // village vivant en fond (continuité avec l'accueil chaleureux) au lieu d'un écran noir
    if (!this.scene.isActive('GameScene')) this.scene.launch('GameScene', { preview: true })
    this.scene.bringToTop()
    this.add.rectangle(0, 0, this.cw, this.ch, 0x0a1018, 0.5).setOrigin(0, 0) // voile léger (lisibilité des cartes)

    this.classKey = null
    this.heroIndex = 0
    this.heroName = ''
    this.step = null // conteneur de l'étape courante (détruit/reconstruit à chaque étape)

    this.input.keyboard.on('keydown', (e) => this.onKey(e))
    this.showClassStep()
  }

  /** Vide l'étape courante avant d'en construire une autre. */
  clearStep() {
    if (this.caretTween) {
      this.caretTween.stop()
      this.caretTween = null
    }
    if (this.step) this.step.destroy(true)
    this.step = this.add.container(0, 0)
  }

  /** Met à jour le champ pseudo : texte/placeholder, position du curseur, compteur. */
  updateNameField() {
    if (!this.nameText) return
    const max = 12
    const has = this.heroName.length > 0
    this.nameText.setText(this.heroName)
    this.namePlaceholder.setVisible(!has)
    this.counter.setText(`${this.heroName.length}/${max}`)
    this.counter.setColor(this.heroName.length >= max ? '#ff9d6b' : '#6b7d92')
    // curseur juste après le texte saisi (au tout début si vide)
    this.caret.x = this.nameText.x + (has ? this.nameText.width + 2 : 0)
    // dès qu'un pseudo valide est saisi, on remet l'indication normale + on réactive le bouton
    if (this.nameValid() && this.nameHint) {
      this.nameHint.setText('Ce nom s’affichera au-dessus de ton personnage (toi et les autres joueurs).').setColor('#6b8caa')
    }
    this.refreshStartButton()
  }

  // ---------------- Étape 1 : la classe ----------------
  showClassStep() {
    this.clearStep()
    const cw = this.cw
    const ch = this.ch
    const S = this.step
    const WARM = 0xe0913c // bordure chaude (cohérent avec le menu)
    S.add(this.add.text(cw / 2, 26, 'Choisis ta classe', { fontFamily: 'Georgia, serif', fontSize: '26px', fontStyle: 'bold', color: '#ffd86b', stroke: '#2a1606', strokeThickness: 5 }).setOrigin(0.5))
    S.add(this.add.text(cw / 2, 54, 'Choix DÉFINITIF — lis bien ce que fait chaque classe avant de choisir.', { fontFamily: 'monospace', fontSize: '12px', color: '#ffe8c2' }).setOrigin(0.5))

    const n = CLASS_LIST.length
    const cardW = Math.min(252, Math.floor((cw - 28) / n) - 8)
    const cardH = 338
    const gapX = Math.min(cardW + 16, Math.floor((cw - 14) / n))
    const cy = ch / 2 + 6
    const inner = cardW - 18
    CLASS_LIST.forEach((c, i) => {
      const x = cw / 2 + (i - (n - 1) / 2) * gapX
      const top = cy - cardH / 2
      const box = this.add.rectangle(x, cy, cardW, cardH, 0x241a12, 0.94).setStrokeStyle(2, WARM).setInteractive({ useHandCursor: true })
      const items = [box]
      // portrait (faceset de l'apparence représentative) encadré
      const faceKey = 'face_' + c.heroes[0].key
      const fy = top + 46
      if (this.textures.exists(faceKey)) {
        items.push(this.add.rectangle(x, fy, 62, 62, 0x10151f, 1).setStrokeStyle(2, GOLD))
        items.push(this.add.image(x, fy, faceKey).setScale(56 / 38))
      }
      // nom + rôle
      items.push(this.add.text(x, fy + 48, c.name, { fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(0.5))
      items.push(this.add.text(x, fy + 70, c.desc, { fontFamily: 'monospace', fontSize: '12px', color: '#cfe8ff', align: 'center', wordWrap: { width: inner } }).setOrigin(0.5, 0))
      // séparateur
      items.push(this.add.rectangle(x, fy + 98, inner, 1, WARM, 0.5))
      // stats
      items.push(this.add.text(x, fy + 108, `PV ${c.hp}    Mana ${c.mana ?? 0}`, { fontFamily: 'monospace', fontSize: '13px', color: '#ffd1d1' }).setOrigin(0.5, 0))
      items.push(this.add.text(x, fy + 128, `ATQ ${c.attack}    DEF ${c.defense}`, { fontFamily: 'monospace', fontSize: '13px', color: '#cfe0ff' }).setOrigin(0.5, 0))
      // attaque de base
      const atk = c.abilities.melee ? 'Mêlée (Espace)' : 'Distance (F)'
      items.push(this.add.text(x, fy + 152, `⚔ ${atk}`, { fontFamily: 'monospace', fontSize: '12px', color: '#9affc0' }).setOrigin(0.5, 0))
      // sort (nom + effet)
      items.push(this.add.text(x, fy + 172, `✦ ${c.spell.name}`, { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: '#9fd0ff' }).setOrigin(0.5, 0))
      items.push(this.add.text(x, fy + 192, c.spell.desc ?? '', { fontFamily: 'monospace', fontSize: '11px', color: '#d7e6f5', align: 'center', wordWrap: { width: inner } }).setOrigin(0.5, 0))
      box.on('pointerover', () => box.setStrokeStyle(3, 0xffd27a))
      box.on('pointerout', () => box.setStrokeStyle(2, WARM))
      box.on('pointerdown', () => {
        this.classKey = c.key
        this.heroIndex = 0
        this.showHeroStep()
      })
      S.add(items)
    })

    this.button(S, cw / 2, ch - 34, 150, 'Retour', () => this.scene.start('MenuScene'))
  }

  // ---------------- Étape 2 : l'apparence ----------------
  showHeroStep() {
    this.clearStep()
    const cw = this.cw
    const ch = this.ch
    const S = this.step
    const cls = CLASSES[this.classKey]

    S.add(this.add.text(cw / 2, 30, '2. Choisis ton apparence', { fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5))
    S.add(this.add.text(cw / 2, 60, `Classe : ${cls.name}  ·  ${cls.kit}`, { fontFamily: 'monospace', fontSize: '12px', color: '#9affc0' }).setOrigin(0.5))

    // 3 apparences de la classe (idle animé), cliquables
    this.heroCells = []
    const heroes = cls.heroes
    const gap = 150
    const startX = cw / 2 - ((heroes.length - 1) * gap) / 2
    const hy = ch / 2 - 30
    heroes.forEach((h, i) => {
      const x = startX + i * gap
      const box = this.add.rectangle(x, hy, 96, 96, 0x1a2030, 1).setStrokeStyle(3, DIM).setInteractive({ useHandCursor: true })
      const spr = this.add.sprite(x, hy + 2, h.key, 0)
      spr.anims.play(`${h.key}-idle-down`)
      const name = this.add.text(x, hy + 60, h.name, { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff' }).setOrigin(0.5)
      // FACESET en GRAND dans la carte + perso animé en PETIT (coin bas-droit) — les 4 classes
      if (this.textures.exists('face_' + h.key)) {
        const face = this.add.image(x, hy, 'face_' + h.key).setScale(2.3)
        spr.setScale(2).setPosition(x + 30, hy + 28)
        S.add([box, face, spr, name])
      } else {
        spr.setScale(4.5)
        S.add([box, spr, name])
      }
      box.on('pointerdown', () => {
        this.heroIndex = i
        this.refreshHeroes()
      })
      this.heroCells.push(box)
    })

    // --- champ pseudo (saisie clavier) ---
    const ny = ch / 2 + 72
    const fieldW = 300
    const fieldH = 36
    const padL = 14
    S.add(this.add.text(cw / 2, ny - 26, 'Ton pseudo (obligatoire)', { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(0.5))
    // cadre du champ
    this.nameBox = this.add.rectangle(cw / 2, ny + 4, fieldW, fieldH, 0x10151f, 1).setStrokeStyle(2, GOLD)
    S.add(this.nameBox)
    const left = cw / 2 - fieldW / 2 + padL
    // texte saisi (aligné à gauche)
    this.nameText = this.add.text(left, ny + 4, '', { fontFamily: 'monospace', fontSize: '17px', color: '#ffffff' }).setOrigin(0, 0.5)
    S.add(this.nameText)
    // texte indicatif quand vide
    this.namePlaceholder = this.add.text(left, ny + 4, 'Tape ton nom…', { fontFamily: 'monospace', fontSize: '15px', color: '#566375' }).setOrigin(0, 0.5)
    S.add(this.namePlaceholder)
    // curseur clignotant
    this.caret = this.add.rectangle(left, ny + 4, 2, 20, 0xffe066).setOrigin(0, 0.5)
    S.add(this.caret)
    this.caretTween = this.tweens.add({ targets: this.caret, alpha: 0, duration: 480, yoyo: true, repeat: -1 })
    // compteur de caractères
    this.counter = this.add.text(cw / 2 + fieldW / 2 - 8, ny + 4, '', { fontFamily: 'monospace', fontSize: '10px', color: '#6b7d92' }).setOrigin(1, 0.5)
    S.add(this.counter)
    this.nameHint = this.add.text(cw / 2, ny + 30, 'Ce nom s’affichera au-dessus de ton personnage (toi et les autres joueurs).', { fontFamily: 'monospace', fontSize: '9px', color: '#6b8caa' }).setOrigin(0.5)
    S.add(this.nameHint)

    this.button(S, cw / 2 - 90, ch - 40, 150, 'Retour', () => this.showClassStep())
    this.startBtn = this.button(S, cw / 2 + 90, ch - 40, 150, 'Commencer', () => this.start())

    this.refreshHeroes()
    this.updateNameField()
  }

  /** Le pseudo est-il valide ? (au moins 1 caractère non-espace) */
  nameValid() {
    return this.heroName.trim().length >= 1
  }

  /** Active/grise le bouton Commencer selon la présence d'un pseudo. */
  refreshStartButton() {
    if (!this.startBtn) return
    const ok = this.nameValid()
    this.startBtn.bg.setStrokeStyle(2, ok ? GOLD : 0x3a4659)
    this.startBtn.bg.setFillStyle(ok ? 0x1a2233 : 0x141a24, 1)
    this.startBtn.txt.setColor(ok ? '#ffffff' : '#5d6b7d')
    this.startBtn.enabled = ok
  }

  /** Refuse le départ sans pseudo : secoue le champ + message rouge. */
  warnName() {
    if (this.nameHint) this.nameHint.setText('⚠ Choisis un pseudo pour entrer dans le jeu').setColor('#ff6b6b')
    if (this.nameBox) {
      const x0 = this.nameBox.x
      this.tweens.add({ targets: this.nameBox, x: x0 - 6, duration: 50, yoyo: true, repeat: 3, onComplete: () => this.nameBox.setX(x0) })
    }
  }

  refreshHeroes() {
    this.heroCells.forEach((b, i) => b.setStrokeStyle(3, i === this.heroIndex ? GOLD : DIM))
  }

  onKey(e) {
    if (this.classKey == null) return // saisie du nom seulement à l'étape 2
    if (e.key === 'Backspace') this.heroName = this.heroName.slice(0, -1)
    else if (e.key === 'Enter') {
      this.start()
      return
    } else if (e.key.length === 1 && this.heroName.length < 12 && /[\p{L}0-9 '-]/u.test(e.key)) {
      this.heroName += e.key
    }
    this.updateNameField()
  }

  start() {
    if (this.classKey == null) return
    if (!this.nameValid()) {
      this.warnName() // pseudo obligatoire
      return
    }
    const character = {
      hero: CLASSES[this.classKey].heroes[this.heroIndex].key,
      name: this.heroName.trim(),
      classKey: this.classKey,
    }
    this.scene.stop('GameScene') // arrête l'aperçu du village avant de lancer la vraie partie
    this.scene.start('GameScene', { character })
  }

  button(container, x, y, w, label, cb) {
    const h = 38
    const bg = this.add.rectangle(x, y, w, h, 0x1a2233, 1).setStrokeStyle(2, GOLD)
    const txt = this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff' }).setOrigin(0.5)
    const zone = this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true })
    const btn = { bg, txt, zone, enabled: true }
    zone.on('pointerover', () => {
      if (btn.enabled === false) return // pas de survol si grisé
      bg.setFillStyle(0x26344b, 1)
      txt.setColor('#ffe066')
    })
    zone.on('pointerout', () => {
      if (btn.enabled === false) return
      bg.setFillStyle(0x1a2233, 1)
      txt.setColor('#ffffff')
    })
    zone.on('pointerdown', cb)
    container.add([bg, txt, zone])
    return btn
  }
}
