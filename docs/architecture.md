# moo-gpt — Architektur

## Systemkomponenten

```mermaid
graph TD
    Moodle["Moodle (TinyMCE-Snippet)"]
    Widget["Chat-Widget\nmoo-bot.js"]
    Dashboard["Lehrer-Dashboard\ndashboard.html / dashboard.js"]
    Server["Express-Server\nserver.js"]
    DB["SQLite-Datenbank\ndb.js / chats.db"]
    OpenAI["OpenAI API\nResponses API"]

    Moodle -->|"iframe / Snippet eingebettet"| Widget
    Widget <-->|"WebSocket (WSS)"| Server
    Dashboard <-->|"HTTP REST + WebSocket"| Server
    Server <-->|"better-sqlite3"| DB
    Server <-->|"openai SDK (Streaming)"| OpenAI
```

## Chat-Nachrichtenfluss

```mermaid
sequenceDiagram
    participant S as Schüler-Browser
    participant W as Widget (moo-bot.js)
    participant SV as Server (server.js)
    participant OAI as OpenAI API

    S->>W: Nachricht eingeben + senden
    W->>SV: WebSocket: { type: "message", text }
    SV->>SV: Nachricht in DB speichern
    SV->>OAI: Responses API (stream: true)
    loop Streaming
        OAI-->>SV: Text-Chunk
        SV-->>W: WebSocket: { type: "chunk", text }
        W-->>S: Chunk im Chat anzeigen
    end
    OAI-->>SV: done + Token-Anzahl
    SV->>SV: Token-Log in DB speichern
    SV-->>W: WebSocket: { type: "done" }
```
