import Phaser from 'phaser'

// Décor PARTAGÉ : SALLE EN PIERRE médiévale (mur en appareil + sol + alcôve éclairée + piliers + torches +
// verdure + détails). Utilisé en FOND par SelectScene ET CharacterScene -> même ambiance partout.
// Tout est dessiné en profondeurs NÉGATIVES (-100..-92) pour rester DERRIÈRE l'UI de chaque écran.
// Le héros/preview n'est PAS dessiné ici (propre à chaque écran).

/** Crée (une fois) le halo radial doux (sel_glow) + la vignette (sel_vignette). */
function ensureHallFx(scene) {
  if (!scene.textures.exists('sel_glow')) {
    const S = 256
    const t = scene.textures.createCanvas('sel_glow', S, S)
    const cx = t.getContext()
    const grd = cx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
    cx.fillStyle = grd; cx.fillRect(0, 0, S, S); t.refresh()
  }
  if (!scene.textures.exists('sel_vignette')) {
    const S = 256
    const t = scene.textures.createCanvas('sel_vignette', S, S)
    const cx = t.getContext()
    const grd = cx.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2)
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.74)')
    cx.fillStyle = grd; cx.fillRect(0, 0, S, S); t.refresh()
  }
}

function pillar(scene, x, floorY) {
  const h = floorY * 0.82
  const top = floorY - h
  const cy = top + h / 2
  scene.add.rectangle(x, cy, 50, h, 0x3d4452).setDepth(-95)
  scene.add.rectangle(x - 15, cy, 8, h, 0x4d5666).setDepth(-95)
  scene.add.rectangle(x + 17, cy, 11, h, 0x2c313c).setDepth(-95)
  scene.add.rectangle(x, top + 9, 66, 20, 0x4a5160).setStrokeStyle(2, 0x2c313c).setDepth(-95)
  scene.add.rectangle(x, floorY - 10, 66, 22, 0x4a5160).setStrokeStyle(2, 0x2c313c).setDepth(-95)
}

function torch(scene, x, y) {
  const glow = scene.add.image(x, y - 4, 'sel_glow').setScale(1.5).setTint(0xff8a3a).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(-95)
  scene.tweens.add({ targets: glow, alpha: 0.58, scaleX: 1.65, scaleY: 1.65, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
  scene.add.rectangle(x, y + 28, 9, 36, 0x2a1c10).setStrokeStyle(2, 0x7a5a2e).setDepth(-94)
  scene.add.ellipse(x, y + 12, 22, 9, 0x4a3216).setStrokeStyle(2, 0xc8923c).setDepth(-94)
  if (scene.anims.exists('fire-anim')) scene.add.sprite(x, y, 'fire_anim').setScale(2).setOrigin(0.5, 0.7).setDepth(-93).play('fire-anim')
}

function greenery(scene, horizon, px) {
  // (lierre + mousse RETIRÉS — pas de « ronds verts » ; buisson du bas RETIRÉ) ; on garde seulement quelques
  // BUISSONS au pied des piliers (vrais sprites `nature`).
  if (scene.textures.exists('nature')) {
    const bushes = [240, 241, 242, 268, 269, 273]
    for (const [bx, by] of [[px - 192, horizon + 8], [px - 166, horizon + 22], [px + 192, horizon + 8], [px + 220, horizon + 20]]) {
      scene.add.image(bx, by, 'nature', Phaser.Utils.Array.GetRandom(bushes)).setScale(2.6).setOrigin(0.5, 1).setDepth(-93).setTint(0xb9d09a)
    }
  }
}

function decorDetails(scene, horizon, px) {
  const cw = scene.scale.width
  const ch = scene.scale.height
  scene.add.rectangle(cw / 2, ch * 0.1, cw, 14, 0x4a5160).setDepth(-96)
  scene.add.rectangle(cw / 2, ch * 0.1 + 9, cw, 4, 0x101319, 0.7).setDepth(-96)
  const cr = scene.add.graphics().setDepth(-96)
  cr.lineStyle(2, 0x141820, 0.6)
  for (const [sx, sy] of [[cw * 0.22, ch * 0.32], [cw * 0.8, ch * 0.24], [cw * 0.64, ch * 0.46]]) {
    cr.beginPath(); cr.moveTo(sx, sy)
    let x = sx; let y = sy
    for (let k = 0; k < 5; k++) { x += k % 2 ? 13 : -9; y += 15; cr.lineTo(x, y) }
    cr.strokePath()
  }
  const wb = scene.add.graphics().setDepth(-96)
  wb.lineStyle(1, 0xcfe0ea, 0.16)
  for (const [cx0, sgn] of [[0, 1], [cw, -1]]) {
    for (let a = 0; a <= 4; a++) { const ang = (a / 4) * (Math.PI / 2); wb.lineBetween(cx0, 0, cx0 + sgn * Math.cos(ang) * 88, Math.sin(ang) * 88) }
    for (let r = 26; r <= 84; r += 22) { wb.beginPath(); wb.arc(cx0, 0, r, sgn > 0 ? 0 : Math.PI / 2, sgn > 0 ? Math.PI / 2 : Math.PI); wb.strokePath() }
  }
  const cg = scene.add.graphics().setDepth(-97)
  const fy = ch * 0.82
  const by = horizon - 4
  const fw = 128
  const bw = 80
  cg.fillStyle(0x6e1f24, 0.95)
  cg.beginPath(); cg.moveTo(px - fw, fy); cg.lineTo(px + fw, fy); cg.lineTo(px + bw, by); cg.lineTo(px - bw, by); cg.closePath(); cg.fillPath()
  cg.lineStyle(3, 0xc8923c, 0.85)
  cg.beginPath(); cg.moveTo(px - fw + 9, fy); cg.lineTo(px - bw + 7, by); cg.strokePath()
  cg.beginPath(); cg.moveTo(px + fw - 9, fy); cg.lineTo(px + bw - 7, by); cg.strokePath()
}

/** Dessine TOUT le décor de salle en pierre sur `scene` (profondeurs négatives, derrière l'UI). */
export function drawHall(scene) {
  const cw = scene.scale.width
  const ch = scene.scale.height
  const horizon = ch * 0.6
  const px = cw * 0.34
  ensureHallFx(scene)

  // dégradé de fond
  const g = scene.add.graphics().setDepth(-100)
  g.fillGradientStyle(0x221b2e, 0x221b2e, 0x06050a, 0x06050a, 1).fillRect(0, 0, cw, ch)

  // MUR : appareil de pierre (blocs décalés + joint + biseau de lumière)
  const wall = scene.add.graphics().setDepth(-100)
  wall.fillStyle(0x2b303b, 1).fillRect(0, 0, cw, horizon)
  const bw = 66
  const bh = 34
  const greys = [0x3a404e, 0x434a5a, 0x343a48, 0x3e4553]
  let row = 0
  for (let y = -8; y < horizon; y += bh, row++) {
    const off = (row % 2) * (bw / 2)
    for (let x = -bw; x < cw + bw; x += bw) {
      const bx = x + off
      wall.fillStyle(greys[(row + Math.floor((bx + bw) / bw)) % greys.length], 1).fillRect(bx + 1.5, y + 1.5, bw - 3, bh - 3)
      wall.fillStyle(0x565e70, 0.5).fillRect(bx + 1.5, y + 1.5, bw - 3, 2)
    }
  }
  scene.add.graphics().setDepth(-99).fillGradientStyle(0x05070c, 0x05070c, 0x05070c, 0x05070c, 0.55, 0.55, 0, 0).fillRect(0, 0, cw, horizon)

  // ALCÔVE éclairée derrière le héros (niche + arche + lueur chaude)
  scene.add.rectangle(px, horizon - 150, 156, 300, 0x0f121a, 0.92).setDepth(-98)
  scene.add.ellipse(px, horizon - 298, 156, 130, 0x0f121a, 0.92).setDepth(-98)
  scene.add.image(px, horizon - 160, 'sel_glow').setScale(1.7, 2.4).setTint(0xffb060).setAlpha(0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(-98)

  // SOL : pierre sombre + joints + plinthe
  const floor = scene.add.graphics().setDepth(-100)
  floor.fillGradientStyle(0x22262f, 0x22262f, 0x14161d, 0x14161d, 1).fillRect(0, horizon, cw, ch - horizon)
  floor.lineStyle(2, 0x10121a, 0.6)
  for (let i = 1; i <= 4; i++) { const y = horizon + (ch - horizon) * (i / 5); floor.lineBetween(0, y, cw, y) }
  scene.add.rectangle(cw / 2, horizon, cw, 9, 0x4a5260).setDepth(-96)
  scene.add.rectangle(cw / 2, horizon + 6, cw, 3, 0x101319).setDepth(-96)

  decorDetails(scene, horizon, px)
  pillar(scene, px - 192, horizon)
  pillar(scene, px + 192, horizon)
  torch(scene, px - 192, horizon - 150)
  torch(scene, px + 192, horizon - 150)
  greenery(scene, horizon, px)

  scene.add.image(cw / 2, ch / 2, 'sel_vignette').setDisplaySize(cw + 40, ch + 40).setDepth(-92) // vignette par-dessus le décor
}
