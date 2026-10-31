# Handoff: from web game to native Norse roguelite

Status: discussion only, no code changed. This file records the decisions and open questions from the planning conversation (2026-10-31) so a new session or person can pick it up.

## Where the project is today
- Lilla Gården: a Swedish family farm game, web-based. See `README.md` and `DESIGN.md`.
- Stack: pnpm monorepo with `packages/shared` (types, data, sim, Swedish strings), `packages/server` (Node, `ws`, 20 Hz authoritative tick, Postgres/Drizzle), `packages/client` (shared HUD, menus, networking, art), `packages/clientljs` (LittleJS renderer, the only client), `packages/arcade` (minigames).
- Deployed on the home network at `garden.moderskepp.lan` (homelab repo, `roles/lilla-garden`).
- Input today: touch, keyboard and mouse. No gamepad support.

## What was asked
1. Can it run on Switch, Xbox or PlayStation?
2. Can it be a PC/Mac/Linux game for a Raspberry Pi (not a browser game)?
3. Final goal: performance and future enhancements. Remove the minigames. Focus on a roguelite, WoW-style Norse mythology game built on the existing saga. Make the open world more alive with new graphics. A lower-end PC must run it; Raspberry Pi 5 is not required.

## Conclusions so far
- **Consoles:** an official release needs developer-program approval, SDKs under NDA, dev kits, certification and a public server, and in practice an engine rewrite. Not worth it for a private family game. Xbox can run the current web game through its Edge browser (needs gamepad support). PlayStation and Switch have no supported route.
- **Desktop and Pi:** a web-to-desktop wrapper (Electron, Tauri, or Chromium kiosk) is the cheap option. It was set aside because the goal is now performance and a bigger game.
- **Recommended direction:** native rewrite of the client in **Godot 4** (free, light, builds for Windows, macOS and Linux incl. ARM64). Unity and Unreal were considered and rejected as heavier or less stable on licensing. Rust/Bevy or C++ gives the most control but costs the most work.
- **Art direction:** stylized, not realistic. HD-2D (3D world with sprite characters) is the cheapest way to look good and keeps the current character and art pipeline useful. Low-poly 3D with painterly textures is the alternative. Livelier world means animated foliage, weather, day/night lighting, wildlife, water and particles.

## What to keep and what to replace
- **Keep:** story and saga content (ten chapters, nine dungeons, two giant monsters), classes (Väktare, Helare, Krigare, Magiker), item rarity and slot rules, the boss telegraph design, the Swedish strings in `packages/shared/src/sv.ts`, the Node server, and the WebSocket protocol.
- **Replace:** rendering, HUD and menus (`packages/client`, `packages/clientljs`).
- **Remove:** `packages/arcade` and the minigame entry points (Rallyt, Snöbollskriget, Minigolfen, Hönan Hilda, Dansbanan, Stjärnstorm, Spelhallen, Rallyvärlden and its garage, TV in the stuga).
- **Rethink:** how the farm, the saga and a roguelite loop (randomized runs, permanent upgrades between runs) fit together. This is undecided.

## Open questions for the owner
- Co-op for the whole family, or more solo with optional co-op?
- Keep farming and building, or make it a pure adventure game?
- Who makes the art: made by hand, bought, or generated?
- Which PCs are the baseline (CPU, GPU, RAM)?
- Does the server stay on the home network, or does it need to be public?

## Suggested plan
1. Write a design doc for the new game: core loop, role of the farm, how runs work, art style, target hardware.
2. Remove the minigames from the current game (`packages/arcade` and references) to shrink the codebase before the rewrite.
3. Build a small Godot prototype: one zone, one class, movement, combat, and networking against the existing server and protocol.
4. Port saga chapters and dungeons one at a time.
5. Add the alive-world polish: weather, lighting, wildlife, particles.
6. Optional meanwhile: add gamepad support to the current web client.

## Notes
- The existing client keeps working while the new one is built, since the server protocol is unchanged (new messages are additive, as in DESIGN.md).
- Console and Pi claims in the conversation were from general knowledge, not verified against current platform policies. Check before relying on them.
