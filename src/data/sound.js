import Phaser from 'phaser'

// Gestion centralisée du son (musique + bruitages). Singleton importé par les scènes.
// - musique de fond unique en boucle, avec fondu enchaîné entre zones / combat de boss ;
// - bruitages "fire and forget" via game.sound.play (pools + léger detune anti-répétition) ;
// - réglages (muet + volumes musique/effets) persistés en localStorage ;
// - gère le verrouillage autoplay du navigateur (relance la musique au déverrouillage).

const LS_KEY = 'mmorpg_audio_v1'
const DEFAULTS = { muted: false, music: 0.45, sfx: 0.7 }

// Pools de bruitages : on tire au hasard dans la liste + un léger detune -> moins répétitif.
export const SFX = {
  slash: ['sfx_slash', 'sfx_slash2', 'sfx_sword'], // coup d'arme de mêlée
  whoosh: ['sfx_whoosh'], // souffle (charge / esquive)
  hit: ['sfx_hit1', 'sfx_hit2'], // impact d'un coup qui porte
  hurt: ['sfx_impact'], // le héros encaisse
  launch: ['sfx_launch'], // tir d'un projectile
  magic: ['sfx_magic1', 'sfx_magic2'], // sort générique
  meteor: ['sfx_magic5'], // gros sort (Météore)
  shield: ['sfx_fx'], // bouclier (Tank)
  heal: ['sfx_heal'], // soin (Soigneur)
  spirit: ['sfx_spirit'], // halo / esprit
  step: ['sfx_step1', 'sfx_step2'], // pas (alternés pendant la marche)
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

class AudioManager {
  constructor() {
    this.game = null
    this.settings = { ...DEFAULTS }
    this.curKey = null // clé de la musique VOULUE (peut différer de l'instance si verrouillé)
    this.curMusic = null // instance Phaser.Sound en cours
    this.ambients = {} // calques d'ambiance en boucle, indexés par clé (ex. vent + vagues). { key: { sound, level } }
    this._load()
  }

  _load() {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) Object.assign(this.settings, JSON.parse(raw))
    } catch (e) {
      /* localStorage indisponible -> valeurs par défaut */
    }
  }

  _save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.settings))
    } catch (e) {
      /* ignore */
    }
  }

  /** À appeler une fois le jeu prêt (BootScene.create). */
  init(game) {
    this.game = game
    game.sound.mute = this.settings.muted
    // autoplay verrouillé (navigateur) : relancer la musique voulue dès le déverrouillage (1er clic)
    if (game.sound.locked) {
      game.sound.once('unlocked', () => {
        if (this.curKey) this._startMusic(this.curKey)
      })
    }
  }

  // --- réglages ---
  setMuted(b) {
    this.settings.muted = !!b
    if (this.game) this.game.sound.mute = this.settings.muted
    this._save()
  }

  toggleMute() {
    this.setMuted(!this.settings.muted)
    return this.settings.muted
  }

  setMusicVol(v) {
    this.settings.music = clamp01(v)
    if (this.curMusic) this.curMusic.setVolume(this.settings.music)
    this._save()
  }

  setSfxVol(v) {
    this.settings.sfx = clamp01(v)
    for (const k in this.ambients) {
      const a = this.ambients[k]
      if (a.sound) a.sound.setVolume(a.level * this.settings.sfx) // les ambiances suivent le volume Effets
    }
    this._save()
  }

  // --- ambiances (calques en boucle par-dessus la musique, plusieurs simultanés possibles) ---
  /** Démarre/maintient un son d'ambiance en boucle pour la clé donnée (idempotent). Volume via setAmbientLevel. */
  startAmbient(key) {
    if (!this.game || !key) return
    const a = this.ambients[key]
    if (a && a.sound && a.sound.isPlaying) return
    if (!this.game.cache.audio.exists(key)) return
    const sound = this.game.sound.add(key, { loop: true, volume: 0 })
    sound.play()
    const level = a?.level ?? 0
    this.ambients[key] = { sound, level }
    sound.setVolume(level * this.settings.sfx)
  }

  /** Intensité d'une ambiance (0..1) ; le volume réel est mis à l'échelle par le volume Effets. */
  setAmbientLevel(key, level) {
    const lv = clamp01(level)
    const a = this.ambients[key]
    if (!a) {
      this.ambients[key] = { sound: null, level: lv } // mémorise même si pas encore démarré
      return
    }
    a.level = lv
    if (a.sound) a.sound.setVolume(lv * this.settings.sfx)
  }

  /** Coupe une ambiance précise (clé) ou TOUTES si aucune clé. */
  stopAmbient(key) {
    if (key) {
      const a = this.ambients[key]
      if (a && a.sound) a.sound.destroy()
      delete this.ambients[key]
      return
    }
    for (const k in this.ambients) if (this.ambients[k].sound) this.ambients[k].sound.destroy()
    this.ambients = {}
  }

  // --- bruitages ---
  /** Joue un bruitage. `keys` = clé unique OU pool (tableau, ex. SFX.slash). */
  sfx(keys, opts = {}) {
    if (!this.game) return
    const list = Array.isArray(keys) ? keys : [keys]
    const key = list[(Math.random() * list.length) | 0]
    if (!this.game.cache.audio.exists(key)) return
    const detune = opts.detune ?? Phaser.Math.Between(-120, 120)
    this.game.sound.play(key, { volume: (opts.vol ?? 1) * this.settings.sfx, detune, rate: opts.rate ?? 1 })
  }

  // --- musique ---
  /** Musique de fond en boucle, avec fondu enchaîné. `scene` sert aux tweens du fondu. */
  playMusic(scene, key) {
    if (!this.game || !key) return
    if (this.curKey === key && this.curMusic && this.curMusic.isPlaying) return
    this.curKey = key
    // autoplay verrouillé : on ne crée RIEN maintenant (sinon double instance + "redémarrage" au
    // 1er clic). On mémorise juste la clé ; le handler 'unlocked' (init) lancera la musique une fois.
    if (this.game.sound.locked) return
    this._startMusic(key, scene)
  }

  _startMusic(key, scene) {
    if (!this.game || !this.game.cache.audio.exists(key)) return
    const old = this.curMusic
    const next = this.game.sound.add(key, { loop: true, volume: 0 })
    next.play()
    this.curMusic = next
    const target = this.settings.music
    if (scene && scene.tweens) {
      scene.tweens.add({ targets: next, volume: target, duration: 700 })
      if (old) scene.tweens.add({ targets: old, volume: 0, duration: 600, onComplete: () => old.destroy() })
    } else {
      next.setVolume(target)
      if (old) old.destroy()
    }
  }

  stopMusic(scene) {
    this.curKey = null
    const old = this.curMusic
    this.curMusic = null
    if (!old) return
    if (scene && scene.tweens) scene.tweens.add({ targets: old, volume: 0, duration: 400, onComplete: () => old.destroy() })
    else old.destroy()
  }
}

export const Audio = new AudioManager()
