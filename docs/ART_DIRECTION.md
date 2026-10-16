# Art direction

Kaboom Arena is an affectionate parody of 90s arcade games. This page keeps new features in the same voice.

## Tone
- Cheeky, never mean. Gags target the genre (absurd family feuds, hyper-excited announcers, AI hype), never the players.
- One-liners. A taunt, a banner or an announcer call fits on one line. Rare beats frequent: never two gags back to back.
- Keep the playfield readable: nothing decorative covers the arena centre.

## Look
- Crisp pixel art, flat colours, hard edges. No smooth gradients on art assets; portraits and story screens stay chunky (64-96 px grids, enlarged without smoothing).
- Single palette source: `look.js` (themes, player suits, team colours). The colour-blind palette always wins.
- Themes (grass, snow, desert, lava, night) change mood, not rules.
- The **DLSS 6 mode is the one place for excess**: bloom, mirrored reflections, lens flares, glossy faces, fake AI notifications and a fake control panel (violet and blue only). It is a joke the game is in on, and it never changes gameplay.
- Parody of real brands (the DLSS/RTX mode) is text only: no logos, no brand colours or trade dress, and a visible "Parody. Not affiliated with NVIDIA." note in the README, the splash, the panel and the tooltips. The catchphrase is "RTX enabled. DLSS 6. It's on!" and gags are spaced at least 6 s apart. Heavy visual extras (reflections, light shafts) are desktop-only and switch off when the dynamic resolution drops or reduce motion is on.
- One pixel font (Press Start 2P, vendored) for the whole UI chrome: buttons, labels, titles, banners and story screens. Long paragraphs (help, bios) keep the system font for readability.

## Sound
- Synthesised chiptune, no audio files. Styles Arcade, Epic, Chill, Synthwave plus a quiet menu variant; "Auto" follows the theme and mode (grass: arcade, snow: bells, desert: eastern scales, lava: heavy riffs, night: synthwave), with a character motif in story mode. Music is off by default.
- Effects are short, cartoonish and never louder than an explosion; every new sound needs a priority and a minimum gap so a chain reaction stays a chain reaction, not a wall of noise.
- Silent until the first user gesture, suspended when paused, muted or hidden. The voice announcer is optional and off by default.

## Modes, tiles and emotes
- Floor tiles stay readable at a glance: one shape and colour family per type (ice blue, belts with chevrons, teleporters as paired rings, spikes dark then yellow then red). Danger is always telegraphed before it hurts.
- Modes get a one-line banner and a coloured HUD strip (Hill yellow, Potato orange, Survival red). Survival enemies are red-ringed horned foes, never player colours.
- Emotes are eight tiny pixel faces shown above the head for 2 s, cheeky but never insulting; players can hide other people's emotes.
- Special bombs and abilities use the item-icon language: one glyph, one colour per effect, the cooldown ring in the bottom dock.

## Characters and story
- A dysfunctional family of pyromaniacs (the Fuse dynasty). Every relation gets a joke; every fighter has a distinct silhouette, colour and verbal tic.
- Original designs only, no third-party game assets or characters.

## Performance and accessibility as design constraints
- Idle screens do no per-frame work; effects respect reduce motion and the mobile flag.
- Every effect has a calm fallback; colour is never the only cue (player tags, team rings).
