import Phaser from 'phaser'
import { hasSave, loadSave } from '../data/save.js'

// thème "Ninja Adventure" : titre sur bande sombre + scène de village (herbe claire)
const DARK = 0x141b1b
const BTN = 0x3b2a1e
const BTN_HOVER = 0x553926
const BORDER = 0xe0913c
const HOUSE_COLS = 33

/** Écran d'accueil : titre + petit village in-game avec le ninja qui s'y balade. */
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    const cw = this.scale.width
    const ch = this.scale.height

    // --- sol herbe clair sur tout l'écran (lumineux, ambiance in-game) ---
    this.add.tileSprite(0, 0, cw, ch, 'field', 21).setOrigin(0, 0).setDepth(0)

    // --- chemin de terre où le ninja marche ---
    const pathY = ch * 0.56
    this.add.tileSprite(0, pathY, cw, 38, 'field', 6).setOrigin(0, 0.5).setDepth(1)

    // --- décor de village ---
    this.drawHouse(cw / 2 - 60, ch * 0.2, 2.5) // maison au fond
    this.drawTree(cw * 0.1, ch * 0.26, 2.6)
    this.drawTree(cw * 0.84, ch * 0.24, 2.6)
    this.drawTree(cw * 0.26, ch * 0.12, 2.1)
    this.drawTree(cw * 0.68, ch * 0.1, 2.1)
    // touffes de fleurs/herbes le long du chemin
    for (const [fx, fy, f] of [[cw * 0.18, pathY + 26, 264], [cw * 0.4, pathY + 30, 240], [cw * 0.62, pathY + 28, 265], [cw * 0.8, pathY + 30, 241]]) {
      this.add.image(fx, fy, 'nature', f).setScale(2).setDepth(2)
    }

    // --- ninja qui marche sur le chemin (va-et-vient) ---
    const hero = this.add.sprite(cw * 0.32, pathY - 6, 'hero_green', 0).setScale(3.4).setDepth(3)
    hero.anims.play('hero_green-walk-right')
    const shadow = this.add.ellipse(cw * 0.32, pathY + 22, 44, 12, 0x000000, 0.28).setDepth(2)
    this.heroTween = this.tweens.add({
      targets: [hero, shadow], // l'ombre suit le ninja
      x: cw * 0.66,
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: 'Linear',
      onYoyo: () => hero.anims.play('hero_green-walk-left', true),
      onRepeat: () => hero.anims.play('hero_green-walk-right', true),
    })

    // --- bande sombre + titre en haut (comme la cover du pack) ---
    const bandH = Math.max(90, ch * 0.2)
    this.add.rectangle(0, 0, cw, bandH, DARK, 0.92).setOrigin(0, 0).setDepth(10)
    this.add.rectangle(0, bandH, cw, 3, BORDER, 0.8).setOrigin(0, 0).setDepth(10)
    const logo = this.add.image(cw / 2, bandH / 2, 'title_logo').setOrigin(0.5).setDepth(11)
    logo.setScale(Math.min((cw * 0.78) / logo.width, bandH * 0.7 / logo.height))

    // --- boutons (panneau translucide pour la lisibilité sur l'herbe) ---
    const buttons = [{ label: 'Nouvelle partie', cb: () => this.scene.start('CharacterScene') }]
    if (hasSave()) {
      const s = loadSave()
      const who = s?.character?.name ? `Continuer — ${s.character.name} (Niv.${s.level ?? 1})` : 'Continuer'
      buttons.push({ label: who, cb: () => this.scene.start('GameScene', { save: loadSave() }) })
    }
    buttons.push({ label: 'Quitter', cb: () => this.quit() })

    const startY = ch * 0.7
    const panelH = buttons.length * 52 + 16
    this.add.rectangle(cw / 2, startY + (buttons.length - 1) * 26, 340, panelH, DARK, 0.55).setStrokeStyle(2, BORDER).setDepth(11)
    let y = startY
    for (const b of buttons) {
      this.button(cw / 2, y, 300, b.label, b.cb)
      y += 52
    }

    this.add.text(cw / 2, ch - 16, 'Pixel art : Ninja Adventure (CC0)', { fontFamily: 'monospace', fontSize: '10px', color: '#fff7e6', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(12)
  }

  /** Dessine une maison (bloc cottage du tileset 'house') à (x,y), échelle `s`. */
  drawHouse(x, y, s) {
    const t = 16 * s
    const col = 26
    const row = 0
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const frame = (row + dy) * HOUSE_COLS + (col + dx)
        this.add.image(x + dx * t, y + dy * t, 'house', frame).setOrigin(0, 0).setScale(s).setDepth(2)
      }
    }
  }

  /** Dessine un arbre vert (bloc 2×2 du tileset 'nature') à (x,y), échelle `s`. */
  drawTree(x, y, s) {
    const t = 16 * s
    const frames = [[0, 0, 0], [1, 1, 0], [0, 24, 1], [1, 25, 1]] // [dx, frame, dy]
    for (const [dx, frame, dy] of frames) {
      this.add.image(x + dx * t, y + dy * t, 'nature', frame).setOrigin(0, 0).setScale(s).setDepth(2)
    }
  }

  /** Bouton chaud avec survol + clic. */
  button(x, y, w, label, cb) {
    const h = 42
    const bg = this.add.rectangle(x, y, w, h, BTN, 1).setStrokeStyle(2, BORDER).setDepth(12)
    const txt = this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#ffe0b0' }).setOrigin(0.5).setDepth(13)
    const zone = this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(13)
    zone.on('pointerover', () => {
      bg.setFillStyle(BTN_HOVER, 1)
      bg.setStrokeStyle(2, 0xffd27a)
      txt.setColor('#fff6df')
    })
    zone.on('pointerout', () => {
      bg.setFillStyle(BTN, 1)
      bg.setStrokeStyle(2, BORDER)
      txt.setColor('#ffe0b0')
    })
    zone.on('pointerdown', cb)
  }

  quit() {
    window.close()
    this.add.text(this.scale.width / 2, this.scale.height - 44, 'Pour quitter, ferme l’onglet du navigateur.', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd27a', backgroundColor: '#000000aa', padding: { x: 6, y: 4 } }).setOrigin(0.5).setDepth(20)
  }
}
