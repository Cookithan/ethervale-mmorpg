import Phaser from 'phaser'
import { SLOTS, SLOT_LABELS, describeStats, describeItem, RARITY, SHOP_STOCK, sellPrice, cloneItem, itemName, hasDurability, repairCost, upgradeCost, canEquip, classRestrictionLabel } from '../data/items.js'
import { Audio } from '../data/sound.js'

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
    this.shopOpen = false
    this.shopObjects = []
    this.dialogueOpen = false
    this.dialogueObjects = []
    this.forgeOpen = false
    this.forgeObjects = []
    this.pauseOpen = false
    this.pauseObjects = []
    this.mapOpen = false
    this.mapObjects = []
    this.shopTab = 'buy'
    this.toast = null
    this.zoneBanner = null
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

    // pseudo du héros : dessiné ICI (scène non-zoomée) puis projeté depuis la caméra de GameScene
    // chaque frame -> reste net et stable (pas de scintillement comme en espace-monde zoomé ×3).
    this.playerNameplate = this.add
      .text(0, 0, this.game_.character?.name ?? 'Héros', {
        fontFamily: 'monospace', fontSize: '13px', color: '#7cfc9a',
        stroke: '#000000', strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(150)
      .setVisible(false)

    // entrées UI
    this.input.keyboard.on('keydown-C', () => this.toggleChar())
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.dialogueOpen) this.closeDialogue()
      else if (this.forgeOpen) this.closeForge()
      else if (this.charOpen) this.closeChar()
      else if (this.shopOpen) this.closeShop()
      else if (this.mapOpen) this.closeMap()
      else if (this.pauseOpen) this.closePause()
      else this.openPause() // rien d'ouvert -> menu pause
    })
    // M : carte du monde plein écran (toggle)
    this.input.keyboard.on('keydown-M', () => {
      if (this.mapOpen) this.closeMap()
      else if (!this.dialogueOpen && !this.forgeOpen && !this.charOpen && !this.shopOpen && !this.pauseOpen) this.openMap()
    })
    // E / Espace : avance le dialogue (et le ferme à la dernière phrase)
    this.input.keyboard.on('keydown-E', () => {
      if (this.dialogueOpen) this.advanceDialogue()
    })
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.dialogueOpen) this.advanceDialogue()
    })

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

    // aide (haut-centre) — adaptée aux capacités de la classe
    const ab = this.game_.player?.abilities ?? { melee: true, ranged: false, heal: false }
    const spell = this.game_.player?.spell
    const parts = ['Clic = aller']
    if (ab.melee) parts.push('Espace = attaque')
    if (ab.ranged) parts.push('F = attaque')
    if (spell) parts.push(`1 = ${spell.name}`)
    parts.push('C = perso', 'M = carte', 'Échap = menu')
    reg(
      this.add
        .text(cw / 2, 8, parts.join(' · '), {
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
    const portrait = reg(this.add.image(px + pSize / 2, py + pSize / 2, this.game_.player?.heroKey ?? 'player', 0))
    portrait.setScale((pSize - 8) / portrait.width)

    // vie + mana + niveau + or à droite du portrait
    const tx = px + pSize + 10
    this.lvlText = reg(this.add.text(tx, fy + 4, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffe066' }).setOrigin(0, 0))
    const hpW = 132
    const hpH = 13
    const hpY = fy + 20
    reg(this.add.rectangle(tx - 1, hpY - 1, hpW + 2, hpH + 2, 0x000000, 0.6).setOrigin(0, 0))
    this.hpBarW = hpW
    this.hpBarH = hpH
    this.hpBar = reg(this.add.rectangle(tx, hpY, hpW, hpH, 0x4caf50).setOrigin(0, 0))
    this.hpText = reg(
      this.add
        .text(tx + hpW / 2, hpY + hpH / 2, '', { fontFamily: 'monospace', fontSize: '10px', color: '#ffffff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5)
    )
    // barre de MANA (bleue) juste sous la Vie
    const mpH = 9
    const mpY = hpY + hpH + 2
    reg(this.add.rectangle(tx - 1, mpY - 1, hpW + 2, mpH + 2, 0x000000, 0.6).setOrigin(0, 0))
    this.mpBarW = hpW
    this.mpBarH = mpH
    this.mpBar = reg(this.add.rectangle(tx, mpY, hpW, mpH, 0x3f86e0).setOrigin(0, 0))
    this.mpText = reg(
      this.add
        .text(tx + hpW / 2, mpY + mpH / 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#ffffff', stroke: '#000', strokeThickness: 2 })
        .setOrigin(0.5)
    )
    this.goldText = reg(this.add.text(tx, mpY + mpH + 3, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffd84d' }).setOrigin(0, 0))

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

    // --- BOUTONS DE COMBAT (bas-droite, à côté de la hotbar) : ATK + SORT ---
    // Visibles + CLIQUABLES (mobile ET PC). Affichent la TOUCHE, le coût en mana et le cooldown.
    // (`ab` et `spell` sont déjà définis plus haut dans buildHud.)
    const atkKey = ab.melee ? 'Espace' : 'F'
    const btn = 58
    const bgap = 8
    const byc = xpY - 8 - btn / 2 // centre Y, juste au-dessus de la barre d'XP
    const sortCx = cw - 14 - btn / 2
    const atkCx = sortCx - btn - bgap
    this.skillsRect = new Phaser.Geom.Rectangle(atkCx - btn / 2 - 2, byc - btn / 2 - 2, btn * 2 + bgap + 4, btn + 4)

    // bouton ATK (attaque de base, gratuite)
    reg(this.add.rectangle(atkCx, byc, btn, btn, PANEL, 0.92).setStrokeStyle(2, GOLD))
    reg(this.add.text(atkCx, byc - 11, 'ATK', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5))
    reg(this.add.text(atkCx, byc + 13, atkKey, { fontFamily: 'monospace', fontSize: '9px', color: '#ffe066' }).setOrigin(0.5))
    const atkHit = reg(this.add.rectangle(atkCx, byc, btn, btn, 0x000000, 0.001).setInteractive({ useHandCursor: true }))
    atkHit.on('pointerdown', (po, lx, ly, ev) => {
      ev?.stopPropagation?.()
      this.game_.basicAttack?.()
    })

    // bouton SORT (le sort de la classe) — nom + touche + coût mana + voile de cooldown
    reg(this.add.rectangle(sortCx, byc, btn, btn, 0x1a2740, 0.95).setStrokeStyle(2, 0x6fa8ff))
    reg(this.add.text(sortCx, byc - 16, spell ? spell.name : '—', { fontFamily: 'monospace', fontSize: '10px', color: '#cfe2ff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5))
    this.sortCostText = reg(this.add.text(sortCx, byc + 2, spell ? `${spell.cost} mana` : '', { fontFamily: 'monospace', fontSize: '9px', color: '#7fb3ff' }).setOrigin(0.5))
    reg(this.add.text(sortCx, byc + 15, 'Touche 1', { fontFamily: 'monospace', fontSize: '8px', color: '#ffe066' }).setOrigin(0.5))
    // voile de cooldown : rectangle sombre (ancré en haut) dont la hauteur fond quand le sort revient
    this.sortCdVeil = reg(this.add.rectangle(sortCx, byc - btn / 2, btn, 0, 0x000000, 0.62).setOrigin(0.5, 0))
    this.sortBtnSize = btn
    const sortHit = reg(this.add.rectangle(sortCx, byc, btn, btn, 0x000000, 0.001).setInteractive({ useHandCursor: true }))
    sortHit.on('pointerdown', (po, lx, ly, ev) => {
      ev?.stopPropagation?.()
      this.game_.castSpell?.()
    })

    // --- MINIMAP (haut-droite) : image schématique de la map ('mmtex'), fenêtre ZOOMÉE qui suit le joueur ---
    const mmSize = 150
    const mmMargin = 12
    const mmX = cw - mmSize - mmMargin
    const mmY = mmMargin
    this.mmGeom = { x: mmX, y: mmY, size: mmSize, tiles: 46 } // 46 tuiles visibles = zoom local
    reg(this.add.rectangle(mmX, mmY, mmSize, mmSize, 0x0a1018, 1).setOrigin(0, 0)) // fond sombre (zones hors-map)
    // masque = la fenêtre carrée fixe (partagé par l'image ET les points de mobs)
    const mmMaskG = reg(this.make.graphics({ add: false }))
    mmMaskG.fillStyle(0xffffff).fillRect(mmX, mmY, mmSize, mmSize)
    const mmMask = mmMaskG.createGeometryMask()
    this.minimapImg = this.textures.exists('mmtex') ? reg(this.add.image(mmX, mmY, 'mmtex').setOrigin(0, 0).setMask(mmMask)) : null
    this.minimapMobs = reg(this.add.graphics().setMask(mmMask)) // points des mobs (redessinés chaque frame)
    reg(this.add.rectangle(mmX, mmY, mmSize, mmSize, 0x000000, 0).setOrigin(0, 0).setStrokeStyle(2, GOLD)) // cadre
    this.minimapDot = reg(this.add.circle(mmX + mmSize / 2, mmY + mmSize / 2, 3.5, 0x53e0ff).setStrokeStyle(1.5, 0x06243a))
    // boussole N / S / E / O
    const compass = (tx, ty, label, ox, oy) => reg(this.add.text(tx, ty, label, { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#ffe8c2', stroke: '#000', strokeThickness: 3 }).setOrigin(ox, oy))
    compass(mmX + mmSize / 2, mmY + 1, 'N', 0.5, 0)
    compass(mmX + mmSize / 2, mmY + mmSize - 1, 'S', 0.5, 1)
    compass(mmX + mmSize - 2, mmY + mmSize / 2, 'E', 1, 0.5)
    compass(mmX + 2, mmY + mmSize / 2, 'O', 0, 0.5)
    reg(this.add.text(mmX + mmSize / 2, mmY + mmSize + 3, 'M = carte du monde', { fontFamily: 'monospace', fontSize: '9px', color: '#cfe8ff', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 0))

    // --- barre de BOSS (haut-centre, cachée hors combat de boss, style MMO) ---
    const bw = Math.min(440, cw * 0.62)
    const bcx = cw / 2
    const by = 56
    this.bossBarObjects = []
    const breg = (o) => {
      reg(o)
      this.bossBarObjects.push(o)
      return o
    }
    breg(this.add.rectangle(bcx, by, bw + 10, 48, 0x0c0f16, 0.85).setStrokeStyle(2, GOLD).setDepth(150))
    this.bossNameText = breg(
      this.add.text(bcx, by - 14, '', { fontFamily: 'Georgia, serif', fontSize: '15px', fontStyle: 'bold', color: '#ffd86b', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(151)
    )
    this.bossBarW = bw - 12
    breg(this.add.rectangle(bcx, by + 11, this.bossBarW + 4, 14, 0x000000, 0.7).setDepth(150))
    this.bossHpBar = breg(this.add.rectangle(bcx - this.bossBarW / 2, by + 11, this.bossBarW, 12, 0x9b1b1b).setOrigin(0, 0.5).setDepth(151))
    this.bossHpText = breg(
      this.add.text(bcx, by + 11, '', { fontFamily: 'monospace', fontSize: '9px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(152)
    )
    this.bossBarObjects.forEach((o) => o.setVisible(false))
    this.bossShown = false

    // --- sac (bas-droite, reconstruit selon le contenu) ---
    this.builtInvVersion = -1
  }

  /** Affiche/MAJ/masque la barre de boss selon le boss engagé côté GameScene. */
  updateBossBar(boss) {
    if (!this.bossBarObjects) return
    const live = boss && boss.active && boss.hp > 0
    if (!live) {
      if (this.bossShown) {
        this.bossBarObjects.forEach((o) => o.setVisible(false))
        this.bossShown = false
      }
      return
    }
    if (!this.bossShown) {
      this.bossBarObjects.forEach((o) => o.setVisible(true))
      this.bossShown = true
    }
    // BOSS DE RAID = intuable solo : on l'annonce clairement (icône crâne + couleur violette + sous-titre).
    const raid = boss.isRaid
    this.bossNameText.setText(`${raid ? '☠' : '⚔'} ${boss.displayName} · Niv.${boss.displayLevel ?? boss.level}`)
    this.bossNameText.setColor(raid ? '#d6a3ff' : '#ffd86b')
    this.bossHpBar.setFillStyle(raid ? 0x6a2bb5 : 0x9b1b1b)
    const ratio = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1)
    this.bossHpBar.setSize(this.bossBarW * ratio, 12)
    // on affiche TOUJOURS les PV (le joueur voit combien il a tapé) ; le raid garde son avertissement
    const hpTxt = `${Math.max(0, Math.round(boss.hp))} / ${boss.maxHp}`
    this.bossHpText.setText(raid ? `RAID · groupe requis · ${hpTxt}` : hpTxt)
  }

  rebuildHud() {
    this.staticObjects.forEach((o) => o.destroy())
    this.staticObjects = []
    this.destroyBag()
    if (this.charOpen) this.destroyChar()
    if (this.shopOpen) this.destroyShop()
    this.buildHud()
    if (this.charOpen) this.buildCharPanel()
    if (this.shopOpen) this.buildShop()
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
        // son PAR RÉSULTAT : validation si l'action aboutit, refus (throttlé) sinon -> pas de spam
        if (item.type === 'consumable') {
          this.useConsumable(item)
          Audio.sfx('ui_accept', { detune: 0 })
        } else if (!canEquip(item, p.className)) {
          this.showToast(classRestrictionLabel(item), '#e0a866')
          this.playDenied()
        } else if (p.equip(item)) {
          this.showItemToast('Équipé', item)
          Audio.sfx('ui_accept', { detune: 0 })
        } else {
          this.showToast('Objet cassé — à réparer chez Aldric', '#e06666')
          this.playDenied()
        }
        this.hideTip()
      })
      c.on('pointerover', () => this.showTip(item, bx, gy - cell / 2))
      c.on('pointerout', () => this.hideTip())
    }
    if (overflow > 0) {
      reg(this.add.text(panelX + panelW + 6, gy, `+${overflow}`, { fontFamily: 'monospace', fontSize: '13px', color: '#ffe066' }).setOrigin(0, 0.5))
    }
  }

  /** Boit une potion : soigne, retire l'objet du sac, toast. */
  useConsumable(item) {
    const p = this.game_.player
    if (this.game_.gameOver) return
    if (p.hp >= p.maxHp) {
      this.showToast('PV déjà au maximum', '#ffd84d')
      return
    }
    const healed = p.heal(item.heal ?? 0)
    p.removeItem(item) // retire la potion (invVersion++ -> le sac se reconstruit)
    this.showToast(`+${healed} PV`, '#6fdc6f')
  }

  // ---------- fiche personnage (touche C) ----------

  toggleChar() {
    if (this.game_.gameOver || this.pauseOpen) return
    if (this.charOpen) this.closeChar()
    else this.openChar()
  }

  openChar() {
    if (this.forgeOpen) this.closeForge()
    if (this.shopOpen) this.closeShop()
    this.charOpen = true
    this.scene.pause('GameScene')
    Audio.sfx('ui_accept', { detune: 0 })
    this.buildCharPanel()
  }

  closeChar() {
    this.charOpen = false
    this.destroyChar()
    this.hideTip()
    Audio.sfx('ui_cancel', { detune: 0 })
    this.scene.resume('GameScene')
  }

  /** Son de refus (action impossible : mauvaise classe, objet cassé…), THROTTLÉ pour ne pas spammer. */
  playDenied() {
    const now = this.time.now
    if (now < (this._deniedAt || 0)) return
    this._deniedAt = now + 400
    Audio.sfx('ui_cancel', { detune: 0 })
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
    const W = 320
    const H = 336
    const x0 = cw / 2 - W / 2
    const y0 = ch / 2 - H / 2
    reg(this.add.rectangle(cw / 2, ch / 2, W, H, PANEL, 0.97).setStrokeStyle(2, GOLD))
    const ch_ = this.game_.character ?? {}
    const clsName = { warrior: 'Guerrier', mage: 'Mage', tank: 'Tank', healer: 'Soigneur' }[p.className] ?? ''
    reg(this.add.text(cw / 2, y0 + 12, ch_.name ?? 'Personnage', { fontFamily: 'monospace', fontSize: '16px', color: '#ffe066' }).setOrigin(0.5, 0))
    reg(this.add.text(cw / 2, y0 + 32, `${clsName}  ·  Niveau ${p.level}`, { fontFamily: 'monospace', fontSize: '10px', color: '#9fb6cc' }).setOrigin(0.5, 0))

    // portrait au centre
    const cx = cw / 2
    const pSize = 60
    const pY = y0 + 110
    reg(this.add.rectangle(cx, pY, pSize, pSize, 0x000000, 0.5).setStrokeStyle(2, GOLD))
    const portrait = reg(this.add.image(cx, pY, this.game_.player?.heroKey ?? 'player', 0))
    portrait.setScale((pSize - 10) / portrait.width)

    // 4 slots autour du portrait (paper-doll) : Arme/Armure en haut (G/D), Casque/Anneau en bas (G/D)
    const cellSz = 46
    const dy = 32
    const place = {
      weapon: { x: cx - 96, y: pY - dy, lx: cx - 96, ly: pY - dy - cellSz / 2 - 9 },
      armor: { x: cx + 96, y: pY - dy, lx: cx + 96, ly: pY - dy - cellSz / 2 - 9 },
      focus: { x: cx - 96, y: pY + dy, lx: cx - 96, ly: pY + dy + cellSz / 2 + 9 },
      ring: { x: cx + 96, y: pY + dy, lx: cx + 96, ly: pY + dy + cellSz / 2 + 9 },
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
          Audio.sfx('ui_accept', { detune: 0 })
          p.unequip(slot)
          this.hideTip()
        })
        c.on('pointerover', () => this.showTip(item, pos.x, pos.y - cellSz / 2))
        c.on('pointerout', () => this.hideTip())
      }
    })

    // stats (totaux base + équipement), Mana inclus
    const sY = y0 + H - 62
    reg(this.add.text(cx, sY, `Attaque ${p.attackPower}      Défense ${p.defense}`, { fontFamily: 'monospace', fontSize: '13px', color: '#cfe8ff' }).setOrigin(0.5))
    reg(this.add.text(cx, sY + 19, `PV ${Math.round(p.hp)}/${p.maxHp}      Mana ${Math.round(p.mana)}/${p.maxMana}`, { fontFamily: 'monospace', fontSize: '13px', color: '#ffd1d1' }).setOrigin(0.5))
    reg(this.add.text(cx, y0 + H - 16, 'Clic objet du sac = équiper  ·  clic slot = retirer  ·  C = fermer', { fontFamily: 'monospace', fontSize: '9px', color: '#9fb6cc' }).setOrigin(0.5))
  }

  // ---------- boutique (marchand) ----------

  openShop() {
    if (this.game_.gameOver) return
    if (this.charOpen) this.closeChar()
    if (this.forgeOpen) this.closeForge()
    this.shopOpen = true
    this.shopTab = 'weapon' // onglet (catégorie) par défaut
    this.scene.pause('GameScene')
    Audio.playMusic(this, 'mus_shop') // thème "Fight" chez le marchand (restauré à la fermeture par GameScene.update)
    Audio.sfx('ui_accept', { detune: 0 })
    this.buildShop()
  }

  closeShop() {
    this.shopOpen = false
    this.destroyShop()
    this.hideTip()
    Audio.sfx('ui_cancel', { detune: 0 })
    this.scene.resume('GameScene')
  }

  destroyShop() {
    this.shopObjects.forEach((o) => o.destroy())
    this.shopObjects = []
  }

  buyItem(item) {
    const p = this.game_.player
    if (p.gold < item.price) return
    p.gold -= item.price
    p.addItem(cloneItem(item))
    this.buildShop()
  }

  sellItem(item) {
    const p = this.game_.player
    if (p.removeItem(item)) {
      p.gold += sellPrice(item)
      this.buildShop()
    }
  }

  buildShop() {
    const p = this.game_.player
    if (!p) return
    this.destroyShop()
    const reg = (o) => {
      this.shopObjects.push(o)
      return o
    }
    const cw = this.scale.width
    const ch = this.scale.height
    reg(this.add.rectangle(0, 0, cw, ch, 0x000000, 0.6).setOrigin(0, 0))
    const W = 500
    const H = 470
    const x0 = cw / 2 - W / 2
    const y0 = ch / 2 - H / 2
    reg(this.add.rectangle(cw / 2, ch / 2, W, H, PANEL, 0.98).setStrokeStyle(2, GOLD))
    this.drawPanelHeader(reg, x0, y0, W, 'merchant_face', undefined, 'Marchand', p.gold)

    // onglets par CATÉGORIE (+ Vendre) -> tout est rangé et entièrement visible
    const cats = [
      { key: 'weapon', label: 'Armes' },
      { key: 'armor', label: 'Armures' },
      { key: 'focus', label: 'Focus' },
      { key: 'ring', label: 'Anneaux' },
      { key: 'potion', label: 'Potions' },
      { key: 'sell', label: 'Vendre' },
    ]
    if (!cats.some((c) => c.key === this.shopTab)) this.shopTab = 'weapon'
    const tabY = y0 + 56
    const tabW = (W - 32) / cats.length
    cats.forEach((c, i) => this.drawTab(reg, x0 + 16 + i * tabW, tabY, c.label, this.shopTab === c.key, () => { this.shopTab = c.key; this.buildShop() }, tabW - 4))

    // items selon la catégorie (armes = uniquement celles utilisables par la classe -> on s'y retrouve)
    let items
    if (this.shopTab === 'sell') items = p.inventory
    else if (this.shopTab === 'potion') items = SHOP_STOCK.filter((it) => it.type === 'consumable')
    else items = SHOP_STOCK.filter((it) => it.slot === this.shopTab && (this.shopTab !== 'weapon' || canEquip(it, p.className)))
    const gridY = tabY + 32
    if (items.length === 0) {
      reg(this.add.text(cw / 2, gridY + 50, this.shopTab === 'sell' ? '(sac vide)' : '(rien dans cette catégorie)', { fontFamily: 'monospace', fontSize: '11px', color: '#7c8aa0' }).setOrigin(0.5))
    }
    this.drawCardGrid(reg, x0 + 16, gridY, W - 32, items, (item) => {
      if (this.shopTab === 'buy') {
        const aff = p.gold >= item.price
        return { text: `${item.price} or`, color: aff ? '#ffd84d' : '#e06666', onClick: () => this.buyItem(item) }
      }
      return { text: `+${sellPrice(item)} or`, color: '#ffd84d', onClick: () => this.sellItem(item) }
    })
    reg(this.add.text(cw / 2, y0 + H - 14, 'Clic une carte = acheter / vendre  ·  Échap = fermer', { fontFamily: 'monospace', fontSize: '10px', color: '#9fb6cc' }).setOrigin(0.5))
  }

  // ---------- helpers d'UI partagés (boutique + forge) ----------

  /** En-tête de panneau : portrait + nom + or. */
  drawPanelHeader(reg, x0, y0, W, portraitKey, frame, title, gold) {
    reg(this.add.rectangle(x0 + 30, y0 + 30, 42, 42, 0x000000, 0.4).setStrokeStyle(2, GOLD))
    const port = reg(this.add.image(x0 + 30, y0 + 30, portraitKey, frame))
    port.setScale(36 / Math.max(port.width, port.height))
    reg(this.add.text(x0 + 58, y0 + 16, title, { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff' }).setOrigin(0, 0))
    reg(this.add.text(x0 + W - 14, y0 + 18, `Or : ${gold}`, { fontFamily: 'monospace', fontSize: '14px', color: '#ffd84d' }).setOrigin(1, 0))
  }

  /** Onglet cliquable (actif = doré). */
  drawTab(reg, x, y, label, active, onClick, w = 96) {
    const h = 22
    reg(this.add.rectangle(x, y, w, h, active ? GOLD : 0x2a3340, 1).setOrigin(0, 0).setStrokeStyle(1, GOLD))
    reg(this.add.text(x + w / 2, y + h / 2, label, { fontFamily: 'monospace', fontSize: '11px', color: active ? '#1a1a1a' : '#cfe8ff' }).setOrigin(0.5))
    const z = reg(this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true }))
    z.on('pointerdown', () => {
      Audio.sfx('ui_move', { detune: 0 }) // changement d'onglet (catégorie / acheter-vendre)
      onClick()
    })
  }

  /** Barre de durabilité (verte -> rouge selon l'usure). */
  drawDurBar(reg, x, y, w, item) {
    const max = item.dur
    const cur = item.durability ?? max
    const ratio = Phaser.Math.Clamp(cur / max, 0, 1)
    reg(this.add.rectangle(x, y, w, 4, 0x000000, 0.5).setOrigin(0, 0.5))
    const col = ratio > 0.5 ? 0x6fdc6f : ratio > 0.2 ? 0xe0c341 : 0xe06666
    reg(this.add.rectangle(x, y, Math.max(1, w * ratio), 4, col).setOrigin(0, 0.5))
  }

  /** Carte d'objet (icône + nom + durabilité + libellé de prix), cliquable. */
  drawCard(reg, x, y, w, h, item, footer) {
    const rc = RARITY[item.rarity]
    reg(this.add.rectangle(x, y, w, h, CELL, 1).setOrigin(0, 0).setStrokeStyle(2, rc ? rc.tint : CELL_BORDER))
    reg(this.addIcon(x + 20, y + 22, item.icon, 26))
    reg(this.add.text(x + 38, y + 8, itemName(item), { fontFamily: 'monospace', fontSize: '10px', color: rc ? rc.color : '#fff', wordWrap: { width: w - 44 } }).setOrigin(0, 0))
    if (hasDurability(item)) this.drawDurBar(reg, x + 38, y + h - 20, w - 46, item)
    reg(this.add.text(x + w - 6, y + h - 8, footer.text, { fontFamily: 'monospace', fontSize: '10px', color: footer.color }).setOrigin(1, 1))
    const z = reg(this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true }))
    z.on('pointerover', () => this.showTip(item, x + w / 2, y))
    z.on('pointerout', () => this.hideTip())
    if (footer.onClick)
      z.on('pointerdown', () => {
        Audio.sfx('ui_coin', { detune: 0 }) // transaction (achat/vente/réparation/amélioration)
        footer.onClick()
      })
  }

  /** Grille de cartes 3 colonnes (cb(item) -> {text,color,onClick}). */
  drawCardGrid(reg, x, y, w, items, cb) {
    const cols = 3
    const gap = 8
    const maxRows = 5
    const cardW = (w - (cols - 1) * gap) / cols
    const cardH = 62
    items.slice(0, cols * maxRows).forEach((item, i) => {
      const r = Math.floor(i / cols)
      const c = i % cols
      this.drawCard(reg, x + c * (cardW + gap), y + r * (cardH + gap), cardW, cardH, item, cb(item))
    })
    if (items.length > cols * maxRows) {
      reg(this.add.text(x + w, y + maxRows * (cardH + gap) - gap, `+${items.length - cols * maxRows} de plus`, { fontFamily: 'monospace', fontSize: '9px', color: '#ffe066' }).setOrigin(1, 0))
    }
  }

  // ---------- forge (Aldric le forgeron) ----------

  openForge() {
    if (this.game_.gameOver) return
    if (this.charOpen) this.closeChar()
    if (this.shopOpen) this.closeShop()
    this.forgeOpen = true
    this.scene.pause('GameScene')
    Audio.sfx('ui_accept', { detune: 0 })
    this.buildForge()
  }

  closeForge() {
    this.forgeOpen = false
    this.destroyForge()
    this.hideTip()
    Audio.sfx('ui_cancel', { detune: 0 })
    this.scene.resume('GameScene')
  }

  destroyForge() {
    this.forgeObjects.forEach((o) => o.destroy())
    this.forgeObjects = []
  }

  buildForge() {
    const p = this.game_.player
    if (!p) return
    this.destroyForge()
    const reg = (o) => {
      this.forgeObjects.push(o)
      return o
    }
    const cw = this.scale.width
    const ch = this.scale.height
    reg(this.add.rectangle(0, 0, cw, ch, 0x000000, 0.6).setOrigin(0, 0))
    const W = 500
    const H = 470
    const x0 = cw / 2 - W / 2
    const y0 = ch / 2 - H / 2
    reg(this.add.rectangle(cw / 2, ch / 2, W, H, PANEL, 0.98).setStrokeStyle(2, GOLD))
    this.drawPanelHeader(reg, x0, y0, W, 'npc_villager', 0, 'Aldric le Forgeron', p.gold)
    reg(this.add.text(x0 + 58, y0 + 38, 'Répare et améliore tes armes & armures', { fontFamily: 'monospace', fontSize: '9px', color: '#cfe8ff' }).setOrigin(0, 0))

    // objets forgeables = armes/armures équipées + dans le sac (durabilité requise)
    const gear = []
    for (const slot of ['weapon', 'armor']) if (p.equipped[slot]) gear.push({ item: p.equipped[slot], equipped: true })
    for (const it of p.inventory) if (hasDurability(it)) gear.push({ item: it, equipped: false })

    const gridY = y0 + 64
    if (gear.length === 0) {
      reg(this.add.text(cw / 2, gridY + 70, 'Aucune arme ni armure à forger', { fontFamily: 'monospace', fontSize: '11px', color: '#7c8aa0' }).setOrigin(0.5))
    }
    const cols = 2
    const gap = 10
    const cardW = (W - 32 - (cols - 1) * gap) / cols
    const cardH = 96
    gear.slice(0, 6).forEach((g, i) => {
      const r = Math.floor(i / cols)
      const c = i % cols
      this.drawForgeCard(reg, x0 + 16 + c * (cardW + gap), gridY + r * (cardH + gap), cardW, cardH, g.item, g.equipped)
    })
    if (gear.length > 6) {
      reg(this.add.text(cw / 2, gridY + 3 * (cardH + gap), `+${gear.length - 6} autres (équipe-les ou vends-en)`, { fontFamily: 'monospace', fontSize: '9px', color: '#ffe066' }).setOrigin(0.5, 0))
    }
    reg(this.add.text(cw / 2, y0 + H - 14, 'Réparer = durabilité pleine  ·  Améliorer = +stats (max +5)  ·  Échap = fermer', { fontFamily: 'monospace', fontSize: '9px', color: '#9fb6cc' }).setOrigin(0.5))
  }

  /** Carte de forge : objet + durabilité + 2 boutons (Réparer / Améliorer). */
  drawForgeCard(reg, x, y, w, h, item, equipped) {
    const rc = RARITY[item.rarity]
    const p = this.game_.player
    reg(this.add.rectangle(x, y, w, h, CELL, 1).setOrigin(0, 0).setStrokeStyle(2, rc ? rc.tint : CELL_BORDER))
    reg(this.addIcon(x + 22, y + 26, item.icon, 30))
    reg(this.add.text(x + 44, y + 8, itemName(item) + (equipped ? '  (équipé)' : ''), { fontFamily: 'monospace', fontSize: '10px', color: rc ? rc.color : '#fff', wordWrap: { width: w - 50 } }).setOrigin(0, 0))
    const cur = item.durability ?? item.dur
    this.drawDurBar(reg, x + 44, y + 38, w - 54, item)
    reg(this.add.text(x + 44, y + 42, `${cur}/${item.dur}`, { fontFamily: 'monospace', fontSize: '8px', color: '#9fb6cc' }).setOrigin(0, 0))
    // infobulle au survol de la carte
    const hov = reg(this.add.rectangle(x, y, w, h - 26, 0xffffff, 0.001).setOrigin(0, 0).setInteractive())
    hov.on('pointerover', () => this.showTip(item, x + w / 2, y))
    hov.on('pointerout', () => this.hideTip())
    // boutons
    const rCost = repairCost(item)
    const uCost = upgradeCost(item)
    const bw = (w - 24) / 2
    const by = y + h - 22
    this.drawForgeBtn(reg, x + 8, by, bw, rCost > 0 && p.gold >= rCost, rCost > 0 ? `Réparer ${rCost}` : 'Intact', () => this.repairItem(item))
    this.drawForgeBtn(reg, x + 16 + bw, by, bw, uCost != null && p.gold >= uCost, uCost != null ? `+1 : ${uCost}or` : 'Max +5', () => this.upgradeItem(item))
  }

  drawForgeBtn(reg, x, y, w, enabled, label, onClick) {
    const h = 18
    reg(this.add.rectangle(x, y, w, h, enabled ? 0x394b63 : 0x262c36, 1).setOrigin(0, 0).setStrokeStyle(1, enabled ? GOLD : 0x3a4452))
    reg(this.add.text(x + w / 2, y + h / 2, label, { fontFamily: 'monospace', fontSize: '9px', color: enabled ? '#ffe066' : '#6c7787' }).setOrigin(0.5))
    if (enabled) {
      const z = reg(this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true }))
      z.on('pointerdown', onClick)
    }
  }

  repairItem(item) {
    const p = this.game_.player
    const cost = repairCost(item)
    if (cost <= 0 || p.gold < cost) return
    p.gold -= cost
    item.durability = item.dur
    p.invVersion++
    if (p.equipped[item.slot] === item) p.recomputeStats()
    this.showToast(`Réparé : ${itemName(item)}`, '#6fdc6f')
    this.buildForge()
  }

  upgradeItem(item) {
    const p = this.game_.player
    const cost = upgradeCost(item)
    if (cost == null || p.gold < cost) return
    p.gold -= cost
    item.upgrade = (item.upgrade ?? 0) + 1
    item.durability = item.dur // l'amélioration répare aussi
    p.invVersion++
    if (p.equipped[item.slot] === item) p.recomputeStats()
    const rc = RARITY[item.rarity]
    this.showToast(`Amélioré : ${itemName(item)}`, rc ? rc.color : '#ffe066')
    this.buildForge()
  }

  // ---------- menu pause (Échap) ----------

  openPause() {
    if (this.game_.gameOver) return
    if (this.charOpen) this.closeChar()
    this.pauseOpen = true
    this.scene.pause('GameScene')
    Audio.sfx('ui_accept', { detune: 0 })
    this.buildPause()
  }

  closePause() {
    this.pauseOpen = false
    this.destroyPause()
    Audio.sfx('ui_cancel', { detune: 0 })
    this.scene.resume('GameScene')
  }

  destroyPause() {
    this.pauseObjects.forEach((o) => o.destroy())
    this.pauseObjects = []
  }

  buildPause() {
    this.destroyPause()
    const reg = (o) => {
      this.pauseObjects.push(o)
      return o
    }
    const cw = this.scale.width
    const ch = this.scale.height
    reg(this.add.rectangle(0, 0, cw, ch, 0x000000, 0.6).setOrigin(0, 0))
    const W = 300
    const H = 372
    reg(this.add.rectangle(cw / 2, ch / 2, W, H, PANEL, 0.98).setStrokeStyle(2, GOLD))
    let y = ch / 2 - H / 2 + 24
    reg(this.add.text(cw / 2, y, 'Pause', { fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(0.5))

    // --- réglages audio ---
    y += 36
    this.muteButton = this.menuButton(reg, cw / 2, y, this.muteLabel(), () => {
      Audio.toggleMute()
      this.muteButton.txt.setText(this.muteLabel())
    })
    y += 44
    this.volumeSlider(reg, cw / 2, y, 'Musique', () => Audio.settings.music, (v) => Audio.setMusicVol(v))
    y += 40
    this.volumeSlider(reg, cw / 2, y, 'Effets', () => Audio.settings.sfx, (v) => Audio.setSfxVol(v))

    // --- boutons ---
    y += 48
    this.menuButton(reg, cw / 2, y, 'Reprendre', () => this.closePause())
    y += 48
    this.menuButton(reg, cw / 2, y, 'Sauvegarder', () => {
      this.game_.saveGame()
      this.showToast('Partie sauvegardée', '#6fdc6f')
    })
    y += 48
    this.menuButton(reg, cw / 2, y, 'Quitter au menu', () => this.quitToMenu())
  }

  muteLabel() {
    return Audio.settings.muted ? 'Son : coupé 🔇' : 'Son : activé 🔊'
  }

  /** Curseur de volume (0..1) : libellé à gauche, piste cliquable + poignée glissable à droite. */
  volumeSlider(reg, cx, y, label, get, set) {
    const w = 150 // largeur de la piste
    const x0 = cx - 6 // bord gauche de la piste (le libellé est à gauche de x0)
    reg(this.add.text(x0 - 12, y, label, { fontFamily: 'monospace', fontSize: '13px', color: '#cfe0ff' }).setOrigin(1, 0.5))
    const val = Phaser.Math.Clamp(get(), 0, 1)
    reg(this.add.rectangle(x0, y, w, 6, 0x2a3346).setOrigin(0, 0.5).setStrokeStyle(1, CELL_BORDER))
    const fill = reg(this.add.rectangle(x0, y, w * val, 6, GOLD).setOrigin(0, 0.5))
    const handle = reg(this.add.circle(x0 + w * val, y, 8, 0xffe066).setStrokeStyle(2, 0x000000))
    const apply = (f) => {
      const v = Phaser.Math.Clamp(f, 0, 1)
      handle.x = x0 + w * v
      fill.width = w * v
      set(v)
    }
    handle.setInteractive({ useHandCursor: true, draggable: true })
    handle.on('drag', (_p, dragX) => apply((dragX - x0) / w))
    // clic direct sur la piste = saut à la valeur
    const track = reg(this.add.rectangle(x0, y, w, 18, 0xffffff, 0.001).setOrigin(0, 0.5).setInteractive({ useHandCursor: true }))
    track.on('pointerdown', (p) => apply((p.x - x0) / w))
  }

  menuButton(reg, x, y, label, cb) {
    const w = 200
    const h = 38
    const bg = reg(this.add.rectangle(x, y, w, h, 0x1a2233, 1).setStrokeStyle(2, GOLD))
    const txt = reg(this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5))
    const z = reg(this.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true }))
    z.on('pointerover', () => {
      bg.setFillStyle(0x26344b, 1)
      txt.setColor('#ffe066')
    })
    z.on('pointerout', () => {
      bg.setFillStyle(0x1a2233, 1)
      txt.setColor('#ffffff')
    })
    z.on('pointerdown', cb)
    return { bg, txt, z }
  }

  quitToMenu() {
    this.game_.saveGame()
    this.pauseOpen = false
    this.scene.stop('GameScene')
    this.scene.start('MenuScene')
    this.scene.stop() // arrête l'UIScene
  }

  // ---------- carte du monde (touche M) ----------

  openMap() {
    if (this.game_.gameOver) return
    this.mapOpen = true
    this.scene.pause('GameScene')
    Audio.sfx('ui_accept', { detune: 0 })
    this.buildWorldMap()
  }

  closeMap() {
    this.mapOpen = false
    this.mapObjects.forEach((o) => o.destroy())
    this.mapObjects = []
    Audio.sfx('ui_cancel', { detune: 0 })
    this.scene.resume('GameScene')
  }

  /** Dessine tout le continent (océan + biomes) échantillonné depuis GameScene, façon carte papier,
   *  avec les marqueurs village + joueur. Vue d'ensemble plein écran (jeu en pause). */
  buildWorldMap() {
    this.mapObjects.forEach((o) => o.destroy())
    this.mapObjects = []
    const reg = (o) => {
      this.mapObjects.push(o)
      return o
    }
    const g = this.game_
    const cw = this.scale.width
    const ch = this.scale.height
    reg(this.add.rectangle(0, 0, cw, ch, 0x05070c, 0.92).setOrigin(0, 0).setDepth(300).setInteractive())

    const mw = g.mapW
    const mh = g.mapH
    // zone d'affichage : on garde le ratio de la map, marge autour + place pour le titre
    const availW = cw * 0.86
    const availH = ch * 0.78
    const cell = Math.min(availW / mw, availH / mh)
    const mapPxW = cell * mw
    const mapPxH = cell * mh
    const ox = (cw - mapPxW) / 2
    const oy = (ch - mapPxH) / 2 + 10

    const COLOR = { ocean: 0x274b78, prairie: 0x9bcf5a, forest: 0x3e8b41, snow: 0xe9f1ff, desert: 0xd9bd72, cursed: 0x7c4a63 }
    const gfx = reg(this.add.graphics().setDepth(301))
    // cadre + fond océan
    gfx.fillStyle(COLOR.ocean, 1).fillRect(ox, oy, mapPxW, mapPxH)
    const S = 2 // pas d'échantillonnage (perf : ~12k cases)
    for (let ty = 0; ty < mh; ty += S) {
      for (let tx = 0; tx < mw; tx += S) {
        if (g.isOcean(tx, ty)) continue // déjà peint en océan
        gfx.fillStyle(COLOR[g.biomeAt(tx, ty)] ?? COLOR.forest, 1)
        gfx.fillRect(ox + tx * cell, oy + ty * cell, cell * S + 0.6, cell * S + 0.6)
      }
    }
    // rivières + lacs (eau interne) : bleu rivière par-dessus les biomes ; glace = bleu pâle
    if (g.waterCells && g.waterCells.size) {
      const rg = reg(this.add.graphics().setDepth(301.3))
      for (const k of g.waterCells) {
        const [tx, ty] = k.split(',').map(Number)
        rg.fillStyle(g.iceCells?.has(k) ? 0xcfe6f5 : 0x3f7fc0, 1)
        rg.fillRect(ox + tx * cell, oy + ty * cell, cell + 0.6, cell + 0.6)
      }
    }
    // ponts (bois) là où les chemins/routes franchissent les rivières
    if (g.bridgeCells && g.bridgeCells.size) {
      const bgfx = reg(this.add.graphics().setDepth(301.4))
      bgfx.fillStyle(0x8a5a2b, 1)
      for (const k of g.bridgeCells) {
        const [tx, ty] = k.split(',').map(Number)
        bgfx.fillRect(ox + tx * cell, oy + ty * cell, cell + 0.8, cell + 0.8)
      }
    }
    // gués (terre battue marron clair) traversant les rivières-séparatrices
    if (g.pathCells && g.pathCells.size) {
      const pg = reg(this.add.graphics().setDepth(301.5))
      pg.fillStyle(0xb5915c, 1)
      for (const k of g.pathCells) {
        const [tx, ty] = k.split(',').map(Number)
        pg.fillRect(ox + tx * cell, oy + ty * cell, cell + 0.6, cell + 0.6)
      }
    }
    reg(this.add.rectangle(ox + mapPxW / 2, oy + mapPxH / 2, mapPxW, mapPxH).setStrokeStyle(2, GOLD).setDepth(302))

    // marqueur VILLAGE
    const vx = ox + g.cx * cell
    const vy = oy + g.cy * cell
    reg(this.add.star(vx, vy, 5, 3, 6, 0xffe066).setDepth(303).setStrokeStyle(1, 0x5a4a10))
    reg(this.add.text(vx, vy - 10, 'Village', { fontFamily: 'monospace', fontSize: '11px', color: '#ffe066', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(303))

    // marqueurs des REPAIRES DE BOSS (loin du spawn, au fond des zones)
    const bossNames = { forest: 'Gorthak', desert: 'Sslyth', snow: 'Brakka', cursed: 'Dargoth' }
    for (const [biome, lair] of Object.entries(g.bossLairs ?? {})) {
      const bx = ox + lair.tx * cell
      const by = oy + lair.ty * cell
      reg(this.add.star(bx, by, 4, 3, 7, 0xff4444).setDepth(303).setStrokeStyle(1.5, 0x3a0000))
      reg(this.add.text(bx, by - 9, `☠ ${bossNames[biome] ?? 'Boss'}`, { fontFamily: 'monospace', fontSize: '10px', color: '#ff8a8a', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(303))
    }

    // PNJ dispersés (petits points clairs)
    for (const npc of g.wildNpcs ?? []) {
      reg(this.add.circle(ox + npc.tx * cell, oy + npc.ty * cell, 2.5, 0xffe9a8).setDepth(303).setStrokeStyle(1, 0x6a5212))
    }

    // marqueur JOUEUR
    const p = g.player
    if (p) {
      const dotX = ox + (p.x / g.tile) * cell
      const dotY = oy + (p.y / g.tile) * cell
      reg(this.add.circle(dotX, dotY, 4, 0x53e0ff).setDepth(304).setStrokeStyle(1.5, 0x06243a))
    }

    // titre + aide + légende
    reg(this.add.text(cw / 2, oy - 24, 'Carte du monde', { fontFamily: 'Georgia, serif', fontSize: '24px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(303))
    reg(this.add.text(cw / 2, oy + mapPxH + 20, 'M / Échap : fermer', { fontFamily: 'monospace', fontSize: '12px', color: '#bcd' }).setOrigin(0.5).setDepth(303))
    const legend = [['Prairie', COLOR.prairie], ['Forêt', COLOR.forest], ['Neige', COLOR.snow], ['Désert', COLOR.desert], ['Maudit', COLOR.cursed], ['Océan', COLOR.ocean]]
    let lx = cw / 2 - (legend.length * 78) / 2
    const ly = oy + mapPxH + 40
    for (const [name, col] of legend) {
      reg(this.add.rectangle(lx, ly, 12, 12, col, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x000000).setDepth(303))
      reg(this.add.text(lx + 16, ly, name, { fontFamily: 'monospace', fontSize: '11px', color: '#dfe6f0' }).setOrigin(0, 0.5).setDepth(303))
      lx += 78
    }
  }

  // ---------- dialogue (villageois) ----------

  /** Ouvre une fenêtre de dialogue type RPG (PNJ nommé + portrait + phrases). */
  openDialogue(name, lines, texture) {
    if (this.game_.gameOver) return
    if (this.charOpen) this.closeChar()
    if (this.shopOpen) this.closeShop()
    if (this.forgeOpen) this.closeForge()
    this.dialogueOpen = true
    this.dlgName = name
    this.dlgLines = lines && lines.length ? lines : ['...']
    this.dlgTexture = texture
    this.dlgIndex = 0
    this.dlgOpenAt = this.time.now // anti-rebond : la touche d'ouverture ne doit pas avancer
    this.scene.pause('GameScene')
    this.buildDialogue()
  }

  buildDialogue() {
    this.destroyDialogue()
    const reg = (o) => {
      this.dialogueObjects.push(o)
      return o
    }
    const cw = this.scale.width
    const ch = this.scale.height
    const W = Math.min(460, cw - 40)
    const H = 132
    const cx = cw / 2
    const y0 = ch - H - 24 // ancré en bas de l'écran (style RPG)

    // clic n'importe où sur le panneau -> phrase suivante
    const hit = reg(this.add.rectangle(cx, y0 + H / 2, W, H, PANEL, 0.98).setStrokeStyle(2, GOLD))
    hit.setInteractive({ useHandCursor: true })
    hit.on('pointerdown', () => this.advanceDialogue())

    const x0 = cx - W / 2
    // portrait du PNJ (1re frame du spritesheet)
    reg(this.add.rectangle(x0 + 36, y0 + 38, 52, 52, 0x000000, 0.4).setStrokeStyle(2, GOLD))
    if (this.dlgTexture && this.textures.exists(this.dlgTexture)) {
      const port = reg(this.add.image(x0 + 36, y0 + 38, this.dlgTexture, 0))
      port.setScale(44 / Math.max(port.width, port.height))
    }
    // nom (or) + phrase courante
    reg(this.add.text(x0 + 72, y0 + 14, this.dlgName, { fontFamily: 'monospace', fontSize: '14px', color: '#ffe066' }).setOrigin(0, 0))
    reg(
      this.add
        .text(x0 + 72, y0 + 40, this.dlgLines[this.dlgIndex], {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffffff',
          lineSpacing: 4,
          wordWrap: { width: W - 90 },
        })
        .setOrigin(0, 0)
    )
    // progression + invite
    const last = this.dlgIndex >= this.dlgLines.length - 1
    reg(
      this.add
        .text(cx, y0 + H - 13, `${this.dlgIndex + 1}/${this.dlgLines.length}   ·   ${last ? '✓ Fermer' : '▶ Suivant'}  (E / clic)`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#9fb6cc',
        })
        .setOrigin(0.5)
    )
  }

  advanceDialogue() {
    if (!this.dialogueOpen) return
    if (this.time.now - this.dlgOpenAt < 180) return // ignore la touche qui vient d'ouvrir
    this.dlgIndex++
    if (this.dlgIndex >= this.dlgLines.length) this.closeDialogue()
    else this.buildDialogue()
  }

  closeDialogue() {
    this.dialogueOpen = false
    this.destroyDialogue()
    this.scene.resume('GameScene')
  }

  destroyDialogue() {
    this.dialogueObjects.forEach((o) => o.destroy())
    this.dialogueObjects = []
  }

  // ---------- helpers ----------

  pointerOverInventory(x, y) {
    const inside = (r) => r && Phaser.Geom.Rectangle.Contains(r, x, y)
    return inside(this.bagRect) || inside(this.frameRect) || inside(this.xpRect) || inside(this.skillsRect)
  }

  addIcon(x, y, key, fit) {
    const img = this.add.image(x, y, key)
    img.setScale(fit / Math.max(img.width, img.height))
    return img
  }

  showTip(item, centerX, topY) {
    const r = RARITY[item.rarity]
    this.tip.setColor(r ? r.color : '#ffffff')
    this.tip.setText(`${item.name}\n${describeItem(item)}`).setPosition(centerX, topY - 4).setVisible(true)
  }

  hideTip() {
    this.tip.setVisible(false)
  }

  /** Bandeau de zone (nom du biome) qui apparaît en grand puis s'efface. */
  showZoneBanner(name) {
    if (!name) return
    if (this.zoneBanner) {
      this.tweens.killTweensOf(this.zoneBanner)
      this.zoneBanner.destroy()
    }
    const t = this.add
      .text(this.scale.width / 2, this.scale.height * 0.2, name, {
        fontFamily: 'Georgia, serif',
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#ffe9a8',
        stroke: '#2a1c08',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(140)
      .setAlpha(0)
    this.zoneBanner = t
    this.tweens.add({
      targets: t,
      alpha: 1,
      duration: 450,
      hold: 1500,
      yoyo: true,
      ease: 'Sine.inOut',
      onComplete: () => {
        t.destroy()
        if (this.zoneBanner === t) this.zoneBanner = null
      },
    })
  }

  /** Message bref au-dessus de la hotbar (ramassage, équipement...). */
  showToast(text, color) {
    if (this.toast) {
      this.tweens.killTweensOf(this.toast)
      this.toast.destroy()
    }
    const topY = (this.bagRect ? this.bagRect.y : this.scale.height - 80) - 12
    const t = this.add
      .text(this.scale.width / 2, topY, text, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: color || '#ffffff',
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(130)
    this.toast = t
    this.tweens.add({
      targets: t,
      y: topY - 22,
      alpha: 0,
      delay: 900,
      duration: 600,
      onComplete: () => {
        t.destroy()
        if (this.toast === t) this.toast = null
      },
    })
  }

  /** Toast pour un objet (préfixe + nom coloré selon la rareté). */
  showItemToast(prefix, item) {
    const rc = RARITY[item.rarity]
    this.showToast(`${prefix} : ${item.name}`, rc ? rc.color : '#ffffff')
  }

  // ---------- update ----------

  update() {
    const p = this.game_?.player
    if (!p) return

    const ratio = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1)
    this.hpBar.setSize(this.hpBarW * ratio, this.hpBarH)
    this.hpBar.fillColor = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xff9800 : 0xe23b3b
    this.hpText.setText(`Vie ${Math.round(p.hp)}/${p.maxHp}`)
    // mana (bleu) — barre vide si la classe n'a pas de mana ; libellé "Mana" pour la distinguer
    const mRatio = p.maxMana > 0 ? Phaser.Math.Clamp(p.mana / p.maxMana, 0, 1) : 0
    this.mpBar.setSize(this.mpBarW * mRatio, this.mpBarH)
    this.mpText.setText(p.maxMana > 0 ? `Mana ${Math.round(p.mana)}/${p.maxMana}` : '—')
    // bouton SORT : voile de cooldown (fond quand le sort revient) + coût en rouge si mana insuffisant
    if (this.sortCdVeil && p.spell) {
      const rem = Math.max(0, p.nextSpellAt - this.game_.time.now)
      const ratio = Phaser.Math.Clamp(rem / p.spell.cd, 0, 1)
      this.sortCdVeil.setSize(this.sortBtnSize, this.sortBtnSize * ratio)
      this.sortCostText?.setColor(p.mana >= p.spell.cost ? '#7fb3ff' : '#ff6b6b')
    }
    const maxLvl = p.maxLevel ?? 20
    this.lvlText.setText(p.level >= maxLvl ? `Niveau ${maxLvl} (MAX)` : `Niveau ${p.level}`)
    this.goldText.setText(`Or : ${p.gold}`)

    const xpRatio = p.level >= maxLvl ? 1 : Phaser.Math.Clamp(p.xp / p.xpToNext, 0, 1)
    this.xpBar.setSize(this.xpBarFullW * xpRatio, this.xpBarH)
    this.xpText.setText(p.level >= maxLvl ? 'XP MAX' : `XP ${p.xp} / ${p.xpToNext}`)

    if (p.invVersion !== this.builtInvVersion) {
      this.builtInvVersion = p.invVersion
      this.buildBag()
      if (this.charOpen) this.buildCharPanel()
    }

    this.updateBossBar(this.game_?.activeBoss) // barre de boss en haut (combat de boss)
    this.updatePlayerNameplate(p) // pseudo au-dessus du héros (projeté depuis la caméra)
    this.updateMinimap(p) // fenêtre zoomée de la minimap qui suit le joueur
  }

  /** Met à jour la minimap : on fait GLISSER l'image (sous le masque carré) pour garder le joueur centré. */
  updateMinimap(p) {
    if (!this.minimapImg || !this.mmGeom) return
    const tile = this.game_.tile ?? 16
    const scale = this.mmGeom.size / this.mmGeom.tiles // px d'écran par tuile (zoom)
    const cx = this.mmGeom.x + this.mmGeom.size / 2
    const cy = this.mmGeom.y + this.mmGeom.size / 2
    this.minimapImg.setScale(scale)
    this.minimapImg.setPosition(cx - (p.x / tile) * scale, cy - (p.y / tile) * scale) // centre sur le joueur
    this.minimapDot.setPosition(cx, cy) // joueur toujours au centre
    // points des MOBS (rouge ; boss = orange plus gros), redessinés chaque frame
    const mobs = this.minimapMobs
    const g = this.game_
    if (mobs && g?.monsters) {
      mobs.clear()
      const half = this.mmGeom.size / 2
      g.monsters.getChildren().forEach((m) => {
        if (!m.active) return
        const sx = cx + ((m.x - p.x) / tile) * scale
        const sy = cy + ((m.y - p.y) / tile) * scale
        if (Math.abs(sx - cx) > half || Math.abs(sy - cy) > half) return // hors fenêtre
        if (m.isBoss) {
          mobs.fillStyle(0xff7a1f, 1)
          mobs.fillCircle(sx, sy, 3)
        } else {
          mobs.fillStyle(0xff4444, 1)
          mobs.fillCircle(sx, sy, 1.8)
        }
      })
    }
  }

  /** Place le pseudo au-dessus du héros en projetant sa position monde -> écran (caméra GameScene). */
  updatePlayerNameplate(p) {
    const np = this.playerNameplate
    if (!np) return
    // caché si mort ou si un panneau plein écran est ouvert (boutique/fiche/forge/dialogue/pause)
    if (p.hp <= 0 || this.game_.gameOver || this.game_.uiBusy?.()) {
      np.setVisible(false)
      return
    }
    const cam = this.game_.cameras.main
    const sx = Math.round((p.x - cam.worldView.x) * cam.zoom)
    const sy = Math.round((p.y - 11 - cam.worldView.y) * cam.zoom) // un peu au-dessus de la tête
    np.setPosition(sx, sy).setVisible(true)
  }

  showGameOver(level) {
    const cw = this.scale.width
    const ch = this.scale.height

    const veil = this.add.rectangle(0, 0, cw, ch, 0x000000, 0).setOrigin(0, 0).setDepth(150)
    this.tweens.add({ targets: veil, fillAlpha: 0.7, duration: 500 })

    const panel = this.add.rectangle(cw / 2, ch / 2, 260, 180, 0x1a1a1a, 0.96).setDepth(150)
    panel.setStrokeStyle(2, 0xe23b3b)

    const title = this.add
      .text(cw / 2, ch / 2 - 60, 'GAME OVER', {
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
      .text(cw / 2, ch / 2 - 30, `Niveau atteint : ${level}`, { fontFamily: 'monospace', fontSize: '12px', color: '#dddddd' })
      .setOrigin(0.5)
      .setDepth(151)

    // boutons (depth élevé pour passer au-dessus du voile)
    const reg = (o) => o.setDepth(151)
    this.menuButton(reg, cw / 2, ch / 2 + 6, 'Recommencer', () => {
      this.game_.scene.restart({ character: this.game_.character })
      this.scene.restart()
    })
    this.menuButton(reg, cw / 2, ch / 2 + 52, 'Menu principal', () => {
      this.game_.scene.stop('GameScene')
      this.scene.start('MenuScene')
      this.scene.stop()
    })
  }
}
