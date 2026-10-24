// WebSocket connection with reconnect.
import { rebuildOccupancy, type ClientMsg, type ServerMsg } from '@lilla-garden/shared';
import { applyChange, bus, client } from './state.js';

export class Net {
  private ws: WebSocket | null = null;
  private playerId = '';
  private backoff = 500;
  private closedByUser = false;
  private pingTimer: number | null = null;

  connect(playerId: string): void {
    this.playerId = playerId;
    this.closedByUser = false;
    this.open();
  }

  disconnect(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    bus.emit('connection', 'connecting');
    ws.onopen = () => {
      this.backoff = 500;
      ws.send(JSON.stringify({ t: 'hello', playerId: this.playerId } satisfies ClientMsg));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping' }), 15000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws !== ws) return;
      this.ws = null;
      bus.emit('connection', 'closed');
      if (this.closedByUser) return;
      setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(8000, this.backoff * 2);
    };
    ws.onerror = () => ws.close();
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private handle(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        client.world = msg.world;
        rebuildOccupancy(client.world);
        client.me = msg.you;
        client.season = msg.season;
        client.serverOffset = Date.now() - msg.now;
        client.timeMs = msg.world.timeMs;
        client.day = msg.world.day;
        client.snaps.players.clear();
        client.snaps.animals.clear();
        client.snaps.npcs.clear();
        bus.emit('connection', 'open');
        bus.emit('welcome', undefined);
        bus.emit('me', undefined);
        break;
      case 'state': {
        client.timeMs = msg.timeMs;
        client.day = msg.day;
        client.lastStateAt = performance.now();
        client.serverOffset = Date.now() - msg.now;
        if (msg.season !== client.season) {
          client.season = msg.season;
          bus.emit('season', msg.season);
        }
        const seen = new Set<string>();
        for (const p of msg.players) {
          client.snaps.players.set(p.id, p);
          seen.add(p.id);
          const rec = client.world?.players[p.id];
          if (rec) {
            rec.emote = p.emote;
            if (p.id !== client.me) {
              rec.facing = p.facing;
              rec.moving = p.moving;
            }
          }
        }
        for (const id of [...client.snaps.players.keys()]) if (!seen.has(id)) client.snaps.players.delete(id);
        for (const a of msg.animals) {
          client.snaps.animals.set(a.id, a);
          const rec = client.world?.animals[a.id];
          if (rec) {
            rec.facing = a.facing;
            rec.moving = a.moving;
          }
        }
        for (const n of msg.npcs ?? []) {
          client.snaps.npcs.set(n.id, n);
          if (client.world) client.world.npcs[n.id] = { x: n.x, y: n.y, facing: n.facing, moving: n.moving, stuckMs: 0 };
        }
        bus.emit('state', undefined);
        break;
      }
      case 'changes':
        for (const c of msg.changes) applyChange(c);
        break;
      case 'error':
        bus.emit('toast', msg.text);
        break;
      case 'pong':
        break;
    }
  }
}

export const net = new Net();
