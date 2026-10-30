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
(log in with `PARENT_PASSWORD`; make join codes, manage devices, force a season, save, skip to the next day,
make it evening/morning).

Without `DATABASE_URL` the server runs in memory and saves nothing – handy for a quick look,
useless for a real farm.

## Production

```bash
pnpm build                     # server bundle + client PWA
DATABASE_URL=postgres://… node packages/server/dist/main.js   # serves the game (the LittleJS client) on :8080
```

Or use the container image built by GitHub Actions: `ghcr.io/tobiasbernting/lilla-garden:latest`.
It needs `DATABASE_URL` and listens on 8080. Migrations run on boot.
The public farm takes each new `:latest` the night after it's built (03:30 Swedish time): it dumps the database,
starts the new version and goes back to the old one, database included, if it doesn't answer on `/health`. So a
merge to `main` is live the next morning, and a migration must work on the real farm's data. The deploy lives in the
homelab repo (`cloud/roles/lilla-garden`).

(The 3D version, the Phaser client and the `gard-ljs` trial farm were retired on 2026-10-30; their last images
stay in the registry as they were.)

Environment:

| Variable          | Meaning                                                   |
| ----------------- | --------------------------------------------------------- |
| `DATABASE_URL`    | Postgres connection string (required for persistence)     |
| `PORT`            | HTTP/WebSocket port, default 8080                         |
| `SEASON_OVERRIDE` | `halloween`, `jul`, `pask`, `midsommar` or `none`         |
| `PARENT_PASSWORD` | Required (12+ characters): the parent login for `/admin`. The server refuses to start without it. |
| `ACCESS`          | `open` turns access control off entirely (old behaviour, home network only). Default: on. |
| `PUBLIC_URL`      | The public address, e.g. `https://gard.example.se`: used in invite links, makes cookies `Secure`, accepted as origin. |
| `ADMIN_PORT`      | Serve the parent page on its own port (and not on `PORT`). `ADMIN_HOST` sets its address (default `0.0.0.0`). |
| `NTFY_URL`        | ntfy topic URL for push notifications, e.g. `http://ntfy.example.lan/lilla-garden`. `NTFY_TOKEN` if the server needs one. |
| `TRUST_PROXY`     | `1` behind a tunnel or reverse proxy: take the visitor's IP from `CF-Connecting-IP`/`X-Forwarded-For`. Only set it when the server can't be reached directly. |

## Who may enter (access control)

Lilla Gården is a kids' game, so nobody gets in without a parent having said yes:

1. **Nothing without an approved device.** Strangers only ever see a "private farm" page with a code field. The game
   itself, `/api` and the WebSocket all refuse browsers without an approved device cookie.
2. **Join codes.** On the parent page a parent makes a code (`ABCD-1234`) for a named person or family: guest or
   family, 1–5 devices, valid 1 hour–30 days. It's typed on the start page or opened as a link (`/join#CODE`; the
   fragment never reaches logs). Each device that joins is remembered (400 days); when the code has let in its
   devices or expires it stops working. Only a hash of the code is stored.
3. **The parent decides when making the code**: *let in directly* (the default; the parent gets a push) or *I approve
   each device* (the device waits with a 6-digit number until the parent approves it).
4. **Guests play only their own characters.** A guest device sees and plays only the characters it created (0–3 per
   device) or that the parent gave it; family devices play everyone. A parent signed in on the kids' tablet can also
   make it a family device directly (not when the parent page runs on its own port).
5. **Öppna igen**: a device that forgot the farm (cleared browser, new browser) gets a fresh one-time code from the
   device list and keeps its characters; the old key stops working.
6. **The parent stays in control**: close the farm for everyone, family only, or family + guests; play hours
   (Swedish time); pause or remove any device. Changes take effect at once: open connections are closed and the
   device lands on the gate page.
7. **Parent login**: password (`PARENT_PASSWORD`), optional two-step login with an authenticator app, rate limited
   (5 failures per address per 15 min, 30 per hour in total), 8-hour sessions. With `ADMIN_PORT` the parent page
   only exists on its own listener (bind it somewhere the internet can't reach, e.g. a Tailscale address); the public
   port answers 404 for `/admin`.
8. **Guessing codes**: 10 wrong codes per address per 15 min, and 100 wrong codes per hour from everywhere together,
   lock code entry for a while (and push a warning).
9. **Push notifications** (`NTFY_URL`): someone joined, someone waits for approval, a device was reopened, parent
   logins and failed logins, code entry locked.
10. **Log**: everything at the gate is logged on the parent page.
11. **Web hardening**: `HttpOnly` + `SameSite=Strict` cookies (`Secure` over HTTPS), origin checks on every form and
    on the WebSocket, strict Content-Security-Policy, no framing, `noindex`, `/health` reveals nothing.

There is still no text chat: players can only use emotes.

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
  The same lab serves `saga3d.html`, a proof of concept of the saga dungeons in third person (see below).

## Saga 3D (proof of concept)

Can the dungeons of Sagan om Världsträdet be played in third person, like the big online adventure games, on the
family's old tablets? `packages/arcade/saga3d.html` is the experiment: one dungeon, built from its real plan
in `shared`, drawn with Three.js in a chunky, cute style with a camera behind your character, the class's four
spells, the monster packs, the bosses with their attacks marked on the floor, the gate and the rest stones. It
runs without the server and without other players (a local copy of the rules, `src/saga3d/sim.ts`, covered by
Vitest), so it says nothing about networking, only about how it feels and how fast it runs.

```bash
pnpm --filter @lilla-garden/arcade lab        # then open http://<your-computer-ip>:5180/saga3d.html on the tablet
```

- `?d=draug|frost|surt` picks the dungeon, `?c=vaktare|helare|krigare|magiker` the class.
- Dator: WASD går, dra med musen för att vrida kameran, hjulet zoomar, `1–4` besvärjelser, `5` dryck, `Tab` byter mål, klicka på ett monster.
- Surfplatta: styrspak till vänster, dra på högra halvan för att vrida kameran, nyp för att zooma, tryck på ett monster, knapparna nere till höger.
- The corner readout shows the frame rate (with `?stats=1` also draw calls, triangles and the pixel ratio). The page
  picks a low quality on touch screens and small screens (`?quality=high|low` overrides): no shadows, pixel ratio 1,
  two roaming torch lights, and it lowers the pixel ratio by itself when the frame rate stays under 28.
  **Steady 30 fps or more in a monster fight on the tablet means the idea works; under 20 means it needs a
  different renderer, not more tuning.**

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
can lean and squash smoothly. There is one art style, the shaded pixel art. It needs WebGL 2
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
