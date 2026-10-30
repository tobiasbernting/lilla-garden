// 2D game: text chat between everyone playing in the same world.

export const CHAT_MAX_LEN = 80;
/** Shortest time between two messages from one player. */
export const CHAT_COOLDOWN_MS = 600;
/** Messages a player who just came online gets to read. */
export const CHAT_HISTORY = 20;
/** How long a message shows in a bubble over the speaker's head. */
export const CHAT_BUBBLE_MS = 6000;

/** Ready-made words for the ones who cannot (or do not want to) type. */
export const CHAT_PHRASES = ['Hej! 👋', 'Kom hit!', 'Titta här! 👀', 'Hjälp mig!', 'Tack! ❤️', 'Ja!', 'Nej', 'Vänta på mig!', 'Följ mig!', 'Haha 😂', 'Godnatt! 💤', 'Hejdå!'];

/** One line of plain text: no control characters, no runs of spaces, not too long. Empty if nothing is left. */
export function cleanChat(text: unknown): string {
  if (typeof text !== 'string') return '';
  const flat = text
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...flat].slice(0, CHAT_MAX_LEN).join('').trim();
}
