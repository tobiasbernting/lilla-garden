// Push notifications to the parent's phone through ntfy (https://ntfy.sh, or a self-hosted server).
import type { LogEntry } from './access.ts';

interface Note {
  title: string;
  priority: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

/** Which gate events are worth a push, and how loud. */
const NOTES: Record<string, Note> = {
  join: { title: 'Någon kom in på gården', priority: 3, tags: ['farmer'] },
  'join-waiting': { title: 'Någon väntar på att få komma in', priority: 4, tags: ['hourglass'] },
  reopened: { title: 'En enhet öppnades igen', priority: 3, tags: ['key'] },
  'join-blocked': { title: 'Många fel koder – inbjudningar spärrade en stund', priority: 4, tags: ['warning'] },
  login: { title: 'Förälder loggade in', priority: 2, tags: ['lock'] },
  'login-failed': { title: 'Misslyckad inloggning på föräldrasidan', priority: 4, tags: ['warning'] },
  'login-blocked': { title: 'Föräldrasidan spärrad efter för många försök', priority: 5, tags: ['rotating_light'] },
};

/**
 * `url` is the topic URL, e.g. http://ntfy.example.lan/lilla-garden. Messages are published as JSON to the server
 * root, so Swedish letters survive. Failures are logged, never thrown: the game must not wait for a phone.
 */
export function ntfyNotifier(url: string, token?: string): (e: LogEntry) => void {
  const u = new URL(url);
  const topic = u.pathname.replace(/^\/+|\/+$/g, '');
  if (!topic || topic.includes('/')) throw new Error(`NTFY_URL must be a topic URL like http://ntfy.example/lilla-garden, got ${url}`);
  const root = u.origin;
  return (e) => {
    const note = NOTES[e.event];
    if (!note) return;
    fetch(root, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ topic, title: note.title, message: `${e.detail}\n${e.ip}`, priority: note.priority, tags: note.tags }),
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => {
        if (!r.ok) console.error(`ntfy answered ${r.status}`);
      })
      .catch((err: unknown) => console.error('could not reach ntfy', err instanceof Error ? err.message : err));
  };
}
