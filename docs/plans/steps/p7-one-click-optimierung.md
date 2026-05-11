# P7 — One-Click Optimierung ✓ done

**Voraussetzung:** P6 ✓

## Umsetzung

- Neuer SSE-Endpoint `POST /api/one-click-optimize`
- 4 Phasen: Kriterien ergänzen → Personas auswählen → 4 parallele Simulationen → Optimierungsvorschlag
- UX: Simulation-Tab entfernt; alles unter „Optimierung": One-Click-Card oben, Manuelle Simulation ausklappbar, KI-Vorschlag-Card, Erfahrungsprompt
- Persona-Auswahl: eigene Personas bevorzugt (max 4, greedy diversity), Auffüllen mit globalen Fallbacks (Musterschüler, Stille, Pragmatikerin, Zweifler)
- Kriterien: vorhandene behalten + KI ergänzt fehlende (Wort-Overlap-Filter gegen Duplikate)
- `optimize_done` befüllt die bestehende KI-Vorschlag-Card (opt-alt/opt-neu/Kausalkette)

## Verification

1. One-Click ohne vorherige Schülerdaten → Kriterien werden generiert, 4 Fallback-Personas simuliert, Vorschlag erscheint in der Card
2. One-Click mit eigenen Personas → eigene Personas bevorzugt
3. One-Click mit vorhandenen Kriterien → nur fehlende ergänzt, keine Duplikate
4. Manuelle Simulation nach wie vor über ausklappbaren Bereich erreichbar
