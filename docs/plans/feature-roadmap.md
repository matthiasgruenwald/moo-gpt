# moo-gpt Feature-Roadmap — Implementierungsplan

## Context

moo-gpt (Node/Express + SQLite + WebSocket) soll in einer geordneten Serie von Paketen erweitert werden. Jedes Paket ist ein eigenes GitHub-Issue, folgt TDD, und wird mit Conventional Commits abgeschlossen. Sicherheitskritische Pakete (P8, P10) bekommen zusätzlich `/security-review`.

---

## Dependency-Graph

```
P1 (Bugs) ─────┐
P2 (UX)  ──────┤
P3 (Plenum) ───┤──► P4 (Rename Code) ──► P4a (Rename Infra) ──► P5 (Config) ──► P10 (OSS)
                │                                             └──► P6 (Personas) ──► P7 (One-Click) ──┘
P8 (Debug) ────┘ (eigenständig)
P9 (Grafik) ─────── (eigenständig, parallel zu P5–P7)
```

---

## Workflow pro Paket

1. Refactoring betroffener Dateien (nur was zum Paket gehört)
2. Tests zuerst (`.test.js` oder HTTP-Requests in `test.http`)
3. Implementierung
4. Code-Review mit `/review` Skill
5. Security-Check bei P8, P10 mit `/security-review`
6. Commit (`feat:` / `fix:` / `refactor:`) + `gh issue close`

---

## P1 — Bugs (3 Issues)

### B1: Enter-Taste für Kriterien-Eingabe

**Datei:** `public/dashboard.js`

Nach dem bestehenden `click`-Listener auf `#criteria-add-btn` (ca. Zeile 1139) einen `keydown`-Listener auf `#criteria-input` einfügen:

```js
document.getElementById('criteria-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('criteria-add-btn').click();
});
```

### B2: GPT-Modell-Anzeige leer

**Root cause (wahrscheinlich):** `populateGenModelSelects` (dashboard.js:25) wird durch `applySettingsData` aufgerufen (Zeile 899), das nur läuft wenn `loadSettings()` nicht durch Token-Fehler abbricht. Debug-Pfad:
- `GET /api/admin/config?token=…` in DevTools prüfen — gibt er 200 + `genModels`?
- Wenn 403: Token-Weitergabe im URL-Parameter prüfen (`params.get('token')` Zeile 12)
- `GEN_MODELS` auf server.js:247 ist korrekt definiert
- Fix: falls `token` leer ist, Fallback oder Fehlermeldung im Dashboard

**Dateien:** `public/dashboard.js`, ggf. `server.js`

### B3: Versionshistorie — Expand + Delete

**Betrifft:** `loadPromptHistory()` (dashboard.js:983) und `loadErfahrungspromptHistory()` (dashboard.js:1462)

**Frontend (dashboard.js):** Expand- und Delete-Button pro History-Item; Expand via CSS-Transition; Delete via `DELETE /api/admin/prompt-history/:id`.

**Backend (server.js):**
```
DELETE /api/admin/prompt-history/:id?token=
DELETE /api/erfahrungsprompt-history/:id?activityId=&token=
```

**db.js:** `deletePromptHistoryEntry(id)` und `deleteErfahrungspromptHistoryEntry(id)` — Guard: nie die Zeile mit höchster `version` löschen.

---

## P2 — UX: Button-States + Gelöschte Vorschläge (2 Issues)

### U1: Button-States

`#criteria-suggest-btn` und `#personas-suggest-btn` im Click-Handler: `btn.disabled = true` vor `try`, `btn.disabled = false` in `finally`.

**Datei:** `public/dashboard.js`

### U2: Gelöschte Kriterien wieder anzeigen (Soft-Delete)

**DB-Migration:**
```sql
ALTER TABLE erkenntnisse ADD COLUMN status TEXT DEFAULT 'active';
```

**db.js:** `getCriteria` → `AND status='active'`; `softDeleteCriterion(id)`; `restoreCriterion(id)`

**server.js:** `DELETE /api/criteria/:id` → soft delete; neuer `PATCH /api/criteria/:id/restore`

**dashboard.js:** Abschnitt "Verworfene Vorschläge" mit Restore-Button

---

## P3 — Plenumsphase (1 Issue)

**server.js:** `const activityLocks = new Map()` + Routen `POST/DELETE /api/activity/:activityId/lock?token=`

**moo-bot.js:** WS-Handler für `type === 'locked'` / `'unlocked'` → Overlay

**dashboard.js:** Lock/Unlock-Button, Timer-Input, Status-Badge

---

## P4 — Umbenennung Code: mmbbs-gpt → moo-gpt ✓ done

Scope: `db.js`, `public/mmbbs-bot.js` → `moo-bot.js`, `index.html`, `README.md`, `snippets/abgpt.txt`, `snippets/tegpt.txt` (Inhalt, nicht Dateinamen), `package.json`.

---

## P4a — Umbenennung Infra: mmbbs-gpt → moo-gpt

Voraussetzung: P4 ✓

**Schritte (auf LXC als root):**

1. Dienst stoppen: `systemctl stop mmbbs-gpt`
2. Ordner umbenennen: `mv /opt/mmbbs-gpt /opt/moo-gpt`
3. Env-Datei verschieben: `mv /etc/mmbbs-gpt.env /etc/moo-gpt.env`
4. Systemd-Unit umbenennen: `mv /etc/systemd/system/mmbbs-gpt.service /etc/systemd/system/moo-gpt.service` — darin `WorkingDirectory` und `EnvironmentFile` auf neue Pfade anpassen
5. `systemctl daemon-reload && systemctl enable moo-gpt && systemctl start moo-gpt`
6. LXC-Hostname: `hostnamectl set-hostname moo-gpt` (im Container)
7. Proxmox: Container in der UI umbenennen (optional, kosmetisch)
8. GitHub-Repo umbenennen: Settings → Rename → `moo-gpt` (optional, bricht bestehende Clone-URLs)

**Nacharbeiten im Repo (nach Infra-Rename):**
- `CLAUDE.md`: 10 Infra-Zeilen auf neue Pfade aktualisieren
- `db.js:8`: `DB_PATH`-Default → `/opt/moo-gpt/chats.db`

**Verification:** `grep -rE "mmbbs" . | grep -v ".git"` → 0 Treffer

---

## P5 — Konfig-Seite (1 Issue)

Neue Dateien: `public/config.html`, `public/config.js`. Auth wie Dashboard. Felder: Aktivitätsname, Opener, Upload-Modus, Bot-Icon, Modell, Aufgabenprompt.

---

## P6 — Personas-Umbau (1 Issue, groß)

DB: `personas.teacher_id`, neue Tabelle `global_personas`, `activities.course_id`. Neue db.js-Funktionen. 10 globale Seed-Personas via `seeds/personas.js`.

---

## P7 — One-Click Optimierung (1 Issue)

**Voraussetzung: P6.** Endpoint `POST /api/one-click-optimize`: Kriterien → Personas → Simulation → Vorschlag → Bestätigung.

---

## P8 — Debugging-Zugriff Admin-only (1 Issue)

**Sicherheitskritisch — `/security-review` vor Commit.**

Routen mit `isAdmin` Guard: `GET /api/admin/logs`, `POST /api/admin/restart`, `POST /api/admin/git-pull` — alle via `execFileSync` mit fester Befehls-Whitelist, kein Shell-String.

---

## P9 — Grafische Darstellung (2 Teilaufgaben)

A: `docs/architecture.md` mit Mermaid-Diagramm. B: Info-Tab im Dashboard.

---

## P10 — Repository-Veröffentlichung (letztes Paket)

**Nach allen anderen. `/security-review` + manuell.** API-Keys prüfen, `.env.example`, `README.md` neu, `CHANGELOG.md`, `LICENSE`, Repo public.

---

## Verification pro Paket

- **P1/P2:** Browser-Test + `test.http`
- **P3:** Zwei Sessions (Lehrer + Schüler), Lock/Unlock-Zyklus
- **P4:** `grep -rE "mmbbs" . | grep -v ".git"` → 0 Treffer
- **P5:** Config-Seite mit echtem Moodle-Token
- **P6:** `seeds/personas.js` ausführen, Personas sichtbar
- **P7:** One-Click ohne vorherige Schülerdaten
- **P8:** Als Admin einloggen, kein freier Shell-Input
- **P9:** Mermaid in GitHub-Preview
- **P10:** `npm install && node server.js` auf frischer Instanz
