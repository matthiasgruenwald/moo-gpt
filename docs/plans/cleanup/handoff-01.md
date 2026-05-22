# Handoff: Schritt 01 – validators.js verschieben

**Branch:** `cleanup/code-struktur` (neu anlegen von `main`)
**Ziel:** `routes/validators.js` → Root `validators.js`, Funktion umbenennen, Imports aktualisieren.
**Verhaltensänderung:** keine.

---

## Was zu tun ist

Vollständige Anleitung: `docs/plans/cleanup/01-validators-verschieben.md`

Kurzfassung:

1. Branch anlegen: `git checkout -b cleanup/code-struktur`

2. `validators.js` neu anlegen (Root-Ebene) mit Inhalt aus dem Plan.

3. `routes/validators.js` löschen.

4. In `routes/activity.js`, `routes/admin.js`, `routes/teacher.js`:
   - Import-Pfad ändern: `'./validators.js'` → `'../validators.js'`
   - Funktionsname ändern: `validateTemplateFields` → `validateWidgetConfig`

5. Optional: In `config-cache.js` den `getCachedConfig`-Return auf `Object.freeze({..._config})` ändern.

---

## Testen (durch Matthias)

1. `systemctl restart moo-gpt && journalctl -u moo-gpt -n 5 --no-pager` → kein Importfehler
2. Dashboard → Tab Einstellungen → Aktivitätskonfiguration ändern (Bot-Icon oder Upload-Modus) → speichern → kein Fehler
3. Dashboard → Tab Einstellungen → Lehrer-Vorlage speichern → kein Fehler
4. Admin-Tab → Systemvorlage speichern → kein Fehler

---

## Nach erfolgreichem Test

```bash
git add validators.js config-cache.js routes/activity.js routes/admin.js routes/teacher.js
git rm routes/validators.js
git commit -m "refactor: validators.js in Root verschieben, validateWidgetConfig umbenennen"
git push -u origin cleanup/code-struktur
```
