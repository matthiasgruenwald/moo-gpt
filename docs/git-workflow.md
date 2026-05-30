# Git-Workflow

**WICHTIG: Git nie über Sandbox ausführen.** Fertigen Terminal-Block ausgeben, Matthias führt lokal aus.

## Mac-Block

```bash
cd /Users/mg/Documents/Claude/Projects/Moodle/moo-gpt
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

## Release-Workflow

CHANGELOG.md liegt im Root-Verzeichnis. Releases werden über Git-Tags und `git-cliff` verwaltet.

### Einmaliger Setup (git-cliff installieren)

```bash
VERSION=$(curl -s "https://api.github.com/repos/orhun/git-cliff/releases/latest" | grep '"tag_name"' | cut -d'"' -f4 | tr -d v)
curl -L "https://github.com/orhun/git-cliff/releases/download/v${VERSION}/git-cliff-${VERSION}-x86_64-unknown-linux-gnu.tar.gz" -o /tmp/git-cliff.tar.gz
tar xzf /tmp/git-cliff.tar.gz -C /tmp
install /tmp/git-cliff-${VERSION}/git-cliff /usr/local/bin/git-cliff
git-cliff --version
```

### Commit-Typen für den Changelog

| Typ | Kategorie | Beispiel |
|-----|-----------|---------|
| `feat:` | 🚀 Features | `feat: Audio-Eingabe per Mikrofon` |
| `enhance:` | 🌟 Enhancements | `enhance: TTS-Button in Chat-History` |
| `fix:` | 🐛 Bug Fixes | `fix: Config-Overlay öffnet links (#112)` |
| `security:` | 🔒 Security | `security: Rate-Limit für API-Endpunkte` |
| `refactor:`, `test:`, `docs:`, `chore:` | *(nicht im Changelog)* | — |

Breaking Changes: Eigener `### ⚠️ Breaking Changes`-Block, manuell in CHANGELOG.md eingetragen (kein git-cliff-Typ dafür).

### Patch-Release (x.x.1 — nur Bug Fixes)

```bash
# 1. Fix-Branch auf main mergen (auf LXC)
git checkout main
git merge fix/bug-name

# 2. CHANGELOG-Entwurf generieren (neuen Abschnitt oben einfügen)
git-cliff --unreleased --tag v3.0.1 --prepend CHANGELOG.md

# 3. Entwurf in CHANGELOG.md prüfen und ggf. manuell anpassen
# (z.B. Formulierung schärfen, Breaking-Changes-Block ergänzen)

# 4. Release committen und taggen
git add CHANGELOG.md
git commit -m "chore: release v3.0.1"
git tag v3.0.1
git push && git push --tags
```

### Minor-Release (x.1.0 — Features & Enhancements)

Gleicher Ablauf wie Patch-Release, Tag ist x.1.0.

### Major-Release (x.0.0 — Breaking Changes oder Grundarchitektur)

Wie Minor-Release, aber Breaking-Changes-Block manuell ausformulieren. Tag ist x.0.0.

---

## Hinweise

- `grep -P` auf macOS nicht verfügbar → `grep -E` verwenden
- Env-Datei: `/etc/moo-gpt.env` (nicht im Projektverzeichnis)
- Plan-Dateien: `docs/plans/` (im Repo, nicht `~/.claude/plans/`)
