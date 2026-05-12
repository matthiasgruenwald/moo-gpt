# S3 — XSS-Härtung bei Chat- und Config-Rendering

## Ziel

Markdown-Darstellung bleibt erhalten, aber untrusted Inhalte werden vor DOM-Injektion strikt sanitisiert oder escaped.

## Konkrete Änderungen

- Untrusted Quellen vollständig erfassen: Teacher-Opener, User-Text, Modellausgabe, historische Chat-Inhalte
- Markdown weiter erlauben, aber erst nach einem klaren Sanitization-/Escaping-Schritt ins DOM bringen
- Ungeschützte `innerHTML`-Sinks oder gleichwertige DOM-Injektionen für diese Daten schließen
- Nur das Rendering härten, keine spekulativen Content-Umbauten daneben starten

## Betroffene Schnittstellen

- Chat-Rendering im Widget
- Config-/Dashboard-Rendering für untrusted Inhalte
- Historische Darstellungen bereits gespeicherter Inhalte

## Verifikation

- Script-, Event-Handler- und `javascript:`-Payloads werden neutralisiert
- Legitimes Markdown bleibt brauchbar renderbar
- Historische Inhalte werden ebenfalls ohne aktive HTML-Ausführung angezeigt
