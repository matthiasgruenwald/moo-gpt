# Graph Report - .  (2026-05-20)

## Corpus Check
- 130 files · ~145,015 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 773 nodes · 1356 edges · 59 communities (39 shown, 20 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Admin Dashboard UI|Admin Dashboard UI]]
- [[_COMMUNITY_Project Docs & Domain Concepts|Project Docs & Domain Concepts]]
- [[_COMMUNITY_Chat Widget (moo-bot.js)|Chat Widget (moo-bot.js)]]
- [[_COMMUNITY_Server Config & Deployment|Server Config & Deployment]]
- [[_COMMUNITY_Core Infrastructure Docs|Core Infrastructure Docs]]
- [[_COMMUNITY_Database Layer|Database Layer]]
- [[_COMMUNITY_Route Decomposition Modules|Route Decomposition Modules]]
- [[_COMMUNITY_Architecture Optimization|Architecture Optimization]]
- [[_COMMUNITY_Activity Config UI|Activity Config UI]]
- [[_COMMUNITY_System Architecture Overview|System Architecture Overview]]
- [[_COMMUNITY_Student Chat UI (Screenshot)|Student Chat UI (Screenshot)]]
- [[_COMMUNITY_ChatSession Logic|ChatSession Logic]]
- [[_COMMUNITY_Server Auth & Env Config|Server Auth & Env Config]]
- [[_COMMUNITY_Dashboard UI Rendering|Dashboard UI Rendering]]
- [[_COMMUNITY_DB Decomposition Plan|DB Decomposition Plan]]
- [[_COMMUNITY_AI Instance & Client|AI Instance & Client]]
- [[_COMMUNITY_Dashboard Settings UI|Dashboard Settings UI]]
- [[_COMMUNITY_Dashboard Response Formatting|Dashboard Response Formatting]]
- [[_COMMUNITY_Chat Widget Input|Chat Widget Input]]
- [[_COMMUNITY_Optimization Dashboard UI|Optimization Dashboard UI]]
- [[_COMMUNITY_Teacher Store Internals|Teacher Store Internals]]
- [[_COMMUNITY_Domain Concepts (Widget Config)|Domain Concepts (Widget Config)]]
- [[_COMMUNITY_API Fetch Utilities|API Fetch Utilities]]
- [[_COMMUNITY_Plenumsphase & LockManager|Plenumsphase & LockManager]]
- [[_COMMUNITY_Personas Route Internals|Personas Route Internals]]
- [[_COMMUNITY_Activity Settings Form UI|Activity Settings Form UI]]
- [[_COMMUNITY_Dashboard Data Layer|Dashboard Data Layer]]
- [[_COMMUNITY_Config Page Utilities|Config Page Utilities]]
- [[_COMMUNITY_Cleanup Step 3 (optimize.js)|Cleanup Step 3 (optimize.js)]]
- [[_COMMUNITY_Cleanup Step 1 (validators)|Cleanup Step 1 (validators)]]
- [[_COMMUNITY_Cleanup Step 2 (criteria.js)|Cleanup Step 2 (criteria.js)]]
- [[_COMMUNITY_TinyMCE Snippet Insertion UI|TinyMCE Snippet Insertion UI]]
- [[_COMMUNITY_ClientRegistry (WebSocket)|ClientRegistry (WebSocket)]]
- [[_COMMUNITY_Optimization Pipeline Concepts|Optimization Pipeline Concepts]]
- [[_COMMUNITY_Persona Selector Logic|Persona Selector Logic]]
- [[_COMMUNITY_DB Query Internals|DB Query Internals]]
- [[_COMMUNITY_Database Schema Docs|Database Schema Docs]]
- [[_COMMUNITY_Matthias Gruenwald Persona|Matthias Gruenwald Persona]]
- [[_COMMUNITY_Chat Widget UI Assets|Chat Widget UI Assets]]
- [[_COMMUNITY_Git Workflow Docs|Git Workflow Docs]]
- [[_COMMUNITY_Dev Conventions|Dev Conventions]]
- [[_COMMUNITY_Open Issues|Open Issues]]
- [[_COMMUNITY_Version History|Version History]]
- [[_COMMUNITY_CLAUDE.local Override|CLAUDE.local Override]]
- [[_COMMUNITY_DSGVO Datenschutz|DSGVO Datenschutz]]
- [[_COMMUNITY_Projektherkunft mmbbs|Projektherkunft mmbbs]]
- [[_COMMUNITY_Reverse Proxy Setup|Reverse Proxy Setup]]
- [[_COMMUNITY_CLAUDE.md Instructions|CLAUDE.md Instructions]]
- [[_COMMUNITY_HTTPS Certificates|HTTPS Certificates]]
- [[_COMMUNITY_Localhost Test Page|Localhost Test Page]]
- [[_COMMUNITY_System Components Diagram|System Components Diagram]]
- [[_COMMUNITY_Chat Message Flow|Chat Message Flow]]
- [[_COMMUNITY_Female Bot Avatar|Female Bot Avatar]]
- [[_COMMUNITY_Teacher Routes|Teacher Routes]]
- [[_COMMUNITY_Personas Routes|Personas Routes]]
- [[_COMMUNITY_Issue 6 Chat Management|Issue #6 Chat Management]]
- [[_COMMUNITY_Issue 9 Multi-Activity Snippet|Issue #9 Multi-Activity Snippet]]

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 59 edges
2. `MOOBOT` - 40 edges
3. `CLAUDE.md Key Files Table` - 27 edges
4. `escHtml()` - 17 edges
5. `moo-gpt CLAUDE.md (Dev Context)` - 15 edges
6. `moo-gpt Project` - 15 edges
7. `Feature-Roadmap Index` - 13 edges
8. `db.js Decomposition Strategie` - 12 edges
9. `Route-Dekomposition Plan (00-plan.md)` - 12 edges
10. `server.js — Reiner Orchestrator nach Cleanup (~280 Zeilen)` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Teacher Dashboard` --references--> `routes/dashboard.js (Students, Messages HTTP)`  [INFERRED]
  README.md → routes/dashboard.js
- `persona-selector.js (selectPersonasForOneClick)` --references--> `Simulation Persona (Student Archetype)`  [INFERRED]
  persona-selector.js → CLAUDE.md
- `Plenumsphase (Domain Concept)` --conceptually_related_to--> `dashboard.html (Teacher Dashboard)`  [INFERRED]
  CONTEXT.md → public/dashboard.html
- `CLAUDE.md Key Files Table` --references--> `token-log.js (recordUsage, enrichMessagesWithCost)`  [EXTRACTED]
  CLAUDE.md → token-log.js
- `TinyMCE Snippet: tegpt (Quiz/Test iframe)` --references--> `Issue #7: Role Detection for tegpt (iframe)`  [INFERRED]
  snippets/tegpt.txt → CLAUDE.md

## Hyperedges (group relationships)
- **Prompt Optimization Pipeline** — module_simulation, module_criteria, module_persona_selector, module_optimize, concept_erfahrungsprompt [INFERRED 0.85]
- **Authentication Layer** — module_auth_middleware, concept_token_auth, env_admin_user_ids, env_teacher_user_ids [INFERRED 0.85]
- **Moodle Integration Surface** — snippet_abgpt, snippet_tegpt, frontend_moobot, frontend_chat_html, concept_moodle_boost_theme [INFERRED 0.85]
- **Student–AI Math Tutoring Interaction** —  [INFERRED 1.00]
- **Admin Settings Edit Group** —  [INFERRED 1.00]

## Communities (59 total, 20 thin omitted)

### Community 0 - "Admin Dashboard UI"
Cohesion: 0.03
Nodes (58): adminPanel, adminTabBtn, backBtn, body, btn, cachedAdminPersonas, cachedGlobalPersonas, chatCost (+50 more)

### Community 1 - "Project Docs & Domain Concepts"
Cohesion: 0.05
Nodes (63): moo-gpt CLAUDE.md (Dev Context), Evaluation Criteria (for Prompt Quality), DSGVO / Data Privacy Compliance, Erfahrungsprompt (Activity-Level Hint Prompt), GEN_MODEL (Generation Model, distinct from Chat Model), Moodle Boost Theme (Required for Role Detection), One-Click Optimization, Simulation Persona (Student Archetype) (+55 more)

### Community 3 - "Server Config & Deployment"
Cohesion: 0.06
Nodes (34): Systemd Service Configuration, _config, getCachedConfig(), updateCachedConfig(), act, activityCost, activityId, activityRouter (+26 more)

### Community 4 - "Core Infrastructure Docs"
Cohesion: 0.09
Nodes (29): CLAUDE.md Key Files Table, moo-gpt Architecture Overview, public/chat.html (Standalone Chat iframe), Moodle Integration via TinyMCE Snippet, Installation Prerequisites, AIClient, isTransient(), sleep() (+21 more)

### Community 5 - "Database Layer"
Cohesion: 0.13
Nodes (26): initDb() – Schema-Erstellung und Migrationen, getDb(), initDb(), erf, router, text, erf, erkenntnisse (+18 more)

### Community 6 - "Route Decomposition Modules"
Cohesion: 0.14
Nodes (30): ai-instance.js — oai + aiClient Singletons, config-cache.js — Modul-Singleton für cachedConfig, enrichStudentsWithCost — exportierte Hilfsfunktion aus dashboard.js, env-config.js — Berechnete Env-Konstanten, Factory-Pattern: createActivityRouter (chatRegistry, dashboardRegistry, activityLocks), Factory-Pattern: createAdminRouter (dashboardRegistry), Schritt 1: Infrastruktur-Module (01-infra-modules.md), Route-Dekomposition Plan (00-plan.md) (+22 more)

### Community 7 - "Architecture Optimization"
Cohesion: 0.1
Nodes (29): Aktivitätssperren (activityLocks Map), Admin-Shell-Befehls-Whitelist (execFileSync), AIClient-Seam (Retry, Timeout, oai-Wrapper), Auth-Middleware (requireDashboardAuth, requireAdminAuth), Chat-Handler aufteilen (resolveActivity, resolveThread), ClientRegistry (WebSocket-Client-Verwaltung), One-Click-Optimierung SSE Endpoint, personas Tabelle (teacher_id NULL = global) (+21 more)

### Community 8 - "Activity Config UI"
Cohesion: 0.12
Nodes (23): activityId, computeDirty(), el, elError, elForm, elLoading, f, getFields() (+15 more)

### Community 9 - "System Architecture Overview"
Cohesion: 0.14
Nodes (25): Chat-Widget (moo-bot.js), Lehrer-Dashboard, Express-Server (server.js), Moodle TinyMCE, OpenAI API, SQLite Datenbank, mod_moogpt (Moodle Aktivitätsmodul), Moodle Capabilities (Rechtemodell) (+17 more)

### Community 10 - "Student Chat UI (Screenshot)"
Cohesion: 0.1
Nodes (25): Abgabestatus Block (Submission Status), Aufgabenhinweise Button (Task Hints), Bewertungsstatus Block (Rating Status), Welche Aufgabe?/Was bedeutet? Button im Chat, Token-Kosten-Anzeige je Chat-Nachricht, Gut/Schlecht Bewertungs-Badges in Chat-Nachrichten, Chat Header – Mathias GPT, Chat Input Field (+17 more)

### Community 11 - "ChatSession Logic"
Cohesion: 0.18
Nodes (16): ChatSession, detectRole(), resolveActivity(), resolveThread(), getActivity(), upsertActivity(), findThread(), getMessages() (+8 more)

### Community 12 - "Server Auth & Env Config"
Cohesion: 0.19
Nodes (18): Environment Variables Configuration, dashboardTokens, generateDashboardToken(), getTokenData(), getUserIdFromToken(), getUserNameFromToken(), isOriginAllowed(), now (+10 more)

### Community 13 - "Dashboard UI Rendering"
Cohesion: 0.15
Nodes (20): appendMessage(), appendSessionHeader(), buildFeedbackBar(), formatCost(), formatCostFull(), formatCostTriple(), handleConfigUpdated(), handleNewMessage() (+12 more)

### Community 14 - "DB Decomposition Plan"
Cohesion: 0.11
Nodes (19): db.js Decomposition Strategie, DB-Schritt 01: stores/admin.js extrahieren, DB-Schritt 02: stores/activity.js extrahieren, DB-Schritt 05: stores/teacher.js extrahieren, DB-Schritt 06: stores/feedback.js extrahieren, DB-Schritt 07: stores/criteria.js extrahieren, DB-Schritt 08: stores/persona.js extrahieren, DB-Schritt 09: stores/chat.js + stores/dashboard.js extrahieren (+11 more)

### Community 15 - "AI Instance & Client"
Cohesion: 0.12
Nodes (15): aiClient, oai, EU-konformer Betrieb, allPairs, criteria, currentCriteria, erf, erfahrungsprompt (+7 more)

### Community 16 - "Dashboard Settings UI"
Cohesion: 0.16
Nodes (18): Activity Title Header, Admin Note for Systemprompt, Admin Role, Current Globalmodell Display, Dashboard Einstellungen Tab, Globalmodell Dropdown Selector, Lehrer-Personas verwalten Section, LIVE Status Badge (+10 more)

### Community 17 - "Dashboard Response Formatting"
Cohesion: 0.18
Nodes (15): attachExpandBtn(), escHtml(), highlightResponse(), loadCriteria(), renderCriteria(), renderDeletedCriteria(), renderKausalkette(), renderMsgContent() (+7 more)

### Community 18 - "Chat Widget Input"
Cohesion: 0.15
Nodes (11): chatInput, chatWindow, handleKeyDown(), htmlContent, lastReceivedMessage, loading, message, messageObj (+3 more)

### Community 19 - "Optimization Dashboard UI"
Cohesion: 0.16
Nodes (14): Dashboard Optimierung Screen, One-Click Optimierung, Persona: Der Technik-Enthusiast, Persona: Unsicherer Fragesteller, Globale Typen (Preset Personas), Meine Personas (Custom Teacher Personas), Bewertungskriterien Section, Manuelle Simulation Section (+6 more)

### Community 20 - "Teacher Store Internals"
Cohesion: 0.23
Nodes (11): id, pref, router, validErr, createTeacherTemplate(), deleteTeacherTemplate(), getTeacherTemplates(), setSystemTemplate() (+3 more)

### Community 21 - "Domain Concepts (Widget Config)"
Cohesion: 0.21
Nodes (11): Aktivität (Domain Concept), Lehrer-Vorlage (Domain Concept), Systemvorlage (Domain Concept), Widget-Konfiguration (Domain Concept), VALID_BOT_ICONS, VALID_UPLOAD_MODES, validateWidgetConfig(), config.html (Activity Settings UI) (+3 more)

### Community 22 - "API Fetch Utilities"
Cohesion: 0.22
Nodes (13): apiDelete(), apiFetch(), apiGet(), apiPost(), apiPut(), formatTime(), loadAdmins(), loadErfahrungsprompt() (+5 more)

### Community 23 - "Plenumsphase & LockManager"
Cohesion: 0.17
Nodes (7): activityLocks Map (ersetzt durch LockManager), Handoff Schritt 05: LockManager, Schritt 05: LockManager kapseln (Plan), Plenumsphase (Domain Concept), LockManager – Aktivitätssperren-Kapselung, LockManager, Plenumsphase – Aktivitätssperre für Klassendiskussion

### Community 24 - "Personas Route Internals"
Cohesion: 0.24
Nodes (10): msgs, router, sample, teacherName, createPersona(), deletePersona(), getAllPersonasForUser(), getAllTeacherPersonasGrouped() (+2 more)

### Community 25 - "Activity Settings Form UI"
Cohesion: 0.2
Nodes (12): Beschreibung / Kontext-Textfeld, Bewertungsüberblick Sektion, Bot-Typ Auswahlfeld, Lösung-Feld (g(x)), One-Click-Optimize Bereich, Speichern & Schließen Button, Aktivitäts-Einstellungen Panel, Zur Aufgabe wechseln Button (+4 more)

### Community 26 - "Dashboard Data Layer"
Cohesion: 0.2
Nodes (9): act, enrichStudentsWithCost(), messages, router, student, students, threadCost, threadDbId (+1 more)

### Community 27 - "Config Page Utilities"
Cohesion: 0.18
Nodes (11): applySettingsData(), getGenModel(), initAdminDebug(), loadAdminPersonas(), loadPersonas(), loadSimulatePanel(), populateGenModelSelects(), populatePersonaSelect() (+3 more)

### Community 28 - "Cleanup Step 3 (optimize.js)"
Cohesion: 0.22
Nodes (8): Handoff Schritt 03: optimize.js Store-Zugriffe entkoppeln, Schritt 03: optimize.js Store-Zugriffe entkoppeln (Plan), Erkenntnis (Domain Concept), DB-Schritt 04: stores/prompt.js extrahieren, Erfahrungsprompt – Aktivitätsspezifischer Prompt-Zusatz, generateOptimizeProposal() – KI-Optimierungsvorschlag, generateOptimizeProposal(), stores/prompt.js – System- und Erfahrungsprompt Store

### Community 29 - "Cleanup Step 1 (validators)"
Cohesion: 0.25
Nodes (9): Git Branch cleanup/code-struktur, Handoff Schritt 01: validators.js verschieben, Schritt 01: validators.js verschieben (Plan), Handoff Schritt 04: persona-selector.js extrahieren, Schritt 04: persona-selector.js extrahieren (Plan), Cleanup Code-Struktur Strategie, validateWidgetConfig() – Widget-Konfigurationsvalidierung, validators.js (Root) – Domain-Validierung (+1 more)

### Community 30 - "Cleanup Step 2 (criteria.js)"
Cohesion: 0.25
Nodes (8): augmentCriteria() – Kriterien ergänzen, Handoff Schritt 02: criteria.js Store-Zugriff entkoppeln, Schritt 02: criteria.js Store-Zugriff entkoppeln (Plan), augmentCriteria(), suggestCriteriaList(), One-Click-Optimierung – Automatische Prompt-Verbesserung, selectPersonasForOneClick() – Diversitätsoptimierte Persona-Auswahl, suggestCriteriaList() – KI-Kriterienvorschlag

### Community 31 - "TinyMCE Snippet Insertion UI"
Cohesion: 0.36
Nodes (8): Button: Abbrechen (Cancel), Moodle Activity Editor (Aufgabe hinzufügen), Snippet: KI-Chat (moo-gpt), Snippet: KI-Chat Testfrage (iframe), Snippet: Youtube, TinyMCE Snippet Selector Dialog, TinyMCE Toolbar: Snippet/Sparkle Icon, UI Flow: Insert Snippet into TinyMCE

### Community 33 - "Optimization Pipeline Concepts"
Cohesion: 0.48
Nodes (7): Erfahrungsprompt (Domain Concept), Kriterien (Domain Concept), One-Click-Optimierung (Domain Concept), Persona (Domain Concept), Simulation (Domain Concept), dashboard.js (Teacher Dashboard Logic), dashboard.html (Teacher Dashboard)

### Community 34 - "Persona Selector Logic"
Cohesion: 0.43
Nodes (6): ONE_CLICK_FALLBACK_NAMES, selectDiverse(), selectPersonasForOneClick(), selectDiverse() – Diversitätsbasierte Auswahl aus Pool, getGlobalPersonas(), getTeacherPersonas()

### Community 35 - "DB Query Internals"
Cohesion: 0.29
Nodes (6): cols, db, existing, GLOBAL_PERSONAS, insert, insertAll

### Community 36 - "Database Schema Docs"
Cohesion: 0.33
Nodes (6): Database Schema Overview, DB: activities table, DB: config table, DB: messages table, DB: threads table, DB: token_log table

### Community 37 - "Matthias Gruenwald Persona"
Cohesion: 0.67
Nodes (3): Matthias Gruenwald Avatar (3D Cartoon), Matthias Gruenwald (User/Developer), Profile Image Asset

### Community 38 - "Chat Widget UI Assets"
Cohesion: 0.67
Nodes (3): Chat Bot Avatar Icon, Close / Dismiss Icon, Science Teacher Bitmoji Persona (grw2)

## Knowledge Gaps
- **271 isolated node(s):** `DATE_OPTIONS`, `TIME_OPTIONS`, `_config`, `VALID_UPLOAD_MODES`, `VALID_BOT_ICONS` (+266 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CLAUDE.md Key Files Table` connect `Core Infrastructure Docs` to `Optimization Pipeline Concepts`, `Persona Selector Logic`, `Server Config & Deployment`, `Database Layer`, `ChatSession Logic`, `Server Auth & Env Config`, `AI Instance & Client`, `Teacher Store Internals`, `Domain Concepts (Widget Config)`, `Plenumsphase & LockManager`, `Personas Route Internals`, `Dashboard Data Layer`, `Cleanup Step 3 (optimize.js)`, `Cleanup Step 2 (criteria.js)`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `Moodle Integration Guide` connect `Project Docs & Domain Concepts` to `Core Infrastructure Docs`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **What connects `DATE_OPTIONS`, `TIME_OPTIONS`, `_config` to the rest of the system?**
  _271 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Dashboard UI` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Project Docs & Domain Concepts` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Chat Widget (moo-bot.js)` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Server Config & Deployment` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._