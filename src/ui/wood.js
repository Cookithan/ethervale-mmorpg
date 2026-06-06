/**
 * Helpers UI « Theme Wood » (Ninja Adventure, CC0) — panneaux + boutons en VRAIES textures nine-slice
 * (plus de rectangles dessinés). Réutilisable dans toutes les scènes.
 * Textures chargées dans BootScene : ui_panel, ui_bg, btn_normal/hover/pressed.
 */
import Phaser from 'phaser'

/** Panneau bois nine-slice (cadre). Origine 0.5. Renvoie le NineSlice (chaînable .setScrollFactor/.setDepth). */
export function woodPanel(scene, x, y, w, h, key = 'ui_panel') {
  return scene.add.nineslice(x, y, key, undefined, w, h, 6, 6, 6, 6)
}

/**
 * Bouton bois nine-slice + label, avec états survol/pressé + callback.
 * opts : { scrollFactor, depth, font, fontSize, color }
 * Renvoie { bg, label, zone, parts:[...] } — `parts` pour tout détruire/empiler.
 */
export function woodButton(scene, x, y, w, h, text, onClick, opts = {}) {
  const bg = scene.add.nineslice(x, y, 'btn_normal', undefined, w, h, 4, 4, 2, 3)
  const label = scene.add.text(x, y - 1, text, {
    fontFamily: opts.font || 'Georgia, serif', fontSize: (opts.fontSize || 16) + 'px', fontStyle: 'bold',
    color: opts.color || '#3a1d12', stroke: '#ffe9c0', strokeThickness: 2,
  }).setOrigin(0.5)
  const zone = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true })
  if (opts.depth != null) { bg.setDepth(opts.depth); label.setDepth(opts.depth + 1); zone.setDepth(opts.depth + 2) }
  if (opts.scrollFactor != null) { bg.setScrollFactor(opts.scrollFactor); label.setScrollFactor(opts.scrollFactor); zone.setScrollFactor(opts.scrollFactor) }
  let down = false
  zone.on('pointerover', () => { if (!down) bg.setTexture('btn_hover') })
  zone.on('pointerout', () => { down = false; bg.setTexture('btn_normal'); label.y = y - 1 })
  zone.on('pointerdown', () => { down = true; bg.setTexture('btn_pressed'); label.y = y + 1 })
  zone.on('pointerup', () => { down = false; bg.setTexture('btn_hover'); label.y = y - 1; onClick && onClick() })
  return { bg, label, zone, parts: [bg, label, zone] }
}
