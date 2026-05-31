import Phaser from 'phaser'
import { SLOTS, SLOT_LABELS, describeStats, RARITY } from '../data/items.js'

// palette UI (style WoW lisible)
const GOLD = 0xc8a24a
const PANEL = 0x10141c
const CELL = 0x2a3346
const CELL_BORDER = 0x49617f

/**
 * UIScene — interface façon WoW, rendue dans sa propre caméra (zoom 1).
 * - Cadre du héros en haut à gauche (portrait + vie + niveau + or).
 * - Barre d'XP fine en bas, pleine largeur.
 * - Sac toujours visible en bas à droite.
 * - Fiche personnage (touche C) : équipement (paper-doll) + stats, jeu en pause.
 */
export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene')
  }

  create() {
    this.game_ = this.scene.get('GameScene')
    this.staticObjects = []
    this.bagObjects = []
    this.charObjects = []
    this.builtInvVersion = -1
    this.charOpen = false
    this.frameRect = null
    this.xpRect = null
    this.bagRect = null

    // infobulle d'objet (au-dessus de l'icône survolée)
    this.tip = this.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#000000dd',
        padding: { x: 5, y: 4 },
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(200)
      .setVisible(false)

    this.buildHud()

    // entrées UI
    this.input.keyboard.on('keydown-C', () => this.toggleChar())
    this.input.keyboard.on('keydown-ESC', () => this.charOpen && this.closeChar())

    // mort
    this.game_.events.on('gameover', this.showGameOver, this)
    this.events.once('shutdown', () => this.game_.events.off('gameover', this.showGameOver, this))

    // reconstruit l'UI au redimensionnement
    this.scale.on('resize', () => this.rebuildHud())
  }

  // ---------- construction HUD ----------

  buildHud() {
    const reg = (o) => {
      this.staticObjects.push(o)
      return o
    }
    const cw = this.scale.width
    const ch = this.scale.height

    // aide (haut-centre)
    reg(
      this.add
        .text(cw / 2, 8, 'Clic = aller  ·  Espace = épée  ·  F = tir  ·  C = perso', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffffff',
          backgroundColor: '#00000099',
          padding: { x: 5, y: 3 },
        })
        .setOrigin(0.5, 0)
    )

    // --- cadre du héros (haut-gauche) ---
    const fx = 10
    const fy = 10
    const fw = 214
    const fh = 70
    reg(this.add.rectangle(fx, fy, fw, fh, PANEL, 0.85).setOrigin(0, 0).setStrokeStyle(2, GOLD))
    this.frameRect = new Phaser.Geom.Rectangle(fx, fy, fw, fh)

    // portrait (sprite du héros)
    const pSize = 50
    const px = fx + 10
    const py = fy + 10
    reg(this.add.rectangle(px, py, pSize, pSize, 0x000000, 0.5).setOrigin(0, 0).setStrokeStyle(2, GOLD))
    const portrait = reg(this.add.image(px + pSize / 2, py + pSize / 2, 'player', 0))
    portrait.setScale((pSize - 8) / portrait.width)

    // vie + niveau + or à droite du portrait
    const tx = px + pSize + 10
    this.lvlText = reg(this.add.text(tx, fy + 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffe066' }).setOrigin(0, 0))
    const hpW = 132
    const hpH = 16
    const hpY = fy + 28
    reg(this.add.rectangle(tx - 1, hpY - 1, hpW + 2, hpH + 2, 0x000000, 0.6).setOrigin(0, 0))
    this.hpBarW = hpW
    this.hpBar = reg(this.add.rectangle(tx, hpY, hpW, hpH, 0x4caf50).setOrigin(0, 0))
    this.hpText = reg(
      this.add
        .text(tx + hpW / 2, hpY + hpH / 2, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5)
    )
    this.goldText = reg(this.add.text(tx, fy + 50, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd84d' }).setOrigin(0, 0))

    // --- barre d'XP (bas, pleine largeur) ---
    const xpH = 16
    const xpY = ch - xpH
    reg(this.add.rectangle(0, xpY, cw, xpH, 0x000000, 0.55).setOrigin(0, 0))
    this.xpBarFullW = cw
    this.xpBarH = xpH
    this.xpBarY = xpY
    this.xpBar = reg(this.add.rectangle(0, xpY, 0, xpH, 0xa335ee).setOrigin(0, 0))
    this.xpText = reg(this.add.text(cw / 2, xpY + xpH / 2, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff' }).setOrigin(0.5))
    this.xpRect = new Phaser.Geom.Rectangle(0, xpY, cw, xpH)

    // --- sac (bas-droite, reconstruit selon le contenu) ---
    this.builtInvVersion = -1
  }

  rebuildHud() {
    this.staticObjects.forEach((o) => o.destroy())
    this.staticObjects = []
    this.destroyBag()
    if (this.charOpen) this.destroyChar()
    this.buildHud()
    if (this.charOpen) this.buildCharPanel()
  }

  // ---------- sac (toujours visible) ----------

  destroyBag() {
    this.bagObjects.forEach((o) => o.destroy())
    this.bagObjects = []
  }

  buildBag() {
    const p = this.game_.player
    if (!p) return
    this.destroyBag()
    const reg = (o) => {
      this.bagObjects.push(o)
      return o
    }
    const cw = this.scale.width

    // hotbar horizontale centrée en bas (style Fortnite)
    const cell = 42
    const gap = 6
    const pad = 6
    const minSlots = 6
    const n = p.inventory.length
    const maxSlots = Math.max(minSlots, Math.floor((cw - 100) / (cell + gap)))
    const display = Math.max(minSlots, Math.min(n, maxSlots)) // nb d'emplacements affichés
    const overflow = Math.max(0, n - display)

    const rowW = display * cell + (display - 1) * gap
    const panelW = rowW + pad * 2
    const panelH = cell + pad * 2
    const panelX = cw / 2 - panelW / 2
    const panelY = this.xpBarY - 6 - panelH

    reg(this.add.rectangle(panelX, panelY, panelW, panelH, PANEL, 0.82).setOrigin(0, 0).setStrokeStyle(2, GOLD))
    this.bagRect = new Phaser.Geom.Rectangle(panelX, panelY, panelW, panelH)

    const gy = panelY + panelH / 2
    const gx = panelX + pad + cell / 2
    for (let i = 0; i < display; i++) {
      const bx = gx + i * (cell + gap)
      const item = p.inventory[i]
      const border = item ? RARITY[item.rarity]?.tint ?? CELL_BORDER : CELL_BORDER
      reg(this.add.rectangle(bx, gy, cell, cell, CELL, 1).setStrokeStyle(item ? 2 : 1, border))
      if (!item) continue
      const c = reg(this.add.rectangle(bx, gy, cell, cell, 0x000000, 0).setInteractive({ useHandCursor: true }))
      reg(this.addIcon(bx, gy, item.icon, cell - 12))
      c.on('pointerdown', () => {
        p.equip(item)
        this.hideTip()
      })
      c.on('pointerover', () => this.showTip(item, bx, gy - cell / 2))
      c.on('pointerout', () => this.hideTip())
    }
    if (overflow > 0) {
      reg(this.add.text(panelX + panelW + 6, gy, `+${overflow}`, { fontFamily: 'monospace', fontSize: '13px', color: '#ffe066' }).setOrigin(0, 0.5))
    }
  }

  // ---------- fiche personnage (touche C) ----------

  toggleChar() {
    if (this.game_.gameOver) return
    if (this.charOpen) this.closeChar()
    else this.openChar()
  }

  openChar() {
    this.charOpen = true
    this.scene.pause('GameScene')
    this.buildCharPanel()
  }

  closeChar() {
    this.charOpen = false
    this.destroyChar()
    this.hideTip()
    this.scene.resume('GameScene')
  }

  destroyChar() {
    this.charObjects.forEach((o) => o.destroy())
    this.charObjects = []
  }

  buildCharPanel() {
    const p = this.game_.player
    if (!p) return
    this.destroyChar()
    const reg = (o) => {
      this.charObjects.push(o)
      return o
    }
    const cw = this.scale.width
    const ch = this.scale.height

    reg(this.add.rectangle(0, 0, cw, ch, 0x000000, 0.55).setOrigin(0, 0))
    const W = 300
    const H = 300
    const x0 = cw / 2 - W / 2
    const y0 = ch / 2 - H / 2
    reg(this.add.rectangle(cw / 2, ch / 2, W, H, PANEL, 0.97).setStrokeStyle(2, GOLD))
    reg(this.add.text(cw / 2, y0 + 14, 'Personnage', { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff' }).setOrigin(0.5, 0))

    // portrait au centre
    const cx = cw / 2
    const pSize = 64
    const pY = y0 + 96
    reg(this.add.rectangle(cx, pY, pSize, pSize, 0x000000, 0.5).setStrokeStyle(2, GOLD))
    const portrait = reg(this.add.image(cx, pY, 'player', 0))
    portrait.setScale((pSize - 10) / portrait.width)

    // 3 slots autour du portrait (paper-doll) : Arme à gauche, Armure à droite, Accessoire dessous
    const cellSz = 48
    const place = {
      weapon: { x: cx - 96, y: pY, lx: cx - 96, ly: pY - cellSz / 2 - 12 },
      armor: { x: cx + 96, y: pY, lx: cx + 96, ly: pY - cellSz / 2 - 12 },
      accessory: { x: cx, y: pY + 84, lx: cx, ly: pY + 84 + cellSz / 2 + 4 },
    }
    SLOTS.forEach((slot) => {
      const pos = place[slot]
      reg(this.add.text(pos.lx, pos.ly, SLOT_LABELS[slot], { fontFamily: 'monospace', fontSize: '11px', color: '#9fb6cc' }).setOrigin(0.5))
      const item = p.equipped[slot]
      const border = item ? RARITY[item.rarity]?.tint ?? GOLD : GOLD
      const c = reg(this.add.rectangle(pos.x, pos.y, cellSz, cellSz, CELL, 1).setStrokeStyle(2, border))
      if (item) {
        reg(this.addIcon(pos.x, pos.y, item.icon, cellSz - 14))
        c.setInteractive({ useHandCursor: true })
        c.on('pointerdown', () => {
          p.unequip(slot)
          this.hideTip()
        })
        c.on('pointerover', () => this.showTip(item, pos.x, pos.y - cellSz / 2))
        c.on('pointerout', () => this.hideTip())
      }
    })

    // stats
    const sY = y0 + H - 64
    reg(
      this.add
        .text(cx, sY, `Attaque ${p.attackPower}     Défense ${p.defense}     PV ${p.hp}/${p.maxHp}`, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#cfe8ff',
        })
        .setOrigin(0.5)
    )
    reg(this.add.text(cx, y0 + H - 16, 'Clic objet du sac = équiper  ·  clic slot = retirer  ·  C = fermer', { fontFamily: 'monospace', fontSize: '9px', color: '#9fb6cc' }).setOrigin(0.5))
  }

  // ---------- helpers ----------

  pointerOverInventory(x, y) {
    const inside = (r) => r && Phaser.Geom.Rectangle.Contains(r, x, y)
    return inside(this.bagRect) || inside(this.frameRect) || inside(this.xpRect)
  }

  addIcon(x, y, key, fit) {
    const img = this.add.image(x, y, key)
    img.setScale(fit / Math.max(img.width, img.height))
    return img
  }

  showTip(item, centerX, topY) {
    const r = RARITY[item.rarity]
    this.tip.setColor(r ? r.color : '#ffffff')
    this.tip.setText(`${item.name}\n${describeStats(item.stats)}`).setPosition(centerX, topY - 4).setVisible(true)
  }

  hideTip() {
    this.tip.setVisible(false)
  }

  // ---------- update ----------

  update() {
    const p = this.game_?.player
    if (!p) return

    const ratio = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1)
    this.hpBar.setSize(this.hpBarW * ratio, 16)
    this.hpBar.fillColor = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xff9800 : 0xe23b3b
    this.hpText.setText(`${p.hp} / ${p.maxHp}`)
    this.lvlText.setText(p.level >= 10 ? 'Niveau 10 (MAX)' : `Niveau ${p.level}`)
    this.goldText.setText(`Or : ${p.gold}`)

    const xpRatio = p.level >= 10 ? 1 : Phaser.Math.Clamp(p.xp / p.xpToNext, 0, 1)
    this.xpBar.setSize(this.xpBarFullW * xpRatio, this.xpBarH)
    this.xpText.setText(p.level >= 10 ? 'XP MAX' : `XP ${p.xp} / ${p.xpToNext}`)

    if (p.invVersion !== this.builtInvVersion) {
      this.builtInvVersion = p.invVersion
      this.buildBag()
      if (this.charOpen) this.buildCharPanel()
    }
  }

  showGameOver(level) {
    const cw = this.scale.width
    const ch = this.scale.height

    const veil = this.add.rectangle(0, 0, cw, ch, 0x000000, 0).setOrigin(0, 0).setDepth(150)
    this.tweens.add({ targets: veil, fillAlpha: 0.7, duration: 500 })

    const panel = this.add.rectangle(cw / 2, ch / 2, 240, 110, 0x1a1a1a, 0.96).setDepth(150)
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
      .setDepth(151)
    this.tweens.add({ targets: title, scale: { from: 0.6, to: 1 }, ease: 'Back.out', duration: 450 })

    this.add
      .text(cw / 2, ch / 2 + 4, `Niveau atteint : ${level}`, { fontFamily: 'monospace', fontSize: '12px', color: '#dddddd' })
      .setOrigin(0.5)
      .setDepth(151)

    const hint = this.add
      .text(cw / 2, ch / 2 + 32, 'Clique pour recommencer', { fontFamily: 'monospace', fontSize: '12px', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(151)
    this.tweens.add({ targets: hint, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 })

    this.input.once('pointerdown', () => {
      this.game_.scene.restart()
      this.scene.restart()
    })
  }
}
