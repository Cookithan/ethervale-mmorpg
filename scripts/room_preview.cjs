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
  nin_bed_tan: decode(A + 'nin_bed_tan.png'),
  nin_bed_green: decode(A + 'nin_bed_green.png'),
  nin_bed_red: decode(A + 'nin_bed_red.png'),
  nin_bed_blue: decode(A + 'nin_bed_blue.png'),
  spr_door: decode(A + 'spr_door.png'), // porte Sprout animee (16x16 x 4 frames empilees) : f0/f2=ouverte, f1=fermee, f3=battant
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
function blit(img, sx, sy, sw, sh, dx, dy, scale, tint, ga, flip, rot) {
  scale = scale || 1; ga = ga == null ? 1 : ga; rot = rot || 0 // rot = 0/1/2/3 -> 0/90CW/180/90CCW
  dx = Math.round(dx); dy = Math.round(dy) // IMPERATIF : coords pixel ENTIERES (sinon py fractionnaire -> index plat fausse la colonne)
  if (process.env.DBG2) console.error('blit dest col', dx / 16, 'dx', dx)
  const ow = Math.round(sw * scale), oh = Math.round(sh * scale)
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    let lx = Math.floor(x / scale), ly = Math.floor(y / scale)
    if (flip) lx = sw - 1 - lx
    let slx = lx, sly = ly
    if (rot === 1) { slx = ly; sly = (sw - 1) - lx }            // 90 CW
    else if (rot === 2) { slx = (sw - 1) - lx; sly = (sh - 1) - ly } // 180
    else if (rot === 3) { slx = (sh - 1) - ly; sly = lx }       // 90 CCW
    const srcX = sx + slx
    const s = sample(img, srcX, sy + sly)
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
  woodWallRing(frame, tint, g0, g1, rot) { // mur en PLANCHES BOIS (penz_floors), rot optionnel pour planches verticales
    const wt = (cx, cy) => blit(sheets.penz_floors, (frame % cols.penz_floors) * 16, ((frame / cols.penz_floors) | 0) * 16, 16, 16, cx * 16, cy * 16, 1, tint, 1, false, rot || 0)
    for (let c = 0; c < COLS; c++) { wt(c, 0); wt(c, 1) }
    for (let r = 2; r < ROWS; r++) { wt(0, r); wt(COLS - 1, r) }
    for (let c = 1; c < COLS - 1; c++) if (c !== g0 && c !== g1) wt(c, ROWS - 1)
  },
  tileRot(sheet, sc, sr, gx, gy, rot, tint) { const cc = cols[sheet]; const f = sr * cc + sc; blit(sheets[sheet], (f % cc) * 16, ((f / cc) | 0) * 16, 16, 16, gx * 16, gy * 16, 1, tint, 1, false, rot) },
  // pp : meuble penz_furn, origine HAUT-GAUCHE, (sc,sr,w,h) tuiles -> pose en (gx,gy) tuiles
  furn(sheet, sc, sr, w, h, gx, gy, tint, flip) { if (process.env.DBG) console.error('furn', sheet, 'col', sc, 'row', sr, w + 'x' + h, '@', gx, gy); const cc = cols[sheet]; for (let tr = 0; tr < h; tr++) for (let tc = 0; tc < w; tc++) { const f = (sr + tr) * cc + (sc + tc); blit(sheets[sheet], (f % cc) * 16, ((f / cc) | 0) * 16, 16, 16, (gx + tc) * 16, (gy + tr) * 16, 1, tint, 1, flip) } },
  // si : item penz_items par FRAME, origine CENTRE, (cx,cy) tuiles, scale option
  item(frame, cx, cy, scale, tint) { scale = scale || 1; const cc = cols.penz_items; const sz = 16 * scale; blit(sheets.penz_items, (frame % cc) * 16, ((frame / cc) | 0) * 16, 16, 16, Math.round(cx * 16 - sz / 2), Math.round(cy * 16 - sz / 2), scale, tint) },
  whole(sheet, cx, cy, tint) { const img = sheets[sheet]; blit(img, 0, 0, img.W, img.H, Math.round(cx * 16 - img.W / 2), Math.round(cy * 16 - img.H / 2), 1, tint) },
  bed(name, gx, gy, flip) { const img = sheets[name]; blit(img, 0, 0, img.W, img.H, Math.round(gx * 16), Math.round(gy * 16), 1, null, 1, flip) }, // lit Ninja (32x48), origine HAUT-GAUCHE
  doorf(frame, cx, cy, scale) { scale = scale || 1; const sz = 16 * scale; blit(sheets.spr_door, 0, (frame || 0) * 16, 16, 16, Math.round(cx * 16 - sz / 2), Math.round(cy * 16 - sz / 2), scale) }, // porte Sprout, frame 0..3, origine CENTRE
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

designs.apoth_A = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x8f8270 // sol neutre/froid -> laisse le violet dominer
  const WALL = 0x9a8aa8 // mur froid/violace
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  // palette fioles
  const VIO = 0xb070ff, MAG = 0xe060c0, TEAL = 0x60d0d0, AMB = 0xffb060, GRN = 0x70e090, RED = 0xff6060
  ops.floor(FLOOR, FT)
  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)

  // === MUR DE FIOLES : 4 grandes etageres sombres COLLEES cote a cote au mur du fond (cols ~2..13) ===
  // leger chevauchement (pas 3.0) pour fermer les jointures = look maximaliste bourre
  const shelfCols = [2, 4.85, 7.7, 10.55]
  shelfCols.forEach((c) => ops.furn('penz_furn', 6, 4, 3, 3, c, 1.5)) // bibliotheque_sombre 3x3
  // fioles + bocaux sur CHAQUE rayon de CHAQUE etagere (3 rangs visibles : ~1.95 / ~2.85 / ~3.75)
  const rowsY = [1.95, 2.85, 3.75]
  const fioleTints = [VIO, MAG, TEAL, MAG, VIO, AMB, TEAL, VIO, MAG, GRN]
  shelfCols.forEach((c, si) => {
    rowsY.forEach((ry, ri) => {
      // 3 contenants par rayon : 2 fioles tintees + 1 bocal d'ingredient
      const t0 = fioleTints[(si * 3 + ri * 2) % fioleTints.length]
      const t1 = fioleTints[(si * 3 + ri * 2 + 1) % fioleTints.length]
      ops.item(6, c + 0.55, ry, 1, t0)                       // fiole gauche
      ops.item(6, c + 1.5, ry, 1, t1)                        // fiole centre
      ops.item([56, 57, 58, 59][(si + ri) % 4], c + 2.35, ry) // bocal d'ingredient droite
    })
  })

  // === LAMPADAIRES sur les murs lateraux ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 5.6); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 5.6)

  // === PLANTES dans les coins bas (suggere les herbes), bien dans la zone jouable ===
  ops.furn('penz_furn', 0, 9, 1, 2, 1, 8.1); ops.furn('penz_furn', 0, 9, 1, 2, COLS - 2, 8.1)

  // === PETIT COMPTOIR EN L (bas-GAUCHE) : commode 2x2 + 1-2 tuiles bar_long ; Ylva derriere (place ~ligne 6.5) ===
  // tapis ovale violet sous le comptoir
  ops.furn('penz_furn', 8, 3, 2, 1, 1.6, 7.4)               // tapis_ovale_violet
  ops.furn('penz_furn', 0, 0, 2, 2, 1.5, 7.5)               // commode (corps du comptoir)
  ops.furn('penz_furn', 8, 14, 2, 1, 3.5, 8.5)              // bar_long (retour du L, vers la droite)
  // clutter d'alchimie sur le comptoir
  ops.item(24, 2.0, 7.55)                                    // livre ouvert
  ops.item(26, 2.7, 7.45)                                    // bougie allumee
  ops.item(49, 3.4, 7.55, 1, VIO)                            // calice (potion violette servie)
  ops.item(6, 4.3, 8.45, 1, MAG); ops.item(6, 5.0, 8.45, 1, TEAL) // fioles sur le retour du bar

  // === CHAUDRON qui mijote (centre-bas) avec grosse vapeur violette ===
  const cauX = cxm + 0.5, cauY = 7.6
  ops.item(37, cauX, cauY, 2.4, 0x9a70d0)                    // chaudron plein, gros

  // === PORTE + tapis de seuil ovale violet ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : violet alchimiste dominant ===
  ops.glowT(cxm, 5.2, 230, 0x9a70d0, 0.13)                  // ambiance violette globale
  ops.glowT(cauX, cauY - 0.7, 56, 0xb070ff, 0.5)            // VAPEUR du chaudron (violet vif)
  ops.glowT(cauX, cauY - 1.3, 40, 0x70e090, 0.22)           // soupcon de vert qui s'echappe
  ops.glowT(1.5, 6.0, 44, 0xcfa8ff, 0.30); ops.glowT(COLS - 1.5, 6.0, 44, 0xcfa8ff, 0.30) // lampadaires (teinte violacee)
  ops.glowT(cxm, 2.4, 120, 0xb070ff, 0.10)                  // halo sur le mur de fioles
}

designs.apoth_B = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x8f8270            // sol neutre/froid (laisse parler le violet)
  const WALL = 0x9a8aa8          // mur pierre froide/violacee
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1
  ops.floor(FLOOR, FT)
  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)

  // === FENETRES (mur du fond, ecartees pour laisser la place au mur de fioles entre elles) ===
  ops.furn('penz_doors', 6, 3, 2, 2, 1.5, 0)         // fenetre gauche
  ops.furn('penz_doors', 6, 3, 2, 2, COLS - 3.5, 0)  // fenetre droite

  // === MUR DE FIOLES (2 grandes bibliotheques sombres collees au mur, ENTRE les fenetres) ===
  // violet/magenta DOMINANTS + qq teal/ambre/vert. NB le flacon (frame6) a un liquide ORANGE :
  // MULTIPLY garde le canal rouge -> il faut des teintes a FAIBLE rouge pour vraiment virer au violet.
  const VIO = 0x8048e0, MAG = 0xd040b0, TEAL = 0x40c8c8, AMBR = 0xffb050, VERT = 0x60d080
  const FIOLE = [VIO, MAG, VIO, TEAL, MAG, VIO, AMBR, MAG,
                 VIO, VERT, MAG, VIO, TEAL, VIO, MAG, AMBR]
  const shelfFioles = (gx) => {
    ops.furn('penz_furn', 6, 4, 3, 3, gx, 1.6)        // bibliotheque sombre 3x3 sous le haut de mur
    // rayon haut (y ~2.15) et rayon bas (y ~3.1), 4 fioles serrees par rayon -> mur de fioles dense
    for (let i = 0; i < 4; i++) {
      ops.item(6, gx + 0.45 + i * 0.7, 2.15, 1.0, FIOLE[(gx * 2 + i) % FIOLE.length])
      ops.item(6, gx + 0.45 + i * 0.7, 3.1, 1.0, FIOLE[(gx * 2 + i + 4) % FIOLE.length])
    }
  }
  shelfFioles(4.5)   // etagere gauche-centre
  shelfFioles(7.5)   // etagere droite-centre
  // bocaux d'ingredients sur le rebord SUPERIEUR (au-dessus, sous le haut de mur)
  ops.item(58, 4.95, 1.7, 0.85); ops.item(56, 6.6, 1.7, 0.85)
  ops.item(57, 7.95, 1.7, 0.85); ops.item(59, 9.6, 1.7, 0.85)

  // === COIN D'ETUDE (bas-droite) : etabli = table longue claire 3x2 ===
  ops.furn('penz_furn', 0, 2, 3, 2, 10.5, 7.2)        // etabli (cols 10.5-13.5)
  ops.item(25, 10.9, 7.25, 0.9)                        // livre ferme
  ops.item(24, 11.6, 7.3, 0.9)                         // livre ouvert
  ops.item(0, 12.2, 7.15, 0.85)                        // plume
  ops.item(3, 12.7, 7.2, 0.9)                          // pot a pinceaux violet
  ops.item(26, 11.0, 7.85, 0.9)                        // bougie allumee (chaleur ponctuelle)
  ops.furn('penz_furn', 8, 0, 1, 2, 11.4, 8.6)        // chaise face (place de travail)
  ops.furn('penz_furn', 0, 9, 1, 2, 12.4, 9.5)        // plante en pot (herbes, coin droit, rentree)

  // === PETIT COMPTOIR (bas-gauche) : commode = base du comptoir ; place Ylva DERRIERE (au-dessus) ===
  ops.furn('penz_furn', 0, 0, 2, 2, 1.6, 7.0)         // commode (comptoir) cols 1.6-3.6
  ops.item(49, 2.0, 7.05, 0.9)                         // calice (potion servie)
  ops.item(6, 2.6, 7.05, 0.9, 0x8048e0)               // fiole violette posee
  ops.item(29, 3.2, 7.0, 0.9)                          // urne bordeaux
  // (Ylva se tiendra ~ ligne 6.2, derriere/au-dessus du comptoir, dans le jeu — place laissee libre)

  // === CHAUDRON (coin bas-gauche, pres du comptoir) + urnes bordeaux ===
  ops.item(37, 2.3, 9.5, 2.4, 0x9a70d0)               // gros chaudron alchimique violace
  ops.item(29, 1.0, 9.0, 0.95)                         // urne bordeaux a gauche
  ops.item(29, 3.6, 9.4, 0.9)                          // urne bordeaux a droite
  ops.item(14, 4.1, 10.2, 0.95)                        // petite plante (herbes), degagee du chaudron

  // === LAMPADAIRE d'ambiance (cote droit, pres de l'etude) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 13.4, 3.6)

  // === PORTE + tapis ovale violet de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) EN DERNIER : violet feutre + chaleurs ponctuelles ===
  ops.glowT(7.5, 5.5, 200, 0x9a70d0, 0.12)            // ambiance violette globale
  ops.glowT(2.3, 9.0, 42, 0x9a70d0, 0.42)            // vapeur qui mijote au-dessus du chaudron
  ops.glowT(2.3, 8.8, 26, 0x70e090, 0.18)            // pointe verte (mixture)
  ops.glowT(11.0, 7.7, 30, 0xffcf8a, 0.34)           // bougie de l'etabli (chaude)
  ops.glowT(13.4, 3.9, 34, 0xb070ff, 0.26)           // halo du lampadaire (violet)
  ops.glowT(6.0, 2.5, 60, 0xb070ff, 0.16)            // lueur sur le mur de fioles
}

designs.apoth_C = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  // palette fioles : violet domine + qq accents (teal/ambre/vert/magenta)
  const PURP = 0xb070ff, MAG = 0xe060c0, TEAL = 0x60d0d0, AMBR = 0xffb060, GRN = 0x70e090
  // helper : range de fioles alignees sur un rayon d'etagere (y), de x0 a x1, couleurs cyclees
  const shelfVials = (y, x0, x1, cols) => {
    const n = cols.length
    for (let i = 0; i < n; i++) ops.item(6, x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)), y, 0.85, cols[i])
  }

  ops.floor(FLOOR, 0x817690)                 // sol pierre FROID/violace (laisse parler le violet)
  ops.wallRing(0x9a8aa8, g0, g1)             // murs froids/violaces
  ops.wallShadow(11, 0.55)                    // relief : ombre du sol contre les murs

  // --- TAPIS sous l'atelier (chaudron + table), avant les meubles ---
  ops.furn('penz_furn', 10, 2, 3, 3, cxm - 3.2, 4.5, 0x9a7ab0)  // tapis losanges teinte violet sous l'atelier (chaudron + table)

  // === MUR DE FIOLES : 2 grandes etageres sombres collees au mur du fond ===
  // etagere gauche (cols 2-4) et etagere droite (cols 8-10) ; centre du mur garde 2 fenetres
  ;[2, 8].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.5)            // bibliotheque_sombre 3x3
    shelfVials(2.05, c + 0.4, c + 2.6, [PURP, MAG, TEAL, AMBR])   // rayon haut
    shelfVials(3.05, c + 0.4, c + 2.6, [GRN, PURP, MAG, PURP])    // rayon bas (1 verte = accent)
  })
  // bocaux d'ingredients en haut des etageres (clutter alchimie)
  ops.item(58, 2.5, 1.55); ops.item(57, 4.3, 1.55)       // bocal vert / orange (gauche)
  ops.item(59, 8.5, 1.55); ops.item(56, 10.3, 1.55)      // bocal brun / clair (droite)
  // FENETRES au centre du mur du fond (entre les 2 etageres)
  ops.furn('penz_doors', 6, 3, 2, 2, cxm - 1, 0, 0xb0a0c0)

  // === HERBES SUSPENDUES (suggerees) : plantes en hauteur, rang ~2 pres du mur ===
  ops.item(15, 6.2, 2.2, 1.1, 0x9fd07a)   // plante automne tintee verte (herbe sechee, gauche fenetre)
  ops.item(14, 8.8, 2.2, 1.1)             // petite plante (droite fenetre)
  ops.item(7, 5.2, 2.25)                  // vase a tige (herbe)
  ops.item(7, 9.8, 2.25)

  // === PETIT COMPTOIR sur le COTE DROIT (PAS pleine largeur) — Ylva se tient derriere (place ~1 tuile a droite) ===
  ops.furn('penz_furn', 0, 0, 2, 2, 11.5, 6.6)            // commode_tiroirs = base du comptoir
  ops.item(24, 11.9, 6.65)                                // livre ouvert (registre)
  ops.item(0, 12.5, 6.55)                                 // plume
  ops.item(49, 13.0, 6.7, 1, PURP)                        // calice violet servi
  ops.item(26, 11.7, 6.55)                                // bougie allumee

  // === TABLE D'ALCHIMIE CENTRALE (table_ovale_basse) couverte de fioles tintees + calices ===
  const tx = cxm - 1, ty = 5.6
  ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)              // table ovale basse (2x2)
  // fioles + calices alignes sur le plateau (y ~ ty+0.15)
  ops.item(6, tx + 0.35, ty + 0.15, 0.95, PURP)
  ops.item(6, tx + 0.75, ty + 0.15, 0.95, MAG)
  ops.item(49, tx + 1.15, ty + 0.2, 0.95, GRN)          // calice vert servi (accent)
  ops.item(6, tx + 1.55, ty + 0.15, 0.95, TEAL)
  ops.item(24, tx + 0.95, ty + 0.55)                    // livre ouvert (recette) devant
  ops.item(3, tx + 0.2, ty + 0.5)                       // pot a pinceaux/plumes (violet)

  // === CHAUDRON juste A COTE de la table (cote gauche), il mijote ===
  const chX = tx - 1.2, chY = 6.1
  ops.item(37, chX, chY, 2.4, 0x9a70d0)                  // gros chaudron tinte violet

  // === LAMPADAIRES d'ambiance (murs lateraux) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.4); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 7.4)
  // plantes en pot dans les coins bas (herbes au sol)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 9.6, 0xa8d090)

  // === PORTE + tapis ovale violet de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)   // tapis ovale violet (col8 row3 2x1)

  // === LUMIERES (ADD) EN DERNIER : violet dominant + accent VERT sous/au-dessus du chaudron ===
  ops.glowT(cxm, 5.4, 200, 0x9a70d0, 0.13)                    // bain violet general
  ops.glowT(chX, chY - 0.55, 46, 0x70e090, 0.42)             // VAPEUR verte qui mijote (au-dessus du chaudron)
  ops.glowT(chX, chY + 0.2, 30, 0x60e070, 0.30)              // lueur verte SOUS le chaudron
  ops.glowT(tx + 0.95, ty + 0.2, 40, 0xb070ff, 0.26)        // halo violet sur la table d'alchimie
  ops.glowT(2.5, 7.6, 40, 0xc6a8ff, 0.28); ops.glowT(COLS - 2.5, 7.6, 40, 0xc6a8ff, 0.28) // lampadaires
  ops.glowT(3.5, 2.4, 40, 0xb88aff, 0.16); ops.glowT(9.5, 2.4, 40, 0xb88aff, 0.16)       // halos sur le mur de fioles
}

designs.apoth_D = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x7e7890          // sol pierre froid/violace (ambiance alchimiste, plus desature)
  const WT = 0x9a8aa8          // mur froid/violace
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2

  // helper : remplit une etagere (bibliotheque_sombre 3x3) de FIOLES colorees alignees sur 2 rayons
  const VIO = [0xb070ff, 0xe060c0, 0x60d0d0, 0xffb060, 0xff6060, 0x70e090]
  const fillShelf = (gx, gy, pal) => {
    ops.furn('penz_furn', 6, 4, 3, 3, gx, gy)
    // rayon haut (~ +0.6) et rayon bas (~ +1.6), 3 fioles par rayon
    for (let i = 0; i < 3; i++) ops.item(6, gx + 0.5 + i, gy + 0.6, 0.9, pal[i % pal.length])
    for (let i = 0; i < 3; i++) ops.item(6, gx + 0.5 + i, gy + 1.6, 0.9, pal[(i + 3) % pal.length])
  }
  // helper : etagere laterale BASSE (bibliotheque_basse 2x2) avec bocaux/fioles
  const sideShelf = (gx, gy, pal) => {
    ops.furn('penz_furn', 3, 2, 2, 2, gx, gy)
    ops.item(56, gx + 0.5, gy + 0.55, 0.85); ops.item(58, gx + 1.4, gy + 0.55, 0.85)
    ops.item(6, gx + 0.5, gy + 1.5, 0.85, pal[0]); ops.item(6, gx + 1.4, gy + 1.5, 0.85, pal[1])
  }

  ops.floor(FLOOR, FT)
  ops.wallRing(WT, g0, g1)
  ops.wallShadow(11, 0.5)

  // === MUR DE FIOLES CENTRAL (signature) collee au mur du fond, encadree par 2 fenetres ===
  fillShelf(cxm - 1.5, 1.5, VIO)                                   // grande etagere a fioles, centree
  ops.furn('penz_doors', 6, 3, 2, 2, cxm - 4.5, 0); ops.furn('penz_doors', 6, 3, 2, 2, cxm + 2.5, 0) // 2 fenetres symetriques

  // === 2 COLONNES D'ETAGERES LATERALES symetriques (bibliotheque) ===
  sideShelf(1, 2.2, [0xb070ff, 0x60d0d0])                          // gauche
  sideShelf(COLS - 3, 2.2, [0xe060c0, 0xffb060])                   // droite
  sideShelf(1, 4.6, [0x70e090, 0xff6060])                          // gauche bas
  sideShelf(COLS - 3, 4.6, [0x60d0d0, 0xb070ff])                   // droite bas

  // === COMPTOIR (PETIT) bas-centre-GAUCHE — 2 commodes ; place Ylva DERRIERE (au-dessus, vers gy6) ===
  ops.furn('penz_furn', 0, 0, 2, 2, 3, 7.4)                        // commode (2x2)
  ops.furn('penz_furn', 3, 0, 1, 2, 5, 7.4)                        // buffet (1x2) -> comptoir 3 large
  ops.item(24, 3.5, 7.45, 0.9); ops.item(49, 4.4, 7.45, 0.9, 0xb070ff); ops.item(26, 5.4, 7.45)  // livre + calice potion + bougie

  // === CHAUDRON qui mijote bas-DROITE ===
  ops.item(37, 11.0, 8.0, 2.4, 0x9a70d0)                           // gros chaudron tinte violet

  // === PLANTES EN POT symetriques (suggestion d'herbes), coins bas, hors des etageres ===
  // (l'item plante = sprite propre/fiable ; le furn plante_pot rendait casse sur cette planche)
  ops.item(15, 1.7, 8.8, 1.6); ops.item(15, COLS - 1.7, 8.8, 1.6)   // plantes touffues (herbes) en bas-G/D
  ops.item(14, 1.7, 7.4, 1.2); ops.item(14, COLS - 1.7, 7.4, 1.2)   // petites pousses au-dessus, herboristerie

  // PORTE + tapis ovale violet de seuil
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERE VIOLETTE uniforme (ADD) en dernier ===
  ops.glowT(cxm, 5.2, 220, 0x9a70d0, 0.15)                         // bain violet d'ambiance
  ops.glowT(cxm, 2.6, 60, 0xb070ff, 0.22)                          // halo sur le mur de fioles
  ops.glowT(11.0, 7.0, 50, 0x80e0a0, 0.38)                         // VAPEUR verte du chaudron (au-dessus)
  ops.glowT(11.0, 7.9, 30, 0x9a70d0, 0.22)                         // lueur violette sous le chaudron
  ops.glowT(2.0, 3.5, 42, 0xb070ff, 0.18); ops.glowT(COLS - 2.0, 3.5, 42, 0xb070ff, 0.18) // etageres laterales
}

// APOTHICAIRE FINAL — base A (mur de fioles plein) peaufinee : reflets violets/teal (verre clair teinte),
// plantes en pot fiables (items 14/15), chaudron pose sur tapis + ingredients autour, coin herboriste bas-droite.
designs.apoth_final = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x8f8270   // sol neutre/froid -> laisse le violet dominer
  const WALL = 0x9a8aa8 // mur pierre froide/violacee
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  // fioles CHAUDES = flask frame6 (liquide orange -> reste rouge/ambre meme tinte) ; POPS FROIDS = verre/calice CLAIR teinte (vrai violet/teal/vert/bleu)
  const WARMFLASK = [0xff7050, 0xffb050]                                   // rouge, ambre
  const RICH = [0x8050d0, 0x40c0d0, 0x60d070, 0x5a6ae0, 0xc050c0]          // violet, teal, vert, bleu, magenta
  ops.floor(FLOOR, FT)
  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)

  // === MUR DE FIOLES : 4 grandes etageres sombres COLLEES cote a cote au mur du fond ===
  const shelfCols = [2, 4.85, 7.7, 10.55]
  shelfCols.forEach((c) => ops.furn('penz_furn', 6, 4, 3, 3, c, 1.5)) // bibliotheque_sombre 3x3
  const rowsY = [2.05, 2.9, 3.75]
  shelfCols.forEach((c, si) => {
    rowsY.forEach((ry, ri) => {
      const k = si * 3 + ri
      ops.item(6, c + 0.5, ry, 0.95, WARMFLASK[k % WARMFLASK.length])             // fiole chaude (rouge/ambre)
      ops.item(40, c + 1.35, ry, 0.92, RICH[k % RICH.length])                     // verre droit CLAIR teinte FROID = vrai violet/teal/vert/bleu (forme fiole)
      ops.item([56, 57, 58, 59][(si + ri) % 4], c + 2.35, ry, 0.92)              // bocal d'ingredient
    })
  })

  // === LAMPADAIRES murs lateraux ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 5.4); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 5.4)

  // === PETIT COMPTOIR EN L (bas-GAUCHE) ; place laissee pour Ylva derriere (~gy 6.4) ===
  ops.furn('penz_furn', 8, 3, 2, 1, 1.6, 7.35)             // tapis ovale violet sous le comptoir
  ops.furn('penz_furn', 0, 0, 2, 2, 1.5, 7.4)             // commode (corps du comptoir)
  ops.furn('penz_furn', 8, 14, 2, 1, 3.5, 8.45)           // bar_long (retour du L vers la droite)
  ops.item(24, 2.0, 7.45)                                  // livre ouvert (registre)
  ops.item(26, 2.7, 7.35)                                  // bougie allumee
  ops.item(48, 3.4, 7.45, 1, 0x8050d0)                   // calice violet servi
  ops.item(40, 4.3, 8.4, 1, 0x40c0d0); ops.item(6, 5.0, 8.4, 1, 0xff7050) // fioles sur le retour

  // === CHAUDRON central pose sur un tapis + ingredients autour (plus seul) ===
  const cauX = cxm, cauY = 7.3
  ops.furn('penz_furn', 8, 3, 2, 1, cauX - 1, cauY + 0.6) // petit tapis ovale violet sous le chaudron
  ops.item(37, cauX, cauY, 2.4, 0x9a70d0)                  // gros chaudron tinte violet
  ops.item(29, cauX - 1.4, cauY + 0.45, 0.95)            // urne bordeaux gauche
  ops.item(29, cauX + 1.4, cauY + 0.45, 0.9)             // urne bordeaux droite

  // === COIN HERBORISTE bas-DROITE (equilibre la salle) : etagere basse + bocaux + fioles ===
  ops.furn('penz_furn', 3, 2, 2, 2, COLS - 3.2, 7.2)      // bibliotheque_basse 2x2 (ingredients)
  ops.item(58, COLS - 2.7, 7.45, 0.9); ops.item(56, COLS - 1.8, 7.45, 0.9)
  ops.item(6, COLS - 2.7, 8.35, 0.9, 0x60d070); ops.item(40, COLS - 1.8, 8.35, 0.9, 0x8050d0)

  // === HERBES en pot (items fiables 14/15) dans les coins bas ===
  ops.item(15, 1.5, 9.7, 1.5)                             // herbe touffue bas-gauche
  ops.item(14, COLS - 1.5, 9.6, 1.3)                      // pousse bas-droite

  // === PORTE + tapis ovale violet de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : violet alchimiste ===
  ops.glowT(cxm, 5.2, 235, 0x9a70d0, 0.13)                // bain violet global
  ops.glowT(cauX, cauY - 0.7, 58, 0xb070ff, 0.5)         // vapeur du chaudron (violet vif)
  ops.glowT(cauX, cauY - 1.3, 40, 0x70e090, 0.22)       // soupcon de vert qui s'echappe
  ops.glowT(1.5, 6.0, 44, 0xcfa8ff, 0.30); ops.glowT(COLS - 1.5, 6.0, 44, 0xcfa8ff, 0.30) // lampadaires
  ops.glowT(cxm, 2.4, 130, 0xb070ff, 0.12)              // halo sur le mur de fioles
}

// APOTHICAIRE v2 — modele TAVERNE : Ylva CENTREE derriere un GRAND comptoir pleine largeur,
// mur de fioles EXACTEMENT jointif (pas d'overlap = plus de meuble casse), chaudron deplace en coin, centre degage.
designs.apoth_v2 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 28)
  const FT = 0x8f8270, WALL = 0x9a8aa8
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  const WARMFLASK = [0xff7050, 0xffb050]
  const RICH = [0x8050d0, 0x40c0d0, 0x60d070, 0x5a6ae0, 0xc050c0]
  ops.floor(FLOOR, FT)
  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)
  // tapis central (habille le milieu a la place du chaudron ; marchable)
  ops.furn('penz_furn', 10, 2, 3, 2, cxm - 1.5, 7.9)
  // === MUR DE FIOLES : 4 etageres EXACTEMENT adjacentes (espacees de 3 = bords jointifs, AUCUN overlap) ===
  const shelfCols = [1.5, 4.5, 7.5, 10.5]
  shelfCols.forEach((c) => ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6))
  shelfCols.forEach((c, si) => [2.25, 3.2].forEach((ry, ri) => {
    const k = si * 2 + ri
    ops.item(6, c + 0.5, ry, 0.9, WARMFLASK[k % WARMFLASK.length])
    ops.item(40, c + 1.4, ry, 0.88, RICH[k % RICH.length])
    ops.item([56, 57, 58, 59][(si + ri) % 4], c + 2.35, ry, 0.88)
  }))
  // (YLVA centree ~ ligne 5.1, posee dans le jeu)
  // === GRAND COMPTOIR PLEINE LARGEUR (2 rangs) — infranchissable, on ne passe pas derriere ===
  const bL = 1, bR = COLS - 1
  for (const row of [5.6, 6.0]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  // clutter d'alchimie SUR le comptoir (registre, bougie, fioles, mortier/urne)
  ops.item(24, cxm - 2.6, 5.65); ops.item(26, cxm - 1.8, 5.55)
  ops.item(6, cxm + 0.4, 5.6, 0.9, 0xff7050); ops.item(40, cxm + 1.1, 5.6, 0.9, 0x8050d0); ops.item(40, cxm + 1.8, 5.6, 0.9, 0x40c0d0)
  ops.item(29, cxm + 2.7, 5.6, 0.95)
  ops.item(56, cxm + 3.5, 5.6, 0.9); ops.item(6, cxm + 4.3, 5.6, 0.9, 0x60d070) // bocal + fiole (droite du comptoir)
  // === COIN PREPARATION (bas-GAUCHE) : cabinet + tapis dessous + MOINS d'objets (mortier + 1 fiole) ===
  ops.furn('penz_furn', 8, 3, 2, 1, 1.7, 9.55)           // tapis sous le cabinet
  ops.furn('penz_furn', 0, 0, 2, 2, 1.7, 7.9)            // commode = cabinet a ingredients
  ops.item(29, 2.4, 7.95, 0.9)                            // mortier (urne)
  ops.item(6, 3.2, 7.95, 0.85, 0x8050d0)                 // fiole violette
  // === COIN HERBORISTE (bas-DROITE) : tapis dessous + etagere basse + bocaux/fioles ===
  ops.furn('penz_furn', 8, 3, 2, 1, COLS - 3.4, 9.8)     // tapis sous l'etagere
  ops.furn('penz_furn', 3, 2, 2, 2, COLS - 3.4, 8.1)
  ops.item(58, COLS - 2.9, 8.35, 0.9); ops.item(56, COLS - 2.0, 8.35, 0.9)
  ops.item(6, COLS - 2.9, 9.25, 0.9, 0x60d070); ops.item(40, COLS - 2.0, 9.25, 0.9, 0x8050d0)
  // === HERBES en pot (coins bas) ===
  ops.item(15, 1.5, 10.1, 1.4); ops.item(14, COLS - 1.5, 10.1, 1.3)
  // === PORTE + tapis de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // === LUMIERES violet (RENFORCEES) ===
  ops.glowT(cxm, 6.2, 250, 0x9a70d0, 0.20)                 // bain violet general (plus fort)
  ops.glowT(cxm, 8.7, 90, 0xb070ff, 0.18)                  // lueur violette au sol du centre
  ops.glowT(2.6, 8.0, 44, 0xb070ff, 0.30)                  // halo violet sur le cabinet (gauche)
  ops.glowT(COLS - 2.6, 8.6, 44, 0xb070ff, 0.28)           // halo violet sur l'etagere herboriste (droite)
  ops.glowT(2.5, 6.1, 42, 0xcfa8ff, 0.30); ops.glowT(COLS - 2.5, 6.1, 42, 0xcfa8ff, 0.30)         // lueurs aux bouts du comptoir
  ops.glowT(cxm, 2.6, 140, 0xb070ff, 0.22)                // halo violet sur le mur de fioles
}

// table ovale + 4 chaises qui REGARDENT toutes la table (haut=FACE, bas=DOS, gauche=PROFIL miroir, droite=PROFIL)
// dessin : chaise HAUT avant la table (derriere), chaise BAS apres la table (devant)
function ovalSeatA(tx, ty, items) {
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 0.5, null, false)   // HAUT : FACE (regarde vers le bas = table) — derriere
  ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.75, ty + 0.3, null, true)   // GAUCHE : PROFIL miroir (regarde a droite = table)
  ops.furn('penz_furn', 9, 0, 1, 2, tx + 1.75, ty + 0.3, null, false)  // DROITE : PROFIL (regarde a gauche = table)
  ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                            // TABLE ovale 2x2
  ;(items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (items.length - 1) / 2) * 0.55, ty + 0.85))
  ops.furn('penz_furn', 7, 0, 1, 2, tx + 0.5, ty + 1.1, null, false)   // BAS : DOS (regarde vers le haut = table) — devant
}

// TAVERNE tav_seat_A — base tavern_v9 (bar pleine largeur + tapis + lanternes + lumieres + porte) ;
// SEUL CHANGEMENT : 2 tables ovales a 4 chaises (haut=FACE bas=DOS gauche=PROFIL flip droite=PROFIL),
// tables RENTREES vers le centre (couloir >=1 tuile tout autour, tour de table possible), place pour s'asseoir.
designs.tav_seat_A = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis sous les 2 tables (rentrees vers le centre)
  ops.furn('penz_furn', 10, 2, 3, 2, 2.5, 8.6); ops.furn('penz_furn', 10, 2, 3, 2, 11.6, 8.6)
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0) // fenetres mur du fond
  // === MUR DE BOUTEILLES (3 etageres sombres collees au mur) ===
  ;[3, 7, 11].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6)
    ops.item(6, c + 0.5, 2.05); ops.item(57, c + 1.1, 2.05); ops.item(49, c + 1.7, 2.05)
    ops.item(58, c + 0.6, 3.05); ops.item(56, c + 1.5, 3.05)
  })
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
  // === 2 GRANDES TABLES OVALES A 4 CHAISES (rentrees vers le centre) ===
  ovalSeatA(3.3, 8.1, [54, 26])
  ovalSeatA(11.7, 8.1, [49, 61])
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.0, 235, 0xffba70, 0.10)
  ops.glowT(1.5, 7.4, 44, 0xffcf8a, 0.32); ops.glowT(COLS - 1.5, 7.4, 44, 0xffcf8a, 0.32)
  ops.glowT(cxm, 2.6, 72, 0xffce7a, 0.15)
}

// TAVERNE tav_seat_B — 2 grandes tables ovales AEREES (3 chaises chacune : haut FACE, gauche PROFIL flip, droite PROFIL),
// grand espacement, lanes de circulation larges, tables bien decollees des murs/comptoir. Priorite au CONFORT du tour de table.
designs.tav_seat_B = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis sous les 2 tables (avant meubles) — recentres sous chaque table aeree
  ops.furn('penz_furn', 10, 2, 3, 2, 3.0, 8.0); ops.furn('penz_furn', 10, 2, 3, 2, 10.0, 8.0)
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
  // === 2 GRANDES TABLES OVALES AEREES (3 chaises : haut FACE, gauche PROFIL flip, droite PROFIL) ===
  // table 2x2 @ (tx,ty). Chaises decollees ~0.5 tuile (place pour s'asseoir) ; couloir >=1 tuile autour (tour de table).
  const ovalB = (tx, ty, items) => {
    ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.7)               // HAUT : chaise FACE (regarde vers le bas = la table) ~0.3 tuck
    ops.furn('penz_furn', 9, 0, 1, 2, tx - 1.05, ty + 0.15, null, true) // GAUCHE : profil MIROIR (regarde a droite = la table)
    ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                           // table ovale 2x2
    ;(items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (items.length - 1) / 2) * 0.6, ty + 0.55))
    ops.furn('penz_furn', 9, 0, 1, 2, tx + 2.05, ty + 0.15)            // DROITE : profil (regarde a gauche = la table)
  }
  ovalB(3.5, 8.5, [54, 26])   // table gauche (centre col ~4.5) — decollee du mur/lampe
  ovalB(10.5, 8.5, [49, 61])  // table droite (centre col ~11.5) — symetrique
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.0, 235, 0xffba70, 0.10)
  ops.glowT(1.5, 7.4, 44, 0xffcf8a, 0.32); ops.glowT(COLS - 1.5, 7.4, 44, 0xffcf8a, 0.32)
  ops.glowT(cxm, 2.6, 72, 0xffce7a, 0.15)
}

designs.tav_seat_C = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 3.0, 8.9); ops.furn('penz_furn', 10, 2, 3, 2, 11.0, 8.9) // tapis sous les tables (recentres)
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 2, 0); ops.furn('penz_doors', 6, 3, 2, 2, COLS - 4, 0) // fenetres mur du fond
  // === MUR DE BOUTEILLES (3 etageres sombres collees au mur) ===
  ;[3, 7, 11].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6)
    ops.item(6, c + 0.5, 2.05); ops.item(57, c + 1.1, 2.05); ops.item(49, c + 1.7, 2.05)
    ops.item(58, c + 0.6, 3.05); ops.item(56, c + 1.5, 3.05)
  })
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
  // === 2 GRANDES TABLES OVALES — banquette HAUT (FACE) + BAS (DOS) seulement ===
  // helper LOCAL : table 2x2 a (tx,ty) ; chaise FACE au-dessus (regarde le bas = la table),
  // chaise DOS en-dessous (regarde le haut = la table). ~1/2 tuile pour s'asseoir, tour complet libre.
  const seatTopBot = (tx, ty, items) => {
    ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 0.95)               // HAUT : chaise FACE (assise vers le bas), tuckee sous le plateau
    ops.furn('penz_furn', 5, 2, 2, 2, tx, ty)                            // table ovale 2x2
    ;(items || []).forEach((it, i) => ops.item(it, tx + 1 + (i - (items.length - 1) / 2) * 0.6, ty + 0.55))
    ops.furn('penz_furn', 7, 0, 1, 2, tx + 0.5, ty + 0.95)              // BAS : chaise DOS (assise vers le haut), tuckee + couloir sous la table
  }
  seatTopBot(3.5, 8.5, [54, 26])    // table gauche (centre col ~4.5)
  seatTopBot(11.5, 8.5, [49, 61])   // table droite (centre col ~12.5)
  // PORTE + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(cxm, 5.0, 235, 0xffba70, 0.10)
  ops.glowT(1.5, 7.4, 44, 0xffcf8a, 0.32); ops.glowT(COLS - 1.5, 7.4, 44, 0xffcf8a, 0.32)
  ops.glowT(cxm, 2.6, 72, 0xffce7a, 0.15)
}

designs.auberge_A = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a            // bois FONCE chaleureux
  const WALL = 0xc89860          // pierre chaude
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2 // 17 cols -> g0=7,g1=8,doorCx=8
  ops.floor(FLOOR, FT)

  // === TAPIS (avant les meubles) ===
  ops.furn('penz_furn', 10, 2, 3, 3, 2.0, 5.2)             // coin du feu (gauche, devant le poele)
  ops.furn('penz_furn', 10, 2, 3, 2, cxm - 1.5, 9.2)       // sous la table commune (centre-bas)

  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)

  // === ACCUEIL (fond-CENTRE) : ETAGERES contre le mur du fond, puis BANDE Mira, puis COMPTOIR devant ===
  // 2 grandes bibliotheques SOMBRES (3x3) collees au mur (symetriques), encadrant un buffet central -> mur d'accueil large
  ops.furn('penz_furn', 6, 4, 3, 3, cxm - 4, 1.6)          // biblio sombre gauche (cols ~4-7)
  ops.furn('penz_furn', 6, 4, 3, 3, cxm + 1, 1.6)          // biblio sombre droite (cols ~9-12)
  ops.furn('penz_furn', 3, 0, 1, 2, cxm - 0.5, 1.6)        // buffet central (sous l'enseigne d'accueil)
  // clutter sur les rayons (chopes/bocaux/theiere = accueil d'auberge)
  ops.item(57, cxm - 3.5, 2.05); ops.item(63, cxm - 2.7, 2.05); ops.item(56, cxm - 1.9, 2.05)
  ops.item(58, cxm + 1.5, 2.05); ops.item(57, cxm + 2.3, 2.05); ops.item(63, cxm + 3.1, 2.05)
  ops.item(57, cxm - 3.5, 3.05); ops.item(56, cxm - 1.9, 3.05); ops.item(58, cxm + 1.5, 3.05); ops.item(57, cxm + 3.1, 3.05)
  ops.item(61, cxm - 0.1, 2.1)                              // pain sur le buffet central
  // (BANDE DEGAGEE rows ~4.6->5.4 : Mira va-et-vient etagere<->comptoir)
  // COMPTOIR d'accueil (1 rang, infranchissable) devant la bande, centre — bords + corps repete
  const aL = cxm - 4, aR = cxm + 5, aRow = 5.4
  ops.furn('penz_furn', 8, 14, 1, 1, aL, aRow)
  for (let c = aL + 1; c < aR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, aRow)
  ops.furn('penz_furn', 11, 14, 1, 1, aR - 1, aRow)
  // registre + bougie + clochette/chope sur le comptoir d'accueil
  ops.item(24, cxm - 3, aRow + 0.05); ops.item(26, cxm - 2.2, aRow - 0.02)
  ops.item(63, cxm + 1.5, aRow + 0.05); ops.item(54, cxm + 3, aRow + 0.05)

  // === CHEMINEE (mur GAUCHE) + COIN DU FEU : poele + 2 fauteuils profil qui REGARDENT le feu (a gauche) sur le tapis ===
  ops.furn('penz_furn', 9, 7, 1, 3, 1, 5.4)                // poele_cheminee colle au mur gauche (rows 5.4-8.4)
  ops.furn('penz_furn', 11, 6, 2, 2, 3.0, 5.0)            // fauteuil profil HAUT (regarde a gauche = le feu)
  ops.furn('penz_furn', 11, 6, 2, 2, 3.0, 8.0)            // fauteuil profil BAS (regarde a gauche = le feu)
  ops.item(5, 1.5, 9.4, 0.85)                              // pain_panier au coin du feu

  // === ESCALIER (mur DROIT) vers les chambres ===
  ops.furn('penz_doors', 0, 5, 2, 5, COLS - 3, 1.6)        // escalier de face avec rampe (2x5) colle a droite (cols 14-15, rows 1.6-6.6)
  ops.furn('penz_furn', 0, 9, 1, 2, COLS - 2.1, 7.0)       // plante au pied de l'escalier (sous, degagee)

  // === TABLE COMMUNE (centre-bas) : table longue claire + chaises haut/bas ===
  const tx = cxm - 1.5, ty = 9.4
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.4, ty - 1.0)    // chaise face (derriere, haut)
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 2.1, ty - 1.0)    // chaise face (derriere, haut)
  ops.furn('penz_furn', 0, 2, 3, 2, tx, ty)               // table longue claire (3x2)
  ops.item(61, tx + 0.7, ty + 0.25); ops.item(54, tx + 1.5, ty + 0.2); ops.item(63, tx + 2.3, ty + 0.25) // pain + chopes
  ops.furn('penz_furn', 7, 0, 1, 2, tx + 0.4, ty + 1.95)  // chaise dos (devant, bas)
  ops.furn('penz_furn', 7, 0, 1, 2, tx + 2.1, ty + 1.95)  // chaise dos (devant, bas)

  // === LAMPADAIRES + DECO cosy ===
  ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2.1, 9.4)      // lampadaire bas-droite (eclaire la table / l'escalier)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 11.0)           // plante bas-gauche

  // === PORTE + tapis de seuil (cols 8) DEGAGEE ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : ambre chaleureux + foyer ===
  ops.glowT(cxm, 6.0, 250, 0xffba70, 0.10)                // bain ambre global
  ops.glowT(1.4, 7.0, 64, 0xff9a40, 0.52)                // FOYER (cheminee, orange vif)
  ops.glowT(1.4, 6.0, 36, 0xffce7a, 0.30)                // halo chaud au-dessus du poele
  ops.glowT(cxm, 3.6, 130, 0xffce7a, 0.16)               // halo sur l'accueil (etageres)
  ops.glowT(COLS - 1.7, 9.6, 42, 0xffcf8a, 0.32)         // lampadaire bas-droite
  ops.glowT(cxm, 9.6, 70, 0xffba70, 0.16)                // chaleur sur la table commune
}

// AUBERGE_B — angle : ACCUEIL au fond-GAUCHE (comptoir + etageres), ESCALIER au fond-DROIT,
// CHEMINEE sur le mur DROIT (bas) avec coin du feu, TABLE commune au centre. Asymetrique, cosy, bois chaud + feu.
designs.auberge_B = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a            // bois chaud
  const g0 = 7, g1 = 8, doorCx = g0 + 1, cxm = COLS / 2  // porte centree (cols 7-8), doorCx=8
  ops.floor(FLOOR, FT)
  // --- TAPIS (avant les meubles) ---
  ops.furn('penz_furn', 10, 2, 3, 3, 5.5, 6.0)           // grand tapis losanges sous la table commune (centre)
  ops.furn('penz_furn', 10, 2, 3, 2, 12.2, 9.1)          // tapis losanges du coin du feu (mur droit bas)
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  // FENETRES sur le mur du fond (entre les zones) — lumiere du dehors
  ops.furn('penz_doors', 6, 3, 2, 2, 6.5, 0)             // fenetre entre l'accueil et l'horloge
  ops.furn('penz_doors', 6, 3, 2, 2, 11.3, 0)            // fenetre entre l'horloge et l'escalier

  // === ACCUEIL (fond-GAUCHE) ===
  // 1) ETAGERES contre le mur du fond, moitie gauche (cols 1..6). Mira s'affaire devant.
  ops.furn('penz_furn', 6, 4, 3, 3, 1, 1.6)              // bibliotheque sombre 3x3 (cols 1-3)
  ops.furn('penz_furn', 2, 4, 3, 3, 4, 1.6)              // bibliotheque claire 3x3 (cols 4-6)
  // clutter sur les rayons (registres, bocaux, chopes)
  ops.item(25, 1.6, 2.05); ops.item(56, 2.3, 2.05); ops.item(57, 3.0, 2.05)
  ops.item(24, 1.6, 3.05); ops.item(58, 2.5, 3.05)
  ops.item(54, 4.6, 2.05); ops.item(49, 5.3, 2.05); ops.item(56, 6.0, 2.05)
  ops.item(61, 4.7, 3.05); ops.item(57, 5.6, 3.05)
  // (Mira s'affaire ligne ~5.0, entre les etageres et le comptoir)
  // 2) COMPTOIR D'ACCUEIL (ligne bois bas), devant les etageres, infranchissable (cols 1..6)
  const aL = 1, aR = 7
  ops.furn('penz_furn', 8, 14, 1, 1, aL, 5.6)            // bord gauche du comptoir
  for (let c = aL + 1; c < aR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, 5.6) // corps
  ops.furn('penz_furn', 11, 14, 1, 1, aR - 1, 5.6)       // bord droit du comptoir
  // clutter sur le comptoir d'accueil (registre, bougie, calice, theiere, chope)
  ops.item(24, 1.6, 5.6); ops.item(26, 2.3, 5.5); ops.item(49, 4.3, 5.6); ops.item(63, 5.2, 5.55); ops.item(54, 6.0, 5.6)

  // === ESCALIER (fond-DROITE) contre le mur du fond ===
  ops.furn('penz_doors', 0, 5, 2, 5, 13.5, 1.5)          // escalier de face + rampe (2x5) vers l'etage
  // plante au pied gauche de l'escalier (habille le coin) — item fiable (le furn plante_pot rend casse)
  ops.item(15, 12.4, 5.6, 1.5)                            // plante touffue au pied de l'escalier

  // === CHEMINEE (mur DROIT, bas) + coin du feu ===
  ops.furn('penz_furn', 9, 7, 1, 3, 15.0, 8.2)           // poele_cheminee colle au mur droit (LE point chaud)
  ops.item(58, 14.4, 11.2, 0.85)                         // bocal au pied du foyer
  // coin du feu = banc bois (haut) + fauteuil orange (bas) sur le tapis, face au foyer ; rien ne touche le mur du bas
  ops.furn('penz_furn', 10, 0, 1, 2, 12.6, 8.3)          // banc_bois (assise par le feu)
  ops.furn('penz_furn', 8, 9, 2, 2, 12.9, 9.5)          // fauteuil_face orange (coin lounge du feu)
  ops.item(54, 11.9, 9.9)                                 // chope posee a cote du fauteuil

  // === TABLE COMMUNE (centre) — table longue + chaises ===
  const tx = 5.5, ty = 6.8
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.05) // chaise face haut (derriere)
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 1.7, ty - 1.05) // 2e chaise face haut
  ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.85, ty + 0.1, null, true)  // chaise profil gauche (regarde a droite)
  ops.furn('penz_furn', 0, 2, 3, 2, tx, ty)              // table longue claire 3x2
  ops.item(61, tx + 0.7, ty + 0.25); ops.item(54, tx + 1.5, ty + 0.25); ops.item(42, tx + 2.2, ty + 0.25)
  ops.furn('penz_furn', 9, 0, 1, 2, tx + 3.05, ty + 0.1) // chaise profil droite (regarde a gauche)
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty + 1.95) // chaise face bas (devant)
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 1.7, ty + 1.95) // 2e chaise face bas

  // === DECO cosy ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.6)              // lampadaire mur gauche
  ops.item(15, 1.5, 10.7, 1.5)                            // plante touffue coin bas-gauche (item fiable)
  ops.furn('penz_furn', 4, 7, 2, 3, 8.5, 1.6)            // horloge grand-pere (mur du fond, entre accueil et escalier)
  ops.item(15, 9.6, 9.0, 1.3)                             // plante d'appoint dans l'espace ouvert (equilibre droite)

  // === PORTE + tapis de seuil (cols 7-8) ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : lueurs ambrees ===
  ops.glowT(cxm, 6.0, 230, 0xffba70, 0.10)               // bain ambre general
  ops.glowT(15.3, 9.2, 72, 0xff9440, 0.5)                // FEU de la cheminee (orange chaud vif)
  ops.glowT(15.0, 8.4, 40, 0xffd070, 0.28)               // halo chaud au-dessus du foyer
  ops.glowT(3.5, 5.4, 60, 0xffce7a, 0.22)                // halo chaud sur le comptoir d'accueil
  ops.glowT(1.5, 8.0, 42, 0xffcf8a, 0.30)                // lampadaire gauche
  ops.glowT(3.5, 2.4, 70, 0xffce7a, 0.14)                // lueur sur les etageres d'accueil
  ops.glowT(14.5, 2.6, 46, 0xffd9a0, 0.16)               // douce lueur sur l'escalier
}

designs.auberge_C = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a            // bois chaud chaleureux
  const WALL = 0xc89860          // pierre chaude
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2 // door cols 7,8 -> doorCx 8
  ops.floor(FLOOR, FT)

  // --- TAPIS sous le salon (avant les meubles) : grand tapis losanges au centre-bas ---
  ops.furn('penz_furn', 10, 2, 3, 3, cxm - 1.5, 8.0)     // grand tapis losanges 3x3 sous le salon (coin du feu)

  ops.wallRing(WALL, g0, g1)
  ops.wallShadow(11, 0.5)

  // === FENETRES au mur du fond (de part et d'autre de l'accueil) ===
  ops.furn('penz_doors', 6, 3, 2, 2, 1.5, 0)
  ops.furn('penz_doors', 6, 3, 2, 2, COLS - 3.5, 0)

  // === ACCUEIL (fond/haut) : ETAGERES contre le mur (rang ~1.6) ; bande degagee rang ~4 ; COMPTOIR rang ~5 ===
  // Etageres derriere Mira : 3 bibliotheques collees au mur du fond (cols 5..14 centrees autour de cxm)
  ;[5, 8, 11].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 1.6)            // bibliotheque_sombre 3x3
    ops.item(57, c + 0.5, 2.05); ops.item(58, c + 1.1, 2.05); ops.item(49, c + 1.7, 2.05) // bocaux/calices
    ops.item(25, c + 0.6, 3.05); ops.item(24, c + 1.5, 3.05)                               // livres (registres d'auberge)
  })
  // (MIRA s'affaire dans la bande degagee rang ~4, entre les etageres (haut) et le comptoir (bas))
  // COMPTOIR D'ACCUEIL (ligne de banc-console, 2 rangs) — large, centre ; on ne passe PAS derriere
  const aL = 4, aR = COLS - 4  // accueil cols 4..12 (centre)
  for (const row of [5.0, 5.4]) {
    ops.furn('penz_furn', 8, 14, 1, 1, aL, row)
    for (let c = aL + 1; c < aR; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, aR, row)
  }
  // clutter d'accueil sur le comptoir (registre, bougie, clochette/calice, theiere)
  ops.item(24, aL + 0.7, 5.05); ops.item(26, aL + 1.5, 4.95); ops.item(49, cxm - 0.3, 5.05)
  ops.item(63, cxm + 1.0, 5.05); ops.item(26, aR - 0.5, 4.95)
  // 2 plantes encadrant le comptoir d'accueil (verdure d'entree)
  ops.furn('penz_furn', 0, 9, 1, 2, aL - 1.1, 4.6); ops.furn('penz_furn', 0, 9, 1, 2, aR + 1.1, 4.6)

  // === CHEMINEE (mur GAUCHE, mi-hauteur) — LE point chaud, le coin du feu se range autour ===
  ops.furn('penz_furn', 9, 7, 1, 3, 1, 7.4)              // poele_cheminee colle au mur gauche (1x3)
  ops.item(5, 1.6, 10.3, 1.1, 0xff9a4a)                  // chaudron/ragout pres du foyer (chaleur)
  ops.furn('penz_furn', 0, 9, 1, 2, 1.1, 5.4)           // plante au coin du feu (verdure, haut de la cheminee)

  // === GRAND SALON COSY (centre-bas, autour du grand tapis) : canape (haut) + 2 fauteuils (cotes) ===
  // canape long 3x2 en haut du tapis (regarde vers le bas, vers le coin du feu)
  ops.furn('penz_furn', 1, 9, 3, 2, cxm - 1.5, 7.7)      // canape_long 3 places
  // petite table basse au centre du tapis + clutter
  ops.furn('penz_furn', 5, 2, 2, 2, cxm - 1, 9.5)        // table_ovale_basse
  ops.item(7, cxm - 0.4, 9.75); ops.item(24, cxm + 0.4, 9.75) // vase + livre ouvert
  // 2 fauteuils de PROFIL face a face, encadrant la table basse (conversation pit)
  ops.furn('penz_furn', 11, 6, 2, 2, cxm - 2.4, 9.4, null, true)  // fauteuil profil GAUCHE (regarde a droite)
  ops.furn('penz_furn', 11, 6, 2, 2, cxm + 1.9, 9.4)             // fauteuil profil DROITE (regarde a gauche)

  // === ESCALIER (mur DROIT) vers les chambres de l'etage ===
  ops.furn('penz_doors', 0, 5, 2, 5, COLS - 3, 2.2)      // escalier_front_rampe 2x5 colle au mur droit

  // === TABLE COMMUNE (gauche-bas, decollee de la cheminee) avec chaises (repas) ===
  const txc = 3.0, tyc = 8.4
  ops.furn('penz_furn', 9, 0, 1, 2, txc - 0.85, tyc + 0.35, null, true) // chaise profil GAUCHE (miroir, vers la table)
  ops.furn('penz_furn', 8, 0, 1, 2, txc + 0.5, tyc - 0.95)        // chaise FACE (haut, derriere)
  ops.furn('penz_furn', 0, 2, 3, 2, txc, tyc)                     // table_longue_claire 3x2
  ops.item(2, txc + 0.7, tyc + 0.25); ops.item(61, txc + 1.6, tyc + 0.25); ops.item(54, txc + 2.3, tyc + 0.25) // plat + pain + chope
  ops.furn('penz_furn', 8, 0, 1, 2, txc + 0.5, tyc + 1.95)        // chaise FACE (bas, devant)

  // === LAMPADAIRES + horloge (deco cosy) ===
  ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 10.0)              // lampadaire bas-droite
  ops.furn('penz_furn', 6, 7, 1, 3, COLS - 5.5, 9.7)            // 2e lampadaire (eclaire le salon, cote droit)
  ops.furn('penz_furn', 4, 7, 2, 3, 1, 3.0)                      // horloge grand-pere (mur gauche haut)
  // plantes (verdure cosy) : bas-droite + mi-droite sous l'escalier
  ops.furn('penz_furn', 0, 9, 1, 2, COLS - 2.1, 7.6)            // plante mi-droite (sous l'escalier, remplit le vide)
  ops.item(15, COLS - 1.6, 11.6, 1.5)                            // grande plante touffue coin bas-droite

  // === PORTE + tapis de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : ambre chaleureux, foyer dominant ===
  ops.glowT(cxm, 6.5, 250, 0xffba70, 0.12)                       // bain ambre general
  ops.glowT(1.4, 8.9, 66, 0xff9a40, 0.5)                         // FEU de la cheminee (chaud vif)
  ops.glowT(1.5, 10.3, 38, 0xffce5a, 0.3)                        // braises/chaudron au sol
  ops.glowT(cxm, 9.6, 86, 0xffc070, 0.16)                        // lueur du salon
  ops.glowT(COLS - 1.6, 10.2, 40, 0xffcf8a, 0.34)               // lampadaire bas-droite
  ops.glowT(COLS - 5.1, 9.9, 38, 0xffcf8a, 0.30)               // 2e lampadaire (salon droite)
  ops.glowT(aL + 1.5, 4.95, 30, 0xffd27a, 0.3); ops.glowT(aR - 0.5, 4.95, 30, 0xffd27a, 0.3) // bougies d'accueil
  ops.glowT(cxm, 2.4, 120, 0xffce7a, 0.12)                       // halo sur les etageres d'accueil
}

designs.auberge_rev = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = 7, g1 = 8, doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis (avant meubles)
  ops.furn('penz_furn', 10, 2, 3, 3, 3.5, 7.4)            // grand tapis sous la table commune
  ops.furn('penz_furn', 10, 2, 3, 2, 12.0, 9.1)           // tapis coin du feu
  ops.furn('penz_furn', 8, 3, 2, 1, 9.5, 4.5); ops.furn('penz_furn', 8, 3, 2, 1, 12.5, 4.5) // descentes de lit
  ops.wallRing(0xc89860, g0, g1)
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 7.5, 0)              // 1 fenetre (entre accueil et lits)
  // ACCUEIL fond-gauche : 2 etageres COLLEES au mur (gy 1.0)
  ops.furn('penz_furn', 6, 4, 3, 3, 1, 1.0)
  ops.furn('penz_furn', 2, 4, 3, 3, 4, 1.0)
  ops.item(25, 1.6, 1.45); ops.item(56, 2.3, 1.45); ops.item(57, 3.0, 1.45)
  ops.item(24, 1.6, 2.45); ops.item(58, 2.5, 2.45)
  ops.item(54, 4.6, 1.45); ops.item(49, 5.3, 1.45); ops.item(56, 6.0, 1.45)
  ops.item(61, 4.7, 2.45); ops.item(57, 5.6, 2.45)
  // COMPTOIR d'accueil (cols 1-7, rang 5.4) infranchissable
  const aL = 1, aR = 7
  ops.furn('penz_furn', 8, 14, 1, 1, aL, 5.4)
  for (let c = aL + 1; c < aR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, 5.4)
  ops.furn('penz_furn', 11, 14, 1, 1, aR - 1, 5.4)
  ops.item(24, 1.6, 5.4); ops.item(26, 2.3, 5.3); ops.item(49, 4.3, 5.4); ops.item(63, 5.2, 5.35); ops.item(54, 6.0, 5.4)
  // 2 LITS (tete contre le mur du fond) au fond-droite
  ops.bed('nin_bed_tan', 9.5, 1.4)
  ops.bed('nin_bed_blue', 12.5, 1.4)
  // CHEMINEE (mur droit, bas) + coin du feu
  ops.furn('penz_furn', 9, 7, 1, 3, 15.0, 8.2)
  ops.item(58, 14.4, 11.2, 0.85)
  ops.furn('penz_furn', 10, 0, 1, 2, 12.6, 8.3)           // banc
  ops.furn('penz_furn', 8, 9, 2, 2, 12.9, 9.5)           // fauteuil
  ops.item(54, 11.9, 9.9)
  // TABLE COMMUNE (centre) + chaises bien orientees (BAS = chaise_dos vers la table)
  const tx = 3.5, ty = 7.6
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.05)
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 1.7, ty - 1.05)
  ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.85, ty + 0.1, null, true)
  ops.furn('penz_furn', 0, 2, 3, 2, tx, ty)
  ops.item(61, tx + 0.7, ty + 0.25); ops.item(54, tx + 1.5, ty + 0.25); ops.item(42, tx + 2.2, ty + 0.25)
  ops.furn('penz_furn', 9, 0, 1, 2, tx + 3.05, ty + 0.1)
  ops.furn('penz_furn', 7, 0, 1, 2, tx + 0.5, ty + 1.95)
  ops.furn('penz_furn', 7, 0, 1, 2, tx + 1.7, ty + 1.95)
  // DECO
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.6)              // lampadaire mur gauche
  ops.item(15, 1.5, 10.7, 1.5)                           // plante coin bas-gauche
  ops.item(15, 8.5, 5.6, 1.3)                            // plante entre accueil et lits
  // LUMIERES
  ops.glowT(cxm, 6.0, 230, 0xffba70, 0.10)
  ops.glowT(15.3, 9.2, 72, 0xff9440, 0.42)
  ops.glowT(15.0, 8.4, 40, 0xffd070, 0.26)
  ops.glowT(3.5, 5.2, 60, 0xffce7a, 0.22)
  ops.glowT(1.5, 8.0, 42, 0xffcf8a, 0.30)
  ops.glowT(3.5, 2.0, 70, 0xffce7a, 0.14)
  ops.glowT(11.5, 2.6, 80, 0xffd9a0, 0.14)
}

designs.auberge_rev2 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = 7, g1 = 8, doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis (avant meubles)
  ops.furn('penz_furn', 11, 4, 2, 2, 2.5, 9.0)        // tapis sous la petite table
  ops.furn('penz_furn', 10, 2, 3, 2, 12.5, 9.4)       // tapis coin du feu
  ops.furn('penz_furn', 8, 3, 2, 1, 7.5, 4.6); ops.furn('penz_furn', 8, 3, 2, 1, 10.5, 4.6); ops.furn('penz_furn', 8, 3, 2, 1, 13.5, 4.6) // descentes de lit
  ops.woodWallRing(92, 0x5a3520, g0, g1, 1)           // MUR BOIS = planches VERTICALES (rot) + teinte foncee/rouge -> distinct du sol
  ops.wallShadow(11, 0.5)
  // === ACCUEIL coin haut-gauche : etageres collees au mur (remontees 10px) + COMPTOIR EN L (Mira enfermee) ===
  ops.furn('penz_furn', 6, 4, 3, 3, 1, 0.375)         // bibliotheque (cols 1-4, remontee 10px)
  ops.furn('penz_furn', 0, 0, 2, 2, 4, 0.375)         // commode (cols 4-6)
  ops.item(57, 1.6, 0.825); ops.item(56, 2.5, 0.825); ops.item(49, 3.4, 0.825); ops.item(24, 1.6, 1.825); ops.item(58, 2.8, 1.825)
  const aL = 1, aR = 7
  ops.furn('penz_furn', 8, 14, 1, 1, aL, 5.0)
  for (let c = aL + 1; c < aR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, 5.0) // comptoir HORIZONTAL (front)
  ;[1, 2, 3, 4, 5].forEach((r) => ops.tileRot('penz_furn', 9, 14, 6, r, 3))        // comptoir horizontal REUTILISE en rotation 90° = jambe verticale du L
  ops.item(24, 2.0, 5.0); ops.item(26, 3.0, 4.9); ops.item(63, 4.5, 5.0); ops.item(54, 5.2, 4.95) // + tasse deplacee sur le comptoir
  // === 3 LITS espaces (tete au mur du fond) ===
  ops.bed('nin_bed_tan', 7.5, 1.4)
  ops.bed('nin_bed_red', 10.5, 1.4)
  ops.bed('nin_bed_blue', 13.5, 1.4)
  // 2e rangee (dortoir) : 2 lits sous les precedents, allee au milieu
  ops.furn('penz_furn', 8, 3, 2, 1, 9.5, 9.7); ops.furn('penz_furn', 8, 3, 2, 1, 12.5, 9.7) // descentes de lit
  ops.bed('nin_bed_green', 9.5, 6.6)
  ops.bed('nin_bed_tan', 12.5, 6.6)
  // === CHEMINEE (mur droit bas) — fauteuil RETIRE (meuble coupe) ===
  ops.furn('penz_furn', 9, 7, 1, 3, 15.0, 8.4)
  // === PETITE TABLE (bas-gauche) : table ronde + 2 chaises (gauche + droite, sens corrige) ; descendue de 3px ===
  const tx = 3.0, ty = 9.2 + 3 / 16
  ops.furn('penz_furn', 11, 0, 1, 2, tx, ty)          // table ronde
  ops.furn('penz_furn', 9, 0, 1, 2, tx - 1.0, ty + 0.1)             // chaise GAUCHE profil (regarde a droite = table)
  ops.furn('penz_furn', 9, 0, 1, 2, tx + 1.0, ty + 0.1, null, true) // chaise DROITE profil miroir (regarde a gauche = table)
  ops.item(54, tx + 0.5, ty + 0.5)
  // === DECO (pas de pot au milieu) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 8.0)           // lampadaire mur gauche
  ops.item(15, 1.5, 11.2, 1.4)                        // plante coin bas-gauche
  // === LUMIERES ===
  ops.glowT(cxm, 6.5, 240, 0xffba70, 0.10)
  ops.glowT(15.3, 9.8, 70, 0xff9440, 0.42); ops.glowT(15.0, 8.9, 38, 0xffd070, 0.26)
  ops.glowT(3.0, 4.6, 60, 0xffce7a, 0.22)
  ops.glowT(1.5, 8.4, 42, 0xffcf8a, 0.30)
  ops.glowT(10.5, 2.6, 130, 0xffd9a0, 0.12)
}

designs.auberge_new = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a
  const g0 = 7, g1 = 8, doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis (avant meubles) : 2 grands tapis "coin repos" (droite) + 1 tapis salon (centre)
  ops.furn('penz_furn', 10, 2, 3, 3, 11.3, 1.4); ops.furn('penz_furn', 10, 2, 3, 3, 13.8, 1.4)
  ops.furn('penz_furn', 10, 2, 3, 2, 4.0, 9.2)
  ops.woodWallRing(92, 0x5a3520, g0, g1, 1)        // mur bois vertical
  ops.wallShadow(11, 0.5)
  ops.furn('penz_doors', 6, 3, 2, 2, 6.0, 0)       // fenetre (salon)
  // === RECEPTION (haut-gauche) : Mira derriere un comptoir en L (quetes) ===
  ops.furn('penz_furn', 6, 4, 3, 3, 1, 0.4)        // biblio
  ops.furn('penz_furn', 0, 0, 2, 2, 4, 0.4)        // commode
  ops.item(57, 1.6, 0.85); ops.item(49, 2.6, 0.85); ops.item(24, 1.6, 1.85); ops.item(58, 2.8, 1.85)
  const aL = 1, aR = 6
  ops.furn('penz_furn', 8, 14, 1, 1, aL, 4.6)
  for (let c = aL + 1; c < aR; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, 4.6)  // comptoir front
  for (let r = 1; r <= 4; r++) ops.tileRot('penz_furn', 9, 14, 6, r, 3)         // jambe verticale du L (bench tourne)
  ops.item(24, 2.0, 4.6); ops.item(26, 3.0, 4.5); ops.item(54, 4.5, 4.6)
  // === ZONE REPOS (droite, separee) : 4 lits 2x2 ===
  ops.bed('nin_bed_tan', 11.3, 1.4); ops.bed('nin_bed_blue', 13.8, 1.4)
  ops.bed('nin_bed_red', 11.3, 6.6); ops.bed('nin_bed_green', 13.8, 6.6)
  ops.furn('penz_furn', 8, 3, 2, 1, 11.3, 4.5); ops.furn('penz_furn', 8, 3, 2, 1, 13.8, 4.5)  // descentes (1ere rangee)
  // === COIN DU FEU (mur gauche) ===
  ops.furn('penz_furn', 9, 7, 1, 3, 1, 7.5)        // poele cheminee
  ops.furn('penz_furn', 11, 6, 2, 2, 2.4, 8.0)     // fauteuil
  // === TABLE COMMUNE (centre-bas) : chaises tournees vers la table ===
  const tx = 4.0, ty = 9.6
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.05); ops.furn('penz_furn', 8, 0, 1, 2, tx + 1.7, ty - 1.05)
  ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.85, ty + 0.1)
  ops.furn('penz_furn', 0, 2, 3, 2, tx, ty)
  ops.item(61, tx + 0.8, ty + 0.3); ops.item(54, tx + 1.6, ty + 0.3)
  ops.furn('penz_furn', 9, 0, 1, 2, tx + 3.05, ty + 0.1, null, true)
  ops.furn('penz_furn', 7, 0, 1, 2, tx + 0.5, ty + 1.95); ops.furn('penz_furn', 7, 0, 1, 2, tx + 1.7, ty + 1.95)
  // === SEPARATION salon / repos : plantes en colonne ~col 9.5 ===
  ops.item(15, 9.6, 3.0, 1.4); ops.item(15, 9.6, 6.0, 1.4); ops.item(15, 9.6, 9.0, 1.4)
  // === DECO ===
  ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 10.5)  // lampadaire bas-droite
  ops.item(15, 1.5, 11.2, 1.4)                        // plante bas-gauche
  // === PORTE ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // === LUMIERES ===
  ops.glowT(cxm, 6.5, 240, 0xffba70, 0.10)
  ops.glowT(1.4, 8.2, 64, 0xff9440, 0.42); ops.glowT(1.4, 7.4, 36, 0xffd070, 0.26)
  ops.glowT(3, 4.6, 56, 0xffce7a, 0.20)
  ops.glowT(13, 4, 110, 0xffd9a0, 0.12)
}

designs.auberge_2room = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  const DW = 13, dr0 = 6, dr1 = 7 // mur de separation (col DW) + porte interieure (gap rows dr0..dr1)
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 6.0, 9.6)            // tapis table commune
  ops.furn('penz_furn', 10, 2, 3, 3, 14.5, 1.4); ops.furn('penz_furn', 10, 2, 3, 3, 14.5, 7.4) // tapis dortoir
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)
  // MUR DE SEPARATION vertical (col DW) avec PORTE interieure (gap dr0..dr1)
  for (let r = 2; r < ROWS - 1; r++) if (r < dr0 || r > dr1) ops.tileRot('penz_floors', 2, 5, DW, r, 1, WT)
  // === SALON (gauche) : reception Mira + cheminee + table commune ===
  ops.furn('penz_furn', 6, 4, 3, 3, 1, 0.4); ops.furn('penz_furn', 0, 0, 2, 2, 4, 0.4)
  ops.item(57, 1.6, 0.85); ops.item(49, 2.6, 0.85); ops.item(24, 1.6, 1.85); ops.item(58, 2.8, 1.85)
  const aL = 1, aR = 6
  ops.furn('penz_furn', 8, 14, 1, 1, aL, 4.6)
  for (let c = aL + 1; c < aR; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, 4.6)
  for (let r = 1; r <= 4; r++) ops.tileRot('penz_furn', 9, 14, 6, r, 3)
  ops.item(24, 2.0, 4.6); ops.item(26, 3.0, 4.5); ops.item(54, 4.5, 4.6)
  ops.furn('penz_doors', 6, 3, 2, 2, 8.5, 0)             // fenetre salon
  ops.furn('penz_furn', 4, 7, 2, 3, 10.5, 0.4)          // horloge grand-pere
  ops.furn('penz_furn', 9, 7, 1, 3, 1, 7.5)             // cheminee
  ops.furn('penz_furn', 11, 6, 2, 2, 2.4, 8.0)          // fauteuil
  const tx = 6.0, ty = 9.8
  ops.furn('penz_furn', 8, 0, 1, 2, tx + 0.5, ty - 1.05); ops.furn('penz_furn', 8, 0, 1, 2, tx + 1.7, ty - 1.05)
  ops.furn('penz_furn', 9, 0, 1, 2, tx - 0.85, ty + 0.1)
  ops.furn('penz_furn', 0, 2, 3, 2, tx, ty)
  ops.item(61, tx + 0.8, ty + 0.3); ops.item(54, tx + 1.6, ty + 0.3)
  ops.furn('penz_furn', 9, 0, 1, 2, tx + 3.05, ty + 0.1, null, true)
  ops.furn('penz_furn', 7, 0, 1, 2, tx + 0.5, ty + 1.95); ops.furn('penz_furn', 7, 0, 1, 2, tx + 1.7, ty + 1.95)
  ops.furn('penz_furn', 6, 7, 1, 3, 11, 8)              // lampadaire salon
  ops.item(15, 1.5, 11.5, 1.4)
  // === DORTOIR (droite) : 4 lits + deco ===
  ops.bed('nin_bed_tan', 14.5, 1.4); ops.bed('nin_bed_blue', 17, 1.4)
  ops.bed('nin_bed_red', 14.5, 7.4); ops.bed('nin_bed_green', 17, 7.4)
  ops.furn('penz_furn', 8, 3, 2, 1, 14.5, 4.4); ops.furn('penz_furn', 8, 3, 2, 1, 17, 4.4)
  ops.furn('penz_furn', 6, 7, 1, 3, 19, 10.5)           // lampadaire dortoir
  ops.item(15, 19, 5.5, 1.4)
  // PORTE (village) + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(6, 6.5, 220, 0xffba70, 0.10); ops.glowT(16.5, 6.5, 150, 0xffba70, 0.10)
  ops.glowT(1.4, 8.2, 64, 0xff9440, 0.42); ops.glowT(1.4, 7.4, 36, 0xffd070, 0.26)
  ops.glowT(3, 4.6, 56, 0xffce7a, 0.20)
  ops.glowT(16, 3, 90, 0xffd9a0, 0.12); ops.glowT(16, 9, 90, 0xffd9a0, 0.12)
}

// PETITE AUBERGE-RECEPTION : comptoir + Mira (quetes) + une PORTE vers le dortoir (~14x9)
designs.auberge_recep = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, cxm - 1.5, 6.0)     // tapis devant le comptoir
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)
  // COMPTOIR pleine largeur au fond (comme le barman) + etageres derriere + Mira
  ;[2, 6, 9].forEach((c) => { ops.furn('penz_furn', 6, 4, 3, 3, c, 0.4); ops.item(57, c + 0.5, 0.85); ops.item(49, c + 1.2, 0.85); ops.item(24, c + 0.6, 1.85) })
  const bL = 1, bR = COLS - 1
  for (const row of [3.6, 4.0]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  ops.item(24, 2.5, 3.6); ops.item(26, 4.0, 3.5); ops.item(54, cxm + 1, 3.6); ops.item(63, cxm + 2.5, 3.6)
  // PORTE INTERIEURE vers le DORTOIR (mur droit, bas) : cadre + tapis de seuil + (panneau "Dortoir")
  ops.furn('penz_doors', 6, 0, 2, 3, COLS - 3, ROWS - 4)  // cadre de porte ouverte
  ops.furn('penz_furn', 8, 3, 2, 1, COLS - 3, ROWS - 1.6) // tapis de seuil de la porte du dortoir
  // deco
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 6.0)               // lampadaire
  ops.item(15, 1.5, ROWS - 1.6, 1.4)
  // PORTE (village) + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  ops.glowT(cxm, 5, 200, 0xffba70, 0.12)
  ops.glowT(1.5, 6.4, 42, 0xffcf8a, 0.30)
  ops.glowT(COLS - 2, ROWS - 3, 60, 0xffd9a0, 0.18)
}

// GRAND DORTOIR : ~20 lits varies pour se reposer (15x18) + porte de sortie (retour auberge)
designs.dortoir_big = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)
  const colsX = [1.5, 4.5, 7.5, 10.5, 13.5]   // 1 tuile de jeu entre 2 lits (horizontal)
  const rowsY = [1.4, 5.4, 9.4, 13.4]          // 1 tuile d'allee entre 2 rangees (vertical)
  const COL = ['nin_bed_tan', 'nin_bed_red', 'nin_bed_blue', 'nin_bed_green']
  let i = 0
  rowsY.forEach((ry) => colsX.forEach((cx) => {
    ops.furn('penz_furn', 8, 3, 2, 1, cx, ry + 3.1)      // descente de lit
    ops.bed(COL[i % 4], cx, ry); i++
  }))
  // lanternes aux coins
  ops.furn('penz_furn', 6, 7, 1, 3, 1, ROWS - 4); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, ROWS - 4)
  // PORTE (retour auberge) + tapis
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  ops.glowT(cxm, 8, 320, 0xffba70, 0.10)
  ops.glowT(1.5, ROWS - 3.4, 44, 0xffcf8a, 0.28); ops.glowT(COLS - 1.5, ROWS - 3.4, 44, 0xffcf8a, 0.28)
}

// ===== ANGLE A : CLASSIQUE SOIGNE =====
// RECEPTION (14x9) : comptoir pleine largeur au fond + etageres garnies + Mira ; PORTE INTERIEURE sur le mur DROIT vers le dortoir.
designs.recep_A = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2 // 14 -> g0=6,g1=7,doorCx=7
  ops.floor(FLOOR, FT)
  // tapis d'accueil devant le comptoir (avant les meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, cxm - 1.5, 6.0)
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)

  // === ETAGERES garnies COLLEES au mur du fond (3 bibliotheques sombres 3x3) ===
  ;[2, 5.5, 9].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 0.4)               // bibliotheque sombre 3x3 (rows 0.4-3.4, sous le haut de mur)
    ops.item(57, c + 0.5, 0.85); ops.item(49, c + 1.3, 0.85); ops.item(56, c + 2.1, 0.85)  // rayon haut : chopes/bocaux
    ops.item(24, c + 0.6, 1.85); ops.item(63, c + 1.5, 1.85); ops.item(58, c + 2.2, 1.85)  // rayon bas : registres/bocaux
  })

  // === COMPTOIR PLEINE LARGEUR au fond (2 rangs, infranchissable) — Mira s'affaire DERRIERE (bande ~row 3.0) ===
  const bL = 1, bR = COLS - 1
  for (const row of [4.0, 4.4]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  // clutter sur le comptoir : registre de quetes, bougie, clochette, chope
  ops.item(24, 2.3, 4.05); ops.item(26, 3.3, 3.95); ops.item(63, cxm + 0.5, 4.05); ops.item(54, cxm + 2.2, 4.05)

  // === PORTE INTERIEURE vers le DORTOIR (mur DROIT) : cadre de porte FLUSH au mur droit + tapis de seuil, bien degagee ===
  ops.furn('penz_doors', 6, 0, 2, 3, COLS - 3, ROWS - 4)    // cadre de porte (2x3) colle au mur droit (cols 11-12, rows 5-7)
  ops.furn('penz_furn', 8, 3, 2, 1, COLS - 3, ROWS - 1.3)   // tapis de seuil devant la porte du dortoir

  // === DECO LEGERE : lampadaire + plante + tapis (deja pose) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 6.0)                 // lampadaire mur gauche
  ops.item(15, 1.5, ROWS - 1.6, 1.4)                        // plante coin bas-gauche

  // === PORTE (village) en bas + tapis de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : ambre chaleureux ===
  ops.glowT(cxm, 5, 210, 0xffba70, 0.12)                    // bain ambre global
  ops.glowT(cxm, 2.0, 120, 0xffce7a, 0.16)                  // halo sur l'accueil (etageres)
  ops.glowT(1.5, 6.4, 42, 0xffcf8a, 0.30)                   // lampadaire gauche
  ops.glowT(COLS - 3, ROWS - 2.5, 56, 0xffd9a0, 0.20)       // lueur de la porte du dortoir
}

// DORTOIR (17x18) : grille reguliere 5x4 = 20 lits couleurs alternees, allees larges et nettes, porte de sortie en bas.
designs.dorm_A = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2 // 17 -> g0=7,g1=8,doorCx=8
  ops.floor(FLOOR, FT)
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)

  // GRILLE 5 colonnes x 4 rangees = 20 lits. Lit = 2x3 (origine haut-gauche).
  // colsX : lit[cx,cx+2] ; 1.5,4.5,7.5,10.5,13.5 -> allee de 1 tuile entre lits (ex [3.5,4.5]).
  // rowsY : lit[ry,ry+3] ; 2.0,6.0,10.0,14.0 -> allee de 1 tuile entre rangees (ex [5,6]).
  const colsX = [1.5, 4.5, 7.5, 10.5, 13.5]
  const rowsY = [2.0, 6.0, 10.0, 14.0]
  const COL = ['nin_bed_tan', 'nin_bed_red', 'nin_bed_blue', 'nin_bed_green']
  rowsY.forEach((ry, r) => colsX.forEach((cx, c) => {
    const k = (r * 5 + c) % 4   // couleurs alternees en damier
    ops.bed(COL[k], cx, ry)
    if (ry + 3 < ROWS - 1) ops.furn('penz_furn', 8, 3, 2, 1, cx, ry + 3)   // descente de lit au pied (dans l'allee)
  }))

  // lanternes (lampadaires) aux 4 coins de la piece
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 2.2); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 2.2)
  ops.furn('penz_furn', 6, 7, 1, 3, 1, ROWS - 4); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, ROWS - 4)

  // PORTE de sortie (retour reception) en bas + tapis de seuil
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // LUMIERES (ADD) : ambiance douce et chaude, rangee
  ops.glowT(cxm, 8, 340, 0xffba70, 0.10)
  ops.glowT(1.5, 2.6, 40, 0xffcf8a, 0.26); ops.glowT(COLS - 1.5, 2.6, 40, 0xffcf8a, 0.26)
  ops.glowT(1.5, ROWS - 3.4, 40, 0xffcf8a, 0.26); ops.glowT(COLS - 1.5, ROWS - 3.4, 40, 0xffcf8a, 0.26)
}

// helper : un rayon de LIVRES alignes garnissant une etagere (frames livre 24/25), de gx..gx+2.4
function op_shelfBooks(gx, y) { for (let i = 0; i < 4; i++) ops.item(i % 2 ? 25 : 24, gx + 0.45 + i * 0.62, y, 0.95) }

// RECEPTION recep_B (14x9) : comptoir pleine largeur au fond + etageres garnies (Mira/quetes),
// coin LECTURE (etagere de livres + lampadaire + plante) bas-gauche, PORTE du dortoir au FOND-DROIT (mur droit),
// porte du village en bas. Petite piece chaleureuse et epuree.
designs.recep_B = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2 // 14 -> g0=6,g1=7,doorCx=7,cxm=7
  ops.floor(FLOOR, FT)
  // tapis d'accueil devant le comptoir (avant les meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, 3.0, 6.0)            // grand tapis losanges devant le comptoir
  ops.woodWallRing(92, WT, g0, g1, 1)                     // mur en planches bois VERTICALES
  ops.wallShadow(11, 0.5)

  // === COMPTOIR PLEINE LARGEUR au fond (laisse cols 11-13 = passage de droite vers la porte du dortoir) ===
  // ETAGERES GARNIES (bibliotheque) collees au mur du fond, derriere Mira
  ;[1, 4, 7].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 0.4)            // bibliotheque_sombre 3x3 (livres + bocaux)
    ops.item(25, c + 0.5, 0.85); ops.item(24, c + 1.4, 0.85); ops.item(57, c + 2.2, 0.85)  // livres + chope (registres)
     op_shelfBooks(c, 1.85)                                // rayon de livres garni
  })
  // (BANDE DEGAGEE rows ~3.4->4.2 : Mira va-et-vient etagere<->comptoir)
  // COMPTOIR (2 rangs, infranchissable) cols 1..10 -> Mira derriere, accueil large ; passage libre cols 11-13
  const bL = 1, bR = 11
  for (const row of [4.2, 4.6]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  // clutter d'accueil sur le comptoir (registre, bougie, clochette/chope, theiere)
  ops.item(24, 2.0, 4.25); ops.item(26, 3.0, 4.15); ops.item(54, 5.5, 4.25); ops.item(63, 8.5, 4.25)

  // === PORTE INTERIEURE vers le DORTOIR (mur DROIT, au FOND) — cadre + tapis de seuil ===
  // cadre de porte 2x3 contre le mur droit, en haut (rows 2-4), atteignable par le passage de droite (cols 11-13)
  ops.furn('penz_doors', 6, 0, 2, 3, COLS - 2, 2)         // cadre_porte_vide colle au mur droit (cols 12-13, rows 2-4)
  ops.furn('penz_furn', 8, 3, 2, 1, COLS - 3.2, 3.0)      // tapis ovale de seuil DEVANT (cote interieur) de la porte du dortoir

  // === COIN LECTURE (bas-GAUCHE) : etagere de livres garnie + fauteuil + lampadaire + plante ===
  ops.furn('penz_furn', 3, 2, 2, 2, 1, 5.6)              // bibliotheque_basse (livres) contre le mur gauche (rows 5.6-7.6)
  ops.item(25, 1.5, 6.1, 0.9); ops.item(24, 2.3, 6.1, 0.9)            // livres sur le rayon haut
  ops.item(25, 1.5, 7.05, 0.9); ops.item(57, 2.3, 7.05, 0.9)          // livre + chope sur le rayon bas
  ops.furn('penz_furn', 11, 6, 2, 2, 3.2, 5.9)          // fauteuil profil (regarde a gauche = vers l'etagere/coin lecture)
  ops.item(24, 4.3, 6.5, 0.85)                          // livre ouvert pose pres du fauteuil
  ops.furn('penz_furn', 6, 7, 1, 3, 1, ROWS - 4)        // lampadaire (lit la lecture), coin bas-gauche (rows 5-8)
  ops.item(15, 5.0, ROWS - 1.4, 1.4)                    // plante touffue (verdure) pres du coin lecture

  // === PORTE du VILLAGE (bas-centre) + tapis de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : ambre chaleureux ===
  ops.glowT(cxm, 4.6, 210, 0xffba70, 0.12)              // bain ambre global
  ops.glowT(cxm, 1.8, 120, 0xffce7a, 0.16)             // halo sur les etageres d'accueil
  ops.glowT(2.0, 7.0, 50, 0xffcf8a, 0.34)             // coin lecture (lampadaire, chaud)
  ops.glowT(COLS - 1.7, 3.4, 50, 0xffd9a0, 0.20)      // douce lueur sur la porte du dortoir
}

// DORTOIR dorm_B (17x18) : 20 lits (couleurs variees) en 4 rangees x 5 colonnes, allees praticables (1 tuile partout),
// GRAND TAPIS-ALLEE central (runner rouge) qui descend au centre, lanternes NOMBREUSES, porte de sortie en bas.
designs.dorm_B = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2 // 17 -> g0=7,g1=8,doorCx=8,cxm=8.5
  ops.floor(FLOOR, FT)
  // === GRAND TAPIS-ALLEE CENTRAL (runner) : longue bande de tapis losanges au centre, avant les meubles ===
  // colonne centrale = cols 7-9 (3 tuiles), de la 1ere rangee jusqu'a la porte. Pose en blocs 3x2 empiles.
  for (let ry = 1.6; ry < ROWS - 1.5; ry += 2) ops.furn('penz_furn', 10, 2, 3, 2, cxm - 1.5, ry)
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)

  // === 20 LITS : 4 rangees x 5 colonnes, couleurs variees, allee de 1 tuile entre chaque (H et V) ===
  // colonnes (gx, lit 2 large) : 2 groupes ecartes par le tapis central ; gaps 1 tuile partout = circulation fluide
  const colsX = [1, 4, 7, 10, 13]      // lits cols 1-2,4-5,7-8,10-11,13-14 ; gaps cols 3,6,9,12 ; marges 0/15
  const rowsY = [2, 6, 10, 14]          // tetes au rang 2/6/10/14 ; corps 3 de haut ; allee 1 tuile entre rangees
  const PAL = ['nin_bed_tan', 'nin_bed_red', 'nin_bed_blue', 'nin_bed_green']
  let i = 0
  rowsY.forEach((ry, ri) => colsX.forEach((cx, ci) => {
    ops.bed(PAL[(ci + ri) % 4], cx, ry)                  // couleur variee (decalage par rangee = pas 2 fois la meme cote a cote)
    if (ry + 3 < ROWS - 1) ops.furn('penz_furn', 8, 3, 2, 1, cx, ry + 3) // descente de lit au pied (sauf derniere rangee = collerait au mur du bas)
    i++
  }))

  // === LANTERNES NOMBREUSES : lampadaires aux 4 coins + 2 sur le mur du fond, lueurs douces partout ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, ROWS - 4); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, ROWS - 4) // bas G/D
  // bougies sur les descentes de lit centrales (chaleur) — petites lueurs ponctuelles
  // (les lueurs sont posees en fin via glowT pour rester douces)

  // === PORTE de sortie (retour auberge) en bas + tapis de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUMIERES (ADD) en dernier : ambiance dortoir chaud, NOMBREUSES lueurs douces ===
  ops.glowT(cxm, ROWS / 2, 360, 0xffba70, 0.10)         // bain ambre global doux
  // lueurs douces reparties (sensation de nombreuses lanternes) aux croisees d'allees
  ;[3, 7.5, 12].forEach((gy) => [3, 8.5, 14].forEach((gx) => ops.glowT(gx, gy, 70, 0xffcf8a, 0.12)))
  ops.glowT(1.5, ROWS - 3.4, 46, 0xffcf8a, 0.30); ops.glowT(COLS - 1.5, ROWS - 3.4, 46, 0xffcf8a, 0.30) // lampadaires bas
}

// RECEPTION COSY (recep_C, 14x9) : comptoir pleine largeur au fond + etageres garnies
// + Mira s'affaire dans la bande degagee ; porte du dortoir BIEN VISIBLE (mur droit) ;
// tapis d'accueil central + 2 plantes ; lueurs ambrees ; porte village en bas.
designs.recep_C = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis d'accueil central (devant le comptoir) - pose AVANT les meubles
  ops.furn('penz_furn', 10, 2, 3, 2, cxm - 1.5, 5.4)
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)
  // === ETAGERES GARNIES collees au mur du fond (bibliotheque sombre 3x3, posees a y0.4 comme la base) ===
  ;[1, 5, 9].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 0.4)               // bibliotheque sombre (3x3) sous le mur du fond
    ops.item(57, c + 0.5, 0.9); ops.item(49, c + 1.2, 0.9); ops.item(63, c + 2.0, 0.9)  // bocaux/flacons garnis (rayon haut)
    ops.item(24, c + 0.6, 1.9); ops.item(26, c + 1.6, 1.9)                              // livres/chopes (rayon bas)
  })
  // (Mira s'affaire dans la bande degagee rangs ~3.5, entre etageres et comptoir)
  // === COMPTOIR pleine largeur au fond (2 rangs, infranchissable) ===
  const bL = 1, bR = COLS - 1
  for (const row of [3.6, 4.0]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)             // embout gauche
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row) // corps
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)        // embout droit
  }
  // clutter d'accueil sur le comptoir (registre/chope/plat/bougie)
  ops.item(48, 2.5, 3.5); ops.item(54, 4.5, 3.5); ops.item(56, cxm + 1, 3.5); ops.item(40, cxm + 2.5, 3.5)
  // === PORTE INTERIEURE vers le DORTOIR (mur DROIT, BIEN VISIBLE) : porte OUVERTE 2x3 contre le mur droit + tapis de seuil ===
  ops.furn('penz_doors', 10, 0, 2, 3, COLS - 3, 4.8)        // porte OUVERTE brun/or (cols 11-12, rangs ~5-7) collee au mur droit
  ops.furn('penz_furn', 8, 3, 2, 1, COLS - 3, 7.5)          // tapis de seuil sous la porte du dortoir
  // === DECO LEGERE COSY : 2 plantes (1 grande en pot + 1 d'appoint) + 1 lampadaire ===
  ops.furn('penz_furn', 0, 9, 1, 2, 1, ROWS - 3)            // grande plante en pot, coin bas-gauche
  ops.item(15, COLS - 4, ROWS - 1.7, 1.3)                   // plante d'appoint (pot automne) a gauche de la porte du dortoir
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 4.6)                 // lampadaire (mur gauche)
  // === PORTE (village) + tapis de seuil ===
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // === LUEURS AMBREES ===
  ops.glowT(cxm, 5, 210, 0xffba70, 0.12)
  ops.glowT(1.5, 4.8, 44, 0xffcf8a, 0.30)
  ops.glowT(cxm, 2.6, 90, 0xffce7a, 0.14)
  ops.glowT(COLS - 2.5, 6, 56, 0xffd9a0, 0.18)               // halo chaud sur la porte du dortoir
}

// DORTOIR COSY (dorm_C, 17x18) : 20 lits couleurs variees, TETES alignees au mur,
// allees TRES aerees (1 tuile horizontal entre lits, 1 rang d'allee entre les rangees) ;
// descente de lit au pied de chaque lit ; lanternes + lueurs douces ; porte de sortie en bas.
designs.dorm_C = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)
  // 20 lits = 4 rangees x 5 lits. Lit = 2 large x 3 haut, TETE en haut (alignee).
  // X : lits a cols [1-2],[4-5],[7-8],[10-11],[13-14] (ecart 3 = 1 tuile d'allee entre 2 lits) ; bords libres.
  const colsX = [1, 4, 7, 10, 13]
  // Y : 4 rangees, lit occupe 3 rangs (ry..ry+2), 1 rang d'allee entre rangees.
  //   r1 y2(2-4) | allee5 | r2 y6(6-8) | allee9 | r3 y10(10-12) | allee13 | r4 y14(14-16) | mur17
  const rowsY = [2, 6, 10, 14]
  const COL = ['nin_bed_tan', 'nin_bed_red', 'nin_bed_blue', 'nin_bed_green']
  let i = 0
  rowsY.forEach((ry, rIdx) => colsX.forEach((cx) => {
    ops.bed(COL[(i + (rIdx % 4)) % 4], cx, ry)         // lit (tete en haut), couleurs variees melangees
    if (ry + 3 < ROWS - 1) ops.furn('penz_furn', 8, 3, 2, 1, cx, ry + 3) // descente de lit (sauf derniere rangee = mur)
    i++
  }))
  // lanternes aux coins bas (murs)
  ops.furn('penz_furn', 6, 7, 1, 3, 1, ROWS - 4); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, ROWS - 4)
  // PORTE (sortie auberge) + tapis de seuil
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // lueurs douces d'ambiance
  ops.glowT(cxm, 8, 360, 0xffba70, 0.09)
  ops.glowT(1.5, ROWS - 3.4, 46, 0xffcf8a, 0.26); ops.glowT(COLS - 1.5, ROWS - 3.4, 46, 0xffcf8a, 0.26)
  ops.glowT(cxm, 2, 110, 0xffce7a, 0.10)
}

designs.bartest2 = () => {
  ops.floor(92, 0xb5895a)
  ops.woodWallRing(92, 0x5a3520, Math.floor(COLS / 2) - 1, Math.floor(COLS / 2), 1)
  // comptoir_bar MODULAIRE (l'ensemble), rangee 12 corrigee : evier(sink) + tiroirs + placards + retour d'angle
  ops.furn('penz_furn', 6, 12, 2, 3, 1, 2.5)    // evier/sink (cols 1-2)
  ops.furn('penz_furn', 8, 12, 2, 3, 3, 2.5)    // tiroirs (3-4)
  ops.furn('penz_furn', 10, 12, 2, 3, 5, 2.5)   // placard (5-6)
  ops.furn('penz_furn', 8, 12, 2, 3, 7, 2.5)    // tiroirs (7-8)
  ops.furn('penz_furn', 10, 12, 2, 3, 9, 2.5)   // placard (9-10)
  ops.furn('penz_furn', 12, 12, 1, 3, 11, 2.5)  // comptoir_coin = retour d'angle en L (col 11)
}

// RECEPTION finale (14x11) : etageres + COMPTOIR_BAR (sink+tiroirs+placards+coin) + Mira ; porte mw_door (mur droit) vers le dortoir
designs.recep_bar = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 3.0, 8.2)            // tapis d'accueil
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)
  // ETAGERES garnies collees au mur (Mira s'affaire devant)
  ;[1, 5].forEach((c) => { ops.furn('penz_furn', 6, 4, 3, 3, c, 0.4); ops.item(57, c + 0.5, 0.85); ops.item(49, c + 1.3, 0.85); ops.item(24, c + 0.6, 1.85); ops.item(58, c + 1.6, 1.85) })
  // COMPTOIR_BAR (rows 4-6, 3 tall) : evier + tiroirs + placard + tiroirs + coin
  ops.furn('penz_furn', 6, 12, 2, 3, 1, 4)
  ops.furn('penz_furn', 8, 12, 2, 3, 3, 4)
  ops.furn('penz_furn', 10, 12, 2, 3, 5, 4)
  ops.furn('penz_furn', 8, 12, 2, 3, 7, 4)
  ops.furn('penz_furn', 12, 12, 1, 3, 9, 4)              // retour d'angle
  ops.item(24, 2, 4.3); ops.item(26, 4, 4.2); ops.item(54, 6, 4.3); ops.item(63, 8, 4.3) // clutter (registre quetes/bougie/chope)
  // PORTE du DORTOIR : mw_door sur le mur droit (ici pose pour reperer ; sera tournee 90° en jeu)
  ops.whole('mw_door', COLS - 1, 6.5)
  // DECO
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 8.0)              // lampadaire
  ops.item(15, 1.5, ROWS - 1.5, 1.4)                     // plante
  // PORTE village
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  ops.glowT(cxm, 6, 200, 0xffba70, 0.12); ops.glowT(2, 2, 90, 0xffce7a, 0.14)
  ops.glowT(COLS - 1.6, 6.5, 50, 0xffd9a0, 0.22)        // halo porte dortoir
}

// RECEPTION v2 (14x10) : ANCIEN comptoir (banc, comme apothicaire) avec bout OUVERT a droite + porte (mw_door) EN HAUT A DROITE
designs.recep_v2 = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 3, 7.6)             // tapis d'accueil
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)
  // ETAGERES (cols 1-7) — laisse le HAUT-DROITE libre pour la porte du dortoir
  ;[1, 4].forEach((c) => { ops.furn('penz_furn', 6, 4, 3, 3, c, 0.4); ops.item(57, c + 0.5, 0.85); ops.item(49, c + 1.3, 0.85); ops.item(24, c + 0.6, 1.85); ops.item(58, c + 1.6, 1.85) })
  // COMPTOIR = ANCIEN BANC (comme apothicaire), 2 rangs, cols 1-10 + BOUT OUVERT a droite (cols 11-13)
  const bL = 1, bR = 11
  for (const row of [4.6, 5.0]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)
    for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row)
    ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row)
  }
  ops.item(24, 2, 4.6); ops.item(26, 3.5, 4.5); ops.item(54, 6, 4.6); ops.item(63, 8, 4.6)
  // PORTE du DORTOIR : mw_door EN HAUT A DROITE (mur du fond, cols 11-12), atteignable par le bout ouvert
  ops.whole('mw_door', 11.5, 0.5)
  // DECO
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.0)             // lampadaire
  ops.item(15, 1.5, ROWS - 1.5, 1.4)                    // plante
  // PORTE village
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  ops.glowT(cxm, 6, 200, 0xffba70, 0.12); ops.glowT(2, 2, 90, 0xffce7a, 0.14)
  ops.glowT(11.5, 1.5, 60, 0xffd9a0, 0.24)              // halo porte du dortoir (haut-droite)
}

// RECEPTION encadree, ANGLE L (14x10) : comptoir en L (banc horizontal fond-gauche cols 1-9 + RETOUR vertical col 9
// qui ferme l'alcove de Mira) ; passage cols 10-12 -> PORTE haut-droite (cols 11-12). Le joueur parle a Mira PAR-DESSUS le banc.
designs.recep_enc_L = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  ops.furn('penz_furn', 10, 2, 3, 2, 3, 7.4)             // tapis d'accueil (devant le banc, cote joueur)
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)
  // ETAGERES garnies au fond (derriere Mira), cols 1-6 ; laisse le HAUT-DROITE libre pour la porte du dortoir
  ;[1, 4].forEach((c) => { ops.furn('penz_furn', 6, 4, 3, 3, c, 0.4); ops.item(57, c + 0.5, 0.85); ops.item(49, c + 1.3, 0.85); ops.item(24, c + 0.6, 1.85); ops.item(58, c + 1.6, 1.85) })
  // === COMPTOIR EN L ===
  // BANC HORIZONTAL (fond-gauche) cols 1-9, 2 rangs (epais = infranchissable). Descendu (row 5) pour laisser une alcove profonde a Mira.
  const bL = 1, bR = 9
  for (const row of [5.0, 5.4]) {
    ops.furn('penz_furn', 8, 14, 1, 1, bL, row)            // embout gauche
    for (let c = bL + 1; c < bR; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row) // corps
    ops.furn('penz_furn', 11, 14, 1, 1, bR, row)           // embout droit (coin du L)
  }
  // RETOUR VERTICAL (jambe du L) : banc tourne 90°, col 9, du mur du fond (row 2) jusqu'au banc -> ferme l'alcove a droite
  for (let r = 2; r <= 5; r++) ops.tileRot('penz_furn', 9, 14, 9, r, 1)
  // clutter sur le plateau du banc horizontal
  ops.item(24, 2, 5.0); ops.item(26, 3.5, 4.95); ops.item(54, 6, 5.0); ops.item(63, 8, 5.0) // registre/bougie/chope
  // === MIRA (enfermee dans l'alcove cols 1-8, rows 3-4 : mur gauche + etageres au fond + banc devant + retour a droite) ===
  ops.furn('penz_furn', 8, 3, 2, 1, 3.5, 4.2)  // petit tapis sous Mira (sa station d'accueil)
  ops.item(0, 4.5, 4.0, 1.3)                    // MARQUEUR place de Mira (pas de sprite PNJ au compositeur)
  // === PORTE du DORTOIR : EN HAUT A DROITE (mur du fond), cols 11-12 ; atteinte par le passage de droite ===
  ops.doorf(1, 11.5, 0.6)
  // === DECO du passage / accueil ===
  ops.furn('penz_furn', 6, 7, 1, 3, 12, 6.4)             // lampadaire (cote droit du passage)
  ops.item(15, 1.5, ROWS - 1.5, 1.4)                    // plante (coin bas-gauche)
  ops.item(15, 12.5, 3.4, 1.3)                          // plante (passage)
  // === PORTE village (bas) ===
  ops.doorf(1, doorCx + 0.5, ROWS - 0.6)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4) // tapis de seuil
  // === LUMIERES ===
  ops.glowT(cxm, 6, 200, 0xffba70, 0.12)
  ops.glowT(2, 2, 90, 0xffce7a, 0.16)                   // halo etageres/Mira
  ops.glowT(11.5, 1.5, 60, 0xffd9a0, 0.24)             // halo porte dortoir (haut-droite)
}

// RECEPTION recep_enc_U (14x10) : COMPTOIR EN U (banc horizontal + 2 retours verticaux gauche+droite)
//   -> Mira ENFERMEE dans un box guichet. Passage OUVERT a droite du U -> PORTE en HAUT-DROITE (dortoir).
designs.recep_enc_U = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2 // 14 -> g0=6,g1=7,doorCx=7
  ops.floor(FLOOR, FT)
  // tapis d'accueil DEVANT le guichet (avant les meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, 2.0, 7.0)
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)

  // === ETAGERES (fond, derriere Mira) : 2 bibliotheques sombres 3x3 collees au mur, cols 1-6 ===
  ;[1, 4].forEach((c) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 0.4)
    ops.item(57, c + 0.5, 0.85); ops.item(49, c + 1.3, 0.85); ops.item(24, c + 0.6, 1.85); ops.item(58, c + 1.6, 1.85)
  })

  // === COMPTOIR EN U (le box de Mira) ===
  //  - RETOUR vertical GAUCHE : col 1, rows 3-4 (banc tourne 90°)
  //  - RETOUR vertical DROIT  : col 7, rows 3-4 (banc tourne 90°)
  //  - BANC HORIZONTAL (front) : cols 1-7, row 5 (embout G / corps / embout D)
  const uL = 1, uR = 7, uTop = 3, uFront = 5
  // jambes verticales (du haut uTop jusqu'au banc horizontal exclu)
  for (let r = uTop; r < uFront; r++) {
    ops.tileRot('penz_furn', 9, 14, uL, r, 1)   // retour gauche (banc 90°)
    ops.tileRot('penz_furn', 9, 14, uR, r, 1)   // retour droit  (banc 90°)
  }
  // banc horizontal (front du guichet) : embout G, corps, embout D
  ops.furn('penz_furn', 8, 14, 1, 1, uL, uFront)
  for (let c = uL + 1; c < uR; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, uFront)
  ops.furn('penz_furn', 11, 14, 1, 1, uR, uFront)
  // clutter d'accueil sur le banc front (registre de quetes / clochette / chope)
  ops.item(24, uL + 1.5, uFront + 0.05); ops.item(26, cxm - 3.5, uFront - 0.05); ops.item(54, uR - 1, uFront + 0.05)

  // === MIRA (enfermee dans le box) : pas de sprite au compositeur -> marqueur ===
  const miraX = 4, miraY = 4
  ops.item(0, miraX, miraY, 1.2) // <- MARQUEUR de Mira (place en TUILES [4,4]); en jeu = PNJ Mira

  // === PORTE du DORTOIR : EN HAUT A DROITE (mur du fond, cols 11-12), atteignable par le PASSAGE DROIT ===
  ops.doorf(1, 11.5, 1.4) // porte Sprout FERMEE (frame 1), origine CENTRE

  // === DECO LEGERE : lampadaire mur gauche + plante coin + tapis (deja pose) ===
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 6.4)    // lampadaire (mur gauche, sous le retour gauche)
  ops.furn('penz_furn', 10, 2, 3, 2, 9.2, 4.1) // petit tapis dans le passage droit (vers la porte)
  ops.item(15, 8.6, 6.6, 1.4)                  // plante (balise l'entree du passage droit, bas)

  // === PORTE (village) en bas + tapis de seuil ===
  ops.doorf(1, doorCx + 0.5, ROWS - 0.6)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)

  // === LUEURS AMBREES ===
  ops.glowT(cxm, 5, 200, 0xffba70, 0.12)
  ops.glowT(miraX, 2.4, 80, 0xffce7a, 0.16)    // halo sur l'accueil (Mira/etageres)
  ops.glowT(1.6, 6.6, 42, 0xffcf8a, 0.30)      // lampadaire gauche
  ops.glowT(11.5, 1.6, 54, 0xffd9a0, 0.22)     // halo porte du dortoir (haut-droite)
}

// RECEPTION enc_D (14x10) : ALCOVE COMPACTE de Mira a GAUCHE (etageres au fond + banc en L qui l'enferme),
// grand passage degage a DROITE menant a la porte HAUT-DROITE. Ambiance hall d'auberge.
designs.recep_enc_D = () => {
  const FLOOR = (process.argv[5] != null ? +process.argv[5] : 92)
  const FT = 0xb5895a, WT = 0x5a3520
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(FLOOR, FT)
  // tapis d'accueil dans le passage (avant les meubles)
  ops.furn('penz_furn', 10, 2, 3, 2, 7.5, 6.2)
  ops.woodWallRing(92, WT, g0, g1, 1)
  ops.wallShadow(11, 0.5)
  // === ALCOVE DE MIRA (gauche) ===
  // 1) ETAGERES au fond (derriere Mira), collees au mur du haut, cols 1-3 (rangs 0-2)
  ops.furn('penz_furn', 6, 4, 3, 3, 1, 0.4)
  ops.item(57, 1.5, 0.85); ops.item(49, 2.3, 0.85); ops.item(24, 1.6, 1.85); ops.item(58, 2.4, 1.85)
  // 2) BANC-COMPTOIR en U/L qui ENFERME Mira : front horizontal (cols 1-3) + retour vertical (col 3, rang 3)
  //    front horizontal (rang 4) : embout gauche(8) + corps(9) + embout droit(11)
  ops.furn('penz_furn', 8, 14, 1, 1, 1, 4)
  ops.furn('penz_furn', 9, 14, 1, 1, 2, 4)
  ops.furn('penz_furn', 11, 14, 1, 1, 3, 4)
  //    retour vertical (col 3, rang 3) : banc tourne 90° -> ferme le cote DROIT de l'alcove
  ops.tileRot('penz_furn', 9, 14, 3, 3, 1)
  // clutter sur le comptoir (registre + chope)
  ops.item(2, 1.6, 4.0); ops.item(54, 2.5, 4.0) // feuille de papier (registre) + chope
  // 3) MIRA (enfermee) — marqueur (pas de sprite au compositeur) ; elle se tient col 2, rang 3
  ops.item(0, 2.0, 3.0, 1.3) // <<< MIRA ICI (plume marqueur, dans la poche close)
  // === PASSAGE DROITE (degage) vers la porte haut-droite ===
  // lampadaire pour baliser le passage (cote droit, contre le mur)
  ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 6.0)
  ops.item(15, 9.5, 2.4, 1.4) // plante d'accueil (cote gauche de la porte du dortoir, ne bloque pas l'approche)
  // PORTE du DORTOIR : mw_door EN HAUT A DROITE (mur du fond, cols 11-12)
  ops.whole('mw_door', 11.5, 0.5)
  // PORTE village (bas)
  ops.whole('mw_door', doorCx + 0.5, ROWS - 0.5)
  ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
  // LUMIERES
  ops.glowT(2.5, 2.2, 80, 0xffce7a, 0.18)   // alcove Mira chaude
  ops.glowT(9, 6, 150, 0xffba70, 0.12)      // passage
  ops.glowT(11.5, 1.5, 60, 0xffd9a0, 0.24)  // halo porte dortoir (haut-droite)
}

// ===== APERÇUS des 4 nouveaux intérieurs (forge/marchand/maison/banque) — calqués sur buildInterior =====
designs.forge = () => {
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2, bL = 1, bR = COLS - 1
  ops.floor(92, 0x5a5048); ops.wallRing(0x4a4a4a, g0, g1); ops.wallShadow()
  ops.furn('penz_furn', 9, 7, 1, 3, 1.3, 0.6); ops.glowT(1.8, 2.0, 150, 0xff5533, 0.42); ops.glowT(1.8, 3.0, 115, 0xffaa44, 0.24); ops.item(37, 3.0, 2.6) // fournaise (poêle) + chaudron de trempe
  ops.furn('penz_furn', 4, 14, 2, 1, COLS - 3.3, 0.4); ops.furn('penz_furn', 0, 0, 2, 2, COLS - 3.3, 1.0); ops.item(62, COLS - 2.8, 1.4); ops.item(26, COLS - 1.9, 1.4) // outils suspendus + établi à outils (commode)
  for (const row of [5.6, 6.0]) { ops.furn('penz_furn', 8, 14, 1, 1, bL, row); for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row); ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row) }
  ops.item(37, cxm - 1.5, 5.6); ops.item(62, cxm + 0.4, 5.6); ops.item(26, cxm + 2.0, 5.5)
  ops.item(62, 1.5, ROWS - 1.5, 1.3); ops.item(62, COLS - 1.5, ROWS - 1.5, 1.2) // caisses de charbon (coins)
  ops.glowT(cxm, 7.0, 154, 0xffaa44, 0.16); ops.glowT(COLS - 2.6, 2.2, 102, 0xffcf8a, 0.18)
  ops.doorf(1, doorCx + 0.5, ROWS - 0.6); ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
}
designs.merchant = () => {
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2, bL = 1, bR = COLS - 1
  ops.floor(92, 0xb5895a); ops.woodWallRing(92, 0x6e4a28, g0, g1, 1); ops.wallShadow()
  ;[1.5, 5.5, 9.5].forEach((c, i) => {
    ops.furn('penz_furn', 6, 4, 3, 3, c, 0.275)
    ops.item([6, 56, 54][i], c + 0.5, 0.775, 0.9, [0xff7050, null, 0xffb050][i]); ops.item([40, 57, 42][i], c + 1.4, 0.775, 0.9, [0x8050d0, null, null][i]); ops.item([49, 58, 61][i], c + 2.3, 0.775, 0.88)
  })
  for (const row of [5.6, 6.0]) { ops.furn('penz_furn', 8, 14, 1, 1, bL, row); for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row); ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row) }
  ops.item(24, cxm - 2.5, 5.65); ops.item(26, cxm - 1.6, 5.55); ops.item(54, cxm + 0.4, 5.6); ops.item(6, cxm + 1.5, 5.6, 0.9, 0xff7050); ops.item(49, cxm + 2.6, 5.6)
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.0); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 7.0)
  ops.item(15, 2.5, ROWS - 1.5, 1.3); ops.item(14, COLS - 2.5, ROWS - 1.5, 1.2)
  ops.glowT(cxm, 7.2, 154, 0xffcf8a, 0.18); ops.glowT(2, 2.4, 102, 0xffd9a0, 0.16); ops.glowT(COLS - 2, 2.4, 102, 0xffd9a0, 0.16)
  ops.doorf(1, doorCx + 0.5, ROWS - 0.6); ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
}
designs.house = () => {
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2
  ops.floor(92, 0xb5895a); ops.woodWallRing(92, 0x6b4c28, g0, g1, 1); ops.wallShadow()
  ops.furn('penz_furn', 9, 7, 1, 3, 1.0, 0.8); ops.glowT(1.5, 2.2, 80, 0xffb060, 0.28); ops.item(37, 2.2, 2.6) // foyer (poêle) + chaudron
  ops.bed('nin_bed_red', COLS - 3.5, 0.8) // vrai lit Ninja
  ops.furn('penz_furn', 10, 2, 3, 2, cxm - 1.5, 5.6) // tapis
  ops.furn('penz_furn', 5, 2, 2, 2, cxm - 1, 6.0) // table
  ops.furn('penz_furn', 5, 0, 1, 2, cxm - 0.5, 4.4); ops.furn('penz_furn', 7, 0, 1, 2, cxm - 0.5, 7.5) // chaises face/dos
  ops.item(61, cxm, 6.5, 0.9) // pain
  ops.furn('penz_furn', 3, 2, 2, 2, COLS - 3, 6.2); ops.item(58, COLS - 2.5, 6.4, 0.9); ops.item(57, COLS - 1.6, 6.4, 0.9) // étagère
  ops.item(15, 1.5, ROWS - 1.5, 1.3)
  ops.glowT(cxm, 6.5, 150, 0xffba70, 0.14); ops.glowT(COLS - 2.4, 6.4, 70, 0xffce7a, 0.12)
  ops.doorf(1, doorCx + 0.5, ROWS - 0.6); ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
}
designs.bank = () => {
  const g0 = Math.floor(COLS / 2) - 1, g1 = Math.floor(COLS / 2), doorCx = g0 + 1, cxm = COLS / 2, bL = 2, bR = COLS - 1
  ops.floor(92, 0x6e6880); ops.wallRing(0x6a6a82, g0, g1); ops.wallShadow()
  ops.furn('penz_furn', 2, 12, 2, 3, 1.0, 0.6); ops.glowT(2.0, 1.8, 90, 0x6a9aff, 0.16) // coffre-fort (frigo métal)
  ops.furn('penz_furn', 3, 2, 2, 2, COLS - 3.5, 1.6) // étagère trésor
  ops.item(29, COLS - 3.0, 2.0, 0.9, 0xffd700); ops.item(29, COLS - 2.0, 2.0, 0.9, 0xffed4e); ops.item(57, COLS - 2.5, 2.8, 0.9, 0xffd700) // urnes/bocal dorés
  for (const row of [5.6, 6.0]) { ops.furn('penz_furn', 8, 14, 1, 1, bL, row); for (let c = bL + 1; c < bR - 1; c++) ops.furn('penz_furn', 9, 14, 1, 1, c, row); ops.furn('penz_furn', 11, 14, 1, 1, bR - 1, row) }
  ops.item(24, bL + 0.6, 5.65); ops.item(26, bL + 1.4, 5.55); ops.item(29, cxm + 1.0, 5.6, 0.9, 0xffd700)
  ops.furn('penz_furn', 6, 7, 1, 3, 1, 7.0); ops.furn('penz_furn', 6, 7, 1, 3, COLS - 2, 7.0)
  ops.item(15, 2.5, ROWS - 1.5, 1.3); ops.item(14, COLS - 2.5, ROWS - 1.5, 1.2)
  ops.glowT(cxm, 7.2, 120, 0xffd700, 0.18); ops.glowT(COLS - 2.5, 2.2, 70, 0xffd700, 0.12)
  ops.doorf(1, doorCx + 0.5, ROWS - 0.6); ops.furn('penz_furn', 8, 3, 2, 1, doorCx - 1, ROWS - 1.4)
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
