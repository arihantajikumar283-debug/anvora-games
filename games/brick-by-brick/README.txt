========================================================
BRICK BY BRICK
Anvora Games
========================================================

A complete, self-contained arcade brick-breaker built with plain
HTML5, CSS3, vanilla JavaScript and the Canvas API. No frameworks,
no build step, no backend, no external libraries.

--------------------------------------------------------
FILE STRUCTURE
--------------------------------------------------------

brick-by-brick/
  index.html   All screens (menu, HUD, gameplay, pause, results)
  style.css    Visual styling — dark neon arcade theme
  script.js    Full game engine (see "Code organization" below)
  README.txt   This file

--------------------------------------------------------
HOW TO RUN
--------------------------------------------------------

Simplest: double-click index.html and it opens in your browser.

Recommended (avoids any local browser file-access quirks):
  npx serve brick-by-brick
  -- or --
  python3 -m http.server --directory brick-by-brick 8080
Then open http://localhost:8080 in your browser.

Works fully offline once loaded — no network requests are made.
No sound files are used; every sound effect and the background
music loop are synthesized live with the Web Audio API.

--------------------------------------------------------
CONTROLS
--------------------------------------------------------

Desktop:
  Move paddle   Mouse movement, A / D, or Left / Right arrow keys
  Launch ball   Space
  Pause         Esc

Mobile / touch:
  Move paddle   Drag anywhere on the arena, or the on-screen ◀ ▶ buttons
  Launch ball   Tap the LAUNCH button
  Pause         Tap the ❚❚ button in the HUD bar

--------------------------------------------------------
DEPLOYING TO THE ANVORA GAMES WEBSITE
--------------------------------------------------------

This game is fully self-contained inside its own folder and does
not touch or require anything from the parent site. To publish it:

  1. Copy the entire brick-by-brick/ folder into your site at:
       games/brick-by-brick/

  2. Your existing "Play Now" button / game card should link to:
       games/brick-by-brick/index.html

  3. No changes are needed to the parent Anvora Games site — this
     folder works standing entirely on its own.

--------------------------------------------------------
CODE ORGANIZATION (script.js)
--------------------------------------------------------

The script is split into clearly labeled sections, in load order:

  1.  Configuration        Arena size, grid metrics, tunable constants
  2.  Utilities             Small math/formatting helpers
  3.  Storage                localStorage load/save with corruption guard
  4.  Audio                  Web Audio synth SFX + generative music loop
  5.  Input                  Keyboard, mouse, touch drag, touch buttons
  6.  GameState              The list of valid states
  7.  Level Manager           The 10 hand-authored level layouts
  8.  Brick                   Brick collection: build, hit, destroy, draw
  9.  Paddle                  Player paddle movement + drawing
  10. Ball(s)                 Multi-ball physics, launch, drawing
  11. Collision               Wall / paddle / brick collision resolution
  12. PowerUp                 The 7 power-up types and their effects
  13. Particle                Lightweight capped particle system
  14. Combo                   Combo counter / multiplier / decay timer
  15. Player                  Score, lives, active timed power-ups
  16. Stats                   Per-run counters flushed into SAVE.stats
  17. Level                   Run-time state for the level in progress
  18. Renderer                Background + full-frame drawing
  19. UI                      All DOM screen / HUD manipulation
  20. Game                    State machine + the main requestAnimationFrame loop
  21. Initialization          Boots everything on window load

--------------------------------------------------------
CHANGING / ADDING LEVELS
--------------------------------------------------------

Open script.js and find the LevelManager.LEVELS array (section 7).
Each level is an object like:

  {
    name:'Rectangle', ballSpeedMult:0.88,
    rows:[
      'NNNNNNNN',
      'NNNNNNNN'
    ]
  }

Each row string must be exactly 8 characters (one per column).
Legend:
  .  empty space        N  Normal brick   (1 hit)
  S  Strong brick (2)   H  Heavy brick    (3 hits)
  A  Armored brick (4)  P  Special brick  (always drops a power-up)
  E  Explosive brick    (destroys nearby bricks when it breaks)

To add an 11th level, append a new object to the array and raise
CFG.TOTAL_LEVELS (section 1) to match. ballSpeedMult scales the
ball's base speed for that level — increase it gradually for a
smooth difficulty curve.

--------------------------------------------------------
CREDITS
--------------------------------------------------------

Created by Arihant
Anvora Games — 2026
