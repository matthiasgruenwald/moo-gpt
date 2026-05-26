# Overseer-Prompt: Issue #94 config.html UX-Cleanup — autonome Umsetzung

Paste diesen Text als erste Nachricht in eine neue Claude Code Session auf dem LXC.

---

Du bist Overseer-Agent für Issue #94 (config.html UX-Cleanup) im Projekt moo-gpt.  
Repo: `matthiasgruenwald/moo-gpt` — Arbeitsverzeichnis: `/opt/moo-gpt`

Deine Aufgabe: beide Sub-Issues **parallel in Wave 1** implementieren lassen, am Ende eine manuelle UI-Test-Checkliste ausgeben.

---

## Wellenübersicht und Abhängigkeiten

```
Wave 1 — sofort, beide parallel:
  #104  config.html Vollumbau (CSS, DOM, Labels)
  #105  config.js Logic-Update (Summary-Funktionen, Button-Logik, Checkbox entfernen)
```

Beide Issues berühren verschiedene Dateien → kein Merge-Konflikt → echter Parallelstart.

---

## Schritt 0 — Vorbereitung (selbst ausführen, kein Agent)

```bash
cd /opt/moo-gpt
git fetch origin && git checkout main && git pull origin main
git checkout -b feat/94-config-ux-cleanup
git push -u origin feat/94-config-ux-cleanup
```

---

## Schritt 1 — Wave 1: zwei Background-Agenten parallel starten

Starte beide gleichzeitig mit `run_in_background: true` und `isolation: "worktree"`.

### Agent 1 — config.html Vollumbau (#104)

```
Du implementierst Issue #104 im Projekt moo-gpt.

Repo: matthiasgruenwald/moo-gpt
Arbeitsverzeichnis: /opt/moo-gpt
Ziel-Branch: feat/94-config-ux-cleanup

Lies zuerst den vollständigen Issue-Text:
  gh issue view 104 --repo matthiasgruenwald/moo-gpt

Lies dann die betroffene Datei vollständig:
  public/config.html

Halte dich an /karpathy-guidelines:
- Mach die kleinstmögliche Änderung die funktioniert
- Verändere keine Logik, nur Struktur/Markup/CSS
- Prüfe jeden ID-Namen gegen den Issue-Text

Vorgehen:
1. CSS anpassen (Klasse umbenennen, alte Stile entfernen, neue Button-Row-Stile)
2. DOM neustrukturieren (Sektionsreihenfolge, neue <details>-Gruppen)
3. Bestehende Audio-<details>: CSS-Klasse tauschen, ID behalten
4. Checkbox und Cost-Div entfernen
5. Buttons umbauen

Branch-Workflow:
  git checkout -b feat/94-issue-104
  # ... Änderungen ...
  git add public/config.html
  git commit -m "feat(#94,#104): config.html Vollumbau — CSS, DOM-Neustrukturierung, Labels"
  git push -u origin feat/94-issue-104

Öffne dann einen PR gegen feat/94-config-ux-cleanup (nicht main):
  gh pr create \
    --repo matthiasgruenwald/moo-gpt \
    --base feat/94-config-ux-cleanup \
    --head feat/94-issue-104 \
    --title "feat(#94,#104): config.html Vollumbau" \
    --body "Closes #104"

Gib am Ende aus: PR-URL, geänderte Dateien, Zeilenzahl der Änderung.
```

### Agent 2 — config.js Logic-Update (#105)

```
Du implementierst Issue #105 im Projekt moo-gpt.

Repo: matthiasgruenwald/moo-gpt
Arbeitsverzeichnis: /opt/moo-gpt
Ziel-Branch: feat/94-config-ux-cleanup

Lies zuerst den vollständigen Issue-Text:
  gh issue view 105 --repo matthiasgruenwald/moo-gpt

Lies dann die betroffene Datei vollständig:
  public/config.js

Halte dich an /karpathy-guidelines:
- Mach die kleinstmögliche Änderung die funktioniert
- Entferne nur was entfernt werden soll, lass den Rest unberührt
- Lass suggestDirect() als Funktion bestehen (nur UI-Referenz auf cfg-suggest-cost entfernen)

Vorgehen:
1. Checkbox-Logik entfernen (cfg-suggest-questions, suggest-preference Endpoint)
2. Click-Handler cfg-suggest-btn vereinfachen (nur interaktiver Pfad)
3. cfg-suggest-cost Referenzen in suggestDirect() entfernen (DOM-Element existiert nicht mehr)
4. Vier Summary-Funktionen implementieren (updateOpenerSummary etc.)
5. Change-Events für Summary-Aktualisierung registrieren
6. _applyConfig: alle vier Summary-Funktionen am Ende aufrufen
7. updateAudioOutputDependents(): updateAudioSummary()-Aufruf ergänzen

Die DOM-IDs der neuen <details>-Elemente:
  #cfg-opener-details     → Begrüßung
  #cfg-appearance-details → Aussehen
  #cfg-audio-details      → Audio (bestehend, ID unverändert)
  #cfg-advanced-details   → Erweitert

Branch-Workflow:
  git checkout -b feat/94-issue-105
  # ... Änderungen ...
  git add public/config.js
  git commit -m "feat(#94,#105): config.js — Summary-Funktionen, Button-Logik, Checkbox entfernen"
  git push -u origin feat/94-issue-105

Öffne dann einen PR gegen feat/94-config-ux-cleanup (nicht main):
  gh pr create \
    --repo matthiasgruenwald/moo-gpt \
    --base feat/94-config-ux-cleanup \
    --head feat/94-issue-105 \
    --title "feat(#94,#105): config.js Logic-Update" \
    --body "Closes #105"

Gib am Ende aus: PR-URL, geänderte Dateien, Zeilenzahl der Änderung.
```

---

## Schritt 2 — PRs mergen (nach Abschluss beider Agents)

Merge in Reihenfolge (zuerst HTML, dann JS — kein Konflikt):

```bash
# PR #104 mergen
gh pr merge --repo matthiasgruenwald/moo-gpt feat/94-issue-104 \
  --merge --delete-branch

# PR #105 mergen  
gh pr merge --repo matthiasgruenwald/moo-gpt feat/94-issue-105 \
  --merge --delete-branch

# Feature-Branch auf main mergen vorbereiten
cd /opt/moo-gpt
git fetch origin
git checkout feat/94-config-ux-cleanup
git pull origin feat/94-config-ux-cleanup
```

---

## Schritt 3 — Abschluss-Checkliste (manuelle Browser-Verifikation)

Ausgabe am Ende der Session:

```
=== Manuelle UI-Abnahme: #94 config.html UX-Cleanup ===

1. Config-Seite öffnen (als Lehrer, in Moodle-Popover oder direkt)

SEITEN-STRUKTUR:
[ ] Vorlage-Feld ist sofort sichtbar (kein Akkordeon)
[ ] Aufgaben-Hinweise ist sofort sichtbar (kein Akkordeon)
[ ] Begrüßung startet zugeklappt
[ ] Aussehen startet zugeklappt
[ ] Audio startet zugeklappt
[ ] Erweitert startet zugeklappt
[ ] Speichern-Zeile ist immer sichtbar unten

AUFGABEN-HINWEISE:
[ ] Label lautet "Aufgaben-Hinweise" (kein Klammereinschub)
[ ] Inline-Hint-Text neben Label: "Fach/Thema · Rolle des Bots · ..."
[ ] Textarea hat 8 Zeilen sichtbar
[ ] Zwei Buttons nebeneinander: "✨ Interaktiv erstellen" | "🔍 Prüfen & verbessern"
[ ] Keine Checkbox "Rückfragen erwünscht" vorhanden

SUMMARY-TEXTE (zugeklappt sichtbar):
[ ] Begrüßung: zeigt Opener-Text (ggf. abgeschnitten mit …)
[ ] Aussehen: zeigt "Titel | Icon-Wert"
[ ] Audio: zeigt aktive Einstellungen oder "–"
[ ] Erweitert: zeigt "upload-Wert | Modell-Wert"

SUMMARY LIVE-UPDATE:
[ ] Opener-Text ändern → Begrüßungs-Summary aktualisiert sich sofort
[ ] Bot-Titel ändern → Aussehen-Summary aktualisiert sich sofort
[ ] Upload-Modus ändern → Erweitert-Summary aktualisiert sich sofort

FUNKTION:
[ ] "✨ Interaktiv erstellen" öffnet Chat-Dialog (kein Direktpfad)
[ ] "🔍 Prüfen & verbessern" funktioniert wie bisher
[ ] Speichern & Schließen speichert alle Felder korrekt
[ ] Keine JS-Fehler in der Browser-Konsole (F12)

LABELS:
[ ] "Modell" (nicht "Modell-Präferenz") in Erweitert-Gruppe
[ ] Bot-Titel und Bot-Icon sind in der Aussehen-Gruppe
```

---

## Issues referenziert

- Parent: #94
- Wave 1: #104 (HTML), #105 (JS)
