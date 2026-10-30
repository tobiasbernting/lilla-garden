# Lilla Gården

Ett litet bondgårdsspel på svenska för hela familjen. Odla, ta hand om djur, snickra och bygg – tillsammans på samma gård från surfplatta och dator.

See [DESIGN.md](DESIGN.md) for the agreed design.

## What you can do

- Odla sju grödor, vattna, skörda, sälj i säljlådan eller laga mat på spisen.
- Hugg trä, knacka sten och snickra staket, stigar, väggar, kistor, möbler och djurhus.
- Skaffa höns, kaniner, får och kor (de behöver hus) samt hund och katt som följer med dig.
- Gå in i huset och möblera det. Lampor och spisen lyser på kvällen.
- Prata med Tant Greta och Fiskar-Sven – nya önskningar varje dag ger kr och stjärnor.
- Fiska i dammen med fiskespöet du får av Sven.
- Byt kläder i garderoben. Halloween, jul, påsk och midsommar följer kalendern.
- Allt tillsammans med upp till åtta spelare på samma gård. Inget dör, inget går sönder.
- 2D: chatta med alla som spelar (Enter/T eller 💬, färdiga ord för den som inte vill skriva).
- 2D: säg åt hund, katt och häst att stanna (✋, X) och vissla så kommer de igen (🎵, V) – även från en annan karta.
- 2D: prata med alla bybor (Prata! i bybons fönster): frågor, berättelser, skämt, gåtor och sten, sax, påse med Elsa.
- 2D: väder som skiftar av sig självt – sol, moln, regn, åska, snö, hagel, blåst och dimma. Regnet vattnar åkrarna,
  snön gör marken vit och efter regn kan det bli regnbåge. Föräldrasidan kan välja väder.
- Utforska en oändlig värld med 15 sorters platser: skog, äng, berg med klippor, isvidder, strand, öken, träsk med
  spänger och irrbloss, djungel med tempel, vulkaner med lava, svampskog med älvringar, Dinodalen med fossil,
  städer, Rymdbasen – och långt borta Godislandet. Varje ny sorts plats ger en stjärna.
- Grottor överallt (kristallgrottor, isgrottor, sjörövargrottor, pyramider, tempel, lavagrottor…) med en skattkista
  för varje spelare varje vecka, ett hemligt rum bakom rasade stenar och kristaller och guld som växer tillbaka.
- Gräv upp skatter där det är ett kryss, dansa i älvringar, fånga dinosaurier och gelébjörnar med lasso, kläck ett
  drakägg – och åk raket till månen (månost, stjärnkristaller, rymdvarelser och ett kraschat ufo).
- Gör souvenirer av fynden: kristallampa, svamplampa och ett dinosaurieskelett. Nya kläder finns i skattkistorna.
- Minispel på TV:n i stugan och i Spelhallen i varje stad: Rallyt (3D-racing), Snöbollskriget (3D-skjutspel med
  snöbollar), Minigolfen (3D), Hönan Hilda (plattformsspel i gammal grön handkonsol-stil), Dansbanan (rytmspel i
  neondisco) och Stjärnstorm (rymdskjutspel i glödande vektorgrafik). Familjens topplista per spel; i Spelhallen
  vinner man biljetter att byta mot gosedjur, lampor, pokaler och nya TV-spel. Fler spelkassetter finns i grottornas
  skattkistor och i ufot på månen.

## Develop

```bash
pnpm install
pnpm db:up          # Postgres 17 in a container on port 5435
cp .env.example .env
pnpm dev            # server on :8080, the game on :5173, also on your LAN IP
```

Open `http://<your-computer-ip>:5173` on the tablet. The parent page is at `/admin`
(force a season, save, skip to the next day, make it evening/morning).

Without `DATABASE_URL` the server runs in memory and saves nothing – handy for a quick look,
useless for a real farm.

## Production

```bash
pnpm build                     # server bundle + client PWA
DATABASE_URL=postgres://… node packages/server/dist/main.js   # serves the game (the LittleJS client) on :8080
```

Or use the container image built by GitHub Actions: `ghcr.io/tobiasbernting/lilla-garden:latest`.
It needs `DATABASE_URL` and listens on 8080. Migrations run on boot.

(The 3D version, the Phaser client and the `gard-ljs` trial farm were retired on 2026-10-30; their last images
stay in the registry as they were.)

Environment:

| Variable          | Meaning                                                   |
| ----------------- | --------------------------------------------------------- |
| `DATABASE_URL`    | Postgres connection string (required for persistence)     |
| `PORT`            | HTTP/WebSocket port, default 8080                         |
| `SEASON_OVERRIDE` | `halloween`, `jul`, `pask`, `midsommar` or `none`         |

## Layout

- `packages/shared` – game data, world simulation, Swedish strings (no I/O). Vitest covers the sim.
- `packages/server` – WebSocket game server (20 Hz), Postgres via Drizzle, `/api/players`, `/admin`, `/health`
- `packages/clientljs` – the game, drawn with [LittleJS](https://github.com/KilledByAPixel/LittleJS): light and
  shadow, animation and the cozy extras (see below). PWA, landscape. Its HUD, menus, networking, sounds and pixel art
  come from `packages/client` (the `@v1/*` alias); the view is its own.
- `packages/client` – the HTML menus, HUD, networking, client state, sounds and the pixel art generated in code
  (once the Phaser client; that view is gone, the shared parts stay here)
- `packages/arcade` – the minigames and the overlay they run in (title card, pause, results, one controller for
  keyboard, gamepad and touch). Each game is loaded only when played. `pnpm --filter @lilla-garden/arcade lab`
  opens a lab page that plays any game without the server (`?play=rally`, `?game=golf`, `?tv`, `&touch=1`).

## Controls

- Dator: WASD/piltangenter, `E`/mellanslag för att använda, klick på en ruta, `1–8` väljer verktyg, `Q` ryggsäck, `F` emotes, `H` hjälp, `Enter`/`T` chatt, `X` husdjuren stannar, `V` vissla, `Esc` stänger.
- Surfplatta: styrspak till vänster, stor handknapp till höger, tryck på en ruta bredvid dig.
- Handkontroll (Xbox, PlayStation, Switch): vänster spak går, `A`/`X`/`RT` använder, `B`/`LT` springer, `LB`/`RB` eller
  styrkorset vänster/höger väljer verktyg, `Y` ryggsäck, styrkorset upp emotes och ner minikarta, Start hjälp, Select bok.
  I en fängelsehåla är `X`/`Y`/`B`/`RB` besvärjelserna, `LB` läkedryck, styrkorset vänster/höger byter monster och
  Select ryggsäck. I menyerna flyttar spaken/styrkorset markeringen, `A` trycker och `B` stänger. Minispelen läser
  kontrollen själva.
  Hur du kopplar ihop en Xbox-, PS5- eller Switch-kontroll med en Android-surfplatta, Mac eller PC står i hjälpen under 🕹️ Handkontroll.
- `?` i hörnet öppnar hjälpen (visas automatiskt första gången på en enhet).

## Art

All pixel art (terrain, objects, crops, animals, characters, icons) is generated in code at boot
(`packages/client/src/art`). The design originally planned to use Kenney's CC0 roguelike tiles for
terrain and objects; swapping those in later only touches `art/world.ts`.

### Grafiken (LittleJS)

The game is drawn by LittleJS at screen resolution (the earlier Phaser client used a 320×180 canvas), so things
can lean and squash smoothly. It starts in "Ny grafik"; the art button still cycles the styles. It needs WebGL 2
(and says so on a screen without it).

- Ljus: the light map follows the day (golden morning, white noon, orange sunset, blue night, purple at Halloween),
  greyer under clouds and darker in storms. At night lamps, torches, stoves and lit windows shine, every player
  carries a lantern, cars have headlights, and lightning flashes the whole map.
- Skuggor: trees, houses, people and animals cast sun shadows that lean long to the west in the morning, sit behind
  things at noon and lean east in the evening.
- Rörelse: trees, grass, flowers and crops sway with the wind and rustle when walked through; people bob as they
  step, squash when they use something, swing their tool and squeeze through the middle when they turn; animals
  hop; new things pop up, removed things shrink away, crops pop when they grow and picked-up things fly to whoever
  took them.
- Väder: rain with ripples, snow, hail, leaves and gusts in the wind, fog banks, cloud shadows drifting over the
  fields and a rainbow after rain. Fireflies on summer nights.
- Årstider: autumn colours, leaves falling and lying under the trees (by the real calendar), snow on the branches
  when the ground is white, blossom in spring.
- Mys: light falls out of lit windows onto the ground at night, smoke rises from chimneys, the farmhouse gets
  sunbeams with dust (moonbeams at night) and a closer camera, butterflies and sparrows, lily pads and jumping fish,
  the moon and stars in the pond, dawn mist and dew, puddles on the paths when it rains, a soft evening glow, a
  tilt-shift "model village" blur, and quiet sounds: crickets, an owl, birdsong at dawn, crackling fires, rain on the
  roof indoors.
- Each extra can be switched off from the address bar for comparing: `?fx=none`, or a list like `?fx=seasons,smoke`
  (`seasons`, `windows`, `smoke`, `indoors`, `critters`, `pond`, `mist`, `puddles`, `glow`, `tiltshift`, `sounds`);
  `?year=winter` previews another season. On a slow screen (under 45 fps after a few seconds) the glow and
  tilt-shift, the one costly pass, turn themselves off; `?quality=high` keeps them.
