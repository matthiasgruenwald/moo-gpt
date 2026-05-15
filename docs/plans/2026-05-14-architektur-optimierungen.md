# Architektur-Optimierungen — 2026-05-14

Identifiziert via `/improve-codebase-architecture`. Jedes Problem wird in einer eigenen Session angegangen.

---

## Status

| # | Kandidat | Status |
|---|----------|--------|
| 1 | Chat-Handler aufteilen | erledigt |
| 2 | Prompt-Konstruktion isolieren | erledigt |
| 3 | Auth-Middleware einführen | erledigt |
| 4 | Token-Logging-Modul extrahieren | erledigt |
| 5 | AIClient-Seam etablieren | erledigt |
| 6 | Simulation-Modul extrahieren | erledigt |
| 7 | ClientRegistry für WebSocket-Clients | erledigt |

---

## 1 — Chat-Handler aufteilen

**Files:** `server.js:1482–1753` (~270 Zeilen)

**Problem:** Der WebSocket-Handler für `/api/chat` erledigt zehn verschiedene Dinge: Origin-Prüfung, Settings-Parsing, Activity-Lookup/-Anlage, Thread-Suche/-Erstellung, History-Rückladen, Dashboard-Token-Erzeugung, Bild-Extraktion, Datei-Upload-Routing, Nachrichtenspeicherung und Stream-Aufruf. Er ist ein Pass-through, kein Deep Module — löscht man ihn, verteilt sich die Komplexität auf viele Aufrufer.

**Lösung:** Handler auf Kernaufgabe reduzieren: Nachricht empfangen, `ChatSession` initialisieren, Stream starten. Restliche Concerns als fokussierte Funktionen extrahieren: `resolveActivity()`, `resolveThread()`, `buildSessionContext()`.

**Nutzen:**
- *Locality:* Bugs in Thread-Erstellung in 30-Zeilen-Funktion statt 270-Zeilen-Kontext
- *Leverage:* `resolveThread()` und `resolveActivity()` nutzbar über WebSocket und REST

---

## 2 — Prompt-Konstruktion isolieren

**Files:** `server.js:214–227` (`buildInstructions()`)

**Problem:** 14 Zeilen lesen gleichzeitig den globalen Config-Cache, formatieren das Datum, bauen `settings.hints`/`settings.task` ein und laden den Erfahrungsprompt aus der DB. Wer den System-Prompt für Simulation, A/B-Tests oder Personas variieren will, kann es nicht — die Logik ist tief im Streaming-Flow verankert.

**Lösung:** `PromptBuilder`-Modul mit einer einzigen Funktion, die alle Inputs (Config, Erfahrungsprompt, Hints, Task, Datum) entgegennimmt und einen fertigen Prompt-String zurückgibt — ohne globale Abhängigkeiten.

**Nutzen:**
- *Locality:* Gesamte Prompt-Zusammensetzung an einem Ort
- *Leverage:* Simulation, One-Click-Optimierung und Chat-Streaming nutzen dieselbe Baulogik

---

## 3 — Auth-Middleware einführen

**Files:** `server.js`, 15+ Endpoints

**Problem:** Jeder Teacher- und Admin-Endpoint wiederholt denselben Block: `isOriginAllowed()` → Token aus Query → `validateDashboardToken()` → Fehler returnen. Identischer Code an 15+ Stellen — eine Änderung am Validierungsverfahren muss 15 Mal durchgeführt werden.

**Lösung:** Express-Middleware `requireDashboardAuth` und `requireAdminAuth`. Der Seam entsteht beim Router-Mount — alle geschützten Routen werden mit der Middleware dekoriert.

**Nutzen:**
- *Locality:* Auth-Logik einmal, nicht 15 Mal
- *Leverage:* Änderungen (Token-Format, IP-Whitelist) propagieren automatisch

---

## 4 — Token-Logging-Modul extrahieren

**Files:** `server.js:1821–1845` (innerhalb `streamResponse()`)

**Problem:** Token-Nutzung wird direkt nach Stream-Ende in die DB geschrieben — im selben Try-Catch wie der Stream. Bei Fehler: stilles Weitermachen, Dashboard zeigt ggf. keine Kosten. `streamResponse()` hat vier Aufgaben: streamen, speichern, Kosten loggen, Dashboard benachrichtigen.

**Lösung:** `TokenLog`-Modul mit `recordUsage(threadId, activityId, model, usage, messageId)`, das Fehler explizit handelt.

**Nutzen:**
- *Locality:* Fehler im Cost-Tracking isoliert sichtbar
- *Leverage:* Alle AI-Calls (Chat, Simulation, Optimierung) nutzen dasselbe Modul

---

## 5 — AIClient-Seam etablieren

**Files:** `server.js:733–1375` — `generateOptimizeProposal()`, `generateSimulatedUtterances()`, `generateAIResponse()`, `evaluateResponse()`, `aiJsonCall()`

**Problem:** Jede Funktion ruft direkt `oai.responses.create()` auf, mit eigener oder fehlender Fehlerbehandlung, ohne Retry-Logik, ohne gemeinsame Timeout-Konfiguration. `aiJsonCall()` ist ansatzweise ein gemeinsamer Wrapper, wird aber nicht konsequent genutzt — *one adapter = hypothetical seam*.

**Lösung:** Echten `AIClient`-Seam etablieren, durch den alle internen AI-Calls gehen. Retry, Timeout und Token-Limit-Enforcement leben dahinter. `oai.responses.create()` nur noch an einer Stelle direkt.

**Nutzen:**
- *Locality:* Resilience-Logik an einem Ort
- *Leverage:* Künftige Modellwechsel erfordern nur eine neue Adapter-Implementierung

---

## 6 — Simulation-Modul extrahieren

**Files:** `server.js:734–898` — `generateOptimizeProposal()`, `generateSimulatedUtterances()`, `generateAIResponse()`, `evaluateResponse()`

**Abhängigkeiten:** Punkt 2 (PromptBuilder), Punkt 5 (AIClient-Seam)

**Problem:** Die gesamte Simulations-Pipeline — Schüleräußerungen erzeugen, Chatbot-Antwort simulieren, Antwort bewerten, Optimierungsvorschlag generieren — steckt direkt in `server.js`. `generateAIResponse` baut den Prompt manuell statt `PromptBuilder` zu nutzen, was die Simulation vom echten Chat-Verhalten entkoppelt.

**Lösung:** `simulation.js`-Modul, das `PromptBuilder` und `AIClient` importiert. `generateAIResponse` ruft `buildInstructions({ systemContent, erfahrungContent })` auf. `server.js` importiert nur noch die High-Level-Einstiegspunkte (`runSimulation`, `generateOptimizeProposal`).

**Nutzen:**
- *Locality:* Simulations-Pipeline an einem Ort, unabhängig testbar
- *Leverage:* Simulation nutzt dieselbe Prompt-Logik wie der echte Chat — Divergenz ausgeschlossen

---

## 7 — ClientRegistry für WebSocket-Clients

**Files:** `server.js:128–139` — `dashboardClients`, `activityChatClients`, `activityLocks`

**Problem:** Drei separate Maps verwalten aktive WebSocket-Verbindungen. Cleanup passiert in `.on('close')`-Callbacks, Abstürze werden nicht zentral behandelt. `notifyDashboard()` ignoriert Send-Fehler stillschweigend.

**Lösung:** `ClientRegistry` mit Methoden `register()`, `unregister()`, `broadcast()` — kapselt intern die Maps, handelt Send-Fehler sauber.

**Nutzen:**
- *Locality:* WebSocket-Lifecycle-Bugs an einem Ort nachvollziehbar
- *Leverage:* Broadcast-Logik wird zuverlässig und testbar
