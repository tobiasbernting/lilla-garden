# Lilla Gården

Ett litet bondgårdsspel på svenska för hela familjen. Odla, ta hand om djur, snickra och bygg – tillsammans på samma gård från surfplatta och dator.

See [DESIGN.md](DESIGN.md) for the agreed design.

## Develop

```bash
pnpm install
pnpm db:up          # Postgres 17 in a container on port 5435
cp .env.example .env
pnpm dev            # server on :8080, client on :5173 (also reachable on your LAN IP)
```

## Layout

- `packages/shared` – game data, world simulation, Swedish strings (no I/O)
- `packages/server` – WebSocket game server, Postgres persistence, `/admin`
- `packages/client` – Phaser 3 client, PWA

## Art

Tiles from [Kenney](https://kenney.nl) (CC0). Characters, animals, crops and icons are generated in code.
