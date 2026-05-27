# Handoff: v3.0.0 Release-Vorbereitung

**Ziel der nächsten Session:** v3.0.0 offiziell taggen und releasen.

---

## Aktueller Stand

Alle Feature-Issues für v3.0.0 sind geschlossen (#59–#113). Die Dokumentation ist
weitgehend aktuell. Zwei Dinge stehen noch aus, bevor getaggt werden kann:

### 1. Finales Refactoring (offen, nicht als Issue erfasst)

Matthias hat ein letztes Refactoring erwähnt. Details noch unklar — beim Aufnehmen
der Session kurz erfragen was gemeint ist.

### 2. Ordner-Aufräumen (offen, nicht als Issue erfasst)

Die Projektstruktur soll vor dem Release aufgeräumt werden. Auch hier Details beim
Start der Session klären.

### 3. Dashboard-Überblick-Screenshot (offen)

`docs/moodle.md` hat noch den Platzhalter `> 📸 *Screenshot: Überblick-Seite (folgt)*`.
Matthias wartet auf echte Chat-Daten in der DB, um einen repräsentativen Screenshot
machen zu können. Kein Handlungsbedarf jetzt.

---

## Was in dieser Session erledigt wurde

- **Docs vollständig auf v3.0.0 gebracht:**
  - README: alle neuen Features ergänzt (Audio, TTS, Memory, Prompt-Tools, Stop-Button, …)
  - `docs/moodle.md`: neue Sektionen (Plenumsmodus, Prompt-Assistent, Prompt-Check,
    Memory, Audio), veraltete Quiz/tegpt-Abschnitte entfernt
  - `docs/snippets.md`: abgpt/tegpt → moo-gpt.txt umbenannt
  - `CLAUDE.md`, `CONTRIBUTING.md`, `INSTALL.md`: tegpt-Verweise bereinigt
  - Screenshot-Platzhalter entfernt (nur Überblick-Seite noch offen)

- **Screenshots aktualisiert:**
  - `docs/images/Schülerchat.png` — neu
  - `docs/images/Aktivitätseinstellungen.png` — neu
  - `docs/images/Admin-Snippet-einfügen.gif` — neu (animiert, Snippet-Import)

- **Release Notes vervollständigt:** `docs/plans/release-3.0.0.md`
  - Status auf "ausstehend: Refactoring + Ordner" aktualisiert
  - 4 Dashboard-Bereiche (war 3), Config-UX-Cleanup, Modell pro Aktivität
  - Werkzeug-Kosten ausformuliert
  - Audio-Details ergänzt (tts-1-hd, History-Button, 🎤-Icon)
  - For developers: Server-Refactoring #73–79, ADR 0003/0004, neue Module + Endpoints

- **`.gitignore`:** `AGENTS.md` hinzugefügt

---

## Release-Prozess (wenn bereit)

Siehe `docs/plans/release-3.0.0.md` — dort steht der Tag-Befehl und wie der
Release-Body auf GitHub eingefügt wird.

Kurzfassung:
1. `package.json` Version auf `3.0.0` setzen
2. `git tag -a v3.0.0 -m "v3.0.0 – Lehrer-Werkzeugkasten & stabile Architektur"`
3. `git push origin v3.0.0`
4. GitHub → Releases → „v3.0.0" → Release-Body aus `docs/plans/release-3.0.0.md`
   (ab der zweiten Trennlinie)

---

## Offene GitHub Issues

| # | Titel | Priorität |
|---|---|---|
| #6 | Chat-Verwaltung: Neue Chats, Archivierung & sicheres Löschen | mittel |
| #9 | Snippet für Lehrer-Übersicht über mehrere Aktivitäten | niedrig |
| #22 | Lehrkraft-eigene Bot-Avatare per Dashboard | niedrig |
| #32 | Azure OpenAI / EU-Inferenz-Residency | niedrig |

Diese Issues gehören **nicht** zu v3.0.0 — sie sind für danach.

---

## Empfohlene Skills für die nächste Session

- `/karpathy-guidelines` — vor Code-Änderungen aktivieren
- `/grill-with-docs` — falls das Refactoring/Aufräumen Architektur-Entscheidungen erfordert
