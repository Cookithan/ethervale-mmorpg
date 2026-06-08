// Aperçu de la CARTE MONDE (océan/Ergas/Sargèr/archipel) sans lancer le jeu — réplique la génération de
// GameScene.js (noise2D + rawOcean + isCursedIsland + islands). Sert à placer/dimensionner Sargèr à la vue.
// Usage : node scripts/map_preview.cjs   -> Brief/_map.png
const fs = require('fs')
const zlib = require('zlib')
// --- encode PNG (RGBA) — repris de room_preview.cjs ---
const CT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]) }
function encode(W, H, rgba) { const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6; const raw = Buffer.alloc(H * (1 + W * 4)); let p = 0; for (let y = 0; y < H; y++) { raw[p++] = 0; for (let x = 0; x < W * 4; x++) raw[p++] = rgba[y * W * 4 + x] } return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]) }

// ====== CONSTANTES (miroir de GameScene.js) — ÉDITER ICI pour tester un placement ======
const MAP_W = 640, MAP_H = 330
const ISLAND_RX = 96, ISLAND_RY = 82
const icx = 180, icy = 110
// Sargèr (île maudite) : soit un CERCLE {ox,oy,r} (état actuel), soit une ELLIPSE {ox,oy,rx,ry}.
const CURSED = { ox: 300, oy: 65, rx: 96, ry: 82 }
// =======================================================================================

function noise2D(tx, ty) {
  const wx = tx + Math.sin(ty * 0.05) * 7 + Math.sin(ty * 0.11 + 1.0) * 3
  const wy = ty + Math.sin(tx * 0.045) * 7 + Math.sin(tx * 0.09 + 2.0) * 3
  const n = Math.sin(wx * 0.06) + Math.sin(wy * 0.075 + 1.3) + Math.sin((wx + wy) * 0.04 + 0.6) + Math.sin((wx - wy) * 0.05 + 2.2)
  return n / 4
}
function islandsList() {
  const DIRS = [[-122, 5, 0.20], [44, 5, 0.18], [150, 4, 0.22]]
  return DIRS.map(([deg, r, margin]) => {
    const a = (deg * Math.PI) / 180
    const coast = 0.14 * Math.sin(a * 2 + 0.6) + 0.11 * Math.sin(a * 3 + 2.2) + 0.07 * Math.sin(a * 5 - 1.0)
    const f = 1 + Math.max(coast, 0) + margin + r * 0.02
    return [Math.round(icx + f * ISLAND_RX * Math.cos(a)), Math.round(icy + f * ISLAND_RY * Math.sin(a)), r]
  })
}
const ARCH = islandsList()
function isCursed(tx, ty) {
  const cx = icx + CURSED.ox, cy = icy + CURSED.oy
  const dx = tx - cx, dy = ty - cy
  if (CURSED.r != null) return Math.hypot(dx, dy) <= CURSED.r + noise2D(tx, ty) // cercle (actuel)
  const r = Math.hypot(dx / CURSED.rx, dy / CURSED.ry) // ellipse (cible) + côte irrégulière
  const a = Math.atan2(dy, dx)
  let coast = 0.13 * Math.sin(a * 2 - 0.4) + 0.10 * Math.sin(a * 3 + 1.1) + 0.06 * Math.sin(a * 5 + 2.0) + 0.15 * noise2D(tx, ty)
  coast = Math.max(-0.28, Math.min(0.5, coast))
  return r <= 1 + coast
}
function isArch(tx, ty) { for (const [ix, iy, r] of ARCH) if (Math.hypot(tx - ix, ty - iy) <= r + noise2D(tx, ty)) return true; return false }
function isIsland(tx, ty) { return isCursed(tx, ty) || isArch(tx, ty) }
function rawOcean(tx, ty) {
  if (isIsland(tx, ty)) return false
  const dx = tx - icx, dy = ty - icy
  const r = Math.hypot(dx / ISLAND_RX, dy / ISLAND_RY)
  const a = Math.atan2(dy, dx)
  let coast = 0.14 * Math.sin(a * 2 + 0.6) + 0.11 * Math.sin(a * 3 + 2.2) + 0.07 * Math.sin(a * 5 - 1.0) + 0.16 * noise2D(tx, ty)
  coast = Math.max(-0.30, Math.min(0.5, coast))
  return r > 1 + coast
}

const S = 2 // px par tuile
const oW = MAP_W * S, oH = MAP_H * S, o = Buffer.alloc(oW * oH * 4)
function put(tx, ty, col) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return
  for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
    const px = ((ty * S + sy) * oW + (tx * S + sx)) * 4
    o[px] = col[0]; o[px + 1] = col[1]; o[px + 2] = col[2]; o[px + 3] = 255
  }
}
for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
  let col
  if (isCursed(tx, ty)) col = [150, 70, 200]       // Sargèr = violet
  else if (isArch(tx, ty)) col = [150, 150, 150]    // archipel = gris
  else if (rawOcean(tx, ty)) col = [38, 92, 150]    // océan = bleu
  else col = [78, 150, 70]                          // Ergas = vert
  put(tx, ty, col)
}
function mark(cx, cy, col, s = 2) { for (let dy = -s; dy <= s; dy++) for (let dx = -s; dx <= s; dx++) put(cx + dx, cy + dy, col) }
mark(icx, icy, [255, 70, 70])                          // centre Ergas = rouge
// GAUNTLET de Sargèr : Dargoth au centre (rouge vif) + 3 gardiens (jaune)
if (CURSED.rx != null) {
  const ccx = icx + CURSED.ox, ccy = icy + CURSED.oy
  mark(ccx, ccy, [255, 40, 40], 3) // Dargoth = centre
  const rgx = CURSED.rx * 0.5, rgy = CURSED.ry * 0.5
  for (let gi = 0; gi < 3; gi++) { const a = (gi / 3) * Math.PI * 2 - Math.PI / 2; mark(Math.round(ccx + Math.cos(a) * rgx), Math.round(ccy + Math.sin(a) * rgy), [255, 230, 0], 3) }
}
fs.writeFileSync('Brief/_map.png', encode(oW, oH, o))
console.log('Brief/_map.png', oW + 'x' + oH, '| Sargèr centre', icx + CURSED.ox, icy + CURSED.oy)
