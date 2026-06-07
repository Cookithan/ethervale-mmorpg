// Compositeur d'INTERIEUR hors-jeu : rend une salle (sol + murs + mobilier Penzilla)
// dans un PNG zoome, pour VOIR le placement sans lancer le jeu (anti "placement a l'aveugle").
// Reproduit la semantique de GameScene.buildInterior : pp()=furn origine(0,0), si()=item origine(0.5),
// pd()=doors origine(0,0), tint = MULTIPLY. TILE=16, salle 15x12.
// Usage : node scripts/room_preview.cjs <design> <out.png> [scale]
//   <design> = nom d'une fonction de design ci-dessous (ex: tavern_current, tavern_v1)
const fs = require('fs')
const zlib = require('zlib')

// --- decode PNG -> {W,H,ch,bpp,stride,px} (filtres + Paeth, comme penz_crop.cjs) ---
function decode(p) {
  const b = fs.readFileSync(p)
  let o = 8, W, H, ct, bd
  const idat = []
  while (o < b.length) {
    const len = b.readUInt32BE(o)
    const t = b.toString('ascii', o + 4, o + 8)
    const d = b.slice(o + 8, o + 8 + len)
    if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); bd = d[8]; ct = d[9] }
    else if (t === 'IDAT') idat.push(d)
    else if (t === 'IEND') break
    o += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4
  const bpp = ch * (bd / 8), stride = W * bpp
  const px = Buffer.alloc(H * stride)
  const pth = (a, b2, c) => { const q = a + b2 - c, A = Math.abs(q - a), B = Math.abs(q - b2), C = Math.abs(q - c); return A <= B && A <= C ? a : B <= C ? b2 : c }
  let pos = 0
  for (let y = 0; y < H; y++) {
    const f = raw[pos++]
    for (let x = 0; x < stride; x++) {
      const v = raw[pos++]
      const L = x >= bpp ? px[y * stride + x - bpp] : 0
      const U = y > 0 ? px[(y - 1) * stride + x] : 0
      const UL = (x >= bpp && y > 0) ? px[(y - 1) * stride + x - bpp] : 0
      let r
      if (f === 0) r = v; else if (f === 1) r = v + L; else if (f === 2) r = v + U; else if (f === 3) r = v + ((L + U) >> 1); else r = v + pth(L, U, UL)
      px[y * stride + x] = r & 255
    }
  }
  return { W, H, ch, bpp, stride, px }
}
// pixel RGBA d'une source (gere ch=3/4/1)
function sample(img, x, y) {
  if (x < 0 || y < 0 || x >= img.W || y >= img.H) return [0, 0, 0, 0]
  const i = y * img.stride + x * img.bpp
  if (img.ch === 4) return [img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3]]
  if (img.ch === 3) return [img.px[i], img.px[i + 1], img.px[i + 2], 255]
  return [img.px[i], img.px[i], img.px[i], 255]
}

// --- encode PNG (RGBA) ---
const CT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]) }
function encode(W, H, rgba) {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6
  const raw = Buffer.alloc(H * (1 + W * 4)); let p = 0
  for (let y = 0; y < H; y++) { raw[p++] = 0; for (let x = 0; x < W * 4; x++) raw[p++] = rgba[y * W * 4 + x] }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// --- sheets ---
const A = 'public/assets/tiles/'
const sheets = {
  penz_floors: decode(A + 'penz_floors.png'),
  penz_furn: decode(A + 'penz_furn.png'),
  penz_doors: decode(A + 'penz_doors.png'),
  penz_items: decode(A + 'penz_items.png'),
  mw_walls: decode(A + 'mw_walls.png'),
  mw_door: decode(A + 'mw_door.png'),
}
const cols = { penz_floors: sheets.penz_floors.W / 16, penz_furn: 13, penz_doors: 18, penz_items: 8, mw_walls: sheets.mw_walls.W / 16 }
console.error('DIMS', Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, `${v.W}x${v.H} (${v.W / 16}col x ${v.H / 16}row)`])))

// --- canvas natif (taille configurable via env COLS/ROWS) ---
const TILE = 16, COLS = (process.env.COLS ? +process.env.COLS : 15), ROWS = (process.env.ROWS ? +process.env.ROWS : 12), W = COLS * TILE, H = ROWS * TILE
const cv = new Float32Array(W * H * 4) // premultiplie ? non : on stocke RGBA 0..255, alpha gere a la compo
// fond sombre 0x0a0810 plein
for (let i = 0; i < W * H; i++) { cv[i * 4] = 0x0a; cv[i * 4 + 1] = 0x08; cv[i * 4 + 2] = 0x10; cv[i * 4 + 3] = 255 }

function tintMul(rgb, tint) { // tint=0xRRGGBB multiply
  if (tint == null) return rgb
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255
  return [rgb[0] * tr / 255, rgb[1] * tg / 255, rgb[2] * tb / 255]
}
// blit une sous-image (sx,sy,sw,sh) de `img` vers le canvas, coin haut-gauche (dx,dy) px, scale entier-ish, tint mult, alpha global
function blit(img, sx, sy, sw, sh, dx, dy, scale, tint, ga, flip) {
  scale = scale || 1; ga = ga == null ? 1 : ga
  dx = Math.round(dx); dy = Math.round(dy) // IMPERATIF : coords pixel ENTIERES (sinon py fractionnaire -> index plat fausse la colonne)
  if (process.env.DBG2) console.error('blit dest col', dx / 16, 'dx', dx)
  const ow = Math.round(sw * scale), oh = Math.round(sh * scale)
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const srcX = flip ? sx + (sw - 1 - Math.floor(x / scale)) : sx + Math.floor(x / scale) // miroir horizontal (chaises)
    const s = sample(img, srcX, sy + Math.floor(y / scale))
    let a = s[3] / 255 * ga
    if (a <= 0) continue
    const px = dx + x, py = dy + y
    if (process.env.DBG3 && x === 0 && y === 0) console.error('WRITE px', px, 'py', py, 'W', W, 'cvlen', cv.length)
    if (px < 0 || py < 0 || px >= W || py >= H) continue
    const c = tintMul([s[0], s[1], s[2]], tint)
    const j = (py * W + px) * 4
    cv[j] = c[0] * a + cv[j] * (1 - a)
    cv[j + 1] = c[1] * a + cv[j + 1] * (1 - a)
    cv[j + 2] = c[2] * a + cv[j + 2] * (1 - a)
    cv[j + 3] = 255
  }
}
// ADD (lumiere) : disque radial doux centre (cx,cy) rayon R, couleur tint, intensite k
function glow(cx, cy, R, tint, k) {
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255
  for (let y = Math.max(0, cy - R); y < Math.min(H, cy + R); y++) for (let x = Math.max(0, cx - R); x < Math.min(W, cx + R); x++) {
    const d = Math.hypot(x - cx, y - cy); if (d > R) continue
    const f = (1 - d / R) * k
    const j = (y * W + x) * 4
    cv[j] = Math.min(255, cv[j] + tr * f); cv[j + 1] = Math.min(255, cv[j + 1] + tg * f); cv[j + 2] = Math.min(255, cv[j + 2] + tb * f)
  }
}

// ====== DSL de placement (unites TILE, fractions OK) ======
const ops = {
  floor(frame, tint) { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) blit(sheets.penz_floors, (frame % cols.penz_floors) * 16, ((frame / cols.penz_floors) | 0) * 16, 16, 16, c * 16, r * 16, 1, tint) },
  wallRing(tint, g0, g1) { // 2 rangees haut + cotes + bas (trou g0,g1)
    const wt = (cx, cy) => { const f = (cx + cy) % 2 ? 33 : 34; blit(sheets.mw_walls, (f % cols.mw_walls) * 16, ((f / cols.mw_walls) | 0) * 16, 16, 16, cx * 16, cy * 16, 1, tint) }
    for (let c = 0; c < COLS; c++) { wt(c, 0); wt(c, 1) }
    for (let r = 2; r < ROWS; r++) { wt(0, r); wt(COLS - 1, r) }
    for (let c = 1; c < COLS - 1; c++) if (c !== g0 && c !== g1) wt(c, ROWS - 1)
  },
  // pp : meuble penz_furn, origine HAUT-GAUCHE, (sc,sr,w,h) tuiles -> pose en (gx,gy) tuiles
  furn(sheet, sc, sr, w, h, gx, gy, tint, flip) { if (process.env.DBG) console.error('furn', sheet, 'col', sc, 'row', sr, w + 'x' + h, '@', gx, gy); const cc = cols[sheet]; for (let tr = 0; tr < h; tr++) for (let tc = 0; tc < w; tc++) { const f = (sr + tr) * cc + (sc + tc); blit(sheets[sheet], (f % cc) * 16, ((f / cc) | 0) * 16, 16, 16, (gx + tc) * 16, (gy + tr) * 16, 1, tint, 1, flip) } },
  // si : item penz_items par FRAME, origine CENTRE, (cx,cy) tuiles, scale option
  item(frame, cx, cy, scale, tint) { scale = scale || 1; const cc = cols.penz_items; const sz = 16 * scale; blit(sheets.penz_items, (frame % cc) * 16, ((frame / cc) | 0) * 16, 16, 16, Math.round(cx * 16 - sz / 2), Math.round(cy * 16 - sz / 2), scale, tint) },
  whole(sheet, cx, cy, tint) { const img = sheets[sheet]; blit(img, 0, 0, img.W, img.H, Math.round(cx * 16 - img.W / 2), Math.round(cy * 16 - img.H / 2), 1, tint) },
  glowT(cx, cy, R, tint, k) { glow(Math.round(cx * 16), Math.round(cy * 16), R, tint, k) },
  // OMBRE DE MUR : assombrit le sol pres des murs (profondeur/relief interieur) ; depth=px de degrade
  wallShadow(depth, k) {
    depth = depth || 10; k = k == null ? 0.5 : k
    const top = 2 * 16, left = 1 * 16, right = (COLS - 1) * 16, bot = (ROWS - 1) * 16
    for (let y = top; y < bot; y++) for (let x = left; x < right; x++) {
      let d = Math.min(y - top, x - left, right - 1 - x, bot - 1 - y) // distance au mur le plus proche
      if (d >= depth) continue
      const f = (1 - d / depth) * k
      const j = (y * W + x) * 4
      cv[j] *= (1 - f); cv[j + 1] *= (1 - f); cv[j + 2] *= (1 - f)
    }
  },
}

// ====== DESIGNS ======
const designs = {}

// Reproduction FIDELE de la taverne actuelle (pour confirmer le "rien ne va")
designs.tavern_current = () => {
  const g0 = 6, g1 = 7, doorCx = (g0 + 1) // en tuiles
  ops.floor(28, 0xb07a44)
  ops.wallRing(0xc89860, g0, g1)
  ops.glowT(7.5, 6, 150, 0xffba70, 0.20)
  ops.whole('mw_door', doorCx + 0.5, ROWS - 1 + 0.5) // porte centree approx
  ops.furn('penz_doors', 6, 3, 2, 2, 1, 0); ops.furn('penz_doors', 6, 3, 2, 2, 9, 0) // fenetres
  // tavern
  ops.furn('penz_furn', 10, 2, 3, 3, 5, 6) // tapis
  ops.furn('penz_furn', 6, 11, 6, 2, 4, 2) // bar
  ops.furn('penz_furn', 2, 4, 3, 3, 10, 0) // etagere
  ops.item(57, 10.5, 0.5); ops.item(49, 11.4, 0.5); ops.item(57, 11.6, 1.5)
  ops.furn('penz_furn', 12, 1, 1, 1, 4.6, 4); ops.furn('penz_furn', 12, 1, 1, 1, 8.4, 4) // tabourets
  ops.furn('penz_furn', 5, 6, 1, 3, 1, 7); ops.furn('penz_furn', 5, 6, 1, 3, 13, 7) // lampadaires
  ops.glowT(1.5, 7.4, 36, 0xffcf8a, 0.3); ops.glowT(13.5, 7.4, 36, 0xffcf8a, 0.3)
  ops.furn('penz_furn', 11, 0, 1, 2, 2, 6.4); ops.item(54, 2.3, 6.4); ops.item(26, 2.8, 6.5)
  ops.furn('penz_furn', 8, 0, 1, 2, 2, 7.8)
  ops.furn('penz_furn', 0, 2, 3, 2, 5, 6.4); ops.item(54, 5.6, 6.5); ops.item(34, 6.5, 6.5); ops.item(26, 7.2, 6.5)
  ops.furn('penz_furn', 8, 0, 1, 2, 5, 7.8); ops.furn('penz_furn', 8, 0, 1, 2, 7, 7.8)
  ops.furn('penz_furn', 11, 0, 1, 2, 10, 6.4); ops.item(49, 10.3, 6.4); ops.item(26, 10.8, 6.5)
  ops.furn('penz_furn', 8, 0, 1, 2, 10, 7.8)
  ops.furn('penz_furn', 11, 0, 1, 2, 4, 9.2); ops.item(54, 4.4, 9.2)
  ops.furn('penz_furn', 8, 9, 2, 2, 11, 9)
  ops.furn('penz_furn', 0, 9, 1, 2, 1, 5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.6) // tapis porte
}

// ---- helper : groupe TABLE + chaises (chaise au-dessus dessinee AVANT la table = derriere ; au-dessous APRES = devant) ----
function tableGroup(tx, ty, opts) {
  opts = opts || {}
  if (opts.up) ops.furn('penz_furn', 8, 0, 1, 2, tx, ty - 1.05)   // chaise haut (derriere)
  ops.furn('penz_furn', 11, 0, 1, 2, tx, ty)                       // table ronde
  ;(opts.items || []).forEach((it, i) => ops.item(it, tx + 0.5 + (i - (opts.items.length - 1) / 2) * 0.4, ty + 0.35))
  if (opts.down) ops.furn('penz_furn', 8, 0, 1, 2, tx, ty + 0.95)  // chaise bas (devant)
  if (opts.left) ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.9, ty + 0.05)
  if (opts.right) ops.furn('penz_furn', 9, 0, 1, 2, tx + 0.9, ty + 0.05)
}

// TAVERNE v1 — on ASSUME le set cosy (pas de faux bar facon cuisine) : bar = etagere a bouteilles + comptoir en commodes
designs.tavern_v1 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR) // bois (pas de tint -> vraie couleur)
  // RUGS sous les zones (avant les meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.5, 7.6)  // tapis losanges gauche (3x2)
  ops.furn('penz_furn', 10, 2, 3, 2, 9.5, 7.6)  // tapis losanges droite
  ops.wallRing(0xc89860, g0, g1)
  // fenetres (cotes, pas au centre = laisse la place au bar)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  // === BAR (haut-centre) ===
  ops.furn('penz_furn', 2, 4, 3, 3, 6, 2)       // etagere a bouteilles (bibliotheque claire 3x3) sous le mur du fond
  // bouteilles/jarres sur les rayons de l'etagere
  ops.item(6, 6.5, 2.4); ops.item(57, 7.5, 2.4); ops.item(49, 8.4, 2.4)
  ops.item(56, 6.5, 3.4); ops.item(58, 8.4, 3.4)
  // comptoir = 2 commodes + buffet au milieu (cols 5-9, rows ~5)
  ops.furn('penz_furn', 0, 0, 2, 2, 5, 5); ops.furn('penz_furn', 3, 0, 1, 2, 7, 5); ops.furn('penz_furn', 0, 0, 2, 2, 8, 5)
  // chopes/plat sur le comptoir
  ops.item(54, 5.6, 5.15); ops.item(42, 6.4, 5.15); ops.item(61, 8.4, 5.15); ops.item(54, 9.2, 5.15)
  // tabourets devant le comptoir
  ops.furn('penz_furn', 12, 1, 1, 1, 5.5, 7); ops.furn('penz_furn', 12, 1, 1, 1, 8.5, 7)
  // === TABLES (bas) : 4 tables groupees, lane centrale libre cols 6-7 ===
  tableGroup(2.5, 8.2, { up: true, down: true, items: [54, 26] })
  tableGroup(4.3, 9.6, { up: true, items: [42, 61] })
  tableGroup(10.5, 8.2, { up: true, down: true, items: [49, 26] })
  tableGroup(12.3, 9.6, { up: true, items: [54, 34] })
  // === coin lounge (fauteuil + plante) bas-gauche ===
  ops.furn('penz_furn', 0, 9, 1, 2, 1, 9.4)     // plante
  // === LANTERNES (lampadaires + lueurs chaudes, AUCUN feu) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.5); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.5)
  // PORTE + tapis de seuil (mat horizontal propre, pas l'ovale violet)
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 2, 2, 1, doorCx - 0.5, ROWS - 1.5)
  // lumieres d'ambiance (ADD) en dernier
  ops.glowT(7.5, 6, 150, 0xffba70, 0.16)
  ops.glowT(1.5, 5.0, 40, 0xffcf8a, 0.32); ops.glowT(13.5, 5.0, 40, 0xffcf8a, 0.32)
  ops.glowT(7.5, 3.2, 46, 0xffce7a, 0.22) // halo sur le bar
}

// TAVERNE v2 — bar lisible (etagere a bouteilles + comptoir long-table) + 4 tables groupees en bas, centre aere
designs.tavern_v2 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xe6cba2 // tint chaud leger pour "bois fonce chaleureux" sans ternir
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  // RUGS sous les 2 clusters de tables (avant meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.1)
  ops.furn('penz_furn', 10, 2, 3, 2, 9.2, 8.1)
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0) // fenetres
  // plante coin haut-gauche
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.3)
  // === BAR ===
  ops.furn('penz_furn', 2, 4, 3, 3, 6, 2)          // etagere a bouteilles (3x3)
  ops.item(6, 6.5, 2.45); ops.item(57, 7.0, 2.45); ops.item(49, 7.6, 2.45); ops.item(56, 8.2, 2.45)
  ops.item(58, 6.6, 3.45); ops.item(57, 7.4, 3.45); ops.item(56, 8.2, 3.45)
  ops.furn('penz_furn', 0, 2, 3, 2, 6, 4.4)        // COMPTOIR = longue table (cols6-8)
  ops.item(54, 6.4, 4.55); ops.item(42, 7.0, 4.55); ops.item(49, 7.6, 4.55); ops.item(61, 8.3, 4.55)
  ops.furn('penz_furn', 12, 1, 1, 1, 6.3, 6.6); ops.furn('penz_furn', 12, 1, 1, 1, 7.7, 6.6) // tabourets
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.2); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.2)
  // === 4 TABLES (band bas), lane centrale (cols 6-7) libre ===
  tableGroup(2.5, 8.7, { up: true, down: true, items: [54, 26] })
  tableGroup(4.6, 8.7, { up: true, down: true, items: [42, 61] })
  tableGroup(9.4, 8.7, { up: true, down: true, items: [49, 26] })
  tableGroup(11.5, 8.7, { up: true, down: true, items: [54, 34] })
  // PORTE + tapis ovale de seuil
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 0.5, ROWS - 1.4)
  // LUMIERES (ADD) en dernier
  ops.glowT(7.5, 5.5, 165, 0xffba70, 0.14)
  ops.glowT(1.5, 4.7, 42, 0xffcf8a, 0.34); ops.glowT(13.5, 4.7, 42, 0xffcf8a, 0.34)
  ops.glowT(7.5, 3.0, 50, 0xffce7a, 0.22)
}

// TAVERNE v3 — bar CONTRASTE (etagere sombre + comptoir bois fonce) ; lecon : le clair se fond dans le sol
designs.tavern_v3 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xd9bd96
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.0)   // tapis cluster gauche
  ops.furn('penz_furn', 10, 2, 3, 2, 9.2, 8.0)   // tapis cluster droite
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.2)    // plante coin
  // === BAR contraste ===
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 2)        // etagere SOMBRE a bouteilles (cols6-8)
  ops.item(6, 6.5, 2.45); ops.item(57, 7.0, 2.45); ops.item(49, 7.6, 2.45); ops.item(56, 8.2, 2.45)
  ops.item(58, 6.6, 3.45); ops.item(57, 7.4, 3.45); ops.item(56, 8.2, 3.45)
  // comptoir = 3 meubles bois FONCE (cols5-9) -> contraste avec le sol
  ops.furn('penz_furn', 0, 0, 2, 2, 5, 4.7); ops.furn('penz_furn', 3, 0, 1, 2, 7, 4.7); ops.furn('penz_furn', 0, 0, 2, 2, 8, 4.7)
  ops.item(54, 5.6, 4.8); ops.item(42, 6.4, 4.8); ops.item(49, 7.6, 4.8); ops.item(61, 8.4, 4.8)
  ops.furn('penz_furn', 12, 1, 1, 1, 5.6, 7.1); ops.furn('penz_furn', 12, 1, 1, 1, 8.4, 7.1) // tabourets
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.0); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.0)
  // === 4 TABLES ===
  tableGroup(2.5, 8.6, { up: true, down: true, items: [54, 26] })
  tableGroup(4.6, 8.6, { up: true, down: true, items: [42, 61] })
  tableGroup(9.4, 8.6, { up: true, down: true, items: [49, 26] })
  tableGroup(11.5, 8.6, { up: true, down: true, items: [54, 34] })
  // PORTE + tapis ovale
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(7.5, 5.5, 170, 0xffba70, 0.13)
  ops.glowT(1.5, 4.5, 42, 0xffcf8a, 0.33); ops.glowT(13.5, 4.5, 42, 0xffcf8a, 0.33)
  ops.glowT(7.5, 3.0, 50, 0xffce7a, 0.20)
}

// TAVERNE v4 — comptoir = plan de travail SEAMLESS (kitchen counter) tinte bois ; tables groupees + variees
designs.tavern_v4 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xd9bd96, CT2 = 0xc08a52 // tint comptoir = bois chaud fonce
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 3, 1.2, 7.3)   // grand tapis cluster gauche (3x3)
  ops.furn('penz_furn', 10, 2, 3, 3, 9.0, 7.3)   // grand tapis cluster droite
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.2)
  // === BAR : etagere sombre + comptoir SEAMLESS (kitchen counter 6x2) tinte bois ===
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 2)                 // etagere sombre (bouteilles), cols6-8
  ops.item(6, 6.5, 2.45); ops.item(57, 7.0, 2.45); ops.item(49, 7.6, 2.45); ops.item(56, 8.2, 2.45)
  ops.item(58, 6.6, 3.45); ops.item(57, 7.4, 3.45); ops.item(56, 8.2, 3.45)
  ops.furn('penz_furn', 6, 11, 6, 2, 4.5, 4.6, CT2)       // COMPTOIR seamless cols4.5-10.5
  ops.item(54, 5.2, 4.7); ops.item(42, 6.0, 4.7); ops.item(49, 7.6, 4.7); ops.item(61, 9.0, 4.7); ops.item(54, 9.8, 4.7)
  ops.furn('penz_furn', 12, 1, 1, 1, 5.5, 7.0); ops.furn('penz_furn', 12, 1, 1, 1, 7.5, 7.0); ops.furn('penz_furn', 12, 1, 1, 1, 9.5, 7.0)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.0); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.0)
  // === TABLES : 2 grandes ovales (4 places) + 2 rondes (2 places) ===
  // grande table gauche (ovale 2x2) + 4 chaises
  ops.furn('penz_furn', 9, 0, 1, 2, 1.4, 8.4)            // chaise profil gauche
  ops.furn('penz_furn', 8, 0, 1, 2, 2.5, 7.2)            // chaise face (derriere)
  ops.furn('penz_furn', 5, 2, 2, 2, 2.2, 8.2)            // table ovale
  ;[54, 26].forEach((it, i) => ops.item(it, 2.7 + i * 0.7, 8.6))
  ops.furn('penz_furn', 8, 0, 1, 2, 2.5, 9.3)            // chaise face (devant)
  // grande table droite
  ops.furn('penz_furn', 8, 0, 1, 2, 10.5, 7.2)
  ops.furn('penz_furn', 5, 2, 2, 2, 10.2, 8.2)
  ;[49, 61].forEach((it, i) => ops.item(it, 10.7 + i * 0.7, 8.6))
  ops.furn('penz_furn', 8, 0, 1, 2, 10.5, 9.3)
  ops.furn('penz_furn', 9, 0, 1, 2, 12.4, 8.4)           // chaise profil droite
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(7.5, 5.0, 175, 0xffba70, 0.12)
  ops.glowT(1.5, 4.5, 42, 0xffcf8a, 0.33); ops.glowT(13.5, 4.5, 42, 0xffcf8a, 0.33)
  ops.glowT(7.5, 3.0, 52, 0xffce7a, 0.20)
}

// TAVERNE v5 — comptoir bois fonce (commodes) colle sous l'etagere + clutter pose dessus, tables groupees serrees
designs.tavern_v5 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xd9bd96
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.1)
  ops.furn('penz_furn', 10, 2, 3, 2, 9.2, 8.1)
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.2)
  // === BAR : etagere sombre (cols6-8) + comptoir commodes bois fonce colle dessous (cols5-9) ===
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 1.9)
  ops.item(6, 6.5, 2.35); ops.item(57, 7.0, 2.35); ops.item(49, 7.6, 2.35); ops.item(56, 8.2, 2.35)
  ops.item(58, 6.6, 3.35); ops.item(57, 7.4, 3.35); ops.item(56, 8.2, 3.35)
  ops.furn('penz_furn', 0, 0, 2, 2, 5, 4.5); ops.furn('penz_furn', 3, 0, 1, 2, 7, 4.5); ops.furn('penz_furn', 0, 0, 2, 2, 8, 4.5)
  ops.item(54, 5.5, 4.5); ops.item(42, 6.3, 4.5); ops.item(49, 7.6, 4.5); ops.item(61, 8.5, 4.5) // poses sur le comptoir
  ops.furn('penz_furn', 12, 1, 1, 1, 5.6, 6.9); ops.furn('penz_furn', 12, 1, 1, 1, 7.0, 6.9); ops.furn('penz_furn', 12, 1, 1, 1, 8.4, 6.9)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.0); ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.0)
  // === 4 TABLES groupees (rugs sous chaque paire) ===
  tableGroup(2.5, 8.7, { up: true, down: true, items: [54, 26] })
  tableGroup(4.6, 8.7, { up: true, down: true, items: [42, 61] })
  tableGroup(9.4, 8.7, { up: true, down: true, items: [49, 26] })
  tableGroup(11.5, 8.7, { up: true, down: true, items: [54, 34] })
  // PORTE + tapis ovale
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(7.5, 5.0, 175, 0xffba70, 0.12)
  ops.glowT(1.5, 4.5, 42, 0xffcf8a, 0.33); ops.glowT(13.5, 4.5, 42, 0xffcf8a, 0.33)
  ops.glowT(7.5, 2.8, 52, 0xffce7a, 0.20)
}

// groupe TABLE OVALE 2x2 + chaises AUTOUR (face derriere, profils sur les cotes) = groupe naturel, pas "totem"
function ovalGroup(tx, ty, opts) {
  opts = opts || {}
  if (opts.up) ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.05)   // chaise face derriere (centree)
  if (opts.left) ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.85, ty + 0.35) // profil gauche
  ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                              // table ovale
  ;(opts.items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (opts.items.length - 1) / 2) * 0.6, ty + 0.55))
  if (opts.right) ops.furn('penz_furn', 9, 0, 1, 2, tx + 1.85, ty + 0.35) // profil droite
  if (opts.down) ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty + 1.95)
}

// TAVERNE v7 — salle agrandie 17x13, sol fonce, murs avec ombre, VRAI comptoir + armoire collee au mur, 3 tables ovales, centre degage
designs.tavern_v7 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a // bois FONCE chaleureux
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis sous les tables (avant meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.3); ops.furn('penz_furn', 10, 2, 3, 2, 12.0, 8.3)
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5) // RELIEF : ombre du sol contre les murs
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0) // fenetres
  // === BAR : armoire a bouteilles COLLEE au mur (cols centre) + place barman + comptoir SEAMLESS devant ===
  ops.furn('penz_furn', 6, 4, 3, 3, cxm - 1.5, 1.5)                       // armoire sombre (3x3) collee au mur du fond
  ops.item(6, cxm - 1, 1.95); ops.item(57, cxm - 0.5, 1.95); ops.item(49, cxm + 0.1, 1.95); ops.item(56, cxm + 0.7, 1.95)
  ops.item(58, cxm - 0.9, 2.95); ops.item(57, cxm - 0.1, 2.95); ops.item(56, cxm + 0.7, 2.95)
  // (place barman ~ ligne 5 ; PNG ajoute dans le jeu)
  ops.furn('penz_furn', 6, 11, 6, 2, cxm - 3, 5.0, 0xcaa066)             // COMPTOIR seamless (6 large) devant, tinte bois
  ops.item(54, cxm - 2.4, 5.1); ops.item(42, cxm - 1.4, 5.1); ops.item(49, cxm + 0.4, 5.1); ops.item(61, cxm + 1.6, 5.1); ops.item(54, cxm + 2.3, 5.1)
  // tabourets pour BOIRE AU BAR
  for (let i = 0; i < 4; i++) ops.furn('penz_furn', 12, 1, 1, 1, cxm - 2.4 + i * 1.4, 7.4)
  // === LANTERNES (murs lateraux) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.2); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 4.2)
  // === 3 GRANDES TABLES OVALES, centre degage (circulation) ===
  ovalGroup(1.8, 9.0, { up: true, left: true, right: true, items: [54, 26] })   // gauche
  ovalGroup(12.4, 9.0, { up: true, left: true, right: true, items: [49, 61] })  // droite
  ovalGroup(7.0, 10.4, { up: true, left: true, right: true, items: [42, 34] })  // bas-centre (au-dessus de la porte, contournable)
  // PORTE + tapis ovale
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.2, 210, 0xffba70, 0.11)
  ops.glowT(1.5, 4.7, 44, 0xffcf8a, 0.34); ops.glowT(COLS - 1.5, 4.7, 44, 0xffcf8a, 0.34)
  ops.glowT(cxm, 2.6, 56, 0xffce7a, 0.18)
}

// table ovale + 3 chaises qui REGARDENT la table (haut=face, gauche=profil MIROIR vers droite, droite=profil vers gauche)
function ovalV9(tx, ty, items) {
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.05)               // haut : face (regarde vers le bas = la table)
  ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.85, ty + 0.35, null, true)  // gauche : profil MIROIR (regarde a droite = la table)
  ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                            // table ovale
  ;(items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (items.length - 1) / 2) * 0.6, ty + 0.55))
  ops.furn('penz_furn', 9, 0, 1, 2, tx + 1.85, ty + 0.35)              // droite : profil (regarde a gauche = la table)
}

// TAVERNE v9 — BAR PLEINE LARGEUR au fond (mur de bouteilles + barman + comptoir-ligne infranchissable) + chaises face a la table
designs.tavern_v9 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.9); ops.furn('penz_furn', 10, 2, 3, 2, 12.0, 8.9) // tapis tables
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0) // fenetres mur du fond
  // === MUR DE BOUTEILLES (3 etageres sombres collees au mur) ===
  ;[3, 7, 11].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6)
    ops.item(6, c + 0.5, 2.05); ops.item(57, c + 1.1, 2.05); ops.item(49, c + 1.7, 2.05)
    ops.item(58, c + 0.6, 3.05); ops.item(56, c + 1.5, 3.05)
  })
  // (barman Brewen : pose dans le jeu vers la ligne 4.8, derriere le comptoir)
  // === COMPTOIR PLEINE LARGEUR (ligne) — 2 rangs ; on ne peut PAS passer derriere ===
  const bL = 1, bR = COLS - 1
  for (const row of [5.0, 5.4]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  for (let c = 2; c < bR - 1; c += 2) ops.item([54, 42, 49, 61, 54, 42][((c / 2) | 0) % 6], c + 0.5, 5.05) // chopes/plats sur le bar
  for (let i = 0; i < 6; i++) ops.furn('penz_furn', 12, 1, 1, 1, 2.5 + i * 2, 6.6) // tabourets (boire au bar)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.0); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 7.0)
  // === 2 GRANDES TABLES OVALES (chaises face a la table) ===
  ovalV9(1.8, 9.4, [54, 26])
  ovalV9(12.4, 9.4, [49, 61])
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.0, 235, 0xffba70, 0.10)
  ops.glowT(1.5, 7.4, 44, 0xffcf8a, 0.32); ops.glowT(COLS - 1.5, 7.4, 44, 0xffcf8a, 0.32)
  ops.glowT(cxm, 2.6, 72, 0xffce7a, 0.15)
}

// TAVERNE v8 — comptoir SANS la section evier (tiroirs/placards = lit comme un bar), 3e table en coin (porte+centre degages)
designs.tavern_v8 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.4, 8.5); ops.furn('penz_furn', 10, 2, 3, 2, 12.0, 8.5) // tapis tables basses
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0)
  // === BAR ===
  ops.furn('penz_furn', 6, 4, 3, 3, cxm - 1.5, 1.5)                       // armoire bouteilles collee au mur
  ops.item(6, cxm - 1, 1.95); ops.item(57, cxm - 0.5, 1.95); ops.item(49, cxm + 0.1, 1.95); ops.item(56, cxm + 0.7, 1.95)
  ops.item(58, cxm - 0.9, 2.95); ops.item(57, cxm - 0.1, 2.95); ops.item(56, cxm + 0.7, 2.95)
  const BAR = process.env.BAR || 'bench'
  if (BAR === 'cab') ops.furn('penz_furn', 8, 11, 5, 2, cxm - 2.5, 5.0, 0xc89a62)        // tiroirs+placards tinte
  else if (BAR === 'cabraw') ops.furn('penz_furn', 8, 11, 5, 2, cxm - 2.5, 5.0)          // tiroirs+placards brut
  else if (BAR === 'bench') { ops.furn('penz_furn', 8, 14, 4, 1, cxm - 2, 5.6); ops.furn('penz_furn', 8, 14, 4, 1, cxm - 2, 6.0) } // banc-bar empile (2 rangs)
  else if (BAR === 'table') ops.furn('penz_furn', 0, 2, 3, 2, cxm - 1.5, 5.0, 0xb0834e)  // longue table tinte fonce
  else if (BAR === 'dress') { ops.furn('penz_furn', 0, 0, 2, 2, cxm - 2.5, 5.0); ops.furn('penz_furn', 0, 0, 2, 2, cxm - 0.5, 5.0); ops.furn('penz_furn', 3, 0, 1, 2, cxm + 1.5, 5.0) } // commodes
  ops.item(54, cxm - 1.9, 5.15); ops.item(42, cxm - 1.0, 5.15); ops.item(49, cxm + 0.6, 5.15); ops.item(61, cxm + 1.7, 5.15)
  for (let i = 0; i < 4; i++) ops.furn('penz_furn', 12, 1, 1, 1, cxm - 2.4 + i * 1.4, 7.4) // tabourets (boire au bar)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 6.2); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 6.2)
  // === 3 TABLES : 2 grandes ovales (bas G/D) + 1 petite ronde en coin (nook) ; centre + porte degages ===
  ovalGroup(1.8, 9.1, { up: true, left: true, right: true, items: [54, 26] })
  ovalGroup(12.4, 9.1, { up: true, left: true, right: true, items: [49, 61] })
  ovalGroup(2.4, 4.9, { up: true, right: true, items: [42] }) // 3e table (coin haut-gauche, contre le mur)
  // plante + tonneau (coins, chaleur)
  ops.furn('penz_furn', 0, 9, 1, 2, COLS - 2.1, 2.2)
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.2, 215, 0xffba70, 0.10)
  ops.glowT(1.5, 6.6, 44, 0xffcf8a, 0.34); ops.glowT(COLS - 1.5, 6.6, 44, 0xffcf8a, 0.34)
  ops.glowT(cxm, 2.6, 58, 0xffce7a, 0.18)
}

// TAVERNE v6 — meme base que v5, bar resserre en haut + bande de tables remontee (plus de chaise dans le mur)
designs.tavern_v6 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xd9bd96
  const g0 = 6, g1 = 7, doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 1.5, 7.7)   // tapis cluster gauche
  ops.furn('penz_furn', 10, 2, 3, 2, 9.0, 7.7)   // tapis cluster droite
  ops.wallRing(0xc89860, g0, g1)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, 11, 0)
  // === BAR resserre ===
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 1.7)
  ops.item(6, 6.5, 2.15); ops.item(57, 7.0, 2.15); ops.item(49, 7.6, 2.15); ops.item(56, 8.2, 2.15)
  ops.item(58, 6.6, 3.15); ops.item(57, 7.4, 3.15); ops.item(56, 8.2, 3.15)
  ops.furn('penz_furn', 0, 0, 2, 2, 5, 4.3); ops.furn('penz_furn', 3, 0, 1, 2, 7, 4.3); ops.furn('penz_furn', 0, 0, 2, 2, 8, 4.3)
  ops.item(54, 5.5, 4.35); ops.item(42, 6.3, 4.35); ops.item(49, 7.6, 4.35); ops.item(61, 8.5, 4.35)
  ops.furn('penz_furn', 12, 1, 1, 1, 5.6, 6.4); ops.furn('penz_furn', 12, 1, 1, 1, 7.0, 6.4); ops.furn('penz_furn', 12, 1, 1, 1, 8.4, 6.4)
  // plante + tonneau (coins)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 2.0)
  // === LANTERNES ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 3.8); ops.furn('penz_furn', 6, 7, 1, 3, 13, 3.8)
  // === 4 TABLES (band remontee gy8.0) ===
  tableGroup(2.6, 8.0, { up: true, down: true, items: [54, 26] })
  tableGroup(4.7, 8.0, { up: true, down: true, items: [42, 61] })
  tableGroup(9.3, 8.0, { up: true, down: true, items: [49, 26] })
  tableGroup(11.4, 8.0, { up: true, down: true, items: [54, 34] })
  // PORTE + tapis ovale
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(7.5, 4.8, 180, 0xffba70, 0.12)
  ops.glowT(1.5, 4.3, 42, 0xffcf8a, 0.33); ops.glowT(13.5, 4.3, 42, 0xffcf8a, 0.33)
  ops.glowT(7.5, 2.6, 52, 0xffce7a, 0.20)
}

designs.debug_shelf = () => {
  ops.floor(92)
  ops.wallRing(0xc89860, 6, 7)
  ops.furn('penz_furn', 6, 4, 3, 3, 6, 1.9) // etagere sombre @ gx6 -> CENTRE attendu
}

designs.debug_iso = () => {
  ops.floor(92)
  ops.wallRing(0xc89860, 6, 7)
  ops.furn('penz_furn', 0, 2, 3, 2, 6, 4.4)   // counter long-table @ gx6 -> doit etre au CENTRE
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.2)   // lampe @ gx1 (gauche)
  ops.furn('penz_furn', 6, 7, 1, 3, 13, 4.2)  // lampe @ gx13 (droite)
}

const which = process.argv[2] || 'tavern_current'
const out = process.argv[3] || '_room.png'
const S = process.argv[4] != null ? +process.argv[4] : 4
if (!designs[which]) { console.error('design inconnu:', which, 'dispo:', Object.keys(designs)); process.exit(1) }
designs[which]()

if (process.env.SCAN) { // R par colonne (centre) sur quelques rangees
  for (const ry of [72, 80, 100]) { const r = []; for (let c = 0; c < COLS; c++) r.push(Math.round(cv[(ry * W + c * 16 + 8) * 4])); console.error('SCAN R row', ry, ':', r.join(' ')) }
}
if (process.env.MARK) { // marqueur ROUGE direct dans cv aux cols 6-8, rows 40-56
  for (let y = 40; y < 56; y++) for (let x = 6 * 16; x < 9 * 16; x++) { const j = (y * W + x) * 4; cv[j] = 255; cv[j + 1] = 0; cv[j + 2] = 0; cv[j + 3] = 255 }
}
// upscale x S -> RGBA8
const oW = W * S, oH = H * S, o = Buffer.alloc(oW * oH * 4)
for (let y = 0; y < oH; y++) for (let x = 0; x < oW; x++) {
  const sx = (x / S) | 0, sy = (y / S) | 0, j = (sy * W + sx) * 4, k = (y * oW + x) * 4
  o[k] = Math.max(0, Math.min(255, cv[j])); o[k + 1] = Math.max(0, Math.min(255, cv[j + 1])); o[k + 2] = Math.max(0, Math.min(255, cv[j + 2])); o[k + 3] = 255
  if (process.env.GRID) { // repere de colonnes (lignes fines tous les TILE, marquee au centre col7)
    if (sx % 16 === 0) { const cl = ((sx / 16) === 7) ? [0, 255, 255] : [60, 200, 255]; const al = ((sx / 16) === 7) ? 0.55 : 0.22; o[k] = o[k] * (1 - al) + cl[0] * al; o[k + 1] = o[k + 1] * (1 - al) + cl[1] * al; o[k + 2] = o[k + 2] * (1 - al) + cl[2] * al }
  }
}
fs.writeFileSync(out, encode(oW, oH, o))
console.error(`OK ${which} -> ${out} (${oW}x${oH})`)
