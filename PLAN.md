# Plan: Lilla Gården becomes a native Norse roguelite

Written 2026-10-31 from the handoff (`HANDOFF.md`) and the owner's answers to its five open questions. This is the
plan of record for this repository. `DESIGN.md` is the record of Lilla Gården as it was when this repository was
seeded from it.

**This repository.** `varldstradet` was seeded on 2026-10-31 from `tobiasbernting/lilla-garden` main (full history,
merge of PR 45) because the kids keep playing the browser game there. The two repositories diverge from here: the
browser game and its deploy stay untouched in lilla-garden; everything in this plan happens here. Fixes to shared
rules are ported by hand in either direction when worth it.

## 1. Decisions

From the handoff (already concluded there):

- No console release. No web-to-desktop wrapper. The client is rewritten in **Godot 4** (4.6 or newer) for Windows,
  macOS and Linux. The Node server and the WebSocket protocol stay; new messages are additive.
- Art direction: stylized, **HD-2D** (a 3D world with 2D sprite characters), so the pixel characters, animals and
  bosses carry over.
- The minigames (`packages/arcade`, Rallyvärlden, the garage, the stuga TV) go.

From the owner (2026-10-31):

| Question | Decision |
| --- | --- |
| Co-op | **Co-op first, invite only, over the internet.** Adults and kids, 2–4 per run, roles matter. Solo still works through party scaling and a hired companion. |
| The farm | **Both things are true.** The farm is the home base between runs, and farming and animals stay a fun activity in their own right for the kids. What the farm produces feeds the next run. |
| Art | **At most 50 EUR for all art, one time.** Free CC0 packs as the base, one Synty pack, AI only for a few images and only where the style stays consistent. Section 5. |
| Hardware | **Integrated graphics is the baseline**, with a higher quality tier for dedicated GPUs. The owner's own machine is a MacBook Air M4. |
| Server | **Reuse the running Hetzner + Cloudflare setup** from the homelab repo (`cloud/`): Cloudflare tunnel, join codes, parent page over Tailscale, nightly dumps. |

## 2. The game in one page

**Working title:** Sagan om Världsträdet (the saga the family already knows).

**Core loop.** The farm is home. From the farm you walk through the arch into a *färd* (a run): a randomized chain of
zones built from the existing biomes (forest, swamp, mountains, beach, mushroom forest, ice, volcano) that ends in a
boss from the saga. A run takes 20–40 minutes with the family. When the party falls, nobody loses anything that is
theirs: the run ends and everyone is back at the farm with what they picked up along the way. Then you farm a little,
upgrade something, and go again. Same rules as the saga today: nothing bleeds, monsters poof, falling costs nothing.

**The farm feeds the run.**
- Crops and cooking make *färdkost* (run food): potions, buffs and a packed lunch chosen before the arch.
- Animals come along: hund, katt and häst are companions and mounts on a run; a well-kept cow or sheep gives a
  stronger buff than a neglected one.
- Buildings are the permanent upgrades: the smithy raises gear quality, the stable unlocks mounts, the herb garden
  unlocks potions, the longhouse unlocks the fourth party slot and the hired companion, the Kämpastenen unlocks spells.

**The run feeds the farm.**
- Loot: gear, seeds of new crops, decor, rare pets and mounts (the existing loot tables and `found` rules).
- *Sagafrön* (saga seeds) are the meta-currency: every run gives some, a boss gives many, and they are planted at the
  Yggdrasil shoot on the farm to grow permanent upgrades. The tree visibly grows with the family's progress.
- Chapters: the ten chapters stay the story spine. A chapter is cleared by finishing its run; later runs randomize
  harder versions of cleared chapters with modifiers (more packs, a second mid-boss, weather).

**Within a run.** Between zones the party picks one of three *runor* (boons: a spell upgrade, a passive, a party-wide
effect) and may stop at a rest stone. Zones are assembled from hand-made room plans the way `sagamap.ts` already
assembles dungeons from nine-room plans; randomization is which rooms, which packs, which boons, which boss moves are
unlocked, and the weather. The telegraph-and-interrupt boss design stays untouched.

**Classes and gear.** Väktare, Helare, Krigare, Magiker with their spells; rarity, slots, `gearStats`, levels and XP
as today. Levels and gear are permanent; boons are per run.

**Co-op.** A run is started by whoever stands at the arch; everyone invited to the farm can join at the arch or
drop in at the next rest stone. The party is 1–4; monsters scale with the party as today. Voice stays (`voice.ts`).
Invites are the existing join codes made on the parent page; a guest family gets a code, types it in the game, and the
parent approves the device. Play hours, pause and remove work unchanged.

**Kids.** Short text, Swedish, pictures for every action, no reading needed to play (the 7-year-old). Gamepad,
keyboard and mouse from day one.

## 3. Architecture

```
 Godot client (Win/mac/Linux) ──wss──▶ Cloudflare tunnel ──▶ Hetzner "lilla-garden" ──▶ Node server (20 Hz tick, Postgres)
   packages/godot/                                                                       packages/server, packages/shared
```

- **Server unchanged in shape.** Authoritative 20 Hz tick, `state` snapshots at 10 Hz, `changes` deltas, 15 s pings.
  All run logic lives in `packages/shared` (`sagasim.ts`, `sagamap.ts`, `sim.ts`) and the server; the client renders
  and sends intent, as today. New messages (`run`, `boon`, `seed`) are additive.
- **Login from a native client.** Today a device holds its token in an `HttpOnly` cookie set by `/join`. The Godot
  client cannot use browser cookies, so: `POST /api/join {code}` answers the token in the body for a client that asks
  for it (`Accept: application/json`), the client stores it in `user://`, and sends it as `Authorization: Bearer` on the
  WebSocket upgrade. `deviceOf` in `http.ts` accepts either the cookie or the header. The parent page, the approval
  flow and the 4003 close on rule changes need no change.
- **Transport.** Cloudflare's tunnel carries WebSockets; the existing 15 s ping keeps the connection under
  Cloudflare's 100 s idle limit. Godot's `WebSocketPeer` with TLS. Nothing else on the Hetzner server changes.
- **Client layout.** `packages/godot/` in this monorepo: `project.godot`, `scenes/`, `scripts/` (GDScript; C# is not
  needed and complicates Linux ARM builds), `assets/` with a licence note per source. Export presets for Windows x86_64,
  macOS universal, Linux x86_64 and arm64. GitHub Actions builds the four exports on a tag and attaches them to a
  release; the game's web page becomes a download page with the join code field.
- **Strings.** `packages/shared/src/sv.ts` is exported to `packages/godot/assets/sv.json` by a small script so the
  Swedish text stays in one place.
- **Renderer and quality tiers.** Start with Forward+ with three presets: *Låg* (no shadows, no GI, no volumetric
  fog, foliage LOD aggressive, 1080p, target 60 fps on an Intel iGPU laptop), *Mellan* (shadows, SSAO, default on the
  MacBook Air M4) and *Hög* (SDFGI or VoxelGI, volumetric fog, full particle budgets, for dedicated GPUs). If the Låg
  preset cannot hold 60 fps on an Intel iGPU in milestone 3, switch the project to the Mobile renderer, which costs the
  GI options in Hög but nothing the baseline needs. The decision is made with a frame-time capture, not a guess.

## 4. What to keep, replace, remove

- **Keep (shared and server):** saga data, classes, spells, items, loot tables, chapters, dungeon plans, boss moves,
  `sagasim.ts`, gear and levels, farming, animals, building, ownership, access control, voice, the protocol.
- **Replace:** `packages/client` and `packages/clientljs` (rendering, HUD, menus, networking, art) with
  `packages/godot`. The pixel sprites in `packages/client/src/art` are drawn in code; the ones we keep are rendered once
  to sprite sheets by a script and checked in under `packages/godot/assets/sprites`.
- **Remove first:** `packages/arcade` (44k lines, more than the rest of the game together) and its reach into the rest:
  `rally.ts`, `rallysim.ts`, `arcade.ts`, `hall.ts` in shared; `races.ts` on the server; `race`, `garage` and `arcade`
  messages in `protocol.ts`; the arcade and rally UI and art in the client; their strings in `sv.ts`; the stuga TV,
  Spelhallen and Rallyvärlden in `city.ts` and `data.ts`. Saved data: drop the garage and prize columns with a
  migration that keeps everything else.

## 5. Art: 50 EUR all in (prices as of 2026-10-31)

Hard cap from the owner: **50 EUR for all art, one time**, bought packs and AI together. So the base is free CC0
packs, one Synty purchase of at most 30 USD, and AI used for a handful of images rather than as a subscription.

Rule: one style sheet first (palette, line weight, proportions), then every pack is recoloured to it and every
generated image is made from it. The free packs below share a flat, low-poly look that already sits close together.

**Free, CC0, glTF, no credit needed (the base of the world):**

| Need | Pack | Notes |
| --- | --- | --- |
| Trees, plants, rocks, water | Kenney Nature Kit (330 models); Quaternius Stylized Nature MegaKit (40 trees, 35 plants, 27 rocks) | Enough for forest, swamp edge, mountains and beach with recolours. Ice is a recolour plus the free Binbun Ice VFX. |
| Farm, village, buildings | Kenney Castle Kit; KayKit Medieval Builder | Walls, roofs, fences, props. Norse flavour comes from the style sheet, carved rune decals and the bought Vikings pack. |
| Crypt, mine, temple, cave | KayKit Dungeon Remastered (name your price, 0 is allowed); Kenney Graveyard Kit; Kenney Mini Dungeon | Godot listed as supported by KayKit; also on the Godot Asset Library. |
| Draugar, skeletons | KayKit Skeletons, free tier | glTF, animated. |
| Weather | inkharbor Weather FX Lite (free); Godot's own particles and sky | The 10 USD Storm & Wind bundle is a nice-to-have, not needed. |

**Spend (about 40 USD, about 37 EUR):**

| Need | Pack | Price | When |
| --- | --- | --- | --- |
| Norse village, longhouse, props, five Viking characters | Synty POLYGON Vikings | 30 USD | At the start of M3, not before. First check whether a Synty Humble Bundle is live: Synty runs a 30 USD bundle of 9–12 packs about four times a year, and a fantasy one would give Dungeon and Nature as well for the same money. If a bundle is live, buy that instead of Vikings alone. |
| Monsters as sprites | Minifantasy Creatures | 3 USD | M3. 28 creatures, 4 directions, spooky-cute. |
| Weather shaders | Storm & Wind 3D bundle | 10 USD | Only in M7, and only if the free weather is not enough. |

**AI (about 5–10 EUR total, no subscription):**

- Concept art and the style sheet itself: **Google Nano Banana Pro** through the API at about 0.13 USD an image;
  50 images is about 7 USD. Outputs are yours.
- Sprites and icons in the house style: **FLUX.2 klein** (Apache-2.0, free to run locally or about 0.014 USD an
  image on fal.ai) with one style LoRA trained from the style sheet, about 2 USD once. A LoRA is the only real style
  lock; prompts alone drift. Backgrounds removed with rembg, which is free.
- Props as meshes: **Meshy** free tier (100 credits, CC-BY so a line in `LICENSES.md`). Cleanup pass to match the
  low-poly look; props only, never characters or bosses.
- No Midjourney and no Meshy Pro: both are monthly and would blow the cap in two months.

Characters, bosses and the family's own animals are not bought and not generated: they are the existing pixel art,
rendered to sprite sheets and given extra directions by hand where HD-2D needs them.

Total: 30 USD Synty plus 3 USD sprites plus about 10 USD of AI is about 40 EUR, with 10 EUR left for the weather
bundle or a second KayKit tier if M7 needs it.

## 6. Milestones

Each milestone ends with something the family can play. Estimates are evenings, not calendar time.

**M0. Design doc.** This file plus a `GAME.md` with the run structure, the boon list, the farm-to-run table and the
first three run templates. 2 evenings. Done when the owner has read it and the open points in section 7 are settled.

**M1. Remove the minigames.** Section 4's removal list, in one PR per layer (shared, server, client), tests green,
a migration for the saved garage data, `DESIGN.md` updated. The web game keeps running at the cloud farm throughout.
3–4 evenings. Done when `pnpm test` passes, the image builds and a round of play shows nothing else broke.

**M2. Native login and builds.** Bearer-token login on the server, `/api/join` for native clients, a `packages/godot`
skeleton that connects, logs in with a join code and prints the `welcome` world. GitHub Actions exporting Windows, macOS
and Linux builds on a tag. 3 evenings. Done when the owner starts the exported build on the MacBook Air, types a join
code, and the parent page shows the device.

**M3. Prototype: one zone, one class.** Draugkryptan as an HD-2D zone with bought and free assets, Krigare with four
spells, movement, camera, combat, telegraphs, rest stone, the mid-boss, the HUD, gamepad and keyboard, and the three
quality presets measured on an Intel iGPU laptop and the M4. Chat and emotes. 8–12 evenings. Done when two players clear
it together over the internet at 60 fps on Låg.

**M4. The farm in Godot.** The 64×64 farm as the hub: crops, watering, animals, the house, the shop, crafting and
building with ownership, the wardrobe, day and night, seasons. This is the biggest port because the farm stays a real
game. 12–16 evenings. Done when the family can play a farm evening in the new client without missing the old one, and
the web client is retired.

**M5. Runs.** Server-side run generator on top of `sagamap.ts` (zone chain, room pick, packs, modifiers), boons,
sagafrön and the Yggdrasil upgrades, färdkost and companions, the arch and the join-at-rest-stone rule, the hired
companion for solo play. All four classes. 10–14 evenings. Done when a chapter can be run three times and feels
different each time, and a solo run is winnable.

**M6. The saga, chapter by chapter.** Port the remaining eight dungeons as zone sets and all bosses, in chapter order,
one per one or two evenings, with the existing bot balance pass rerun on each. 12–18 evenings.

**M7. The alive world.** Wind on foliage, weather with the existing `weather.ts` states, day and night lighting,
wildlife that flees and returns, water with reflections on Mellan and up, particles, footsteps and ambience. Each is a
toggle in the presets. 6–10 evenings.

**M8. Polish and cutover.** Settings, accessibility (bigger text, colour-blind telegraph colours), the download page,
a release tag, the homelab role updated for the new build, `DESIGN.md` rewritten. 4–6 evenings.

Total: roughly 60–90 evenings. M1 and M2 can start now and do not depend on art; the first money is spent at the start of M3.

## 7. Open points and risks

- **Godot and Synty FBX.** The Vikings pack does not ship a Godot project. Godot imports FBX through its
  bundled converter, but materials sometimes need a pass in Blender. Budget one evening in M3 to settle the import
  pipeline before buying more packs.
- **Keeping the saga tests honest.** `saga.test.ts` walks every dungeon; the run generator must keep those tests and
  add its own, or balance will drift unnoticed.
- **Latency over the internet.** Today everyone played on one LAN. Client-side movement prediction for your own hero
  and interpolation for everyone else are required in M3; the 10 Hz snapshot rate may need to rise for runs.
- **The 7-year-old and a gamepad.** Decide in M3 whether the four spells sit on face buttons or on one button with a
  radial wheel. Test with the kids, not with adults.
- **Art licences.** Keep a `LICENSES.md` in `packages/godot/assets` from the first asset. The free Hunyuan3D weights
  are not licensed for EU users, so Meshy or Tripo for generated meshes.
- **Scope of the farm port (M4).** The farm has seven crops, four animal kinds, cooking, fishing, villagers with
  quests, and the whole wider world with Köpingen. The hub needs the farm itself first; the wider world can come back
  as run zones. Decide the cut list at the start of M4.
- **Hetzner CX23.** 2 vCPU and 4 GB is enough for a family and guests; run generation is cheap. If the server is ever
  the bottleneck, the next size up is the fix, not a rewrite.

## 8. Next step

Start M1 (remove the minigames) in this repository. It is pure deletion with tests, needs no art, no Godot and no design
decision, and it makes every later diff smaller. M2 follows directly after and is also independent of the art
purchases, so nothing is bought before M3.
