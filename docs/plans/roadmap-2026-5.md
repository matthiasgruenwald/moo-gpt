# moo-gpt – Product Requirements Document (Roadmap 2026)

_Ergebnis der grill-with-docs Session, 2026-05-22_

---

## Strategische Leitlinien

- **Ziel**: Nutzungsroutine für eigenen Unterricht festigen → dann Moodle-Plugin-Umbau
- **Simulation ist kein Investitionsschwerpunkt mehr**: hat in der Praxis wenig gebracht. Bestand bleibt, aber kein Ausbau.
- **Prevention beats Post-Hoc**: Prompt vorher besser erstellen (Prompt-Assistent) schlägt nachträgliche Simulation.
- **iFrame / Open Source / Sicherheitsroadmap**: geparkt bis Plugin-Phase

---

## PRD – Feature-Anforderungen

### PRD-1: Kosten-Bug (Phase 1)

**Problem:** Kostenkalkulation verwendet möglicherweise ein falsches Default-Modell statt das tatsächlich verwendete.  
**Anforderung:** Jeder Token-Log-Eintrag muss das exakte Modell speichern, das für diese Anfrage verwendet wurde. Kostenkalkulation liest dieses Modell für die Preisberechnung.  
**Akzeptanzkriterium:** Bei Modellwechsel zwischen zwei Chats stimmt die Kostendarstellung im Dashboard für beide korrekt.

---

### PRD-2: Widget-Positionierung (Phase 2a)

**Problem:** Chat-Widget überlagert Bilder/Text der Aufgabenstellung; Schüler müssen Widget schließen um Aufgabe zu sehen.  
**Anforderung:**
- Kleiner Links/Rechts-Toggle-Button im Widget-Header (kein Zahnrad; dezentes Icon)
- Standard: rechts (bestehend)
- Klick wechselt Widget an den linken Rand
- Einstellung wird in `sessionStorage` gespeichert (gilt nur für diese Browser-Sitzung)

**Nicht in Scope:** Drag & Drop, Breitenänderung, persistente Nutzereinstellung über Sessions hinaus.  
**Akzeptanzkriterium:** Schüler kann Widget auf die andere Seite klappen ohne Chat-Inhalt zu verlieren.

---

### PRD-3: Stop-Button in Aktivitäts-Ansicht (Phase 2b)

**Problem:** Stop-Button ist nur im Dashboard erreichbar — Lehrer muss Tab wechseln.  
**Anforderung:**
- Dritter Button in der Widget-Leiste (neben Dashboard-Link und Einstellungen)
- Öffnet Modal-Dialog: Dauer-Eingabe (Minuten, optional) + „Jetzt sperren"-Bestätigung
- Ruft denselben Lock-Manager-Endpunkt auf wie der Dashboard-Stop-Button
- Lock-Manager existiert bereits (`lock-manager.js`); nur UI-Integration nötig

**Akzeptanzkriterium:** Lehrkraft kann Plenumsphase starten ohne das Dashboard zu öffnen.

---

### PRD-4: Dashboard-Neustruktur (Phase 2c)

**Problem:** Dashboard öffnet immer auf Schüler-Chats; es gibt keine sinnvolle Navigation zwischen Bereichen.  
**Anforderung:**
- Separate HTML-Seiten mit eigenen URLs: `/dashboard/chats`, `/dashboard/overview`, `/dashboard/settings` (und weitere)
- Start-URL `/dashboard` leitet auf letzten aktiven Tab um (localStorage: `dashboard_last_page`)
- Seitentitel: `moo-gpt – <Aktivitätsname>` (nicht mehr „Schüler-Dashboard")
- Navigation: horizontale Tab-Leiste oben, aktiver Tab hervorgehoben
- Stop-Button bleibt auf der Chats-Seite an seiner bisherigen Position

**Nicht in Scope:** SPA-Framework; Server-Side-Routing bleibt wie bisher.  
**Akzeptanzkriterium:** Reload landet auf derselben Seite wie zuvor; alle Funktionen weiterhin erreichbar.

---

### PRD-5: Live-Unterrichts-Überblick (Phase 2d)

**Problem:** Lehrkraft hat keinen schnellen Überblick, welche Themen/Fragen die Schüler beschäftigen.  
**Anforderung:**
- Neue Seite `/dashboard/overview`
- Button „Jetzt zusammenfassen": sendet alle laufenden Chat-Verläufe der Aktivität an die KI
- KI liefert eine thematische (nicht wörtliche) Zusammenfassung: häufige Fragen, häufige Missverständnisse
- Ergebnis wird auf der Seite angezeigt mit Zeitstempel
- Zeigt zusätzlich: Liste der Schüler, die noch nicht gechattet haben
- Kein automatisches Polling (nur manuell per Knopfdruck)

**Akzeptanzkriterium:** Nach Klick erscheint innerhalb von 30 Sekunden eine lesbare thematische Zusammenfassung der Schüler-Chats.

---

### PRD-6: Editbutton für Nachrichten (Phase 2e)

**Problem:** Edit-Button erzeugt neues Textfeld unter der Nachricht statt Inline-Edit.  
**Anforderung:**
- Klick auf Edit-Button macht die Nachricht direkt editierbar (contenteditable oder Inline-Textarea)
- Speichern erzeugt einen Versions-Eintrag (wie bei Erfahrungsprompt-Versionshistorie)
- Lehrkraft kann Versionen im Dashboard ansehen und auswählen
- Schüler sieht die aktuell ausgewählte Version (nicht automatisch die neueste)
- Lösch-Option für doppelte Versions-Einträge

**Akzeptanzkriterium:** Lehrer kann eine KI-Antwort korrigieren; Schüler sieht die Korrektur beim nächsten Chat-Öffnen.

---

### PRD-7: Schüler-Memory (Phase 3)

**Problem:** Alle Schüler bekommen identische KI-Antworten, unabhängig von ihren Präferenzen oder Lernbedürfnissen.  
**Anforderung:**

#### 3a: Feedback-Button im Widget
- Daumen-hoch/runter + optionales Freitext-Feld bei jeder KI-Antwort
- Freitext kann Wünsche/Präferenzen enthalten
- Gespeichert in neuer DB-Tabelle `student_memory` (student_id, activity_id, preference_text, updated_at)

#### 3b: Einbindung in Systemprompt
- Bei jedem Chat-Start: falls `student_memory` für diese Schüler-ID existiert → als unsichtbare Instruktion in Systemprompt einbinden
- Format: `[Schüler-Präferenz: <preference_text>]` (unsichtbar für Schüler im Chat)

#### 3c: Schüler-Ansicht im Widget
- Kleiner Button im Widget-Header (eigenes Icon, kein Zahnrad)
- Öffnet Overlay: zeigt aktuellen Memory-Text + Bearbeiten/Löschen-Option

#### 3d: Lehrer-Zugriff im Dashboard
- Auf der Chats-Seite: pro Schüler → Memory anzeigen, bearbeiten, löschen
- Ermöglicht Differenzierung: Lehrer setzt Hinweis ohne Schüler-Aktion
- Schüler-Memory ist nur nach erstem Chat verfügbar (Onboarding-Limitation, kein Bug)

**Akzeptanzkriterium:** Schüler A bekommt kurze Antworten (nach eigenem Feedback), Schüler B bekommt ausführliche (nach Lehrer-Setzung), ohne dass der andere Schüler davon weiß.

---

### PRD-8: Prompt-Assistent (Phase 4)

**Problem:** Lehrkräfte erstellen Aufgabenprompts ohne Unterstützung; die KI macht Annahmen die der Lehrer nicht kennt.  
**Anforderung:**
- Neuer Button auf der Aktivitäts-Konfig-Seite: „Prompt mit KI erstellen"
- Option „Rückfragen erwünscht" (Checkbox, Standard: angehakt)
  - Wenn aktiv: KI stellt 3–5 Klärungsfragen → Lehrer antwortet → KI generiert Prompt
  - Wenn inaktiv: KI generiert sofort Prompt auf Basis des vorhandenen Textes
- Option-Status wird pro Lehrkraft in DB gespeichert (nutzerspezifisch)
- Generierter Prompt wird als Vorschlag angezeigt, nicht automatisch gespeichert

**Akzeptanzkriterium:** Lehrkraft mit leerem Aufgabenprompt kann über den Assistenten in 2–3 Minuten einen guten Ausgangsprompt erstellen, ohne zu wissen wie Prompting funktioniert.

---

## Phasen-Übersicht

| Phase | Inhalt | Priorität |
|-------|--------|-----------|
| 1 | Kosten-Bug, mmbbs-Reste, Stop-Button verdrahten | Sofort |
| 2a | Widget Links/Rechts-Toggle | Hoch |
| 2b | Stop-Button in Aktivitätsansicht | Hoch |
| 2c | Dashboard-Neustruktur (multi-page) | Hoch |
| 2d | Live-Unterrichts-Überblick | Hoch |
| 2e | Editbutton Inline-Edit | Mittel |
| 3 | Schüler-Memory (Feedback, Systemprompt, Widget, Dashboard) | Mittel |
| 4 | Prompt-Assistent mit Rückfragen | Mittel |

---

## Geparkt / Langfristig

| Thema | Begründung |
|-------|-----------|
| Simulation ausbauen (One-Click, Personas in DB, Kurs-Personas) | Simulation bringt in der Praxis wenig — kein weiterer Invest |
| Simulation bei verändertem Prompt (Vergleichsansicht) | Hängt an Simulation |
| Modell-Anzeige in Simulation (Bug) | Niedrige Priorität, da Simulation nicht Fokus |
| iFrame statt Tabelle | Plugin-Phase |
| Moodle-Plugin-Umbau | Plugin-Phase |
| Debugging-Dashboard (journalctl im Browser) | Sicherheitsrisiko, erst mit Plugin lösen |
| Trollinger Session (Wortwolke) | Live-Überblick (Phase 2d) erfüllt den Kern davon |
| TinyMCE-Hinweis bei doppeltem Bot-Snippet | Nice-to-have |
| Open-Source-Vorbereitung (README, Branches aufräumen) | Nach Plugin-Phase |

---

## Implementierungsdetails (geklärte Entscheidungen)

| Frage | Entscheidung |
|-------|-------------|
| Live-Überblick Trigger | Manuell per Knopfdruck — kein Auto-Polling |
| Dashboard-Navigation | Separate HTML-Seiten mit eigenen URLs |
| Edit-Button für Nachrichten | Phase 2e — eigenständig, nicht Teil von Phase 3 |
| Widget-Resize | Nicht in Scope — nur Toggle links/rechts |
| Schüler-Memory vor erstem Chat | Nicht implementiert — Onboarding-Limitation akzeptiert |
