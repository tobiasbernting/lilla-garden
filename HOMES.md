# Homes: one farm per household

Plan (2026-11-09). Not built yet.

## What the owner decided

- Only this game (the web game, `lilla-garden`). Världsträdet is not changed.
- The existing farm becomes **the family's farm**: a home like any other, owned by the family. Everything built on it stays.
- **The parent creates homes** on the parent page (`/admin`): a name and its owners. Players do not create homes.
- **Many homes**, and a player may belong to more than one (e.g. a child owns a home with friends and is still part of
  the family farm). Two or more players can share one home.
- **Visitors are allowed** everywhere: anybody may walk around any home.

## How the game is built today (what this rests on)

- The farm is the root `WorldState`; every other map (wild maps `a:x,y`, Köpingen, caves, the bath house, dungeons) is
  an area under `farm.areas[key]`, loaded by `getArea` (`shared/src/sim.ts`) and saved whole as jsonb in the `areas`
  table. Clients already follow any area key.
- Building, tilling, planting, chests and placing things already work on any map; objects remember who built them
  (`WorldObject.by`) and only the builder may take them down.
- `isFarm(world)` means "the root map" (`!world.area`). The farmhouse interior, its door portals, riding indoors and the
  pets' rules lean on it.
- `newDay` grows crops, dries soil, empties troughs, gives hearts and products, and delivers ordered animals on the root
  map only.
- The character limit counts every character ever made, not who is online. PR #46 makes it a parent-page setting
  (default 20, 1–100).

## The design

**A home** is a map with the key `home:<n>` and `world.home = { id, name, owners: string[] }`, saved in the `areas`
table like any other map (no new table for the maps). A new home is made with `generateWorld(seed)`: a fresh farm with
its own farmhouse (same layout, so `INTERIOR` and `PORTALS` fit), pond, trees, shop and sell box. Its edges are closed
(homes are not on the world grid); a **gate sign** at the spawn leads to the family farm.

**The family farm** stays the root map (the key `farm`, the world grid's (0,0), the villagers, Köpingen to the east, the
dungeon arch, the bus). It gets a home record of its own (`farmHome = { name, owners }`, saved in `settings`) so the
same rules apply to it.

**Rules**

| Who | On a home |
| --- | --- |
| Owner | Everything: till, plant, water, harvest, build, take down, open chests, buy and receive animals, sleep in the bed. |
| Visitor | Walk, chat, pet and brush animals, talk to villagers, use the shop and sell box, fish. Not: till, plant, harvest, chop, mine, build, take down, open chests, feed troughs. A toast says whose home it is. |

Out in the wild world nothing changes (anyone may build anywhere there, as today).

**Getting around**

- On the family farm, a signpost near the spawn: "Hem" lists the homes (yours first, then the others to visit).
- The travel/teleport menu gets "Hem" for each home you own and "Besök …" for the others.
- A player who owns a home starts there when they log in and wakes there; one with several homes goes to the first
  (or the one they slept in last). A player without a home starts on the family farm as a visitor until the parent
  gives them one.

**The parent page** gets a "Hem" section: list homes with their owners and how many things are on them; create a home
(name + owners, ticking players from the list); rename; add or remove owners; set the family farm's owners. Removing a
home is left out of the first version (too easy to lose a child's farm).

## Steps

1. **Home maps.** `home:<n>` keys, `isHomeKey`, `generateHome(n)` from `generateWorld`, `getArea` builds them, the
   `home` record on the map, the family farm's record in `settings`. Closed edges; the gate back.
2. **Split `isFarm`.** `isRoot(world)` (players, day, quests, areas) and `isFarmMap(world)` (the root farm and every
   home: interior, portals, riding indoors, pets inside, Christmas snow in both clients).
3. **Every farm has a night.** `newDay` loops over the root farm and every home for crops, wet soil, troughs and
   animals. Animal orders remember the map (`orders: { species, homeId, map }`); old orders without one mean the farm.
4. **Saving.** Homes go through `dirtyAreas` like any map. The load-time rebuild of untouched old maps
   (`store.ts`, `AREA_GEN`), the wild-animal respawn and `regrowAreas` must skip homes, or a home could be wiped.
5. **Permissions.** One `mayChange(world, p)` check in the actions listed for visitors above, with a toast. Tests.
6. **Getting around.** The signpost, the travel menu entries, login and wake-up at home, both clients.
7. **Parent page.** The "Hem" section and its routes (behind the parent login, like the rest of `/admin`).
8. **More players.** The limit itself is PR #46; check the tick and broadcast with 20 connected bots.
9. **Tests.** A crop grows on a home overnight; a visitor cannot till, build or open a chest but can pet; a home
   survives a save and a restart and is not rebuilt; an ordered animal arrives at its home's barn; two owners can both
   build; a player in two homes may build in both.

Pull requests: **A** steps 1–4 (and the load check of step 8) (homes exist, made from the parent page by a test helper), **B** steps 5 and 7,
**C** step 6 and polish.

## Left open

- Whether a visitor may harvest a ripe crop for the owner (default: no).
- Whether the night should wait only for players on farms, not the ones out exploring (unchanged for now: everyone
  online sleeps).
