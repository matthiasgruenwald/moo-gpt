# Security-Roadmap — Index

Statische Security-Review vom 2026-05-11.

## Betriebsrealität

- Entwicklung direkt auf dem LXC in `/opt/moo-gpt`
- Änderungen werden nach `systemctl restart moo-gpt` unmittelbar produktiv
- Umsetzung in einem neuen Branch; Git-Ablauf nicht hier duplizieren, sondern [`../CLAUDE.md`](../CLAUDE.md) und [`git-workflow.md`](git-workflow.md) folgen
- Heute wird implementiert, nicht mehr systematisch getestet
- Morgen früh ist eine kurze produktionsnahe Abnahme nach Restart zwingend

## Dependency-Block

```text
S1 (Handshake-Identität) -> S2 (Token-Transport/Session) -> S3 (XSS-Härtung) -> S4 (Upload/SSRF)
S5 (Origin/CORS/Header) ist nachgelagerte Härtung, bevorzugt nach S1-S4
S6 (Security-Verifikation) schließt die Umsetzung ab und dokumentiert die Morgen-Abnahme
```

## Befunde

| Schritt | Titel | Risiko | Kurzbeschreibung | Zielzustand | Datei | Abhängigkeiten | Status |
|---|---|---|---|---|---|---|---|
| S1 | Vertrauenswürdige Identität im WS-Handshake | kritisch | `isTeacher` und `userId` dürfen im `settings`-Handshake nicht mehr aus Client-Payload autoritativ werden | Lehrer-/Dashboard-Rechte hängen nur noch an serverseitig verifizierter Identität | [steps/s1-handshake-identitaet.md](plans/steps/s1-handshake-identitaet.md) | keine | Heute implementieren |
| S2 | Token-Transport und Session-Nutzung | hoch | Query-Token in URLs und REST-Aufrufen leaken Session-Secrets und halten Admin-/Teacher-Zugriff an URL-Parametern fest | keine Tokens mehr in URLs; Dashboard-/Config-Session nur noch über nicht-URL-basierten Transport | [steps/s2-token-transport-session.md](plans/steps/s2-token-transport-session.md) | S1 | Heute implementieren |
| S3 | XSS-Härtung bei Chat- und Config-Rendering | hoch | Untrusted Inhalte können aktuell als HTML/Markdown ohne harte Sanitization im DOM landen | Markdown bleibt erhalten, aber untrusted Rendering wird strikt sanitisiert oder escaped | [steps/s3-xss-haertung.md](plans/steps/s3-xss-haertung.md) | S1, S2 | Heute implementieren |
| S4 | Upload- und SSRF-Härtung | hoch | Serverseitiger Fetch externer Bild-URLs schafft SSRF-Risiko; Upload-Grenzen sind zu weich | kein Server-Fetch fremder Bild-URLs mehr; klare Datei-, Größen- und Formatgrenzen | [steps/s4-upload-ssrf-haertung.md](plans/steps/s4-upload-ssrf-haertung.md) | S1, S2, S3 | Heute implementieren, wenn Restzeit reicht |
| S5 | Origin-, CORS- und Header-Härtung | mittel | `startsWith`-Origin-Prüfungen und global offenes `cors()` sind als harte Grenze zu schwach | engere Origins, reduzierter CORS-Scope, ergänzende Security-Header | [steps/s5-origin-cors-header-haertung.md](plans/steps/s5-origin-cors-header-haertung.md) | S1-S4 empfohlen | Nachgelagert prüfen |
| S6 | Security-Verifikation und Abschluss | mittel | Ohne reproduzierbare Negativtests bleibt der Sicherheitszustand nach Umbau unklar | kurze, wiederholbare Abnahme inkl. `test.http` oder gleichwertiger Prüfdoku | [steps/s6-security-verifikation.md](plans/steps/s6-security-verifikation.md) | S1-S5 | Nachgelagert prüfen |

## Heute-Abend-Reihenfolge

Minimalpfad für heute, damit der Bot morgen früh mit vertretbarem Risiko produktiv verfügbar bleibt:

1. S1 zuerst umsetzen
2. Direkt danach S2, ohne Übergangskompatibilität für Query-Token
3. Danach S3, damit Markdown erhalten bleibt, aber keine untrusted HTML-Injektion offen bleibt
4. Danach S4, sofern noch genug konzentrierte Restzeit für einen sauberen Schnitt bleibt
5. S5 und S6 nur noch anfangen, wenn sie heute sauber abgeschlossen werden können; sonst explizit auf morgen früh verschieben

## Morgen-Früh-Abnahme

- Schüler imitiert Lehrerrolle im WS-Init-Payload: keine Eskalation
- Manipulierte `userId` im WS-Init: kein Zugriff auf fremde Lehrer-/Admin-Funktionen
- Dashboard/Config funktionieren ohne Query-Token im neuen Flow
- Alte `?token=`-Aufrufe schlagen kontrolliert fehl
- XSS-Payloads in Opener, User-Text und Modellantwort werden neutralisiert
- Externe Bild-URL löst keinen Server-Fetch aus
- Oversized-Upload und falscher MIME-Type werden abgewiesen
- Origin-Missbrauch über Präfix-Domain wird blockiert
- Nach `systemctl restart moo-gpt` funktioniert der Kernpfad des Bots weiter
