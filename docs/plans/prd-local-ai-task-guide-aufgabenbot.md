# PRD: local_ai_task_guide Aufgabenbot fuer Moodle

## Problem Statement

Lehrkraefte brauchen in Moodle eine KI-Unterstuetzung, die nicht nur allgemeine Kursfragen beantwortet, sondern konkret an einer Aufgabe oder Aktivitaet hilft. Der bestehende allgemeine AI-Chatblock ist als Kursbegleiter nuetzlich, aber er kennt nicht automatisch den konkreten Arbeitsauftrag, die eingebetteten Aufgabenbilder und die didaktische Rolle, die die Lehrkraft fuer eine bestimmte Aktivitaet vorgesehen hat.

Das bisherige moo-gpt-System loest diese Luecke ueber ein TinyMCE-Snippet und einen externen Express/SQLite-Stack. Dieser Weg ist fuer einen Pilot gut, aber langfristig entstehen Reibung an Moodle-Auth, Moodle-Rechten, Aktivitaetskontext, Datenhaltung, Dashboard-Zugang und Medienverarbeitung. Gleichzeitig sind mehrere bestehende Funktionen aus dem bisherigen moo-gpt didaktisch so wichtig, dass eine Moodle-Plugin-V1 sie von Anfang an beruecksichtigen muss: Aufgabenprompt, automatische Aufgabenbild-Verarbeitung, Schueler-Bilduploads/PDF-als-Bild, Lehreransicht, Unterrichts-Zusammenfassung und Plenumsmodus.

Das Ziel ist deshalb nicht, den allgemeinen ByCS/AI-Chatblock zu ersetzen. Ziel ist ein Zusatzplugin, das echte Moodle-Aktivitaetsseiten um einen aufgabenbezogenen Aufgabenbot ergaenzt und dabei die vorhandene AI-Manager-Infrastruktur nutzt, ohne den AI-Manager oder den allgemeinen Chatblock veraendern zu muessen.

## Solution

Es wird ein Moodle-Zusatzplugin `local_ai_task_guide` konzipiert. Der deutsche Anzeigename ist **KI-Aufgabenbegleiter**. Es verwaltet Aufgabenprofile pro Course Module bzw. Aktivitaetskontext und zeigt auf Aktivitaetsseiten nur dann einen Aufgabenbot, wenn fuer diese Aktivitaet ein aktives Aufgabenprofil existiert. Der Aufgabenbot nutzt den allgemeinen AI-Manager-/Kurschat-Kontext als Grundlage, ergaenzt aber einen aufgabenspezifischen Aufgabenprompt sowie den serverseitig extrahierten Aktivitaetskontext aus Moodle.

`local_ai_task_guide` ist fachlich getrennt vom allgemeinen Kursbot. Der allgemeine Kursbot bleibt beim bestehenden AI-Chatblock. Der Aufgabenbot bekommt eine eigene visuelle Identitaet, einen eigenen multimodalen Verlauf und eine eigene Lehreransicht. Diese Trennung ist bewusst: Der Aufgabenbot soll nicht den Kursbot beeinflussen, sondern gezielt bei einer Aktivitaet helfen.

Die V1 liefert:

- Aufgabenprofile fuer echte Moodle-Aktivitaetsseiten
- Aufgabenbot mit eigenem Avatar/Button, Aufgabenbezug und kurzer Hinweiszeile
- serverseitige Aktivitaetskontext-Extraktion mit Text und eingebetteten Moodle-Bildern
- multimodale Aufgabenbot-Chats mit Text, Bildern und einseitigen PDFs als Bild
- Lehrer-Aktivitaetsansicht mit Aufgabenprofil, Schuelerchats und Unterrichts-Zusammenfassung
- Kurs-Cockpit zur Verwaltung von Aufgabenprofilen ueber mehrere unterstuetzte Aktivitaeten
- Plenumsmodus zum vollstaendigen Sperren des Aufgabenbots fuer Schueler
- Prompt-Werkzeug `Pruefen & verbessern` fuer vorhandene Aufgabenprompts
- Kontextdiagnose und read-only Kontext-Vorschau fuer Lehrkraefte
- erster technischer Spike: Bildrequests ueber den AI-Manager beweisen

Ein spaeter optionaler `block_ai_task_guide` kann als Kurs-Cockpit-/Navigationseinstieg dienen. Der Block ist nicht Voraussetzung fuer den Aufgabenbot.

## User Stories

1. As a student, I want to see a clearly recognizable Aufgabenbot on an activity page, so that I understand this AI help is about the current task.
2. As a student, I want the Aufgabenbot to know the current task description, so that I do not have to restate the assignment.
3. As a student, I want the Aufgabenbot to understand images embedded in the task, so that I can ask questions about worksheets, diagrams and visual instructions.
4. As a student, I want to upload one image in a chat message when uploads are enabled, so that I can ask about my own work or a visual problem.
5. As a student, I want to paste an image from the clipboard when uploads are enabled, so that screenshots and copied material are easy to use.
6. As a student, I want to upload a one-page PDF when file uploads are enabled, so that a simple worksheet page can be discussed.
7. As a student, I want PDFs to be handled like visual task material, so that the AI can respond to the visible page contents.
8. As a student, I want the Aufgabenbot to be unavailable when the activity is hidden or unavailable to me, so that Moodle availability rules remain consistent.
9. As a student, I want the Aufgabenbot to disappear or show a lock hint during Plenumsphase, so that I focus on the shared classroom discussion.
10. As a student, I want the Aufgabenbot not to show teacher-only diagnostics, so that I am not confused by technical context status.
11. As a student, I want the Aufgabenbot to have its own history, so that task-specific chats are not mixed with the general course chat.
12. As a student, I want the Aufgabenbot to look different from the general AI chat button, so that I can distinguish task help from general course help.

13. As an editing teacher, I want to create an Aufgabenprofil from the activity page, so that I can configure the Aufgabenbot while looking at the activity.
14. As an editing teacher, I want to create an Aufgabenprofil from a Kurs-Cockpit, so that I can prepare several activities efficiently.
15. As an editing teacher, I want one shared Aufgabenprofil editor regardless of entry point, so that the configuration model stays consistent.
16. As an editing teacher, I want to save an incomplete Aufgabenprofil as draft, so that I can prepare it over time.
17. As an editing teacher, I want an Aufgabenbot to be activatable only when an Aufgabenprompt exists, so that no vague task bot is shown to students.
18. As an editing teacher, I want to deactivate an active Aufgabenbot without deleting its profile or chats, so that I can pause task support safely.
19. As an editing teacher, I want the Aufgabenprofil to store title, avatar/icon, opener, upload mode, math mode and Aufgabenprompt, so that the bot can be adapted to the task.
20. As an editing teacher, I want upload mode to be configurable per activity, so that I can decide whether students may upload no files, images only or images plus PDFs.
21. As an editing teacher, I want the Aufgabenprompt field to show guidance about Fach/Thema, Rolle des Bots, Lernziel, Antwortstil, Didaktik and Verbote, so that I know what the prompt should contain.
22. As an editing teacher, I want the `Pruefen & verbessern` button to work only after I have written a basic Aufgabenprompt, so that the AI improves my intent instead of inventing it from the worksheet alone.
23. As an editing teacher, I want the `Pruefen & verbessern` result to compare the current prompt and the improved prompt, so that I consciously decide what to adopt.
24. As an editing teacher, I want no AI-generated opener proposal in V1, so that personal classroom tone stays my responsibility.
25. As an editing teacher, I want no direct prompt creation without my own prompt in V1, so that the AI does not guess my didactic role.
26. As an editing teacher, I want the interactive long Rückfragen-Modus to be out of V1 unless it is nearly reusable, so that V1 stays focused.

27. As an editing teacher, I want a Kurs-Cockpit listing supported activity pages, so that I can see where an Aufgabenbot exists, is missing or needs attention.
28. As an editing teacher, I want unsupported non-activity surfaces such as text/media fields and blocks excluded from the V1 Cockpit, so that the Aufgabenbot stays tied to real activity pages.
29. As an editing teacher, I want the Cockpit to show only activity types that local_ai_task_guide can handle, so that I do not manage unsupported surfaces.
30. As an editing teacher, I want real activity pages with incomplete context to show a specific diagnosis, so that I know what to fix.
31. As an editing teacher, I want the context status to be green, yellow or red, so that I can quickly judge readiness.
32. As an editing teacher, I want `no images found` to be neutral, so that pure text assignments can still be green.
33. As an editing teacher, I want missing prompt, missing instruction, unreadable images and unavailable activities to be diagnosed separately, so that I do not have to inspect everything manually.
34. As an editing teacher, I want yellow status when context is incomplete but usable, so that I can decide whether the Aufgabenprompt compensates.
35. As an editing teacher, I want activation with incomplete context to be possible with a visible warning, so that unusual but valid activities are not blocked.
36. As an editing teacher, I want activation without Aufgabenprompt to be blocked, so that students never see an ungrounded Aufgabenbot.

37. As a teacher without editing rights, I want to read Schülerchats for an activity, so that I can support or substitute a class without changing the course.
38. As a teacher without editing rights, I want to generate the Unterrichts-Zusammenfassung, so that I can teach as a substitute without editing the course.
39. As a teacher without editing rights, I want not to edit Aufgabenprofile, so that course configuration remains controlled by editing teachers.
40. As an editing teacher, I want to see Schülerchats grouped by student in the activity view, so that I can understand individual learning paths.
41. As an editing teacher, I want Schülerchat messages to include text, images and PDF-as-image attachments, so that the teacher view reflects the actual chat.
42. As an editing teacher, I want the Zusammenfassung accessible without first opening individual chats, so that I can use it quickly during class.
43. As an editing teacher, I want the Zusammenfassung stored with timestamp and creator, so that I can reopen it without paying for another AI call.
44. As an editing teacher, I want to update the Zusammenfassung manually, so that I control when AI costs occur.
45. As an editing teacher, I want the Plenumsmodus available both near the Aufgabenbot and in the activity view, so that I can quickly control classroom focus.
46. As an editing teacher, I want Plenumsmodus to block students from reading old task chats too, so that they are not distracted during plenary work.
47. As an editing teacher, I want old chats retained when the bot is disabled or locked, so that learning evidence and summaries are not lost.

48. As an editing teacher, I want a read-only Kontext-Vorschau, so that I can inspect what the AI actually sees.
49. As an editing teacher, I want the Kontext-Vorschau to show the activity title, extracted instruction and image thumbnails, so that I can verify the AI context.
50. As an editing teacher, I want the Kontext-Vorschau not to be editable, so that the Moodle task and the AI task do not drift apart.
51. As an editing teacher, I want image extraction errors displayed in the Kontext-Vorschau, so that I can fix embedded images in Moodle.
52. As an editing teacher, I want an optional Bildverständnis-Check, so that I can see how the AI interprets task images.
53. As an editing teacher, I want the Bildverständnis-Check to suggest possible prompt additions, so that I can improve the Aufgabenprompt based on visual content.
54. As an editing teacher, I want suggested prompt additions selectable via checkboxes, so that I decide what to insert.
55. As an editing teacher, I want inserted image-understanding suggestions to remain editable in the full Aufgabenprompt, so that I can review and approve them.
56. As an editing teacher, I want saved Bildverständnis-Checks with timestamp, creator and context hashes, so that AI cost is saved and the diagnosis remains documented.
57. As an editing teacher, I want the system to detect when task text or images changed after the last Bildverständnis-Check, so that I know when the diagnosis may be stale.
58. As an editing teacher, I want changed text and changed images detected separately, so that I can judge whether the change is relevant.
59. As an editing teacher, I want to view old Bildverständnis-Checks after context changes, so that I can compare understanding over time.
60. As an editing teacher, I want to mark an old Bildverständnis-Check as still valid for a changed context, so that minor corrections do not force a new AI call.
61. As an editing teacher, I want that reuse documented with creator, time and context hash, so that the history remains honest.

62. As an administrator, I want local_ai_task_guide to use Moodle capabilities instead of custom teacher tokens, so that rights follow Moodle roles.
63. As an administrator, I want local_ai_task_guide not to modify local_ai_manager or block_ai_chat in V1, so that upstream-maintained plugins stay clean.
64. As an administrator, I want a first technical spike proving image requests through local_ai_manager, so that the feasibility of V1 is known before large implementation.
65. As an administrator, I want AI usage logged through local_ai_manager where possible, so that existing usage governance remains central.
66. As an administrator, I want local_ai_task_guide not to port the old moo-gpt cost dashboard, so that there is no parallel cost system.
67. As an administrator, I want Moodle visibility and availability respected, so that local_ai_task_guide does not create a second access channel.
68. As an administrator, I want a later optional block_ai_task_guide to be only navigation/cockpit UI, so that business logic remains in local_ai_task_guide.

## Implementation Decisions

- `local_ai_task_guide` is the V1 core plugin. Its German display name is **KI-Aufgabenbegleiter**. It is a Moodle Zusatzplugin, not a fork of the general AI chatblock and not a new activity module.
- `block_ai_task_guide` may be added later as a course-wide Cockpit/navigation entry, but it must not be required for the Aufgabenbot to appear.
- The general ByCS/AI chat remains the general Kursbot. `local_ai_task_guide` complements it with the Aufgabenbot for activity pages.
- The Aufgabenbot appears only on real activity pages with an active Aufgabenprofil. It does not appear by default on activity pages without profile.
- Text and media fields (`label`) and blocks are not V1 surfaces. The course main page already has the general chatblock.
- The Aufgabenprofil belongs to a Moodle Course Module / activity context, identified through `cmid` and context.
- The V1 profile states are `draft` and `active`. A draft may be incomplete. Active requires a non-empty Aufgabenprompt.
- Returning an active profile to draft hides/stops the Aufgabenbot for students but does not delete conversations, summaries or profile data.
- The Aufgabenprofil V1 fields are active/draft status, Aufgabenprompt, display title, icon/avatar, opener, upload mode and math mode.
- Model selection, audio input/output and Schüler-Memory are out of V1.
- Upload modes are `off`, `images` and `files`.
- `images` allows image upload.
- `files` allows images and one-page PDFs.
- PDF uploads are handled analog to the current moo-gpt behavior from the existing project: client-side PDF rendering to an image, with original type retained as `pdf`.
- Each student message supports at most one attachment in V1.
- Clipboard paste must work for image/file insertion where browser support allows it.
- Drag and drop should be supported if the existing moo-gpt code from the current project can be adapted without major additional complexity.
- The Aufgabenbot has its own multimodal conversation store, separate from the general Kursbot history, because images and PDFs are core features.
- The Aufgabenbot conversation UI may reuse/adapt the visual and reactive interaction patterns of `block_ai_chat`, but the backend history is local_ai_task_guide-owned.
- `local_ai_manager` remains the AI availability, connector, purpose, usage and request logging seam.
- V1 must not require changes to `local_ai_manager` or `block_ai_chat`.
- Images are a hard prerequisite. If multimodal image requests cannot be sent through the existing AI-Manager interfaces, the V1 architecture must be revisited.
- The first technical spike must prove a text-plus-image request through AI-Manager on Moodle 5.0 and later verify Moodle 5.1.
- The spike must prove that a model response uses image content and that usage/logging appears in AI-Manager.
- `local_ai_task_guide` must use Moodle visibility and availability rules. If a student cannot access the activity, they cannot access the Aufgabenbot.
- Activity context extraction is server-side through Moodle DB/File API, not DOM scraping.
- V1 context extraction includes activity title, instruction/description and embedded Moodle images.
- No DOM fallback is planned. If server-side extraction cannot support a type, that type/content is unsupported or partially supported.
- V1 should not hard-code only `assign` and `page` if generic extraction works for more real activity pages.
- The Kurs-Cockpit shows supported real activity pages. Unsupported types are not shown unless a future diagnostic view is added.
- Real activity pages with incomplete but supported context can be shown with precise diagnostic status.
- Context status uses green/yellow/red for teacher-facing readiness.
- `no images found` is neutral and does not make a text task yellow.
- Missing or unreadable images are diagnosed separately from missing instruction text.
- A profile can be activated with incomplete context if the Aufgabenprompt exists, but the teacher gets a visible warning.
- A profile cannot be activated without Aufgabenprompt.
- Context diagnostics are visible only to teachers.
- The Kontext-Vorschau is read-only and teacher-only.
- The Kontext-Vorschau shows what the AI sees: title, extracted instruction and images.
- The task/instruction is maintained in Moodle, not separately in local_ai_task_guide.
- A later or optional Bildverständnis-Check asks the AI to describe task images in relation to the task.
- The Bildverständnis-Check can propose prompt additions.
- Prompt additions are inserted only after teacher selection via checkbox and confirmation.
- After insertion, the teacher must still edit/review the full Aufgabenprompt and may use `Pruefen & verbessern`.
- Bildverständnis-Checks are stored as diagnosis text, not as task content.
- Stored Bildverständnis-Checks include creator, timestamp, task text hash, image hashes and combined context hash.
- Context changes are detected separately for task text and images.
- Teachers can view old checks, create a new check or mark an old check as still valid for the changed context.
- Reusing an old check for a changed context is recorded with original context hash, current context hash, reused by, reused at and optional note.
- The Prompt-Assistent V1 is limited to `Pruefen & verbessern` for an existing Aufgabenprompt.
- Direct prompt creation without teacher-written prompt is out of V1.
- The long interactive Rückfragen-Modus is out of V1 unless the old UI can be reused almost unchanged.
- The opener is not AI-generated in V1.
- The prompt field guidance must be preserved: Fach/Thema, Rolle des Bots, Lernziel, Antwortstil, Didaktik and Verbote.
- The teacher activity view has a header with activity title, status, activate/deactivate action and Plenumsphase action.
- The teacher activity view has tabs/areas: Aufgabenprofil, Schuelerchats, Zusammenfassung.
- The Zusammenfassung is per activity/profile, stored, manually updated and includes timestamp and creator.
- Teachers without editing rights can view student chats and generate summaries.
- Editing teachers can manage profiles.
- Students can use the chat but cannot see teacher diagnostics, chats of others or summaries.
- Plenumsmodus fully blocks the Aufgabenbot for students, including reading old task conversations, to avoid distraction.
- Plenumsmodus control appears both as a shortcut near the Aufgabenbot and in the activity teacher view.
- The old moo-gpt cost dashboard is not ported. Cost/usage responsibility stays with AI-Manager or later reporting on AI-Manager logs.
- Implementation may happen in a fork/new plugin repository. This PRD secures the product and architecture decisions independently of repository placement.

## Testing Decisions

- Tests should focus on observable behavior, not implementation details. Good tests verify rights, state transitions, context extraction results, AI request payload shape, upload validation, teacher-visible diagnostics and student-visible behavior.
- The first required test/spike is a technical integration proof for multimodal image requests through the AI-Manager without modifying upstream AI-Manager or Chatblock code.
- The Aufgabenprofil state machine should be unit-tested: no profile, draft, active, activation blocked without Aufgabenprompt, active to draft retains data.
- Capability behavior should be tested through Moodle role/capability expectations: student, teacher without editing rights, editingteacher and manager.
- Visibility behavior should be tested: hidden/unavailable activities do not show the Aufgabenbot to students.
- Context extraction should be tested with supported activity fixtures containing text only, text with embedded Moodle images, unreadable images and missing instruction text.
- Context status should be tested as an external result: green/yellow/red plus precise diagnostics.
- Upload handling should be tested for configured modes: off rejects uploads, images accepts images and rejects PDFs, files accepts images and one-page PDFs.
- Clipboard/paste behavior should be covered by UI-level tests where feasible.
- PDF handling should be tested for one-page acceptance and multi-page rejection in V1.
- Conversation storage should be tested with text messages, image attachment messages and PDF-as-image messages.
- Teacher Schuelerchat view should be tested by behavior: teachers can read grouped activity conversations, students cannot.
- Zusammenfassung behavior should be tested: manual generation, storage, timestamp/creator display and permission access.
- Plenumsmodus behavior should be tested: students cannot send or read task chat while locked, teachers can still view data and end the lock.
- Prompt improvement should be tested with a fake AI adapter: empty prompt disables/blocks improvement; non-empty prompt sends activity context and returns a comparison-ready suggestion.
- Bildverständnis-Check, when implemented, should be tested for stored diagnosis, context hash comparison, stale warning and confirmed reuse.
- Prior art in the current repo includes extracted handler builders for prompt tools and tests around route/service behavior. The plugin implementation should similarly isolate deep modules such as profile state, context extraction, upload validation, context diagnosis and summary generation.

## Out of Scope

- Replacing the general ByCS/AI chatblock.
- Building a general Kursbot inside local_ai_task_guide.
- Modifying local_ai_manager or block_ai_chat in V1.
- Porting the old Express/SQLite stack as-is.
- Porting the old cost dashboard or custom cost accounting.
- Audio input, Whisper/STT, TTS, voice selection and autoplay.
- Schüler-Memory.
- Direct prompt creation from only the task description.
- AI-generated opener text.
- Full interactive Rückfragen prompt dialog unless it is nearly free to reuse.
- Multiple attachments per student message.
- Multi-page PDF support.
- Office files, arbitrary file uploads, Scratch/code files and audio uploads.
- Quiz question extraction, forum thread extraction, workshop submissions, book chapter extraction and other typenspecific deep content.
- Text/media fields (`label`) and blocks as Aufgabenbot targets in V1.
- Automatic profile creation for all activities.
- Bulk actions in the Kurs-Cockpit.
- Course-wide chat monitoring in V1.
- Automatic AI re-checks on every context change.
- Student-visible context diagnostics.

## Further Notes

- Moodle 5.0 is the current target; Moodle 5.1 will follow shortly and must be considered for compatibility.
- The project should start with the AI-Manager image request spike because it can invalidate core assumptions.
- Images are not optional. The ability to include task images and student-uploaded images is part of the core value proposition.
- The current moo-gpt implementation in this repository is useful prior art for upload handling, PDF-as-image conversion, prompt improvement and teacher-facing summary behavior.
- The new plugin should prefer deep, testable modules: Aufgabenprofil state/resolution, Aktivitaetskontext extraction, Kontextdiagnose, Upload validation/conversion, Conversation store, Summary store and AI-Manager adapter.
- Repository placement is open. A fork or new plugin repository may be appropriate, but the PRD should remain the source of product decisions.
