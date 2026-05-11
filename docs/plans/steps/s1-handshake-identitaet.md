# S1 — Vertrauenswürdige Identität im WS-Handshake

## Ziel

Der Server darf `isTeacher` und `userId` im `settings`-Handshake nicht mehr aus Client-Payload vertrauen. Lehrer-, Dashboard- und Admin-Verhalten muss an eine serverseitig verifizierte Identität gebunden werden.

## Konkrete Änderungen

- Ist-Problem im `settings`-Handshake schließen: Client-Felder für Rolle und Identität verlieren autoritativen Status
- Verifizierte Nutzeridentität serverseitig ableiten und erst danach Lehrer-/Dashboard-Rechte freigeben
- Alle nachgelagerten Entscheidungen für Lehrer- und Admin-Funktionen an diese verifizierte Identität koppeln
- Bewusst als höchstes Risiko behandeln und heute zuerst umsetzen

## Betroffene Schnittstellen

- WebSocket-Handshake für `settings`
- Alle serverseitigen Pfade, die Lehrer- oder Dashboard-Rechte aus der WS-Session ableiten

## Verifikation

- Manipuliertes `isTeacher: true` erzeugt keine Lehrerrechte
- Manipulierte `userId` gibt keinen Zugriff auf fremde Lehrer-/Admin-Funktionen
- Reguläre Lehrer-Session funktioniert weiter mit serverseitig verifizierter Identität

## Heute-Abend-Hinweis

Heute nur implementieren. Morgen früh nach Restart gezielt als Negativtest gegen WS-Init-Payload prüfen.
