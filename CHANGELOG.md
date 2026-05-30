# Changelog

Alle bemerkenswerten Änderungen an moo-gpt werden hier dokumentiert.

Ab v3.0.0 wird der Changelog strukturiert und transparent geführt — mit Git-Tags, Conventional Commits und automatisch generiertem Entwurf via `git-cliff`. Ältere Versionen: Tabelle am Ende dieser Datei.

---

## [3.0.0] — 2026-05-30

### ⚠️ Breaking Changes

- **Datenbankschema erweitert** — automatische Migration beim nächsten Start. Sicherheitskopie vor dem Update empfohlen: `cp /path/to/moo-gpt.db /path/to/moo-gpt.db.bak`
- **`teacher_preferences.preferred_model` entfernt** — Modellwahl ist jetzt pro Aktivität, nicht mehr lehrerweit. Bestehende Aktivitäten erben das zuletzt gesetzte Lehrer-Modell.

### 🚀 Features

- **Audio-Eingabe**: Spracheingabe per Mikrofon mit automatischer Transkription (OpenAI Whisper)
- **TTS-Ausgabe**: KI-Antworten vorlesen lassen (OpenAI TTS, Stimme konfigurierbar, Auto-Play optional)
- **Live-Unterrichts-Überblick**: thematische Zusammenfassung aller Schüler-Chats auf Knopfdruck, gruppierte Übersicht aktiver und inaktiver Schüler
- **Schüler-Memory**: Schüler können ihr Memory im Chat einsehen und bearbeiten; Lehrkräfte verwalten es im Dashboard
- **Plenumsmodus**: Chat für alle Schüler einer Aktivität sperren — aus Widget oder Dashboard, manuell oder mit Timer
- **Prompt-Assistent**: Aufgabenprompt per KI-Dialog erstellen (mit Rückfragen) oder direkt generieren
- **Prompt-Check**: Prompt auf Schwachstellen analysieren und verbesserten Vorschlag übernehmen
- **Modell pro Aktivität**: GPT-Modell wird pro Aktivität gespeichert (nicht mehr lehrerweit)

### 🌟 Enhancements

- **KI-Antworten inline bearbeitbar**: Dashboard-Antworten versioniert bearbeitbar; Schüler sehen immer die aktive Version
- **Widget-Position umschaltbar**: Chat links oder rechts positionieren, gespeichert für die Browsersitzung
- **Config-Overlay überarbeitet**: Felder gruppiert, einklappbar, progressive Disclosure
- **Dashboard Kostenübersicht**: TTS- und Whisper-Kosten separat ausgewiesen
- **Schülerkosten im Dashboard**: Token-Kosten pro Schüler scrollbar aufgelistet
- **Snippet-Hinweis-Block**: `moogpt.txt` als Editor-Hinweis direkt beim Einbetten in Moodle

### 🐛 Bug Fixes

- Fix: Aufgabenkontext fehlte im Rückfragen-Modus (#141)
- Fix: Erfahrungsprompt-State nach Sim-Speichern nicht sofort aktuell (#142)
- Fix: Config-Overlay öffnete links, wenn Chat bereits geöffnet war (#112)
- Fix: Schüler-Memory-Overlay zeigte `[object Object]` statt Inhalt (#109)

---

## Ältere Versionen

| Version | Änderung |
|---|---|
| 2.0.0 | Lehrer-Dashboard, Token-Auth, Fan-out, activities-Tabelle |
| 1.11.0 | Rollenerkennung Lehrer/Schüler via DOM + userswitchedrole |
| 1.10.0 | Chatverlauf beim Öffnen anzeigen, Zeitstempel auf allen Nachrichten |
| 1.9.0 | Thread-Persistenz + Reconnect |
| 1.8.0 | SQLite-Logging |
| 1.7.0 | Keepalive-Ping gegen Cloudflare-Timeout |
| 1.6.x | Lazy-Init, Bilder-Upload via OpenAI Files API |
