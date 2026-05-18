# moo-gpt

KI-Chatbot-Widget für Moodle. Lehrkräfte betten einen KI-Assistenten direkt in Aufgaben und Quiz-Fragen ein – ohne separaten Login für Schülerinnen und Schüler.

> 📸 *Screenshot: Chat-Widget in einer Moodle-Aufgabe + Lehrer-Dashboard (folgt)*

---

## Was ist moo-gpt?

- **Floating Chat-Widget** direkt in Moodle-Aufgaben eingebettet (TinyMCE-Snippet, kein Plugin)
- **Lehrer-Dashboard** mit Schülerchats, Token-Kosten und Live-Updates
- **Selbst gehostet** – Schülernamen und IDs bleiben auf dem eigenen Server
- **OpenAI-Modelle** (GPT-5 und weitere) als KI-Backend

## Schnellantworten

| Frage | Antwort |
|---|---|
| Was kostet es? | Server selbst betreiben + OpenAI-API-Kosten – kein Abo, kein SaaS |
| Wo landen Schülerdaten? | Lokal auf dem eigenen Server (SQLite) – Namen und IDs verlassen den Server nicht |
| Was geht zu OpenAI? | Der Inhalt der Chatnachrichten und ggf. Aufgabenbilder |
| Was brauche ich? | Linux-Server, Node.js 22, Moodle mit TinyMCE, OpenAI-API-Key |
| Welches Moodle-Theme? | Boost (Standard) – andere Themes prüfen |

## Features

- Chat-Widget direkt in Aufgaben und Quiz-Fragen einbettbar
- Aufgabentext und Bilder werden automatisch an die KI übergeben
- Thread-Persistenz: Schüler setzen den Chat nach Seitenreload nahtlos fort
- Lehrer-Dashboard mit Chatverlauf, Live-Updates und Token-Kosten
- Rollenerkennung (Lehrer/Schüler) per Moodle-DOM, serverseitiger Override möglich
- Konfigurierbare KI-Anweisungen, Erfahrungsprompts und Personas je Aufgabe

## Dokumentation

| Zielgruppe | Dokument |
|---|---|
| Admins / IT | [INSTALL.md](INSTALL.md) – Installation, Konfiguration, Docker, Systemd |
| Lehrkräfte | [docs/moodle.md](docs/moodle.md) – Moodle-Einbindung, Snippets, Dashboard |
| Entwickler | [CONTRIBUTING.md](CONTRIBUTING.md) – Architektur, Datenbankschema, Roadmap |

---

## Datenschutz & rechtliche Hinweise

### Was wird wo gespeichert?

| Daten | Speicherort |
|---|---|
| Schülername, Moodle-User-ID | Lokal in SQLite auf dem Server des Betreibers |
| Chatverlauf (Nachrichten) | Lokal in SQLite **und** zur Verarbeitung an OpenAI übertragen |
| Aufgabenbilder (> 2 MB) | An OpenAI Files API übertragen |

**Schülernamen und Moodle-IDs verlassen den Server nicht.** Nur der Inhalt der Chatnachrichten und ggf. Bilder werden an die OpenAI-API gesendet.

### Verantwortung des Betreibers

Der Betreiber (Schule oder Schulbehörde) ist **datenschutzrechtlich Verantwortlicher** im Sinne von Art. 4 Nr. 7 DSGVO – nicht der Entwickler dieses Projekts.

Vor dem Betrieb sind folgende Schritte erforderlich:

1. **Auftragsverarbeitungsvertrag (AVV)** mit OpenAI abschließen (Art. 28 DSGVO) – verfügbar unter platform.openai.com
2. **Schulkonferenz oder Schulbehörde** über den KI-Einsatz informieren (je nach Bundesland unterschiedlich)
3. **Datenschutzerklärung** der Schule um die KI-Nutzung ergänzen (Art. 13 DSGVO)
4. **Schüler und Eltern** darüber informieren, dass Chatnachrichten zur Verarbeitung an OpenAI übertragen werden
5. **Keine personenbezogenen Daten** in Chatnachrichten eingeben (technisch nicht erzwungen)

### Kontext: KI an deutschen Schulen

KI-Chatbots werden an deutschen Schulen bereits breit eingesetzt – z. B. [AIS.chat](https://ais-chat.schule) (ehemals telli, seit Februar 2026 landesweit in Niedersachsen über die Niedersächsische Bildungscloud freigegeben). AIS.chat nutzt ebenfalls OpenAI-Modelle, jedoch über Azure mit EU-Inferenz. moo-gpt unterscheidet sich darin, dass der Betreiber eine eigene Instanz betreibt und den AVV mit OpenAI selbst abschließt.

### EU-konformer Betrieb

Standardmäßig werden Daten über die OpenAI-API verarbeitet, die Server außerhalb der EU einschließen kann. Für vollständig EU-seitige Verarbeitung:

- **OpenAI Enterprise mit EU-Inferenz-Residency** (seit Januar 2026) – kein Code-Umbau nötig
- **Azure OpenAI mit EU-Region** – erfordert eine kleine Konfigurationsänderung (→ [Issue #32](https://github.com/matthiasgruenwald/moo-gpt/issues/32))

### Haftungsausschluss

Dieses Projekt wird **ohne jegliche Gewährleistung** bereitgestellt. Der Entwickler übernimmt keine Haftung für:

- Datenverlust oder Datenschutzverletzungen beim Betreiber
- Schäden durch unbefugten Zugriff auf den Server
- Schäden durch fehlerhafte oder unangemessene KI-Antworten
- Kosten durch OpenAI-API-Nutzung

Die Nutzung erfolgt auf eigene Verantwortung des Betreibers. Siehe auch [LICENSE](LICENSE) (AGPL-3.0, Abschnitt 15–17).

---

## Herkunft & Entwicklungsstand

moo-gpt ist eine Weiterentwicklung von [mmbbs-gpt](https://service.joerg-tuttas.de:82/root/mmbbs_gpt) von Jörg Tuttas.

Dieses Projekt wird von einer Lehrkraft ohne formale Informatikausbildung entwickelt, überwiegend mit Unterstützung von KI-Werkzeugen. Der Code entspricht möglicherweise nicht in allen Teilen professionellen Softwarestandards. Es wird aktiv daran gearbeitet, eine solide Struktur für die Weiterentwicklung durch andere zu etablieren.

Das Projekt befindet sich in aktiver Weiterentwicklung. Breaking Changes zwischen Versionen sind möglich – **keine Stabilitätsgarantie**.

## Feedback, Fehler & Wünsche

Fehler oder Verbesserungsvorschläge können als Issue gemeldet werden – das gilt ausdrücklich auch für Lehrkräfte und Administratoren, nicht nur für Entwickler:

→ [Neues Issue anlegen](https://github.com/matthiasgruenwald/moo-gpt/issues/new)

---

## Lizenz

[AGPL-3.0-or-later](LICENSE) – Nutzung und Weiterentwicklung frei, Änderungen müssen unter gleicher Lizenz veröffentlicht werden, auch bei Netzwerkbetrieb (SaaS).
