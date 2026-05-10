# P2 — UX: Button-States + Gelöschte Vorschläge (2 Issues)

## U1: Button-States

`#criteria-suggest-btn` und `#personas-suggest-btn` im Click-Handler: `btn.disabled = true` vor `try`, `btn.disabled = false` in `finally`.

**Datei:** `public/dashboard.js`

## U2: Gelöschte Kriterien wieder anzeigen (Soft-Delete)

**DB-Migration:**
```sql
ALTER TABLE erkenntnisse ADD COLUMN status TEXT DEFAULT 'active';
```

**db.js:** `getCriteria` → `AND status='active'`; `softDeleteCriterion(id)`; `restoreCriterion(id)`

**server.js:** `DELETE /api/criteria/:id` → soft delete; neuer `PATCH /api/criteria/:id/restore`

**dashboard.js:** Abschnitt "Verworfene Vorschläge" mit Restore-Button

## Verification

Browser-Test + `test.http`
