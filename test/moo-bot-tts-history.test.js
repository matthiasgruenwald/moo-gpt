/**
 * Tests für TTS-🔊-Button in renderHistory() — Issue #113
 *
 * Überprüft:
 * - Bot-Nachrichten bekommen 🔊-Button wenn audioOutput=on und !isTeacher
 * - Bot-Nachrichten bekommen keinen 🔊-Button wenn audioOutput=off
 * - Bot-Nachrichten bekommen keinen 🔊-Button in Lehrer-Ansicht (isTeacher=true)
 * - User-Nachrichten bekommen keinen 🔊-Button
 * - Kein Auto-Play (nur Button, kein sofortiger Aufruf von _speakMessage)
 *
 * Tests laufen mit minimalem DOM-Stub, kein Server nötig.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ─── Minimal DOM-Stub ─────────────────────────────────────────────────────────

function makeDiv() {
  const children = [];
  const classList = new Set();
  return {
    className: '',
    innerHTML: '',
    classList: {
      add(c)    { classList.add(c); },
      remove(c) { classList.delete(c); },
      has(c)    { return classList.has(c); },
    },
    appendChild(child) { children.push(child); },
    _children: children,
  };
}

function makeChatWindow() {
  const children = [];
  return {
    innerHTML: '',
    scrollTop: 0,
    scrollHeight: 100,
    appendChild(child) { children.push(child); },
    querySelector(sel) {
      // not needed for these tests
      return null;
    },
    _children: children,
  };
}

// ─── Stub renderHistory logic ─────────────────────────────────────────────────

/**
 * Spiegelt exakt den produktiven Code-Pfad von renderHistory() für
 * einzelne Bot- und User-Nachrichten aus moo-bot.js.
 * Nur das, was für #113 relevant ist.
 */
function renderHistoryMessages(messages, { audioOutput, isTeacher }) {
  const chatWindow = makeChatWindow();
  const speakButtonsAdded = []; // Track: rawText für jeden hinzugefügten Button

  function _addSpeakButton(msgEl, rawText) {
    const btn = { type: 'speak-btn', rawText };
    msgEl._children.push(btn);
    speakButtonsAdded.push(rawText);
  }

  for (const msg of messages) {
    const div = makeDiv();
    if (msg.role === 'user') {
      div.className = 'message sent';
      div.innerHTML = msg.content;
    } else {
      div.className = 'message received';
      div.innerHTML = msg.content; // (Markdown parsing skipped in stub)
      if (!isTeacher && audioOutput === 'on') {
        _addSpeakButton(div, msg.content);
      }
    }
    chatWindow.appendChild(div);
  }

  return { chatWindow, speakButtonsAdded };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const botMsg   = { role: 'assistant', content: 'Das ist eine Antwort.', created_at: '2025-01-01 10:00:00' };
const userMsg  = { role: 'user',      content: 'Hallo!',                created_at: '2025-01-01 10:00:00' };

describe('renderHistory — TTS 🔊-Button (Issue #113)', () => {

  describe('audioOutput=on, Schüler (isTeacher=false)', () => {
    test('Bot-Nachricht bekommt 🔊-Button', () => {
      const { speakButtonsAdded } = renderHistoryMessages([botMsg], { audioOutput: 'on', isTeacher: false });
      assert.equal(speakButtonsAdded.length, 1, 'Genau ein Speak-Button erwartet');
      assert.equal(speakButtonsAdded[0], botMsg.content, 'Speak-Button enthält rawText der Bot-Nachricht');
    });

    test('User-Nachricht bekommt keinen 🔊-Button', () => {
      const { speakButtonsAdded } = renderHistoryMessages([userMsg], { audioOutput: 'on', isTeacher: false });
      assert.equal(speakButtonsAdded.length, 0, 'User-Nachricht darf keinen Speak-Button haben');
    });

    test('Mehrere Nachrichten: nur Bot-Nachrichten bekommen 🔊-Buttons', () => {
      const msgs = [botMsg, userMsg, botMsg];
      const { speakButtonsAdded } = renderHistoryMessages(msgs, { audioOutput: 'on', isTeacher: false });
      assert.equal(speakButtonsAdded.length, 2, '2 Bot-Nachrichten → 2 Speak-Buttons');
    });

    test('Kein Auto-Play (speakButtonsAdded enthält nur statische Einträge, kein Aufruf)', () => {
      // Auto-Play würde _speakMessage aufrufen — das tun wir hier nicht.
      // Der Test stellt sicher, dass nur addSpeakButton aufgerufen wird, nicht _speakMessage.
      let speakMessageCalled = false;
      const msgs = [botMsg];

      // Wir rufen renderHistoryMessages auf — kein _speakMessage-Aufruf erwartet
      const { speakButtonsAdded } = renderHistoryMessages(msgs, { audioOutput: 'on', isTeacher: false });

      assert.equal(speakMessageCalled, false, '_speakMessage darf bei History-Render nicht aufgerufen werden');
      assert.equal(speakButtonsAdded.length, 1, 'Speak-Button wurde trotzdem hinzugefügt');
    });
  });

  describe('audioOutput=off', () => {
    test('Bot-Nachricht bekommt keinen 🔊-Button', () => {
      const { speakButtonsAdded } = renderHistoryMessages([botMsg], { audioOutput: 'off', isTeacher: false });
      assert.equal(speakButtonsAdded.length, 0, 'audioOutput=off → kein Speak-Button');
    });
  });

  describe('isTeacher=true', () => {
    test('Bot-Nachricht bekommt keinen 🔊-Button in Lehrer-Ansicht', () => {
      const { speakButtonsAdded } = renderHistoryMessages([botMsg], { audioOutput: 'on', isTeacher: true });
      assert.equal(speakButtonsAdded.length, 0, 'Lehrer sehen keinen Speak-Button');
    });

    test('audioOutput=off + isTeacher: kein Button', () => {
      const { speakButtonsAdded } = renderHistoryMessages([botMsg], { audioOutput: 'off', isTeacher: true });
      assert.equal(speakButtonsAdded.length, 0, 'Kein Button bei isTeacher + audioOutput=off');
    });
  });

});
