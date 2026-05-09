# Git-Workflow

**WICHTIG: Git nie über Sandbox ausführen.** Fertigen Terminal-Block ausgeben, Matthias führt lokal aus.

## Mac-Block

```bash
cd ~/Documents/Claude/Projects/Moodle/moo-gpt
rm -f .git/index.lock .git/HEAD.lock
git add .
git commit -m "COMMIT-MSG"
git push
```

## LXC-Block

Immer explizit mit Branch angeben, sonst „Already up to date":

```bash
cd /opt/moo-gpt && git fetch origin '+refs/heads/*:refs/remotes/origin/*' && git pull origin BRANCH-NAME && systemctl restart moo-gpt && systemctl status moo-gpt
```

Einfaches `git pull` auf LXC holt nichts (kein upstream-Branch konfiguriert).

## LXC-Entwicklung (primärer Workflow)

Ab sofort wird direkt auf dem LXC entwickelt. Claude Code läuft in `/opt/moo-gpt`.

**Commit + Restart auf LXC:**
```bash
cd /opt/moo-gpt
git add -p
git commit -m "feat: ..."
git push
systemctl restart moo-gpt && systemctl status moo-gpt
```

## Hinweise

- `grep -P` auf macOS nicht verfügbar → `grep -E` verwenden
- Env-Datei: `/etc/moo-gpt.env` (nicht im Projektverzeichnis)
- Plan-Dateien: `docs/plans/` (im Repo, nicht `~/.claude/plans/`)
