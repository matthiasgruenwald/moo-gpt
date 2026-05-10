# P3 — Plenumsphase (1 Issue)

**server.js:** `const activityLocks = new Map()` + Routen `POST/DELETE /api/activity/:activityId/lock?token=`

**moo-bot.js:** WS-Handler für `type === 'locked'` / `'unlocked'` → Overlay

**dashboard.js:** Lock/Unlock-Button, Timer-Input, Status-Badge

## Verification

Zwei Sessions (Lehrer + Schüler), Lock/Unlock-Zyklus
