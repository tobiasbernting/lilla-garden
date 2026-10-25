# Lilla Gården — design

Agreed design (2026-10-24). A 2D pixel top-down farm game in Swedish for one parent and two kids (7 and 9), playable on an Android tablet (Chrome) and a computer, co-op over the home network.

## Stack
- pnpm monorepo: `packages/shared` (types, item/crop/recipe data, sim, Swedish strings), `packages/server` (Node, `ws`, authoritative 20 Hz tick, Postgres via Drizzle), `packages/client` (Phaser 3 + Vite, PWA, 320×180 virtual resolution integer-scaled, landscape only).
- Code and identifiers in English; every player-facing string in `packages/shared/src/sv.ts`.
- Vitest on `shared` sim logic.
- Dev: `compose.yaml` runs Postgres 17 on port 5435; `pnpm dev` runs server + client; tablet connects to the computer's LAN IP.

## Co-op
- One persistent shared world. Each player on their own device.
- Character picker ("Vem är du?"), no passwords, max 8 characters, device remembers last pick.
- Emote wheel (hjärta, skratt, hej, hjälp, titta, sova); names over heads. No text chat.

## World
- Handmade 64×64 tile map: farmhouse (brevlåda = Katalog, garderob, kista, arbetsbänk, säljlåda), open fields, forest edge (trees/rocks/grass regrow after a few days), pond.
- Day = 10 real minutes, auto rollover, no forced sleep, world frozen when nobody is online.
- Gentle rules: nothing dies, no stamina, tools never break, anyone can break anything.

## Farming
- Tools: hacka, vattenkanna (20 charges, refill at pond/brunn), yxa, spett, lie, hammare, borste.
- Crops: morot, potatis, jordgubbe, tomat, pumpa, solros, vete. Watering makes them grow at day rollover; harvest returns seeds.

## Animals
- höna, får, ko, kanin. Named on arrival, 0–5 hearts from feeding (hö), petting, brushing. Products (ägg, ull, mjölk) when happy. Babies grow in 3 days.
- Bought from the Katalog but require the matching built house (hönshus, kaninbur, fårhus, lada); arrive next morning ("En ny vän har flyttat in!").

## Building & crafting
- trä/sten/fiber from trees/rocks/grass → recipes at arbetsbänk: staket, grind, stigar, väggar, golv, dörr, kista, matho, fackla, fågelskrämma, bänk, bord, blomlåda, brunn, djurhus.
- Free grid placement anywhere except water.

## Economy
- Per-player kr, start 150. Säljlåda sells instantly. Katalog tabs: Frön, Djur, Foder, Material, Kläder, Säsong.

## Clothes
- Layered tintable character (hair, shirt, pants, shoes, hat). Bought clothes go to the Garderob.

## Seasons (real calendar, Europe/Stockholm)
- Halloween 24 okt–1 nov, Jul 1 dec–6 jan, Påsk palmsöndag–annandag påsk, Midsommar the week up to midsummer day.
- Each: a Säsong tab with clothes + decorations, map dressing, one twist (wild pumpkins; animals in tomteluvor + snow; påskägg; flowers everywhere).
- `SEASON_OVERRIDE` env and `/admin` parent page (force season, online players, save now, skip day).

## Inventory & controls
- 8 hotbar + 24 backpack, stacks of 99, kista 32 slots.
- Touch: virtual joystick + context action button. Desktop: WASD/arrows + E/space, mouse click acts on a tile.

## Art
- Kenney CC0 Roguelike packs (RPG, Characters, Indoors) for terrain, trees, fences, walls, furniture. Code-generated pixel art for characters, animals, crops and item icons.

## Deploy
1. Local play first.
2. Public GitHub repo `tobiasbernting/lilla-garden`, GitHub Actions builds the image → GHCR.
3. Homelab PR (`~/repos/homelab/server`): `roles/postgres` (postgres:17, DB + user per project, vault creds, nightly `pg_dumpall`, 14 days kept) and `roles/lilla-garden` at `garden.moderskepp.lan`, following the meal-planner role pattern.

## Later
NPCs, in-game seasons, ownership locks, processing machines, more areas.

## v2: 3D (2026-10-25)
A Minecraft-looking version of the same game, deployed separately (`lilla-garden-v2` image, e.g. `gard2.moderskepp.lan`).
- Same server, sim and protocol; only the client is new (`packages/client3d`, Three.js). The world stays a 2D tile grid: the client builds a voxel world from it (1 tile = 1 block), so every rule, quest and save works unchanged.
- Blocks: procedurally painted 16×16 textures, face culling, smooth ambient occlusion, Minecraft-style sky and block light (torches, lamps, furnaces), chunked meshes rebuilt on change. Trees, rocks, walls (3 high) and buildings are stamped as blocks; smaller things are box models; crops, flowers and anything without a model use the 2D pixel art as crossed sprites.
- Characters use the standard 64×64 skin layout, generated from appearance and outfit; animals, monsters and vehicles are box rigs with walk cycles.
- First person by default (F5 cycles to third person), crosshair targeting with the 2D game's reach, visual-only jumping. HUD, menus, minimap and sounds are the 2D client's.
- Kid-friendly tweaks: nights are dimmer than day but never black, and a soft light follows the player.

