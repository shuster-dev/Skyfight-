// Talking to the server: the account and the hangar over HTTP, the arena over
// a websocket. The token lives on the device; it is the guest's whole account
// until they save it with a username and a password.
import { Client } from 'colyseus.js';

const TOKEN = 'sky.token';
const store = {
  get: () => { try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); } catch {} },
};

export class Net {
  constructor() {
    this.base = location.origin;
    this.ws = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    this.token = store.get();
    this.client = new Client(this.ws);
  }

  async api(path, body) {
    let r;
    try {
      r = await fetch(this.base + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error('offline'), { code: 'offline' });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'error'), { code: j.error || 'error', status: r.status });
    if (j.token) this.token = j.token, store.set(j.token);
    return j;
  }

  /**
   * Who am I: the saved token if it still works, a new guest if not. A
   * sleeping server (the free plan naps) takes a while to answer: keep asking.
   */
  async session(onWait) {
    for (let i = 0; ; i++) {
      try {
        if (this.token) {
          try { return await this.api('/api/me'); } catch (e) { if (e.status !== 401) throw e; this.token = ''; store.set(''); }
        }
        return await this.api('/api/guest', {});
      } catch (e) {
        if (i > 14) throw e;
        onWait?.(i);
        await new Promise((r) => setTimeout(r, Math.min(6000, 1200 * (i + 1))));
      }
    }
  }

  logout() { this.token = ''; store.set(''); }

  /** Into the arena. Resolves with the room; `hello` tells it we are listening. */
  async join() {
    const room = await this.client.joinOrCreate('arena', { token: this.token });
    return room;
  }
}
