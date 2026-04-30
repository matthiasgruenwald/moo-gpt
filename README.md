# MMBbS GPT

## Installation

`better-sqlite3` ist ein natives Addon und benötigt Build-Tools:

```bash
# Debian/Ubuntu (LXC)
apt-get install -y build-essential
npm install
```

## Konfiguration

Dokumente die von der KI gelesen werden sollen, müssen im Vector Storage für den Assistenten in der openAI Oberfläche hochgeladen werden. Sollen diese Dokumente auch downloadbar sein, so müssen Sie unter gleichem Namen im Ordner **public/storage** abgelegt werden.

## Starten des Servers

Zunächst müssen die Umgebungsvariablen gesetzt werden (mindestens `APIKEY` und `AID`):

```bash
export APIKEY=sk-proj-geheim
export AID=asst_uen-geheim
```

Anschließend:

```
npm start
```

## Umgebungsvariablen

| Variable | Pflicht | Beschreibung |
|----------|---------|--------------|
| `APIKEY` | ✅ | OpenAI API Key |
| `AID` | ✅ | OpenAI Assistenten-ID |
| `ALLOWED_ORIGIN` | – | Kommagetrennte Liste erlaubter Origins (z. B. `https://moodle.mm-bbs.de`). Ohne diese Variable ist jede Origin erlaubt. |
| `MAX_REQUESTS` | – | Max. Anfragen pro IP und Tag (z. B. `4`) |
| `DB_PATH` | – | Pfad zur SQLite-Datenbankdatei (Standard: `/opt/mmbbs-gpt/chats.db`) |

## SQLite-Datenbank

Ab v1.8.0 werden alle Chats lokal in einer SQLite-Datenbank gespeichert (`chats.db`).

**Zweck:** Nachrichten lokal spiegeln, damit spätere Features (Thread-Persistenz, Lehrer-Dashboard) ohne API-Abfragen an OpenAI auskommen.

**Tabellen:**

`threads` – ein Eintrag pro OpenAI-Thread:

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | INTEGER PK | interne ID |
| `moodle_user_id` | TEXT | Moodle-User-ID (ab Issue #3) |
| `moodle_user_name` | TEXT | Anzeigename des Schülers (ab Issue #3) |
| `activity_id` | TEXT | Moodle-Aktivitäts-ID aus URL-Parameter `?id=` (ab Issue #3) |
| `openai_thread_id` | TEXT UNIQUE | Thread-ID bei OpenAI |
| `created_at` / `updated_at` | DATETIME | Timestamps |

`messages` – alle Nachrichten chronologisch:

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | INTEGER PK | interne ID |
| `thread_id` | INTEGER FK | Verweis auf `threads.id` |
| `role` | TEXT | `user` oder `assistant` |
| `content` | TEXT | Nachrichtentext |
| `created_at` | DATETIME | Timestamp |

Die DB-Datei wird beim ersten Start automatisch angelegt. Pfad per `DB_PATH`-Env-Variable überschreibbar.

## Docker Container

```
docker run -d -p 3000:3000 -e APIKEY=sk-proj-geheim -e AID=asst_uen-geheim service.joerg-tuttas.de:5555/root/mmbbs_gpt
```

**Volumes:**

- `/usr/src/app/public/storage` – Dokumente zum Herunterladen
- `/usr/src/app/config` – `server.cert` / `server.key` für HTTPS/WSS
- `/usr/src/app/chats.db` – SQLite-Datenbankdatei (neu ab v1.8.0)

## Features

### Bilderkennung

Der Bot erkennt Bilder in der Aufgabenstellung automatisch und überträgt sie an OpenAI. Voraussetzungen:

- **Modell:** zwingend `gpt-4o` – `gpt-4o-mini` unterstützt keine Bilderkennung in der Assistants API und halluziniert stattdessen
- **Bilder müssen im Moodle-Medienpool liegen** (kein CORS-Problem); sehr große Bilder oder fotografierte Schulbuchseiten können fehlschlagen – SVG oder komprimierte PNGs bevorzugen
- Diagnose: `journalctl -u mmbbs-gpt -f` – fehlendes „Füge X Bild(er) zum Thread hinzu" bedeutet, das Bild kam nicht an

Das Modell wird im OpenAI-Dashboard unter platform.openai.com/assistants gesetzt, nicht im Code.

### Einbindung per TinyMCE-Snippet

Für die Einbindung in Moodle werden zwei TinyMCE-Snippets mitgeliefert. Einrichtung und Import: → [`snippets/SNIPPET-SETUP.md`](snippets/SNIPPET-SETUP.md)

| Snippet | Datei | Verwendung |
|---------|-------|------------|
| `abgpt` | `snippets/abgpt.txt` | Moodle-Aufgaben – liest Aufgabentext und Bilder automatisch aus `.activity-description` |
| `tegpt` | `snippets/tegpt.txt` | Quiz-/Testfragen – iframe-Variante, da Quiz-Fragen `<script>`-Tags blockieren |

## Einbinden in eine Moodle-Aufgabe (Snippet: abgpt)

Der einfachste Weg ist das TinyMCE-Snippet `abgpt` (→ `snippets/abgpt.txt`). Es liest Aufgabentext und Bilder automatisch aus `.activity-description` und blendet die Konfiguration für Schüler aus.

Manuell:

```html
<script type="module" async="" id="mmbbs-bot">
    const settings = {
        "host": "gpt.gruenwald.fun",
        "protocol": "https",
        "port": 443,
        "opener": "Hallo, wie kann ich dir helfen?",
        "title": "KI-Assistent",
        "hints": "Du gibst nur Hinweise, keine fertigen Lösungen.",
        "task": document.querySelector('.activity-description')?.innerHTML || ""
    };
    import { MMBBSBOT } from 'https://gpt.gruenwald.fun/mmbbs-bot.js';
    const bot = new MMBBSBOT(settings);
</script>
```

## Einbinden in eine Moodle-Testfrage (Snippet: tegpt)

Quiz-Fragen blockieren `<script>`-Tags → iframe-Variante via `tegpt`-Snippet (→ `snippets/tegpt.txt`). Aufgabentext und Hinweise werden als URL-Parameter übergeben.

### Thread-Persistenz + Chatverlauf (ab v1.9.0 / v1.10.0)

Schüler führen ihren Chat nach einem Seitenreload oder Reconnect nahtlos weiter – der vollständige Gesprächsverlauf wird beim Öffnen des Chat-Widgets wiederhergestellt.

**Funktionsweise:**
- `mmbbs-bot.js` liest beim Verbindungsaufbau `window.M.cfg.userId`, `window.M.cfg.fullname` und die Aktivitäts-ID (`?id=` aus URL) aus und sendet diese mit dem `settings`-Handshake
- Der Server sucht in SQLite nach einem bestehenden Thread für userId + activityId. Falls gefunden, wird der OpenAI-Thread per `threads.retrieve()` wiederverwendet – kein Bildupload, keine neue Thread-Erstellung
- Falls der Thread bei OpenAI nicht mehr existiert (Ablauf), wird automatisch ein neuer angelegt
- Der Server sendet beim Reconnect den gespeicherten Chatverlauf als `type: "history"` an den Client
- Das Chat-Fenster zeigt den vollständigen Verlauf mit Zeitstempel (DD.MM., HH:MM) und einem Separator „Früheres Gespräch vom…" – der Opener-Text entfällt
- Alle neuen Nachrichten (gesendet und empfangen) erhalten ebenfalls einen Zeitstempel
- Bei `ws.onclose` wird `wsInitialized = false` gesetzt: beim nächsten Chat-Öffnen verbindet sich der Bot automatisch neu

**Voraussetzung:** Moodle muss `window.M.cfg.userId` bereitstellen (Standard im Boost-Theme). Ohne diese ID wird kein Lookup durchgeführt und ein neuer Thread angelegt.

**Hinweis Zeitzone:** Der Container muss auf `Europe/Berlin` eingestellt sein (`timedatectl set-timezone Europe/Berlin`), damit die Zeitstempel in den Logs korrekt sind. Die Zeitstempel im Chat-Fenster werden immer korrekt dargestellt, da sie clientseitig aus UTC umgerechnet werden.

## Versionsverlauf

| Version | Änderung |
|---------|----------|
| 1.10.0 | Chatverlauf beim Öffnen anzeigen, Zeitstempel auf allen Nachrichten |
| 1.9.0 | Thread-Persistenz + Reconnect (Issue #3) |
| 1.8.0 | SQLite-Logging (Issue #2) |
| 1.7.0 | Keepalive-Ping gegen Cloudflare-Timeout (Issue #1) |
| 1.6.x | Lazy-Init, Bilder-Upload via OpenAI Files API |

## ToDo / Roadmap (Branch feature/v2-issues-2-5)

- [x] Issue #1: Keepalive-Ping (v1.7.0)
- [x] Issue #2: SQLite-Logging (v1.8.0)
- [x] Issue #3: Thread-Persistenz + Reconnect + Chatverlauf (v1.9.0 / v1.10.0)
- [ ] Issue #4: Rollenerkennung (Schüler/Lehrer)
- [ ] Issue #5: Lehrer-Dashboard
