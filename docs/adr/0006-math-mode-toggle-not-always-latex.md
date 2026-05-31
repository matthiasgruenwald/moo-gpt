# ADR 0006: mathMode als Toggle, nicht global erzwungen

**Status:** Akzeptiert  
**Datum:** 2026-05-31

## Kontext

KI-Antworten mit mathematischen Ausdrücken (z.B. `-0,0213x²`) werden im Schülerchat falsch gerendert: `marked.parse()` interpretiert führende `-` als Markdown-Listenpunkte, das Minuszeichen verschwindet. KaTeX ist eingebunden, greift aber nur bei expliziter LaTeX-Notation (`$...$`, `$$...$$`).

## Entscheidung

`mathMode` wird als opt-in Widget-Konfigurationsfeld eingeführt (`'on'` / `'off'`, Default `'off'`). Wenn aktiv, injiziert `buildInstructions()` eine kurze LaTeX-Anweisung in den Systemprompt. Das Feld folgt der vollständigen Template-Kaskade: Systemvorlage → Lehrer-Vorlage → Aktivität.

## Alternativen verworfen

- **Hardcoded LaTeX-Anweisung in `buildInstructions()`:** Immer aktiv, auch für Sprachunterricht, Geschichte, etc. — unnötiger Ballast und erhöht die Tokenzahl für alle Aktivitäten.
- **Anweisung in Admin-Systemprompt:** Konfigurierbar, aber global für alle Lehrkräfte und Fächer ohne Granularität.
- **Nur Rendering-Fix (ohne Prompt-Fix):** Heuristiken zur Unterscheidung von Minus-Zeichen und Listenpunkten sind fragil und lösen das Problem unvollständig.

## Konsequenzen

- Lehrkräfte in Mathe-Aktivitäten aktivieren `mathMode` einmalig (oder per Lehrer-Vorlage).
- Die KI schreibt dann `$-0{,}0213x^2$` statt `-0,0213x^2` → kein Bulletpoint-Konflikt.
- Fachfremde Aktivitäten erhalten keine LaTeX-Anweisung.
- Zukünftige Fachpräferenzen (z.B. Silbenbögen für Sprachunterricht) folgen demselben Muster unter `Fachpräferenzen` in der Config-UI.
