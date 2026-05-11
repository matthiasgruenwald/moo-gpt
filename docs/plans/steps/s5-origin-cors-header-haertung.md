# S5 — Origin-, CORS- und Header-Härtung

## Ziel

Origin-Prüfungen sind keine primäre Vertrauensgrenze mehr. Browser-Schutzschichten werden ergänzend gehärtet.

## Konkrete Änderungen

- `startsWith`-Origin-Prüfungen als Härtungsthema behandeln und auf exakte oder gleichwertig robuste Prüfungen umstellen
- Global offenes `cors()` auf den tatsächlich nötigen Scope reduzieren
- Relevante Security-Header als separates Paket ergänzen
- Diese Schicht nicht mit Auth verwechselt behandeln: sie ergänzt S1-S4, ersetzt sie nicht

## Betroffene Schnittstellen

- Origin-Checks im Server
- Globale oder routenspezifische CORS-Konfiguration
- HTTP-Header für Browser-Schutz

## Verifikation

- Missbrauch über Präfix-Domain wird blockiert
- Erlaubte Origins funktionieren weiter
- Security-Header sind auf den relevanten Antworten gesetzt

## Heute-Abend-Hinweis

Optional für heute. Wenn S1-S4 Zeit binden, wird S5 explizit zum nächsten Morgen-Schritt statt halb umgesetzt.
