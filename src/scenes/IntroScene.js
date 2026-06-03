import Phaser from 'phaser'
import { Audio } from '../data/sound.js'

// Prologue de "The Last Adventure" (monde d'Iroas) — affiché à la création d'une nouvelle partie.
// Ton atmosphérique, peu de noms : juste Iroas + le rôle du joueur.
const PROLOGUE = [
  "Il fut un temps où Iroas brillait : un royaume d'îles et de forêts, gardé par des héros que nul ne croyait mortels.",
  'Puis le monde se brisa. La terre se fendit en domaines hostiles, et ceux qui veillaient sur Iroas se changèrent en monstres.',
  'Les héros partirent les affronter. Aucun ne revint.',
  "Aujourd'hui, il ne reste qu'un village au creux d'une clairière, cerné de ruines et de mers sombres. Et toi.",
  "Pas un élu. Pas un roi. Juste celui qui n'a pas renoncé.",
]

export default class IntroScene extends Phaser.Scene {
  constructor() {
    super('IntroScene')
  }

  create() {
    const cw = this.scale.width
    const ch = this.scale.height

    // fond sombre plein écran (couvre l'aperçu du village) + léger vignettage
    this.add.rectangle(0, 0, cw, ch, 0x080a0f, 0.97).setOrigin(0, 0)

    // titre du jeu
    this.add
      .text(cw / 2, Math.max(50, ch * 0.11), 'The Last Adventure', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: `${Math.round(Phaser.Math.Clamp(cw / 16, 24, 44))}px`,
        fontStyle: 'bold',
        color: '#ffd86b',
        stroke: '#2a1606',
        strokeThickness: 6,
        shadow: { offsetX: 0, offsetY: 3, color: '#000000', blur: 6, fill: true },
      })
      .setOrigin(0.5)

    // prologue : paragraphes qui apparaissent en fondu, l'un après l'autre
    const tw = Math.min(620, cw - 60)
    let y = ch * 0.24
    const texts = []
    PROLOGUE.forEach((para) => {
      const t = this.add
        .text(cw / 2, y, para, {
          fontFamily: 'Georgia, serif',
          fontSize: '15px',
          color: '#e9e0cf',
          align: 'center',
          wordWrap: { width: tw },
          lineSpacing: 4,
        })
        .setOrigin(0.5, 0)
        .setAlpha(0)
      texts.push(t)
      y += t.height + 16
    })
    // apparition en cascade
    texts.forEach((t, i) => {
      this.tweens.add({ targets: t, alpha: 1, duration: 700, delay: 300 + i * 600, ease: 'Sine.out' })
    })

    // bouton "Commencer l'aventure" (apparaît après le prologue)
    const btnY = Math.min(ch - 50, y + 36)
    const bw = 240
    const bh = 44
    const bg = this.add.rectangle(cw / 2, btnY, bw, bh, 0x3b2a1e, 1).setStrokeStyle(2, 0xe0913c).setAlpha(0)
    const label = this.add.text(cw / 2, btnY, "Commencer l'aventure", { fontFamily: 'Georgia, serif', fontSize: '17px', fontStyle: 'bold', color: '#ffe9b0' }).setOrigin(0.5).setAlpha(0)
    const startDelay = 300 + PROLOGUE.length * 600 + 400
    this.tweens.add({ targets: [bg, label], alpha: 1, duration: 500, delay: startDelay })
    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => bg.setFillStyle(0x553926))
    bg.on('pointerout', () => bg.setFillStyle(0x3b2a1e))
    const begin = () => {
      Audio.sfx('ui_accept', { detune: 0 })
      this.scene.start('CharacterScene')
    }
    bg.on('pointerdown', begin)

    // aide : passer (clic ailleurs révèle tout de suite le bouton, ou Entrée commence)
    this.add.text(cw / 2, ch - 16, 'Entrée : commencer  ·  clic : tout afficher', { fontFamily: 'monospace', fontSize: '10px', color: '#8a93a0' }).setOrigin(0.5)
    this.input.keyboard.on('keydown-ENTER', begin)
    // un clic dans le vide révèle immédiatement prologue + bouton (skip de l'animation)
    this.input.on('pointerdown', (p, over) => {
      if (over.includes(bg)) return
      this.tweens.killTweensOf([...texts, bg, label])
      texts.forEach((t) => t.setAlpha(1))
      bg.setAlpha(1)
      label.setAlpha(1)
    })
  }
}
