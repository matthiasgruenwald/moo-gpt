# P4 — Umbenennung Code: mmbbs-gpt → moo-gpt ✓ done

Scope: `db.js`, `public/mmbbs-bot.js` → `moo-bot.js`, `index.html`, `README.md`, `snippets/abgpt.txt`, `snippets/tegpt.txt` (Inhalt, nicht Dateinamen), `package.json`.

## Verification

`grep -rE "mmbbs" . | grep -v ".git"` → 0 Treffer
