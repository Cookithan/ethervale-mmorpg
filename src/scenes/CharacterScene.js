import Phaser from 'phaser'
import { HEROES, CLASS_LIST } from '../data/classes.js'

const GOLD = 0xc8a24a
const DIM = 0x49617f

/** Création du personnage : apparence + nom + classe. */
export default class CharacterScene extends Phaser.Scene {
  constructor() {
    super('CharacterScene')
  }

  create() {
    const cw = this.scale.width
    const ch = this.scale.height
    this.add.rectangle(0, 0, cw, ch, 0x0e1118).setOrigin(0, 0)
    this.add.text(cw / 2, 26, 'Crée ton héros', { fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5)

    this.heroIndex = 0
    this.classKey = 'warrior'
    this.heroName = ''

    // --- apparence ---
    this.add.text(cw / 2, 78, 'Apparence', { fontFamily: 'monospace', fontSize: '14px', color: '#9fb6cc' }).setOrigin(0.5)
    this.heroCells = []
    const gap = 60
    const startX = cw / 2 - ((HEROES.length - 1) * gap) / 2
    HEROES.forEach((h, i) => {
      const x = startX + i * gap
      const y = 122
      const box = this.add.rectangle(x, y, 48, 48, 0x1a2030, 1).setStrokeStyle(2, DIM).setInteractive({ useHandCursor: true })
      const spr = this.add.sprite(x, y + 2, h.key, 0).setScale(2.4)
      spr.anims.play(`${h.key}-idle-down`)
      box.on('pointerdown', () => {
        this.heroIndex = i
        this.refresh()
      })
      this.heroCells.push(box)
    })

    // --- nom (saisie clavier) ---
    this.add.text(cw / 2, 168, 'Nom (tape au clavier)', { fontFamily: 'monospace', fontSize: '14px', color: '#9fb6cc' }).setOrigin(0.5)
    this.add.rectangle(cw / 2, 196, 220, 30, 0x1a2030, 1).setStrokeStyle(2, GOLD)
    this.nameText = this.add.text(cw / 2, 196, this.heroName || '_', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' }).setOrigin(0.5)
    this.input.keyboard.on('keydown', (e) => this.onKey(e))

    // --- classe ---
    this.add.text(cw / 2, 238, 'Classe', { fontFamily: 'monospace', fontSize: '14px', color: '#9fb6cc' }).setOrigin(0.5)
    this.classCells = []
    CLASS_LIST.forEach((c, i) => {
      const x = cw / 2 + (i - 1) * 156
      const y = 300
      const box = this.add.rectangle(x, y, 144, 78, 0x1a2030, 1).setStrokeStyle(2, DIM).setInteractive({ useHandCursor: true })
      this.add.text(x, y - 24, c.name, { fontFamily: 'monospace', fontSize: '14px', color: '#ffe066' }).setOrigin(0.5)
      this.add.text(x, y - 2, c.desc, { fontFamily: 'monospace', fontSize: '9px', color: '#cfe8ff', align: 'center', wordWrap: { width: 134 } }).setOrigin(0.5)
      this.add.text(x, y + 24, `PV ${c.hp} · ATQ ${c.attack} · DEF ${c.defense}`, { fontFamily: 'monospace', fontSize: '9px', color: '#9fb6cc' }).setOrigin(0.5)
      box.on('pointerdown', () => {
        this.classKey = c.key
        this.refresh()
      })
      this.classCells.push({ box, key: c.key })
    })

    // --- boutons ---
    this.button(cw / 2 - 90, ch - 44, 150, 'Retour', () => this.scene.start('MenuScene'))
    this.button(cw / 2 + 90, ch - 44, 150, 'Commencer', () => this.start())

    this.refresh()
  }

  onKey(e) {
    if (e.key === 'Backspace') this.heroName = this.heroName.slice(0, -1)
    else if (e.key === 'Enter') {
      this.start()
      return
    } else if (e.key.length === 1 && this.heroName.length < 12 && /[\p{L}0-9 '-]/u.test(e.key)) {
      this.heroName += e.key
    }
    this.nameText.setText(this.heroName || '_')
  }

  refresh() {
    this.heroCells.forEach((b, i) => b.setStrokeStyle(2, i === this.heroIndex ? GOLD : DIM))
    this.classCells.forEach((c) => c.box.setStrokeStyle(2, c.key === this.classKey ? GOLD : DIM))
  }

  start() {
    const character = {
      hero: HEROES[this.heroIndex].key,
      name: (this.heroName || 'Héros').trim() || 'Héros',
      classKey: this.classKey,
    }
    this.scene.start('GameScene', { character })
  }

  button(x, y, w, label, cb) {
    const h = 38
    const bg = this.add.rectangle(x, y, w, h, 0x1a2233, 1).setStrokeStyle(2, GOLD)
    const txt = this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff' }).setOrigin(0.5)
    const zone = this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => {
      bg.setFillStyle(0x26344b, 1)
      txt.setColor('#ffe066')
    })
    zone.on('pointerout', () => {
      bg.setFillStyle(0x1a2233, 1)
      txt.setColor('#ffffff')
    })
    zone.on('pointerdown', cb)
  }
}
