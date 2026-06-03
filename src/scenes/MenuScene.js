import Phaser from 'phaser'
import { hasSave, loadSave } from '../data/save.js'
import { Audio } from '../data/sound.js'

// Écran d'accueil : le menu (titre + boutons) est posé PAR-DESSUS le VRAI village du jeu,
// affiché en fond par GameScene en mode "aperçu" (vivant : PNJ qui se baladent, héros au centre).
const DARK = 0x141b1b
const BTN = 0x3b2a1e
const BTN_HOVER = 0x553926
const BORDER = 0xe0913c

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    const cw = this.scale.width
    const ch = this.scale.height

    // --- village vivant en fond (GameScene en aperçu) ---
    // ne pas le relancer si on revient ici via un resize (il tourne déjà)
    if (!this.scene.isActive('GameScene')) this.scene.launch('GameScene', { preview: true })
    this.scene.bringToTop() // le menu reste au-dessus du village

    Audio.playMusic(this, 'mus_menu') // thème d'accueil (démarre au 1er clic si autoplay verrouillé)

    // léger voile global pour la lisibilité des boutons sur la map claire
    this.add.rectangle(0, 0, cw, ch, 0x0a0a14, 0.12).setOrigin(0, 0).setDepth(0)

    // --- titre en haut (SANS bandeau : contour + ombre suffisent à le détacher du village) ---
    const titleSize = Math.round(Phaser.Math.Clamp(cw / 13, 26, 52))
    this.add
      .text(cw / 2, Math.max(46, ch * 0.09), 'The Last Adventure', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: `${titleSize}px`,
        fontStyle: 'bold',
        color: '#ffd86b',
        stroke: '#2a1606',
        strokeThickness: 7,
        shadow: { offsetX: 0, offsetY: 3, color: '#000000', blur: 6, fill: true },
      })
      .setOrigin(0.5)
      .setDepth(11)

    // --- boutons ---
    // Nouvelle partie : on NE coupe PAS le village -> il reste en fond de la création (continuité)
    const buttons = [{ label: 'Nouvelle partie', cb: () => this.scene.start('IntroScene') }]
    if (hasSave()) {
      const s = loadSave()
      const who = s?.character?.name ? `Continuer — ${s.character.name} (Niv.${s.level ?? 1})` : 'Continuer'
      buttons.push({ label: who, cb: () => this.startGame({ save: loadSave() }) })
    }
    buttons.push({ label: 'Quitter', cb: () => this.quit() })

    const startY = ch * 0.66
    const step = 66
    const panelH = buttons.length * step + 22
    this.add.rectangle(cw / 2, startY + ((buttons.length - 1) * step) / 2, 410, panelH, DARK, 0.6).setStrokeStyle(2, BORDER).setDepth(10)
    let y = startY
    for (const b of buttons) {
      this.button(cw / 2, y, 370, b.label, b.cb)
      y += step
    }

    this.add
      .text(cw / 2, ch - 14, 'Pixel art : Ninja Adventure (CC0)', { fontFamily: 'monospace', fontSize: '10px', color: '#fff7e6', stroke: '#000', strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(11)

    // relayout propre du menu si la fenêtre change (sans relancer le village)
    this.scale.on('resize', this.onResize, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this))
  }

  onResize() {
    if (this.scene.isActive('MenuScene')) this.scene.restart()
  }

  /** Stoppe l'aperçu du village puis exécute la navigation (évite un GameScene fantôme). */
  go(fn) {
    this.scene.stop('GameScene')
    fn()
  }

  /** Lance la vraie partie : on stoppe l'aperçu puis on démarre GameScene en mode jeu. */
  startGame(data) {
    this.scene.stop('GameScene')
    this.scene.start('GameScene', data)
  }

  /** Bouton chaud avec survol + clic. */
  button(x, y, w, label, cb) {
    const h = 54
    const bg = this.add.rectangle(x, y, w, h, BTN, 1).setStrokeStyle(2, BORDER).setDepth(11)
    const txt = this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold', color: '#ffe0b0' }).setOrigin(0.5).setDepth(12)
    const zone = this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(12)
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
    this.add
      .text(this.scale.width / 2, this.scale.height - 44, 'Pour quitter, ferme l’onglet du navigateur.', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffd27a',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(12)
  }
}
