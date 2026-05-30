# graphify-data

Dieser Branch enthält den generierten Wissensgraphen des moo-gpt Codebases.

Er ist vom `main`-Branch entkoppelt (Orphan-Branch) und wird beim normalen
`git clone` nicht mitgeliefert. Andere Nutzer bekommen diesen Inhalt nur, wenn
sie den Branch explizit fetchen.

## Update-Workflow (Laptop)

```bash
cd /pfad/zu/moo-gpt
git checkout main          # Sicherstellen: sauberes Working Tree auf main

# graphify ausführen → schreibt in graphify-out/ (gitignored auf main)

git worktree add /tmp/gdata graphify-data
cp -r graphify-out/. /tmp/gdata/graphify-out/
cd /tmp/gdata
git add graphify-out/
git commit -m "chore: graphify update"
git push origin graphify-data
cd /pfad/zu/moo-gpt
git worktree remove /tmp/gdata
```

## LXC: Output nach Push aktualisieren

```bash
git fetch origin graphify-data
git checkout FETCH_HEAD -- graphify-out/
```

## Hinweise

- `main` muss **nicht** gepullt werden — die Branches sind vollständig unabhängig.
- Der `cache/`-Ordner bleibt im Branch für schnelle Re-Generierung.
