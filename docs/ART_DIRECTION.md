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
- The **DLSS 5 mode is the one place for excess**: bloom, glossy faces, fake AI notifications. It is a joke the game is in on, and it never changes gameplay.
- Parody of real brands (the DLSS/RTX mode) is text only: no logos, no brand colours or trade dress, and a visible "parody, not affiliated" note in the README and in the mode's own menu. Heavy visual extras (reflections, light shafts) are desktop-only and switch off when the dynamic resolution drops or reduce motion is on.
- One pixel font (Press Start 2P, vendored) for the whole UI chrome: buttons, labels, titles, banners and story screens. Long paragraphs (help, bios) keep the system font for readability.

## Sound (planned)
- Synthesised chiptune, no audio files. Soundtrack follows the theme (grass: arcade, snow: bells, desert: eastern scales, lava: heavy riffs, night: synthwave) with a character motif on top in story mode; selectable in settings, "Auto" by default.
- Silent until the first user gesture, suspended when paused or hidden. Voice announcer is optional and off by default.

## Characters and story
- A dysfunctional family of pyromaniacs (the Fuse dynasty). Every relation gets a joke; every fighter has a distinct silhouette, colour and verbal tic.
- Original designs only, no third-party game assets or characters.

## Performance and accessibility as design constraints
- Idle screens do no per-frame work; effects respect reduce motion and the mobile flag.
- Every effect has a calm fallback; colour is never the only cue (player tags, team rings).
