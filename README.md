# Lilla Gården

Ett litet bondgårdsspel på svenska för hela familjen. Odla, ta hand om djur, snickra och bygg – tillsammans på samma gård från surfplatta och dator.

See [DESIGN.md](DESIGN.md) for the agreed design.

## Develop

```bash
pnpm install
pnpm db:up          # Postgres 17 in a container on port 5435
cp .env.example .env
pnpm dev            # server on :8080, client (Vite) on :5173, also reachable on your LAN IP
```

Open `http://<your-computer-ip>:5173` on the tablet. The parent page is at `/admin`
(force a season, save, skip to the next day, make it evening/morning).

Without `DATABASE_URL` the server runs in memory and saves nothing – handy for a quick look,
useless for a real farm.

## Production

```bash
pnpm build                     # server bundle + client PWA
DATABASE_URL=postgres://… node packages/server/dist/main.js   # serves the client on :8080
```

Or use the container image built by GitHub Actions: `ghcr.io/tobiasbernting/lilla-garden:latest`.
It needs `DATABASE_URL` and listens on 8080. Migrations run on boot.

Environment:

| Variable          | Meaning                                                   |
| ----------------- | --------------------------------------------------------- |
| `DATABASE_URL`    | Postgres connection string (required for persistence)     |
| `PORT`            | HTTP/WebSocket port, default 8080                         |
| `SEASON_OVERRIDE` | `halloween`, `jul`, `pask`, `midsommar` or `none`         |

## Layout

- `packages/shared` – game data, world simulation, Swedish strings (no I/O). Vitest covers the sim.
- `packages/server` – WebSocket game server (20 Hz), Postgres via Drizzle, `/api/players`, `/admin`, `/health`
- `packages/client` – Phaser 3 client, HTML menus, PWA (320×180 virtual resolution, integer scaled)

## Controls

- Dator: WASD/piltangenter, `E`/mellanslag för att använda, klick på en ruta, `1–8` väljer verktyg, `Q` ryggsäck, `F` emotes, `H` hjälp, `Esc` stänger.
- Surfplatta: styrspak till vänster, stor handknapp till höger, tryck på en ruta bredvid dig.
- `?` i hörnet öppnar hjälpen (visas automatiskt första gången på en enhet).

## Art

All pixel art (terrain, objects, crops, animals, characters, icons) is generated in code at boot
(`packages/client/src/art`). The design originally planned to use Kenney's CC0 roguelike tiles for
terrain and objects; swapping those in later only touches `art/world.ts`.
