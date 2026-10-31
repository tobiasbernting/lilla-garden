// A small map of the farm (or the cave) drawn on a canvas: terrain, trees, buildings and who is where.
import { ANIMALS, DUNGEON_H, DUNGEON_W, MAP_H, MAP_W, NPCS, isSagaKey, isUnderground, mapH, mapW, objectDef, themeOfEntrance, tileIndex, type WorldState } from '@lilla-garden/shared';
import { activeWorld, bus, client, myArea, myPlayer } from '../state.ts';
import { h } from './dom.ts';

const COLORS: Record<string, string> = {
  grass: '#5f9f3c',
  soil: '#9a6a3a',
  soil_wet: '#5f3d1d',
  water: '#3f86d6',
  pool: '#4fc0e6',
  sand: '#e3d08f',
  path_stone: '#b5b2a8',
  path_dirt: '#c9a978',
  floor_wood: '#b07a44',
  floor_stone: '#9d9a92',
  snow: '#eef2f7',
  gravel: '#8f8a80',
  ice: '#bfe3f5',
  road: '#8a8077',
  sidewalk: '#b8ad9c',
  crossing: '#c9bfac',
  rail: '#6b5a40',
  rock: '#77736c',
  sandstone: '#b8643a',
  basalt: '#2c2a30',
  lava: '#f06a1a',
  ash: '#4a4448',
  mud: '#6a5a3a',
  bog: '#3d5a3a',
  moss: '#5a8a7a',
  redsand: '#d08a5a',
  candy: '#f4b8d4',
  choco: '#6a3a1e',
  moon: '#bdbdc6',
  space: '#0a0a1a',
  carpet: '#2a2152',
  crypt: '#6a6e62',
  forge: '#3a2226',
  bifrost: '#e8e5f4',
};

export class Minimap {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private dirty = true;
  private visible = false;
  private timer: number | null = null;
  private lastKey = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = MAP_W * 2;
    this.canvas.height = MAP_H * 2;
    this.base = document.createElement('canvas');
    this.base.width = MAP_W * 2;
    this.base.height = MAP_H * 2;
    this.el = h('div', { class: 'minimap', hidden: true }, this.canvas);
    try {
      this.visible = localStorage.getItem('lilla-garden.minimap') !== '0';
    } catch {
      this.visible = true;
    }
    this.el.hidden = !this.visible;
    bus.on('change', (c) => {
      if (c.t === 'terrain' || c.t === 'object' || c.t === 'areaData') this.dirty = true;
    });
    bus.on('welcome', () => (this.dirty = true));
    bus.on('area', () => (this.dirty = true));
    this.timer = window.setInterval(() => this.draw(), 250);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    try {
      localStorage.setItem('lilla-garden.minimap', this.visible ? '1' : '0');
    } catch {
      /* ignore */
    }
    this.dirty = true;
    this.draw();
  }

  private drawBase(world: WorldState): void {
    const ctx = this.base.getContext('2d')!;
    // a saga dungeon is a whole map, dark round its rooms like a cave
    const saga = isSagaKey(world.area);
    const cave = isUnderground(world.area) || saga;
    this.lastKey = world.area ?? 'farm';
    // two pixels a tile: a big wild map (96) draws finer in the same box
    const w = world.cave?.w ?? (cave && !saga ? DUNGEON_W : mapW(world));
    const hgt = world.cave?.h ?? (cave && !saga ? DUNGEON_H : mapH(world));
    this.base.width = w * 2;
    this.base.height = hgt * 2;
    this.canvas.width = w * 2;
    this.canvas.height = hgt * 2;
    ctx.fillStyle = cave ? '#15151a' : '#5f9f3c';
    ctx.fillRect(0, 0, w * 2, hgt * 2);
    for (let y = 0; y < hgt; y++)
      for (let x = 0; x < w; x++) {
        const t = world.terrain[tileIndex(world, x, y)]!;
        if (cave && (t === 'rock' || t === 'basalt' || (t === 'water' && world.area === 'dungeon'))) continue;
        ctx.fillStyle = COLORS[t] ?? '#888';
        ctx.fillRect(x * 2, y * 2, 2, 2);
      }
    for (const o of Object.values(world.objects)) {
      const def = objectDef(o.kind);
      let c: string | null = null;
      if (o.kind.startsWith('tree') || o.kind === 'bush' || o.kind === 'palm' || o.kind === 'cactus' || o.kind === 'jungle_tree' || o.kind.startsWith('giant_')) c = '#2f6e2a';
      else if (themeOfEntrance(o) || o.kind === 'rocket' || o.kind === 'saga_portal') c = '#1b1a17';
      else if (o.kind === 'loot_chest' || o.kind === 'dig_spot') c = '#f2d35a';
      else if (o.kind.startsWith('rock') || o.kind === 'cave_rock' || o.kind === 'ore') c = '#7d7a73';
      else if (o.kind === 'house' || o.kind === 'house_small') c = '#b5413a';
      else if (o.kind === 'market' || o.kind === 'sellstall') c = '#ffffff';
      else if (o.kind === 'cave') c = '#1b1a17';
      else if (o.kind === 'cave_wall') c = o.variant === 1 ? '#f5a623' : '#3a3a40';
      else if (o.kind === 'saga_wall') c = '#3a3a40';
      else if (o.kind === 'saga_gate') c = '#8a8e9a';
      else if (o.kind === 'saga_rest') c = '#5ae0f0';
      else if (o.kind === 'cave_exit' || o.kind === 'door_out' || o.kind === 'saga_exit') c = '#8fd0f0';
      else if (o.kind === 'treasure' || o.kind === 'saga_chest') c = '#f2d35a';
      else if (def.houses) c = '#c58f55';
      else if (o.kind === 'fence' || o.kind === 'gate' || o.kind.startsWith('wall')) c = '#8a5c30';
      else if (o.kind === 'mailbox' || o.kind === 'sellbox' || o.kind === 'workbench' || o.kind === 'start_bench') c = '#ffffff';
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(o.x * 2, o.y * 2, def.w * 2, def.h * 2);
    }
    this.dirty = false;
  }

  draw(): void {
    if (!this.visible) return;
    const world = activeWorld();
    const me = myPlayer();
    if (!world || !me) return;
    if (this.dirty || this.lastKey !== (world.area ?? 'farm')) this.drawBase(world);
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    const dot = (x: number, y: number, c: string, r = 2) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x / 8) - r / 2, Math.round(y / 8) - r / 2, r, r);
    };
    const area = myArea();
    const cave = isUnderground(area);
    for (const def of Object.values(NPCS)) {
      if ((def.area ?? 'farm') !== area) continue;
      const n = client.snaps.npcs.get(def.id);
      if (n) dot(n.x, n.y, '#ff8ae0', 3);
    }
    for (const a of client.snaps.animals.values()) {
      if ((a.area ?? 'farm') !== area) continue;
      const rec = world.animals[a.id];
      // the cave's trolls and the dungeons' monsters in red
      const mob = rec && (ANIMALS[rec.species]?.mob || ANIMALS[rec.species]?.saga);
      dot(a.x, a.y, mob ? '#ff4a4a' : '#f4ead8', mob ? 3 : 2);
    }
    for (const p of client.snaps.players.values()) {
      if ((p.area ?? 'farm') !== area) continue;
      dot(p.x, p.y, p.id === me.id ? '#ffe14a' : '#ffffff', 4);
    }
    dot(me.x, me.y, '#ffe14a', 4);
  }
}
