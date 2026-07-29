/**
 * The visitor's liked films.
 *
 * The library has no public sign-in — only admins have accounts, and every
 * table is RLS deny-all — so a like is stored in the visitor's own browser
 * rather than the database. That keeps it instant and private, with the
 * trade-off that a like belongs to one browser: it does not follow you to
 * another device. Moving it server-side later only needs this module and the
 * `ids` branch of /api/clips to change.
 *
 * Exposed as an external store so components can read it with
 * useSyncExternalStore instead of copying it into state inside an effect.
 *
 * Newest like first, which is the order the liked page renders.
 */

const KEY = 'apex.liked.v1';

/** Fired on every change so open components re-read. */
export const LIKES_CHANGED = 'apex:likes-changed';

/** Stable identity for "nothing liked" — a fresh [] each read would loop. */
const EMPTY: readonly string[] = Object.freeze([]);

const canStore = () => typeof window !== 'undefined' && !!window.localStorage;

// getSnapshot must return the same reference until the data actually changes,
// so the parsed list is memoised against the raw string it came from.
let cachedRaw: string | null = null;
let cachedList: readonly string[] = EMPTY;

function parse(raw: string | null): readonly string[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const ids = parsed.filter((v): v is string => typeof v === 'string');
    return ids.length === 0 ? EMPTY : ids;
  } catch {
    return EMPTY;
  }
}

/** Current likes. Same reference until they change. */
export function likesSnapshot(): readonly string[] {
  if (!canStore()) return EMPTY;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Private mode or blocked storage — behave as "nothing liked".
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = parse(raw);
  }
  return cachedList;
}

/** The server has no idea what this browser liked. */
export function likesServerSnapshot(): readonly string[] {
  return EMPTY;
}

export function subscribeLikes(onChange: () => void): () => void {
  window.addEventListener(LIKES_CHANGED, onChange);
  // `storage` covers the same list being changed in another tab.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(LIKES_CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function write(ids: readonly string[]) {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage full or blocked — nothing more we can do */
  }
  window.dispatchEvent(new CustomEvent(LIKES_CHANGED));
}

export function toggleLike(clipId: string) {
  const current = likesSnapshot();
  write(current.includes(clipId) ? current.filter((id) => id !== clipId) : [clipId, ...current]);
}
