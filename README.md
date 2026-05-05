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
| `MODEL_NAME` | ✅ | Standard-Modell beim Erststart, z. B. `gpt-5`. Beim ersten Start in die DB migriert – danach im Dashboard änderbar. |
| `SYSTEM_PROMPT` | – | System-Prompt beim Erststart. Beim ersten Start in die DB migriert – danach im Dashboard änderbar. |
| `ADMIN_USER_IDS` | – | Kommagetrennte Moodle-User-IDs der initialen Admins, z. B. `12345,67890`. Beim Start automatisch in die DB eingetragen (idempotent). Danach können Admins weitere Admins im Dashboard verwalten. Fallback: direkt per SQL in `admin_users` eintragen. |
| `AVAILABLE_MODELS` | – | Kommagetrennte Liste der im Dashboard angebotenen Modelle, z. B. `gpt-5,gpt-4o,gpt-4.1-mini,gpt-4.1-nano`. Alle Modelle müssen Vision unterstützen. Standard: nur `MODEL_NAME`. |
| `TEACHER_USER_IDS` | – | Kommagetrennte Moodle-User-IDs, die server-seitig als Lehrkraft eingestuft werden (unabhängig vom Client-Flag). |
| `ALLOWED_ORIGIN` | – | Kommagetrennte Liste erlaubter Origins (z. B. `https://moodle.mm-bbs.de`). Ohne diese Variable ist jede Origin erlaubt. |
| `MAX_REQUESTS` | – | Max. Anfragen pro IP und Tag (z. B. `4`) |
| `DB_PATH` | – | Pfad zur SQLite-Datenbankdatei (Standard: `/opt/mmbbs-gpt/chats.db`) |

### Beispiel `/etc/mmbbs-gpt.env`

```env
APIKEY=sk-proj-...
MODEL_NAME=gpt-5
SYSTEM_PROMPT=Du bist ein freundlicher Lehrer...
ADMIN_USER_IDS=12345,67890
AVAILABLE_MODELS=gpt-5,gpt-4o,gpt-4.1-mini,gpt-4.1-nano
TEACHER_USER_IDS=12345,67890
ALLOWED_ORIGIN=https://moodle.beispiel.de
DB_PATH=/opt/mmbbs-gpt/chats.db
```

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

`activities` – Aufgabentitel je Aktivitäts-ID (ab v2.0.0):

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `activity_id` | TEXT PK | Moodle-Aktivitäts-ID |
| `activity_name` | TEXT | Aufgabentitel (aus Moodle-DOM) |
| `updated_at` | DATETIME | Letztes Update |

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

### Rollenerkennung (ab v1.11.0)

`mmbbs-bot.js` erkennt automatisch, ob der aktuelle Nutzer Trainer oder Teilnehmer ist, und sendet ein `isTeacher`-Flag mit dem Settings-Handshake an den Server. Dort steht es als `ws.isTeacher` bereit (Basis für Issue #5: Lehrer-Dashboard).

**Erkennungslogik:**

- **Trainer:** Das Formular `form[action*="editmode.php"]` (Bearbeiten-Button oben rechts) ist in Moodle für alle Trainer auf allen Seiten sichtbar, für Teilnehmer nie.
- **„Als Teilnehmer ansehen":** Wenn ein Trainer per Rollenwechsel in die Teilnehmeransicht wechselt, setzt Moodle die Body-Klasse `userswitchedrole`. In diesem Fall wird `isTeacher=false` gesendet, auch wenn der Nutzer eigentlich Trainer ist.
- Kombiniert: `isTeacher = form[action*="editmode.php"] vorhanden UND NICHT userswitchedrole`

**Optionaler Server-Override:** Die Env-Variable `TEACHER_USER_IDS` (kommagetrennte Moodle-UserIds) markiert Nutzer serverseitig als Trainer – unabhängig vom Client-Flag. Nützlich, falls die DOM-Erkennung in einem anderen Theme nicht funktioniert.

> ⚠️ **Abhängigkeit vom Theme:** Der Erkennungsmechanismus basiert auf dem DOM-Element `form[action*="editmode.php"]`, das im Boost-Theme vorhanden ist. Bei anderen Themes oder nach Moodle-Updates prüfen, ob dieses Element noch existiert. Testen: In der Browser-Konsole `document.querySelector('form[action*="editmode.php"]') !== null` ausführen – muss für Trainer `true` und für Teilnehmer `false` ergeben. Als Fallback `TEACHER_USER_IDS` in der `.env` setzen.

**Bekannte Lücke:** `tegpt` (iframe-Einbindung für Quiz-Fragen) hat keinen Zugriff auf das Parent-DOM und kann die Rolle nicht erkennen – separates Issue geplant.

### Lehrer-Dashboard (ab v2.0.0, Issue #5)

Trainer sehen einen zusätzlichen Dashboard-Button (blaues Viereck-Icon) über dem Chat-Button. Ein Klick öffnet `dashboard.html` in einem neuen Tab.

**Zugang:** Nur mit serverseitig generiertem Token möglich. Der Token wird beim Öffnen des Chats als Trainer automatisch per WebSocket zugeschickt und in der Dashboard-URL übergeben. Direktaufrufe ohne Token werden abgelehnt.

**Funktionen:**
- Schülerliste mit Name, letzter Aktivität (relativ), Nachrichtenanzahl
- Sortierung nach Name oder letzter Aktivität
- Klick auf einen Schüler zeigt den vollständigen Chatverlauf (read-only)
- Live-Updates: neue Nachrichten erscheinen sofort in der Liste und im offenen Chat (WebSocket Fan-out)
- Pulsierender grüner Punkt bei Aktivität in den letzten 2 Minuten

**Layout:** Split-Panel ab 768 px (Liste links, Chat rechts); Liste→Detail darunter mit Zurück-Button.

**Schülernamen:** Werden beim ersten Chat-Öffnen aus dem Moodle-DOM ermittelt und in SQLite gespeichert. Bekannte Einschränkung: In der moodle-nds.de-Installation liefert weder `M.cfg.fullname` noch `img.userpicture[alt]` den Namen (beide leer). Fallback: `Schüler (ID 14)`. Namen können nachgefüllt werden, sobald eine zuverlässige API-Quelle gefunden ist.

**Aufgabentitel:** Wird beim ersten Chat (Lehrer oder Schüler) aus dem Moodle-DOM gelesen und in der `activities`-Tabelle gespeichert. Das Dashboard liest den Titel direkt aus der DB.

**Token-Gültigkeit:** 8 Stunden. Nach Ablauf muss der Lehrer den Chat-Button einmal klicken, um einen neuen Token zu erhalten.

**Bekannte Sicherheitslücke:** `isTeacher`-Flag wird client-seitig gesetzt (DOM-Check) und ist fälschbar. Separates Issue geplant.

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
| 2.0.0 | Lehrer-Dashboard (Issue #5): dashboard.html/js, Token-Auth, Fan-out, activities-Tabelle |
| 1.11.0 | Rollenerkennung Trainer/Teilnehmer via DOM + userswitchedrole (Issue #4) |
| 1.10.0 | Chatverlauf beim Öffnen anzeigen, Zeitstempel auf allen Nachrichten |
| 1.9.0 | Thread-Persistenz + Reconnect (Issue #3) |
| 1.8.0 | SQLite-Logging (Issue #2) |
| 1.7.0 | Keepalive-Ping gegen Cloudflare-Timeout (Issue #1) |
| 1.6.x | Lazy-Init, Bilder-Upload via OpenAI Files API |

## ToDo / Roadmap

- [x] Issue #1: Keepalive-Ping (v1.7.0)
- [x] Issue #2: SQLite-Logging (v1.8.0)
- [x] Issue #3: Thread-Persistenz + Reconnect + Chatverlauf (v1.9.0 / v1.10.0)
- [x] Issue #4: Rollenerkennung (v1.11.0)
- [x] Issue #5: Lehrer-Dashboard (v2.0.0)
- [ ] Issue #6: Rollenerkennung für tegpt (iframe)
- [ ] Schülernamen in moodle-nds.de zuverlässig ermitteln (M.cfg.fullname fehlt, img[alt] leer, AJAX-Endpoint durch CSP blockiert)
- [ ] isTeacher server-seitig absichern (aktuell client-seitiger DOM-Check, fälschbar)
