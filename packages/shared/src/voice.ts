// Röstprat: talking to the players who are not in the same room as you.
//
// Voice is per room, not per player. Every device belongs to a room (by default everyone behind the same public
// address, i.e. the same home Wi-Fi); you never hear the players in your own room, they are next to you. One device
// per room is the "högtalare": the only one that opens its microphone and plays the other rooms' voices, a
// speakerphone on the table. The others in the room never ask for a microphone. Speakers of different rooms talk
// to each other directly (WebRTC); the server only introduces them and relays the handshake.

/** Who may use voice: nobody, family devices, or guests too. */
export type VoicePolicy = 'off' | 'family' | 'open';
export const VOICE_POLICIES: VoicePolicy[] = ['off', 'family', 'open'];

export interface VoiceRoom {
  /** Opaque id (never the address it was made from). */
  id: string;
  /** Everyone online in this room, joined or not. */
  members: { id: string; name: string; joined: boolean }[];
  /** The player whose device is the room's speakerphone, or null when nobody there has picked up. */
  speaker: string | null;
}

export interface VoiceState {
  /** Whether this device may use voice at all (the parent's choice, and guests may be left out). */
  allowed: boolean;
  /** Your room's id. */
  room: string;
  /** Whether you have picked up (want voice). */
  joined: boolean;
  rooms: VoiceRoom[];
  /** Speakers whose room is talking right now. */
  talking: string[];
}

/** STUN/TURN servers, as RTCPeerConnection wants them. */
export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

/** Signals (SDP, ICE candidates) per second one speaker may send. */
export const VOICE_SIGNALS_PER_SEC = 40;
/** The longest signal relayed (a session description with many candidates is a few kB). */
export const VOICE_SIGNAL_MAX = 16 * 1024;
/** Shortest time between two talking on/off reports from one speaker. */
export const VOICE_TALKING_MIN_MS = 150;

/** The speakers of the other rooms: the ones your device connects to when it is your room's speaker. */
export function voicePeers(state: VoiceState): string[] {
  return state.rooms.filter((r) => r.id !== state.room && r.speaker).map((r) => r.speaker!);
}

/** Which of two speakers makes the offer: the same answer on both sides, so they never both offer at once. */
export const offers = (me: string, peer: string): boolean => me < peer;

/** Your room's speaker, or null. */
export function mySpeaker(state: VoiceState): string | null {
  return state.rooms.find((r) => r.id === state.room)?.speaker ?? null;
}
