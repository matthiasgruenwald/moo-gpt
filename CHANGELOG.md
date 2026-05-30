# Changelog

Alle bemerkenswerten Änderungen an moo-gpt werden hier dokumentiert.

Ab v3.0.0 wird der Changelog strukturiert und transparent geführt — mit Git-Tags, Conventional Commits und automatisch generiertem Entwurf via [`git-cliff`](https://git-cliff.org). Ältere Versionen: Tabelle am Ende dieser Datei.

---

## [3.0.0] — 2026-05-30

### ⚠️ Breaking Changes

- **OpenAI Assistants API → Responses API** — Die interne KI-Anbindung wurde vollständig migriert (Assistants API wird von OpenAI im August 2026 abgekündigt). Kein Handlungsbedarf, bestehende Chats bleiben erhalten. Service-Neustart nach Update genügt.
- **Datenbankschema erweitert** — automatische Migration beim nächsten Start. Sicherheitskopie vor dem Update empfohlen: `cp /path/to/moo-gpt.db /path/to/moo-gpt.db.bak`
- **`teacher_preferences.preferred_model` entfernt** — Modellwahl ist jetzt pro Aktivität, nicht mehr lehrerweit. Bestehende Aktivitäten erben das zuletzt gesetzte Lehrer-Modell.

### 🚀 Features

**Chat-Widget**
- **Audio-Eingabe**: Spracheingabe per Mikrofon mit automatischer Transkription (OpenAI Whisper) (#23)
- **TTS-Ausgabe**: KI-Antworten vorlesen lassen (OpenAI TTS, Stimme konfigurierbar, Auto-Play optional) (#24)
- **Dateiupload**: Bilder und PDFs direkt im Chat hochladen und an die KI übergeben (#10)
- **Plenumsmodus**: Chat für alle Schüler einer Aktivität sperren — aus Widget oder Dashboard, manuell oder mit Timer (#43)
- **Schüler-Memory**: Schüler können ihr Memory im Chat einsehen und bearbeiten (#46)

**Dashboard & Unterrichtssteuerung**
- **Live-Unterrichts-Überblick**: thematische Zusammenfassung aller Schüler-Chats auf Knopfdruck, gruppierte Übersicht aktiver und inaktiver Schüler (#52)
- **Schüler-Memory verwalten**: Lehrkräfte verwalten alle Schüler-Memories im Dashboard (#54)
- **KI-Antworten bearbeitbar**: Dashboard-Antworten mit Versionierung inline bearbeitbar; Schüler sehen die aktive Version (#45)
- **Werkzeug-Kosten-Übersicht**: Token-Kosten pro Aktivität und Werkzeug-Typ im Dashboard /costs — inkl. Admin-Sicht über alle Lehrkräfte (#59)
- **LaTeX-Rendering**: Mathematische Formeln werden im Dashboard korrekt dargestellt (#16)
- **Bilder- und PDF-Vorschau**: Zoom-Ansicht für Anhänge im Chat und Dashboard (#15)

**Prompt & Modell**
- **Prompt-Assistent**: Aufgabenprompt per KI-Dialog erstellen (Rückfragen-Modus) oder direkt generieren (Direktmodus) (#47, #55)
- **Prompt-Check**: Prompt auf Schwachstellen analysieren, Word-Level-Diff, verbesserten Vorschlag übernehmen (#38)
- **Prompt-Verwaltung**: Vollständige Versionshistorie aller Prompt-Änderungen pro Aktivität (#18)
- **Modell pro Aktivität**: GPT-Modell wird pro Aktivität gespeichert und konfiguriert (#107)
- **Dashboard: Systemprompt anpassbar**: Lehrkräfte können Systemprompt und Modell direkt im Dashboard einsehen und anpassen (#17)

**Simulation & Optimierung** *(Einstellung geplant — Prompt-Assistent und Prompt-Check decken diesen Bedarf effektiver ab)*
- Personas & Simulation: Synthetische Schüler-Äußerungen generieren und Prompt testen (#21)
- Prompt-Optimierung: Automatischer Verbesserungsvorschlag aus Simulations-Ergebnissen (#20)
- One-Click-Optimierung: Vollautomatischer Durchlauf ohne manuellen Eingriff (#31)
- Feedback-Bewertung: Schülerantworten im Dashboard bewerten (#19)

### 🌟 Enhancements

- **Widget-Position umschaltbar**: Chat links oder rechts positionieren, gespeichert für die Browsersitzung (#42)
- **Config-Overlay überarbeitet**: Felder gruppiert, einklappbar, progressive Disclosure (#94)
- **TTS-Button in Chat-History**: Lautsprecher-Icon auch an älteren Bot-Nachrichten im Verlauf (#113)
- **Memory-Button im Chat-Header**: 🧠-Popover direkt im Widget-Kopf, kein separates Menü (#110)
- **Audio-Felder in Vorlagen**: TTS- und Whisper-Einstellungen in Lehrer-Vorlagen und config.html (#111)
- **Mic-Icon bei transkribierten Nachrichten**: Dashboard zeigt, welche Nachrichten per Sprache eingegeben wurden (#88)
- **audioInput-Parameter im Snippet**: `abgpt.txt`-Snippet enthält Audio-Konfiguration direkt (#89)
- **Dashboard-Navigation**: Tab-Leiste mit persistenter letzter Seite (localStorage) (#49)
- **Admin-Sicht Kostenübersicht**: Aufklappbare Lehrer-Übersicht in /dashboard/costs (#72)
- **Schülerkosten scrollbar**: Token-Kosten pro Schüler aufgelistet, scrollbar (#106)
- **TTS- und Whisper-Kosten**: Separat ausgewiesen in Dashboard-Kostenübersicht (#93)
- **Snippet-Hinweis-Block**: `moogpt.txt` als Editor-Hinweis direkt beim Einbetten in Moodle (#108)

### 🔒 Security

- Fix: `isTeacher`-Flag war client-seitig fälschbar — Rollenerkennung jetzt serverseitig validiert (#8)

### 🐛 Bug Fixes

- Fix: Aufgabenkontext fehlte im Rückfragen-Modus des Prompt-Assistenten (#141)
- Fix: Erfahrungsprompt-State nach Sim-Speichern nicht sofort aktuell (#142)
- Fix: Prompt-Assistent übernahm Bilder nicht und aktualisierte State nach Speichern nicht (#140)
- Fix: Prompt-Assistent stellte nur 2 statt 5 Rückfragen — Gesprächsverlauf wurde nicht korrekt übergeben (#56)
- Fix: Config-Overlay öffnete links, wenn Chat bereits geöffnet war (#112)
- Fix: Schüler-Memory-Overlay zeigte `[object Object]` statt Inhalt (#109)
- Fix: Dashboard zeigte doppelte Tab-Bar nach Neu-Render (#58)
- Fix: Prompt-Verlauf im Dashboard wurde bei langem Prompt abgeschnitten (max-height) (#57)
- Fix: Simulation brach mit „request was aborted" ab, wenn eigene Persona verwendet wurde (#35)
- Fix: Widget-Positionierung bei aktivierter Sperre auf Safari macOS (#34)
- Fix: Kostenkalkulation las Modell aus token_log statt aus aktuellem Request — falsche Preisberechnung (#41)

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
