// Persistence: accounts and pilots. One interface, two drivers.
//
// `memory` is the default so `npm run dev` and the tests need no database
// (DATA_FILE keeps it across restarts). `mongo` is loaded only when
// DB_DRIVER=mongo.
//
// A pilot is one live object per id, shared by the room that is paying them
// and the hangar that is charging them: both hold the same object, so a kill
// and a purchase in the same second cannot overwrite each other.
import fs from 'node:fs';
import path from 'node:path';

const board = (p, i) => ({ rank: i + 1, name: p.name, level: p.level, kills: p.kills || 0, plane: p.plane });
const BOARD_SORT = { level: (a, b) => (b.xp || 0) - (a.xp || 0), kills: (a, b) => (b.kills || 0) - (a.kills || 0) };

class MemoryStore {
  constructor({ file = process.env.DATA_FILE || '' } = {}) {
    this.file = file;
    this.users = new Map();   // id -> user
    this.names = new Map();   // username -> id
    this.pilots = new Map();  // id -> pilot
    if (this.file && fs.existsSync(this.file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        for (const u of raw.users || []) this.users.set(u.id, u), u.username && this.names.set(u.username, u.id);
        for (const p of raw.pilots || []) this.pilots.set(p.id, p);
      } catch (e) { console.warn('[store] could not read', this.file, e.message); }
    }
  }
  _flush() {
    // many writes in a burst (a dogfight) become one
    if (!this.file || this._t) return;
    this._t = setTimeout(() => this._write(), 500);
  }
  _write() {
    clearTimeout(this._t), this._t = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ users: [...this.users.values()], pilots: [...this.pilots.values()] }));
    } catch (e) { console.warn('[store] could not write', e.message); }
  }
  async connect() { return this; }
  async close() { if (this._t) this._write(); }
  async findUserByName(username) { const id = this.names.get(username); return id ? this.users.get(id) : null; }
  async findUser(id) { return this.users.get(id) || null; }
  async createUser(u) { this.users.set(u.id, u); u.username && this.names.set(u.username, u.id); this._flush(); return u; }
  async saveUser(u) {
    for (const [n, id] of this.names) if (id === u.id && n !== u.username) this.names.delete(n);
    this.users.set(u.id, u); u.username && this.names.set(u.username, u.id); this._flush(); return u;
  }
  async getPilot(id) { return this.pilots.get(id) || null; }
  async savePilot(p) { this.pilots.set(p.id, p); this._flush(); return p; }
  async leaderboard(kind = 'level', limit = 20) {
    return [...this.pilots.values()].filter((p) => p.name).sort(BOARD_SORT[kind] || BOARD_SORT.level).slice(0, limit).map(board);
  }
}

class MongoStore {
  constructor({ url, dbName = 'skyfight' }) {
    this.url = url; this.dbName = dbName;
    this.live = new Map();     // id -> the one pilot object
    this.loading = new Map();  // id -> the read in flight
    this.writes = new Map();   // id -> the write in flight
    this.again = new Set();    // ids changed while their write was out
  }
  async connect() {
    const { MongoClient } = await import('mongodb');
    this.client = new MongoClient(this.url);
    await this.client.connect();
    const db = this.client.db(this.dbName);
    this.usersC = db.collection('users');
    this.pilotsC = db.collection('pilots');
    await this.usersC.createIndex({ id: 1 }, { unique: true });
    await this.usersC.createIndex({ username: 1 }, { unique: true, sparse: true });
    await this.pilotsC.createIndex({ id: 1 }, { unique: true });
    await this.pilotsC.createIndex({ xp: -1 });
    await this.pilotsC.createIndex({ kills: -1 });
    return this;
  }
  async close() { await Promise.allSettled([...this.writes.values()]); await this.client?.close(); }
  async findUserByName(username) { return this.usersC.findOne({ username }, { projection: { _id: 0 } }); }
  async findUser(id) { return this.usersC.findOne({ id }, { projection: { _id: 0 } }); }
  async createUser(u) { await this.usersC.insertOne({ ...u }); return u; }
  async saveUser(u) {
    const { username, ...rest } = u;
    // a guest has no username: unset it rather than store null under a unique index
    await this.usersC.replaceOne({ id: u.id }, username ? { ...rest, username } : rest);
    return u;
  }
  async getPilot(id) {
    if (this.live.has(id)) return this.live.get(id);
    let read = this.loading.get(id);
    if (!read) {
      read = this.pilotsC.findOne({ id }, { projection: { _id: 0 } }).then((p) => {
        if (this.live.has(id)) return this.live.get(id);
        if (p) this.live.set(id, p);
        return p || null;
      }).finally(() => this.loading.delete(id));
      this.loading.set(id, read);
    }
    return read;
  }
  async savePilot(p) {
    this.live.set(p.id, p);
    // one write at a time per pilot; a change during it queues one more
    if (this.writes.has(p.id)) { this.again.add(p.id); return p; }
    const run = async () => {
      do {
        this.again.delete(p.id);
        await this.pilotsC.replaceOne({ id: p.id }, { ...p }, { upsert: true }).catch((e) => console.warn('[store] save', e.message));
      } while (this.again.has(p.id));
    };
    const w = run().finally(() => this.writes.delete(p.id));
    this.writes.set(p.id, w);
    // the cache is bounded: forget pilots nobody has touched in a while
    if (this.live.size > 5000) for (const k of this.live.keys()) { if (!this.writes.has(k)) { this.live.delete(k); break; } }
    return p;
  }
  async leaderboard(kind = 'level', limit = 20) {
    const sort = kind === 'kills' ? { kills: -1 } : { xp: -1 };
    const rows = await this.pilotsC.find({ name: { $exists: true, $ne: '' } }, { projection: { _id: 0 } }).sort(sort).limit(limit).toArray();
    return rows.map(board);
  }
}

export async function openStore() {
  if ((process.env.DB_DRIVER || 'memory') === 'mongo') {
    if (!process.env.MONGO_URL) throw new Error('DB_DRIVER=mongo needs MONGO_URL');
    return new MongoStore({ url: process.env.MONGO_URL, dbName: process.env.MONGO_DB || 'skyfight' }).connect();
  }
  return new MemoryStore().connect();
}
