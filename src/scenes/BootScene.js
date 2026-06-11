import Phaser from 'phaser'
import { HEROES } from '../data/classes.js'
import { Audio } from '../data/sound.js'

// monstres (sprites mon_<nom>.png, grille 4x4) — chargement + animations directionnelles
const MONSTER_SPRITES = ['mushroom', 'lizard', 'racoon', 'snake', 'spider', 'bear', 'owl', 'skull', 'spirit', 'flam', 'trex', 'bluebat']

// PNJ (sprites 4×7, par colonne = direction) : villageois du bourg (statiques) + civils baladeurs de
// la prairie (apparences distinctes, ni villageois ni perso de classe). Tout est chargé + animé pareil.
const NPC_SPRITES = [
  'npc_villager', 'npc_woman', 'npc_boy', // villageois du bourg (Aldric / Mira / Tom)
  'npc_noble', 'npc_princess', 'npc_oldman', 'npc_oldman2', 'npc_monk', 'npc_monk2', 'npc_hunter',
  'npc_inspector', 'npc_master', 'npc_shaman', 'npc_mangreen', 'npc_eskimo', 'npc_fighterwhite', 'npc_fighterred',
]

// audio : clés des fichiers (musiques .ogg + bruitages .wav) à précharger
const MUSIC_KEYS = ['mus_snow', 'mus_desert', 'mus_cursed', 'mus_boss1', 'mus_boss2', 'mus_boss3', 'mus_shop']
// musiques importées en .mp3 (menu + village + forêt jour/nuit + maudit nuit + victoire + boss de raid)
const MUSIC_KEYS_MP3 = ['mus_menu', 'mus_village', 'mus_forest', 'mus_forest_night', 'mus_cursed_night', 'mus_victory', 'mus_boss_raid', 'mus_apothecary', 'mus_tavern']
const SFX_KEYS = [
  'sfx_slash', 'sfx_slash2', 'sfx_sword', 'sfx_whoosh', 'sfx_launch',
  'sfx_hit1', 'sfx_hit2', 'sfx_impact', 'sfx_magic1', 'sfx_magic2',
  'sfx_magic5', 'sfx_fx', 'sfx_spirit', 'sfx_heal',
  'sfx_levelup', 'sfx_gameover', // jingles (montée de niveau / défaite)
  'amb_wind', 'amb_waves', // ambiance côtière (vent + vagues, montent près de la mer)
  'ui_accept', 'ui_move', 'ui_cancel', 'ui_coin', // sons d'interface (menus, panneaux, transactions)
  'sfx_step1', 'sfx_step2', // pas sur l'herbe (alternés pendant la marche)
  'sfx_gold', 'sfx_pickup', 'sfx_loot', // ramassage de butin (or / gemme-cœur / équipement)
  'sfx_roar', // rugissement de boss (cri descendu en hauteur au verrouillage de l'arène)
  'sfx_el_fire', 'sfx_el_fireball', 'sfx_el_explosion', // sorts élémentaires de FEU (incantation / projectile / impact)
  'sfx_strange', // magie d'OMBRE (Mage de l'ombre, violet)
]

/**
 * BootScene — précharge les assets puis crée les animations du héros.
 * Assets : pack "Ninja Adventure" (CC0). Héros = NinjaGreen, spritesheet 16x16
 * (3 frames par direction, 4 directions).
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  preload() {
    const { width, height } = this.scale
    const txt = this.add
      .text(width / 2, height / 2, 'Chargement...', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    this.load.on('complete', () => txt.destroy())

    // sol "prairie" (tileset image, découpé en tuiles 16x16 par la tilemap)
    this.load.image('field', 'assets/tiles/field.png')
    // pont en bois (Sprout Lands) -> remplace les ponts/gués générés
    this.load.image('bridge_wood', 'assets/tiles/bridge_wood.png') // 80x48 = 5x3 tuiles
    // eau ANIMÉE (Sprout Lands, 4 frames de 16px) -> océan/rivières/lacs qui ondulent
    this.load.image('water_sprout', 'assets/tiles/water_sprout.png')
    // eau ANIMÉE (Sprout Lands, 4 frames de 16px) -> océan/rivières/lacs qui ondulent
    // herbe douce (Sprout Lands) -> sol PRAIRIE/village (clair) ET forêt (réutilisé, teinté vert sombre)
    this.load.image('grass_sprout', 'assets/tiles/grass_sprout.png')
    // objets Mystic Woods (16 col) : ARBRES de forêt (chêne), libres dans la version free
    this.load.spritesheet('mystic_obj', 'assets/tiles/mystic_obj.png', { frameWidth: 16, frameHeight: 16 })

    // déco ANIMÉE (Ninja Adventure) : bannières du village (mât compris, 4 frames de 16px, ondulent)
    this.load.spritesheet('flag_blue', 'assets/deco/flag_blue.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('flag_red', 'assets/deco/flag_red.png', { frameWidth: 16, frameHeight: 16 })
    // moulin à eau (Ninja Adventure, maison-moulin ronde, 3 frames de 34x36) -> berge d'une rivière
    this.load.spritesheet('watermill', 'assets/deco/watermill.png', { frameWidth: 34, frameHeight: 36 })
    this.load.spritesheet('fire_anim', 'assets/deco/fire_anim.png', { frameWidth: 32, frameHeight: 32 }) // flamme animée (feu de camp central, 30 frames)
    this.load.image('boat', 'assets/deco/boat.png') // barque (80×32, vue de côté) — monture d'eau achetée au marchand (A3)
    // déco DÉSERT (Ninja TilesetDesert/Nature, extraites au pixel) : palmier nain + rochers de grès
    this.load.image('palm_desert', 'assets/deco/palm_desert.png') // 14×18 — petit palmier
    this.load.image('desert_rock1', 'assets/deco/desert_rock1.png') // 38×29 — rocher de grès moyen
    this.load.image('desert_rock2', 'assets/deco/desert_rock2.png') // 47×34 — gros rocher de grès
    // sables mouvants animés (Ninja, 8 frames de 32×32) — piège qui aspire dans le désert
    this.load.spritesheet('quicksand', 'assets/deco/quicksand.png', { frameWidth: 32, frameHeight: 32 })
    // flocons de neige (Ninja, 7 frames de 8×8) — particules de chute de neige dans le biome neige
    this.load.spritesheet('snow', 'assets/deco/snow.png', { frameWidth: 8, frameHeight: 8 })
    // PARTICULES MÉTÉO (Ninja CC0) : pluie / éclaboussure / neige / feuille / herbe (traînée au pas)
    this.load.spritesheet('wx_rain', 'assets/fx/p_rain.png', { frameWidth: 8, frameHeight: 8 })
    this.load.spritesheet('wx_rainfloor', 'assets/fx/p_rainfloor.png', { frameWidth: 8, frameHeight: 8 })
    this.load.spritesheet('wx_snow', 'assets/fx/p_snow.png', { frameWidth: 8, frameHeight: 8 })
    this.load.spritesheet('wx_leaf', 'assets/fx/p_leaf.png', { frameWidth: 8, frameHeight: 7 })
    this.load.spritesheet('wx_grass', 'assets/fx/p_grass.png', { frameWidth: 12, frameHeight: 13 })
    this.load.image('moneybag', 'assets/items/moneybag.png') // sac de mort (14×15) déposé à l'endroit de la mort (A1)
    // VILLAGE ABANDONNÉ (Ninja TilesetVillageAbandoned, CC0) : structures extraites en PNG autonomes (cf. scripts/extract_props.cjs)
    // -> hameau en ruine de la forêt + 2 entrées de grotte (donjons instanciés)
    for (const k of ['cave_green', 'cave_orange', 'house_win', 'house_door', 'tower', 'cabin', 'manor', 'house_big', 'idol', 'stones', 'tree_a', 'tree_b', 'stump', 'log_v', 'bush', 'fence', 'logs'])
      this.load.image('ab_' + k, `assets/deco/aband/${k}.png`)
    // coffre au trésor (Ninja, 32×16 = 2 frames : 0=fermé, 1=ouvert) -> butin des donjons
    this.load.spritesheet('chest', 'assets/deco/chest.png', { frameWidth: 16, frameHeight: 16 })
    // props de donjon (Ninja TilesetDungeon, 12×4 frames 16px) : barils/crânes/gemmes/torches pour la déco de grotte
    this.load.spritesheet('dungeon_props', 'assets/deco/dungeon_props.png', { frameWidth: 16, frameHeight: 16 })

    // nature (arbres, rochers...) en spritesheet 16x16 pour placer des tuiles
    this.load.spritesheet('nature', 'assets/tiles/nature.png', {
      frameWidth: 16,
      frameHeight: 16,
    })

    // INTÉRIEURS (Mystic Woods) : sol en bois (1 tuile répétable), murs de pierre (nine-slice 8x8), porte, tapis
    this.load.image('mw_floor', 'assets/tiles/mw_floor.png')
    this.load.spritesheet('mw_walls', 'assets/tiles/mw_walls.png', { frameWidth: 16, frameHeight: 16 })
    this.load.image('mw_door', 'assets/tiles/mw_door.png')
    this.load.spritesheet('mw_carpet', 'assets/tiles/mw_carpet.png', { frameWidth: 16, frameHeight: 16 })
    // INTÉRIEURS riches (Penzilla Top-Down Retro Interior) : sols/murs + mobilier + portes/fenêtres + petits objets (16x16)
    this.load.spritesheet('penz_floors', 'assets/tiles/penz_floors.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('penz_furn', 'assets/tiles/penz_furn.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('penz_doors', 'assets/tiles/penz_doors.png', { frameWidth: 16, frameHeight: 16 })
    this.load.spritesheet('penz_items', 'assets/tiles/penz_items.png', { frameWidth: 16, frameHeight: 16 })
    for (const c of ['tan', 'green', 'red', 'blue']) this.load.image('nin_bed_' + c, `assets/tiles/nin_bed_${c}.png`) // lits Ninja (32x48) pour l'auberge
    this.load.spritesheet('spr_door', 'assets/tiles/spr_door.png', { frameWidth: 16, frameHeight: 16 }) // porte Sprout animée (4 frames : f1=fermée, f3=battant, f0/f2=ouverte)
    // UI « Theme Wood » (Ninja, CC0) : panneaux + boutons nine-slice (vraies textures)
    for (const k of ['ui_panel', 'ui_bg', 'btn_normal', 'btn_hover', 'btn_pressed', 'ui_cell', 'ui_tab', 'btn_yes', 'btn_no']) this.load.image(k, `assets/ui/${k}.png`)
    // bâtiments (maisons, igloos, portails...) : spritesheet 16x16, 33 colonnes
    this.load.spritesheet('house', 'assets/tiles/house.png', { frameWidth: 16, frameHeight: 16 })
    // chemin en planches du village (Sprout Paths, 4x4) : planche horizontale (frame 4) / verticale (frame 14)
    this.load.spritesheet('plankpath', 'assets/tiles/plankpath.png', { frameWidth: 16, frameHeight: 16 })

    // héros : spritesheet 16x16 (NinjaGreen historique = 'player')
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: 16,
      frameHeight: 16,
    })
    // apparences jouables (choix du personnage) : spritesheets 16x16 (4×7)
    for (const h of HEROES) {
      this.load.spritesheet(h.key, `assets/sprites/${h.key}.png`, { frameWidth: 16, frameHeight: 16 })
      this.load.image('face_' + h.key, `assets/faces/${h.key}.png`) // portrait (38×38) pour la création de perso
    }

    // monstres : spritesheets 16x16 (4x4)
    for (const m of MONSTER_SPRITES) {
      this.load.spritesheet('mon_' + m, `assets/sprites/mon_${m}.png`, {
        frameWidth: 16,
        frameHeight: 16,
      })
    }

    // BOSS DE RAID (vrais sprites dédiés du pack, mono-orientation = face caméra, flipX pour gauche/droite).
    // Chaque anim a sa propre feuille car les frames diffèrent en taille (idle/hit vs walk).
    // TenguBlue (Forêt) : idle/hit 68x68, walk 82x82.
    this.load.spritesheet('boss_tengublue_idle', 'assets/boss/tengublue_idle.png', { frameWidth: 68, frameHeight: 68 })
    this.load.spritesheet('boss_tengublue_walk', 'assets/boss/tengublue_walk.png', { frameWidth: 82, frameHeight: 82 })
    this.load.spritesheet('boss_tengublue_hit', 'assets/boss/tengublue_hit.png', { frameWidth: 68, frameHeight: 68 })
    this.load.spritesheet('boss_tengublue_attack', 'assets/boss/tengublue_attack.png', { frameWidth: 82, frameHeight: 82 }) // 15 frames (déluge)
    this.load.spritesheet('boss_tengublue_trans', 'assets/boss/tengublue_trans.png', { frameWidth: 68, frameHeight: 68 }) // 11 frames (transfo)
    // GiantBlueSamurai (Forêt) : figure large et trapue -> frames 96x48 (idle/walk 6 frames, hit 4).
    this.load.spritesheet('boss_samurai_idle', 'assets/boss/samurai_idle.png', { frameWidth: 96, frameHeight: 48 })
    this.load.spritesheet('boss_samurai_walk', 'assets/boss/samurai_walk.png', { frameWidth: 96, frameHeight: 48 })
    this.load.spritesheet('boss_samurai_hit', 'assets/boss/samurai_hit.png', { frameWidth: 96, frameHeight: 48 })
    this.load.spritesheet('boss_samurai_charge', 'assets/boss/samurai_charge.png', { frameWidth: 96, frameHeight: 96 }) // charge telegraphiee (96x96)
    // boss solo désert : Cyclope démon (frames 50×50 : Idle 5, Walk 6, Hit 3)
    this.load.spritesheet('boss_democyclop_idle', 'assets/boss/democyclop_idle.png', { frameWidth: 50, frameHeight: 50 })
    this.load.spritesheet('boss_democyclop_walk', 'assets/boss/democyclop_walk.png', { frameWidth: 50, frameHeight: 50 })
    this.load.spritesheet('boss_democyclop_hit', 'assets/boss/democyclop_hit.png', { frameWidth: 50, frameHeight: 50 })
    // boss maudit : Seigneur de flamme (frames 50×50 : Idle 5, Hit 3 — PAS de walk)
    this.load.spritesheet('boss_giantflam_idle', 'assets/boss/giantflam_idle.png', { frameWidth: 50, frameHeight: 50 })
    this.load.spritesheet('boss_giantflam_hit', 'assets/boss/giantflam_hit.png', { frameWidth: 50, frameHeight: 50 })
    // lot 1 (2e boss/zone) — frames mesurés par analyse de colonnes alpha
    this.load.spritesheet('boss_democyclop2_idle', 'assets/boss/democyclop2_idle.png', { frameWidth: 50, frameHeight: 50 })
    this.load.spritesheet('boss_democyclop2_walk', 'assets/boss/democyclop2_walk.png', { frameWidth: 50, frameHeight: 50 })
    this.load.spritesheet('boss_democyclop2_hit', 'assets/boss/democyclop2_hit.png', { frameWidth: 50, frameHeight: 50 })
    this.load.spritesheet('boss_giantbamboo_idle', 'assets/boss/giantbamboo_idle.png', { frameWidth: 62, frameHeight: 62 })
    this.load.spritesheet('boss_giantbamboo_walk', 'assets/boss/giantbamboo_walk.png', { frameWidth: 62, frameHeight: 62 })
    this.load.spritesheet('boss_giantbamboo_hit', 'assets/boss/giantbamboo_hit.png', { frameWidth: 62, frameHeight: 62 })
    this.load.spritesheet('boss_giantslime_idle', 'assets/boss/giantslime_idle.png', { frameWidth: 62, frameHeight: 52 })
    this.load.spritesheet('boss_giantslime_hit', 'assets/boss/giantslime_hit.png', { frameWidth: 62, frameHeight: 52 })
    this.load.spritesheet('boss_giantspirit_idle', 'assets/boss/giantspirit_idle.png', { frameWidth: 50, frameHeight: 50 })
    this.load.spritesheet('boss_giantspirit_hit', 'assets/boss/giantspirit_hit.png', { frameWidth: 50, frameHeight: 50 })
    // lot 2 (3e boss/zone : variantes)
    this.load.spritesheet('boss_redsamurai_idle', 'assets/boss/redsamurai_idle.png', { frameWidth: 96, frameHeight: 48 })
    this.load.spritesheet('boss_redsamurai_walk', 'assets/boss/redsamurai_walk.png', { frameWidth: 96, frameHeight: 48 })
    this.load.spritesheet('boss_redsamurai_hit', 'assets/boss/redsamurai_hit.png', { frameWidth: 96, frameHeight: 48 })
    this.load.spritesheet('boss_redsamurai_charge', 'assets/boss/redsamurai_charge.png', { frameWidth: 96, frameHeight: 96 })
    this.load.spritesheet('boss_tengured_idle', 'assets/boss/tengured_idle.png', { frameWidth: 82, frameHeight: 82 })
    this.load.spritesheet('boss_tengured_walk', 'assets/boss/tengured_walk.png', { frameWidth: 82, frameHeight: 82 })
    this.load.spritesheet('boss_tengured_hit', 'assets/boss/tengured_hit.png', { frameWidth: 82, frameHeight: 82 })
    this.load.spritesheet('boss_tengured_attack', 'assets/boss/tengured_attack.png', { frameWidth: 82, frameHeight: 82 }) // 15 frames (déluge)
    this.load.spritesheet('boss_tengured_trans', 'assets/boss/tengured_trans.png', { frameWidth: 82, frameHeight: 82 }) // 11 frames (transfo 50% PV)
    this.load.spritesheet('boss_giantslime2_idle', 'assets/boss/giantslime2_idle.png', { frameWidth: 62, frameHeight: 52 })
    this.load.spritesheet('boss_giantslime2_hit', 'assets/boss/giantslime2_hit.png', { frameWidth: 62, frameHeight: 52 })
    // boss côtier À DISTANCE : Kraken (SquidRed) — anim "shoot" = télégraphe avant chaque projectile
    this.load.spritesheet('boss_squidred_idle', 'assets/boss/squidred_idle.png', { frameWidth: 76, frameHeight: 79 })
    this.load.spritesheet('boss_squidred_walk', 'assets/boss/squidred_walk.png', { frameWidth: 76, frameHeight: 79 })
    this.load.spritesheet('boss_squidred_hit', 'assets/boss/squidred_hit.png', { frameWidth: 76, frameHeight: 79 })
    this.load.spritesheet('boss_squidred_shoot', 'assets/boss/squidred_shoot.png', { frameWidth: 76, frameHeight: 79 })
    // variantes solo (forêt) : Grenouille (idle+hit), Raton (idle only), Bambou ancien (idle+walk+hit)
    this.load.spritesheet('boss_giantfrog_idle', 'assets/boss/giantfrog_idle.png', { frameWidth: 40, frameHeight: 40 })
    this.load.spritesheet('boss_giantfrog_hit', 'assets/boss/giantfrog_hit.png', { frameWidth: 40, frameHeight: 40 })
    this.load.spritesheet('boss_giantfrog_charge', 'assets/boss/giantfrog_charge.png', { frameWidth: 40, frameHeight: 40 })
    this.load.spritesheet('boss_giantracoon_idle', 'assets/boss/giantracoon_idle.png', { frameWidth: 60, frameHeight: 60 })
    this.load.spritesheet('boss_giantracoon_charge', 'assets/boss/giantracoon_charge.png', { frameWidth: 60, frameHeight: 60 })
    this.load.spritesheet('boss_giantbamboo2_idle', 'assets/boss/giantbamboo2_idle.png', { frameWidth: 62, frameHeight: 62 })
    this.load.spritesheet('boss_giantbamboo2_walk', 'assets/boss/giantbamboo2_walk.png', { frameWidth: 62, frameHeight: 62 })
    this.load.spritesheet('boss_giantbamboo2_hit', 'assets/boss/giantbamboo2_hit.png', { frameWidth: 62, frameHeight: 62 })
    // boss RAID île maudite : Dragon BLEU SEGMENTÉ (images uniques assemblées en chaîne par le code)
    this.load.image('boss_dragon_head', 'assets/boss/dragon_head.png')
    this.load.image('boss_dragon_body1', 'assets/boss/dragon_body1.png')
    this.load.image('boss_dragon_body2', 'assets/boss/dragon_body2.png')
    this.load.image('boss_dragon_bodyend', 'assets/boss/dragon_bodyend.png')
    this.load.image('boss_dragon_wing', 'assets/boss/dragon_wing.png')

    // logo du menu (titre "NINJA ADVENTURE" extrait de la cover du pack)
    this.load.image('title_logo', 'assets/ui/title.png')
    this.load.image('dialogbox', 'assets/ui/dialogbox.png') // boîte de dialogue Ninja (300×58 : portrait à gauche + crème)
    this.load.image('arrow_next', 'assets/ui/arrow_next.png') // flèche « suivant » (13×13)
    // FICHE PERSO WoW (Ninja UI, CC0) : cadre 9-slice sombre + case d'emplacement + silhouettes de slot vide
    this.load.image('slot_weapon', 'assets/ui/slot_weapon.png') // silhouettes grisées de slot vide (24×24)
    this.load.image('slot_armor', 'assets/ui/slot_armor.png')
    this.load.image('slot_relic', 'assets/ui/slot_relic.png')
    this.load.image('slot_ring', 'assets/ui/slot_ring.png')
    this.load.image('stat_def', 'assets/ui/stat_def.png') // icône bouclier (stat Défense)

    // marchand : spritesheet 16x16 (on n'utilise que la frame 0 = face) + portrait
    this.load.spritesheet('npc_merchant', 'assets/sprites/npc_merchant.png', { frameWidth: 16, frameHeight: 16 })
    this.load.image('merchant_face', 'assets/items/merchant_face.png')

    // PNJ (villageois + civils baladeurs) : spritesheets 16x16 (4×7) + FACESET (portrait 38×38, dialogues)
    for (const n of NPC_SPRITES) {
      this.load.spritesheet(n, `assets/sprites/${n}.png`, { frameWidth: 16, frameHeight: 16 })
      this.load.image('face_' + n, `assets/faces/face_${n}.png`)
    }

    // sprites d'objets ramassables (pack Ninja Adventure)
    // la pièce est une spritesheet 10x10 (4 frames = rotation), cœur/gemme sont statiques
    this.load.spritesheet('drop_gold', 'assets/items/gold.png', { frameWidth: 10, frameHeight: 10 })
    this.load.image('drop_heart', 'assets/items/heart.png')
    this.load.image('drop_gem', 'assets/items/gem.png')

    // icônes d'équipement + consommables — pack Ninja Adventure (armures, parchemins=focus, gemmes=anneaux, potions)
    for (const key of [
      'eq_armor', 'eq_amulet', 'eq_ring', 'eq_helmet',
      'eq_leather', 'eq_mail', 'eq_plate', 'eq_dragon', // armures distinctes (Kyrise armor_01 a/b/c/e)
      'eq_ring_band', 'eq_ring_emerald', 'eq_ring_topaz', 'eq_ring_sapphire', 'eq_ring_ruby', // anneaux Kyrise (gemmes serties)
      'rel_frost', 'rel_thunder', 'rel_flame', 'rel_cosmic', // reliques = cristaux de pouvoir Kyrise (givre/foudre/flammes/cosmique)
      'rel_emerald', // ancienne relique de panoplie partagée (gardée : vieilles saves avant refreshItemDef)
      // icônes DÉDIÉES des pièces de PANOPLIE (Kyrise) : armure/relique/anneau distincts par classe
      'set_armor_war', 'set_armor_tank', 'set_armor_mage', 'set_armor_heal', // cuirasse rouge / granit argent / robe bleue / robe dorée
      'set_relic_war', 'set_relic_tank', 'set_relic_mage', 'set_relic_heal', // écu à croix / orbe de pierre / tome runique / collier d'or
      'set_ring_war', 'set_ring_tank', 'set_ring_mage', 'set_ring_heal', // or+rubis / terre+gemme verte / argent+bleu / or+gemme dorée
      'foc_scroll', 'foc_ice', 'foc_plant', 'foc_thunder', 'foc_fire', // Focus = parchemins élémentaires
      'ring_green', 'ring_yellow', 'ring_purple', 'ring_red', // Anneaux = gemmes colorées
      'pot_heal', 'pot_heal_big', 'pot_mana', 'pot_mana_big', 'pot_fire', 'pot_frost', // potions (soin / mana / température)
      'pot_regen', 'pot_antidote', 'pot_grand', 'pot_ward', // élixirs d'apothicaire (paliers 3-4) : régén / antidote / grand élixir / garde
      'food_rice', 'food_skewer', 'food_fish', 'food_stew', 'food_mead', // REPAS de taverne (Ninja Items/Food : Onigiri/Yakitori/Fish/Meat/Honey)
      'food_roast', 'food_tea', 'food_feast', 'icon_locked', // repas-bonus taverne (paliers 3-4) + icône « verrouillé » (palier non débloqué)
      'mat_leather', 'mat_bone', 'mat_essence', 'mat_crystal', // matériaux empilables (Os = vraie icône Kyrise ; Lingot = ingot Kyrise)
    ]) {
      this.load.image(key, `assets/items/${key}.png`)
    }
    // sprites d'ARMES (Items/Weapons) : servent d'icône d'inventaire ET de sprite qui swingue à l'attaque
    for (const key of ['wpn_sword', 'wpn_sword2', 'wpn_katana', 'wpn_rapier', 'wpn_dagger', 'wpn_ninjaku', 'wpn_club', 'wpn_hammer', 'wpn_axe', 'wpn_lance2', 'wpn_bigsword', 'wpn_wand', 'wpn_book', 'wpn_stick', 'wpn_bone',
      'wpn_legend_sword', 'wpn_legend_mace', 'wpn_legend_scepter', 'wpn_legend_staff', // 4 légendaires spectaculaires (Admurin's Armory)
      'aw_dagger', 'aw_sword', 'aw_katana', 'aw_sabre', 'aw_kris', 'aw_rapier', // armes Guerrier (icônes Admurin ; swing via swingTex Ninja)
      'at_club', 'at_warhammer', 'at_axe', 'at_warlance', 'at_greatblade', // armes Tank (Admurin)
      'am_wand', 'am_grimoire', 'am_archstaff', // armes Mage (am_grimoire = grimoire Kyrise)
      'ah_healstick', 'ah_healwand', 'ah_relic', // armes Soigneur (Admurin)
      'set_sword', 'set_glaive', 'set_scepter', 'set_staff_heal']) { // armes de PANOPLIE (ligne émeraude Admurin + bâton sacré Kyrise pour la Soigneuse)
      this.load.image(key, `assets/weapons/${key}.png`)
    }

    // FX animés (effets de sorts, dossier FX du pack)
    this.load.spritesheet('fx_explosion', 'assets/fx/explosion.png', { frameWidth: 40, frameHeight: 40 }) // 9 frames (feu)
    this.load.spritesheet('fx_spirit', 'assets/fx/spirit.png', { frameWidth: 32, frameHeight: 32 }) // 5 frames (blanc, teintable)
    this.load.spritesheet('fx_shield', 'assets/fx/shield.png', { frameWidth: 24, frameHeight: 26 }) // 6 frames (bouclier Tank)
    this.load.spritesheet('fx_aura', 'assets/fx/aura.png', { frameWidth: 25, frameHeight: 24 }) // 5 frames (soin, teinté vert)
    this.load.spritesheet('fx_circslash', 'assets/fx/circslash.png', { frameWidth: 32, frameHeight: 32 }) // 4 frames (Charge + masses)
    this.load.spritesheet('fx_slash', 'assets/fx/slash.png', { frameWidth: 32, frameHeight: 32 }) // 4 frames (tranche lames)
    this.load.spritesheet('fx_energyball', 'assets/fx/energyball.png', { frameWidth: 16, frameHeight: 16 }) // 4 frames (projectile, teintable)
    this.load.spritesheet('fx_fireball', 'assets/fx/fireball.png', { frameWidth: 16, frameHeight: 16 }) // 4 frames (projectile feu)
    this.load.spritesheet('fx_shuriken', 'assets/fx/shuriken.png', { frameWidth: 16, frameHeight: 16 }) // 2 frames (shuriken qui tourne)
    this.load.image('fx_kunai', 'assets/fx/kunai.png') // dague de lancer (statique, pointe dans la direction)
    // particules d'AMBIANCE (température + pas) — spritesheets Ninja/Mystic
    this.load.spritesheet('fx_snow', 'assets/fx/snow.png', { frameWidth: 8, frameHeight: 8 }) // 7 flocons (froid)
    this.load.spritesheet('fx_ice_spike', 'assets/fx/ice_spike.png', { frameWidth: 32, frameHeight: 32 }) // 9 frames (pics de glace qui jaillissent — Blizzard)
    this.load.spritesheet('fx_ice_burst', 'assets/fx/ice_burst.png', { frameWidth: 32, frameHeight: 32 }) // 10 frames (éclats de glace)
    this.load.spritesheet('fx_magic_circle', 'assets/fx/magic_circle.png', { frameWidth: 32, frameHeight: 32 }) // 4 frames (cercle d'incantation au sol, teintable)
    this.load.spritesheet('fx_rock_spike', 'assets/fx/rock_spike.png', { frameWidth: 54, frameHeight: 48 }) // 10 frames (pic de roche — Onde de choc Tank)
    this.load.spritesheet('fx_spark', 'assets/fx/spark.png', { frameWidth: 30, frameHeight: 35 }) // 9 frames (étincelles — Cri intimidant Guerrier, teintable)
    this.load.image('fog_clouds', 'assets/fx/fog.png') // 320×180 nuages blancs -> brouillard de guerre (monde + carte/minimap)
    this.load.image('raylight', 'assets/fx/raylight.png') // 216×102 rayons de soleil (god rays, ambiance de JOUR)

    // icônes de la BARRE DE COMPÉTENCES (RPG Ability Icons, CC0) — 1 par sort + attaque (24×24)
    for (const key of ['skill_atk_melee', 'skill_atk_ranged', 'skill_charge', 'skill_whirlwind', 'skill_warcry',
      'skill_shieldcharge', 'skill_provoke', 'skill_shockwave', 'skill_blizzard', 'skill_pyroblast', 'skill_mirror',
      'skill_firestorm', 'skill_frostlance', 'skill_voidstorm', 'skill_shadowbolt', // Mage par élément (feu/glace/ombre)
      'skill_wordshield', 'skill_sanctuary', 'skill_resurrect']) {
      this.load.image(key, `assets/skills/${key}.png`)
    }
    this.load.spritesheet('fx_flam', 'assets/fx/flam.png', { frameWidth: 20, frameHeight: 30 }) // 10 frames (le héros brûle au chaud)
    this.load.spritesheet('fx_dust', 'assets/fx/dust.png', { frameWidth: 12, frameHeight: 12 }) // 4 frames (poussière de pas)
    // FX d'attaques de boss (pack Ninja) — slashs/élémentaires/invocation, teintés par la couleur du boss
    this.load.spritesheet('fx_plant', 'assets/fx/plant.png', { frameWidth: 30, frameHeight: 28 }) // 8 frames (lianes/ronces : cône & flaque forêt)
    this.load.spritesheet('fx_clawdouble', 'assets/fx/clawdouble.png', { frameWidth: 32, frameHeight: 32 }) // 4 frames (double griffe : cône/charge raton)
    this.load.spritesheet('fx_slash_circular', 'assets/fx/slash_circular.png', { frameWidth: 54, frameHeight: 55 }) // 7 frames (tranche circulaire : NOVA)
    this.load.spritesheet('fx_rock', 'assets/fx/rock.png', { frameWidth: 30, frameHeight: 30 }) // 14 frames (débris de roche : slam/cône)
    this.load.spritesheet('fx_water', 'assets/fx/water.png', { frameWidth: 40, frameHeight: 33 }) // 11 frames (gerbe d'eau : slam gelée/squid)
    this.load.spritesheet('fx_circle_orange', 'assets/fx/circle_orange.png', { frameWidth: 32, frameHeight: 32 }) // 4 frames (anneau d'invocation : adds)

    // --- AUDIO (pack Ninja Adventure, CC0) ---
    // musiques de fond (boucle) par zone + combat de boss + menu
    for (const m of MUSIC_KEYS) this.load.audio(m, `assets/audio/music/${m}.ogg`)
    for (const m of MUSIC_KEYS_MP3) this.load.audio(m, `assets/audio/music/${m}.mp3`)
    // bruitages de combat (coups, slash, sorts, projectiles)
    for (const s of SFX_KEYS) this.load.audio(s, `assets/audio/sfx/${s}.wav`)
  }

  create() {
    this.createGeneratedTextures()
    this.createPlayerAnimations()
    this.createMonsterAnimations()
    this.createNpcAnimations()
    this.createItemAnimations()
    this.createFxAnimations()
    Audio.init(this.game) // moteur audio prêt (mute persisté + gestion autoplay verrouillé)
    this.scene.start('MenuScene') // écran d'accueil (puis création de perso -> jeu)
  }

  /** Animations des effets de sorts (FX du pack). */
  createFxAnimations() {
    if (!this.anims.exists('fx-explosion')) {
      this.anims.create({
        key: 'fx-explosion',
        frames: this.anims.generateFrameNumbers('fx_explosion', { start: 0, end: 8 }),
        frameRate: 20,
        repeat: 0,
      })
    }
    if (!this.anims.exists('fx-spirit')) {
      this.anims.create({
        key: 'fx-spirit',
        frames: this.anims.generateFrameNumbers('fx_spirit', { start: 0, end: 4 }),
        frameRate: 16,
        repeat: 0,
      })
    }
    if (!this.anims.exists('fx-shield')) {
      this.anims.create({ key: 'fx-shield', frames: this.anims.generateFrameNumbers('fx_shield', { start: 0, end: 5 }), frameRate: 12, repeat: -1 })
    }
    if (!this.anims.exists('fx-aura')) {
      this.anims.create({ key: 'fx-aura', frames: this.anims.generateFrameNumbers('fx_aura', { start: 0, end: 4 }), frameRate: 16, repeat: 0 })
    }
    if (!this.anims.exists('fx-circslash')) {
      this.anims.create({ key: 'fx-circslash', frames: this.anims.generateFrameNumbers('fx_circslash', { start: 0, end: 3 }), frameRate: 18, repeat: 0 })
    }
    if (!this.anims.exists('fx-slash')) {
      this.anims.create({ key: 'fx-slash', frames: this.anims.generateFrameNumbers('fx_slash', { start: 0, end: 3 }), frameRate: 26, repeat: 0 })
    }
    // MÉTÉO : éclaboussure de pluie (1 fois), feuille qui tournoie (boucle), touffe d'herbe au pas (1 fois), flocon (boucle)
    if (!this.anims.exists('wx-rainfloor')) this.anims.create({ key: 'wx-rainfloor', frames: this.anims.generateFrameNumbers('wx_rainfloor', { start: 0, end: 2 }), frameRate: 14, repeat: 0 })
    if (!this.anims.exists('wx-leaf')) this.anims.create({ key: 'wx-leaf', frames: this.anims.generateFrameNumbers('wx_leaf', { start: 0, end: 8 }), frameRate: 8, repeat: -1 })
    if (!this.anims.exists('wx-grass')) this.anims.create({ key: 'wx-grass', frames: this.anims.generateFrameNumbers('wx_grass', { start: 0, end: 5 }), frameRate: 16, repeat: 0 })
    if (!this.anims.exists('wx-snow')) this.anims.create({ key: 'wx-snow', frames: this.anims.generateFrameNumbers('wx_snow', { start: 0, end: 6 }), frameRate: 8, repeat: -1 })
    // PORTE Sprout : cycle s'ouvre PUIS se referme (fermée 1 -> battant 3 -> ouverte 0 -> battant 3 -> fermée 1)
    if (!this.anims.exists('door-cycle')) this.anims.create({ key: 'door-cycle', frames: this.anims.generateFrameNumbers('spr_door', { frames: [1, 3, 0, 0, 3, 1] }), frameRate: 12, repeat: 0 })
    if (!this.anims.exists('fx-energyball')) {
      this.anims.create({ key: 'fx-energyball', frames: this.anims.generateFrameNumbers('fx_energyball', { start: 0, end: 3 }), frameRate: 14, repeat: -1 })
    }
    if (!this.anims.exists('fx-fireball')) {
      this.anims.create({ key: 'fx-fireball', frames: this.anims.generateFrameNumbers('fx_fireball', { start: 0, end: 3 }), frameRate: 14, repeat: -1 })
    }
    if (!this.anims.exists('fx-shuriken')) {
      this.anims.create({ key: 'fx-shuriken', frames: this.anims.generateFrameNumbers('fx_shuriken', { start: 0, end: 1 }), frameRate: 20, repeat: -1 })
    }
    if (!this.anims.exists('fx-dust')) {
      this.anims.create({ key: 'fx-dust', frames: this.anims.generateFrameNumbers('fx_dust', { start: 0, end: 3 }), frameRate: 14, repeat: 0 }) // poussière de pas (joué 1 fois)
    }
    if (!this.anims.exists('fx-ice-spike')) {
      this.anims.create({ key: 'fx-ice-spike', frames: this.anims.generateFrameNumbers('fx_ice_spike', { start: 0, end: 8 }), frameRate: 16, repeat: 0 }) // pics de glace (Blizzard)
    }
    if (!this.anims.exists('fx-ice-burst')) {
      this.anims.create({ key: 'fx-ice-burst', frames: this.anims.generateFrameNumbers('fx_ice_burst', { start: 0, end: 9 }), frameRate: 18, repeat: 0 }) // éclats de glace
    }
    if (!this.anims.exists('fx-magic-circle')) {
      this.anims.create({ key: 'fx-magic-circle', frames: this.anims.generateFrameNumbers('fx_magic_circle', { start: 0, end: 3 }), frameRate: 10, repeat: -1 }) // cercle d'incantation au sol
    }
    if (!this.anims.exists('fx-rock-spike')) {
      this.anims.create({ key: 'fx-rock-spike', frames: this.anims.generateFrameNumbers('fx_rock_spike', { start: 0, end: 9 }), frameRate: 18, repeat: 0 }) // pic de roche (Onde de choc)
    }
    if (!this.anims.exists('fx-spark')) {
      this.anims.create({ key: 'fx-spark', frames: this.anims.generateFrameNumbers('fx_spark', { start: 0, end: 8 }), frameRate: 18, repeat: 0 }) // étincelles (Cri intimidant)
    }
    if (!this.anims.exists('fx-flam')) {
      this.anims.create({ key: 'fx-flam', frames: this.anims.generateFrameNumbers('fx_flam', { start: 0, end: 9 }), frameRate: 16, repeat: -1 }) // flamme qui boucle (héros qui brûle)
    }
    // FX d'attaques de boss (one-shot, teintables) — pack Ninja
    if (!this.anims.exists('fx-plant')) this.anims.create({ key: 'fx-plant', frames: this.anims.generateFrameNumbers('fx_plant', { start: 0, end: 7 }), frameRate: 22, repeat: 0 }) // lianes/ronces
    if (!this.anims.exists('fx-clawdouble')) this.anims.create({ key: 'fx-clawdouble', frames: this.anims.generateFrameNumbers('fx_clawdouble', { start: 0, end: 3 }), frameRate: 22, repeat: 0 }) // double griffe
    if (!this.anims.exists('fx-slash-circular')) this.anims.create({ key: 'fx-slash-circular', frames: this.anims.generateFrameNumbers('fx_slash_circular', { start: 0, end: 6 }), frameRate: 24, repeat: 0 }) // tranche circulaire (nova)
    if (!this.anims.exists('fx-rock')) this.anims.create({ key: 'fx-rock', frames: this.anims.generateFrameNumbers('fx_rock', { start: 0, end: 13 }), frameRate: 24, repeat: 0 }) // débris de roche (slam/cône)
    if (!this.anims.exists('fx-water')) this.anims.create({ key: 'fx-water', frames: this.anims.generateFrameNumbers('fx_water', { start: 0, end: 10 }), frameRate: 22, repeat: 0 }) // gerbe d'eau (slam/flaque)
    if (!this.anims.exists('fx-circle-orange')) this.anims.create({ key: 'fx-circle-orange', frames: this.anims.generateFrameNumbers('fx_circle_orange', { start: 0, end: 3 }), frameRate: 10, repeat: 0 }) // anneau d'invocation (adds)
    this.createDecoAnimations()
  }

  /** Animations de la déco animée du décor (bannières du village, etc.). */
  createDecoAnimations() {
    // bannières : ondulation en boucle (4 frames). Détune léger du frameRate possible plus tard.
    if (!this.anims.exists('flag-blue')) {
      this.anims.create({ key: 'flag-blue', frames: this.anims.generateFrameNumbers('flag_blue', { start: 0, end: 3 }), frameRate: 6, repeat: -1 })
    }
    if (!this.anims.exists('flag-red')) {
      this.anims.create({ key: 'flag-red', frames: this.anims.generateFrameNumbers('flag_red', { start: 0, end: 3 }), frameRate: 6, repeat: -1 })
    }
    // moulin à eau : mécanisme qui tourne lentement (3 frames)
    if (!this.anims.exists('watermill')) {
      this.anims.create({ key: 'watermill', frames: this.anims.generateFrameNumbers('watermill', { start: 0, end: 2 }), frameRate: 4, repeat: -1 })
    }
    if (!this.anims.exists('fire-anim')) {
      this.anims.create({ key: 'fire-anim', frames: this.anims.generateFrameNumbers('fire_anim', { start: 0, end: 29 }), frameRate: 16, repeat: -1 }) // flamme du feu de camp
    }
    // sables mouvants : tourbillon de sable qui tourne en boucle (8 frames)
    if (!this.anims.exists('quicksand')) {
      this.anims.create({ key: 'quicksand', frames: this.anims.generateFrameNumbers('quicksand', { start: 0, end: 7 }), frameRate: 8, repeat: -1 })
    }
  }

  /** Animations des objets (pièce qui tourne). */
  createItemAnimations() {
    if (!this.anims.exists('coin-spin')) {
      this.anims.create({
        key: 'coin-spin',
        frames: this.anims.generateFrameNumbers('drop_gold', { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      })
    }
  }

  /**
   * Textures dessinées par code (pas de fichier à charger).
   * - 'proj' : boule d'énergie verte (projectile du héros).
   * Les sprites de drops (or/cœur/gemme) viennent désormais du pack (cf. preload).
   */
  createGeneratedTextures() {
    if (!this.textures.exists('proj')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      // boule BLANCHE/grise -> TEINTÉE par la couleur de magie de l'apparence (setTint dans Projectile)
      g.fillStyle(0xdedede, 1) // halo (gris clair -> prend la teinte, un peu plus sombre = bord)
      g.fillCircle(5, 5, 5)
      g.fillStyle(0xffffff, 1) // cœur lumineux (blanc -> teinte pleine, centre brillant)
      g.fillCircle(5, 5, 2.5)
      g.generateTexture('proj', 10, 10)
      g.destroy()
    }

    // 'water_gen' : tileset d'eau 64x16 = 4 variantes 16x16 (bleu + reflets clairs).
    // Utilisé comme tileset d'une couche de tilemap pour les rivières.
    if (!this.textures.exists('water_gen')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      // reflets clairs par variante : [x, y, largeur]
      const ripples = [
        [[2, 4, 4], [9, 11, 5]],
        [[6, 3, 5], [1, 12, 4], [11, 8, 3]],
        [[8, 6, 4], [3, 13, 5]],
        [[12, 5, 3], [5, 10, 5], [1, 2, 3]],
      ]
      const specks = [
        [[12, 9], [4, 14]],
        [[3, 6], [13, 13]],
        [[10, 3], [1, 9]],
        [[7, 7], [14, 4]],
      ]
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        g.fillStyle(0x3f8ed0, 1) // bleu eau de base
        g.fillRect(ox, 0, 16, 16)
        g.fillStyle(0x357fbe, 1) // creux légèrement plus foncés
        for (const [sx, sy] of specks[i]) g.fillRect(ox + sx, sy, 2, 1)
        g.fillStyle(0x74b4e8, 1) // reflets clairs (vaguelettes)
        for (const [rx, ry, rw] of ripples[i]) {
          g.fillRect(ox + rx, ry, rw, 1)
          g.fillRect(ox + rx + 1, ry + 1, Math.max(1, rw - 2), 1)
        }
      }
      g.generateTexture('water_gen', 64, 16)
      g.destroy()
    }

    // 'bridge_gen' : tileset 64x16 = 4 variantes 16x16. PONT = PLANCHES de bois USÉES séparées par
    // de l'EAU -> bandes alternées : planche (3px, bois) / eau (2px, rivière) / planche / eau ...
    // Tout opaque + détails >=2px -> on lit bien "planche+eau+planche" sans scintiller au dézoom.
    if (!this.textures.exists('bridge_gen')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      const woods = [0xc0894d, 0xad7740, 0xcf975a] // teintes de bois usé
      const knots = [[3, 1], [12, 5], [7, 10], [10, 1]] // un noeud par variante (sur une planche)
      // motif vertical, période 9 px : 2 PLANCHES (3px + joint 1px + 3px) puis une bande d'EAU (2px)
      // -> on voit surtout du bois, et un peu d'eau entre chaque PAIRE de planches (~22% d'eau).
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        const shift = (i * 4) % 9 // décale le motif d'une variante à l'autre (0,4,8,3 -> 4 motifs distincts)
        for (let y = 0; y < 16; y++) {
          const m = (y + shift) % 9
          if (m === 7 || m === 8) {
            g.fillStyle(m === 7 ? 0x2f6ea8 : 0x3f8ed0, 1) // EAU (2px)
            g.fillRect(ox, y, 16, 1)
          } else if (m === 3) {
            g.fillStyle(0x7c5128, 1) // joint sombre entre les 2 planches
            g.fillRect(ox, y, 16, 1)
          } else {
            const plank = m < 3 ? 0 : 1 // planche du haut / du bas de la paire
            g.fillStyle(woods[(plank + i) % 3], 1)
            g.fillRect(ox, y, 16, 1)
            if (m === 0 || m === 4) {
              g.fillStyle(0xe2b176, 1) // arête supérieure éclairée de chaque planche
              g.fillRect(ox, y, 16, 1)
            } else if (m === 6) {
              g.fillStyle(0x7c5128, 1) // ombre sous la planche basse
              g.fillRect(ox, y, 16, 1)
            }
          }
        }
        // reflet sur la bande d'eau + noeud usé sur une planche
        g.fillStyle(0x79b7ea, 1)
        for (let y = 0; y < 16; y++) if ((y + shift) % 9 === 8) g.fillRect(ox + 2 + ((y + i) % 6), y, 4, 1)
        g.fillStyle(0x70491f, 1)
        g.fillRect(ox + knots[i][0], knots[i][1], 2, 2) // noeud (tache sombre)
      }
      g.generateTexture('bridge_gen', 64, 16)
      g.destroy()
    }

    // 'ford_gen' : tileset 64x16 = 4 variantes 16x16 de TERRE BATTUE marron CLAIR -> gués (traversées
    // de rivière en chemin de terre clair, à la place des planches).
    if (!this.textures.exists('ford_gen')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      const dots = [
        [[3, 4], [11, 9], [6, 13]],
        [[8, 3], [2, 10], [13, 12]],
        [[5, 6], [12, 4], [9, 11]],
        [[2, 5], [7, 9], [14, 7]],
      ]
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        g.fillStyle(0xb5915c, 1) // terre battue marron clair (un peu plus foncé)
        g.fillRect(ox, 0, 16, 16)
        g.fillStyle(0xc7a877, 1) // éclaircis (terre tassée)
        g.fillRect(ox + 1, 2, 5, 3)
        g.fillRect(ox + 9, 10, 5, 3)
        g.fillStyle(0x97743f, 1) // petits cailloux / nuances plus foncées
        for (const [sx, sy] of dots[i]) g.fillRect(ox + sx, sy, 2, 2)
      }
      g.generateTexture('ford_gen', 64, 16)
      g.destroy()
    }

    // 'dry_lake' : 4 variantes 16x16 de terre craquelée (lacs asséchés du désert)
    if (!this.textures.exists('dry_lake')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      const cracks = [
        [[8, 1, 1, 14], [3, 7, 10, 1]],
        [[5, 0, 1, 9], [10, 5, 1, 11], [2, 11, 12, 1]],
        [[11, 2, 1,13], [4, 4, 8, 1]],
        [[7, 3, 1, 12], [1, 8, 14, 1], [9, 10, 6, 1]],
      ]
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        g.fillStyle(0xcaa86a, 1) // terre sèche
        g.fillRect(ox, 0, 16, 16)
        g.fillStyle(0xbb965a, 1) // nuances
        g.fillRect(ox + 2, 9, 5, 4)
        g.fillRect(ox + 9, 2, 4, 3)
        g.fillStyle(0x8f7440, 1) // craquelures
        for (const [sx, sy, w, h] of cracks[i]) g.fillRect(ox + sx, sy, w, h)
      }
      g.generateTexture('dry_lake', 64, 16)
      g.destroy()
    }

    // 'ice_gen' : 4 variantes 16x16 de glace (lacs gelés de la neige, marchables)
    if (!this.textures.exists('ice_gen')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      const cracks = [
        [[4, 2, 1, 11], [4, 8, 7, 1]],
        [[10, 3, 1, 10], [2, 6, 9, 1]],
        [[7, 1, 1, 13]],
        [[12, 4, 1, 9], [3, 10, 10, 1]],
      ]
      for (let i = 0; i < 4; i++) {
        const ox = i * 16
        g.fillStyle(0xb7e1ee, 1) // glace bleu clair
        g.fillRect(ox, 0, 16, 16)
        g.fillStyle(0x8fc6d8, 1) // craquelures bleutées
        for (const [sx, sy, w, h] of cracks[i]) g.fillRect(ox + sx, sy, w, h)
        g.fillStyle(0xeefaff, 1) // reflets blancs (brillance)
        g.fillRect(ox + 2, 2, 4, 1)
        g.fillRect(ox + 9, 12, 4, 1)
      }
      g.generateTexture('ice_gen', 64, 16)
      g.destroy()
    }

    // 'campfire' : feu de camp 24x24 (pierres + bûches + flamme) — élément central du village
    if (!this.textures.exists('campfire')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x000000, 0.18) // ombre
      g.fillEllipse(12, 20, 20, 6)
      const stones = [[4, 18], [9, 21], [15, 21], [20, 18], [3, 15], [21, 15]]
      g.fillStyle(0x9a9a9a, 1) // pierres claires
      for (const [sx, sy] of stones) g.fillCircle(sx, sy, 3)
      g.fillStyle(0x767676, 1) // ombrage pierres
      for (const [sx, sy] of stones) g.fillCircle(sx, sy + 1, 2)
      g.fillStyle(0x6b4423, 1) // bûches
      g.fillRect(5, 16, 14, 3)
      g.fillRect(8, 14, 3, 6)
      g.fillStyle(0xe8541a, 1) // flamme externe
      g.fillTriangle(7, 17, 17, 17, 12, 3)
      g.fillStyle(0xff8a2a, 1) // flamme
      g.fillTriangle(9, 17, 15, 17, 12, 7)
      g.fillStyle(0xffd24d, 1) // cœur
      g.fillTriangle(10, 17, 14, 17, 12, 10)
      g.generateTexture('campfire', 24, 24)
      g.destroy()
    }

    // 'cave_floor' : sol de grotte 16×16 (roche sombre + moucheture discrète, quasi-uniforme pour ne pas montrer le tuilage)
    if (!this.textures.exists('cave_floor')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x2c2823, 1); g.fillRect(0, 0, 16, 16) // base roche brun-gris sombre
      for (let i = 0; i < 10; i++) { const x = 2 + Math.floor(Math.random() * 12), y = 2 + Math.floor(Math.random() * 12); g.fillStyle(Math.random() < 0.5 ? 0x332e28 : 0x241f1b, 0.8); g.fillRect(x, y, 1 + (Math.random() < 0.3 ? 1 : 0), 1) } // moucheture (loin des bords)
      g.generateTexture('cave_floor', 16, 16)
      g.destroy()
    }

    // 'icon_sun' / 'icon_moon' : petites icônes 22×22 pour l'indicateur jour/nuit du HUD (générées).
    if (!this.textures.exists('icon_sun')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0xffd24d, 1) // rayons
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        g.fillRect(11 + Math.cos(a) * 9 - 1, 11 + Math.sin(a) * 9 - 1, 2.5, 2.5)
      }
      g.fillStyle(0xffe08a, 1); g.fillCircle(11, 11, 6.5) // halo
      g.fillStyle(0xffc63a, 1); g.fillCircle(11, 11, 5) // disque
      g.generateTexture('icon_sun', 22, 22)
      g.destroy()
    }
    if (!this.textures.exists('icon_moon')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0xe6ecff, 1); g.fillCircle(11, 11, 7.5) // pleine lune pâle
      g.fillStyle(0xc3cef0, 1) // cratères
      g.fillCircle(8, 8, 1.6); g.fillCircle(14, 12, 2.1); g.fillCircle(9, 14, 1.3)
      g.generateTexture('icon_moon', 22, 22)
      g.destroy()
    }

    // clôture en bois : 'fence_h' (course horizontale) + 'fence_v' (course verticale)
    if (!this.textures.exists('fence_h')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x8a5a2b, 1) // lisses horizontales
      g.fillRect(0, 6, 16, 2)
      g.fillRect(0, 10, 16, 2)
      g.fillStyle(0x6b4423, 1) // poteau
      g.fillRect(6, 3, 4, 12)
      g.fillStyle(0xa3702f, 1) // reflet haut du poteau
      g.fillRect(6, 3, 4, 1)
      g.generateTexture('fence_h', 16, 16)
      g.destroy()
    }
    if (!this.textures.exists('fence_v')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x8a5a2b, 1) // lisses verticales
      g.fillRect(6, 0, 2, 16)
      g.fillRect(10, 0, 2, 16)
      g.fillStyle(0x6b4423, 1) // poteau
      g.fillRect(3, 6, 12, 4)
      g.generateTexture('fence_v', 16, 16)
      g.destroy()
    }

    // 'lamppost' : lampadaire 16x32 (poteau + lanterne lumineuse)
    if (!this.textures.exists('lamppost')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x3a3340, 1) // poteau
      g.fillRect(7, 9, 3, 21)
      g.fillRect(5, 29, 7, 2) // base
      g.fillStyle(0x2a2530, 1) // cadre lanterne
      g.fillRect(5, 1, 7, 9)
      g.fillStyle(0xffe066, 1) // lumière
      g.fillRect(6, 2, 5, 7)
      g.fillStyle(0xfff6c0, 1) // cœur lumineux
      g.fillRect(7, 3, 3, 4)
      g.generateTexture('lamppost', 16, 32)
      g.destroy()
    }

    // 'barrel' : barrique 14x16 (bois + cerceaux)
    if (!this.textures.exists('barrel')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x8a5a2b, 1)
      g.fillRect(2, 2, 10, 13)
      g.fillStyle(0xa3702f, 1) // reflet
      g.fillRect(4, 2, 2, 13)
      g.fillStyle(0x5e3d1c, 1) // cerceaux
      g.fillRect(2, 4, 10, 1)
      g.fillRect(2, 8, 10, 1)
      g.fillRect(2, 12, 10, 1)
      g.generateTexture('barrel', 14, 16)
      g.destroy()
    }

    // 'crate' : caisse 16x16 (bois + cadre + planche)
    if (!this.textures.exists('crate')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0x9a6a35, 1)
      g.fillRect(1, 2, 14, 13)
      g.fillStyle(0x6b4423, 1) // cadre
      g.fillRect(1, 2, 14, 1)
      g.fillRect(1, 14, 14, 1)
      g.fillRect(1, 2, 1, 13)
      g.fillRect(14, 2, 1, 13)
      g.fillRect(1, 8, 14, 1) // planche
      g.generateTexture('crate', 16, 16)
      g.destroy()
    }
  }

  /**
   * Spritesheet NinjaGreen : 4 colonnes x 7 lignes (28 frames).
   * Organisé PAR COLONNE = direction : col0=Bas, col1=Haut, col2=Gauche, col3=Droite.
   * Chaque ligne (rangée de 4) est une frame du cycle de marche.
   * On prend les 4 premières lignes pour le walk -> indices espacés de 4.
   */
  createPlayerAnimations() {
    // une série d'anims PAR apparence jouable (préfixe = clé du héros)
    for (const h of HEROES) {
      const key = h.key
      const add = (suffix, indices, frameRate = 8, repeat = -1) => {
        const k = `${key}-${suffix}`
        if (this.anims.exists(k)) return
        this.anims.create({ key: k, frames: this.anims.generateFrameNumbers(key, { frames: indices }), frameRate, repeat })
      }
      add('walk-down', [0, 4, 8, 12])
      add('walk-up', [1, 5, 9, 13])
      add('walk-left', [2, 6, 10, 14])
      add('walk-right', [3, 7, 11, 15])
      // immobile = 1re frame de chaque direction (1re ligne)
      add('idle-down', [0], 1, 0)
      add('idle-up', [1], 1, 0)
      add('idle-left', [2], 1, 0)
      add('idle-right', [3], 1, 0)
      // attaque : lignes 4-6 (frames 16-27), même logique par colonne=direction
      add('attack-down', [16, 20, 24], 14, 0)
      add('attack-up', [17, 21, 25], 14, 0)
      add('attack-left', [18, 22, 26], 14, 0)
      add('attack-right', [19, 23, 27], 14, 0)
    }
  }

  /**
   * Anim des monstres : spritesheet 4x4 organisé PAR COLONNE = direction
   * (col0=Bas, col1=Haut, col2=Gauche, col3=Droite), chaque ligne = une frame.
   * Comme le héros : marche directionnelle avec frames espacées de 4.
   */
  createMonsterAnimations() {
    const dirs = { down: 0, up: 1, left: 2, right: 3 }
    for (const m of MONSTER_SPRITES) {
      for (const [dir, col] of Object.entries(dirs)) {
        const key = `mon-${m}-${dir}`
        if (this.anims.exists(key)) continue
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers('mon_' + m, {
            frames: [col, col + 4, col + 8, col + 12],
          }),
          frameRate: 6,
          repeat: -1,
        })
      }
    }
    this.createBossAnimations()
  }

  /**
   * Anims des BOSS DE RAID (sprites dédiés mono-orientation). Une anim par état :
   * idle (boucle), walk (boucle), hit (joué une fois quand le boss encaisse).
   * `rig` = préfixe des clés (boss-<rig>-<state>), nb de frames par feuille.
   */
  createBossAnimations() {
    const rigs = {
      tengublue: { idle: 6, walk: 10, hit: 8, attack: 15, trans: 11 },
      samurai: { idle: 6, walk: 6, hit: 4, charge: 3 }, // charge = pose de ruée (boucle pendant télégraphe+dash)
      democyclop: { idle: 5, walk: 6, hit: 3 },
      giantflam: { idle: 5, hit: 3 }, // pas de walk -> playRig retombe sur idle
      democyclop2: { idle: 5, walk: 6, hit: 3 },
      giantbamboo: { idle: 6, walk: 12, hit: 4 },
      giantslime: { idle: 5, hit: 5 }, // pas de walk
      giantspirit: { idle: 5, hit: 3 }, // pas de walk
      redsamurai: { idle: 6, walk: 6, hit: 4, charge: 3 },
      tengured: { idle: 6, walk: 10, hit: 8, attack: 15, trans: 11 },
      giantslime2: { idle: 5, hit: 5 }, // pas de walk
      squidred: { idle: 4, walk: 4, hit: 4, shoot: 5 }, // shoot = télégraphe (joué une fois) avant chaque tir
      giantfrog: { idle: 5, hit: 3, charge: 7 }, // pas de walk
      giantracoon: { idle: 6, charge: 2 }, // idle seul (pas de hit ni walk -> takeDamage tolère l'absence de "hit")
      giantbamboo2: { idle: 6, walk: 12, hit: 4 },
    }
    for (const [rig, states] of Object.entries(rigs)) {
      for (const [state, count] of Object.entries(states)) {
        const key = `boss-${rig}-${state}`
        if (this.anims.exists(key)) continue
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(`boss_${rig}_${state}`, { start: 0, end: count - 1 }),
          frameRate: state === 'hit' ? 14 : state === 'shoot' ? 12 : state === 'attack' ? 14 : state === 'trans' ? 12 : state === 'charge' ? 11 : state === 'walk' ? 10 : 6,
          repeat: (state === 'hit' || state === 'shoot' || state === 'trans') ? 0 : -1, // hit/shoot/trans = une fois ; idle/walk/charge/attack = boucle
        })
      }
    }
  }

  /**
   * Anim des villageois : mêmes spritesheets 4x7 que le héros (par colonne = direction).
   * Marche directionnelle (frames espacées de 4) + idle (1re frame de chaque direction).
   */
  createNpcAnimations() {
    const dirs = { down: 0, up: 1, left: 2, right: 3 }
    for (const n of NPC_SPRITES) {
      for (const [dir, col] of Object.entries(dirs)) {
        const wk = `${n}-walk-${dir}`
        if (!this.anims.exists(wk)) {
          this.anims.create({
            key: wk,
            frames: this.anims.generateFrameNumbers(n, { frames: [col, col + 4, col + 8, col + 12] }),
            frameRate: 6,
            repeat: -1,
          })
        }
        const idle = `${n}-idle-${dir}`
        if (!this.anims.exists(idle)) {
          this.anims.create({ key: idle, frames: this.anims.generateFrameNumbers(n, { frames: [col] }), frameRate: 1, repeat: 0 })
        }
      }
    }
  }
}
