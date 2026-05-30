# Erlaubnis-Log (Permission Prompts)

Sammlung aller Bash/Tool-Aufrufe, die Claude während graphify-Läufen gestellt hat.
Ziel: Diese Liste nutzen um Einträge in `.claude/settings.json` (allowedTools) hinzuzufügen.

---

## Session: 2026-05-30 — /graphify --update

### Bash-Befehle (vermutlich erlaubnispflichtig)

```
# Interpreter-Auflösung
if [ ! -f graphify-out/.graphify_python ]; then ... fi

# Datei-Checks
ls -la graphify-out/.graphify_chunk_*.json

# Python-Extraktion (lange Einzeiler)
$(cat graphify-out/.graphify_python) -c "import json; from graphify..."

# Graphify-CLI
graphify export html
graphify export wiki

# Datei-Operationen
cp graphify-out/graph.json graphify-out/.graphify_old.json
rm -f graphify-out/.graphify_detect.json graphify-out/.graphify_chunk_*.json ...
cat /private/tmp/claude-501/.../.output

# Ausgabe-Check
grep -n "## God Nodes\|..." graphify-out/GRAPH_REPORT.md
```

### Subagent Write-Calls
- 14x `Write` auf `graphify-out/.graphify_chunk_NN.json` (via Agent-Subagents)

---

## Empfehlung für settings.json

Um Prompts zu reduzieren, folgende Muster als `allowedTools` in `.claude/settings.json` eintragen:

```json
{
  "allowedTools": [
    "Bash(ls *)",
    "Bash(cp graphify-out/*)",
    "Bash(rm -f graphify-out/*)",
    "Bash(graphify export *)",
    "Bash(grep -n * graphify-out/*)",
    "Bash(cat /private/tmp/claude-501/*)"
  ]
}
```

Oder `/fewer-permission-prompts` laufen lassen für automatische Analyse der Transcripts.

---

_Wird jedes Mal ergänzt wenn neue Erlaubnis-Prompts auftreten._
