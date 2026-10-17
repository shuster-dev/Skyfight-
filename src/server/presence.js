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
  /** 'air' (and where), 'hangar', or 'off'. */
  of(id, now = Date.now()) {
    const f = flying.get(id);
    if (f) return { state: 'air', room: f.room, mode: f.mode };
    return { state: now - (seen.get(id) || 0) < SEEN_MS ? 'hangar' : 'off' };
  },
};
