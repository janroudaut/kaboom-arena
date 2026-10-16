# Kaboom Arena (PWA)

Vanilla JS + Canvas in `public/game/` (no build step). A Rails 8 API app only relays online rooms (`app/channels/room_channel.rb`).

## Run and test
- `bin/rails s -b 0.0.0.0` -> http://localhost:3117 (on a phone: use the LAN IP). Solo/local only need a static server on `public/`.
- Tests (no dependencies): `cd public/game && node --test sim.test.mjs ai.test.mjs netcode.test.mjs modes.test.mjs lobby.test.mjs settings.test.mjs haptics.test.mjs`.
- UI and code are in English, no i18n.

## Architecture
- `sim.js` is the only game logic: pure, deterministic, fixed 60 Hz. Solo/local: the browser simulates. Online: the host's browser simulates and broadcasts snapshots (30 Hz); guests only send inputs.
- `input.js`: one "source" per device (kb1 WASD/ZQSD + Space, kb2 arrows + Enter, touch, padN). Solo/online merge all sources; local mode gives one source per player, claimed by pressing its bomb key.
- Graphics are 100% drawn in code (`render.js`), no third-party game assets.
- Optional 3D renderer (`render3d.js`, Three.js r170 vendored in `public/game/vendor`, import map in `index.html`): same game state as the 2D one, loaded on demand. Modes: Classic (2D) / 3D / DLSS 5 (parody: bloom, chromatic aberration, "Neural Faces", dynamic resolution). Every vendored file must be added to `FILES` in `public/sw.js`.
- `input.js` ignores the game keys when a button outside `#game` has focus, so menu buttons stay keyboard-operable; `main.js` wraps `draw` in try/catch so one bad frame never stops the render loop.
- Home screen background is a live bot match (`home.js`), throttled on purpose (CPU is a first-class constraint).
- `cable.yml` uses the `async` adapter: a single Puma process only (never `WEB_CONCURRENCY` > 1), otherwise switch to Solid Cable or Redis.
- `public/sw.js`: hand-written precache list, add every new file to it and bump the cache name. It is network-first (cache is for offline only): stale-while-revalidate served a mix of old and new ES modules and broke inputs.

## Match settings and themes
- `settings.js` (pure, tested in `settings.test.mjs`) holds the match options: bot level, rounds to win, arena layout, theme, power-ups, sudden death, teams, friendly fire. They persist in localStorage (`settings`), apply to solo, local and the online host, and `roundOpts` builds the `newGame` options for every round. Teams are `[0,1,0,1]` and only exist with exactly 4 players.
- Themes are purely visual and live in `look.js` for both renderers (2D palette + a `d3` block for 3D). The host sets `s.cfg.theme` after `newGame`; unknown themes fall back to grass. A new theme needs both blocks.
- `cfg` (theme, teams, layout...) only travels with grid snapshots, so a guest always has it when it first renders. The snapshot wrapper also carries `w` (rounds to win).

## Accessibility, feedback and UX modules
- `look.js` also holds the player palette (standard and colour-blind, Okabe-Ito) and team colours: `palette()` and `teamInfo()` read `view.cb`, which `main.js` sets from `settings.cb`. Any new colour consumer must go through them, no local tables. Colour-blind mode also shows a 1-4 tag above heads and digits in HUD chips.
- `haptics.js` is pure and injectable (tests in `haptics.test.mjs`): phone `navigator.vibrate` and gamepad rumble (`vibrationActuator.playEffect("dual-rumble")`, legacy `hapticActuators` fallback), throttled, gated by the `vibrate`/`rumble`/`intensity` settings. `observe(mem, state)` derives events from successive game states so it works the same for solo, host and guest; in local mode rumble goes to the affected player's pad only.
- `settings.js` also holds `cb`, `reduce` (auto/on/off, see `reduced()`), `vibrate`, `rumble`, `intensity`; fields flagged `a11y: true` render in the "Accessibility & feedback" group. Reduce motion stops 3D camera shake and sparks (`r3.setStill`) and the home attract loop (`home.js` `setStill`); it adds no timers.
- `ux.js`: tutorial overlay (`helpSeen` flag), `beforeinstallprompt` capture plus an iOS "Add to Home Screen" hint, and the "New version available" toast (relies on the service worker's `skipWaiting`/`clients.claim`, so Reload is just `location.reload()`).

## Bots (`ai.js`)
- `dangerMap` gives the time before impact per tile (chain reactions included); escapes are timed (`ticksPerTile`, `MARGIN`) and a bomb is only placed if a strict escape exists. Bots anticipate sudden death (`doomed` in `sim.js`).
- Do not reintroduce "bang-bang" lane re-alignment in the steering: corner sliding in `move` (`sim.js`) handles it.

## Online
- The relay (`RoomChannel`) enforces roles (host = first subscriber), message-type allow-lists, size and rate limits, and connection caps: any new network message must go through those allow-lists. The UI must never put network-received data into `innerHTML` without coercing or escaping it.
- Every relay guard logs one line `kaboom refus=throttle|probe regle=... ip=... chemin=/cable` (`Connection.refuse`), a format parsed by an external log monitor. New refusals go through it; do not change the format casually.
- Known limits: the host can cheat and a host in a background tab freezes the game; a host drop ends the match.

### Netcode (`netcode.js`, tests in `netcode.test.mjs` with a host+guest harness simulating latency, jitter and loss)
- The guest sends its inputs per tick, at most 30 msg/s (`{t:"in", n, d:[codes]}`, nothing when idle). The host replays them through `createInbox` (one input per sim tick; a missing tick repeats the held direction, idle after 12 ticks; `ack` = guest ticks consumed, returned in every snapshot).
- The guest predicts its own player with `movePlayer`/`placeBomb` from `sim.js`: on each snapshot it restarts from the authoritative state and replays unacknowledged inputs; a gap under 24 px is smoothed (decay), larger ones teleport. Other players and bombs are rendered ~100 ms in the past, interpolated between snapshots (clock = host tick, offset = min of arrivals); renderers do no smoothing of their own. A locally placed bomb is a "ghost" until confirmed.
- Compact snapshots (`packSnap`): grid as a string and `cfg` only when changed or every 60 snaps, flames as arrays. RTT: `ping`/`pong` every second (allow-listed in `RoomChannel`), shown at the bottom (`#ping`). Debug: `?lag=120&jitter=40` delays every message in each direction (order preserved).
- Sliding (kicked) bombs are drawn from `sc` (`bombPos` in `look.js`); `createGuestNet.frame` extrapolates `sc` between snapshots.
- Not predicted by the guest: item pickups, kicks/sliding bombs, curse and shield timers (the snapshot corrects them within the 24 px smoothing).
- Limits: item pickups are not predicted (small correction when a guest grabs one); the local player never sees others in the present (100 ms visual delay, collisions decided by the host); a guest with no input for 12 ticks is considered idle.

### Lobby and online UX (`lobby.js`, pure, + `lobby.test.mjs`)
- No dedicated message types. `join` carries `name` (guest); `lobby` = `{slots, names}`. Names go through `cleanName` (<= 12 chars, no control characters) on send AND receive and are shown via `textContent`/canvas (`esc` for the 3D HUD); labels ("Bot N", default colour names) are recomputed everywhere by `displayNames`.
- Invite link: `/?room=ABCD` joins directly (URL cleaned); the QR comes from `vendor/qrcode.mjs` (qrcode-generator, MIT, licence next to it).
- Rematch: only the host chooses (`rematch` in `game`, relayed to guests as `r` in the snapshot); scores reset.
- Guest reconnect (30 s, overlay `#reconn`): same `cid`. ActionCable resubscribes by itself; if the resubscription is rejected (old subscription still registered server-side, duplicate `cid`), `net.js` `retry()` recreates it every second. While away the host drops the inbox (a bot plays) but keeps the slot reserved (`release`/`admit`) for the duration of the match; a `join` from the same `cid` gets it back (new inbox). Outside a match, leaving frees the slot.

## Deployment
- A `Dockerfile` is provided (read-only rootfs, single Puma process, no volume); `deploy.sh` is the author's script for one server behind a shared reverse proxy (it builds the image on the host).
- Production expects `SECRET_KEY_BASE`; allowed hosts and WebSocket origins are set in `config/environments/production.rb`.
