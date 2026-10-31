# Lilla Gården — design

Agreed design (2026-10-24). A 2D pixel top-down farm game in Swedish for one parent and two kids (7 and 9), playable on an Android tablet (Chrome) and a computer, co-op over the home network.

## Stack
- pnpm monorepo: `packages/shared` (types, item/crop/recipe data, sim, Swedish strings), `packages/server` (Node, `ws`, authoritative 20 Hz tick, Postgres via Drizzle), `packages/client` (Phaser 3 + Vite, PWA, 320×180 virtual resolution integer-scaled, landscape only). Since 2026-10-29 the game is drawn by `packages/clientljs` (LittleJS, see below); since 2026-10-30 it is the only client (the Phaser view and the 3D version are gone) and `packages/client` is just the home of the shared HUD, menus, networking and art.
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

## v2: 3D (2026-10-25, retired 2026-10-30)
A Minecraft-looking version of the same game (`packages/client3d`, Three.js, deployed as `lilla-garden-v2` at `gard2`), with a block layer in the shared sim (`WORLD_MODE=voxel`) to dig and build in. Retired on 2026-10-30 to keep one game: the client, the block layer, the dig/place messages and the `WORLD_MODE` switch were removed; the last `lilla-garden-v2` image stays in the registry.

## 2D additions (2026-10-29)
- Pets and horses: "Stanna!" makes your pets and horses on your map potter around where they are (they are left behind when you change map); "Vissla" calls them back, fetching pets from any map (not into the cave). A whistled horse follows you around the farm like a pet until told to stay.
- Villager conversations: a "Prata!" button in the villager window opens a dialogue tree (`shared/src/dialogue.ts`): each villager has their own stories, a question for the player and opinions on the weather; jokes, riddles, "how are you" and the weather are shared. Elsa plays sten, sax, påse. Client-side only.
- Weather (`shared/src/weather.ts`): one sky for the world, not saved. Kinds drift in a weighted random pattern (sun, cloudy, rain, storm, snow, hail, wind, fog), 0.5–7 real minutes each; snow is likely in winter months and rare in summer. Ice areas get snow instead of rain, the desert only wind. Rain waters every field after a few seconds; after 25 s of snow the ground turns white; sun after rain gives a rainbow. Toasts announce changes; `/admin` can pick the weather.

## 2D client: LittleJS (2026-10-29)
Started as a side-by-side prototype (image `lilla-garden-ljs`, its own `gard-ljs` farm) and became the default the same day: the main image `lilla-garden` ships it, against the same server and saves, so existing farms carry on unchanged. The Phaser client was kept as `lilla-garden-phaser` for a day; it and the `gard-ljs` trial farm were retired on 2026-10-30.
- Same server, sim, protocol, HUD, menus, sounds and generated pixel art (the 2D client's modules via `@v1/*`); only the view is new. Same prediction, interpolation and edge travel as the Phaser scene.
- The generated canvases are packed into one or two texture sheets at boot (LittleJS starts a new WebGL batch on every texture change), and the y-sorted world is written straight into LittleJS's batch with `glDraw`.
- Drawn at screen resolution with a whole-number zoom, so sprites can turn, lean and squash without losing crisp pixels; the HUD keeps its 320×180 grid, anchored to the window's edges like v2.
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

## Minigames (2026-10-30)
Six minigames, each in its own style, played on the TV at home or on the machines in Spelhallen.
- `packages/arcade`: the shell (`openArcade`) draws a full-screen overlay over the farm game: the TV's game list (games not found yet are shown locked), a title card per game (how to play for keys or touch, the family's top five), pause (Escape, the pause button, a hidden tab), and the result card (records, tickets). While it is open it takes every key before the farm game sees it and stops the farm's taps; the clients also stop drawing the world and hush its sounds. One controller (`input.ts`) merges the keyboard, gamepads and on-screen touch buttons (a d-pad, two arrows or a stick, and up to three buttons, per game).
- A game is a module under `src/games/<id>/` whose default export takes a `GameContext` (its root element, the controller, an audio output the shell mutes, the player's name and colour, touch and quality hints) and returns pause/resume/destroy; it plays one run and calls `end(score, detail)`. Games are loaded with `import()` only when played, so Three.js and the games stay out of the farm game's first download. The games: Rallyt (3D racing round the countryside), Snöbollskriget (first-person snowball fight against snowmen), Minigolfen (3D crazy golf on the farm), Hönan Hilda (a platformer on a four-green handheld screen), Dansbanan (a rhythm game in a neon dance pavilion, music made in code), Stjärnstorm (a vector-glow space shooter).
- Scores are 0–99 999 (a good run about 10 000). The server keeps each player's best per game; the score board and the title cards show the family's best. A score counts only after the TV or the machine has been on for 5 s (`MIN_GAME_MS`) and, on a machine, only for its own game; beating someone else's family record is announced to everyone.
- Spelhallen (`hall.ts`) stands in every city next to the bath house; its inside (`arcade:<city>`) is an indoor map like the bath house (same room, `isIndoorKey`), rebuilt from its plan on every start: carpet, neon, a machine per game, the score board, the prize counter, a disco ball. Machines give tickets, one per 500 points, 1–40 a game and at most 300 a day per player. The prize counter swaps tickets for plushies, lamps, a trophy, a disco ball, a neon sign, a TV, sweets, and the TV games.
- The TV comes with Hönan Hilda and Minigolfen; the other four are found in cave chests (Rallyt in the root caves, Snöbollskriget in ice caves, Dansbanan in crystal and candy caves, Stjärnstorm in space caves and the UFO) or won at the prize counter. A found game goes onto every TV in the family (`familyGames`: the starters plus every player's `arcade.games`); a spare cartridge gives 20 tickets.
- Saved worlds: cities get Spelhallen and the farmhouse a TV on load (`ensureArcadeHall`, `ensureTv`, where there is room).

## Access control (2026-10-29)
Sharing the world beyond the family. Default on; `ACCESS=open` restores the old open LAN behaviour.
- Device-based: an approved device holds a long random token in an `HttpOnly`, `SameSite=Strict` cookie (only its sha256 is stored, in `devices`). Everything but the gate pages (`/access`, `/join`, `/admin/login`, `/health`, the app manifest and icons) requires an approved device that may play right now.
- Join codes (2026-10-30, replacing one-time links): `invites` rows hold a hashed 8-character code (32-symbol alphabet without 0/O/1/I/L, 40 bits), a label, kind, device limit (1–5), expiry (≤30 days) and approval: `auto` (approved at once, the parent gets a push) or `parent` (a pending device with a 6-digit number for the parent to approve). Typed on `/access`/`/join` or carried in a link's fragment. "Öppna igen" makes a one-device code bound to an existing device that swaps its key instead of creating a device. Wrong codes: 10 per IP per 15 min, 100 per hour overall. Kinds: family (all characters) and guest (only characters it created or was given; creates 0–3).
- `ADMIN_PORT` splits the parent page onto its own listener, meant for a Tailscale address; the public listener 404s `/admin`. `NTFY_URL` pushes gate events (JSON publish to the ntfy server root).
- Rules: mode closed / family only / family + guests, play hours in Europe/Stockholm, pause/remove per device. The server re-checks open sockets on every change and every 15 s and closes them with code 4003; the clients then go to `/access`.
- Parents: `PARENT_PASSWORD` (scrypt-compared), optional TOTP stored in `settings`, in-memory 8 h sessions, per-IP and global rate limits. Gate events go to `access_log`.
- Sharing it publicly is meant to happen through a tunnel/proxy (`PUBLIC_URL`, `TRUST_PROXY=1`), not by opening ports.

## Rallyvärlden (2026-10-30)
The rally minigame grows into a part of the game: a garage on the farm, cars to buy, tune and style, races with the family on five courses, damage mended for kr, and a 3D free roam. What other racers do well and fits a family game went in: steering assist for the little ones, drift boost (a held slide charges a mini-turbo), instant respawn, a gentle rubber band, medals and a ghost (Trackmania), boost pads and mud as the only pickups (Mario Kart), underglow and liveries (Need for Speed), an animal in the driver's seat, damage as spectacle with a small bill (Burnout), one currency, never a zero payout, no fail states.
- `shared/src/rally.ts` is the contract: bodies (`hatch` free, `buggy`, `pickup`, `coupe`, `monster`; power/grip/tough/size), six parts with three levels (`PART_PRICES`, `PART_EFFECTS`), the `CarStyle` (paint, paint2, finish, livery, decals in four slots, number, wheels, rim colour, spoiler, extras, horn, underglow, driver, smoke colour, plate) with `STYLE_PRICES`, `GarageCar`/`GarageState` on `PlayerState.garage` (up to six cars, the active one, best times per `course:laps`, today's roam coins), `RaceRules` (`cleanRules` makes anything a client sent valid), the money formulas (`racePrize` by place/laps/difficulty/damage/field/course, a practice prize alone on the track, `RACE_DNF_PRIZE`, `repairCost` capped at 400 kr, `DAMAGE_HEAL_PER_DAY`, roam coins at 2 kr with a daily cap), medals (`raceMedal` from each course's gold time), and the room/snapshot/result shapes relayed online.
- `shared/src/rallysim.ts`: `garageOf` hands out the free starter car in the player's shirt colour; `garageAction` buys, selects, upgrades, restyles (charging only the fields that changed, decals and extras as whole sets, the whole patch refused when too poor), repairs, renames and sells (never the last car); `raceSolo`/`raceOnlineResult`/`roamDone` book prizes, damage (only when the rules had it on), best times, medals, stats and achievements; `healCars` runs at `newDay`; `ensureGarage` puts the `rally_garage` building (3×2, acts like the TV: `open` → `ui:'rally'`) east of the farmhouse on open ground, around whatever a saved farm has there, keeping everything reachable. Vitest covers all of it.
- Server `races.ts`: rooms live in memory. A player makes a room with rules (6 humans at most, 8 cars with the AI), others join from the lobby list, ready up, the host starts: `go` with `startAt` (server clock) and a `seed`. Car snapshots (`CarSnap`, 12 Hz, rate-limited and rebuilt field by field) are relayed to the other members; only the host may send the `ai:<n>` cars. Snapshots flow from the countdown on, so the grid is full at the green light. Finish times are checked against the server's clock (none before `minRaceMs`, 60 % of the gold time; the client's time kept within 5 s before and 1 s after the server's); the host also reports its `ai:<n>` cars crossing the line, and they take places in the result (never paid). When every human is done, or a grace after the first (45 s, longer on long races), or on a hard timeout, the shared result books prizes and the `result` goes out; a leaver mid-race is booked as not finished, one who left during the countdown or the first `minRaceMs` not at all. A closed connection keeps its room and roam place for 10 s (`RACE_GRACE_MS`). Free roam keeps a set of drivers and relays their snapshots and a peers list. Solo results are paid straight from `raceSolo` (the car count from the rules, a time under `minRaceMs` is not finished; guarded against replays faster than the race itself, with a toast when one is refused). A client's damage report only ever adds dents.
- The game (`packages/arcade/src/games/rally`): `RallyOptions` through the arcade shell's `options` carries mode (race, time trial, roam), rules, the car, the room and a `RallyNet`. `courses.ts` holds the five circuits (the farm unchanged) with their themes; `track.ts`, `terrain.ts`, `road.ts`, `sky.ts` and `layout.ts` take a course; `props.ts` has the pines, palms, huts, lighthouse, street lamps, neon, blocks, tunnel, snow and rain. `tuning.ts` turns body and parts into car numbers; grip per surface (asphalt 1.2, gravel 0.86, sand 0.8, snow 0.55, ice 0.4, rain ×0.85). Damage slows the car (−35 % power at 100), loses a little grip, pulls above 70, smokes above 60; the model dents, dirties, cracks a window and loses its spoiler (`models.ts` `setDamage`). Nitro burns the turbo part's charges; a held slide charges a three-tier drift boost and earns style points. `pickups.ts` seeds boost pads and mud from the room seed. `remote.ts` draws the other racers 100 ms behind from their snapshots with name tags; the host simulates the AI for everyone. `roam.ts`: coins, hay-bale ramps scored on airtime, drift zones, smashable bales, other drivers, no walls but stone and rails. `style.ts` paints liveries, stickers, the plate and the damage layer onto one canvas per car; `preview.ts` is the garage's turntable (`loadRallyPreview()` keeps Three.js out of the first download).
- The window (`client/src/ui/rally.ts`): tabs Garaget (cars, parts, shop, repair, rename, sell), Stil (live 3D preview, changes priced and sent together on Spara), Tävla (solo rules, time trial, the online lobby and room), Åk fritt and Topplista (the family's best times and medals). It launches the arcade shell with `where: 'rally'` (no title card, no restart online, the prize on the result card) and bridges the server's `race`/`roam` messages to the game's `RallyNet`.
