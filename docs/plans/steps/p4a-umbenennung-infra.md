# P4a — Umbenennung Infra: mmbbs-gpt → moo-gpt

**Voraussetzung:** P4 ✓

## Schritte (auf LXC als root)

1. Dienst stoppen: `systemctl stop mmbbs-gpt`
2. Ordner umbenennen: `mv /opt/mmbbs-gpt /opt/moo-gpt`
3. Env-Datei verschieben: `mv /etc/mmbbs-gpt.env /etc/moo-gpt.env`
4. Systemd-Unit umbenennen: `mv /etc/systemd/system/mmbbs-gpt.service /etc/systemd/system/moo-gpt.service` — darin `WorkingDirectory` und `EnvironmentFile` auf neue Pfade anpassen
5. `systemctl daemon-reload && systemctl enable moo-gpt && systemctl start moo-gpt`
6. LXC-Hostname: `hostnamectl set-hostname moo-gpt` (im Container)
7. Proxmox: Container in der UI umbenennen (optional, kosmetisch)
8. GitHub-Repo umbenennen: Settings → Rename → `moo-gpt` (optional, bricht bestehende Clone-URLs)

## Nacharbeiten im Repo (nach Infra-Rename)

- `CLAUDE.md`: 10 Infra-Zeilen auf neue Pfade aktualisieren
- `db.js:8`: `DB_PATH`-Default → `/opt/moo-gpt/chats.db`

## Verification

`grep -rE "mmbbs" . | grep -v ".git"` → 0 Treffer
