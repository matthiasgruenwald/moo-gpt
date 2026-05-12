# S4 — Upload- und SSRF-Härtung

## Ziel

Der Server lädt keine externen Bild-URLs mehr nach. Uploads bekommen klare Größen-, Typ- und Formatgrenzen.

## Konkrete Änderungen

- Serverseitigen Fetch externer Bild-URLs vollständig entfernen
- Nur noch browserseitig vorliegende oder base64-kodierte Inhalte akzeptieren
- Erlaubte Upload-Typen, Maximalgröße und Fehlerverhalten explizit festlegen
- Oversized, falsche oder unvollständige Uploads klar ablehnen statt weich weiterzuverarbeiten

## Betroffene Schnittstellen

- Upload-Pfade für Bilder oder Dateianhänge
- Payloads, die bisher externe Bild-URLs an den Server durchreichen
- Fehlerantworten für abgelehnte Uploads

## Verifikation

- Externe URL triggert keinen Server-Fetch mehr
- Oversized-Upload wird abgelehnt
- Falscher MIME-Type oder falsches Format wird abgelehnt
- Reguläre erlaubte Uploads funktionieren weiter
