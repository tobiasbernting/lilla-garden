// 2D game: chat with everyone in the world, buttons that tell your pets to stay or whistle for them,
// and the weather chip.
import { CHAT_MAX_LEN, CHAT_PHRASES, T, WEATHER_EMOJI, WEATHER_NAMES, isBathKey, isCallable, localWeather, noWeatherHere, type Change } from '@lilla-garden/shared';
import { net } from '../net.js';
import { bus, client, myPlayer } from '../state.js';
import { SFX } from '../sound.ts';
import { clear, h, onTap } from './dom.js';

type ChatLine = Extract<Change, { t: 'chat' }>;

/** How long a line stays in the chat log on screen. */
const LOG_MS = 15_000;
const LOG_LINES = 5;

export class Chat {
  private log: HTMLElement;
  private box: HTMLElement;
  private input: HTMLInputElement;
  private lines: { line: ChatLine; el: HTMLElement; at: number }[] = [];
  /** Called when the chat box opens or closes (the game stops reading the keyboard while it is open). */
  onToggle: (open: boolean) => void = () => {};

  constructor(root: HTMLElement) {
    this.log = h('div', { class: 'chat-log' });
    this.input = h('input', { type: 'text', maxlength: String(CHAT_MAX_LEN), autocomplete: 'off', enterkeyhint: 'send', placeholder: 'Skriv något till alla…' }) as HTMLInputElement;
    const send = h('button', null, 'Skicka');
    onTap(send, () => this.send(this.input.value));
    const close = h('button', { class: 'close' }, '✕');
    onTap(close, () => this.close());
    const phrases = h('div', { class: 'chat-phrases' });
    for (const p of CHAT_PHRASES) {
      const b = h('button', { class: 'alt' }, p);
      onTap(b, () => this.send(p));
      phrases.append(b);
    }
    this.box = h('div', { class: 'chat-box', style: { display: 'none' } }, phrases, h('div', { class: 'chat-row' }, this.input, send, close));
    // keep keys away from the game while typing (Phaser listens on window)
    for (const ev of ['keydown', 'keyup', 'keypress'] as const)
      this.input.addEventListener(ev, (e) => {
        e.stopPropagation();
        if (ev !== 'keydown') return;
        const k = (e as KeyboardEvent).key;
        if (k === 'Enter') this.send(this.input.value);
        else if (k === 'Escape') this.close();
      });
    root.append(this.log, this.box);
    bus.on('chat', (c) => this.add(c));
    bus.on('welcome', () => {
      clear(this.log);
      this.lines = [];
    });
    setInterval(() => this.fade(), 1000);
  }

  isOpen(): boolean {
    return this.box.style.display !== 'none';
  }

  open(): void {
    if (this.isOpen()) return;
    this.box.style.display = '';
    this.log.classList.add('open');
    for (const l of this.lines) l.el.classList.remove('gone');
    this.onToggle(true);
    setTimeout(() => this.input.focus(), 30);
  }

  close(): void {
    if (!this.isOpen()) return;
    this.box.style.display = 'none';
    this.log.classList.remove('open');
    this.input.blur();
    this.input.value = '';
    this.onToggle(false);
    this.fade();
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  private send(text: string): void {
    const t = text.trim();
    if (t) net.send({ t: 'chat', text: t });
    this.close();
  }

  private add(c: ChatLine): void {
    const mine = c.from === client.me;
    const el = h('div', { class: `chat-line${mine ? ' mine' : ''}` }, h('b', null, `${c.name}: `), c.text);
    this.log.append(el);
    this.lines.push({ line: c, el, at: c.old ? 0 : performance.now() });
    while (this.lines.length > 30) this.lines.shift()!.el.remove();
    if (!c.old && !mine) SFX.chat();
    this.fade();
  }

  /** Old lines fade out unless the chat box is open; only the last few show. */
  private fade(): void {
    const now = performance.now();
    const open = this.isOpen();
    this.lines.forEach((l, i) => {
      const recent = i >= this.lines.length - (open ? 12 : LOG_LINES);
      l.el.classList.toggle('gone', !recent || (!open && now - l.at > LOG_MS));
    });
  }
}

/** Your pets and horses, on any map. */
export function myCallables(): { name: string; species: string }[] {
  const out: { name: string; species: string }[] = [];
  const me = client.me;
  for (const w of [client.world, ...Object.values(client.areas)]) {
    if (!w) continue;
    for (const a of Object.values(w.animals)) if (a.owner === me && isCallable(a)) out.push({ name: a.name, species: a.species });
  }
  return out;
}

/** Bottom-left buttons: chat, and (once you have a pet or horse) stay and whistle. */
export class SocialButtons {
  readonly el: HTMLElement;
  private stay: HTMLElement;
  private come: HTMLElement;

  constructor(root: HTMLElement, chat: Chat) {
    const talk = h('div', { class: 'round small', title: 'Prata med alla (Enter eller T)' }, '💬');
    onTap(talk, () => chat.toggle());
    this.stay = h('div', { class: 'round small pet-btn', title: `${T.petsStayBtn} (X)` }, h('span', null, '✋'), h('i', null, T.petsStayBtn));
    onTap(this.stay, () => petCommand('stay'));
    this.come = h('div', { class: 'round small pet-btn', title: `${T.petsComeBtn} (V)` }, h('span', null, '🎵'), h('i', null, T.petsComeBtn));
    onTap(this.come, () => petCommand('come'));
    this.el = h('div', { class: 'social' }, talk, this.stay, this.come);
    root.append(this.el);
    const refresh = () => this.refresh();
    bus.on('change', (c) => {
      if (c.t === 'animal' || c.t === 'areaData') refresh();
    });
    bus.on('welcome', refresh);
    bus.on('area', refresh);
    refresh();
  }

  private refresh(): void {
    const any = myCallables().length > 0;
    this.stay.style.display = any ? '' : 'none';
    this.come.style.display = any ? '' : 'none';
  }
}

export function petCommand(cmd: 'stay' | 'come'): void {
  net.send({ t: 'pets', cmd });
}

/** The weather where you are, for the chip at the top (null in caves, the bath house and on the moon). */
export function weatherChip(): HTMLElement | null {
  const w = client.weather;
  const me = myPlayer();
  if (!w || !me || noWeatherHere(me.area) || isBathKey(me.area)) return null;
  const biome = me.area === 'farm' ? undefined : client.areas[me.area]?.biome;
  const kind = localWeather(w.kind, biome);
  return h('div', { class: 'chip weather', title: WEATHER_NAMES[kind] ?? '' }, `${WEATHER_EMOJI[kind] ?? ''} ${WEATHER_NAMES[kind] ?? ''}`);
}
