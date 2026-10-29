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

## Develop

```bash
pnpm install
pnpm db:up          # Postgres 17 in a container on port 5435
cp .env.example .env
pnpm dev            # server on :8080, 2D client on :5173, 3D client (v2) on :5174, also on your LAN IP
```

Both clients talk to the same dev server, so you can play the same farm in 2D and 3D side by side.

Open `http://<your-computer-ip>:5173` on the tablet. The parent page is at `/admin`
(log in with `PARENT_PASSWORD`; invite and approve devices, force a season, save, skip to the next day,
make it evening/morning).

Without `DATABASE_URL` the server runs in memory and saves nothing – handy for a quick look,
useless for a real farm.

## Production

```bash
pnpm build                     # server bundle + client PWA
DATABASE_URL=postgres://… node packages/server/dist/main.js   # serves the client on :8080
```

Or use the container image built by GitHub Actions: `ghcr.io/tobiasbernting/lilla-garden:latest`.
It needs `DATABASE_URL` and listens on 8080. Migrations run on boot.

The 3D version (v2) is the same server shipping the 3D client: `ghcr.io/tobiasbernting/lilla-garden-v2:latest`
(built with `docker build --build-arg CLIENT=client3d .`). Run it as its own deployment, e.g. at
`gard2.moderskepp.lan`, with its own database so the two farms don't share (or fight over) one save.

Environment:

| Variable          | Meaning                                                   |
| ----------------- | --------------------------------------------------------- |
| `DATABASE_URL`    | Postgres connection string (required for persistence)     |
| `PORT`            | HTTP/WebSocket port, default 8080                         |
| `SEASON_OVERRIDE` | `halloween`, `jul`, `pask`, `midsommar` or `none`         |
| `PARENT_PASSWORD` | Required (12+ characters): the parent login for `/admin`. The server refuses to start without it. |
| `ACCESS`          | `open` turns access control off entirely (old behaviour, home network only). Default: on. |
| `PUBLIC_URL`      | The public address, e.g. `https://gard.example.se`: used in invite links, makes cookies `Secure`, accepted as origin. |
| `TRUST_PROXY`     | `1` behind a tunnel or reverse proxy: take the visitor's IP from `CF-Connecting-IP`/`X-Forwarded-For`. Only set it when the server can't be reached directly. |
| `WORLD_MODE`      | `voxel` gives new maps hills, mountains and a block layer you can dig and build in (v2). Leave unset for the 2D game. |

## Who may enter (access control)

Lilla Gården is a kids' game, so nobody gets in without a parent saying yes:

1. **Nothing without an approved device.** Strangers only ever see a "private farm" page. The game itself, `/api`
   and the WebSocket all refuse browsers without an approved device cookie.
2. **Invite links.** On `/admin` a parent creates a link for a named person (guest or family, valid 1 h–7 days).
   It works **once**; the secret lives in the `#fragment`, so it never shows up in server or proxy logs, and only a
   hash of it is stored.
3. **Parent approval.** Opening the link only puts the device in a waiting room with a 6-digit code. It can't play
   until a parent approves it on `/admin` (ask the guest which code they see). At most 10 devices can wait.
4. **Guests play only their own characters.** A guest device sees and plays only the characters it created (by
   default one) or that the parent gave it; family devices play everyone. A parent can also make the browser they're
   signed in on a family device (for the kids' own tablet) without an invite.
5. **The parent stays in control**: close the farm for everyone, family only, or family + guests; play hours
   (Swedish time); pause or remove any device. Changes take effect at once: open connections are closed and the
   device lands on the gate page.
6. **Parent login**: password (`PARENT_PASSWORD`), optional two-step login with an authenticator app, rate limited
   (5 failures per address per 15 min, 30 per hour in total), 8-hour sessions.
7. **Log**: logins, failed logins, invites, joins, approvals and refused requests are logged on `/admin`.
8. **Web hardening**: `HttpOnly` + `SameSite=Strict` cookies (`Secure` over HTTPS), origin checks on every form and
   on the WebSocket, strict Content-Security-Policy, no framing, `noindex`, `/health` reveals nothing.

There is still no text chat: players can only use emotes.

## Layout

- `packages/shared` – game data, world simulation, Swedish strings (no I/O). Vitest covers the sim.
- `packages/server` – WebSocket game server (20 Hz), Postgres via Drizzle, `/api/players`, `/admin`, `/health`
- `packages/client` – Phaser 3 client, HTML menus, PWA (320×180 virtual resolution, integer scaled)
- `packages/client3d` – v2: Three.js client that draws the same world as Minecraft-style blocks. Reuses the 2D
  client's networking, state, HUD, menus and pixel art (imported via the `@v1/*` alias); only the view is new.

## Controls

- Dator: WASD/piltangenter, `E`/mellanslag för att använda, klick på en ruta, `1–8` väljer verktyg, `Q` ryggsäck, `F` emotes, `H` hjälp, `Esc` stänger.
- Surfplatta: styrspak till vänster, stor handknapp till höger, tryck på en ruta bredvid dig.
- `?` i hörnet öppnar hjälpen (visas automatiskt första gången på en enhet).

## Art

All pixel art (terrain, objects, crops, animals, characters, icons) is generated in code at boot
(`packages/client/src/art`). The design originally planned to use Kenney's CC0 roguelike tiles for
terrain and objects; swapping those in later only touches `art/world.ts`.

### 3D (v2)

- Dator: klicka i spelet för att styra med musen. WASD går, musen tittar, klick använder verktyget på det du
  tittar på (svart ram). Du behöver inte sikta exakt: spelet väljer det närmaste som verktyget kan användas på,
  inom en ruta från dig. Håll in knappen för att fortsätta hugga, hacka, vattna, så eller bygga medan du går.
  Mellanslag hoppar, Shift springer, `E`/`Q` ryggsäck, hjulet/`1–8` väljer verktyg, `F5` eller `V` byter kamera
  (första person, bakifrån, framifrån), 🖱️ inverterar musen upp/ner, `Esc` släpper musen.
- Surfplatta: styrspak till vänster, dra på skärmen för att titta, tryck på något för att använda verktyget på det,
  handknappen (håll in för att fortsätta) använder det du tittar på, annars rutan framför dig. ⤒ hoppar,
  🎥 byter kamera, 🖱️ inverterar upp/ner.

#### Gräva och bygga (`WORLD_MODE=voxel`)

Med `WORLD_MODE=voxel` får världen kullar, berg vid kanterna, grottor och malm. Gården, huset och vägarna ut
till grannkartorna hålls platta, och skogarna är glesare med ek, björk, mörk ek, körsbär, gran och rödgran.

- Jord, sand, grus och snö gräver du med vad som helst (även händerna); sten och malm kräver hackan.
  Sten ger sten, kolmalm kol, guldmalm guld, kristallmalm ädelstenar. Längst ner ligger berggrund.
- Gräver du rakt fram tar du två block på höjden, så du kan gå in i berget.
- Håll jord, sand, grus, sten (blir kullersten) eller trä (blir plankor) och klicka för att bygga ett block.
  Hoppa och bygg under dig för att ta dig upp. Mittenklick väljer det block du tittar på från ryggsäcken.
- Uppgrävd jord kan hackas till åker igen. Under träd, byggnader och grödor går det inte att gräva.

Bytt läge på en befintlig gård får den ett blocklager men behåller sin gamla skog; en ny gård får allt.

