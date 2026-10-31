// Röstprat: talking to the players who are not in the room. The 📞 button bottom left and its window: your room
// and who speaks for it, the other rooms, pick up / hang up, take the speakerphone, move room, mute.
//
// Voice is per room (see shared/voice.ts). Only the room's speaker device opens the microphone and plays the other
// rooms' speakers, over WebRTC straight between the browsers; the server introduces them and relays the handshake.
// Both sides use "perfect negotiation": the one `offers()` picks is impolite, the other gives way on a collision.
import { T, mySpeaker, offers, voicePeers, type IceServer, type ServerMsg, type VoiceState } from '@lilla-garden/shared';
import { net } from '../net.js';
import { bus, client } from '../state.js';
import { SFX } from '../sound.ts';
import { clear, h, onTap } from './dom.js';

type VoiceMsg = Extract<ServerMsg, { t: 'voice' }>;
type Signal = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null };

/** Microphone level (RMS of the waveform, 0–1) that counts as talking… */
const TALK_ON = 0.035;
/** …and how long below it before the room counts as quiet (ms). */
const TALK_OFF_MS = 600;
const LEVEL_POLL_MS = 100;

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  status: 'connecting' | 'connected' | 'failed';
}

export class VoiceUi {
  /** The round 📞 button (SocialButtons puts it next to the chat). */
  readonly btn: HTMLElement;
  private box: HTMLElement;
  private body: HTMLElement;
  private state: VoiceState | null = null;
  /** Picked up (sent again after a reconnect). */
  private wanted = false;
  private roomMode: { mode: 'auto' | 'alone' } | { mode: 'with'; with: string } = { mode: 'auto' };
  private ice: IceServer[] = [];
  /** The server has sent the servers for this stint as speaker (peers wait for them). */
  private iceReady = false;
  private mic: MediaStream | null = null;
  private micPending: Promise<MediaStream | null> | null = null;
  /** No microphone on this device: it still plays the other rooms. */
  private listenOnly = false;
  private muted = false;
  private peers = new Map<string, Peer>();
  /** Signals that came before the peer existed (the other side saw the state first). */
  private early = new Map<string, Signal[]>();
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelTimer: number | null = null;
  private talking = false;
  private quietSince = 0;

  constructor(root: HTMLElement) {
    this.btn = h('div', { class: 'round small voice-btn', title: T.voiceBtn, style: { display: 'none' } }, '📞');
    onTap(this.btn, () => {
      this.ensureAudioContext(); // made on a tap, so the browser lets it play
      this.toggle();
    });
    this.body = h('div', { class: 'voice-body' });
    const close = h('button', { class: 'close' }, '✕');
    onTap(close, () => this.close());
    this.box = h('div', { class: 'chat-box voice-box', style: { display: 'none' } }, h('div', { class: 'voice-head' }, h('b', null, `📞 ${T.voiceTitle}`), close), this.body);
    root.append(this.box);
    bus.on('voice', (m) => this.onMsg(m));
    bus.on('welcome', () => this.onReconnect());
    bus.on('connection', (c) => {
      if (c === 'closed') this.closePeers();
    });
  }

  isOpen(): boolean {
    return this.box.style.display !== 'none';
  }

  open(): void {
    this.box.style.display = '';
    this.render();
  }

  close(): void {
    this.box.style.display = 'none';
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  // ---- the server ----

  private onMsg(m: VoiceMsg): void {
    switch (m.ev) {
      case 'state': {
        const before = this.state;
        this.state = m.state;
        client.talking = new Set(m.state.talking);
        this.btn.style.display = m.state.allowed ? '' : 'none';
        if (!m.state.allowed && this.wanted) this.wanted = false;
        if (!m.state.joined && this.wanted && before?.joined) this.wanted = false; // the parent hung up for us
        this.ringIfNew(before, m.state);
        void this.sync();
        this.render();
        return;
      }
      case 'ice':
        this.ice = m.servers;
        this.iceReady = true;
        void this.sync();
        return;
      case 'signal':
        void this.onSignal(m.from, m.data as Signal);
        return;
      case 'talking':
        if (m.on) client.talking.add(m.id);
        else client.talking.delete(m.id);
        if (this.isOpen()) this.render();
        return;
    }
  }

  /** Someone in another room picked up where nobody had before: a toast and a sound, like a ringing phone. */
  private ringIfNew(before: VoiceState | null, now: VoiceState): void {
    if (!before || !now.allowed) return;
    for (const r of now.rooms) {
      if (r.id === now.room || !r.speaker) continue;
      const was = before.rooms.find((o) => o.id === r.id);
      if (was?.speaker) continue;
      const name = r.members.find((mm) => mm.id === r.speaker)?.name ?? '?';
      if (!now.joined) bus.emit('toast', T.voiceRang.replace('{name}', name));
      SFX.chat();
    }
  }

  private onReconnect(): void {
    this.closePeers();
    this.state = null; // the server starts over, so should the ringing and the picked-up flag
    this.iceReady = false;
    if (this.roomMode.mode !== 'auto') net.send({ t: 'voice', a: 'room', ...this.roomMode });
    if (this.wanted) net.send({ t: 'voice', a: 'join' });
  }

  private amSpeaker(): boolean {
    return this.wanted && !!this.state && this.state.joined && mySpeaker(this.state) === client.me;
  }

  /** Brings the microphone and the connections in line with the state: open them as speaker, close them otherwise. */
  private async sync(): Promise<void> {
    if (!this.amSpeaker()) {
      this.closePeers();
      this.stopMic();
      this.iceReady = false;
      return;
    }
    const mic = await this.ensureMic();
    if ((!mic && !this.listenOnly) || !this.amSpeaker() || !this.iceReady) return;
    const want = new Set(voicePeers(this.state!));
    for (const [id, p] of this.peers) if (!want.has(id)) this.closePeer(p);
    for (const id of want) if (!this.peers.has(id)) this.newPeer(id);
    this.render();
  }

  // ---- microphone ----

  private ensureAudioContext(): AudioContext | null {
    if (this.audioCtx) {
      void this.audioCtx.resume().catch(() => {});
      return this.audioCtx;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.audioCtx = new Ctx();
    return this.audioCtx;
  }

  /**
   * Opens the microphone once. A device without one stays in the call as a listener; a browser that refuses (not
   * allowed, or a plain http address, where browsers never give out microphones) hangs up with a word about why.
   */
  private ensureMic(): Promise<MediaStream | null> {
    if (this.mic || this.listenOnly) return Promise.resolve(this.mic);
    if (this.micPending) return this.micPending;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      bus.emit('toast', T.voiceNeedsHttps);
      this.hangUp();
      return Promise.resolve(null);
    }
    this.micPending = navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      .then((stream) => {
        this.micPending = null;
        if (!this.wanted) {
          for (const t of stream.getTracks()) t.stop();
          return null;
        }
        this.mic = stream;
        for (const t of stream.getAudioTracks()) t.enabled = !this.muted;
        this.watchLevel(stream);
        return stream;
      })
      .catch((e: unknown) => {
        this.micPending = null;
        const name = e instanceof Error ? e.name : String(e);
        if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
          // no microphone here (a desktop computer, often): listen all the same
          this.listenOnly = true;
          bus.emit('toast', T.voiceListenOnly);
          return null;
        }
        bus.emit('toast', name === 'NotReadableError' || name === 'AbortError' ? T.voiceMicBusy : name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError' ? T.voiceNoMic : `${T.voiceNoMic} (${name})`);
        this.hangUp();
        return null;
      });
    return this.micPending;
  }

  private stopMic(): void {
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
    this.analyser?.disconnect();
    this.analyser = null;
    if (this.mic) for (const t of this.mic.getTracks()) t.stop();
    this.mic = null;
    this.setTalking(false);
  }

  /** Tells the server when this room starts and stops talking (a 🔊 by the speaker's name for everyone). */
  private watchLevel(stream: MediaStream): void {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      const src = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
    } catch {
      return;
    }
    const buf = new Uint8Array(this.analyser.fftSize);
    this.levelTimer = window.setInterval(() => {
      if (!this.analyser || this.muted) return this.setTalking(false);
      this.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (rms > TALK_ON) {
        this.quietSince = now;
        this.setTalking(true);
      } else if (this.talking && now - this.quietSince > TALK_OFF_MS) this.setTalking(false);
    }, LEVEL_POLL_MS);
  }

  private setTalking(on: boolean): void {
    if (on === this.talking) return;
    this.talking = on;
    if (on) client.talking.add(client.me);
    else client.talking.delete(client.me);
    net.send({ t: 'voice', a: 'talking', on });
  }

  // ---- the other rooms' speakers ----

  private newPeer(id: string): void {
    const pc = new RTCPeerConnection({ iceServers: this.ice.map((s) => ({ urls: s.urls, ...(s.username ? { username: s.username, credential: s.credential ?? '' } : {}) })) });
    const audio = h('audio', { autoplay: 'true', playsinline: 'true' });
    audio.style.display = 'none';
    document.body.append(audio);
    const peer: Peer = { id, pc, audio, polite: !offers(client.me, id), makingOffer: false, ignoreOffer: false, status: 'connecting' };
    this.peers.set(id, peer);
    if (this.mic) for (const t of this.mic.getAudioTracks()) pc.addTrack(t, this.mic);
    else pc.addTransceiver('audio', { direction: 'recvonly' }); // no microphone: still an audio line to hear them on
    pc.ontrack = (ev) => {
      audio.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
      audio.play().catch(() => {});
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.signal(id, { candidate: ev.candidate.toJSON() });
    };
    pc.onnegotiationneeded = async () => {
      // the polite side waits for the other's offer and answers it (fewer collisions on older browsers)
      if (peer.polite && !pc.remoteDescription) return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription(await pc.createOffer());
        if (pc.localDescription) this.signal(id, { description: pc.localDescription.toJSON() });
      } catch (e) {
        console.error('voice offer', e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        peer.status = 'failed';
        if (!peer.polite) pc.restartIce?.();
      }
      this.render();
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      peer.status = s === 'connected' ? 'connected' : s === 'failed' || s === 'disconnected' ? 'failed' : 'connecting';
      if (s === 'failed' && !peer.polite) pc.restartIce?.();
      this.render();
    };
    const queued = this.early.get(id);
    this.early.delete(id);
    if (queued) for (const sg of queued) void this.onSignal(id, sg);
  }

  private closePeer(p: Peer): void {
    this.peers.delete(p.id);
    p.pc.onicecandidate = null;
    p.pc.onnegotiationneeded = null;
    p.pc.ontrack = null;
    p.pc.onconnectionstatechange = null;
    p.pc.oniceconnectionstatechange = null;
    try {
      p.pc.close();
    } catch {
      /* already closed */
    }
    p.audio.srcObject = null;
    p.audio.remove();
  }

  private closePeers(): void {
    for (const p of [...this.peers.values()]) this.closePeer(p);
    this.early.clear();
  }

  private signal(to: string, data: Signal): void {
    net.send({ t: 'voice', a: 'signal', to, data });
  }

  private async onSignal(from: string, data: Signal): Promise<void> {
    if (!data || typeof data !== 'object') return;
    const peer = this.peers.get(from);
    if (!peer) {
      // not ours yet: keep it if we are (about to be) the speaker and they speak for another room
      if (!this.state || !this.state.joined || !voicePeers(this.state).includes(from)) return;
      const q = this.early.get(from) ?? [];
      if (q.length < 64) q.push(data);
      this.early.set(from, q);
      void this.sync();
      return;
    }
    const { pc } = peer;
    try {
      if (data.description) {
        const d = data.description;
        const collision = d.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(d);
        if (d.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          if (pc.localDescription) this.signal(from, { description: pc.localDescription.toJSON() });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          if (!peer.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.error('voice signal', e);
    }
  }

  // ---- what you do ----

  private pickUp(): void {
    this.wanted = true;
    this.listenOnly = false;
    this.ensureAudioContext();
    // nobody speaks for the room yet, so this device is about to: ask for the microphone now, on the tap (some
    // browsers only give it out on a user's action), and the server's answer finds it ready
    if (this.state && !mySpeaker(this.state)) void this.ensureMic();
    net.send({ t: 'voice', a: 'join' });
  }

  private hangUp(): void {
    this.wanted = false;
    net.send({ t: 'voice', a: 'leave' });
    this.closePeers();
    this.stopMic();
    this.listenOnly = false;
    this.iceReady = false;
    this.render();
  }

  private setRoom(mode: typeof this.roomMode): void {
    this.roomMode = mode;
    net.send({ t: 'voice', a: 'room', ...mode });
  }

  private setMuted(v: boolean): void {
    this.muted = v;
    if (this.mic) for (const t of this.mic.getAudioTracks()) t.enabled = !v;
    if (v) this.setTalking(false);
    this.render();
  }

  // ---- the window ----

  private render(): void {
    const st = this.state;
    const speaking = this.amSpeaker();
    this.btn.classList.toggle('on', !!st?.joined);
    this.btn.classList.toggle('muted', speaking && this.muted);
    this.btn.textContent = speaking && this.muted ? '📵' : '📞';
    if (!this.isOpen()) return;
    clear(this.body);
    if (!st || !st.allowed) {
      this.close();
      return;
    }
    const me = client.me;
    const names = (ids: string[], r: VoiceState['rooms'][number]) => ids.map((id) => r.members.find((m) => m.id === id)?.name ?? '?');
    this.body.append(h('p', { class: 'voice-hint' }, T.voiceHint));

    // my room
    const mine = st.rooms.find((r) => r.id === st.room);
    const speaker = mySpeaker(st);
    const roomLine = (r: VoiceState['rooms'][number]) =>
      h(
        'div',
        { class: 'voice-members' },
        r.members.map((m) => h('span', { class: `voice-member${m.id === r.speaker ? ' speaker' : ''}${m.id === me ? ' me' : ''}` }, m.name, m.id === r.speaker ? ' 📱' : '', client.talking.has(m.id) ? ' 🔊' : '')),
      );
    const my = h('div', { class: 'voice-room mine' }, h('b', null, `${T.voiceMyRoom}: `), mine ? roomLine(mine) : null);
    const speakerName = speaker && mine ? names([speaker], mine)[0] : null;
    my.append(h('div', { class: 'voice-status' }, speaking ? T.voiceYouSpeaker : speakerName ? T.voiceSpeaker.replace('{name}', speakerName) : T.voiceNoSpeaker));
    const actions = h('div', { class: 'voice-row' });
    const call = h('button', { class: st.joined ? 'alt' : '' }, st.joined ? T.voiceHangUp : T.voiceCall);
    onTap(call, () => (st.joined ? this.hangUp() : this.pickUp()));
    actions.append(call);
    if (st.joined && !speaking) {
      const take = h('button', { class: 'alt' }, T.voiceBeSpeaker);
      onTap(take, () => {
        void this.ensureMic(); // on the tap, see pickUp
        net.send({ t: 'voice', a: 'speaker' });
      });
      actions.append(take);
    }
    if (speaking && this.listenOnly) my.append(h('div', { class: 'voice-status' }, T.voiceListenOnlyStatus));
    if (speaking && !this.listenOnly) {
      const mute = h('button', { class: 'alt' }, this.muted ? T.voiceUnmute : T.voiceMute);
      onTap(mute, () => this.setMuted(!this.muted));
      actions.append(mute);
    }
    my.append(actions);
    // where I really am
    const where = h('div', { class: 'voice-row' });
    if (this.roomMode.mode !== 'auto') {
      const back = h('button', { class: 'alt small' }, T.voiceBack);
      onTap(back, () => this.setRoom({ mode: 'auto' }));
      where.append(back);
    }
    if (this.roomMode.mode !== 'alone' && (mine?.members.length ?? 0) > 1) {
      const alone = h('button', { class: 'alt small' }, T.voiceAlone);
      onTap(alone, () => this.setRoom({ mode: 'alone' }));
      where.append(alone);
    }
    for (const r of st.rooms) {
      if (r.id === st.room) continue;
      const other = r.members.find((m) => m.id !== me);
      if (!other) continue;
      const b = h('button', { class: 'alt small' }, T.voiceWith.replace('{name}', other.name));
      onTap(b, () => this.setRoom({ mode: 'with', with: other.id }));
      where.append(b);
    }
    if (where.childElementCount) my.append(where);
    this.body.append(my);

    // the other rooms
    const others = st.rooms.filter((r) => r.id !== st.room);
    if (others.length) {
      const list = h('div', { class: 'voice-others' }, h('b', null, `${T.voiceOtherRooms}:`));
      for (const r of others) {
        const line = h('div', { class: 'voice-room' }, roomLine(r));
        if (!r.speaker) line.append(h('span', { class: 'voice-status' }, T.voiceNoSpeaker));
        else if (speaking) {
          const p = this.peers.get(r.speaker);
          const s = p?.status ?? 'connecting';
          line.append(h('span', { class: `voice-status ${s}` }, s === 'connected' ? T.voiceConnected : s === 'failed' ? T.voiceFailed : T.voiceConnecting));
        }
        list.append(line);
      }
      if (st.joined && !others.some((r) => r.speaker)) list.append(h('div', { class: 'voice-status' }, T.voiceNobodyElse));
      this.body.append(list);
    }
  }
}
