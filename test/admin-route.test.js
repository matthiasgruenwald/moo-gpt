/**
 * Tests für routes/admin.js — Issue #150
 *
 * Testet den Factory-Pattern-Router mit Mock-Registry und In-Memory-DB.
 * Kein OPENAI_API_KEY nötig.
 *
 * Run: DB_PATH=:memory: MODEL_NAME=gpt-test node --test test/admin-route.test.js
 */

// MODEL_NAME muss vor dem Import von env-config.js gesetzt sein
process.env.MODEL_NAME = process.env.MODEL_NAME || 'gpt-test';
process.env.AVAILABLE_MODELS = process.env.AVAILABLE_MODELS || 'gpt-test,gpt-4o';

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'http';
import { initDb } from '../db.js';
import { addAdmin } from '../stores/admin.js';
import { updateCachedConfig } from '../stores/prompt.js';
import { generateDashboardToken } from '../auth-middleware.js';
import { createAdminRouter } from '../routes/admin.js';

// ── Mock dashboardRegistry ─────────────────────────────────────────────────────

const mockRegistry = {
  broadcastAll: (_msg) => {},
};

// ── Test-Server-Setup ─────────────────────────────────────────────────────────

let server;
let baseUrl;
let adminToken;
let teacherToken;

before(() => {
  initDb();

  // Admin anlegen — muss VOR requireAdminAuth-Requests stehen
  addAdmin('admin-1', 'system');

  // Token für Admin (admin-1 ist in admin_users-Tabelle)
  adminToken = generateDashboardToken('any-activity', 'admin-1', 'Admin');

  // Token für Lehrer (nicht in admin_users-Tabelle)
  teacherToken = generateDashboardToken('any-activity', 'teacher-1', 'Lehrer');

  // Cache initialisieren — GET /admin/config liest getCachedConfig()
  updateCachedConfig('Test-Systemprompt', 'gpt-test');

  const app = express();
  app.use(express.json());
  app.use('/', createAdminRouter({ dashboardRegistry: mockRegistry }));

  server = createServer(app);
  return new Promise(resolve => server.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}`;
    resolve();
  }));
});

after(() => new Promise(resolve => server.close(resolve)));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('admin-route', () => {

  describe('Auth-Schutz', () => {
    test('403 ohne Token bei requireTeacherAuth', async () => {
      const res = await fetch(`${baseUrl}/admin/config`);
      assert.equal(res.status, 403);
    });

    test('403 mit ungültigem Token bei requireTeacherAuth', async () => {
      const res = await fetch(`${baseUrl}/admin/config?token=ungueltig`);
      assert.equal(res.status, 403);
    });

    test('403 ohne Token bei requireAdminAuth', async () => {
      const res = await fetch(`${baseUrl}/admin/prompt-history`);
      assert.equal(res.status, 403);
    });

    test('403 für Nicht-Admin bei requireAdminAuth', async () => {
      const res = await fetch(`${baseUrl}/admin/prompt-history?token=${teacherToken}`);
      assert.equal(res.status, 403);
    });
  });

  describe('GET /admin/config', () => {
    test('gibt Konfiguration zurück (requireTeacherAuth)', async () => {
      const res = await fetch(`${baseUrl}/admin/config?token=${teacherToken}`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.systemPrompt, 'Test-Systemprompt');
      assert.equal(data.model, 'gpt-test');
      assert.ok(Array.isArray(data.availableModels), 'availableModels muss Array sein');
      assert.ok(Array.isArray(data.genModels), 'genModels muss Array sein');
      assert.equal(typeof data.isAdmin, 'boolean');
    });

    test('isAdmin: false für Nicht-Admin', async () => {
      const res = await fetch(`${baseUrl}/admin/config?token=${teacherToken}`);
      const data = await res.json();
      assert.equal(data.isAdmin, false);
    });

    test('isAdmin: true für Admin', async () => {
      const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`);
      const data = await res.json();
      assert.equal(data.isAdmin, true);
    });
  });

  describe('PUT /admin/config', () => {
    test('speichert neuen Systemprompt (Happy Path)', async () => {
      const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: 'Neuer Prompt', model: 'gpt-test' }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
    });

    test('400 wenn systemPrompt fehlt', async () => {
      const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-test' }),
      });
      assert.equal(res.status, 400);
    });

    test('400 wenn Modell ungültig ist', async () => {
      const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: 'Prompt', model: 'unbekanntes-modell' }),
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.ok(data.error, 'Fehlermeldung erwartet');
    });

    test('400 wenn model fehlt', async () => {
      const res = await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: 'Prompt' }),
      });
      assert.equal(res.status, 400);
    });
  });

  describe('GET /admin/prompt-history', () => {
    test('gibt Versionshistorie zurück', async () => {
      const res = await fetch(`${baseUrl}/admin/prompt-history?token=${adminToken}`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(data.history), 'history muss Array sein');
    });
  });

  describe('DELETE /admin/prompt-history/:id', () => {
    test('400 bei ungültiger ID (0)', async () => {
      const res = await fetch(`${baseUrl}/admin/prompt-history/0?token=${adminToken}`, {
        method: 'DELETE',
      });
      assert.equal(res.status, 400);
    });

    test('400 wenn ID nicht existiert / aktuelle Version', async () => {
      // Zuerst prüfen ob überhaupt ein Eintrag existiert
      const histRes = await fetch(`${baseUrl}/admin/prompt-history?token=${adminToken}`);
      const { history } = await histRes.json();
      if (history.length > 0) {
        // Letzten Eintrag löschen schlägt fehl (aktuelle Version)
        const latestId = history[0].id;
        const res = await fetch(`${baseUrl}/admin/prompt-history/${latestId}?token=${adminToken}`, {
          method: 'DELETE',
        });
        assert.equal(res.status, 400);
      } else {
        // Keine History → ID 999 nicht vorhanden → 400
        const res = await fetch(`${baseUrl}/admin/prompt-history/999?token=${adminToken}`, {
          method: 'DELETE',
        });
        assert.equal(res.status, 400);
      }
    });

    test('löscht älteren Eintrag erfolgreich (Happy Path)', async () => {
      // Zweiten Prompt speichern, damit es zwei Einträge gibt
      await fetch(`${baseUrl}/admin/config?token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: 'Prompt V2 für Delete-Test', model: 'gpt-test' }),
      });

      const histRes = await fetch(`${baseUrl}/admin/prompt-history?token=${adminToken}`);
      const { history } = await histRes.json();

      if (history.length >= 2) {
        // Ältesten Eintrag (letzter im Array, absteigend sortiert) löschen
        const oldId = history[history.length - 1].id;
        const res = await fetch(`${baseUrl}/admin/prompt-history/${oldId}?token=${adminToken}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        assert.equal(res.status, 200);
        assert.equal(data.ok, true);
        assert.ok(Array.isArray(data.history), 'history muss Array sein');
      }
    });
  });

  describe('GET /admin/admins', () => {
    test('gibt Admin-Liste zurück', async () => {
      const res = await fetch(`${baseUrl}/admin/admins?token=${adminToken}`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(data.admins), 'admins muss Array sein');
      assert.ok(data.admins.some(a => a.moodle_user_id === 'admin-1'), 'admin-1 muss in der Liste sein');
    });
  });

  describe('POST /admin/admins', () => {
    test('fügt neuen Admin hinzu (Happy Path)', async () => {
      const res = await fetch(`${baseUrl}/admin/admins?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUserId: 'new-admin-42' }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
      assert.ok(Array.isArray(data.admins));
      assert.ok(data.admins.some(a => a.moodle_user_id === 'new-admin-42'));
    });

    test('400 wenn newUserId fehlt', async () => {
      const res = await fetch(`${baseUrl}/admin/admins?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });

    test('400 wenn newUserId kein String ist', async () => {
      const res = await fetch(`${baseUrl}/admin/admins?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUserId: 123 }),
      });
      assert.equal(res.status, 400);
    });
  });

  describe('DELETE /admin/admins/:targetId', () => {
    test('400 beim Löschen eigener Admin-Rechte', async () => {
      const res = await fetch(`${baseUrl}/admin/admins/admin-1?token=${adminToken}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      assert.equal(res.status, 400);
      assert.ok(data.error, 'Fehlermeldung erwartet');
    });

    test('löscht anderen Admin erfolgreich (Happy Path)', async () => {
      // Zuerst einen Admin anlegen der dann gelöscht wird
      await fetch(`${baseUrl}/admin/admins?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUserId: 'admin-to-delete' }),
      });

      const res = await fetch(`${baseUrl}/admin/admins/admin-to-delete?token=${adminToken}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
      assert.ok(Array.isArray(data.admins));
      assert.ok(!data.admins.some(a => a.moodle_user_id === 'admin-to-delete'));
    });
  });

  describe('GET /admin/system-template', () => {
    test('gibt System-Template zurück (requireTeacherAuth)', async () => {
      const res = await fetch(`${baseUrl}/admin/system-template?token=${teacherToken}`);
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(typeof data.title, 'string');
      assert.equal(typeof data.botIcon, 'string');
      assert.equal(typeof data.opener, 'string');
      assert.equal(typeof data.uploadMode, 'string');
    });

    test('auch Lehrer können System-Template lesen', async () => {
      const res = await fetch(`${baseUrl}/admin/system-template?token=${teacherToken}`);
      assert.equal(res.status, 200);
    });
  });

  describe('PUT /admin/system-template', () => {
    test('speichert System-Template (Happy Path)', async () => {
      const res = await fetch(`${baseUrl}/admin/system-template?token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test-Vorlage',
          botIcon: 'grw',
          opener: 'Hallo!',
          uploadMode: 'off',
          hintsTemplate: '',
          audioInput: 'off',
          audioOutput: 'off',
          ttsVoice: 'nova',
          audioStudentOptions: 'off',
          model: null,
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
    });

    test('400 bei ungültigem uploadMode', async () => {
      const res = await fetch(`${baseUrl}/admin/system-template?token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadMode: 'invalid-mode', botIcon: 'grw', audioInput: 'off' }),
      });
      assert.equal(res.status, 400);
    });

    test('403 für Nicht-Admin bei PUT system-template', async () => {
      const res = await fetch(`${baseUrl}/admin/system-template?token=${teacherToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadMode: 'off', botIcon: 'grw', audioInput: 'off' }),
      });
      assert.equal(res.status, 403);
    });
  });

  describe('GET /admin/logs', () => {
    test('antwortet (200 oder 500 je nach journalctl-Verfügbarkeit)', async () => {
      const res = await fetch(`${baseUrl}/admin/logs?token=${adminToken}`);
      // journalctl ist in Testumgebung möglicherweise nicht vorhanden → 500 erwartet
      // Auf LXC mit journalctl → 200
      assert.ok(res.status === 200 || res.status === 500, `Unerwarteter Status: ${res.status}`);
    });
  });

  describe('POST /admin/restart', () => {
    test('gibt 200 und ok:true zurück', async () => {
      const res = await fetch(`${baseUrl}/admin/restart?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.ok, true);
    });
  });

});
