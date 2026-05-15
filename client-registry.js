class ClientRegistry {
  constructor() {
    this._map = new Map();
  }

  register(activityId, ws) {
    const id = String(activityId);
    if (!this._map.has(id)) this._map.set(id, new Set());
    this._map.get(id).add(ws);
  }

  unregister(activityId, ws) {
    const id = String(activityId);
    const set = this._map.get(id);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this._map.delete(id);
  }

  broadcast(activityId, payload) {
    const clients = this._map.get(String(activityId));
    if (!clients) return;
    const msg = JSON.stringify(payload);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(msg, (err) => { if (err) console.error('[Registry] send error:', err); });
    }
  }

  broadcastAll(payload) {
    const msg = JSON.stringify(payload);
    for (const clients of this._map.values()) {
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) ws.send(msg, (err) => { if (err) console.error('[Registry] send error:', err); });
      }
    }
  }
}

export { ClientRegistry };
