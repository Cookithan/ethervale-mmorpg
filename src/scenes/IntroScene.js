import Phaser from 'phaser'
import { Audio } from '../data/sound.js'

// Prologue de "The Last Adventure" (monde d'Iroas) — affiché à la création d'une nouvelle partie.
// Ton atmosphérique, peu de noms : juste Iroas + le rôle du joueur.
const PROLOGUE = [
  "Il fut un temps où Iroas brillait : un royaume d'îles et de forêts, gardé par des héros que nul ne croyait mortels.",
  'Puis le monde se brisa. La terre se fendit en domaines hostiles, et ceux qui veillaient sur Iroas se changèrent en monstres.',
  'Les héros partirent les affronter. Aucun ne revint.',
  "Aujourd'hui, il ne reste qu'un village au creux d'une clairière, cerné de ruines et de mers sombres. Et toi.",
  'Choisis ta voie : Guerrier, Tank, Mage ou Soigneur.',
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
    const tw = Math.min(680, cw - 48)
    let y = ch * 0.22
    const texts = []
    PROLOGUE.forEach((para) => {
      const t = this.add
        .text(cw / 2, y, para, {
          fontFamily: 'Georgia, serif',
          fontSize: `${Math.round(Phaser.Math.Clamp(cw / 42, 16, 22))}px`,
          color: '#ece3d2',
          align: 'center',
          wordWrap: { width: tw },
          lineSpacing: 6,
        })
        .setOrigin(0.5, 0)
        .setAlpha(0)
      texts.push(t)
      y += t.height + 30 // paragraphes bien espacés
    })
    // bouton "Commencer l'aventure" (créé caché, révélé une fois le prologue terminé)
    const btnY = Math.min(ch - 46, y + 30)
    const bg = this.add.rectangle(cw / 2, btnY, 240, 44, 0x3b2a1e, 1).setStrokeStyle(2, 0xe0913c).setAlpha(0)
    const label = this.add.text(cw / 2, btnY, "Commencer l'aventure", { fontFamily: 'Georgia, serif', fontSize: '17px', fontStyle: 'bold', color: '#ffe9b0' }).setOrigin(0.5).setAlpha(0)
    bg.setInteractive({ useHandCursor: true })
    bg.on('pointerover', () => bg.setFillStyle(0x553926))
    bg.on('pointerout', () => bg.setFillStyle(0x3b2a1e))
    const begin = () => { Audio.sfx('ui_accept', { detune: 0 }); this.scene.start('CharacterScene') }
    bg.on('pointerdown', begin)

    // RÉVÉLATION paragraphe par paragraphe (visual-novel) : LENTE (3 s) en auto, et un clic AVANCE d'un
    // seul paragraphe (sans tout sauter). Le bouton n'apparaît qu'à la dernière phrase.
    let shown = 0
    let autoTimer = null
    const showButton = () => this.tweens.add({ targets: [bg, label], alpha: 1, duration: 500 })
    const revealNext = () => {
      autoTimer?.remove()
      autoTimer = null
      if (shown >= texts.length) { showButton(); return }
      this.tweens.add({ targets: texts[shown], alpha: 1, duration: 800, ease: 'Sine.out' })
      shown++
      if (shown < texts.length) autoTimer = this.time.delayedCall(2200, revealNext)
      else this.time.delayedCall(1000, showButton)
    }

    this.add.text(cw / 2, ch - 16, 'Clic : phrase suivante  ·  Entrée : commencer', { fontFamily: 'monospace', fontSize: '10px', color: '#8a93a0' }).setOrigin(0.5)
    this.input.keyboard.on('keydown-ENTER', begin)
    this.input.on('pointerdown', (p, over) => { if (!over.includes(bg)) revealNext() }) // clic = paragraphe suivant

    revealNext() // affiche le 1er paragraphe tout de suite
  }
}
