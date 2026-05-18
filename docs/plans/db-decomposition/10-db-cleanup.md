# Schritt 10: db.js aufräumen

Nach Extraktion aller Stores und Umstellen aller Caller: db.js auf reinen
Initialisierungs-Hub reduzieren. Keine Re-Exports — alle Aufrufer importieren
bereits direkt aus den Stores.

---

## Erwartete Struktur von db.js danach

```
db.js (~40 Zeilen)
├── import Database from 'better-sqlite3'
├── const DB_PATH
├── let _db (privat)
├── export function initDb()    ← Schema + Migrationen (unverändert)
└── export function getDb()     ← interner Handle für Stores
```

---

## Finale db.js

```js
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/opt/moo-gpt/chats.db';
let _db;

export function initDb() {
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = OFF');
  // ... CREATE TABLE IF NOT EXISTS (unverändert)
  // ... Migrationen (unverändert)
  console.log(`[DB] SQLite initialisiert: ${DB_PATH}`);
  return _db;
}

export function getDb() { return _db; }
```

Keine weiteren Exports. Alle Stores importieren `getDb` aus `'../db.js'`.

---

## Prüfung vor dem Cleanup

Sicherstellen, dass kein Caller mehr direkt aus db.js importiert (außer initDb/getDb):

```bash
grep -rn "from ['\"].*db\.js['\"]" /opt/moo-gpt --include="*.js" \
  | grep -v "stores/" \
  | grep -v "node_modules"
```

Erwartetes Ergebnis: nur `server.js` (für `initDb`) und die 10 Store-Dateien (für `getDb`).

---

## Ergebnis

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| db.js Zeilen | 701 | ~40 |
| db.js Exports (direkt) | 53 | 2 (initDb, getDb) |
| Neue Dateien | — | 10 (stores/*.js) |
| Gesamt-Zeilen (JS) | ~2.600 | ~2.700 |

---

## Finaler Smoke-Test

```bash
systemctl restart moo-gpt
journalctl -u moo-gpt -n 20 --no-pager
```

1. Chat-Widget → Nachricht senden → Antwort kommt
2. Dashboard → Schülerliste + Kosten sichtbar
3. Aktivität sperren → Widget zeigt Sperre
4. GET /api/admin/config → antwortet
5. Simulation starten → SSE-Stream läuft durch
6. Persona anlegen → erscheint in Liste
7. Erfahrungsprompt bearbeiten → gespeichert
