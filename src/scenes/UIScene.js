import Phaser from 'phaser'

/**
 * UIScene — interface superposée au jeu, rendue dans sa PROPRE caméra (zoom 1).
 * Indispensable : la caméra de GameScene a un zoom x3 qui déforme aussi les
 * objets scrollFactor(0). Une scène dédiée garde l'UI nette et bien placée.
 * Lit l'état du joueur directement depuis GameScene.
 */
export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene')
  }

  create() {
    this.game_ = this.scene.get('GameScene')

    const PAD = 8
    const BAR_W = 120
    const BAR_H = 12

    // --- barre de vie ---
    this.add
      .rectangle(PAD - 2, PAD - 2, BAR_W + 4, BAR_H + 4, 0x000000, 0.6)
      .setOrigin(0, 0)
    this.barW = BAR_W
    this.hpBar = this.add.rectangle(PAD, PAD, BAR_W, BAR_H, 0x4caf50).setOrigin(0, 0)
    this.hpText = this.add
      .text(PAD + BAR_W / 2, PAD + BAR_H / 2, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
        stroke: '#000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)

    // --- niveau / XP ---
    this.lvlText = this.add
      .text(PAD, PAD + BAR_H + 6, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffe066',
        backgroundColor: '#00000088',
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0, 0)

    // --- aide en bas ---
    this.add
      .text(PAD, this.scale.height - PAD, 'Clic = aller   ·   Espace = attaquer', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 5, y: 3 },
      })
      .setOrigin(0, 1)

    // garde l'aide collée en bas même si la fenêtre est redimensionnée
    this.scale.on('resize', (size) => {
      // rien d'obligatoire ici pour le MVP ; placeholder si besoin plus tard
    })

    // écoute la mort envoyée par GameScene
    this.game_.events.on('gameover', this.showGameOver, this)
    // nettoyage à l'arrêt (évite les listeners en double sur restart)
    this.events.once('shutdown', () => this.game_.events.off('gameover', this.showGameOver, this))
  }

  showGameOver(level) {
    const cw = this.scale.width
    const ch = this.scale.height

    const veil = this.add.rectangle(0, 0, cw, ch, 0x000000, 0).setOrigin(0, 0)
    this.tweens.add({ targets: veil, fillAlpha: 0.7, duration: 500 })

    const panel = this.add.rectangle(cw / 2, ch / 2, 240, 110, 0x1a1a1a, 0.96)
    panel.setStrokeStyle(2, 0xe23b3b)

    const title = this.add
      .text(cw / 2, ch / 2 - 28, 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ff4444',
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: title, scale: { from: 0.6, to: 1 }, ease: 'Back.out', duration: 450 })

    this.add
      .text(cw / 2, ch / 2 + 4, `Niveau atteint : ${level}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#dddddd',
      })
      .setOrigin(0.5)

    const hint = this.add
      .text(cw / 2, ch / 2 + 32, 'Clique pour recommencer', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffe066',
      })
      .setOrigin(0.5)
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 })

    this.input.once('pointerdown', () => {
      this.game_.scene.restart()
      this.scene.restart()
    })
  }

  update() {
    const p = this.game_?.player
    if (!p) return
    const ratio = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1)
    this.hpBar.setSize(this.barW * ratio, 12)
    this.hpBar.fillColor = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xff9800 : 0xe23b3b
    this.hpText.setText(`${p.hp} / ${p.maxHp}`)
    this.lvlText.setText(
      p.level >= 10 ? 'Niv 10 (MAX)' : `Niv ${p.level}    XP ${p.xp}/${p.xpToNext}`
    )
  }
}
