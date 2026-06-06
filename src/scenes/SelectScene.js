import Phaser from 'phaser'
import { listCharacters, deleteCharacter, MAX_CHARACTERS } from '../data/save.js'
import { CLASSES } from '../data/classes.js'
import { drawHall } from './hallBackdrop.js'
import { Audio } from '../data/sound.js'

// Écran de SÉLECTION DE PERSONNAGE (façon WoW) : décor de SALLE EN PIERRE (module partagé `drawHall`),
// GRAND perso à gauche (le sélectionné, qui ENTRE en marchant), LISTE à droite. Persos INDÉPENDANTS.
const DARK = 0x141b1b
const BTN = 0x3b2a1e
const BTN_HOVER = 0x553926
const BORDER = 0xe0913c

export default class SelectScene extends Phaser.Scene {
  constructor() {
    super('SelectScene')
  }

  create() {
    const cw = this.scale.width
    const ch = this.scale.height
    if (!this.scene.isActive('GameScene')) this.scene.launch('GameScene', { preview: true })
    this.scene.bringToTop()
    Audio.playMusic(this, 'mus_menu')

    drawHall(this) // DÉCOR partagé : salle en pierre (mur + sol + alcôve + piliers + torches + verdure)

    // TITRE sur une plaque de bois à liseré d'or
    this.woodPanel(cw / 2, Math.max(42, ch * 0.072), 390, 58)
    this.add
      .text(cw / 2, Math.max(42, ch * 0.072), 'Tes personnages', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '32px', fontStyle: 'bold', color: '#ffd86b', stroke: '#2a1606', strokeThickness: 6,
        shadow: { offsetX: 0, offsetY: 3, color: '#000', blur: 6, fill: true },
      })
      .setOrigin(0.5).setDepth(12)

    this.chars = listCharacters()
    this.selIndex = 0
    this.previewObjs = []
    this.rows = []
    this.buildList()
    this.showSelected()

    this.bigButton(cw / 2, ch - 42, 220, 'Retour', () => { Audio.sfx('ui_cancel', { detune: 0 }); this.scene.start('MenuScene') }, 0x2a2018)

    this.scale.on('resize', this.onResize, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this))
  }

  onResize() {
    if (this.scene.isActive('SelectScene')) this.scene.restart()
  }

  /** Plaque de BOIS à double liseré d'or + rivets dorés (cadre médiéval). */
  woodPanel(x, y, w, h) {
    this.add.rectangle(x, y, w, h, 0x2a1c10, 0.95).setStrokeStyle(3, 0xc8923c).setDepth(10)
    this.add.rectangle(x, y, w - 8, h - 8, 0x000000, 0).setStrokeStyle(1, 0x6a4a1e, 0.8).setDepth(10)
    for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.add.circle(x + ox * (w / 2 - 9), y + oy * (h / 2 - 9), 3, 0xe0b85a).setStrokeStyle(1, 0x6a4a1e).setDepth(11)
    }
  }

  /** LISTE à droite : une ligne par perso (PORTRAIT + nom + classe·niveau, clic = sélectionne) + ligne « Créer ». */
  buildList() {
    const cw = this.scale.width
    const ch = this.scale.height
    const lx = cw * 0.74
    const w = Math.min(344, cw * 0.42)
    const top = ch * 0.24
    const step = 58
    const rh = 50
    const count = this.chars.length + (this.chars.length < MAX_CHARACTERS ? 1 : 0)
    this.woodPanel(lx, top + (count * step) / 2 - step / 2, w + 30, count * step + 30)
    let y = top
    this.chars.forEach((c, i) => {
      const s = c.save || {}
      const cls = CLASSES[s.character?.classKey]
      const hero = s.character?.hero || 'hero_knight'
      const bg = this.add.rectangle(lx, y, w, rh, BTN, 0.0).setStrokeStyle(1, 0x6a4a1e, 0.6).setDepth(10)
      // PORTRAIT (faceset) encadré d'or
      const fx = lx - w / 2 + 30
      const frame = this.add.rectangle(fx, y, 44, 44, 0x10151f, 1).setStrokeStyle(2, 0xc8923c).setDepth(11)
      if (this.textures.exists('face_' + hero)) this.add.image(fx, y, 'face_' + hero).setDepth(11)
      // nom (gros) + classe · niveau (dessous)
      const tName = this.add.text(lx - w / 2 + 60, y - 9, s.character?.name ?? 'Héros', { fontFamily: 'Georgia, serif', fontSize: '17px', fontStyle: 'bold', color: '#ffe9b8' }).setOrigin(0, 0.5).setDepth(11)
      const tSub = this.add.text(lx - w / 2 + 60, y + 11, `${cls?.name ?? '?'} · Niv.${s.level ?? 1}`, { fontFamily: 'monospace', fontSize: '12px', color: '#bcd4ee' }).setOrigin(0, 0.5).setDepth(11)
      const zone = this.add.rectangle(lx, y, w, rh, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(11)
      zone.on('pointerover', () => { if (i !== this.selIndex) bg.setFillStyle(BTN_HOVER, 0.5) })
      zone.on('pointerout', () => { if (i !== this.selIndex) bg.setFillStyle(BTN, 0.0) })
      zone.on('pointerdown', () => { Audio.sfx('ui_accept', { detune: -200 }); this.setSel(i) })
      this.rows.push({ i, bg, frame, tName, tSub })
      y += step
    })
    if (this.chars.length < MAX_CHARACTERS) {
      const bg = this.add.rectangle(lx, y, w, rh, 0x1b3a24, 0.5).setStrokeStyle(1, 0x3a6a44, 0.8).setDepth(10)
      this.add.text(lx, y, '＋  Créer un personnage', { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#bdf0c6' }).setOrigin(0.5).setDepth(11)
      const zone = this.add.rectangle(lx, y, w, rh, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(11)
      zone.on('pointerover', () => bg.setFillStyle(0x265233, 0.7))
      zone.on('pointerout', () => bg.setFillStyle(0x1b3a24, 0.5))
      zone.on('pointerdown', () => this.createChar(this.chars.length))
    }
    this.highlightRows()
  }

  setSel(i) {
    this.selIndex = i
    this.highlightRows()
    this.showSelected()
  }

  highlightRows() {
    for (const r of this.rows) {
      const on = r.i === this.selIndex
      r.bg.setFillStyle(on ? 0x3a2c1c : BTN, on ? 0.9 : 0.0)
      r.bg.setStrokeStyle(on ? 2 : 1, on ? 0xffd27a : 0x6a4a1e, on ? 1 : 0.6)
      r.frame?.setStrokeStyle(2, on ? 0xffe08a : 0xc8923c)
      r.tName.setColor(on ? '#fff3d2' : '#ffe9b8')
      r.tSub.setColor(on ? '#d8e6f7' : '#bcd4ee')
    }
  }

  /** GRAND perso central (le sélectionné) : ENTRE en marchant depuis la gauche, puis idle + respiration + flourish (10 s). */
  showSelected() {
    const cw = this.scale.width
    const ch = this.scale.height
    this._flourishEv?.remove()
    this._flourishEv = null
    this.previewObjs.forEach((o) => { this.tweens.killTweensOf(o); o.destroy() })
    this.previewObjs = []
    const reg = (o) => { this.previewObjs.push(o); return o }
    const px = cw * 0.34
    const feetY = ch * 0.6

    if (this.chars.length === 0) {
      reg(this.add.text(px, ch * 0.45, 'Aucun personnage.\nCrée ton héros →', { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#e8d6b0', align: 'center', lineSpacing: 8 }).setOrigin(0.5).setDepth(12))
      return
    }
    const c = this.chars[Math.min(this.selIndex, this.chars.length - 1)]
    const s = c.save || {}
    const cls = CLASSES[s.character?.classKey]
    const hero = s.character?.hero || 'hero_knight'
    const shadow = reg(this.add.ellipse(px, feetY + 6, 120, 28, 0x000000, 0.5).setDepth(11).setAlpha(0))
    reg(this.add.image(px, feetY - 70, 'sel_glow').setScale(1.7).setTint(0xffd9a0).setAlpha(0.13).setBlendMode(Phaser.BlendModes.ADD).setDepth(11)) // lumière chaude DOUCE
    const spr = reg(this.add.sprite(px, feetY, hero).setScale(9).setOrigin(0.5, 1).setDepth(12))
    const idleA = `${hero}-idle-down`
    const atkA = `${hero}-attack-down`
    const walkA = `${hero}-walk-right`
    // ENTRÉE : arrive en marchant depuis la gauche (fondu) -> idle face caméra + respiration + flourish
    spr.setAlpha(0).setX(px - 155)
    if (this.anims.exists(walkA)) spr.play(walkA)
    else if (this.anims.exists(idleA)) spr.play(idleA)
    this.tweens.add({ targets: [spr, shadow], alpha: 1, duration: 240 })
    this.tweens.add({
      targets: spr,
      x: px,
      duration: 480,
      ease: 'Sine.inOut',
      onComplete: () => {
        if (!spr.active) return
        if (this.anims.exists(idleA)) spr.play(idleA)
        this.tweens.add({ targets: spr, scaleY: 9 * 1.035, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' }) // respiration
        if (this.anims.exists(atkA)) {
          this._flourishEv = this.time.addEvent({
            delay: 10000,
            loop: true,
            callback: () => {
              if (!spr.active) return
              spr.anims.timeScale = 0.4 // geste RALENTI
              spr.play(atkA)
              spr.once('animationcomplete', () => {
                if (!spr.active) return
                spr.anims.timeScale = 1
                if (this.anims.exists(idleA)) spr.play(idleA)
              })
            },
          })
        }
      },
    })
    reg(this.add.text(px, feetY + 38, s.character?.name ?? 'Héros', { fontFamily: 'Georgia, serif', fontSize: '30px', fontStyle: 'bold', color: '#ffe9b8', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5, 0).setDepth(12))
    reg(this.add.text(px, feetY + 74, `${cls?.name ?? '?'}  ·  Niveau ${s.level ?? 1}`, { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#d8c596', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 0).setDepth(12))
    this.previewButton(reg, px - 84, ch * 0.88, 162, 'Jouer', () => this.play(c), 0x2c5a2f)
    this.previewButton(reg, px + 84, ch * 0.88, 162, '✖ Supprimer', () => this.confirmDelete(c), 0x7a2c2c)
  }

  previewButton(reg, x, y, w, label, cb, color) {
    const h = 46
    const bg = reg(this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(2, BORDER).setDepth(12))
    const txt = reg(this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#ffe6c0' }).setOrigin(0.5).setDepth(13))
    const zone = reg(this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(13))
    zone.on('pointerover', () => { bg.setStrokeStyle(2, 0xffd27a); txt.setColor('#fff6df') })
    zone.on('pointerout', () => { bg.setStrokeStyle(2, BORDER); txt.setColor('#ffe6c0') })
    zone.on('pointerdown', cb)
  }

  play(c) {
    Audio.sfx('ui_accept', { detune: 0 })
    this.scene.stop('GameScene')
    this.scene.start('GameScene', { charId: c.id, save: c.save })
  }

  createChar(count) {
    Audio.sfx('ui_accept', { detune: 0 })
    this.scene.start(count === 0 ? 'IntroScene' : 'CharacterScene')
  }

  confirmDelete(c) {
    const cw = this.scale.width
    const ch = this.scale.height
    const objs = []
    const reg = (o) => { objs.push(o); return o }
    const close = () => objs.forEach((o) => o.destroy())
    reg(this.add.rectangle(0, 0, cw, ch, 0x000000, 0.66).setOrigin(0, 0).setDepth(50).setInteractive())
    reg(this.add.rectangle(cw / 2, ch / 2, 460, 200, DARK, 0.98).setStrokeStyle(2, BORDER).setDepth(51))
    reg(this.add.text(cw / 2, ch / 2 - 44, `Supprimer ${c.save?.character?.name ?? 'ce personnage'} ?\nCette action est DÉFINITIVE.`, { fontFamily: 'monospace', fontSize: '15px', color: '#ffd0d0', align: 'center', lineSpacing: 6 }).setOrigin(0.5).setDepth(52))
    this.modalBtn(reg, cw / 2 - 104, ch / 2 + 48, 188, 'Supprimer', () => { Audio.sfx('ui_cancel', { detune: 0 }); deleteCharacter(c.id); close(); this.scene.restart() })
    this.modalBtn(reg, cw / 2 + 104, ch / 2 + 48, 188, 'Annuler', () => { Audio.sfx('ui_cancel', { detune: 0 }); close() })
  }

  bigButton(x, y, w, label, cb, color = BTN) {
    const h = 46
    const bg = this.add.rectangle(x, y, w, h, color, 1).setStrokeStyle(2, BORDER).setDepth(11)
    const txt = this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#ffe0b0' }).setOrigin(0.5).setDepth(12)
    const zone = this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(12)
    zone.on('pointerover', () => { bg.setFillStyle(BTN_HOVER, 1); bg.setStrokeStyle(2, 0xffd27a); txt.setColor('#fff6df') })
    zone.on('pointerout', () => { bg.setFillStyle(color, 1); bg.setStrokeStyle(2, BORDER); txt.setColor('#ffe0b0') })
    zone.on('pointerdown', cb)
  }

  modalBtn(reg, x, y, w, label, cb) {
    const h = 46
    const bg = reg(this.add.rectangle(x, y, w, h, BTN, 1).setStrokeStyle(2, BORDER).setDepth(52))
    const txt = reg(this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '17px', fontStyle: 'bold', color: '#ffe0b0' }).setOrigin(0.5).setDepth(53))
    const zone = reg(this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(53))
    zone.on('pointerover', () => { bg.setFillStyle(BTN_HOVER, 1); txt.setColor('#fff6df') })
    zone.on('pointerout', () => { bg.setFillStyle(BTN, 1); txt.setColor('#ffe0b0') })
    zone.on('pointerdown', cb)
  }
}
