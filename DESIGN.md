# Lilla Gården — design

Agreed design (2026-10-24). A 2D pixel top-down farm game in Swedish for one parent and two kids (7 and 9), playable on an Android tablet (Chrome) and a computer, co-op over the home network.

## Stack
- pnpm monorepo: `packages/shared` (types, item/crop/recipe data, sim, Swedish strings), `packages/server` (Node, `ws`, authoritative 20 Hz tick, Postgres via Drizzle), `packages/client` (Phaser 3 + Vite, PWA, 320×180 virtual resolution integer-scaled, landscape only). Since 2026-10-29 the 2D game is drawn by `packages/clientljs` (LittleJS, see below); the Phaser client stays as a fallback and as the home of the shared HUD, menus and art.
- Code and identifiers in English; every player-facing string in `packages/shared/src/sv.ts`.
- Vitest on `shared` sim logic.
- Dev: `compose.yaml` runs Postgres 17 on port 5435; `pnpm dev` runs server + client; tablet connects to the computer's LAN IP.

## Co-op
- One persistent shared world. Each player on their own device.
- Character picker ("Vem är du?"), no passwords, max 8 characters, device remembers last pick.
- Emote wheel (hjärta, skratt, hej, hjälp, titta, sova); names over heads.
- 2D (2026-10-29): text chat to everyone in the world (80 characters, ready-made phrases, bubble over the head, last 20 lines for whoever logs in; not saved).

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

- Voxel world (`WORLD_MODE=voxel`, v2 only): the shared sim keeps a block layer per map (`WorldState.voxel`: a height per tile from value noise, plus a sparse map of dug/placed blocks; everything else is derived: dirt, stone, caves, ores, bedrock, 48 blocks tall). The farmyard, buildings, water and the exits to neighbouring maps stay at ground level; hills grow away from them and mountains rise at the edges. The tile grid stays the source of truth for everything else: the top block of a column is reflected in `terrain` (dug earth reads as `dirt`, bare rock as `stone`), so farming, saves and the 2D client keep working.
- Players carry a height (`z`): shared step/gravity/jump physics runs on the client and the server checks each move against the blocks. Animals and villagers stay on the surface and treat steep steps as walls.
- Dig/place messages: anything digs soft blocks, the pickaxe digs stone and ore (coal, gold, gems). Dirt, sand, gravel, cobblestone (from stone) and planks (from wood) can be placed. Nothing is dug from under trees, buildings or crops.
- Forests in voxel worlds are thinned so you can walk through them, with mixed oak, birch, dark oak, cherry, spruce and redwood.

## 2D additions (2026-10-29)
Only the 2D client shows these; the 3D client never sends the new messages and the weather is off in `WORLD_MODE=voxel`.
- Pets and horses: "Stanna!" makes your pets and horses on your map potter around where they are (they are left behind when you change map); "Vissla" calls them back, fetching pets from any map (not into the cave). A whistled horse follows you around the farm like a pet until told to stay.
- Villager conversations: a "Prata!" button in the villager window opens a dialogue tree (`shared/src/dialogue.ts`): each villager has their own stories, a question for the player and opinions on the weather; jokes, riddles, "how are you" and the weather are shared. Elsa plays sten, sax, påse. Client-side only.
- Weather (`shared/src/weather.ts`): one sky for the world, not saved. Kinds drift in a weighted random pattern (sun, cloudy, rain, storm, snow, hail, wind, fog), 0.5–7 real minutes each; snow is likely in winter months and rare in summer. Ice areas get snow instead of rain, the desert only wind. Rain waters every field after a few seconds; after 25 s of snow the ground turns white; sun after rain gives a rainbow. Toasts announce changes; `/admin` can pick the weather.

## 2D client: LittleJS (2026-10-29)
Started as a side-by-side prototype (image `lilla-garden-ljs`, its own `gard-ljs` farm) and became the default the same day: the main image `lilla-garden` ships it, against the same server and saves, so existing farms carry on unchanged. The Phaser client is still built as `lilla-garden-phaser` to switch back to.
- Same server, sim, protocol, HUD, menus, sounds and generated pixel art (the 2D client's modules via `@v1/*`); only the view is new. Same prediction, interpolation and edge travel as the Phaser scene.
- The generated canvases are packed into one or two texture sheets at boot (LittleJS starts a new WebGL batch on every texture change), and the y-sorted world is written straight into LittleJS's batch with `glDraw`.
- Drawn at screen resolution with a whole-number zoom (quarter steps in HD), so sprites can turn, lean and squash without losing crisp pixels; the HUD keeps its 320×180 grid, anchored to the window's edges like v2.
- Light: LittleJS's light system multiplies the scene by a light map: the ambient colour follows the time of day, weather and season, and point lights come from lamps, torches, stoves, houses, lanterns carried by players, headlights and explosions. Lit windows (the glass pixels of buildings recoloured), fireflies and lightning are drawn after the light map, so they shine by themselves. Indoors the outside is blacked out, as in the Phaser client.
- Sun shadows are the sprites' silhouettes sheared along the ground away from the sun (falling west in the morning, behind things at noon, east in the evening), drawn in slices since WebGL quads can't shear, under everything that stands.
- Cozy extras, each switchable with `?fx=…` for comparing (all on by default): seasons in the trees by the real calendar (autumn colours and falling leaves, snow on the branches with snow on the ground, blossom in spring); light falling out of lit windows, painted straight into the light map; chimney smoke; indoors a closer camera, sunbeams with dust and a fade in and out; butterflies and sparrows; lily pads, jumping fish and the night sky mirrored in the pond; dawn mist and dew; wet ground and puddles in the rain; a post-process glow, vignette and warm grade, and a tilt-shift blur; and synthesized ambient sounds (crickets, owl, birdsong, fire crackle, rain on the roof indoors).
- Safety nets for screens we haven't tried: without WebGL 2 the player gets a message instead of an empty world, and when the frame rate stays under 45 the glow/tilt-shift pass turns itself off.

## The wider world (2026-10-29)
More biomes, caves with treasure, and the moon; the farm and everything the family built stay as they are.
- 15 kinds of place. `biomeAt` keeps every city exactly where it was; a ring of fixed biomes around the farm (forest north, swamp west, meadow south, mushroom forest north-east, dinosaur valley south-east, mountains past the city, beach, ice, desert, jungle and volcano two maps out, the space base at 1,3) puts something new next door; further out the north is cold, the south hot (desert, jungle to the west, volcanoes to the east), the sea west and the mountains east, with Godislandet rare and at least five maps away.
- Each biome has a painter (`shared/src/painters.ts`) on a shared toolkit (`worldgen.ts`: value noise, blobs, scattering, cave hills): ground, water, cliffs (`rock`, `sandstone`, `basalt` — impassable terrain with faces drawn towards open ground), lava, bog, chocolate rivers, then landmarks, plants and finds. Last, `connect()` clears the four openings, lays trails to the middle where they suit the biome (boardwalks in the swamp, dirt paths in the forest and jungle) and carves the cheapest way (bridges over water, passes through cliffs) to every opening, cave mouth and chest that would otherwise be cut off. Tests walk every biome to check that everything can be reached.
- Caves out in the world (`caves.ts`) are areas keyed `g:<map>#<entrance id>`, generated from their entrance the first time anyone goes in and saved like any other map: a cellular-automaton cavern in the biome's theme (11 themes: roots, ice, crystals, pirates, pyramid, temple, lava, mushrooms, fossils, candy, space), torches in the built ones, crystals, ore and finds by the walls, a pool, a loot chest at the far end and sometimes a secret room behind rubble (break it with the pickaxe). No monsters: the farm's own cave is for fighting.
- Loot tables (`LOOT` in data.ts) for cave chests, the shipwreck and UFO chests, dig spots (an X in the sand, dug with the hoe, loot by biome), fossil rocks and fairy rings (once a day each). A loot chest gives every player something once a week (`openedBy`); clients draw it open for whoever emptied it. Clothes in a chest go to the wardrobe (a gem if you already have them).
- Regrowth: a map remembers how many renewable things it had (`renew`); each morning a quarter of what was picked, mined or dug up grows back (never in openings, in front of entrances, under people or where it would block a passage).
- The space base has a rocket to the moon (`space.ts`): a disc of moon dust floating among the stars with craters, moon rocks, star crystals, moon cheese, aliens, a crashed UFO with a chest, a cave, a Swedish flag and the Earth in the sky. The rocket flies back. The 2D clients play a launch cutscene and let everyone bounce on the moon.
- New wild animals for the new biomes (frog, parrot, monkey, salamander, hedgehog, dino, gummy bear, alien; some in several colours), all tameable with the lasso. A dragon egg (a rare lava-cave find) hatches overnight into a pet dragon for whoever put it down.
- Discovering a new kind of place gives a star; new achievements for biomes, caves, chests, dig spots, fossils, the moon and the dragon; villagers ask for things from the wild; a help page about adventures.
- Saved maps: on load, explored maps from before (no `gen`) that nobody changed (nothing built, farmed, dropped, tamed or dug) are rebuilt with today's generator, and anyone standing in one is moved to open ground; changed ones are kept, get a cave in a still-wild spot and regrowth of their biome's finds. Cities are never touched. The welcome message carries the biome of every explored map, so the world map shows them all.
- 2D clients: caves are drawn like the farm's cave (dark, rock all around); lava, crystals and glowing mushrooms light up the dark; the moon has its own dim, starry light and no weather; each place has a quiet soundscape (frogs, parrots and cicadas, bubbling lava, surf, fairy chimes, a music box, cave drips, the hum of space).
