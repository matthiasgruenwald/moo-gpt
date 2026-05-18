# Installation & Konfiguration

> **Getestet auf:** Debian 12 LXC-Container auf Proxmox. Für andere Umgebungen (andere Linux-Distributionen, VMs, native Server) sind die Schritte weitgehend identisch – Paketnamen und Pfade können abweichen. Eine KI-Assistenz (z. B. Claude Code) kann notwendige Anpassungen auf Nachfrage zuverlässig vornehmen.

## Voraussetzungen

- Linux-Server, VM oder LXC-Container (Debian/Ubuntu empfohlen)
- Node.js 22
- OpenAI-API-Key (platform.openai.com)

## Installation

`better-sqlite3` ist ein natives Addon und benötigt Build-Tools:

```bash
apt-get install -y build-essential
npm install
```

## Umgebungsvariablen

Alle Konfiguration erfolgt über Umgebungsvariablen. Empfohlen: `/etc/moo-gpt.env`

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `APIKEY` | ✅ | OpenAI API Key |
| `MODEL_NAME` | ✅ | Standard-Modell beim Erststart, z. B. `gpt-5`. Wird beim ersten Start in die DB migriert – danach im Dashboard änderbar. |
| `SYSTEM_PROMPT` | – | System-Prompt beim Erststart. Wird beim ersten Start in die DB migriert – danach im Dashboard änderbar. |
| `ADMIN_USER_IDS` | – | Kommagetrennte Moodle-User-IDs der initialen Admins, z. B. `12345,67890`. Idempotent beim Start eingetragen. Danach im Dashboard verwaltbar. |
| `AVAILABLE_MODELS` | – | Kommagetrennte Liste der im Dashboard angebotenen Modelle, z. B. `gpt-5,gpt-4o,gpt-4.1-mini`. Alle Modelle müssen Vision unterstützen. Standard: nur `MODEL_NAME`. |
| `TEACHER_USER_IDS` | – | Kommagetrennte Moodle-User-IDs, die serverseitig als Lehrkraft eingestuft werden – unabhängig vom Client-Flag. Nützlich als Fallback bei abweichenden Themes. |
| `ALLOWED_ORIGIN` | – | Kommagetrennte Liste erlaubter Origins, z. B. `https://moodle.beispiel.de`. Ohne diese Variable ist jede Origin erlaubt. |
| `MAX_REQUESTS` | – | Max. Anfragen pro IP und Tag, z. B. `4`. |
| `DB_PATH` | – | Pfad zur SQLite-Datenbankdatei. Standard: `./chats.db` |

### Beispiel `/etc/moo-gpt.env`

```env
APIKEY=sk-proj-...
MODEL_NAME=gpt-5
SYSTEM_PROMPT=Du bist ein freundlicher Lern-Assistent...
ADMIN_USER_IDS=12345,67890
AVAILABLE_MODELS=gpt-5,gpt-4o,gpt-4.1-mini
TEACHER_USER_IDS=12345,67890
ALLOWED_ORIGIN=https://moodle.beispiel.de
DB_PATH=/opt/moo-gpt/chats.db
```

## Server starten

```bash
npm start
```

## Als Systemdienst einrichten (empfohlen)

Beispiel-Unit `/etc/systemd/system/moo-gpt.service`:

```ini
[Unit]
Description=moo-gpt
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/moo-gpt
EnvironmentFile=/etc/moo-gpt.env
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable moo-gpt
systemctl start moo-gpt
journalctl -u moo-gpt -f   # Logs verfolgen
```

## Docker

Kein fertiges Image vorhanden – Image selbst bauen:

```bash
docker build -t moo-gpt .
docker run -d -p 3000:3000 \
  --env-file /etc/moo-gpt.env \
  -v /opt/moo-gpt/chats.db:/usr/src/app/chats.db \
  -v /opt/moo-gpt/public/storage:/usr/src/app/public/storage \
  moo-gpt
```

> Ein `Dockerfile` ist noch nicht im Repository enthalten. Pull Requests willkommen.

## Reverse Proxy / HTTPS

moo-gpt erwartet HTTPS und WebSocket-Upgrade. Empfohlen: Nginx oder Caddy als Reverse Proxy, Cloudflare Tunnel oder vergleichbar.

Der Server lauscht auf Port `3000`. WebSocket-Pfad: `/api/chat`

## Zeitzone

Für korrekte Log-Zeitstempel:

```bash
timedatectl set-timezone Europe/Berlin
```

Die Zeitstempel im Chat-Fenster werden unabhängig davon korrekt dargestellt (clientseitig aus UTC umgerechnet).

## Dokumente für die KI (Vector Storage)

Dokumente, die der KI-Assistent lesen soll, müssen im OpenAI-Dashboard unter platform.openai.com hochgeladen werden. Sollen diese Dokumente auch für Schüler herunterladbar sein, die Dateien unter gleichem Namen in `public/storage/` ablegen.
