# Schritt 10: db.js aufräumen

Nach Extraktion aller Stores und Umstellen aller Caller: db.js auf reinen
Initialisierungs-Hub reduzieren. Keine Re-Exports — alle Aufrufer importieren
bereits direkt aus den Stores.

**Hinweis:** Alle Code-Änderungen wurden bereits in Schritte 01–09 integriert
(Strategie: Caller-Update im selben Schritt wie Store-Extraktion). Schritt 10
ist ein reiner Verifikations- und Smoke-Test-Schritt ohne weiteren Implementierungs-
aufwand.

---

## Erwartete Struktur von db.js danach

```
db.js (~193 Zeilen)
├── import Database from 'better-sqlite3'
├── const DB_PATH
├── let db (privat, nicht exportiert)
├── export function getDb()    ← interner Handle für Stores
└── export function initDb()   ← Schema + Migrationen (unverändert, ~180 Zeilen)
```

---

## Finale db.js

```js
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/opt/moo-gpt/chats.db';
let db;

export function getDb() { return db; }

export function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');
  // ... CREATE TABLE IF NOT EXISTS (unverändert, alle 11 Tabellen)
  // ... Migrationen (unverändert, try/catch ALTER TABLE + 2 komplexe Migrationen)
  console.log(`[DB] SQLite initialisiert: ${DB_PATH}`);
  return db;
}
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

Dieser Check ist bereits im Soll-Zustand — Ausgabe beim letzten Lauf:
```
/opt/moo-gpt/server.js:12:import { initDb } from './db.js';
```

---

## Ergebnis

| Metrik | Vorher (nach Schritt 09) | Nachher |
|--------|--------------------------|---------|
| db.js Zeilen | ~193 | ~193 (unverändert) |
| db.js Exports (direkt) | 2 (initDb, getDb) | 2 (initDb, getDb) |
| Store-Dateien | 10 | 10 |
| Domain-Funktionen in db.js | 0 | 0 |

---

## Testen

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
8. Dashboard → Chat-Nachricht bewerten (👍/👎) → Feedback gespeichert
9. Dashboard → Erfahrungsprompt-Vorschlag generieren → SSE-Stream läuft durch
