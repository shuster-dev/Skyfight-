// Who is around right now, for the friends list: a pilot seen by the server
// lately is in the hangar; one with a plane in a room is in the air there,
// and a friend can be brought straight into that room. Kept in memory — it
// is about this minute, not about history.
const SEEN_MS = 90e3;
const seen = new Map();   // pilot id -> last time the hangar heard from them
const flying = new Map(); // pilot id -> { room, mode, at }

export const presence = {
  seen(id, now = Date.now()) {
    seen.set(id, now);
    if (seen.size > 50000) seen.delete(seen.keys().next().value);
  },
  enter(id, room, mode) { flying.set(id, { room, mode, at: Date.now() }); },
  leave(id, room) { if (flying.get(id)?.room === room) flying.delete(id); },
  /**
   * How many people are on right now: in a room, or heard from in the last
   * minute and a half (the hangar asks every few seconds). Bots are not
   * people and are never here.
   */
  online(now = Date.now()) {
    const ids = new Set(flying.keys());
    for (const [id, t] of seen) if (now - t < SEEN_MS) ids.add(id);
    return ids.size;
  },
  /** Who is on right now, by pilot id: for the admin's list. */
  onlineIds(now = Date.now()) {
    const ids = new Set(flying.keys());
    for (const [id, t] of seen) if (now - t < SEEN_MS) ids.add(id);
    return [...ids];
  },
  /** 'air' (and where), 'hangar', or 'off'. */
  of(id, now = Date.now()) {
    const f = flying.get(id);
    if (f) return { state: 'air', room: f.room, mode: f.mode };
    return { state: now - (seen.get(id) || 0) < SEEN_MS ? 'hangar' : 'off' };
  },
};
