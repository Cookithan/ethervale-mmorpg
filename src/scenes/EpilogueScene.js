import Phaser from 'phaser'
import { Audio } from '../data/sound.js'

// ÉPILOGUE de "Island of Ergas" — séquence de victoire jouée à la chute de DARGOTH (fin de la quête principale).
// Overlay atmosphérique par-dessus GameScene (en pause) ; « Continuer » rend la main (jeu post-game ouvert).
const EPILOGUE = [
  'Dargoth s’effondre. Sa flamme maudite vacille, puis s’éteint dans un dernier râle qui fait trembler Sargèr jusqu’aux racines.',
  'Le voile de cendres qui pesait sur l’île se déchire. Pour la première fois depuis des siècles, la lumière touche ces terres damnées.',
  'Par-delà le détroit, à Ergas, les anciens lèvent les yeux : l’horizon n’est plus noir. Une aube pâle se devine.',
  'Les légendes disaient qu’un héros viendrait. Elles ne disaient pas qu’il serait seul, ni qu’il n’aurait jamais renoncé.',
  'Ergas connaît l’aube — et ton nom se murmure désormais parmi ceux qui ne sont jamais revenus. Sauf toi.',
]

export default class EpilogueScene extends Phaser.Scene {
  constructor() {
    super('EpilogueScene')
  }

  create() {
    const cw = this.scale.width
    const ch = this.scale.height
    Audio.playVictory?.(this, 'mus_victory')

    // voile sombre qui monte en fondu (laisse une lueur d'aube chaude en haut)
    this.add.rectangle(0, 0, cw, ch, 0x080a0f, 1).setOrigin(0, 0)
    const dawn = this.add.rectangle(cw / 2, 0, cw, ch * 0.5, 0xffb060, 0.0).setOrigin(0.5, 0)
    this.tweens.add({ targets: dawn, fillAlpha: 0.12, duration: 4000, ease: 'Sine.inOut' })

    this.add.text(cw / 2, Math.max(48, ch * 0.1), 'L’Aube d’Ergas', {
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${Math.round(Phaser.Math.Clamp(cw / 16, 24, 44))}px`,
      fontStyle: 'bold', color: '#ffd86b', stroke: '#2a1606', strokeThickness: 6, shadow: { offsetX: 0, offsetY: 3, color: '#000000', blur: 6, fill: true },
    }).setOrigin(0.5)

    const tw = Math.min(680, cw - 48)
    let y = ch * 0.22
    const texts = []
    EPILOGUE.forEach((para) => {
      const t = this.add.text(cw / 2, y, para, {
        fontFamily: 'Georgia, serif', fontSize: `${Math.round(Phaser.Math.Clamp(cw / 42, 16, 22))}px`,
        color: '#ece3d2', align: 'center', wordWrap: { width: tw }, lineSpacing: 6,
      }).setOrigin(0.5, 0).setAlpha(0)
      texts.push(t)
      y += t.height + 28
    })

    const btnY = Math.min(ch - 46, y + 26)
    const bg = this.add.rectangle(cw / 2, btnY, 240, 44, 0x3b2a1e, 1).setStrokeStyle(2, 0xe0913c).setAlpha(0)
    const label = this.add.text(cw / 2, btnY, 'Continuer', { fontFamily: 'Georgia, serif', fontSize: '17px', fontStyle: 'bold', color: '#ffe9b0' }).setOrigin(0.5).setAlpha(0)
    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => bg.setFillStyle(0x553926))
    bg.on('pointerout', () => bg.setFillStyle(0x3b2a1e))
    const done = () => { Audio.sfx('ui_accept', { detune: 0 }); this.scene.resume('GameScene'); this.scene.stop() } // rend la main au jeu (post-game)
    bg.on('pointerdown', done)

    let shown = 0
    let autoTimer = null
    const showButton = () => this.tweens.add({ targets: [bg, label], alpha: 1, duration: 500 })
    const revealNext = () => {
      autoTimer?.remove(); autoTimer = null
      if (shown >= texts.length) { showButton(); return }
      this.tweens.add({ targets: texts[shown], alpha: 1, duration: 900, ease: 'Sine.out' })
      shown++
      if (shown < texts.length) autoTimer = this.time.delayedCall(2600, revealNext)
      else this.time.delayedCall(1200, showButton)
    }

    this.add.text(cw / 2, ch - 16, 'Clic : phrase suivante  ·  Entrée : continuer', { fontFamily: 'monospace', fontSize: '10px', color: '#8a93a0' }).setOrigin(0.5)
    this.input.keyboard.on('keydown-ENTER', done)
    this.input.on('pointerdown', (p, over) => { if (!over.includes(bg)) revealNext() })
    revealNext()
  }
}
