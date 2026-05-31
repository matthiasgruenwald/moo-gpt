/**
 * Tests für simpleMarkdown() — Issue #165: Listen-Support
 *
 * Framework: Node.js 22 node:test
 *
 * simpleMarkdown() ist eine Browser-Funktion in public/dashboard.js.
 * Da sie DOM/window-Globals nutzt (window.katex), wird die Kern-Logik
 * hier als eigenständige Funktion gespiegelt und isoliert getestet.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Hilfsfunktion (spiegelt escHtml aus dashboard.js) ───────────────────────

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Gespiegelte simpleMarkdown-Logik ─────────────────────────────────────────

/**
 * @param {string} text
 * @param {{ katex?: object }} [opts]  katex-Stub (optional)
 */
function simpleMarkdown(text, { katex = null } = {}) {
  const math = [];
  let s = text;

  s = s.replace(/\$\$([\s\S]+?)\$\$/g,   (_, m) => { math.push({ m, d: true  }); return `\x00math${math.length-1}\x00`; });
  s = s.replace(/\\\[([\s\S]+?)\\\]/g,   (_, m) => { math.push({ m, d: true  }); return `\x00math${math.length-1}\x00`; });
  s = s.replace(/\\\((.+?)\\\)/g,        (_, m) => { math.push({ m, d: false }); return `\x00math${math.length-1}\x00`; });
  s = s.replace(/\$([^\n$]+?)\$/g,       (_, m) => { math.push({ m, d: false }); return `\x00math${math.length-1}\x00`; });

  let html = escHtml(s);
  html = html.replace(/```[\s\S]*?```/g, match => `<pre>${match.slice(3, -3).trim()}</pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // List transformation: runs line-by-line BEFORE \n → <br>
  {
    const lines = html.split('\n');
    const out = [];
    let inUl = false, inOl = false;
    for (const line of lines) {
      if (/^[-*] /.test(line)) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${line.slice(2)}</li>`);
      } else if (/^\d+\. /.test(line)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${line.replace(/^\d+\. /, '')}</li>`);
      } else {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        out.push(line + '\n');
      }
    }
    if (inUl) out.push('</ul>');
    if (inOl) out.push('</ol>');
    html = out.join('');
  }

  html = html.replace(/\n/g, '<br>');

  if (math.length) {
    html = html.replace(/\x00math(\d+)\x00/g, (_, i) => {
      const { m, d } = math[+i];
      try {
        return katex
          ? katex.renderToString(m, { displayMode: d, throwOnError: false })
          : escHtml(d ? `$$${m}$$` : `$${m}$`);
      } catch { return escHtml(d ? `$$${m}$$` : `$${m}$`); }
    });
  }

  return html;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('simpleMarkdown – ungeordnete Listen', () => {
  test('- item1\\n- item2 → <ul><li>item1</li><li>item2</li></ul>', () => {
    const result = simpleMarkdown('- item1\n- item2');
    assert.ok(result.includes('<ul>'), 'muss <ul> enthalten');
    assert.ok(result.includes('<li>item1</li>'), 'muss <li>item1</li> enthalten');
    assert.ok(result.includes('<li>item2</li>'), 'muss <li>item2</li> enthalten');
    assert.ok(result.includes('</ul>'), 'muss </ul> enthalten');
  });

  test('* item → <ul> mit li', () => {
    const result = simpleMarkdown('* alpha\n* beta');
    assert.ok(result.includes('<ul>'));
    assert.ok(result.includes('<li>alpha</li>'));
    assert.ok(result.includes('<li>beta</li>'));
    assert.ok(result.includes('</ul>'));
  });

  test('aufeinanderfolgende Punkte → ein gemeinsamer <ul>-Block', () => {
    const result = simpleMarkdown('- a\n- b\n- c');
    const ulCount = (result.match(/<ul>/g) || []).length;
    assert.equal(ulCount, 1, 'darf nur einen <ul>-Block erzeugen');
  });
});

describe('simpleMarkdown – geordnete Listen', () => {
  test('1. item1\\n2. item2 → <ol><li>item1</li><li>item2</li></ol>', () => {
    const result = simpleMarkdown('1. item1\n2. item2');
    assert.ok(result.includes('<ol>'));
    assert.ok(result.includes('<li>item1</li>'));
    assert.ok(result.includes('<li>item2</li>'));
    assert.ok(result.includes('</ol>'));
  });

  test('aufeinanderfolgende OL-Punkte → ein gemeinsamer <ol>-Block', () => {
    const result = simpleMarkdown('1. eins\n2. zwei\n3. drei');
    const olCount = (result.match(/<ol>/g) || []).length;
    assert.equal(olCount, 1, 'darf nur einen <ol>-Block erzeugen');
  });
});

describe('simpleMarkdown – gemischte Listen', () => {
  test('UL gefolgt von OL → zwei getrennte Blöcke', () => {
    const result = simpleMarkdown('- apfel\n- birne\n1. eins\n2. zwei');
    assert.ok(result.includes('<ul>'), 'muss <ul> enthalten');
    assert.ok(result.includes('</ul>'), 'muss </ul> enthalten');
    assert.ok(result.includes('<ol>'), 'muss <ol> enthalten');
    assert.ok(result.includes('</ol>'), 'muss </ol> enthalten');
    // UL muss vor OL kommen
    assert.ok(result.indexOf('<ul>') < result.indexOf('<ol>'), '<ul> muss vor <ol> stehen');
    // UL muss vor dem OL geschlossen sein
    assert.ok(result.indexOf('</ul>') < result.indexOf('<ol>'), '</ul> muss vor <ol> stehen');
  });
});

describe('simpleMarkdown – LaTeX in Listenzeilen', () => {
  test('- $x^2$ → LaTeX-Fallback (kein katex) bleibt erhalten', () => {
    const result = simpleMarkdown('- $x^2$');
    assert.ok(result.includes('<ul>'), 'muss <ul> enthalten');
    // Ohne katex: escHtml($x^2$) als Fallback
    assert.ok(result.includes('$x^2$'), 'LaTeX-Fallback muss im li-Inhalt vorhanden sein');
  });

  test('- $x^2$ → katex.renderToString wird aufgerufen', () => {
    const calls = [];
    const katexStub = {
      renderToString(m, opts) {
        calls.push({ m, opts });
        return `<katex-stub>${m}</katex-stub>`;
      },
    };
    const result = simpleMarkdown('- $x^2$', { katex: katexStub });
    assert.ok(result.includes('<ul>'), 'muss <ul> enthalten');
    assert.equal(calls.length, 1, 'katex.renderToString muss einmal aufgerufen werden');
    assert.equal(calls[0].m, 'x^2', 'renderToString muss den LaTeX-Inhalt bekommen');
    assert.ok(result.includes('<katex-stub>x^2</katex-stub>'), 'katex-Output muss im li-Inhalt stehen');
  });

  test('LaTeX-Placeholder wird nicht durch Listen-Regex zerstört', () => {
    // Direkte Prüfung: Placeholder "\x00math0\x00" in einer Listenzeile
    // wird korrekt als li-Inhalt weitergegeben
    const result = simpleMarkdown('- $x^2 + 1$');
    assert.ok(result.includes('<ul>'), 'muss <ul> enthalten');
    assert.ok(result.includes('<li>'), 'muss <li> enthalten');
    // Der LaTeX-Ausdruck muss irgendwie im Ergebnis sein (als Fallback oder gerendert)
    assert.ok(result.includes('x^2 + 1'), 'LaTeX-Inhalt muss im Ergebnis erhalten bleiben');
  });
});

describe('simpleMarkdown – normaler Text', () => {
  test('normaler Text wird nicht zur Liste', () => {
    const result = simpleMarkdown('Hallo Welt');
    assert.ok(!result.includes('<ul>'), 'kein <ul> für normalen Text');
    assert.ok(!result.includes('<ol>'), 'kein <ol> für normalen Text');
    assert.ok(!result.includes('<li>'), 'kein <li> für normalen Text');
  });

  test('Text mit Bindestrich mitten im Satz wird nicht zur Liste', () => {
    const result = simpleMarkdown('Das ist ein Bindestrich-Wort');
    assert.ok(!result.includes('<ul>'));
    assert.ok(!result.includes('<li>'));
  });

  test('mehrzeiliger normaler Text bekommt <br>', () => {
    const result = simpleMarkdown('Zeile1\nZeile2');
    assert.ok(result.includes('<br>'), 'Zeilenumbruch muss zu <br> werden');
  });

  test('HTML-Sonderzeichen im Listeninhalt werden escaped', () => {
    const result = simpleMarkdown('- <script>alert(1)</script>');
    assert.ok(!result.includes('<script>'), 'Script-Tags dürfen nicht ungefiltert stehen');
    assert.ok(result.includes('&lt;script&gt;'), 'Tags müssen escaped sein');
  });
});
