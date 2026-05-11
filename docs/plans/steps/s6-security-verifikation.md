# S6 — Security-Verifikation und Abschluss

## Ziel

Nach der Umsetzung gibt es einen reproduzierbaren kurzen Security-Abschlusscheck.

## Konkrete Änderungen

- Negative Tests pro Befund als kompakte Checkliste festhalten
- `test.http` oder gleichwertige Prüfdoku als Deliverable aktualisieren
- Produktionsnahe Kurzabnahme nach `systemctl restart moo-gpt` als Pflichtschritt dokumentieren
- Abschluss erst dann als erledigt markieren, wenn die Kernbefunde einmal bewusst gegengeprüft wurden

## Betroffene Schnittstellen

- Prüfdoku für REST-, WS- und Upload-Verhalten
- Operativer Restart- und Kurzabnahme-Ablauf auf dem LXC

## Verifikation

- Keine Query-Token mehr in URLs
- Keine clientseitig eskalierbaren Lehrerrechte
- Keine bekannten untrusted `innerHTML`-Sinks ohne Schutz
- Kein serverseitiger Fetch fremder Bild-URLs

## Heute-Abend-Hinweis

Heute keine systematische Testphase mehr einplanen. Morgen früh nach Restart ist eine kurze produktionsnahe Abnahme zwingend, bevor der Stand als belastbar gilt.
