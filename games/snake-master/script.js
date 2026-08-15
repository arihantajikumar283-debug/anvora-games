/* ============================================================
   SNAKE MASTER — GAME LOGIC
   Created by Arihant | © 2026 Arihant. All Rights Reserved.
   ------------------------------------------------------------
   Table of contents (search for these headers):
     1. CONFIG & CONSTANTS
     2. STORAGE
     3. LANGUAGE / i18n
     4. SOUND
     5. SETTINGS / STATS
     6. STATE
     7. ACHIEVEMENTS
     8. SKINS
     9. FOOD TYPES
    10. POWER-UPS
    11. SNAKE LOGIC
    12. FOOD & POWER-UP SPAWNING
    13. PARTICLES & SCORE POPUPS
    14. BACKGROUND PARTICLE LAYER (menu ambience)
    15. RENDERING (main game canvas)
    16. UI / SCREEN MANAGEMENT
    17. SAVE / CONTINUE
    18. INPUT (keyboard + touch/swipe)
    19. GAME LOOP
    20. INITIALIZATION
    21. BOOT SEQUENCE (loading screen)
   ============================================================ */

(() => {
  'use strict';

  /* ============================================================
     1. CONFIG & CONSTANTS
  ============================================================ */

  const CONFIG = {
    GRID_SIZE: 24,
    CANVAS_SIZE: 600,
    COUNTDOWN_SECONDS: 3,
    COMBO_WINDOW_MS: 4000,
    WIN_SCORE: 1000,              // reaching this score counts the round as "won"
    POWERUP_SPAWN_MIN_MS: 8000,
    POWERUP_SPAWN_MAX_MS: 16000,
    POWERUP_LIFETIME_MS: 9000,    // how long an un-collected power-up stays on the board
  };

  const DIFFICULTY_SPEEDS = { easy: 6, medium: 10, hard: 16 };

  const CELL = CONFIG.CANVAS_SIZE / CONFIG.GRID_SIZE;

  const DIRECTIONS = {
    UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 },
  };
  const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

  /* ============================================================
     2. STORAGE
  ============================================================ */

  const Storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* ignore */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (err) { /* ignore */ }
    },
  };

  const KEYS = {
    HIGH_SCORE: 'snakeMaster.highScore',
    SETTINGS: 'snakeMaster.settings',
    STATS: 'snakeMaster.stats',
    ACHIEVEMENTS: 'snakeMaster.achievements',
    SAVED_GAME: 'snakeMaster.savedGame',
  };

  /* ============================================================
     3. LANGUAGE / i18n
     Every element tagged data-i18n="a.b" gets its textContent
     replaced by STRINGS[lang]['a.b'] when the language changes.
     Falls back to English if a key is missing in another language.
  ============================================================ */

  const STRINGS = {
    en: {
      'hud.score': 'Score', 'hud.best': 'Best', 'hud.length': 'Length', 'hud.time': 'Time',
      'hud.difficulty': 'Difficulty', 'hud.combo': 'Combo',
      'pause.title': 'Paused', 'pause.sub': "Take a breath. Press P or tap Resume.",
      'pause.resume': 'Resume', 'pause.restart': 'Restart', 'pause.menu': 'Main Menu',
      'win.title': 'You Win!', 'win.sub': 'You filled the entire board. Incredible.',
      'menu.tagline': "A modern take on the classic. Eat, grow, don't bite yourself.",
      'menu.credit': 'Created by Arihant',
      'menu.difficulty': 'Difficulty', 'menu.start': 'Start Game', 'menu.continue': 'Continue',
      'menu.settings': 'Settings', 'menu.stats': 'Statistics', 'menu.achievements': 'Achievements',
      'menu.exit': 'Exit', 'menu.controlsTitle': 'Controls', 'menu.move': 'Move',
      'menu.swipeHint': 'Swipe on mobile to steer', 'menu.copyright': '© 2026 Arihant. All Rights Reserved.',
      'difficulty.easy': 'Easy', 'difficulty.medium': 'Medium', 'difficulty.hard': 'Hard',
      'exit.title': 'Thanks for playing!', 'exit.sub': 'You can safely close this tab now, or jump back in.',
      'exit.back': 'Back to Menu',
      'gameover.title': 'Game Over', 'gameover.highscore': 'High Score', 'gameover.playAgain': 'Play Again',
      'gameover.newRecord': '🏆 New High Score!',
      'settings.musicVolume': 'Music Volume', 'settings.soundVolume': 'Sound Volume',
      'settings.grid': 'Show Grid', 'settings.particles': 'Background Particles', 'settings.fps': 'Show FPS Counter',
      'settings.fullscreen': 'Fullscreen', 'settings.toggle': 'Toggle', 'settings.theme': 'Theme',
      'settings.language': 'Language', 'settings.difficulty': 'Default Difficulty', 'settings.skin': 'Snake Skin',
      'settings.resetHighscore': 'Reset High Score', 'settings.resetProgress': 'Reset All Progress',
      'settings.back': 'Back',
      'theme.dark': 'Dark', 'theme.light': 'Light', 'theme.neon': 'Neon',
      'theme.cyberpunk': 'Cyberpunk', 'theme.ocean': 'Ocean', 'theme.forest': 'Forest',
      'stats.gamesPlayed': 'Games Played', 'stats.gamesWon': 'Games Won', 'stats.avgScore': 'Average Score',
      'stats.foodEaten': 'Total Food Eaten', 'stats.powerups': 'Power-Ups Collected',
      'stats.bestTime': 'Best Game Time', 'stats.playTime': 'Total Play Time', 'stats.longest': 'Longest Snake',
      'toast.unlocked': 'Achievement Unlocked', 'toast.powerup': 'Power-Up!',
    },
    es: {
      'hud.score': 'Puntos', 'hud.best': 'Récord', 'hud.length': 'Largo', 'hud.time': 'Tiempo',
      'hud.difficulty': 'Dificultad', 'hud.combo': 'Combo',
      'pause.title': 'Pausado', 'pause.sub': 'Respira hondo. Pulsa P o toca Reanudar.',
      'pause.resume': 'Reanudar', 'pause.restart': 'Reiniciar', 'pause.menu': 'Menú Principal',
      'win.title': '¡Ganaste!', 'win.sub': 'Llenaste todo el tablero. Increíble.',
      'menu.tagline': 'Una versión moderna del clásico. Come, crece, no te muerdas.',
      'menu.credit': 'Creado por Arihant',
      'menu.difficulty': 'Dificultad', 'menu.start': 'Iniciar Juego', 'menu.continue': 'Continuar',
      'menu.settings': 'Ajustes', 'menu.stats': 'Estadísticas', 'menu.achievements': 'Logros',
      'menu.exit': 'Salir', 'menu.controlsTitle': 'Controles', 'menu.move': 'Mover',
      'menu.swipeHint': 'Desliza en móvil para dirigir', 'menu.copyright': '© 2026 Arihant. Todos los derechos reservados.',
      'difficulty.easy': 'Fácil', 'difficulty.medium': 'Medio', 'difficulty.hard': 'Difícil',
      'exit.title': '¡Gracias por jugar!', 'exit.sub': 'Puedes cerrar esta pestaña o volver a jugar.',
      'exit.back': 'Volver al Menú',
      'gameover.title': 'Fin del Juego', 'gameover.highscore': 'Récord', 'gameover.playAgain': 'Jugar de Nuevo',
      'gameover.newRecord': '🏆 ¡Nuevo Récord!',
      'settings.musicVolume': 'Volumen de Música', 'settings.soundVolume': 'Volumen de Sonido',
      'settings.grid': 'Mostrar Cuadrícula', 'settings.particles': 'Partículas de Fondo', 'settings.fps': 'Mostrar FPS',
      'settings.fullscreen': 'Pantalla Completa', 'settings.toggle': 'Cambiar', 'settings.theme': 'Tema',
      'settings.language': 'Idioma', 'settings.difficulty': 'Dificultad Predeterminada', 'settings.skin': 'Piel de Serpiente',
      'settings.resetHighscore': 'Reiniciar Récord', 'settings.resetProgress': 'Restablecer Todo',
      'settings.back': 'Volver',
      'theme.dark': 'Oscuro', 'theme.light': 'Claro', 'theme.neon': 'Neón',
      'theme.cyberpunk': 'Cyberpunk', 'theme.ocean': 'Océano', 'theme.forest': 'Bosque',
      'stats.gamesPlayed': 'Partidas Jugadas', 'stats.gamesWon': 'Partidas Ganadas', 'stats.avgScore': 'Puntuación Media',
      'stats.foodEaten': 'Comida Total', 'stats.powerups': 'Power-Ups Obtenidos',
      'stats.bestTime': 'Mejor Tiempo', 'stats.playTime': 'Tiempo Total Jugado', 'stats.longest': 'Serpiente Más Larga',
      'toast.unlocked': 'Logro Desbloqueado', 'toast.powerup': '¡Power-Up!',
    },
    hi: {
      'hud.score': 'स्कोर', 'hud.best': 'सर्वश्रेष्ठ', 'hud.length': 'लंबाई', 'hud.time': 'समय',
      'hud.difficulty': 'कठिनाई', 'hud.combo': 'कॉम्बो',
      'pause.title': 'रुका हुआ', 'pause.sub': 'आराम करें। P दबाएँ या Resume टैप करें।',
      'pause.resume': 'जारी रखें', 'pause.restart': 'पुनः आरंभ', 'pause.menu': 'मुख्य मेनू',
      'win.title': 'आप जीत गए!', 'win.sub': 'आपने पूरा बोर्ड भर दिया। शानदार।',
      'menu.tagline': 'क्लासिक गेम का आधुनिक रूप। खाएं, बढ़ें, खुद को न काटें।',
      'menu.credit': 'अरिहंत द्वारा निर्मित',
      'menu.difficulty': 'कठिनाई', 'menu.start': 'खेल शुरू करें', 'menu.continue': 'जारी रखें',
      'menu.settings': 'सेटिंग्स', 'menu.stats': 'आँकड़े', 'menu.achievements': 'उपलब्धियाँ',
      'menu.exit': 'बाहर जाएं', 'menu.controlsTitle': 'नियंत्रण', 'menu.move': 'चलें',
      'menu.swipeHint': 'मोबाइल पर स्वाइप करें', 'menu.copyright': '© 2026 अरिहंत। सर्वाधिकार सुरक्षित।',
      'difficulty.easy': 'आसान', 'difficulty.medium': 'मध्यम', 'difficulty.hard': 'कठिन',
      'exit.title': 'खेलने के लिए धन्यवाद!', 'exit.sub': 'अब आप यह टैब बंद कर सकते हैं, या वापस आ सकते हैं।',
      'exit.back': 'मेनू पर वापस',
      'gameover.title': 'खेल समाप्त', 'gameover.highscore': 'उच्च स्कोर', 'gameover.playAgain': 'फिर से खेलें',
      'gameover.newRecord': '🏆 नया उच्च स्कोर!',
      'settings.musicVolume': 'संगीत वॉल्यूम', 'settings.soundVolume': 'ध्वनि वॉल्यूम',
      'settings.grid': 'ग्रिड दिखाएं', 'settings.particles': 'पृष्ठभूमि कण', 'settings.fps': 'FPS दिखाएं',
      'settings.fullscreen': 'पूर्ण स्क्रीन', 'settings.toggle': 'टॉगल', 'settings.theme': 'थीम',
      'settings.language': 'भाषा', 'settings.difficulty': 'डिफ़ॉल्ट कठिनाई', 'settings.skin': 'सांप की खाल',
      'settings.resetHighscore': 'उच्च स्कोर रीसेट करें', 'settings.resetProgress': 'सभी प्रगति रीसेट करें',
      'settings.back': 'वापस',
      'theme.dark': 'डार्क', 'theme.light': 'लाइट', 'theme.neon': 'नियॉन',
      'theme.cyberpunk': 'साइबरपंक', 'theme.ocean': 'समुद्र', 'theme.forest': 'जंगल',
      'stats.gamesPlayed': 'खेले गए खेल', 'stats.gamesWon': 'जीते गए खेल', 'stats.avgScore': 'औसत स्कोर',
      'stats.foodEaten': 'कुल खाया गया भोजन', 'stats.powerups': 'पावर-अप एकत्र किए',
      'stats.bestTime': 'सर्वश्रेष्ठ समय', 'stats.playTime': 'कुल खेल समय', 'stats.longest': 'सबसे लंबा सांप',
      'toast.unlocked': 'उपलब्धि अनलॉक', 'toast.powerup': 'पावर-अप!',
    },
  };

  function applyLanguage(lang) {
    const dict = STRINGS[lang] || STRINGS.en;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const text = dict[key] || STRINGS.en[key];
      if (text !== undefined) el.textContent = text;
    });
  }

  /* ============================================================
     4. SOUND
     Every play() call checks the volume setting first and is
     wrapped in try/catch. Missing audio files never break the
     game — they simply play silently (or not at all).
  ============================================================ */

  const Sound = {
    els: {},

    init() {
      ['eat', 'gameover', 'click', 'music', 'achievement', 'pause', 'powerup'].forEach((name) => {
        const el = document.getElementById(`sfx-${name}`);
        if (!el) return;
        el.addEventListener('error', () => { el.dataset.broken = 'true'; });
        this.els[name] = el;
      });
      this.applyVolumes();
    },

    applyVolumes() {
      const musicVol = Settings.current.musicVolume / 100;
      const soundVol = Settings.current.soundVolume / 100;
      if (this.els.music) this.els.music.volume = musicVol;
      ['eat', 'gameover', 'click', 'achievement', 'pause', 'powerup'].forEach((name) => {
        if (this.els[name]) this.els[name].volume = soundVol;
      });
    },

    play(name) {
      if (Settings.current.soundVolume <= 0) return;
      const el = this.els[name];
      if (!el || el.dataset.broken === 'true') return;
      try {
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) p.catch(() => { /* autoplay/missing file — ignore */ });
      } catch (err) { /* never let sound break gameplay */ }
    },

    updateMusic() {
      const el = this.els.music;
      if (!el || el.dataset.broken === 'true') return;
      try {
        if (Settings.current.musicVolume > 0 && State.screen === 'playing') {
          const p = el.play();
          if (p && p.catch) p.catch(() => {});
        } else {
          el.pause();
        }
      } catch (err) { /* ignore */ }
    },
  };

  /* ============================================================
     5. SETTINGS / STATS
  ============================================================ */

  const Settings = {
    current: {
      musicVolume: 60,
      soundVolume: 70,
      gridOn: true,
      particlesOn: true,
      fpsOn: false,
      theme: 'dark',
      language: 'en',
      difficulty: 'medium',
      skin: 'classic',
    },
    load() { this.current = Object.assign({}, this.current, Storage.get(KEYS.SETTINGS, {})); },
    save() { Storage.set(KEYS.SETTINGS, this.current); },
  };

  const Stats = {
    current: {
      gamesPlayed: 0,
      gamesWon: 0,
      totalScore: 0,
      totalFoodEaten: 0,
      powerUpsCollected: 0,
      bestTimeSeconds: 0,
      longestSnake: 1,
      totalPlayTimeMs: 0,
      ateGold: false,
      ateDiamond: false,
      ateMystery: false,
      shieldSaves: 0,
      ghostPasses: 0,
      powerupTypesCollected: [],
      themesTried: ['dark'],
    },
    load() { this.current = Object.assign({}, this.current, Storage.get(KEYS.STATS, {})); },
    save() { Storage.set(KEYS.STATS, this.current); },
  };

  /* ============================================================
     6. STATE
  ============================================================ */

  const State = {
    screen: 'start',
    highScore: 0,
    snake: null,
    food: null,
    powerUp: null,           // power-up currently sitting on the board (or null)
    particles: [],
    score: 0,
    combo: 1,
    lastEatTime: 0,
    elapsedMs: 0,
    gameOverReason: '',
    roundWon: false,
    activeEffects: {},       // { powerUpId: expiryTimestampMs }
    scoreMultiplier: 1,
    lastPowerUpColorVar: null, // theme color-var name driving the snake aura / border glow
  };

  /* ============================================================
     7. ACHIEVEMENTS  (33 total)
  ============================================================ */

  const ACHIEVEMENT_DEFS = [
    { id: 'first_game', icon: '🎮', name: 'First Game', desc: 'Play your first game.', check: () => Stats.current.gamesPlayed >= 1 },
    { id: 'first_bite', icon: '🍎', name: 'First Bite', desc: 'Eat your first food.', check: () => Stats.current.totalFoodEaten >= 1 },
    { id: 'score_50', icon: '⭐', name: 'Getting Started', desc: 'Score 50 points in one run.', check: () => State.score >= 50 },
    { id: 'score_100', icon: '🌟', name: 'Centurion', desc: 'Score 100 points in one run.', check: () => State.score >= 100 },
    { id: 'score_250', icon: '💫', name: 'On a Roll', desc: 'Score 250 points in one run.', check: () => State.score >= 250 },
    { id: 'score_500', icon: '🏅', name: 'High Achiever', desc: 'Score 500 points in one run.', check: () => State.score >= 500 },
    { id: 'score_1000', icon: '👑', name: 'Snake Master', desc: 'Score 1000 points in one run.', check: () => State.score >= 1000 },
    { id: 'length_10', icon: '🐍', name: 'Growing Up', desc: 'Reach a length of 10.', check: () => State.snake && State.snake.body.length >= 10 },
    { id: 'length_25', icon: '🐉', name: 'Big Boi', desc: 'Reach a length of 25.', check: () => State.snake && State.snake.body.length >= 25 },
    { id: 'length_50', icon: '🦕', name: 'Colossal', desc: 'Reach a length of 50.', check: () => State.snake && State.snake.body.length >= 50 },
    { id: 'food_50', icon: '🍽️', name: 'Regular Diner', desc: 'Eat 50 food total.', check: () => Stats.current.totalFoodEaten >= 50 },
    { id: 'food_100', icon: '🍕', name: 'Big Appetite', desc: 'Eat 100 food total.', check: () => Stats.current.totalFoodEaten >= 100 },
    { id: 'food_500', icon: '🍰', name: 'Gourmet', desc: 'Eat 500 food total.', check: () => Stats.current.totalFoodEaten >= 500 },
    { id: 'games_10', icon: '🕹️', name: 'Regular', desc: 'Play 10 games.', check: () => Stats.current.gamesPlayed >= 10 },
    { id: 'games_50', icon: '🎯', name: 'Dedicated', desc: 'Play 50 games.', check: () => Stats.current.gamesPlayed >= 50 },
    { id: 'games_100', icon: '🏆', name: 'Veteran', desc: 'Play 100 games.', check: () => Stats.current.gamesPlayed >= 100 },
    { id: 'combo_5', icon: '🔥', name: 'Combo Master', desc: 'Reach a x5 combo.', check: () => State.combo >= 5 },
    { id: 'combo_10', icon: '💥', name: 'Combo Legend', desc: 'Reach a x10 combo.', check: () => State.combo >= 10 },
    { id: 'survive_60', icon: '⏱️', name: 'Marathoner', desc: 'Survive 60 seconds in one run.', check: () => State.elapsedMs >= 60000 },
    { id: 'survive_180', icon: '⏳', name: 'Endurance', desc: 'Survive 3 minutes in one run.', check: () => State.elapsedMs >= 180000 },
    { id: 'hard_survivor', icon: '💀', name: 'Danger Zone', desc: 'Score 80+ on Hard difficulty.', check: () => Settings.current.difficulty === 'hard' && State.score >= 80 },
    { id: 'gold_apple', icon: '🥇', name: 'Golden Find', desc: 'Eat a Gold Apple.', check: () => Stats.current.ateGold },
    { id: 'diamond', icon: '💎', name: 'Treasure Hunter', desc: 'Eat a Diamond.', check: () => Stats.current.ateDiamond },
    { id: 'mystery', icon: '🎁', name: 'Curious', desc: 'Eat a Mystery Food.', check: () => Stats.current.ateMystery },
    { id: 'powerup_first', icon: '⚡', name: 'Powered Up', desc: 'Collect your first power-up.', check: () => Stats.current.powerUpsCollected >= 1 },
    { id: 'powerup_10', icon: '🔋', name: 'Charged', desc: 'Collect 10 power-ups.', check: () => Stats.current.powerUpsCollected >= 10 },
    { id: 'powerup_all_types', icon: '🧪', name: 'Collector', desc: 'Collect every type of power-up.', check: () => Stats.current.powerupTypesCollected.length >= 5 },
    { id: 'shield_save', icon: '🛡️', name: 'Saved by the Shield', desc: 'Survive a hit thanks to a Shield.', check: () => Stats.current.shieldSaves >= 1 },
    { id: 'ghost_pass', icon: '👻', name: 'Ghost Walker', desc: 'Pass through yourself using Ghost Mode.', check: () => Stats.current.ghostPasses >= 1 },
    { id: 'skin_unlock_3', icon: '🎨', name: 'Fashionista', desc: 'Unlock 3 snake skins.', check: () => Object.values(Skins.unlockedCache).filter(Boolean).length >= 3 },
    { id: 'skin_all', icon: '🏵️', name: 'Full Wardrobe', desc: 'Unlock every snake skin.', check: () => Object.values(Skins.unlockedCache).filter(Boolean).length >= SKIN_DEFS.length },
    { id: 'theme_explorer', icon: '🌈', name: 'Theme Explorer', desc: 'Try all 6 themes.', check: () => Stats.current.themesTried.length >= 6 },
    { id: 'win_game', icon: '🏆', name: 'Board Filled', desc: 'Fill the entire board.', check: () => State.roundWon && State.snake && State.snake.body.length >= CONFIG.GRID_SIZE * CONFIG.GRID_SIZE },
  ];

  const Achievements = {
    unlocked: {},
    load() { this.unlocked = Storage.get(KEYS.ACHIEVEMENTS, {}); },
    save() { Storage.set(KEYS.ACHIEVEMENTS, this.unlocked); },
    checkAll() {
      ACHIEVEMENT_DEFS.forEach((def) => {
        if (this.unlocked[def.id]) return;
        if (def.check()) {
          this.unlocked[def.id] = true;
          this.save();
          UI.showAchievementToast(def);
          Sound.play('achievement');
        }
      });
    },
  };

  /* ============================================================
     8. SKINS  (7 total)
     Each skin defines an unlock condition and a color function
     used by the renderer: colorForSegment(i, total, isHead, tMs)
  ============================================================ */

  const SKIN_DEFS = [
    {
      id: 'classic', name: 'Classic', swatch: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
      unlock: () => true,
      color: (ctx, i, total, isHead) => (isHead ? ctx.accent2 : ctx.accent),
    },
    {
      id: 'neon', name: 'Neon', swatch: 'linear-gradient(135deg, #00f0ff, #ff2fd0)',
      unlock: () => true,
      color: (ctx, i, total, isHead) => (isHead ? '#ff2fd0' : '#00f0ff'),
      glowBoost: 1.6,
    },
    {
      id: 'ice', name: 'Ice', swatch: 'linear-gradient(135deg, #bff4ff, #38bdf8)',
      unlock: () => Stats.current.gamesPlayed >= 10,
      color: (ctx, i, total) => {
        const l = 85 - Math.min(35, i * 2);
        return `hsl(198, 90%, ${l}%)`;
      },
    },
    {
      id: 'fire', name: 'Fire', swatch: 'linear-gradient(135deg, #ffd166, #ff3b30)',
      unlock: () => State.highScore >= 200 || Stats.current.totalScore >= 200,
      color: (ctx, i, total) => {
        const hue = Math.max(0, 48 - i * 3);
        return `hsl(${hue}, 100%, 55%)`;
      },
    },
    {
      id: 'gold', name: 'Gold', swatch: 'linear-gradient(135deg, #fff3b0, #d4af37)',
      unlock: () => State.highScore >= 500 || Stats.current.totalScore >= 500,
      color: (ctx, i, total, isHead, tMs) => {
        const shimmer = 50 + Math.sin(tMs / 250 + i * 0.5) * 15;
        return `hsl(46, 85%, ${shimmer}%)`;
      },
    },
    {
      id: 'rainbow', name: 'Rainbow', swatch: 'linear-gradient(135deg, #ff2fd0, #ffd60a, #00f0ff)',
      unlock: () => Stats.current.totalFoodEaten >= 100,
      color: (ctx, i, total, isHead, tMs) => {
        const hue = (i * 18 + tMs / 20) % 360;
        return `hsl(${hue}, 90%, 60%)`;
      },
    },
    {
      id: 'matrix', name: 'Matrix', swatch: 'linear-gradient(135deg, #001a00, #00ff66)',
      unlock: () => Stats.current.powerUpsCollected >= 20,
      color: (ctx, i, total, isHead, tMs) => {
        const flicker = 45 + Math.sin(tMs / 150 + i) * 15;
        return isHead ? '#eaffea' : `hsl(120, 100%, ${flicker}%)`;
      },
    },
  ];

  const Skins = {
    unlockedCache: {},
    refreshUnlocked() {
      SKIN_DEFS.forEach((def) => { this.unlockedCache[def.id] = def.unlock(); });
    },
    get(id) { return SKIN_DEFS.find((s) => s.id === id) || SKIN_DEFS[0]; },
  };

  /* ============================================================
     9. FOOD TYPES  (4 total, weighted random spawn)
  ============================================================ */

  const FOOD_TYPES = [
    { id: 'apple', name: 'Apple', points: 10, colorVar: 'food-1', weight: 60, shape: 'circle' },
    { id: 'gold', name: 'Gold Apple', points: 25, colorVar: 'food-2', weight: 25, shape: 'circle' },
    { id: 'diamond', name: 'Diamond', points: 50, colorVar: 'food-3', weight: 10, shape: 'diamond' },
    { id: 'mystery', name: 'Mystery Food', points: 15, colorVar: 'food-mystery', weight: 5, shape: 'star' },
  ];

  function pickWeightedFoodType() {
    const totalWeight = FOOD_TYPES.reduce((sum, f) => sum + f.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const type of FOOD_TYPES) {
      roll -= type.weight;
      if (roll <= 0) return type;
    }
    return FOOD_TYPES[0];
  }

  /* ============================================================
     10. POWER-UPS  (5 total)
  ============================================================ */

  const POWERUP_DEFS = [
    { id: 'doubleScore', name: 'Double Score', icon: '✖2', color: 'food-2', duration: 10000 },
    { id: 'slowMotion', name: 'Slow Motion', icon: '🐌', color: 'food-3', duration: 8000 },
    { id: 'speedBoost', name: 'Speed Boost', icon: '💨', color: 'food-1', duration: 8000 },
    { id: 'ghost', name: 'Ghost Mode', icon: '👻', color: 'accent-2', duration: 8000 },
    { id: 'shield', name: 'Shield', icon: '🛡️', color: 'accent', duration: 15000 },
  ];

  function getPowerUpDef(id) { return POWERUP_DEFS.find((p) => p.id === id); }

  // `cellX`/`cellY` are optional — when given, a floating name label
  // appears at the pickup spot. This never touches canvas/board size;
  // it only drives DOM/CSS glow effects and popup text.
  function activatePowerUp(id, cellX, cellY) {
    const def = getPowerUpDef(id);
    if (!def) return;
    State.activeEffects[id] = performance.now() + def.duration;
    State.lastPowerUpColorVar = def.color;
    if (id === 'doubleScore') State.scoreMultiplier = 2;
    Stats.current.powerUpsCollected += 1;
    if (!Stats.current.powerupTypesCollected.includes(id)) {
      Stats.current.powerupTypesCollected.push(id);
    }
    Stats.save();
    UI.showPowerUpToast(def);
    UI.setPowerUpAura(def.color);
    if (cellX !== undefined && cellY !== undefined) {
      spawnFloatingText(cellX, cellY, `${def.icon} ${def.name}`, def.color);
    }
    Sound.play('powerup');
  }

  function isPowerUpActive(id) {
    return !!State.activeEffects[id] && State.activeEffects[id] > performance.now();
  }

  function updateActiveEffects() {
    const now = performance.now();
    Object.keys(State.activeEffects).forEach((id) => {
      if (State.activeEffects[id] <= now) {
        delete State.activeEffects[id];
        if (id === 'doubleScore') State.scoreMultiplier = 1;
      }
    });
    // Once nothing is active, drop the aura/border-glow — purely a
    // CSS class + custom property, never a size change.
    if (Object.keys(State.activeEffects).length === 0 && State.lastPowerUpColorVar) {
      State.lastPowerUpColorVar = null;
      UI.clearPowerUpAura();
    }
  }

  /* ============================================================
     11. SNAKE LOGIC
  ============================================================ */

  class Snake {
    constructor() {
      const mid = Math.floor(CONFIG.GRID_SIZE / 2);
      this.body = [
        { x: mid - 1, y: mid }, { x: mid - 2, y: mid }, { x: mid - 3, y: mid },
      ];
      this.direction = 'RIGHT';
      this.queuedDirection = 'RIGHT';
      this.growthPending = 0;
      // Snapshot of body positions immediately before the most recent
      // step. The renderer lerps from here to `body` for smooth,
      // glide-style motion instead of snapping cell-to-cell — see
      // Renderer.drawSnake().
      this.prevBody = this.body.map((s) => ({ x: s.x, y: s.y }));
    }

    get head() { return this.body[0]; }

    setDirection(dirName) {
      if (!DIRECTIONS[dirName]) return;
      if (OPPOSITE[dirName] === this.direction) return;
      this.queuedDirection = dirName;
    }

    // Advance one grid cell. `ghostActive` lets the head pass through
    // its own body (walls still apply) — Ghost Mode power-up.
    step(gridSize, foodCell, ghostActive) {
      // Every new head is unshifted onto the front of `body`, which
      // shifts every existing segment's array index up by one — so
      // body[i] (after) === prevBody[i-1] (before) for i >= 1. That
      // correspondence is exactly what the renderer needs to lerp
      // each segment smoothly from where it *was* to where it *is*.
      this.prevBody = this.body.map((s) => ({ x: s.x, y: s.y }));

      this.direction = this.queuedDirection;
      const vec = DIRECTIONS[this.direction];
      const newHead = { x: this.head.x + vec.x, y: this.head.y + vec.y };

      if (newHead.x < 0 || newHead.x >= gridSize || newHead.y < 0 || newHead.y >= gridSize) {
        return { result: 'wall' };
      }

      const bodyToCheck = this.growthPending > 0 ? this.body : this.body.slice(0, -1);
      const wouldHitSelf = bodyToCheck.some((seg) => seg.x === newHead.x && seg.y === newHead.y);

      if (wouldHitSelf && !ghostActive) {
        return { result: 'self' };
      }

      this.body.unshift(newHead);
      const ateFood = foodCell && newHead.x === foodCell.x && newHead.y === foodCell.y;
      if (ateFood) this.growthPending += 1;

      if (this.growthPending > 0) {
        this.growthPending -= 1;
      } else {
        this.body.pop();
      }

      return { result: ateFood ? 'food' : 'ok', head: newHead, phased: wouldHitSelf && ghostActive };
    }

    occupiesCell(x, y) { return this.body.some((seg) => seg.x === x && seg.y === y); }
  }

  /* ============================================================
     12. FOOD & POWER-UP SPAWNING
  ============================================================ */

  class Food {
    constructor(snake, gridSize) { this.respawn(snake, gridSize); }

    respawn(snake, gridSize, avoid) {
      let cell;
      let attempts = 0;
      do {
        cell = { x: Math.floor(Math.random() * gridSize), y: Math.floor(Math.random() * gridSize) };
        attempts += 1;
      } while (
        (snake.occupiesCell(cell.x, cell.y) || (avoid && avoid.x === cell.x && avoid.y === cell.y))
        && attempts < 500
      );

      const type = pickWeightedFoodType();
      this.x = cell.x;
      this.y = cell.y;
      this.type = type.id;
      this.points = type.points;
      this.colorVar = type.colorVar;
      this.shape = type.shape;
      this.spawnTime = performance.now();
    }
  }

  function trySpawnPowerUp() {
    if (State.powerUp || !State.snake || !State.food) return;
    const gridSize = CONFIG.GRID_SIZE;
    let cell;
    let attempts = 0;
    do {
      cell = { x: Math.floor(Math.random() * gridSize), y: Math.floor(Math.random() * gridSize) };
      attempts += 1;
    } while (
      (State.snake.occupiesCell(cell.x, cell.y) || (cell.x === State.food.x && cell.y === State.food.y))
      && attempts < 500
    );
    const def = POWERUP_DEFS[Math.floor(Math.random() * POWERUP_DEFS.length)];
    State.powerUp = { x: cell.x, y: cell.y, id: def.id, spawnTime: performance.now() };
  }

  /* ============================================================
     13. PARTICLES & SCORE POPUPS
  ============================================================ */

  function spawnParticles(cellX, cellY, colorVar, count = 10) {
    const centerX = cellX * CELL + CELL / 2;
    const centerY = cellY * CELL + CELL / 2;
    if (!Settings.current.particlesOn) return;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 1.2 + Math.random() * 1.6;
      State.particles.push({
        x: centerX, y: centerY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, color: colorVar, size: 2 + Math.random() * 2,
      });
    }
  }

  function updateParticles(dt) {
    State.particles.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt / 600;
    });
    State.particles = State.particles.filter((p) => p.life > 0);
  }

  function spawnScorePopup(cellX, cellY, text) {
    const layer = document.getElementById('popup-layer');
    const stage = document.getElementById('stage');
    if (!layer || !stage) return;
    const scale = stage.clientWidth / CONFIG.CANVAS_SIZE;
    const el = document.createElement('div');
    el.className = 'score-popup';
    el.textContent = text;
    el.style.left = `${(cellX * CELL + CELL / 2) * scale}px`;
    el.style.top = `${(cellY * CELL + CELL / 2) * scale}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  // Floating power-up name label — same mechanism as the score
  // popup, just wider text and colored to match the power-up. Pure
  // DOM/CSS; never touches canvas or board dimensions.
  function spawnFloatingText(cellX, cellY, text, colorVar) {
    const layer = document.getElementById('popup-layer');
    const stage = document.getElementById('stage');
    if (!layer || !stage) return;
    const scale = stage.clientWidth / CONFIG.CANVAS_SIZE;
    const el = document.createElement('div');
    el.className = 'score-popup score-popup--powerup';
    el.textContent = text;
    el.style.left = `${(cellX * CELL + CELL / 2) * scale}px`;
    el.style.top = `${(cellY * CELL + CELL / 2) * scale}px`;
    if (colorVar) {
      el.style.color = `var(--${colorVar})`;
      el.style.textShadow = `0 0 10px var(--${colorVar})`;
    }
    layer.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ============================================================
     14. BACKGROUND PARTICLE LAYER (menu ambience)
     A cheap, independent rAF loop that draws slow-drifting glowing
     dots behind the whole app. Pauses automatically when the tab
     is hidden or when the user turns particles off, so it never
     wastes battery or leaks frames.
  ============================================================ */

  const BgParticles = {
    canvas: null, ctx: null, dots: [], rafId: null, running: false,

    init() {
      this.canvas = document.getElementById('bg-particles');
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stop(); else this.start();
      });
      this.seed();
      this.start();
    },

    resize() {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    },

    seed() {
      const count = window.innerWidth < 600 ? 26 : 46;
      this.dots = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: 1 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        a: 0.2 + Math.random() * 0.5,
      }));
    },

    start() {
      if (this.running || !this.canvas) return;
      this.running = true;
      const tick = () => {
        if (!this.running) return;
        this.draw();
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    },

    stop() {
      this.running = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
    },

    draw() {
      if (!Settings.current.particlesOn) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        return;
      }
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);
      const color = getComputedStyle(document.body).getPropertyValue('--particle-color').trim() || '#6ee7c9';
      this.dots.forEach((d) => {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0) d.x = w; if (d.x > w) d.x = 0;
        if (d.y < 0) d.y = h; if (d.y > h) d.y = 0;
        ctx.beginPath();
        ctx.globalAlpha = d.a;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    },
  };

  /* ============================================================
     15. RENDERING (main game canvas)
  ============================================================ */

  const Renderer = {
    canvas: null, ctx: null,
    // Cache of resolved CSS custom properties for the active theme.
    // getComputedStyle() forces a style recalculation, so calling it
    // once per theme change — instead of several times per drawn
    // segment/particle, every single frame — is a meaningful win on
    // low-end devices where every millisecond of frame budget counts.
    themeCache: {},

    init() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.applyDPR();
      this.refreshThemeCache();
      window.addEventListener('resize', () => this.applyDPR());
    },

    applyDPR() {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = CONFIG.CANVAS_SIZE * dpr;
      this.canvas.height = CONFIG.CANVAS_SIZE * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
    },

    // Reads every custom property the renderer touches, once, and
    // stores plain strings for instant lookup. Call this again
    // whenever the theme (or any --variable) changes.
    refreshThemeCache() {
      const style = getComputedStyle(document.body);
      const read = (name) => style.getPropertyValue(name).trim();
      this.themeCache = {
        'bg': read('--bg'),
        'bg-elevated': read('--bg-elevated'),
        'grid-line': read('--grid-line'),
        'accent': read('--accent'),
        'accent-2': read('--accent-2'),
        'food-1': read('--food-1'),
        'food-2': read('--food-2'),
        'food-3': read('--food-3'),
        'food-mystery': read('--food-mystery'),
      };
    },

    cssVar(name) {
      const key = name.replace('--', '');
      const cached = this.themeCache[key];
      if (cached !== undefined) return cached;
      // Fallback for any variable not pre-cached above — keeps this
      // safe to extend without silently returning nothing.
      return getComputedStyle(document.body).getPropertyValue(name).trim();
    },

    clear() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE);
      ctx.fillStyle = this.cssVar('--bg-elevated');
      ctx.fillRect(0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE);
    },

    drawGrid() {
      if (!Settings.current.gridOn) return;
      const ctx = this.ctx;
      ctx.strokeStyle = this.cssVar('--grid-line');
      ctx.lineWidth = 1;
      for (let i = 1; i < CONFIG.GRID_SIZE; i += 1) {
        const pos = i * CELL + 0.5;
        ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, CONFIG.CANVAS_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(CONFIG.CANVAS_SIZE, pos); ctx.stroke();
      }
    },

    roundedRect(x, y, w, h, r) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },

    // `t` is how far (0..1) we are between the last completed grid
    // step and the next one. Each segment glides from its previous
    // cell to its current cell instead of snapping, which is what
    // makes the movement read as smooth at any difficulty speed.
    drawSnake(snake, t) {
      const ctx = this.ctx;
      const skin = Skins.get(Settings.current.skin);
      const colorCtx = { accent: this.cssVar('--accent'), accent2: this.cssVar('--accent-2') };
      const now = performance.now();
      const pad = 2;
      const ghostActive = isPowerUpActive('ghost');
      const shieldActive = isPowerUpActive('shield');

      // Power-up "aura": a pulsing glow boost + thin animated outline
      // on every segment while any power-up is active. Purely extra
      // canvas paint (shadowBlur + stroke) — never changes segment
      // size or board dimensions.
      const auraActive = Object.keys(State.activeEffects).length > 0;
      const auraColor = auraActive ? this.cssVar(`--${State.lastPowerUpColorVar || 'accent'}`) : null;
      const auraPulse = auraActive ? 0.5 + Math.sin(now / 180) * 0.5 : 0;

      snake.body.forEach((seg, i) => {
        const isHead = i === 0;
        // Segments beyond prevBody's length are brand new (just grew)
        // and have nowhere to glide from, so they simply hold still.
        const prev = snake.prevBody[i] || seg;
        const ix = prev.x + (seg.x - prev.x) * t;
        const iy = prev.y + (seg.y - prev.y) * t;
        const x = ix * CELL + pad / 2;
        const y = iy * CELL + pad / 2;
        const size = CELL - pad;
        const color = skin.color(colorCtx, i, snake.body.length, isHead, now);

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = (isHead ? 16 : 8) * (skin.glowBoost || 1) * (1 + auraPulse * 0.6);
        ctx.globalAlpha = (ghostActive ? 0.55 : 1) * Math.max(0.55, 1 - i * 0.015);
        ctx.fillStyle = color;
        this.roundedRect(x, y, size, size, isHead ? size * 0.4 : size * 0.32);
        ctx.fill();
        ctx.restore();

        if (auraActive) {
          ctx.save();
          this.roundedRect(x, y, size, size, isHead ? size * 0.4 : size * 0.32);
          ctx.strokeStyle = auraColor;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.35 + auraPulse * 0.4;
          ctx.shadowColor = auraColor;
          ctx.shadowBlur = 6;
          ctx.stroke();
          ctx.restore();
        }

        if (isHead) {
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.fillStyle = this.cssVar('--bg');
          const dir = DIRECTIONS[snake.direction];
          const cx = x + size / 2; const cy = y + size / 2;
          const eyeOffset = size * 0.18;
          const perpX = -dir.y; const perpY = dir.x;
          [-1, 1].forEach((side) => {
            const ex = cx + dir.x * eyeOffset + perpX * eyeOffset * side;
            const ey = cy + dir.y * eyeOffset + perpY * eyeOffset * side;
            ctx.beginPath(); ctx.arc(ex, ey, size * 0.09, 0, Math.PI * 2); ctx.fill();
          });
          ctx.restore();

          // Shield ring around the head while active
          if (shieldActive) {
            ctx.save();
            ctx.strokeStyle = this.cssVar('--accent');
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.8;
            ctx.shadowColor = this.cssVar('--accent');
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.75, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      });
    },

    drawFoodShape(shape, cx, cy, radius) {
      const ctx = this.ctx;
      ctx.beginPath();
      if (shape === 'diamond') {
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx + radius, cy);
        ctx.lineTo(cx, cy + radius);
        ctx.lineTo(cx - radius, cy);
        ctx.closePath();
      } else if (shape === 'star') {
        const spikes = 5;
        const outerR = radius;
        const innerR = radius * 0.45;
        for (let i = 0; i < spikes * 2; i += 1) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (Math.PI / spikes) * i - Math.PI / 2;
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      }
    },

    drawFood(food) {
      const ctx = this.ctx;
      const color = this.cssVar(`--${food.colorVar}`);
      const cx = food.x * CELL + CELL / 2;
      const cy = food.y * CELL + CELL / 2;
      const t = (performance.now() - food.spawnTime) / 1000;
      const pulse = 1 + Math.sin(t * 4) * 0.12;
      const radius = (CELL / 2 - 4) * pulse;

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = color;
      this.drawFoodShape(food.shape, cx, cy, radius);
      ctx.fill();

      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    },

    drawPowerUp(pu) {
      if (!pu) return;
      const def = getPowerUpDef(pu.id);
      const ctx = this.ctx;
      const color = this.cssVar(`--${def.color}`);
      const cx = pu.x * CELL + CELL / 2;
      const cy = pu.y * CELL + CELL / 2;
      const t = (performance.now() - pu.spawnTime) / 1000;
      const pulse = 1 + Math.sin(t * 5) * 0.15;
      const radius = (CELL / 2 - 3) * pulse;

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      // Hexagon body for a distinct "power-up" silhouette.
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.font = `${Math.floor(CELL * 0.55)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, cx, cy + 1);
      ctx.restore();
    },

    drawParticles() {
      const ctx = this.ctx;
      State.particles.forEach((p) => {
        const color = this.cssVar(`--${p.color}`);
        ctx.save();
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    },

    // `t` (0..1) is the snake's glide progress toward its next grid
    // step — see drawSnake(). Defaults to 1 (fully settled) for any
    // caller that doesn't care, e.g. a one-off redraw.
    renderFrame(t = 1) {
      this.clear();
      this.drawGrid();
      if (State.food) this.drawFood(State.food);
      if (State.powerUp) this.drawPowerUp(State.powerUp);
      if (State.snake) this.drawSnake(State.snake, t);
      this.drawParticles();
    },
  };

  /* ============================================================
     16. UI / SCREEN MANAGEMENT
  ============================================================ */

  const UI = {
    els: {},
    _toastTimer: null,
    _powerupToastTimer: null,

    init() {
      const ids = [
        'hud', 'hud-score', 'hud-highscore', 'hud-length', 'hud-time', 'hud-difficulty',
        'hud-combo', 'hud-combo-wrap', 'hud-fps', 'powerup-strip',
        'stage', 'countdown-overlay', 'countdown-number', 'pause-overlay', 'win-overlay',
        'touch-controls',
        'screen-start', 'screen-exit', 'screen-gameover', 'screen-settings', 'screen-stats', 'screen-achievements',
        'btn-continue',
        'final-score', 'final-highscore', 'final-length', 'final-time', 'new-record-badge', 'gameover-reason',
        'stat-games', 'stat-wins', 'stat-highscore', 'stat-avgscore', 'stat-food', 'stat-powerups',
        'stat-besttime', 'stat-playtime', 'stat-longest',
        'achievement-list', 'achievement-progress', 'achievement-toast', 'achievement-toast-text',
        'powerup-toast', 'powerup-toast-icon', 'powerup-toast-text',
        'skin-select',
      ];
      ids.forEach((id) => { this.els[id] = document.getElementById(id); });
    },

    showScreen(name) {
      State.screen = name;
      const screenIds = ['screen-start', 'screen-exit', 'screen-gameover', 'screen-settings', 'screen-stats', 'screen-achievements'];
      screenIds.forEach((id) => this.els[id].classList.add('hidden'));
      this.els.stage.classList.add('hidden');
      this.els.hud.classList.add('hidden');
      this.els['touch-controls'].classList.add('hidden');
      this.els['powerup-strip'].classList.add('hidden');

      if (name === 'playing' || name === 'paused' || name === 'countdown') {
        this.els.stage.classList.remove('hidden');
        this.els.hud.classList.remove('hidden');
        this.els['powerup-strip'].classList.remove('hidden');
        if (isTouchDevice()) this.els['touch-controls'].classList.remove('hidden');
      } else {
        const map = {
          start: 'screen-start', exit: 'screen-exit', gameover: 'screen-gameover',
          settings: 'screen-settings', stats: 'screen-stats', achievements: 'screen-achievements',
        };
        if (map[name]) this.els[map[name]].classList.remove('hidden');
        if (name === 'start') this.refreshContinueButton();
      }

      this.els['pause-overlay'].classList.toggle('hidden', name !== 'paused');
      Sound.updateMusic();
    },

    refreshContinueButton() {
      const hasSave = !!Storage.get(KEYS.SAVED_GAME, null);
      this.els['btn-continue'].classList.toggle('hidden', !hasSave);
    },

    updateHUD() {
      this.els['hud-score'].textContent = State.score;
      this.els['hud-highscore'].textContent = State.highScore;
      this.els['hud-length'].textContent = State.snake ? State.snake.body.length : 1;
      this.els['hud-time'].textContent = formatTime(State.elapsedMs);
      this.els['hud-difficulty'].textContent = STRINGS[Settings.current.language][`difficulty.${Settings.current.difficulty}`] || capitalize(Settings.current.difficulty);

      const comboVisible = State.combo > 1;
      this.els['hud-combo-wrap'].hidden = !comboVisible;
      if (comboVisible) this.els['hud-combo'].textContent = `x${State.combo}`;

      this.renderPowerUpStrip();
    },

    renderPowerUpStrip() {
      const strip = this.els['powerup-strip'];
      const now = performance.now();
      const active = Object.keys(State.activeEffects).filter((id) => State.activeEffects[id] > now);
      strip.innerHTML = '';
      active.forEach((id) => {
        const def = getPowerUpDef(id);
        if (!def) return;
        const secondsLeft = Math.ceil((State.activeEffects[id] - now) / 1000);
        const chip = document.createElement('div');
        chip.className = 'powerup-chip';
        chip.innerHTML = `<span>${def.icon} ${def.name}</span><span class="chip-time">${secondsLeft}s</span>`;
        strip.appendChild(chip);
      });
    },

    updateFPS(fps) {
      this.els['hud-fps'].hidden = !Settings.current.fpsOn;
      if (Settings.current.fpsOn) this.els['hud-fps'].textContent = `${fps} FPS`;
    },

    showCountdown(n) {
      this.els['countdown-overlay'].classList.toggle('hidden', n === null);
      if (n !== null) {
        this.els['countdown-number'].textContent = n === 0 ? 'Go!' : String(n);
        const numEl = this.els['countdown-number'];
        numEl.style.animation = 'none';
        // eslint-disable-next-line no-unused-expressions
        numEl.offsetHeight;
        numEl.style.animation = '';
      }
    },

    showWinOverlay(show) {
      this.els['win-overlay'].classList.toggle('hidden', !show);
    },

    // ---- Power-up "juice": border glow + snake aura -----------------
    // Purely a CSS class + custom property on the stage wrapper.
    // box-shadow paints OUTSIDE the element's box and never changes
    // its layout size, so this can never cause zooming/resizing.
    setPowerUpAura(colorVar) {
      const stage = this.els.stage;
      if (!stage) return;
      stage.style.setProperty('--powerup-color', `var(--${colorVar})`);
      stage.classList.add('stage-powered');
    },

    clearPowerUpAura() {
      if (this.els.stage) this.els.stage.classList.remove('stage-powered');
    },

    // ---- Subtle screen shake — food only -----------------------------
    // A short, tiny translate() on the stage wrapper. translate() only
    // ever moves pixels around; it never resizes anything, so this is
    // safe to fire on every single food pickup without ever affecting
    // board/canvas dimensions.
    triggerFoodShake() {
      const stage = this.els.stage;
      if (!stage) return;
      stage.classList.remove('food-shake');
      // eslint-disable-next-line no-unused-expressions
      stage.offsetWidth; // force reflow so the animation can retrigger
      stage.classList.add('food-shake');
    },

    fillGameOverScreen(isNewRecord) {
      this.els['final-score'].textContent = State.score;
      this.els['final-highscore'].textContent = State.highScore;
      this.els['final-length'].textContent = State.snake.body.length;
      this.els['final-time'].textContent = formatTime(State.elapsedMs);
      this.els['gameover-reason'].textContent = State.gameOverReason;
      this.els['new-record-badge'].classList.toggle('hidden', !isNewRecord);
    },

    fillStatsScreen() {
      const s = Stats.current;
      this.els['stat-games'].textContent = s.gamesPlayed;
      this.els['stat-wins'].textContent = s.gamesWon;
      this.els['stat-highscore'].textContent = State.highScore;
      this.els['stat-avgscore'].textContent = s.gamesPlayed > 0 ? Math.round(s.totalScore / s.gamesPlayed) : 0;
      this.els['stat-food'].textContent = s.totalFoodEaten;
      this.els['stat-powerups'].textContent = s.powerUpsCollected;
      this.els['stat-besttime'].textContent = formatTime(s.bestTimeSeconds * 1000);
      this.els['stat-playtime'].textContent = formatTime(s.totalPlayTimeMs);
      this.els['stat-longest'].textContent = s.longestSnake;
    },

    renderAchievements() {
      const list = this.els['achievement-list'];
      list.innerHTML = '';
      let unlockedCount = 0;
      ACHIEVEMENT_DEFS.forEach((def) => {
        const unlocked = !!Achievements.unlocked[def.id];
        if (unlocked) unlockedCount += 1;
        const li = document.createElement('li');
        li.className = `achievement-item${unlocked ? ' unlocked' : ''}`;
        li.innerHTML = `
          <span class="achievement-icon">${def.icon}</span>
          <div>
            <div class="achievement-name">${def.name}</div>
            <div class="achievement-desc">${unlocked ? def.desc : '???'}</div>
          </div>`;
        list.appendChild(li);
      });
      this.els['achievement-progress'].textContent = `${unlockedCount} / ${ACHIEVEMENT_DEFS.length} unlocked`;
    },

    renderSkinPicker() {
      Skins.refreshUnlocked();
      const grid = this.els['skin-select'];
      grid.innerHTML = '';
      SKIN_DEFS.forEach((def) => {
        const unlocked = Skins.unlockedCache[def.id];
        const active = Settings.current.skin === def.id;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `skin-card${active ? ' active' : ''}${unlocked ? '' : ' locked'}`;
        card.setAttribute('aria-pressed', String(active));
        card.innerHTML = `
          ${unlocked ? '' : '<span class="skin-lock">🔒</span>'}
          <span class="skin-swatch" style="background:${def.swatch}"></span>
          <span class="skin-name">${def.name}</span>`;
        card.addEventListener('click', () => {
          if (!unlocked) { Sound.play('click'); return; }
          Settings.current.skin = def.id;
          Settings.save();
          Sound.play('click');
          this.renderSkinPicker();
        });
        grid.appendChild(card);
      });
    },

    showAchievementToast(def) {
      const toast = this.els['achievement-toast'];
      this.els['achievement-toast-text'].textContent = `${def.icon} ${def.name}`;
      toast.classList.remove('hidden');
      toast.style.animation = 'none';
      // eslint-disable-next-line no-unused-expressions
      toast.offsetHeight;
      toast.style.animation = '';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
    },

    showPowerUpToast(def) {
      const toast = this.els['powerup-toast'];
      this.els['powerup-toast-icon'].textContent = def.icon;
      this.els['powerup-toast-text'].textContent = def.name;
      toast.classList.remove('hidden');
      toast.style.animation = 'none';
      // eslint-disable-next-line no-unused-expressions
      toast.offsetHeight;
      toast.style.animation = '';
      clearTimeout(this._powerupToastTimer);
      this._powerupToastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
    },

    syncSettingsUI() {
      document.getElementById('slider-music').value = Settings.current.musicVolume;
      document.getElementById('slider-sound').value = Settings.current.soundVolume;
      setToggle('toggle-grid', Settings.current.gridOn);
      setToggle('toggle-particles', Settings.current.particlesOn);
      setToggle('toggle-fps', Settings.current.fpsOn);
      setSegmentedActive('theme-select', Settings.current.theme, 'theme');
      setSegmentedActive('language-select', Settings.current.language, 'lang');
      setSegmentedActive('settings-difficulty-select', Settings.current.difficulty, 'difficulty');
      setSegmentedActive('difficulty-select', Settings.current.difficulty, 'difficulty');
      this.renderSkinPicker();
    },
  };

  function setToggle(id, value) {
    document.getElementById(id).setAttribute('aria-checked', String(value));
  }

  function setSegmentedActive(containerId, value, dataKey) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('.segment').forEach((btn) => {
      const match = btn.dataset[dataKey] === value;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-checked', String(match));
    });
  }

  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

  function isTouchDevice() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  function setTheme(theme) {
    Settings.current.theme = theme;
    document.body.setAttribute('data-theme', theme);
    Renderer.refreshThemeCache();
    if (!Stats.current.themesTried.includes(theme)) {
      Stats.current.themesTried.push(theme);
      Stats.save();
    }
    Settings.save();
  }

  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        (document.documentElement.requestFullscreen || function () {}).call(document.documentElement).catch(() => {});
      } else {
        (document.exitFullscreen || function () {}).call(document).catch(() => {});
      }
    } catch (err) { /* Fullscreen API unavailable — ignore, game still works. */ }
  }

  /* ============================================================
     17. SAVE / CONTINUE
  ============================================================ */

  function saveGameSnapshot() {
    if (!State.snake || !State.food || State.screen !== 'paused') return;
    const snapshot = {
      snake: { body: State.snake.body, direction: State.snake.direction, queuedDirection: State.snake.queuedDirection, growthPending: State.snake.growthPending },
      food: { x: State.food.x, y: State.food.y, type: State.food.type, points: State.food.points, colorVar: State.food.colorVar, shape: State.food.shape },
      score: State.score, combo: State.combo, elapsedMs: State.elapsedMs,
      difficulty: Settings.current.difficulty, roundWon: State.roundWon,
    };
    Storage.set(KEYS.SAVED_GAME, snapshot);
  }

  function clearGameSnapshot() { Storage.remove(KEYS.SAVED_GAME); }

  function loadGameSnapshot() {
    const snap = Storage.get(KEYS.SAVED_GAME, null);
    if (!snap) return false;

    const snake = new Snake();
    snake.body = snap.snake.body;
    snake.direction = snap.snake.direction;
    snake.queuedDirection = snap.snake.queuedDirection;
    snake.growthPending = snap.snake.growthPending;

    const food = Object.create(Food.prototype);
    Object.assign(food, snap.food, { spawnTime: performance.now() });

    State.snake = snake;
    State.food = food;
    State.powerUp = null;
    State.particles = [];
    State.score = snap.score;
    State.combo = snap.combo;
    State.lastEatTime = 0;
    State.elapsedMs = snap.elapsedMs;
    State.gameOverReason = '';
    State.roundWon = !!snap.roundWon;
    State.activeEffects = {};
    State.scoreMultiplier = 1;
    State.lastPowerUpColorVar = null;
    UI.clearPowerUpAura();
    Settings.current.difficulty = snap.difficulty;
    Settings.save();

    clearGameSnapshot();
    return true;
  }

  /* ============================================================
     18. INPUT (keyboard + touch/swipe)
  ============================================================ */

  const KEY_TO_DIRECTION = {
    ArrowUp: 'UP', KeyW: 'UP', ArrowDown: 'DOWN', KeyS: 'DOWN',
    ArrowLeft: 'LEFT', KeyA: 'LEFT', ArrowRight: 'RIGHT', KeyD: 'RIGHT',
  };

  function initInput() {
    document.addEventListener('keydown', (e) => {
      if (KEY_TO_DIRECTION[e.code] && State.screen === 'playing') {
        State.snake.setDirection(KEY_TO_DIRECTION[e.code]);
        e.preventDefault();
        return;
      }
      switch (e.code) {
        case 'KeyP':
          if (State.screen === 'playing') Game.pause();
          else if (State.screen === 'paused') Game.resume();
          break;
        case 'KeyR':
          if (['playing', 'paused', 'gameover'].includes(State.screen)) { Sound.play('click'); Game.startCountdown(); }
          break;
        case 'Enter':
          if (State.screen === 'start' || State.screen === 'gameover') { Sound.play('click'); Game.startCountdown(); }
          break;
        case 'Escape':
          if (State.screen === 'paused') Game.resume();
          break;
        default: break;
      }
    });

    const touchMap = { 'touch-up': 'UP', 'touch-down': 'DOWN', 'touch-left': 'LEFT', 'touch-right': 'RIGHT' };
    Object.keys(touchMap).forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (State.screen === 'playing') State.snake.setDirection(touchMap[id]);
      }, { passive: false });
      el.addEventListener('click', () => {
        if (State.screen === 'playing') State.snake.setDirection(touchMap[id]);
      });
    });

    let touchStartX = 0; let touchStartY = 0;
    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      touchStartX = t.clientX; touchStartY = t.clientY;
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
      if (State.screen !== 'playing') return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX; const dy = t.clientY - touchStartY;
      const absDx = Math.abs(dx); const absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 24) return;
      if (absDx > absDy) State.snake.setDirection(dx > 0 ? 'RIGHT' : 'LEFT');
      else State.snake.setDirection(dy > 0 ? 'DOWN' : 'UP');
    }, { passive: true });
  }

  /* ============================================================
     19. GAME LOOP
  ============================================================ */

  const Game = {
    rafId: null, lastFrameTime: 0, stepAccumulator: 0,
    fpsAccumulator: 0, fpsFrameCount: 0, fpsDisplay: 60,
    powerUpSpawnAt: 0,

    resetRound() {
      State.snake = new Snake();
      State.food = new Food(State.snake, CONFIG.GRID_SIZE);
      State.powerUp = null;
      State.particles = [];
      State.score = 0;
      State.combo = 1;
      State.lastEatTime = 0;
      State.elapsedMs = 0;
      State.gameOverReason = '';
      State.roundWon = false;
      State.activeEffects = {};
      State.scoreMultiplier = 1;
      State.lastPowerUpColorVar = null;
      UI.clearPowerUpAura();
      this.stepAccumulator = 0;
      this.scheduleNextPowerUp();
      clearGameSnapshot();
    },

    scheduleNextPowerUp() {
      const span = CONFIG.POWERUP_SPAWN_MAX_MS - CONFIG.POWERUP_SPAWN_MIN_MS;
      this.powerUpSpawnAt = performance.now() + CONFIG.POWERUP_SPAWN_MIN_MS + Math.random() * span;
    },

    startCountdown() {
      this.resetRound();
      UI.showScreen('countdown');
      UI.updateHUD();
      let count = CONFIG.COUNTDOWN_SECONDS;
      UI.showCountdown(count);
      Sound.play('click');
      const tick = () => {
        count -= 1;
        if (count >= 0) { UI.showCountdown(count); setTimeout(tick, 700); } else { UI.showCountdown(null); this.begin(); }
      };
      setTimeout(tick, 700);
    },

    continueSaved() {
      if (!loadGameSnapshot()) { this.startCountdown(); return; }
      this.scheduleNextPowerUp();
      UI.showScreen('playing');
      this.lastFrameTime = performance.now();
      this.loop(this.lastFrameTime);
    },

    begin() {
      UI.showScreen('playing');
      this.lastFrameTime = performance.now();
      this.loop(this.lastFrameTime);
    },

    pause() {
      if (State.screen !== 'playing') return;
      State.screen = 'paused';
      UI.showScreen('paused');
      cancelAnimationFrame(this.rafId);
      Sound.play('pause');
      saveGameSnapshot();
    },

    resume() {
      if (State.screen !== 'paused') return;
      clearGameSnapshot();
      UI.showScreen('playing');
      this.lastFrameTime = performance.now();
      this.loop(this.lastFrameTime);
    },

    goToMenu() {
      cancelAnimationFrame(this.rafId);
      UI.showScreen('start');
    },

    handleGameOver(reason) {
      cancelAnimationFrame(this.rafId);
      State.gameOverReason = reason;
      Sound.play('gameover');
      clearGameSnapshot();

      const isNewRecord = State.score > State.highScore;
      if (isNewRecord) { State.highScore = State.score; Storage.set(KEYS.HIGH_SCORE, State.highScore); }

      Stats.current.gamesPlayed += 1;
      Stats.current.totalScore += State.score;
      Stats.current.longestSnake = Math.max(Stats.current.longestSnake, State.snake.body.length);
      Stats.current.bestTimeSeconds = Math.max(Stats.current.bestTimeSeconds, Math.floor(State.elapsedMs / 1000));
      Stats.current.totalPlayTimeMs += State.elapsedMs;
      if (State.roundWon) Stats.current.gamesWon += 1;
      Stats.save();

      Achievements.checkAll();
      UI.fillGameOverScreen(isNewRecord);
      UI.showScreen('gameover');
    },

    consumeShield() {
      delete State.activeEffects.shield;
      Stats.current.shieldSaves += 1;
      Stats.save();
      spawnParticles(State.snake.head.x, State.snake.head.y, 'accent', 16);
    },

    stepSnake() {
      const ghostActive = isPowerUpActive('ghost');
      const stepResult = State.snake.step(CONFIG.GRID_SIZE, State.food, ghostActive);

      if (stepResult.result === 'wall' || stepResult.result === 'self') {
        if (isPowerUpActive('shield')) {
          this.consumeShield();
          // Nudge the snake back in bounds / away from self by simply
          // skipping this step's movement instead of ending the game.
          State.snake.queuedDirection = State.snake.direction;
          return;
        }
        this.handleGameOver(stepResult.result === 'wall' ? 'You hit the wall.' : 'You ran into yourself.');
        return;
      }

      if (stepResult.phased) {
        Stats.current.ghostPasses += 1;
        Stats.save();
      }

      if (stepResult.result === 'food') {
        const now = performance.now();
        if (now - State.lastEatTime <= CONFIG.COMBO_WINDOW_MS && State.lastEatTime !== 0) State.combo += 1;
        else State.combo = 1;
        State.lastEatTime = now;

        const basePoints = State.food.points;
        const gained = basePoints * State.combo * State.scoreMultiplier;
        State.score += gained;
        Stats.current.totalFoodEaten += 1;
        if (State.food.type === 'gold') Stats.current.ateGold = true;
        if (State.food.type === 'diamond') Stats.current.ateDiamond = true;
        if (State.food.type === 'mystery') {
          Stats.current.ateMystery = true;
          // Mystery food always grants a random bonus power-up effect too.
          const randomDef = POWERUP_DEFS[Math.floor(Math.random() * POWERUP_DEFS.length)];
          activatePowerUp(randomDef.id, State.food.x, State.food.y);
        }

        spawnParticles(State.food.x, State.food.y, State.food.colorVar);
        spawnScorePopup(State.food.x, State.food.y, `+${gained}`);
        UI.triggerFoodShake();
        Sound.play('eat');

        State.food.respawn(State.snake, CONFIG.GRID_SIZE, State.powerUp);

        if (State.score >= CONFIG.WIN_SCORE) State.roundWon = true;
        if (State.snake.body.length >= CONFIG.GRID_SIZE * CONFIG.GRID_SIZE) {
          State.roundWon = true;
          UI.showWinOverlay(true);
          setTimeout(() => { UI.showWinOverlay(false); this.handleGameOver('You filled the entire board!'); }, 1800);
        }

        Achievements.checkAll();
      }

      // Power-up pickup (separate entity from food).
      if (State.powerUp && State.snake.head.x === State.powerUp.x && State.snake.head.y === State.powerUp.y) {
        activatePowerUp(State.powerUp.id, State.powerUp.x, State.powerUp.y);
        spawnParticles(State.powerUp.x, State.powerUp.y, getPowerUpDef(State.powerUp.id).color);
        State.powerUp = null;
        this.scheduleNextPowerUp();
        Achievements.checkAll();
      }
    },

    loop(timestamp) {
      this.rafId = requestAnimationFrame((t) => this.loop(t));
      const dt = timestamp - this.lastFrameTime;
      this.lastFrameTime = timestamp;

      this.fpsAccumulator += dt; this.fpsFrameCount += 1;
      if (this.fpsAccumulator >= 250) {
        this.fpsDisplay = Math.round((this.fpsFrameCount * 1000) / this.fpsAccumulator);
        this.fpsAccumulator = 0; this.fpsFrameCount = 0;
      }

      if (State.screen !== 'playing') return;

      State.elapsedMs += dt;
      updateActiveEffects();

      if (!State.powerUp && performance.now() >= this.powerUpSpawnAt) {
        trySpawnPowerUp();
        if (!State.powerUp) this.scheduleNextPowerUp();
      }
      if (State.powerUp && performance.now() - State.powerUp.spawnTime > CONFIG.POWERUP_LIFETIME_MS) {
        State.powerUp = null;
        this.scheduleNextPowerUp();
      }

      // Speed modifiers from active power-ups.
      let speed = DIFFICULTY_SPEEDS[Settings.current.difficulty];
      if (isPowerUpActive('slowMotion')) speed *= 0.5;
      if (isPowerUpActive('speedBoost')) speed *= 1.6;
      const msPerStep = 1000 / speed;

      this.stepAccumulator += dt;
      while (this.stepAccumulator >= msPerStep) {
        this.stepAccumulator -= msPerStep;
        this.stepSnake();
        if (State.screen !== 'playing') break;
      }

      if (State.screen !== 'playing') return;

      // How far we are into the *next* step — drives the smooth
      // glide interpolation in Renderer.drawSnake().
      const glideT = Math.min(1, this.stepAccumulator / msPerStep);

      updateParticles(dt);
      Renderer.renderFrame(glideT);
      UI.updateHUD();
      UI.updateFPS(this.fpsDisplay);
    },
  };

  /* ============================================================
     20. INITIALIZATION
  ============================================================ */

  function bindStartScreen() {
    document.getElementById('difficulty-select').addEventListener('click', (e) => {
      const btn = e.target.closest('.segment');
      if (!btn) return;
      Settings.current.difficulty = btn.dataset.difficulty;
      Settings.save();
      UI.syncSettingsUI();
      Sound.play('click');
    });

    document.getElementById('btn-start').addEventListener('click', () => { Sound.play('click'); Game.startCountdown(); });
    document.getElementById('btn-continue').addEventListener('click', () => { Sound.play('click'); Game.continueSaved(); });

    document.getElementById('btn-open-settings').addEventListener('click', () => { Sound.play('click'); UI.syncSettingsUI(); UI.showScreen('settings'); });
    document.getElementById('btn-open-stats').addEventListener('click', () => { Sound.play('click'); UI.fillStatsScreen(); UI.showScreen('stats'); });
    document.getElementById('btn-open-achievements').addEventListener('click', () => { Sound.play('click'); UI.renderAchievements(); UI.showScreen('achievements'); });
    document.getElementById('btn-exit').addEventListener('click', () => { Sound.play('click'); UI.showScreen('exit'); });
    document.getElementById('btn-exit-back').addEventListener('click', () => { Sound.play('click'); UI.showScreen('start'); });
  }

  function bindPauseOverlay() {
    document.getElementById('btn-pause').addEventListener('click', () => { Sound.play('click'); Game.pause(); });
    document.getElementById('btn-fullscreen').addEventListener('click', () => { Sound.play('click'); toggleFullscreen(); });
    document.getElementById('btn-resume').addEventListener('click', () => { Sound.play('click'); Game.resume(); });
    document.getElementById('btn-pause-restart').addEventListener('click', () => { Sound.play('click'); Game.startCountdown(); });
    document.getElementById('btn-pause-menu').addEventListener('click', () => { Sound.play('click'); clearGameSnapshot(); Game.goToMenu(); });
  }

  function bindGameOverScreen() {
    document.getElementById('btn-play-again').addEventListener('click', () => { Sound.play('click'); Game.startCountdown(); });
    document.getElementById('btn-gameover-menu').addEventListener('click', () => { Sound.play('click'); Game.goToMenu(); });
  }

  function bindSettingsScreen() {
    document.getElementById('slider-music').addEventListener('input', (e) => {
      Settings.current.musicVolume = Number(e.target.value);
      Settings.save();
      Sound.applyVolumes();
      Sound.updateMusic();
    });
    document.getElementById('slider-sound').addEventListener('input', (e) => {
      Settings.current.soundVolume = Number(e.target.value);
      Settings.save();
      Sound.applyVolumes();
    });
    document.getElementById('toggle-grid').addEventListener('click', () => {
      Settings.current.gridOn = !Settings.current.gridOn; Settings.save(); UI.syncSettingsUI(); Sound.play('click');
    });
    document.getElementById('toggle-particles').addEventListener('click', () => {
      Settings.current.particlesOn = !Settings.current.particlesOn; Settings.save(); UI.syncSettingsUI(); Sound.play('click');
    });
    document.getElementById('toggle-fps').addEventListener('click', () => {
      Settings.current.fpsOn = !Settings.current.fpsOn; Settings.save(); UI.syncSettingsUI(); Sound.play('click');
    });
    document.getElementById('btn-toggle-fullscreen').addEventListener('click', () => { Sound.play('click'); toggleFullscreen(); });

    document.getElementById('theme-select').addEventListener('click', (e) => {
      const btn = e.target.closest('.segment');
      if (!btn) return;
      setTheme(btn.dataset.theme);
      UI.syncSettingsUI();
      Achievements.checkAll();
      Sound.play('click');
    });

    document.getElementById('language-select').addEventListener('click', (e) => {
      const btn = e.target.closest('.segment');
      if (!btn) return;
      Settings.current.language = btn.dataset.lang;
      Settings.save();
      applyLanguage(Settings.current.language);
      UI.syncSettingsUI();
      Sound.play('click');
    });

    document.getElementById('settings-difficulty-select').addEventListener('click', (e) => {
      const btn = e.target.closest('.segment');
      if (!btn) return;
      Settings.current.difficulty = btn.dataset.difficulty;
      Settings.save();
      UI.syncSettingsUI();
      Sound.play('click');
    });

    document.getElementById('btn-reset-highscore').addEventListener('click', () => {
      Sound.play('click');
      State.highScore = 0;
      Storage.set(KEYS.HIGH_SCORE, 0);
    });

    document.getElementById('btn-reset-progress').addEventListener('click', () => {
      Sound.play('click');
      if (!window.confirm('Reset ALL progress? This clears your high score, stats, achievements, and unlocked skins.')) return;
      Storage.remove(KEYS.HIGH_SCORE);
      Storage.remove(KEYS.STATS);
      Storage.remove(KEYS.ACHIEVEMENTS);
      Storage.remove(KEYS.SAVED_GAME);
      State.highScore = 0;
      Stats.current = { gamesPlayed: 0, gamesWon: 0, totalScore: 0, totalFoodEaten: 0, powerUpsCollected: 0, bestTimeSeconds: 0, longestSnake: 1, totalPlayTimeMs: 0, ateGold: false, ateDiamond: false, ateMystery: false, shieldSaves: 0, ghostPasses: 0, powerupTypesCollected: [], themesTried: [Settings.current.theme] };
      Achievements.unlocked = {};
      Settings.current.skin = 'classic';
      Settings.save();
      UI.syncSettingsUI();
    });

    document.getElementById('btn-settings-back').addEventListener('click', () => { Sound.play('click'); UI.showScreen('start'); });
  }

  function bindStatsAndAchievementsScreens() {
    document.getElementById('btn-stats-back').addEventListener('click', () => { Sound.play('click'); UI.showScreen('start'); });
    document.getElementById('btn-achievements-back').addEventListener('click', () => { Sound.play('click'); UI.showScreen('start'); });
  }

  function loadPersistedData() {
    Settings.load();
    Stats.load();
    Achievements.load();
    State.highScore = Storage.get(KEYS.HIGH_SCORE, 0);
    Skins.refreshUnlocked();
    if (!Skins.unlockedCache[Settings.current.skin]) Settings.current.skin = 'classic';
  }

  function applyLoadedSettingsToDOM() {
    document.body.setAttribute('data-theme', Settings.current.theme);
    applyLanguage(Settings.current.language);
    UI.syncSettingsUI();
  }

  function init() {
    loadPersistedData();
    UI.init();
    Renderer.init();
    BgParticles.init();
    Sound.init();
    applyLoadedSettingsToDOM();
    initInput();

    bindStartScreen();
    bindPauseOverlay();
    bindGameOverScreen();
    bindSettingsScreen();
    bindStatsAndAchievementsScreens();

    // Save an in-progress game if the tab is closed mid-play.
    window.addEventListener('beforeunload', () => {
      if (State.screen === 'playing') { State.screen = 'paused'; saveGameSnapshot(); }
    });

    UI.showScreen('start');
  }

  /* ============================================================
     21. BOOT SEQUENCE (loading screen)
     Snake Master has no external assets to actually wait for —
     everything is inline HTML/CSS/JS — so this isn't a real
     progress bar. It's a short, original branded transition that
     gives init() (which is effectively instant) room to run
     without a jarring blank-to-game flash, then it unmounts
     itself completely so it costs nothing once the game is live.
  ============================================================ */

  const Boot = {
    screenEl: null, fillEl: null, hintEl: null,

    run(onReady) {
      this.screenEl = document.getElementById('loading-screen');
      this.fillEl = document.getElementById('loading-bar-fill');
      this.hintEl = document.getElementById('loading-hint');

      // No loading screen in the DOM (or it was removed) — just boot.
      if (!this.screenEl) { onReady(); return; }

      const stages = [
        { pct: 40, hint: 'Preparing the board…', delay: 110 },
        { pct: 75, hint: 'Warming up the grid…', delay: 130 },
        { pct: 100, hint: 'Ready to slither.', delay: 130 },
      ];

      let i = 0;
      const nextStage = () => {
        if (i >= stages.length) { this.finish(onReady); return; }
        const stage = stages[i];
        i += 1;
        if (this.fillEl) this.fillEl.style.width = `${stage.pct}%`;
        if (this.hintEl) this.hintEl.textContent = stage.hint;
        setTimeout(nextStage, stage.delay);
      };
      nextStage();
    },

    finish(onReady) {
      // Build the whole app underneath before revealing it — the
      // fade-out then shows a fully-ready start screen, never a
      // half-initialized one.
      onReady();
      const screen = this.screenEl;
      if (!screen) return;
      screen.classList.add('fade-out');
      // Matches the 420ms CSS opacity transition, plus a small
      // margin, then fully removes the node so it stops costing
      // any paint/compositing time for the rest of the session.
      setTimeout(() => screen.remove(), 480);
    },
  };

  function boot() {
    Boot.run(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
