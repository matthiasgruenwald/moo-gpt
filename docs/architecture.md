# moo-gpt — Architektur

## Systemkomponenten

```mermaid
graph TD
    Moodle[Moodle TinyMCE-Snippet]
    Widget[Chat-Widget]
    Dashboard[Lehrer-Dashboard]
    Server[Express-Server]
    DB[SQLite-Datenbank]
    OpenAI[OpenAI API]

    Moodle -->|Snippet eingebettet| Widget
    Widget -->|WebSocket Anfragen| Server
    Server -->|WebSocket Antworten| Widget
    Dashboard -->|HTTP REST| Server
    Server -->|HTTP Antworten| Dashboard
    Server --- DB
    Server -->|openai SDK| OpenAI
    OpenAI -->|Text-Chunks| Server
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
