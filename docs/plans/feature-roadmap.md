# moo-gpt Feature-Roadmap — Index

## Dependency-Graph

```
P1 (Bugs) ─────┐
P2 (UX)  ──────┤
P3 (Plenum) ───┤──► P4 (Rename Code) ──► P4a (Rename Infra) ──► P5 (Config) ──► P5a (Snippet-Refactoring) ──► P5b (Vorlagen) ──► P10 (OSS)
                │                                              └──► P6 (Personas) ──► P7 (One-Click) ──────────────────────────────────┘
P8 (Debug) ────┘ (eigenständig)
P9 (Grafik) ─────── (eigenständig, parallel zu P5a–P7)
```

## Workflow pro Paket

1. Refactoring betroffener Dateien (nur was zum Paket gehört)
2. Tests zuerst (`.test.js` oder HTTP-Requests in `test.http`)
3. Implementierung
4. Code-Review mit `/review` Skill
5. Security-Check bei P8, P10 mit `/security-review`
6. Commit (`feat:` / `fix:` / `refactor:`) + `gh issue close`

## Pakete

| Paket | Titel | Status | Datei |
|-------|-------|--------|-------|
| P1 | Bugs (3 Issues) | ✓ done | [steps/p1-bugs.md](steps/p1-bugs.md) |
| P2 | UX: Button-States + Gelöschte Vorschläge | ✓ done | [steps/p2-ux-button-states-soft-delete.md](steps/p2-ux-button-states-soft-delete.md) |
| P3 | Plenumsphase | ✓ done | [steps/p3-plenumsphase.md](steps/p3-plenumsphase.md) |
| P4 | Umbenennung Code: mmbbs-gpt → moo-gpt | ✓ done | [steps/p4-umbenennung-code.md](steps/p4-umbenennung-code.md) |
| P4a | Umbenennung Infra: mmbbs-gpt → moo-gpt | ✓ done | [steps/p4a-umbenennung-infra.md](steps/p4a-umbenennung-infra.md) |
| P5 | Konfig-Seite | ✓ done | [steps/p5-konfig-seite.md](steps/p5-konfig-seite.md) |
| P5a | Snippet-Refactoring: DB-gesteuerte Konfiguration | ✓ done | [steps/p5a-snippet-refactoring.md](steps/p5a-snippet-refactoring.md) |
| P5b | Lehrer-Vorlagen-Bibliothek | ✓ done | [steps/p5b-lehrer-vorlagen.md](steps/p5b-lehrer-vorlagen.md) |
| P6 | Personas-Umbau | ✓ done | [steps/p6-personas-umbau.md](steps/p6-personas-umbau.md) |
| P7 | One-Click Optimierung | ✓ done | [steps/p7-one-click-optimierung.md](steps/p7-one-click-optimierung.md) |
| P8 | Debugging-Zugriff Admin-only | ✓ done | [steps/p8-debugging-admin-only.md](steps/p8-debugging-admin-only.md) |
| P9 | Grafische Darstellung | ✓ done | [steps/p9-grafische-darstellung.md](steps/p9-grafische-darstellung.md) |
| P10 | Repository-Veröffentlichung | | [steps/p10-repository-veröffentlichung.md](steps/p10-repository-veröffentlichung.md) |
