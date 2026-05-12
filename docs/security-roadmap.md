# Security-Roadmap — Index

Statische Security-Review vom 2026-05-11.

## Dependency-Block

```text
S1 (Handshake-Identität) -> S2 (Token-Transport/Session) -> S3 (XSS-Härtung) -> S4 (Upload/SSRF)
S5 (Origin/CORS/Header) ist nachgelagerte Härtung, bevorzugt nach S1-S4
S6 (Security-Verifikation) schließt die Umsetzung ab
```

## Befunde

| Schritt | Titel | Risiko | Kurzbeschreibung | Zielzustand | Datei | Abhängigkeiten |
|---|---|---|---|---|---|---|
| S1 | Vertrauenswürdige Identität im WS-Handshake | kritisch | `isTeacher` und `userId` dürfen im `settings`-Handshake nicht mehr aus Client-Payload autoritativ werden | Lehrer-/Dashboard-Rechte hängen nur noch an serverseitig verifizierter Identität | [steps/s1-handshake-identitaet.md](plans/steps/s1-handshake-identitaet.md) | keine |
| S2 | Token-Transport und Session-Nutzung | hoch | Query-Token in URLs und REST-Aufrufen leaken Session-Secrets und halten Admin-/Teacher-Zugriff an URL-Parametern fest | keine Tokens mehr in URLs; Dashboard-/Config-Session nur noch über nicht-URL-basierten Transport | [steps/s2-token-transport-session.md](plans/steps/s2-token-transport-session.md) | S1 |
| S3 | XSS-Härtung bei Chat- und Config-Rendering | hoch | Untrusted Inhalte können aktuell als HTML/Markdown ohne harte Sanitization im DOM landen | Markdown bleibt erhalten, aber untrusted Rendering wird strikt sanitisiert oder escaped | [steps/s3-xss-haertung.md](plans/steps/s3-xss-haertung.md) | S1, S2 |
| S4 | Upload- und SSRF-Härtung | hoch | Serverseitiger Fetch externer Bild-URLs schafft SSRF-Risiko; Upload-Grenzen sind zu weich | kein Server-Fetch fremder Bild-URLs mehr; klare Datei-, Größen- und Formatgrenzen | [steps/s4-upload-ssrf-haertung.md](plans/steps/s4-upload-ssrf-haertung.md) | S1, S2, S3 |
| S5 | Origin-, CORS- und Header-Härtung | mittel | `startsWith`-Origin-Prüfungen und global offenes `cors()` sind als harte Grenze zu schwach | engere Origins, reduzierter CORS-Scope, ergänzende Security-Header | [steps/s5-origin-cors-header-haertung.md](plans/steps/s5-origin-cors-header-haertung.md) | S1-S4 empfohlen |
| S6 | Security-Verifikation und Abschluss | mittel | Ohne reproduzierbare Negativtests bleibt der Sicherheitszustand nach Umbau unklar | kurze, wiederholbare Abnahme inkl. `test.http` oder gleichwertiger Prüfdoku | [steps/s6-security-verifikation.md](plans/steps/s6-security-verifikation.md) | S1-S5 |
