# P8 — Debugging-Zugriff Admin-only (1 Issue)

**Sicherheitskritisch — `/security-review` vor Commit.**

Routen mit `isAdmin` Guard: `GET /api/admin/logs`, `POST /api/admin/restart`, `POST /api/admin/git-pull` — alle via `execFileSync` mit fester Befehls-Whitelist, kein Shell-String.

## Verification

Als Admin einloggen, kein freier Shell-Input
