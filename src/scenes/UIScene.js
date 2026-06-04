import Phaser from 'phaser'
import { ITEMS, MATERIALS, SLOTS, SLOT_LABELS, describeStats, describeItem, RARITY, itemColor, itemTint, SETS, setStatus, SHOP_STOCK, BOAT_ITEM, sellPrice, cloneItem, itemName, hasDurability, repairCost, upgradeCost, canEquip, classRestrictionLabel } from '../data/items.js'
import { Audio } from '../data/sound.js'
import { SKILL_ICONS } from '../data/classes.js'
import { QUESTS, questGoal, questProgress, questComplete, nextQuestId } from '../data/quests.js'

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
    this.journalOpen = false
    this.journalObjects = []
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

    // bouton « ✖ Lâcher » de l'infobulle (objets du sac seulement) : pose l'objet au sol pour libérer
    // une place (le sac est cap à 5). Placé SOUS l'infobulle ; reste visible tant qu'on le survole.
    this._dropTarget = null
    this._tipHideEv = null
    this.dropBtn = this.add
      .text(0, 0, '✖ Lâcher', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffd1d1',
        backgroundColor: '#5a1d1ddd',
        padding: { x: 6, y: 4 },
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setDepth(201)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
    this.dropBtn.on('pointerover', () => this._cancelTipHide())
    this.dropBtn.on('pointerout', () => this.hideTip())
    this.dropBtn.on('pointerdown', () => this._dropTarget && this.dropItem(this._dropTarget))

    // suivi de QUÊTE (HUD, haut-gauche SOUS le cadre du héros) — panneau lisible, mis à jour chaque frame
    {
      const qx = 10
      const qy = 116 // sous le cadre héros + le thermomètre (barre + libellé)
      const qw = 214
      const qh = 56
      const D = 120
      this.qt = {}
      this.qt.bg = this.add.rectangle(qx, qy, qw, qh, PANEL, 0.88).setOrigin(0, 0).setStrokeStyle(2, GOLD).setDepth(D)
      this.qt.accent = this.add.rectangle(qx, qy, 4, qh, 0xffcf2a).setOrigin(0, 0).setDepth(D + 1)
      this.qt.header = this.add.text(qx + 12, qy + 6, '✦ QUÊTE', { fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: '#ffcf2a' }).setOrigin(0, 0).setDepth(D + 1)
      this.qt.title = this.add.text(qx + 12, qy + 18, '', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0, 0).setDepth(D + 1)
      this.qt.obj = this.add.text(qx + 12, qy + 35, '', { fontFamily: 'monospace', fontSize: '11px', color: '#cfe2ff' }).setOrigin(0, 0).setDepth(D + 1)
      this.qt.barBg = this.add.rectangle(qx + 12, qy + qh - 8, qw - 24, 5, 0x000000, 0.5).setOrigin(0, 0.5).setDepth(D + 1)
      this.qt.bar = this.add.rectangle(qx + 12, qy + qh - 8, 0, 5, 0x7cc4ff).setOrigin(0, 0.5).setDepth(D + 2)
      this.qt.w = qw - 24
      this.qtAll = [this.qt.bg, this.qt.accent, this.qt.header, this.qt.title, this.qt.obj, this.qt.barBg, this.qt.bar]
      this.qtAll.forEach((o) => o.setVisible(false))
    }

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
    this.input.keyboard.on('keydown-J', () => this.toggleJournal()) // J : journal de quêtes
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.dialogueOpen) this.closeDialogue()
      else if (this.forgeOpen) this.closeForge()
      else if (this.charOpen) this.closeChar()
      else if (this.shopOpen) this.closeShop()
      else if (this.mapOpen) this.closeMap()
      else if (this.journalOpen) this.closeJournal()
      else if (this.pauseOpen) this.closePause()
      else this.openPause() // rien d'ouvert -> menu pause
    })
    // M : carte du monde plein écran (toggle)
    this.input.keyboard.on('keydown-M', () => this.toggleMap())
    // E / Espace : avance le dialogue (et le ferme à la dernière phrase)
    this.input.keyboard.on('keydown-E', () => {
      if (this.dialogueOpen) this.advanceDialogue()
    })
    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.dialogueOpen) this.advanceDialogue()
    })

    // mort
    this.game_.events.on('died', this.showDeath, this)
    this.events.once('shutdown', () => this.game_.events.off('died', this.showDeath, this))

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
    // PORTRAIT cliquable (souris + tactile) -> ouvre la fiche perso (bouton HUD permanent ; touche C en plus)
    const charBtn = reg(this.add.rectangle(px, py, pSize, pSize, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true }))
    charBtn.on('pointerover', () => charBtn.setFillStyle(0xffe066, 0.18))
    charBtn.on('pointerout', () => charBtn.setFillStyle(0xffffff, 0.001))
    charBtn.on('pointerdown', (po, lx, ly, ev) => { ev?.stopPropagation?.(); this.toggleChar() })
    reg(this.add.text(px + pSize - 2, py + pSize - 1, 'C', { fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 1))

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

    // --- VIGNETTE de bord (effet givre/chaleur sur les BORDS de l'écran, façon LEGO Fortnite) ---
    // Texture blanche dégradée (opaque au bord -> transparente vers le centre) générée une fois, puis
    // TEINTÉE bleu/orange et dont l'alpha monte avec la température. Derrière le HUD (depth -5).
    if (!this.textures.exists('temp_vignette')) {
      const E = 70
      const g = this.make.graphics({ add: false })
      g.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 1, 1, 0, 0); g.fillRect(0, 0, cw, E) // haut
      g.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0, 0, 1, 1); g.fillRect(0, ch - E, cw, E) // bas
      g.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 1, 0, 1, 0); g.fillRect(0, 0, E, ch) // gauche
      g.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0, 1, 0, 1); g.fillRect(cw - E, 0, E, ch) // droite
      g.generateTexture('temp_vignette', cw, ch)
      g.destroy()
    }
    this.tempVeil = reg(this.add.image(0, 0, 'temp_vignette').setOrigin(0, 0).setDepth(-5).setAlpha(0))

    // --- THERMOMÈTRE (barre ZONÉE + aiguille coulissante, façon LEGO Fortnite), haut-gauche, toujours visible ---
    // Zones (gauche->droite) : Glacial · Froid · Tempéré · Chaud · Brûlant, proportionnelles aux paliers (-100…+100).
    const tgx = 10
    const tgy = 82
    const tgw = 214
    const tgh = 14
    this.tempBarX = tgx
    this.tempBarW = tgw
    this.tempBarMid = tgy + tgh / 2
    reg(this.add.rectangle(tgx - 1, tgy - 1, tgw + 2, tgh + 2, 0x000000, 0.65).setOrigin(0, 0).setStrokeStyle(2, GOLD, 0.7))
    const zones = [[0.05, 0x2f6fd6], [0.175, 0x7fc4ec], [0.55, 0x6fcf86], [0.175, 0xf0a23c], [0.05, 0xe0432f]]
    let zx = tgx
    for (const [frac, col] of zones) { const w = tgw * frac; reg(this.add.rectangle(zx, tgy, w, tgh, col, 0.92).setOrigin(0, 0)); zx += w }
    this.tempNeedle = reg(this.add.rectangle(tgx + tgw / 2, this.tempBarMid, 3, tgh + 8, 0xffffff).setOrigin(0.5, 0.5).setStrokeStyle(1, 0x000000, 0.7).setDepth(130))
    this.tempLabel = reg(this.add.text(tgx + tgw / 2, tgy + tgh + 9, 'Tempéré', { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#9fe6a8', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0.5).setDepth(130))

    // --- PARTICULES d'ambiance température (écran, scrollFactor 0) : flocons qui TOMBENT au froid,
    // braises qui MONTENT au chaud. Densité pilotée en update ; éteintes en zone tempérée. ---
    // Froid = flocons qui tombent (le chaud n'a PAS de particules d'écran : le héros BRÛLE à la place, cf. GameScene).
    this.coldParticles = reg(this.add.particles(0, 0, 'fx_snow', {
      frame: [0, 1, 2, 3, 4, 5, 6], x: { min: 0, max: cw }, y: -10, lifespan: 4600, speedY: { min: 26, max: 64 },
      speedX: { min: -18, max: 18 }, rotate: { min: 0, max: 360 }, scale: { min: 0.8, max: 1.8 }, alpha: { start: 0.85, end: 0.2 }, frequency: 120,
    }).setScrollFactor(0).setDepth(-4))
    this.coldParticles.stop()

    // --- BANDEAU d'ALERTE central (très visible) quand on est en zone de DÉGÂTS ---
    this.tempBanner = reg(this.add.text(cw / 2, ch * 0.2, '', {
      fontFamily: 'Georgia, serif', fontSize: '24px', fontStyle: 'bold', color: '#ffffff', align: 'center',
      stroke: '#000000', strokeThickness: 6, shadow: { offsetX: 0, offsetY: 2, color: '#000', blur: 8, fill: true },
    }).setOrigin(0.5).setDepth(140).setVisible(false))

    // --- BARRE DE COMPÉTENCES (bas-droite) : 4 cases carrées style WoW = ATK · Sort 1 · Sort 2 · Sort 3 (set) ---
    // Icônes (RPG Ability Icons), bordure dorée (émeraude pour le set), raccourci clavier, voile + chiffre de
    // cooldown, cadenas si verrouillé, flash au lancement. La LOGIQUE (clic/cooldown/mana) est inchangée.
    const p = this.game_.player
    const sp1 = p.spell
    const sp2 = p.spell2
    const setDef = SETS[p.className]
    const size = 52
    const bgap = 6
    const byc = xpY - 8 - size / 2
    const rightCx = cw - 14 - size / 2
    const cx = (i) => rightCx - i * (size + bgap) // i=0 -> droite (Sort 3), i=3 -> gauche (ATK)
    this.skillsRect = new Phaser.Geom.Rectangle(cx(3) - size / 2 - 2, byc - size / 2 - 2, (size + bgap) * 3 + size + 4, size + 4)
    const tnow = () => this.game_.time.now
    this.skillUpdaters = []
    // ATK (attaque de base) — gauche
    this.buildSkillCase(reg, cx(3), byc, size, { iconKey: ab.melee ? 'skill_atk_melee' : 'skill_atk_ranged', shortcut: ab.melee ? 'Esp' : 'F', onClick: () => this.game_.basicAttack?.() })
    // Sort 1
    this.buildSkillCase(reg, cx(2), byc, size, { iconKey: SKILL_ICONS[sp1?.id], shortcut: '1', onClick: () => this.game_.castSpell?.(), cd: () => ({ rem: Math.max(0, p.nextSpellAt - tnow()), total: sp1?.cd ?? 1 }), cost: () => sp1?.cost })
    // Sort 2 (déverrouillé niv `spell2.level`)
    this.buildSkillCase(reg, cx(1), byc, size, { iconKey: SKILL_ICONS[sp2?.id], shortcut: '2', onClick: () => this.game_.castSpell2?.(), cd: () => ({ rem: Math.max(0, p.nextSpell2At - tnow()), total: sp2?.cd ?? 1 }), cost: () => sp2?.cost, locked: () => (p.level < (sp2?.level ?? 10) ? `Niv\n${sp2?.level ?? 10}` : null) })
    // Sort 3 = compétence de PANOPLIE (bordure émeraude, verrouillé tant que la panoplie n'est pas complète)
    this.buildSkillCase(reg, cx(0), byc, size, { iconKey: SKILL_ICONS[setDef?.skill], shortcut: '3', setBorder: true, onClick: () => this.game_.castSpell3?.(), cd: () => ({ rem: Math.max(0, (p.nextSpell3At ?? 0) - tnow()), total: 35000 }), cost: () => 30, locked: () => (p.activeSet ? null : 'Set\n4/4') })

    // --- BOUTON PERSO (HUD, accès facile souris+tactile) : portrait + « C » en bas-gauche ---
    const pbSz = 48
    const pbX = 14 + pbSz / 2
    const pbY = ch - 14 - pbSz / 2
    const pbFace = this.textures.exists('face_' + p.heroKey) ? 'face_' + p.heroKey : (p.heroKey ?? 'player')
    reg(this.add.rectangle(pbX, pbY, pbSz, pbSz, PANEL, 0.9).setStrokeStyle(2, GOLD))
    const pbImg = reg(this.add.image(pbX, pbY - 4, pbFace, 0))
    pbImg.setScale((pbSz - 14) / Math.max(pbImg.width, pbImg.height))
    reg(this.add.text(pbX, pbY + pbSz / 2 - 8, 'Perso', { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 0))
    reg(this.add.text(pbX + pbSz / 2 - 3, pbY - pbSz / 2 + 2, 'C', { fontFamily: 'monospace', fontSize: '8px', color: '#9fb6cc' }).setOrigin(1, 0))
    this.charBtnRect = new Phaser.Geom.Rectangle(pbX - pbSz / 2, pbY - pbSz / 2, pbSz, pbSz)
    const pbHit = reg(this.add.rectangle(pbX, pbY, pbSz, pbSz, 0xffffff, 0.001).setInteractive({ useHandCursor: true }))
    pbHit.on('pointerover', () => pbHit.setFillStyle(0xffe066, 0.16))
    pbHit.on('pointerout', () => pbHit.setFillStyle(0xffffff, 0.001))
    pbHit.on('pointerdown', (po, lx, ly, ev) => { ev?.stopPropagation?.(); this.toggleChar() })

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
    // CLIC sur la minimap -> ouvre la carte du monde (et le clic n'est pas relayé au déplacement)
    this.minimapRect = new Phaser.Geom.Rectangle(mmX, mmY, mmSize, mmSize)
    reg(this.add.rectangle(mmX, mmY, mmSize, mmSize, 0x000000, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggleMap()))
    // boussole N / S / E / O
    const compass = (tx, ty, label, ox, oy) => reg(this.add.text(tx, ty, label, { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#ffe8c2', stroke: '#000', strokeThickness: 3 }).setOrigin(ox, oy))
    compass(mmX + mmSize / 2, mmY + 1, 'N', 0.5, 0)
    compass(mmX + mmSize / 2, mmY + mmSize - 1, 'S', 0.5, 1)
    compass(mmX + mmSize - 2, mmY + mmSize / 2, 'E', 1, 0.5)
    compass(mmX + 2, mmY + mmSize / 2, 'O', 0, 0.5)
    reg(this.add.text(mmX + mmSize / 2, mmY + mmSize + 3, 'M = carte du monde', { fontFamily: 'monospace', fontSize: '9px', color: '#cfe8ff', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 0))

    // --- indicateur JOUR/NUIT : pastille (soleil le jour, lune la nuit) juste à gauche de la minimap ---
    const dnx = mmX - 18
    const dny = mmY + 13
    reg(this.add.circle(dnx, dny, 13, 0x0a1018, 0.78).setStrokeStyle(2, GOLD, 0.7))
    this.sunIcon = reg(this.add.image(dnx, dny, 'icon_sun').setDepth(135))
    this.moonIcon = reg(this.add.image(dnx, dny, 'icon_moon').setDepth(135).setAlpha(0))

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
      const border = item ? itemTint(item) ?? CELL_BORDER : CELL_BORDER
      reg(this.add.rectangle(bx, gy, cell, cell, CELL, 1).setStrokeStyle(item ? 2 : 1, border))
      if (!item) continue
      reg(this.rarityBg(bx, gy, cell - 6, item.rarity)) // filigrane de rareté
      const c = reg(this.add.rectangle(bx, gy, cell, cell, 0x000000, 0).setInteractive({ useHandCursor: true }))
      this.addItemIcon(reg, bx, gy, item, cell - 12)
      c.on('pointerdown', () => {
        // son PAR RÉSULTAT : validation si l'action aboutit, refus (throttlé) sinon -> pas de spam
        if (item.type === 'consumable') {
          this.useConsumable(item)
          Audio.sfx('ui_accept', { detune: 0 })
        } else if (item.type === 'material') {
          this.showToast('Matériau — vends-le ou forge avec', '#e0a866')
          this.playDenied()
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
      c.on('pointerover', () => this.showTip(item, bx, gy - cell / 2, true)) // droppable : bouton « ✖ Lâcher »
      c.on('pointerout', () => this.hideTip())
    }
    if (overflow > 0) {
      reg(this.add.text(panelX + panelW + 6, gy, `+${overflow}`, { fontFamily: 'monospace', fontSize: '13px', color: '#ffe066' }).setOrigin(0, 0.5))
    }

    // POCHE DE MATÉRIAUX : petite bande collée À GAUCHE de la hotbar, toujours visible (icône + quantité)
    const owned = MATERIALS.filter((id) => (p.resources[id] ?? 0) > 0)
    this.matRect = null
    if (owned.length) {
      const mc = 30
      const mgap = 4
      const my = panelY + (panelH - mc) / 2
      const stripW = owned.length * mc + (owned.length - 1) * mgap
      let mx = panelX - 10 - mc // on part juste à gauche de la hotbar et on s'étend vers la gauche
      for (let i = owned.length - 1; i >= 0; i--) {
        const it = ITEMS[owned[i]]
        reg(this.add.rectangle(mx, my, mc, mc, PANEL, 0.82).setOrigin(0, 0).setStrokeStyle(2, RARITY[it.rarity]?.tint ?? GOLD))
        reg(this.rarityBg(mx + mc / 2, my + mc / 2, mc - 6, it.rarity))
        reg(this.addIcon(mx + mc / 2, my + mc / 2, it.icon, mc - 12))
        reg(this.add.text(mx + mc - 2, my + mc - 1, `${p.resources[owned[i]]}`, { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 1))
        const z = reg(this.add.rectangle(mx, my, mc, mc, 0xffffff, 0.001).setOrigin(0, 0).setInteractive())
        z.on('pointerover', () => this.showTip(it, mx + mc / 2, my))
        z.on('pointerout', () => this.hideTip())
        mx -= mc + mgap
      }
      this.matRect = new Phaser.Geom.Rectangle(panelX - 10 - stripW, my, stripW, mc)
    }
  }

  /** Boit une potion : restaure PV et/ou mana, retire l'objet du sac, toast. */
  useConsumable(item) {
    const p = this.game_.player
    if (this.game_.gameOver) return
    // FEU DE CAMP À POSER : crée un foyer temporaire (zone-refuge) à l'endroit du héros.
    if (item.placeFire) {
      if (this.game_.placeCampfire(item)) {
        p.removeItem(item)
        this.showToast('Feu de camp allumé', '#ffb060')
      } else {
        this.showToast('Impossible d’allumer un feu ici', '#e0a866')
        this.playDenied()
      }
      return
    }
    // POTION DE TEMPÉRATURE (feu = immunité froid, givre = immunité chaud) pendant tempDur (10 min)
    if (item.tempBuff) {
      if (!p.tempBuff) p.tempBuff = { fire: 0, frost: 0 }
      p.tempBuff[item.tempBuff] = this.game_.time.now + (item.tempDur ?? 600000)
      p.removeItem(item)
      const label = item.tempBuff === 'fire' ? 'Protégé du froid' : 'Protégé de la chaleur'
      this.showToast(`${label} — 10 min`, item.tempBuff === 'fire' ? '#ffb060' : '#a0e6ff')
      Audio.sfx('ui_accept', { detune: 0 })
      return
    }
    const wantsHeal = (item.heal ?? 0) > 0
    const wantsMana = (item.mana ?? 0) > 0
    const hpFull = p.hp >= p.maxHp
    const manaFull = p.mana >= p.maxMana
    // refus si l'effet utile est déjà au max (on ne gaspille pas la potion)
    if (wantsHeal && !wantsMana && hpFull) return this.showToast('PV déjà au maximum', '#ffd84d')
    if (wantsMana && !wantsHeal && manaFull) return this.showToast('Mana déjà au maximum', '#ffd84d')
    if (wantsHeal && wantsMana && hpFull && manaFull) return this.showToast('PV et mana au maximum', '#ffd84d')
    const parts = []
    if (wantsHeal) {
      const h = p.heal(item.heal)
      if (h > 0) parts.push(`+${h} PV`)
    }
    if (wantsMana) {
      const before = p.mana
      p.mana = Math.min(p.maxMana, p.mana + item.mana)
      const got = Math.round(p.mana - before)
      if (got > 0) parts.push(`+${got} mana`)
    }
    p.removeItem(item) // retire la potion (invVersion++ -> le sac se reconstruit)
    this.showToast(parts.join('   '), '#6fdc6f')
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

  /** Reconstruit le panneau perso au tick suivant (sécurise : on ne détruit pas l'objet en plein clic). */
  refreshChar() {
    this.time.delayedCall(1, () => { if (this.charOpen) this.buildCharPanel() })
  }

  /** Petite case générique (fond bleu nuit + bordure) du panneau perso. */
  charCell(reg, x, y, sz, border) {
    reg(this.add.rectangle(x, y, sz, sz, 0x232f52, 1))
    reg(this.add.rectangle(x, y, sz, sz, 0x121a33, 0).setStrokeStyle(1, 0x121a33))
    reg(this.add.rectangle(x, y, sz, sz, 0x000000, 0).setStrokeStyle(2.5, border))
  }

  /** CASE D'ÉQUIPEMENT (paper-doll WoW) : case biseautée + bordure de QUALITÉ épaisse + HALO qui pulse
   *  (épique/légendaire/set) + objet OU silhouette grisée si vide. Survol éclaire ; clic = retirer. */
  drawEquipSlot(reg, x, y, sz, slot, ghostKey) {
    const p = this.game_.player
    const item = p.equipped[slot]
    const qcol = item ? itemTint(item) ?? GOLD : 0x46557c
    // HALO de qualité derrière (pulse pour les pièces remarquables)
    if (item && (item.set || item.rarity === 'epic' || item.rarity === 'legendary')) {
      const halo = reg(this.add.rectangle(x, y, sz + 12, sz + 12, qcol, 0.3).setBlendMode(Phaser.BlendModes.ADD))
      this.tweens.add({ targets: halo, alpha: 0.55, scaleX: 1.08, scaleY: 1.08, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    }
    // case biseautée (bord clair + creux sombre, ton cuir) + bordure de qualité
    reg(this.add.rectangle(x, y, sz, sz, 0x3d2f1c, 1))
    reg(this.add.rectangle(x, y, sz - 5, sz - 5, 0x1c1208, 1))
    reg(this.add.rectangle(x, y, sz, sz, 0x000000, 0).setStrokeStyle(3, qcol))
    reg(this.add.text(x, y - sz / 2 - 8, SLOT_LABELS[slot], { fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: '#e0c074', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5))
    if (item) { reg(this.rarityBg(x, y, sz - 14, item.rarity)); this.addItemIcon(reg, x, y, item, sz - 18) }
    else if (ghostKey && this.textures.exists(ghostKey)) reg(this.addIcon(x, y, ghostKey, sz - 18)).setAlpha(0.45)
    const hover = reg(this.add.rectangle(x, y, sz - 3, sz - 3, 0xffffff, 0).setVisible(false))
    const hit = reg(this.add.rectangle(x, y, sz, sz, 0xffffff, 0.001).setInteractive({ useHandCursor: !!item }))
    hit.on('pointerover', () => { hover.setFillStyle(0xffffff, 0.12).setVisible(true); if (item) this.showTip(item, x, y - sz / 2) })
    hit.on('pointerout', () => { hover.setVisible(false); this.hideTip() })
    if (item) hit.on('pointerdown', () => { if (p.unequip(slot)) { Audio.sfx('ui_accept', { detune: 0 }); this.refreshChar() } else { this.showToast('Sac plein — libère une place', '#e0a866'); this.playDenied() } this.hideTip() })
  }

  /** CASE DU SAC (inventaire) : objet cliquable -> équiper / boire / (matériau). Survol = infobulle. */
  drawBagSlot(reg, x, y, sz, item) {
    const p = this.game_.player
    this.charCell(reg, x, y, sz, item ? itemTint(item) ?? CELL_BORDER : 0x2a3342)
    if (!item) return
    reg(this.rarityBg(x, y, sz - 12, item.rarity))
    this.addItemIcon(reg, x, y, item, sz - 16)
    const hit = reg(this.add.rectangle(x, y, sz, sz, 0xffffff, 0.001).setInteractive({ useHandCursor: true }))
    hit.on('pointerdown', () => {
      if (item.type === 'consumable') { this.useConsumable(item); Audio.sfx('ui_accept', { detune: 0 }); this.refreshChar() }
      else if (item.type === 'material') { this.showToast('Matériau — vends-le ou forge avec', '#e0a866'); this.playDenied() }
      else if (!canEquip(item, p.className)) { this.showToast(classRestrictionLabel(item), '#e0a866'); this.playDenied() }
      else if (p.equip(item)) { Audio.sfx('ui_accept', { detune: 0 }); this.showItemToast('Équipé', item); this.refreshChar() }
      else { this.showToast('Objet cassé — répare chez Aldric', '#e06666'); this.playDenied() }
      this.hideTip()
    })
    hit.on('pointerover', () => this.showTip(item, x, y - sz / 2))
    hit.on('pointerout', () => this.hideTip())
  }

  buildCharPanel() {
    const p = this.game_.player
    if (!p) return
    this.destroyChar()
    const reg = (o) => { this.charObjects.push(o); return o }
    const cw = this.scale.width
    const ch = this.scale.height
    const cx = cw / 2
    const cy = ch / 2
    // voile quasi opaque avec un TROU uniquement autour des cases du sac (l'inventaire reste visible/cliquable)
    const b = this.bagRect
    const dimA = 0.9
    if (b) {
      reg(this.add.rectangle(0, 0, cw, b.top, 0x000000, dimA).setOrigin(0, 0)) // au-dessus du sac
      reg(this.add.rectangle(0, b.bottom, cw, ch - b.bottom, 0x000000, dimA).setOrigin(0, 0)) // en dessous
      reg(this.add.rectangle(0, b.top, b.left, b.height, 0x000000, dimA).setOrigin(0, 0)) // à gauche
      reg(this.add.rectangle(b.right, b.top, cw - b.right, b.height, 0x000000, dimA).setOrigin(0, 0)) // à droite
      reg(this.add.rectangle(b.centerX, b.centerY, b.width + 4, b.height + 4, 0x000000, 0).setStrokeStyle(2, GOLD)) // liseré doré autour du sac
    } else {
      reg(this.add.rectangle(0, 0, cw, ch, 0x000000, dimA).setOrigin(0, 0))
    }
    // CADRE cuir/bois + double bordure dorée (immersif) — responsive
    const W = Math.min(410, cw - 18)
    const H = Math.min(462, ch - 18)
    const x0 = cx - W / 2
    const y0 = cy - H / 2
    // fond en DÉGRADÉ vertical CUIR/BOIS (haut chaud -> bas profond) + bordures dorées
    const grad = reg(this.add.graphics())
    grad.fillGradientStyle(0x2c2014, 0x2c2014, 0x130c06, 0x130c06, 1)
    grad.fillRect(x0, y0, W, H)
    reg(this.add.rectangle(cx, cy, W, H, 0x000000, 0).setStrokeStyle(3, GOLD))
    reg(this.add.rectangle(cx, cy, W - 8, H - 8, 0x000000, 0).setStrokeStyle(1, 0x8a6d2e))
    // COINS dorés ornementés (équerres en L)
    const L = 18, T = 3
    const corner = (px, py, sx, sy) => {
      reg(this.add.rectangle(px, py, L, T, GOLD).setOrigin(sx < 0 ? 1 : 0, sy < 0 ? 1 : 0))
      reg(this.add.rectangle(px, py, T, L, GOLD).setOrigin(sx < 0 ? 1 : 0, sy < 0 ? 1 : 0))
    }
    corner(x0 + 3, y0 + 3, 1, 1)
    corner(x0 + W - 3, y0 + 3, -1, 1)
    corner(x0 + 3, y0 + H - 3, 1, -1)
    corner(x0 + W - 3, y0 + H - 3, -1, -1)
    // barre de titre (cuir + or)
    reg(this.add.rectangle(cx, y0 + 17, W - 12, 30, 0x2a1f12, 0.96).setStrokeStyle(1, 0x6b5526))
    const ch_ = this.game_.character ?? {}
    const clsName = { warrior: 'Guerrier', mage: 'Mage', tank: 'Tank', healer: 'Soigneur' }[p.className] ?? ''
    reg(this.add.text(cx, y0 + 10, ch_.name ?? 'Personnage', { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(0.5, 0))
    reg(this.add.text(cx, y0 + 30, `${clsName}  ·  Niveau ${p.level}`, { fontFamily: 'monospace', fontSize: '9px', color: '#cdb78a' }).setOrigin(0.5, 0))
    const xBtn = reg(this.add.text(x0 + W - 16, y0 + 8, '✕', { fontFamily: 'monospace', fontSize: '15px', color: '#e0a0a0' }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true }))
    xBtn.on('pointerdown', () => this.closeChar())

    // HÉROS au centre = FACESET (portrait) cadre doré + lueur de la couleur de magie de la classe
    const heroY = y0 + 128
    const faceKey = this.textures.exists('face_' + p.heroKey) ? 'face_' + p.heroKey : (p.heroKey ?? 'player')
    const mcol = p.magicColor && p.magicColor !== 0xffffff ? p.magicColor : 0xc8a24a
    reg(this.add.ellipse(cx, heroY, 108, 108, mcol, 0.22).setBlendMode(Phaser.BlendModes.ADD))
    reg(this.add.rectangle(cx, heroY, 84, 84, 0x1a1208, 1))
    reg(this.add.rectangle(cx, heroY, 84, 84, mcol, 0.12))
    reg(this.add.rectangle(cx, heroY, 84, 84, 0x000000, 0).setStrokeStyle(2.5, GOLD))
    reg(this.add.rectangle(cx, heroY, 80, 80, 0x000000, 0).setStrokeStyle(1, 0x8a6d2e))
    const face = reg(this.add.image(cx, heroY, faceKey, 0))
    face.setScale(74 / Math.max(face.width, face.height))

    // 4 EMPLACEMENTS en croix (Arme/Armure en haut, Relique/Anneau en bas) — plus grands
    const sz = 62
    const colX = 122
    const rowDy = 48
    const ghost = { weapon: 'slot_weapon', armor: 'slot_armor', focus: 'slot_relic', ring: 'slot_ring' }
    const place = {
      weapon: { x: cx - colX, y: heroY - rowDy }, armor: { x: cx + colX, y: heroY - rowDy },
      focus: { x: cx - colX, y: heroY + rowDy }, ring: { x: cx + colX, y: heroY + rowDy },
    }
    SLOTS.forEach((slot) => this.drawEquipSlot(reg, place[slot].x, place[slot].y, sz, slot, ghost[slot]))

    // ===== SET DE CLASSE — compact : x/4 + bonus 2/4 + compétence débloquée =====
    const set = SETS[p.className]
    const st = setStatus(p.equipped, p.className)
    const count = st.count
    const emerald = '#3ddc84'
    const setTop = y0 + 212
    const setH = 96
    if (count > 0) { const sg = reg(this.add.rectangle(cx, setTop + setH / 2, W - 18, setH + 8, 0x2ecc71, 0.12).setBlendMode(Phaser.BlendModes.ADD)); this.tweens.add({ targets: sg, alpha: 0.28, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' }) }
    reg(this.add.rectangle(cx, setTop + setH / 2, W - 28, setH, 0x241a0f, 0.8).setStrokeStyle(2, count > 0 ? 0x2ecc71 : 0x6b5526))
    if (set) {
      const fmt = (b) => Object.entries(b).map(([k, v]) => (k === 'spellPower' ? `+${Math.round(v * 100)}% effet` : k === 'spellDuration' ? `+${Math.round(v * 100)}% durée` : `+${v} ${({ attack: 'ATQ', defense: 'DEF', hp: 'PV', mana: 'Mana', manaRegen: 'Mana/s' }[k] ?? k)}`)).join(', ')
      reg(this.add.text(cx, setTop + 7, `✦ Set de ${clsName}   ${count}/4`, { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: emerald }).setOrigin(0.5, 0))
      reg(this.add.text(x0 + 26, setTop + 30, '2 pièces', { fontFamily: 'monospace', fontSize: '10px', color: '#cdb78a' }).setOrigin(0, 0))
      reg(this.add.text(x0 + W - 26, setTop + 30, fmt(set.bonus2), { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: count >= 2 ? emerald : '#7c715a' }).setOrigin(1, 0))
      reg(this.add.text(x0 + 26, setTop + 48, '4 pièces', { fontFamily: 'monospace', fontSize: '10px', color: '#cdb78a' }).setOrigin(0, 0))
      reg(this.add.text(x0 + W - 26, setTop + 48, fmt(set.bonus4), { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: count >= 4 ? emerald : '#7c715a' }).setOrigin(1, 0))
      reg(this.add.text(cx, setTop + 70, `★ ${set.skillName}  ·  butin de boss`, { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: count >= 4 ? '#ffe066' : '#d8b25a' }).setOrigin(0.5, 0))
    }

    // ===== CARACTÉRISTIQUES (stats lisibles + icônes) =====
    const stBox = y0 + H - 126
    reg(this.add.rectangle(cx, stBox + 56, W - 28, 112, 0x1c140c, 0.85).setStrokeStyle(1.5, 0x6b5526))
    reg(this.add.text(cx, stBox + 3, 'CARACTÉRISTIQUES', { fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: '#c8a24a' }).setOrigin(0.5, 0))
    const iX = x0 + 30, lX = x0 + 46, rXv = x0 + W - 32
    let sy = stBox + 24
    const stat = (iconKey, label, value, color) => {
      if (iconKey && this.textures.exists(iconKey)) { const ic = reg(this.add.image(iX, sy, iconKey)); ic.setScale(14 / Math.max(ic.width, ic.height)) }
      reg(this.add.text(lX, sy, label, { fontFamily: 'monospace', fontSize: '11px', color: '#d8c8a8' }).setOrigin(0, 0.5))
      reg(this.add.text(rXv, sy, value, { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color }).setOrigin(1, 0.5))
      sy += 18
    }
    stat('wpn_sword', 'Attaque', `${p.attackPower}`, '#ff9a5a')
    stat('stat_def', 'Défense', `${p.defense}`, '#7fb3ff')
    stat('drop_heart', 'Points de vie', `${Math.round(p.hp)} / ${p.maxHp}`, '#7CFC9A')
    stat('pot_mana', 'Mana', `${Math.round(p.mana)} / ${p.maxMana}`, '#7fd8ff')
    stat('pot_mana', 'Mana / seconde', `${p.manaRegen}`, '#7fd8ff')

    reg(this.add.text(cx, y0 + H - 12, 'Clic objet du sac = équiper · clic slot = retirer · C = fermer', { fontFamily: 'monospace', fontSize: '8px', color: '#8a7a5a' }).setOrigin(0.5))
  }

  // ---------- boutique (marchand) ----------

  openShop() {
    if (this.game_.gameOver) return
    if (this.charOpen) this.closeChar()
    if (this.forgeOpen) this.closeForge()
    this.shopOpen = true
    this.shopBuyCat = 'weapon' // catégorie d'achat par défaut (colonne ACHETER)
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
    if (p.bagFull()) {
      // cap strict : on n'achète pas si le sac est plein (l'objet n'a nulle part où aller)
      this.showToast(`Sac plein (${p.invMax}) — vends ou lâche un objet`, '#e0a866')
      this.playDenied()
      return
    }
    p.gold -= item.price
    p.addItem(cloneItem(item))
    Audio.sfx('ui_accept', { detune: 0 })
    this.buildShop()
  }

  sellItem(item) {
    const p = this.game_.player
    if (p.removeItem(item)) {
      p.gold += sellPrice(item)
      this.buildShop()
    }
  }

  /** Carte spéciale d'achat du bateau (onglet « Bateau ») — déverrouille la navigation sur l'eau. */
  drawBoatCard(reg, x, y, w) {
    const p = this.game_.player
    const owned = p.hasBoat
    const cardW = (w - 16) / 3 // même largeur qu'une carte de la grille (3 colonnes)
    const footer = owned
      ? { text: '✓ Possédé', color: '#7cfc9a' }
      : { text: `${BOAT_ITEM.price} or`, color: p.gold >= BOAT_ITEM.price ? '#ffd84d' : '#e06666', onClick: () => this.buyBoat() }
    this.drawCard(reg, x, y, cardW, 62, BOAT_ITEM, footer)
    reg(this.add.text(x + cardW + 18, y + 2,
      owned
        ? "Tu possèdes la barque.\nMarche sur l'eau pour embarquer\net rejoindre les Terres maudites."
        : "Achat unique. Une fois acquise,\nmarche sur l'eau pour embarquer\nautomatiquement et explorer le large\n(Terres maudites = end-game).",
      { fontFamily: 'monospace', fontSize: '11px', color: '#cfe8ff', lineSpacing: 4 }).setOrigin(0, 0))
  }

  /** Achat UNIQUE du bateau : pose le flag `hasBoat` (pas d'objet de sac). */
  buyBoat() {
    const p = this.game_.player
    if (p.hasBoat) return
    if (p.gold < BOAT_ITEM.price) {
      this.showToast("Pas assez d'or pour la barque", '#e06666')
      this.playDenied()
      return
    }
    p.gold -= BOAT_ITEM.price
    p.hasBoat = true
    Audio.sfx('ui_accept', { detune: 0 })
    this.showToast("Barque achetée ! Marche sur l'eau pour naviguer.", '#7cfc9a')
    this.buildShop()
  }

  /** Onglet Matériaux du marchand : vendre les ressources empilées (par lot) + tout vendre. */
  drawResourceSell(reg, x, y, w) {
    const p = this.game_.player
    const owned = MATERIALS.filter((id) => (p.resources[id] ?? 0) > 0)
    if (!owned.length) {
      reg(this.add.text(x + w / 2, y + 50, '(aucun matériau — tue des monstres pour en récolter)', { fontFamily: 'monospace', fontSize: '11px', color: '#7c8aa0' }).setOrigin(0.5))
      return
    }
    const cols = 3
    const gap = 8
    const cardW = (w - (cols - 1) * gap) / cols
    const cardH = 72
    owned.forEach((id, i) => {
      const it = ITEMS[id]
      const cx = x + (i % cols) * (cardW + gap)
      const cy = y + Math.floor(i / cols) * (cardH + gap)
      const qty = p.resources[id]
      const unit = sellPrice(it)
      reg(this.add.rectangle(cx, cy, cardW, cardH, CELL, 1).setOrigin(0, 0).setStrokeStyle(2, RARITY[it.rarity]?.tint ?? CELL_BORDER))
      reg(this.rarityBg(cx + 22, cy + 22, 28, it.rarity))
      reg(this.addIcon(cx + 22, cy + 22, it.icon, 26))
      reg(this.add.text(cx + 40, cy + 8, `${it.name} ×${qty}`, { fontFamily: 'monospace', fontSize: '10px', color: RARITY[it.rarity]?.color ?? '#fff', wordWrap: { width: cardW - 46 } }).setOrigin(0, 0))
      reg(this.add.text(cx + 40, cy + 30, `${unit} or/u`, { fontFamily: 'monospace', fontSize: '9px', color: '#9fb6cc' }).setOrigin(0, 0))
      this.drawForgeBtn(reg, cx + 8, cy + cardH - 22, cardW - 16, true, `Vendre tout +${unit * qty}`, () => this.sellResource(id))
    })
    const rows = Math.ceil(owned.length / cols)
    const total = owned.reduce((s, id) => s + sellPrice(ITEMS[id]) * p.resources[id], 0)
    const by = y + rows * (cardH + gap) + 6
    this.drawForgeBtn(reg, x + w / 2 - 90, by, 180, true, `Tout vendre  (+${total} or)`, () => this.sellAllResources())
    reg(this.add.text(x + w / 2, by + 26, 'Les matériaux servent aussi à AMÉLIORER ton équipement chez Aldric le forgeron.', { fontFamily: 'monospace', fontSize: '9px', color: '#ffe066', align: 'center', wordWrap: { width: w } }).setOrigin(0.5, 0))
  }

  /** Vend tout un stack de matériau. */
  sellResource(id) {
    const p = this.game_.player
    const qty = p.resources[id] ?? 0
    if (qty <= 0) return
    p.gold += sellPrice(ITEMS[id]) * qty
    p.removeResource(id, qty)
    Audio.sfx('ui_coin', { detune: 0 })
    this.buildShop()
  }

  /** Vend TOUS les matériaux d'un coup. */
  sellAllResources() {
    const p = this.game_.player
    let total = 0
    for (const id of MATERIALS) {
      const qty = p.resources[id] ?? 0
      if (qty > 0) { total += sellPrice(ITEMS[id]) * qty; p.removeResource(id, qty) }
    }
    if (total > 0) { p.gold += total; Audio.sfx('ui_coin', { detune: 0 }) }
    this.buildShop()
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
    reg(this.add.rectangle(0, 0, cw, ch, 0x000000, 0.6).setOrigin(0, 0).setInteractive().on('pointerdown', () => this.closeShop())) // clic hors panneau = fermer
    const W = 500
    const H = 470
    const x0 = cw / 2 - W / 2
    const y0 = ch / 2 - H / 2
    reg(this.add.rectangle(cw / 2, ch / 2, W, H, PANEL, 0.98).setStrokeStyle(2, GOLD).setInteractive()) // absorbe les clics DANS le panneau
    this.drawPanelHeader(reg, x0, y0, W, 'merchant_face', undefined, 'Marchand', p.gold)

    // DEUX COLONNES toujours visibles : ACHETER (gauche, filtres de catégorie) | VENDRE (droite, sac + matériaux)
    const colW = 222
    const lx = x0 + 14
    const rx = x0 + 264
    const top = y0 + 68
    const bottom = y0 + H - 16
    reg(this.add.rectangle(x0 + W / 2, y0 + 52, 1, H - 66, GOLD, 0.35).setOrigin(0.5, 0)) // séparateur vertical
    reg(this.add.text(lx + colW / 2, y0 + 50, 'ACHETER', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(0.5, 0))
    reg(this.add.text(rx + colW / 2, y0 + 50, 'VENDRE', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#7cfc9a' }).setOrigin(0.5, 0))
    this.drawBuyColumn(reg, lx, top, colW, bottom)
    this.drawSellColumn(reg, rx, top, colW, bottom)
    reg(this.add.text(cw / 2, y0 + H - 8, 'Échap = fermer', { fontFamily: 'monospace', fontSize: '9px', color: '#9fb6cc' }).setOrigin(0.5, 1))
  }

  /** Ligne compacte d'objet (boutique) : icône + nom (+×qté) + bouton à droite. */
  drawShopRow(reg, x, y, w, h, item, qty, btn) {
    reg(this.add.rectangle(x, y, w, h, CELL, 1).setOrigin(0, 0).setStrokeStyle(1.5, itemTint(item) ?? CELL_BORDER))
    reg(this.rarityBg(x + 16, y + h / 2, 24, item.rarity))
    this.addItemIcon(reg, x + 16, y + h / 2, item, 20)
    reg(this.add.text(x + 30, y + 5, itemName(item) + (qty > 1 ? ` ×${qty}` : ''), { fontFamily: 'monospace', fontSize: '9px', color: itemColor(item), wordWrap: { width: w - 94 } }).setOrigin(0, 0))
    const hov = reg(this.add.rectangle(x, y, w - 62, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive())
    hov.on('pointerover', () => this.showTip(item, x + w / 2, y))
    hov.on('pointerout', () => this.hideTip())
    this.drawForgeBtn(reg, x + w - 58, y + (h - 18) / 2, 52, btn.enabled, btn.label, btn.onClick || (() => {}))
  }

  /** Colonne ACHETER : filtres de catégorie + liste des objets achetables. */
  drawBuyColumn(reg, x, y, w, bottom) {
    const p = this.game_.player
    if (!this.shopBuyCat) this.shopBuyCat = 'weapon'
    const cats = [
      { key: 'weapon', label: 'Armes' }, { key: 'armor', label: 'Armures' }, { key: 'focus', label: 'Reliques' },
      { key: 'ring', label: 'Anneaux' }, { key: 'potion', label: 'Potions' }, { key: 'boat', label: 'Bateau' },
    ]
    const bw = (w - 2 * 4) / 3
    cats.forEach((c, i) => {
      const bx = x + (i % 3) * (bw + 4)
      const by = y + Math.floor(i / 3) * 22
      this.drawTab(reg, bx, by, c.label, this.shopBuyCat === c.key, () => { this.shopBuyCat = c.key; this.buildShop() }, bw)
    })
    const listY = y + 50
    if (this.shopBuyCat === 'boat') {
      const owned = p.hasBoat
      this.drawShopRow(reg, x, listY, w, 40, BOAT_ITEM, 1, owned ? { label: '✓ Possédé', enabled: false } : { label: `${BOAT_ITEM.price}or`, enabled: p.gold >= BOAT_ITEM.price, onClick: () => this.buyBoat() })
      reg(this.add.text(x, listY + 46, "Déverrouille la navigation sur l'eau\n→ accès aux Terres maudites (end-game).", { fontFamily: 'monospace', fontSize: '9px', color: '#9fd0ff', lineSpacing: 3 }).setOrigin(0, 0))
      return
    }
    let items
    if (this.shopBuyCat === 'potion') items = SHOP_STOCK.filter((it) => it.type === 'consumable')
    else items = SHOP_STOCK.filter((it) => it.slot === this.shopBuyCat && (this.shopBuyCat !== 'weapon' || canEquip(it, p.className)))
    const rowH = 40
    const gap = 4
    const maxRows = Math.floor((bottom - listY) / (rowH + gap))
    items.slice(0, maxRows).forEach((it, i) => {
      this.drawShopRow(reg, x, listY + i * (rowH + gap), w, rowH, it, 1, { label: `${it.price}or`, enabled: p.gold >= it.price, onClick: () => this.buyItem(it) })
    })
    if (items.length > maxRows) reg(this.add.text(x + w, listY + maxRows * (rowH + gap), `+${items.length - maxRows}…`, { fontFamily: 'monospace', fontSize: '9px', color: '#ffe066' }).setOrigin(1, 0))
  }

  /** Colonne VENDRE : objets du sac + stacks de matériaux, chacun avec son prix de revente. */
  drawSellColumn(reg, x, y, w, bottom) {
    const p = this.game_.player
    const rows = []
    for (const it of p.inventory) rows.push({ item: it, qty: 1, btn: { label: `+${sellPrice(it)}`, enabled: true, onClick: () => this.sellItem(it) } })
    for (const id of MATERIALS) {
      const q = p.resources[id] ?? 0
      if (q > 0) rows.push({ item: ITEMS[id], qty: q, btn: { label: `+${sellPrice(ITEMS[id]) * q}`, enabled: true, onClick: () => this.sellResource(id) } })
    }
    const matTotal = MATERIALS.reduce((s, id) => s + sellPrice(ITEMS[id]) * (p.resources[id] ?? 0), 0)
    if (!rows.length) {
      reg(this.add.text(x + w / 2, y + 40, '(rien à vendre)', { fontFamily: 'monospace', fontSize: '11px', color: '#7c8aa0' }).setOrigin(0.5))
      return
    }
    const rowH = 38
    const gap = 4
    const listBottom = matTotal > 0 ? bottom - 24 : bottom // réserve la place du bouton "tout vendre"
    const maxRows = Math.floor((listBottom - y) / (rowH + gap))
    rows.slice(0, maxRows).forEach((r, i) => this.drawShopRow(reg, x, y + i * (rowH + gap), w, rowH, r.item, r.qty, r.btn))
    if (rows.length > maxRows) reg(this.add.text(x + w, y + maxRows * (rowH + gap), `+${rows.length - maxRows}…`, { fontFamily: 'monospace', fontSize: '9px', color: '#ffe066' }).setOrigin(1, 0))
    if (matTotal > 0) this.drawForgeBtn(reg, x, bottom - 18, w, true, `Vendre tous les matériaux (+${matTotal})`, () => this.sellAllResources())
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
    reg(this.add.rectangle(x, y, w, h, CELL, 1).setOrigin(0, 0).setStrokeStyle(2, itemTint(item) ?? CELL_BORDER))
    reg(this.rarityBg(x + 20, y + 22, 30, item.rarity)) // filigrane de rareté derrière l'icône
    this.addItemIcon(reg, x + 20, y + 22, item, 26)
    reg(this.add.text(x + 38, y + 8, itemName(item), { fontFamily: 'monospace', fontSize: '10px', color: itemColor(item), wordWrap: { width: w - 44 } }).setOrigin(0, 0))
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
    reg(this.add.rectangle(0, 0, cw, ch, 0x000000, 0.6).setOrigin(0, 0).setInteractive().on('pointerdown', () => this.closeForge())) // clic hors panneau = fermer
    const W = 500
    const H = 470
    const x0 = cw / 2 - W / 2
    const y0 = ch / 2 - H / 2
    reg(this.add.rectangle(cw / 2, ch / 2, W, H, PANEL, 0.98).setStrokeStyle(2, GOLD).setInteractive()) // absorbe les clics DANS le panneau
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
    const p = this.game_.player
    reg(this.add.rectangle(x, y, w, h, CELL, 1).setOrigin(0, 0).setStrokeStyle(2, itemTint(item) ?? CELL_BORDER))
    reg(this.rarityBg(x + 22, y + 26, 34, item.rarity)) // filigrane de rareté derrière l'icône
    this.addItemIcon(reg, x + 22, y + 26, item, 30)
    reg(this.add.text(x + 44, y + 8, itemName(item) + (equipped ? '  (équipé)' : ''), { fontFamily: 'monospace', fontSize: '10px', color: itemColor(item), wordWrap: { width: w - 50 } }).setOrigin(0, 0))
    const cur = item.durability ?? item.dur
    this.drawDurBar(reg, x + 44, y + 38, w - 54, item)
    reg(this.add.text(x + 44, y + 42, `${cur}/${item.dur}`, { fontFamily: 'monospace', fontSize: '8px', color: '#9fb6cc' }).setOrigin(0, 0))
    // infobulle au survol de la carte
    const hov = reg(this.add.rectangle(x, y, w, h - 26, 0xffffff, 0.001).setOrigin(0, 0).setInteractive())
    hov.on('pointerover', () => this.showTip(item, x + w / 2, y))
    hov.on('pointerout', () => this.hideTip())
    // COÛT D'AMÉLIORATION bien visible : or + MATÉRIAUX (vert = tout en stock, orange = il manque qqch)
    const uCost = upgradeCost(item)
    const rCost = repairCost(item)
    const bw = (w - 24) / 2
    const by = y + h - 22
    let upEnabled = false
    if (uCost == null) {
      reg(this.add.text(x + 8, y + 51, 'Amélioration au maximum (+5)', { fontFamily: 'monospace', fontSize: '9px', color: '#9fb6cc' }).setOrigin(0, 0))
    } else {
      const mats = this.upgradeMats(item)
      upEnabled = p.gold >= uCost && this.hasMats(mats)
      reg(this.add.text(x + 8, y + 51, `${uCost} or + ${this.matsLabel(mats)}`, { fontFamily: 'monospace', fontSize: '9px', color: upEnabled ? '#9be8a0' : '#e0a060', wordWrap: { width: w - 16 } }).setOrigin(0, 0))
    }
    this.drawForgeBtn(reg, x + 8, by, bw, rCost > 0 && p.gold >= rCost, rCost > 0 ? `Réparer ${rCost}` : 'Intact', () => this.repairItem(item))
    this.drawForgeBtn(reg, x + 16 + bw, by, bw, upEnabled, uCost != null ? `Forger +${(item.upgrade ?? 0) + 1}` : 'Max +5', () => this.upgradeItem(item))
  }

  /** Matériaux requis pour la PROCHAINE amélioration (armes ET armures) : progression par niveau —
   *  Cuir (commun, tôt) → Lingot de fer (milieu) → Cristal (rare, haut niveau). */
  upgradeMats(item) {
    switch (item.upgrade ?? 0) {
      case 0: return { mat_leather: 2 } // +1 : 2 Cuir
      case 1: return { mat_leather: 3, mat_essence: 1 } // +2 : 3 Cuir + 1 Lingot
      case 2: return { mat_essence: 2 } // +3 : 2 Lingots
      case 3: return { mat_essence: 3, mat_crystal: 1 } // +4 : 3 Lingots + 1 Cristal
      default: return { mat_essence: 2, mat_crystal: 2 } // +5 : 2 Lingots + 2 Cristal
    }
  }

  hasMats(mats) {
    const p = this.game_.player
    return Object.entries(mats).every(([id, q]) => (p.resources[id] ?? 0) >= q)
  }

  matsLabel(mats) {
    return Object.entries(mats).map(([id, q]) => `${q} ${ITEMS[id].name}`).join(' + ')
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
    const mats = this.upgradeMats(item)
    if (!this.hasMats(mats)) {
      this.showToast('Matériaux insuffisants — ' + this.matsLabel(mats), '#e06666')
      this.playDenied()
      return
    }
    p.gold -= cost
    for (const [id, q] of Object.entries(mats)) p.removeResource(id, q)
    item.upgrade = (item.upgrade ?? 0) + 1
    item.durability = item.dur // l'amélioration répare aussi
    p.invVersion++
    if (p.equipped[item.slot] === item) p.recomputeStats()
    this.showToast(`Amélioré : ${itemName(item)}`, itemColor(item))
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

  /** Ouvre/ferme la carte du monde (touche M ET clic sur la minimap). */
  toggleMap() {
    if (this.mapOpen) this.closeMap()
    else if (!this.dialogueOpen && !this.forgeOpen && !this.charOpen && !this.shopOpen && !this.pauseOpen) this.openMap()
  }

  openMap() {
    if (this.game_.gameOver) return
    this.mapOpen = true
    this.scene.pause('GameScene')
    Audio.sfx('ui_accept', { detune: 0 })
    this.buildWorldMap()
  }

  closeMap() {
    this.mapOpen = false
    this.mapBagPulse?.remove() // stoppe la pulsation du sac (sinon tween sur objet détruit)
    this.mapBagPulse = null
    this.mapObjects.forEach((o) => o.destroy())
    this.mapObjects = []
    Audio.sfx('ui_cancel', { detune: 0 })
    this.scene.resume('GameScene')
  }

  // ---------- quêtes : suivi HUD + journal (J) ----------

  updateQuestTracker(p) {
    const q = p.quest ? QUESTS[p.quest.id] : null
    if (!q || this.game_.gameOver) { this.qtAll?.forEach((o) => o.setVisible(false)); return }
    const goal = questGoal(q)
    const prog = questProgress(p, q)
    const ready = questComplete(p, q)
    this.qtAll.forEach((o) => o.setVisible(true))
    this.qt.title.setText(q.title)
    // objectif lisible + couleur (vert quand prêt à rendre)
    const obj = ready
      ? '→ Retourne voir ' + q.giver
      : (q.type === 'talk' ? 'Parler à ' + q.target : `${q.targetName}  ${prog}/${goal}`)
    this.qt.obj.setText(obj).setColor(ready ? '#7cfc9a' : '#cfe2ff')
    // barre de progression
    const ratio = goal > 0 ? prog / goal : 0
    this.qt.bar.width = Math.max(0, this.qt.w * Phaser.Math.Clamp(ratio, 0, 1))
    this.qt.bar.fillColor = ready ? 0x7cfc9a : 0x7cc4ff
    const ring = ready ? 0x7cfc9a : 0xffcf2a
    this.qt.bg.setStrokeStyle(2, ring)
    this.qt.accent.fillColor = ring
  }

  refreshQuest() { const p = this.game_?.player; if (p) this.updateQuestTracker(p) }

  questRewardText(q) {
    const r = q.reward ?? {}
    const parts = []
    if (r.xp) parts.push(r.xp + ' XP')
    if (r.gold) parts.push(r.gold + ' or')
    if (r.item && ITEMS[r.item]) parts.push(ITEMS[r.item].name)
    return parts.join(', ') || '—'
  }

  toggleJournal() {
    if (this.game_.gameOver || this.pauseOpen) return
    if (this.journalOpen) this.closeJournal()
    else if (!this.dialogueOpen && !this.shopOpen && !this.forgeOpen && !this.charOpen && !this.mapOpen) this.openJournal()
  }

  openJournal() {
    this.journalOpen = true
    this.scene.pause('GameScene')
    Audio.sfx('ui_accept', { detune: 0 })
    this.buildJournal()
  }

  closeJournal() {
    this.journalOpen = false
    this.journalObjects.forEach((o) => o.destroy())
    this.journalObjects = []
    Audio.sfx('ui_cancel', { detune: 0 })
    this.scene.resume('GameScene')
  }

  buildJournal() {
    const p = this.game_.player
    if (!p) return
    this.journalObjects.forEach((o) => o.destroy())
    this.journalObjects = []
    const reg = (o) => { this.journalObjects.push(o); return o }
    const cw = this.scale.width
    const ch = this.scale.height
    reg(this.add.rectangle(0, 0, cw, ch, 0x000000, 0.55).setOrigin(0, 0).setInteractive().on('pointerdown', () => this.closeJournal()))
    const W = 400
    const H = 300
    const x0 = cw / 2 - W / 2
    const y0 = ch / 2 - H / 2
    reg(this.add.rectangle(cw / 2, ch / 2, W, H, PANEL, 0.98).setStrokeStyle(2, GOLD).setInteractive())
    reg(this.add.text(cw / 2, y0 + 14, 'Journal de quêtes', { fontFamily: 'Georgia, serif', fontSize: '18px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(0.5, 0))

    const q = p.quest ? QUESTS[p.quest.id] : null
    const y = y0 + 54
    if (q) {
      const ready = questComplete(p, q)
      reg(this.add.text(x0 + 20, y, '✦ ' + q.title, { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: ready ? '#7cfc9a' : '#ffe9a8' }).setOrigin(0, 0))
      reg(this.add.text(x0 + 20, y + 22, q.desc, { fontFamily: 'monospace', fontSize: '11px', color: '#cfe2ff', wordWrap: { width: W - 40 }, lineSpacing: 2 }).setOrigin(0, 0))
      const oy = y + 76
      const obj = q.type === 'talk' ? (ready ? '✓ Parler accompli' : 'Parler à ' + q.target) : `${q.targetName} : ${questProgress(p, q)}/${questGoal(q)}`
      reg(this.add.text(x0 + 20, oy, 'Objectif : ' + obj, { fontFamily: 'monospace', fontSize: '12px', color: ready ? '#7cfc9a' : '#ffd24a' }).setOrigin(0, 0))
      reg(this.add.text(x0 + 20, oy + 18, 'Récompense : ' + this.questRewardText(q), { fontFamily: 'monospace', fontSize: '11px', color: '#9fb6cc' }).setOrigin(0, 0))
      if (ready) reg(this.add.text(x0 + 20, oy + 38, '→ Retourne voir ' + q.giver + ' (icône ?).', { fontFamily: 'monospace', fontSize: '11px', color: '#7cfc9a' }).setOrigin(0, 0))
    } else {
      const nid = nextQuestId(p)
      const msg = nid ? `Une quête t'attend chez ${QUESTS[nid].giver} — cherche l'icône « ! » au village.` : 'Toutes les quêtes sont terminées. Bravo, aventurier !'
      reg(this.add.text(cw / 2, y + 30, msg, { fontFamily: 'monospace', fontSize: '12px', color: '#cfe2ff', align: 'center', wordWrap: { width: W - 50 } }).setOrigin(0.5, 0))
    }
    reg(this.add.text(cw / 2, y0 + H - 32, `Quêtes accomplies : ${(p.questsDone ?? []).length} / ${Object.keys(QUESTS).length}`, { fontFamily: 'monospace', fontSize: '11px', color: '#ffe066' }).setOrigin(0.5, 0))
    reg(this.add.text(cw / 2, y0 + H - 15, 'J / Échap / clic dehors : fermer', { fontFamily: 'monospace', fontSize: '9px', color: '#9fb6cc' }).setOrigin(0.5, 0))
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
    reg(this.add.rectangle(0, 0, cw, ch, 0x05070c, 0.92).setOrigin(0, 0).setDepth(300).setInteractive().on('pointerdown', () => this.closeMap())) // clic = fermer la carte

    const mw = g.mapW
    const mh = g.mapH
    // CADRAGE sur l'île : on n'affiche pas toute la grille d'océan, juste les terres + une marge
    // (bornes `landBounds` calculées dans GameScene.setupMinimap), zoomées pour remplir l'écran.
    const lb = g.landBounds
    const pad = 12
    const minX = lb ? Math.max(0, lb.minX - pad) : 0
    const minY = lb ? Math.max(0, lb.minY - pad) : 0
    const maxX = lb ? Math.min(mw, lb.maxX + pad) : mw
    const maxY = lb ? Math.min(mh, lb.maxY + pad) : mh
    const boxW = maxX - minX
    const boxH = maxY - minY
    const availW = cw * 0.86
    const availH = ch * 0.78
    const cell = Math.min(availW / boxW, availH / boxH)
    const mapPxW = cell * boxW
    const mapPxH = cell * boxH
    const leftX = (cw - mapPxW) / 2
    const topY = (ch - mapPxH) / 2 + 10
    const ox = leftX - minX * cell // -> ox + tx*cell = position écran (cadrée) de la tuile tx
    const oy = topY - minY * cell

    const COLOR = { ocean: 0x274b78, prairie: 0x9bcf5a, forest: 0x3e8b41, snow: 0xe9f1ff, desert: 0xd9bd72, cursed: 0x7c4a63 }
    const gfx = reg(this.add.graphics().setDepth(301))
    // fond océan (sur la zone cadrée seulement)
    gfx.fillStyle(COLOR.ocean, 1).fillRect(leftX, topY, mapPxW, mapPxH)
    const S = 2 // pas d'échantillonnage (perf)
    for (let ty = minY; ty < maxY; ty += S) {
      for (let tx = minX; tx < maxX; tx += S) {
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
    reg(this.add.rectangle(leftX + mapPxW / 2, topY + mapPxH / 2, mapPxW, mapPxH).setStrokeStyle(2, GOLD).setDepth(302))

    // marqueur VILLAGE
    const vx = ox + g.cx * cell
    const vy = oy + g.cy * cell
    reg(this.add.star(vx, vy, 5, 3, 6, 0xffe066).setDepth(303).setStrokeStyle(1, 0x5a4a10))
    reg(this.add.text(vx, vy - 10, 'Village', { fontFamily: 'monospace', fontSize: '11px', color: '#ffe066', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(303))

    // marqueur SAC DE MORT (A1) : gros POINT BLEU pulsant + contour blanc -> très repérable
    const bag = g.player?.deathBag
    if (bag) {
      const bx = ox + (bag.x / g.tile) * cell
      const by = oy + (bag.y / g.tile) * cell
      const halo = reg(this.add.circle(bx, by, 7, 0x2f8bff, 0.5).setDepth(304))
      this.mapBagPulse?.remove()
      this.mapBagPulse = this.tweens.add({ targets: halo, scale: 2.2, alpha: 0, duration: 900, repeat: -1, ease: 'Sine.out' })
      reg(this.add.circle(bx, by, 5, 0x2f8bff).setStrokeStyle(2, 0xffffff).setDepth(305))
      reg(this.add.text(bx, by - 11, 'Ton sac', { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: '#bfe0ff', stroke: '#001022', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(305))
    }

    // marqueurs des REPAIRES DE BOSS (plusieurs par zone) : un ☠ par repaire, nom court du boss
    for (const [biome, lairs] of Object.entries(g.bossLairs ?? {})) {
      lairs.forEach((lair, i) => {
        const bx = ox + lair.tx * cell
        const by = oy + lair.ty * cell
        const name = (g.bossDefs?.[biome]?.[i]?.name ?? 'Boss').split(',')[0] // "Gankai, le ..." -> "Gankai"
        reg(this.add.star(bx, by, 4, 3, 7, 0xff4444).setDepth(303).setStrokeStyle(1.5, 0x3a0000))
        reg(this.add.text(bx, by - 9, `☠ ${name}`, { fontFamily: 'monospace', fontSize: '10px', color: '#ff8a8a', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(303))
      })
    }

    // PNJ dispersés (petits points clairs)
    for (const npc of g.wildNpcs ?? []) {
      reg(this.add.circle(ox + npc.tx * cell, oy + npc.ty * cell, 2.5, 0xffe9a8).setDepth(303).setStrokeStyle(1, 0x6a5212))
    }

    // MONSTRES (instantané : jeu en pause -> positions figées) ; rouge, boss = orange plus gros
    if (g.monsters) {
      const mg = reg(this.add.graphics().setDepth(303.5))
      g.monsters.getChildren().forEach((m) => {
        if (!m.active) return
        const mx = ox + (m.x / g.tile) * cell
        const my = oy + (m.y / g.tile) * cell
        if (m.isBoss) {
          mg.fillStyle(0xff7a1f, 1)
          mg.fillCircle(mx, my, 3)
        } else {
          mg.fillStyle(m.elite ? 0xffd24a : 0xff4444, 1) // élite = jaune
          mg.fillCircle(mx, my, m.elite ? 2.6 : 1.8)
        }
      })
    }

    // marqueur JOUEUR
    const p = g.player
    if (p) {
      const dotX = ox + (p.x / g.tile) * cell
      const dotY = oy + (p.y / g.tile) * cell
      reg(this.add.circle(dotX, dotY, 4, 0x53e0ff).setDepth(304).setStrokeStyle(1.5, 0x06243a))
    }

    // titre + aide + légende
    reg(this.add.text(cw / 2, topY - 24, 'Carte du monde', { fontFamily: 'Georgia, serif', fontSize: '24px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(303))
    reg(this.add.text(cw / 2, topY + mapPxH + 20, 'M / Échap : fermer', { fontFamily: 'monospace', fontSize: '12px', color: '#bcd' }).setOrigin(0.5).setDepth(303))
    const legend = [['Prairie', COLOR.prairie], ['Forêt', COLOR.forest], ['Neige', COLOR.snow], ['Désert', COLOR.desert], ['Maudit', COLOR.cursed], ['Océan', COLOR.ocean]]
    let lx = cw / 2 - (legend.length * 78) / 2
    const ly = topY + mapPxH + 40
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
    this.dlgLines = this.paginateLines(lines && lines.length ? lines : ['...'])
    this.dlgTexture = texture
    this.dlgIndex = 0
    this.dlgOpenAt = this.time.now // anti-rebond : la touche d'ouverture ne doit pas avancer
    this.scene.pause('GameScene')
    this.buildDialogue()
  }

  /** Découpe les phrases trop longues en plusieurs pages (clic pour continuer) -> elles tiennent dans la boîte. */
  paginateLines(lines, maxLen = 120) {
    const out = []
    for (const raw of lines) {
      for (const seg of String(raw).split('\n')) { // chaque '\n' = nouvelle page
        if (seg.length <= maxLen) { out.push(seg); continue }
        const words = seg.split(' ')
        let cur = ''
        for (const w of words) {
          if (cur && (cur + ' ' + w).length > maxLen) { out.push(cur); cur = w }
          else cur = cur ? cur + ' ' + w : w
        }
        if (cur) out.push(cur)
      }
    }
    return out.length ? out : ['...']
  }

  buildDialogue() {
    this.destroyDialogue()
    const reg = (o) => {
      this.dialogueObjects.push(o)
      return o
    }
    const cw = this.scale.width
    const ch = this.scale.height
    // boîte de dialogue Ninja (source 300×58 : case portrait à gauche + zone crème) mise à l'échelle (AGRANDIE)
    const boxW = Math.min(560, cw - 16)
    const s = boxW / 300
    const boxH = 58 * s
    const boxX = (cw - boxW) / 2
    const boxY = ch - boxH - 16

    // overlay plein écran (invisible) : clic EN DEHORS de la boîte = passer (skip) le dialogue
    reg(this.add.rectangle(0, 0, cw, ch, 0x000000, 0.001).setOrigin(0, 0).setInteractive().on('pointerdown', () => { if (this.time.now > this.dlgOpenAt + 150) this.closeDialogue() }))

    // la boîte (asset) ; clic dessus = phrase suivante
    const box = reg(this.add.image(boxX, boxY, 'dialogbox').setOrigin(0, 0).setScale(s))
    box.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.advanceDialogue())

    // portrait du PNJ dans la case de gauche : FACESET (portrait dédié) si dispo, sinon sprite (frame 0)
    const faceKey = this.dlgTexture ? 'face_' + this.dlgTexture : null
    const useFace = faceKey && this.textures.exists(faceKey)
    const portKey = useFace ? faceKey : this.dlgTexture
    if (portKey && this.textures.exists(portKey)) {
      const port = reg(useFace ? this.add.image(boxX + 28 * s, boxY + 30 * s, portKey) : this.add.image(boxX + 28 * s, boxY + 31 * s, portKey, 0))
      port.setScale((useFace ? 40 * s : 34 * s) / Math.max(port.width, port.height))
    }

    // NOM (majuscules, brun) + phrase (texte sombre) sur le crème — police Georgia (style RPG/parchemin)
    const tx = boxX + 58 * s
    reg(this.add.text(tx, boxY + 12 * s, (this.dlgName || '').toUpperCase(), { fontFamily: 'Georgia, serif', fontSize: Math.round(10 * s) + 'px', fontStyle: 'bold', color: '#6b3f12' }).setOrigin(0, 0).setResolution(2))
    reg(this.add.text(tx, boxY + 26 * s, this.dlgLines[this.dlgIndex], { fontFamily: 'Georgia, serif', fontSize: Math.round(8 * s) + 'px', color: '#33271a', lineSpacing: 2, wordWrap: { width: 236 * s } }).setOrigin(0, 0).setResolution(2))

    // flèche « suivant » en bas à droite, qui rebondit
    const arrow = reg(this.add.image(boxX + 286 * s, boxY + 46 * s, 'arrow_next').setScale(s))
    this.dlgArrowTween?.remove()
    this.dlgArrowTween = this.tweens.add({ targets: arrow, y: arrow.y + 3 * s, duration: 480, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
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
    this.dlgArrowTween?.remove()
    this.dlgArrowTween = null
    this.dialogueObjects.forEach((o) => o.destroy())
    this.dialogueObjects = []
  }

  // ---------- helpers ----------

  pointerOverInventory(x, y) {
    const inside = (r) => r && Phaser.Geom.Rectangle.Contains(r, x, y)
    return inside(this.bagRect) || inside(this.matRect) || inside(this.frameRect) || inside(this.xpRect) || inside(this.skillsRect) || inside(this.minimapRect) || inside(this.charBtnRect)
  }

  /** Filigrane de RARETÉ : fond teinté (couleur de la rareté) à placer DERRIÈRE l'icône d'un objet. */
  rarityBg(x, y, size, rarity) {
    const rc = RARITY[rarity]
    return this.add.rectangle(x, y, size, size, rc ? rc.tint : 0x000000, rc ? 0.26 : 0)
  }

  /** Icône d'objet + VOILE de rareté SUR l'icône : une copie teintée de la couleur de rareté est posée
   *  par-dessus en semi-transparence (comme la teinte de l'eau) -> l'objet prend la couleur de sa rareté. */
  addItemIcon(reg, x, y, item, fit) {
    const base = reg(this.addIcon(x, y, item.icon, fit, item.iconTint))
    const tint = itemTint(item) // émeraude si pièce de set, sinon teinte de rareté
    if (tint != null) reg(this.addIcon(x, y, item.icon, fit, tint)).setAlpha(0.42)
    return base
  }

  addIcon(x, y, key, fit, tint = null) {
    const img = this.add.image(x, y, key)
    img.setScale(fit / Math.max(img.width, img.height))
    if (tint != null) img.setTint(tint) // teinte optionnelle (iconTint : tiers d'armure, bâtons soigneur...)
    return img
  }

  /** Une CASE de la barre de compétences (style WoW) : fond + icône + bordure (dorée / émeraude pour le set)
   *  + raccourci clavier + voile & chiffre de cooldown + cadenas si verrouillé + flash au lancement + coût mana.
   *  `def` = { iconKey, shortcut, setBorder?, onClick, cd?:()=>{rem,total}, cost?:()=>number, locked?:()=>string|null }.
   *  Enregistre un updater dans this.skillUpdaters (appelé chaque frame). La logique de jeu reste inchangée. */
  buildSkillCase(reg, cxx, cyy, size, def) {
    const border = def.setBorder ? 0x2ecc71 : GOLD
    reg(this.add.rectangle(cxx, cyy, size, size, 0x12161f, 0.95))
    let icon = null
    let baseScale = 1
    if (def.iconKey && this.textures.exists(def.iconKey)) {
      icon = reg(this.add.image(cxx, cyy, def.iconKey))
      baseScale = (size - 8) / Math.max(icon.width, icon.height)
      icon.setScale(baseScale)
    }
    reg(this.add.rectangle(cxx, cyy, size, size, 0x000000, 0).setStrokeStyle(2.5, border))
    reg(this.add.text(cxx + size / 2 - 3, cyy + size / 2 - 2, def.shortcut, { fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 1))
    const costText = def.cost ? reg(this.add.text(cxx - size / 2 + 3, cyy + size / 2 - 2, '', { fontFamily: 'monospace', fontSize: '8px', color: '#9fd8ff', stroke: '#000', strokeThickness: 3 }).setOrigin(0, 1)) : null
    const veil = reg(this.add.rectangle(cxx, cyy - size / 2, size, 0, 0x000000, 0.62).setOrigin(0.5, 0))
    const cdText = reg(this.add.text(cxx, cyy, '', { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5))
    const lock = reg(this.add.rectangle(cxx, cyy, size, size, 0x000000, 0.66).setVisible(false))
    const lockText = reg(this.add.text(cxx, cyy, '🔒', { fontFamily: 'monospace', fontSize: '11px', color: '#ffd27a', align: 'center', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setVisible(false))
    const hit = reg(this.add.rectangle(cxx, cyy, size, size, 0x000000, 0.001).setInteractive({ useHandCursor: true }))
    hit.on('pointerdown', (po, lx, ly, ev) => { ev?.stopPropagation?.(); def.onClick?.() })
    let lastRatio = 0
    this.skillUpdaters.push(() => {
      const p = this.game_.player
      const lockLabel = def.locked?.()
      if (lockLabel) {
        lock.setVisible(true); lockText.setVisible(true).setText('🔒\n' + lockLabel)
        if (icon) icon.setAlpha(0.32)
        veil.setSize(size, 0); cdText.setText(''); lastRatio = 0
        if (costText) costText.setText('')
        return
      }
      lock.setVisible(false); lockText.setVisible(false)
      if (icon) icon.setAlpha(1)
      let ratio = 0, rem = 0
      if (def.cd) { const c = def.cd(); rem = c.rem; ratio = Phaser.Math.Clamp(c.total ? rem / c.total : 0, 0, 1) }
      veil.setSize(size, size * ratio)
      cdText.setText(ratio > 0 ? `${Math.ceil(rem / 1000)}` : '')
      if (icon && ratio > 0.6 && lastRatio < 0.08) { // un cooldown vient de DÉMARRER -> flash de l'icône
        icon.setScale(baseScale * 1.3)
        this.tweens.add({ targets: icon, scaleX: baseScale, scaleY: baseScale, duration: 240, ease: 'Quad.easeOut' })
      }
      lastRatio = ratio
      if (costText && def.cost) { const cost = def.cost(); costText.setText(`${cost}`).setColor(p.mana >= cost ? '#9fd8ff' : '#ff6b6b') }
    })
  }

  showTip(item, centerX, topY, droppable = false) {
    this._cancelTipHide()
    this.tip.setColor(itemColor(item))
    // progression de panoplie « x/4 » (compte les pièces actuellement équipées)
    let setLine = ''
    if (item.set && SETS[item.set]) {
      const n = setStatus(this.game_.player.equipped, item.set).count
      setLine = `\n[Panoplie ${n}/4 équipée${n > 1 ? 's' : ''}]`
    }
    this.tip.setText(`${item.name}\n${describeItem(item)}${setLine}`).setVisible(true)
    if (droppable) {
      // on remonte l'infobulle de la hauteur du bouton pour que « ✖ Lâcher » se cale juste au-dessus de l'objet
      const btnH = this.dropBtn.height
      this.tip.setPosition(centerX, topY - 4 - btnH)
      this.dropBtn.setPosition(centerX, topY - 4 - btnH).setVisible(true)
      this._dropTarget = item
    } else {
      this.tip.setPosition(centerX, topY - 4)
      this.dropBtn.setVisible(false)
      this._dropTarget = null
    }
  }

  /** Masque l'infobulle + le bouton Lâcher, avec un petit délai de grâce (le temps d'atteindre le bouton). */
  hideTip() {
    this._cancelTipHide()
    this._tipHideEv = this.time.delayedCall(150, () => {
      this.tip.setVisible(false)
      this.dropBtn.setVisible(false)
      this._dropTarget = null
      this._tipHideEv = null
    })
  }

  _cancelTipHide() {
    this._tipHideEv?.remove()
    this._tipHideEv = null
  }

  /** Lâche l'objet visé au sol (libère une place de sac). */
  dropItem(item) {
    const p = this.game_.player
    if (!p || !p.removeItem(item)) return
    this.game_.dropItemOnGround?.(item)
    this.showItemToast('Lâché', item)
    Audio.sfx('ui_cancel', { detune: 0 })
    this._cancelTipHide()
    this.tip.setVisible(false)
    this.dropBtn.setVisible(false)
    this._dropTarget = null
  }

  /** Avertit (throttlé) que le sac est plein. */
  showBagFull() {
    const now = this.time.now
    if (now < (this._bagFullAt || 0)) return
    this._bagFullAt = now + 1200
    this.showToast(`Sac plein (${this.game_.player?.invMax ?? 6}) — lâche ou vends un objet`, '#e0a866')
    this.playDenied()
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
    this.showToast(`${prefix} : ${item.name}`, itemColor(item))
  }

  /** Thermomètre LEGO-Fortnite : une AIGUILLE coulisse le long de la barre zonée selon p.temp (-100…+100),
   *  + une vignette de bord (givre bleu / chaleur orange) qui monte aux extrêmes et pulse en zone de dégâts. */
  updateTempGauge(p) {
    if (!this.tempNeedle) return
    const temp = Phaser.Math.Clamp(p.temp ?? 0, -100, 100)
    const r01 = (temp + 100) / 200 // -100 -> 0 (extrême gauche), +100 -> 1 (extrême droite)
    this.tempNeedle.x = this.tempBarX + r01 * this.tempBarW
    // zone courante (nom + couleur), calée sur les paliers ralenti(55)/dégâts(90)
    let name = 'Tempéré'
    let col = '#9fe6a8'
    if (temp <= -90) { name = 'Glacial'; col = '#cfeaff' }
    else if (temp <= -55) { name = 'Froid'; col = '#8fd0ff' }
    else if (temp < 55) { name = 'Tempéré'; col = '#9fe6a8' }
    else if (temp < 90) { name = 'Chaud'; col = '#ffb060' }
    else { name = 'Brûlant'; col = '#ff7a5a' }
    this.tempLabel.setText(name).setColor(col)
    const a = Math.abs(temp)
    const cold = temp < 0
    const now = this.game_?.time?.now ?? 0
    // vignette de bord : démarre tôt (dès qu'il fait frais/tiède) et pulse en zone de dégâts
    const past = Phaser.Math.Clamp((a - 30) / 70, 0, 1)
    let alpha = past * 0.5
    if (a >= 90) alpha = 0.42 + 0.18 * (0.5 + 0.5 * Math.sin(now / 170)) // pulsation de danger
    this.tempVeil.setTint(cold ? 0x6fb7ff : 0xff6a2a)
    this.tempVeil.setAlpha(alpha)
    // flocons quand il fait FROID (densité ∝ intensité, éteints sinon). Le chaud n'a pas de particules.
    const inten = Phaser.Math.Clamp((a - 35) / 65, 0, 1)
    this.setEmitter(this.coldParticles, '_coldP', cold && a >= 35, Phaser.Math.Linear(210, 40, inten))
    // bandeau d'alerte central, bien visible, tant qu'on est en zone de DÉGÂTS (envDanger posé par GameScene)
    if (p.envDanger) {
      this.tempBanner.setVisible(true)
      this.tempBanner.setText(cold ? '❄ TU GÈLES !\nMets-toi à l’abri' : '☀ TU BRÛLES !\nMets-toi à l’abri')
      this.tempBanner.setColor(cold ? '#bfe6ff' : '#ffd0a0')
      this.tempBanner.setAlpha(0.65 + 0.35 * (0.5 + 0.5 * Math.sin(now / 180))) // clignote
    } else if (this.tempBanner.visible) {
      this.tempBanner.setVisible(false)
    }
  }

  /** Indicateur jour/nuit : crossfade soleil -> lune selon dayDarkness (0 jour, 1 minuit) de GameScene. */
  updateDayNightIcon() {
    if (!this.sunIcon) return
    const n = this.game_?.dayDarkness ?? 0
    const t = Phaser.Math.Clamp((n - 0.35) / 0.3, 0, 1) // bascule soleil->lune entre n=0.35 et 0.65
    this.sunIcon.setAlpha(1 - t)
    this.moonIcon.setAlpha(t)
  }

  /** Allume/éteint un émetteur de particules selon `on`, en mémorisant l'état dans `this[flag]` pour ne
   *  (re)démarrer/arrêter qu'aux transitions ; ajuste la fréquence (densité) quand il est actif. */
  setEmitter(emitter, flag, on, frequency) {
    if (!emitter) return
    if (on) {
      emitter.frequency = frequency
      if (!this[flag]) { emitter.start(); this[flag] = true }
    } else if (this[flag]) {
      emitter.stop()
      this[flag] = false
    }
  }

  // ---------- update ----------

  update() {
    const p = this.game_?.player
    if (!p) return

    this.updateQuestTracker(p)
    this.updateTempGauge(p)
    this.updateDayNightIcon()
    const ratio = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1)
    this.hpBar.setSize(this.hpBarW * ratio, this.hpBarH)
    this.hpBar.fillColor = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xff9800 : 0xe23b3b
    this.hpText.setText(`Vie ${Math.round(p.hp)}/${p.maxHp}`)
    // mana (bleu) — barre vide si la classe n'a pas de mana ; libellé "Mana" pour la distinguer
    const mRatio = p.maxMana > 0 ? Phaser.Math.Clamp(p.mana / p.maxMana, 0, 1) : 0
    this.mpBar.setSize(this.mpBarW * mRatio, this.mpBarH)
    this.mpText.setText(p.maxMana > 0 ? `Mana ${Math.round(p.mana)}/${p.maxMana}` : '—')
    // BARRE DE COMPÉTENCES : chaque case se met à jour (voile + chiffre de cooldown, cadenas, coût mana, flash)
    this.skillUpdaters?.forEach((f) => f())
    const maxLvl = p.maxLevel ?? 50
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
      // sac de mort (A1) : pastille BLEUE cerclée de blanc, si dans la fenêtre de la minimap
      const b = g.player?.deathBag
      if (b) {
        const sx = cx + ((b.x - p.x) / tile) * scale
        const sy = cy + ((b.y - p.y) / tile) * scale
        if (Math.abs(sx - cx) <= half && Math.abs(sy - cy) <= half) {
          mobs.fillStyle(0x2f8bff, 1).fillCircle(sx, sy, 3)
          mobs.lineStyle(1.4, 0xffffff).strokeCircle(sx, sy, 3)
        }
      }
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

  /** Voile de mort BREF (A1) : montre AVEC ICÔNES ce qu'on a laissé (or + objets), puis réapparition
   *  automatique au village. `summary` = { gold, items (tableau d'objets), lost (true = tout perdu) }. */
  showDeath(summary) {
    const cw = this.scale.width
    const ch = this.scale.height
    const items = summary.items || []
    const objs = []
    const reg = (o) => { objs.push(o); return o }
    const D = 151

    const veil = reg(this.add.rectangle(0, 0, cw, ch, 0x2a0606, 0).setOrigin(0, 0).setDepth(150))
    this.tweens.add({ targets: veil, fillAlpha: 0.74, duration: 350 })

    const title = reg(this.add
      .text(cw / 2, ch / 2 - 78, 'Tu es tombé…', { fontFamily: 'Georgia, serif', fontSize: '30px', fontStyle: 'bold', color: '#ff6b6b', stroke: '#000', strokeThickness: 5 })
      .setOrigin(0.5).setDepth(D))
    this.tweens.add({ targets: title, scale: { from: 0.7, to: 1 }, ease: 'Back.out', duration: 400 })

    if (summary.lost) {
      // 3e mort sans récupérer : tout est perdu
      reg(this.add.text(cw / 2, ch / 2 - 36, 'Tes affaires sont PERDUES', { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#ff8a8a', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(D))
      reg(this.add.text(cw / 2, ch / 2 - 14, '(3 morts sans récupérer ton sac)', { fontFamily: 'monospace', fontSize: '11px', color: '#caa' }).setOrigin(0.5).setDepth(D))
    } else if (summary.gold > 0 || items.length) {
      reg(this.add.text(cw / 2, ch / 2 - 44, 'Laissé sur place', { fontFamily: 'monospace', fontSize: '13px', color: '#ffd1d1' }).setOrigin(0.5).setDepth(D))

      // RANGÉE D'ICÔNES centrée : pièce d'or (+ montant) puis une icône par objet (cadre = couleur de rareté)
      const sz = 30
      const gap = 8
      const chips = []
      if (summary.gold > 0) chips.push({ gold: true })
      for (const it of items) chips.push({ it })
      const cellW = sz + 8
      const totalW = chips.length * cellW + (chips.length - 1) * gap
      let ix = cw / 2 - totalW / 2 + cellW / 2
      const iy = ch / 2 - 2
      for (const c of chips) {
        if (c.gold) {
          reg(this.add.rectangle(ix, iy, cellW, cellW, 0x161b24, 0.95).setStrokeStyle(2, GOLD).setDepth(D))
          reg(this.addIcon(ix, iy - 3, 'drop_gold', sz - 8).setDepth(D))
          reg(this.add.text(ix, iy + cellW / 2 - 4, `${summary.gold}`, { fontFamily: 'monospace', fontSize: '10px', color: '#ffe066', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(D))
        } else {
          reg(this.add.rectangle(ix, iy, cellW, cellW, 0x161b24, 0.95).setStrokeStyle(2, itemTint(c.it) ?? 0x888888).setDepth(D))
          reg(this.addIcon(ix, iy, c.it.icon, sz - 8, c.it.iconTint).setDepth(D))
        }
        ix += cellW + gap
      }
      reg(this.add.text(cw / 2, ch / 2 + 34, 'Récupère ton sac (repère BLEU sur la carte)', { fontFamily: 'monospace', fontSize: '11px', color: '#9fd0ff' }).setOrigin(0.5).setDepth(D))
    } else {
      reg(this.add.text(cw / 2, ch / 2 - 20, 'Tu ne portais rien à laisser.', { fontFamily: 'monospace', fontSize: '12px', color: '#ffd1d1' }).setOrigin(0.5).setDepth(D))
    }

    reg(this.add.text(cw / 2, ch / 2 + 60, 'Réapparition au village…', { fontFamily: 'monospace', fontSize: '11px', color: '#bcd' }).setOrigin(0.5).setDepth(D))

    // après le voile : respawn au village, puis on efface l'overlay
    this.time.delayedCall(1900, () => {
      this.game_.respawnAtVillage()
      this.tweens.add({ targets: objs, alpha: 0, duration: 350, onComplete: () => objs.forEach((o) => o.destroy()) })
    })
  }
}
