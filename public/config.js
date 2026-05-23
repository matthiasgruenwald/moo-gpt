(function () {
  const params     = new URLSearchParams(window.location.search);
  const activityId = params.get('activityId');
  const token      = params.get('token');

  const elLoading = document.getElementById('cfg-loading');
  const elError   = document.getElementById('cfg-error');
  const elForm    = document.getElementById('cfg-form');

  let initial          = {};
  let templates        = [];
  let loadedTemplateId = null;
  let taskContext      = { task: null, images: [] };

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'moogpt:taskContext') {
      taskContext = { task: e.data.task, images: e.data.images || [] };
    }
    if (e.data?.type === 'moogpt:suggestReply') {
      suggestSend(e.data.text);
    }
    if (e.data?.type === 'moogpt:suggestAccept') {
      document.getElementById('cfg-hints').value = e.data.prompt;
      updateDirtyState();
    }
  });

  function showError(msg) {
    elLoading.style.display = 'none';
    elError.style.display   = '';
    elError.textContent     = msg;
  }

  function showStatus(msg, cls) {
    const status       = document.getElementById('cfg-status');
    status.className   = 'cfg-status ' + cls;
    status.textContent = msg;
    if (cls === 'ok') setTimeout(() => { status.textContent = ''; status.className = 'cfg-status'; }, 3000);
  }

  function getFields() {
    return {
      title:         document.getElementById('cfg-title').value,
      botIcon:       document.getElementById('cfg-bot-icon').value,
      opener:        document.getElementById('cfg-opener').value,
      uploadMode:    document.getElementById('cfg-upload-mode').value,
      hintsTemplate: document.getElementById('cfg-hints').value,
    };
  }

  function getLoadedTemplate() {
    return loadedTemplateId === null ? null : (templates.find(t => t.id === loadedTemplateId) ?? null);
  }

  function tplOptionLabel(tpl) {
    return (tpl.is_default ? '★ ' : '') + tpl.name;
  }

  function updateTemplateUI() {
    const sel = document.getElementById('cfg-template-select');
    sel.innerHTML = '<option value="">— Vorlage laden —</option>';
    for (const tpl of templates) {
      const opt        = document.createElement('option');
      opt.value        = tpl.id;
      opt.textContent  = tplOptionLabel(tpl);
      if (tpl.id === loadedTemplateId) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.style.fontStyle = '';
    const hasLoaded = loadedTemplateId !== null;
    document.getElementById('cfg-tpl-default-btn').style.display = hasLoaded ? '' : 'none';
    document.getElementById('cfg-tpl-delete-btn').style.display  = hasLoaded ? '' : 'none';
  }

  function computeDirty() {
    const tpl = getLoadedTemplate();
    if (!tpl) return false;
    const f = getFields();
    return (
      f.title         !== (tpl.title          ?? '') ||
      f.botIcon       !== (tpl.bot_icon       ?? 'grw') ||
      f.opener        !== (tpl.opener         ?? '') ||
      f.uploadMode    !== (tpl.upload_mode    ?? 'off') ||
      f.hintsTemplate !== (tpl.hints_template ?? '')
    );
  }

  function updateDirtyState() {
    const tpl = getLoadedTemplate();
    if (!tpl) return;
    const sel         = document.getElementById('cfg-template-select');
    const selectedOpt = sel.options[sel.selectedIndex];
    if (!selectedOpt || !selectedOpt.value) return;
    if (computeDirty()) {
      selectedOpt.textContent = '* ' + tpl.name;
      sel.style.fontStyle     = 'italic';
    } else {
      selectedOpt.textContent = tplOptionLabel(tpl);
      sel.style.fontStyle     = '';
    }
  }

  async function loadTemplates() {
    try {
      const res = await fetch(`/api/teacher/templates?token=${encodeURIComponent(token)}`);
      if (!res.ok) return;
      const data = await res.json();
      templates = data.templates || [];
      updateTemplateUI();
    } catch (_) {}
  }

  document.getElementById('cfg-template-select').addEventListener('change', function () {
    const id = this.value ? parseInt(this.value, 10) : null;
    loadedTemplateId = id;
    if (!id) { updateTemplateUI(); return; }
    const tpl = getLoadedTemplate();
    if (!tpl) return;
    document.getElementById('cfg-title').value       = tpl.title          ?? '';
    document.getElementById('cfg-bot-icon').value    = tpl.bot_icon       ?? 'grw';
    document.getElementById('cfg-opener').value      = tpl.opener         ?? '';
    document.getElementById('cfg-upload-mode').value = tpl.upload_mode    ?? 'off';
    document.getElementById('cfg-hints').value       = tpl.hints_template ?? '';
    this.style.fontStyle = '';
    updateTemplateUI();
  });

  ['cfg-title', 'cfg-bot-icon', 'cfg-opener', 'cfg-upload-mode', 'cfg-hints'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input',  updateDirtyState);
    el.addEventListener('change', updateDirtyState);
  });

  document.getElementById('cfg-tpl-default-btn').addEventListener('click', async () => {
    if (!loadedTemplateId) return;
    const res = await fetch(
      `/api/teacher/templates/${loadedTemplateId}/set-default?token=${encodeURIComponent(token)}`,
      { method: 'PUT' }
    );
    if (res.ok) {
      templates = templates.map(t => ({ ...t, is_default: t.id === loadedTemplateId ? 1 : 0 }));
      updateTemplateUI();
      updateDirtyState();
      showStatus('✓ Als Standard gesetzt', 'ok');
    } else {
      showStatus('Fehler beim Setzen des Standards', 'err');
    }
  });

  document.getElementById('cfg-tpl-delete-btn').addEventListener('click', async () => {
    const tpl = getLoadedTemplate();
    if (!tpl) return;
    if (!confirm(`Vorlage "${tpl.name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    const res = await fetch(
      `/api/teacher/templates/${loadedTemplateId}?token=${encodeURIComponent(token)}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      templates        = templates.filter(t => t.id !== loadedTemplateId);
      loadedTemplateId = null;
      updateTemplateUI();
    } else {
      showStatus('Fehler beim Löschen', 'err');
    }
  });

  function showOverwriteDialog(name) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `
        <div style="background:#fff;border-radius:8px;padding:24px;max-width:320px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.2);">
          <p style="margin-bottom:16px;font-size:14px;line-height:1.4;">Vorlage <strong>${name}</strong> überschreiben?</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button id="dlg-overwrite" style="background:#003366;color:#fff;border:none;border-radius:6px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;">Überschreiben</button>
            <button id="dlg-new"       style="background:#555;color:#fff;border:none;border-radius:6px;padding:9px 14px;font-size:13px;cursor:pointer;">Als neue Vorlage speichern</button>
            <button id="dlg-cancel"    style="background:none;border:1px solid #ccc;border-radius:6px;padding:9px 14px;font-size:13px;cursor:pointer;">Abbrechen</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#dlg-overwrite').onclick = () => { document.body.removeChild(overlay); resolve('overwrite'); };
      overlay.querySelector('#dlg-new').onclick       = () => { document.body.removeChild(overlay); resolve('new'); };
      overlay.querySelector('#dlg-cancel').onclick    = () => { document.body.removeChild(overlay); resolve(null); };
    });
  }

  async function saveNewTemplate(f) {
    const name = prompt('Name der neuen Vorlage:');
    if (!name || !name.trim()) return;
    const res = await fetch(
      `/api/teacher/templates?token=${encodeURIComponent(token)}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), ...f }),
      }
    );
    if (!res.ok) { showStatus('Fehler beim Speichern', 'err'); return; }
    const data = await res.json();
    templates.push({
      id: data.id, moodle_user_id: null, name: name.trim(),
      title: f.title || null, bot_icon: f.botIcon, opener: f.opener || null,
      upload_mode: f.uploadMode, hints_template: f.hintsTemplate || null,
      is_default: 0, created_at: new Date().toISOString(),
    });
    loadedTemplateId = data.id;
    updateTemplateUI();
    showStatus('✓ Vorlage gespeichert', 'ok');
  }

  async function overwriteTemplate(id, name, f) {
    const res = await fetch(
      `/api/teacher/templates/${id}?token=${encodeURIComponent(token)}`,
      {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, ...f }),
      }
    );
    if (!res.ok) { showStatus('Fehler beim Speichern', 'err'); return; }
    templates = templates.map(t => t.id === id
      ? { ...t, title: f.title, bot_icon: f.botIcon, opener: f.opener, upload_mode: f.uploadMode, hints_template: f.hintsTemplate }
      : t);
    updateTemplateUI();
    updateDirtyState();
    showStatus('✓ Vorlage gespeichert', 'ok');
  }

  document.getElementById('cfg-tpl-save-btn').addEventListener('click', async () => {
    const f   = getFields();
    const tpl = getLoadedTemplate();
    if (tpl && computeDirty()) {
      const choice = await showOverwriteDialog(tpl.name);
      if (!choice) return;
      if (choice === 'overwrite') {
        await overwriteTemplate(tpl.id, tpl.name, f);
      } else {
        await saveNewTemplate(f);
      }
    } else {
      await saveNewTemplate(f);
    }
  });

  async function runPromptCheck() {
    const btn          = document.getElementById('cfg-check-btn');
    const currentHints = document.getElementById('cfg-hints').value;

    btn.disabled    = true;
    btn.textContent = '⏳ Prüft…';

    try {
      const res = await fetch(
        `/api/activity/${encodeURIComponent(activityId)}/prompt-check?token=${encodeURIComponent(token)}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            task:       taskContext.task,
            currentHints,
            taskImages: taskContext.images,
          }),
        }
      );

      if (!res.ok) throw new Error(`Server-Fehler ${res.status}`);
      const data = await res.json();

      document.getElementById('cfg-compare-suggestion').value = data.suggestion || '';
      document.getElementById('cfg-compare-original').value   = currentHints;
      document.getElementById('cfg-compare-panel').style.display = '';

      window.parent.postMessage({ type: 'moogpt:expandOverlay' }, '*');
    } catch (err) {
      showStatus(`Fehler: ${err.message}`, 'err');
    } finally {
      btn.disabled    = false;
      btn.textContent = '🔍 Prompt prüfen & verbessern';
    }
  }

  async function useAndSave(promptText) {
    document.getElementById('cfg-hints').value = promptText;
    await saveConfig();
  }

  async function loadConfig() {
    if (!activityId || !token) return showError('Fehlende Parameter (activityId oder token).');
    try {
      const res = await fetch(
        `/api/activity-config/${encodeURIComponent(activityId)}?token=${encodeURIComponent(token)}`
      );
      if (res.status === 403) return showError('Nicht autorisiert.');
      if (!res.ok)            return showError('Fehler beim Laden der Einstellungen.');
      const data = await res.json();

      document.getElementById('cfg-activity-name').textContent =
        data.activityName || `Aktivität ${activityId}`;
      document.getElementById('cfg-title').value        = data.title       || '';
      document.getElementById('cfg-bot-icon').value     = data.botIcon     || 'grw';
      document.getElementById('cfg-opener').value       = data.opener      || '';
      document.getElementById('cfg-upload-mode').value  = data.uploadMode  || 'off';
      document.getElementById('cfg-hints').value        = data.erfahrungsprompt || '';

      const modelSel = document.getElementById('cfg-model');
      for (const m of (data.availableModels || [])) {
        const opt       = document.createElement('option');
        opt.value       = m;
        opt.textContent = m;
        modelSel.appendChild(opt);
      }
      modelSel.value = data.myModel || '';

      const preferSuggestQuestions = data.preferSuggestQuestions ?? 1;
      document.getElementById('cfg-suggest-questions').checked = preferSuggestQuestions !== 0;

      initial = {
        title:      data.title            || '',
        botIcon:    data.botIcon          || 'grw',
        opener:     data.opener           || '',
        uploadMode: data.uploadMode       || 'off',
        hints:      data.erfahrungsprompt || '',
        model:      data.myModel          || '',
      };

      elLoading.style.display = 'none';
      elForm.style.display    = '';

      await loadTemplates();
    } catch (e) {
      showError('Netzwerkfehler: ' + e.message);
    }
  }

  async function saveConfig() {
    const btn    = document.getElementById('cfg-save-btn');
    const status = document.getElementById('cfg-status');

    const title      = document.getElementById('cfg-title').value;
    const botIcon    = document.getElementById('cfg-bot-icon').value;
    const opener     = document.getElementById('cfg-opener').value;
    const uploadMode = document.getElementById('cfg-upload-mode').value;
    const hints      = document.getElementById('cfg-hints').value;
    const model      = document.getElementById('cfg-model').value;

    btn.disabled       = true;
    status.className   = 'cfg-status';
    status.textContent = 'Speichert…';

    const errors = [];

    try {
      if (title !== initial.title || botIcon !== initial.botIcon || opener !== initial.opener || uploadMode !== initial.uploadMode) {
        const res = await fetch(
          `/api/activity-config/${encodeURIComponent(activityId)}?token=${encodeURIComponent(token)}`,
          {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ title, botIcon, opener, uploadMode }),
          }
        );
        if (res.ok) {
          initial.title      = title;
          initial.botIcon    = botIcon;
          initial.opener     = opener;
          initial.uploadMode = uploadMode;
        } else {
          errors.push('Einstellungen konnten nicht gespeichert werden.');
        }
      }

      if (hints !== initial.hints) {
        const res = await fetch(
          `/api/erfahrungsprompt/${encodeURIComponent(activityId)}?token=${encodeURIComponent(token)}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ content: hints }),
          }
        );
        if (res.ok) {
          initial.hints = hints;
        } else {
          errors.push('Hinweise konnten nicht gespeichert werden.');
        }
      }

      if (model !== initial.model) {
        const res = await fetch(
          `/api/teacher/preferences?token=${encodeURIComponent(token)}`,
          {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model }),
          }
        );
        if (res.ok) {
          initial.model = model;
        } else {
          errors.push('Modell-Präferenz konnte nicht gespeichert werden.');
        }
      }

      if (errors.length > 0) {
        status.className   = 'cfg-status err';
        status.textContent = errors.join(' ');
      } else {
        window.parent.postMessage({ type: 'moogpt:configSaved' }, '*');
      }
    } catch (e) {
      status.className   = 'cfg-status err';
      status.textContent = 'Netzwerkfehler: ' + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  // ── Interaktiver Prompt-Assistent (via postMessage an Parent-Panel) ─────────
  let suggestHistory = [];

  async function suggestSend(userText) {
    if (userText) {
      suggestHistory.push({ role: 'user', content: userText });
    }
    window.parent.postMessage({ type: 'moogpt:suggestLoading', loading: true }, '*');

    try {
      const res = await fetch(
        `/api/activity/${encodeURIComponent(activityId)}/suggest-prompt?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentPrompt: document.getElementById('cfg-hints').value,
            messages: suggestHistory,
          }),
        }
      );
      if (!res.ok) throw new Error(`Server-Fehler ${res.status}`);
      const data = await res.json();

      if (data.type === 'question') {
        suggestHistory.push({ role: 'assistant', content: data.question });
        window.parent.postMessage({ type: 'moogpt:suggestQuestion', question: data.question }, '*');
      } else {
        window.parent.postMessage({ type: 'moogpt:suggestFinal', prompt: data.prompt || '' }, '*');
      }
    } catch (err) {
      window.parent.postMessage({ type: 'moogpt:suggestError', message: err.message }, '*');
    }
  }

  async function suggestDirect() {
    const btn = document.getElementById('cfg-suggest-btn');
    btn.disabled    = true;
    btn.textContent = '⏳ Erstellt…';
    try {
      const res = await fetch(
        `/api/activity/${encodeURIComponent(activityId)}/suggest-prompt?token=${encodeURIComponent(token)}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            currentPrompt: document.getElementById('cfg-hints').value,
            direct:        true,
          }),
        }
      );
      if (!res.ok) throw new Error(`Server-Fehler ${res.status}`);
      const data = await res.json();
      if (data.type === 'final' && data.prompt) {
        document.getElementById('cfg-hints').value = data.prompt;
        updateDirtyState();
        showStatus('✓ Prompt erstellt', 'ok');
      } else {
        showStatus('Kein Prompt erhalten', 'err');
      }
    } catch (err) {
      showStatus(`Fehler: ${err.message}`, 'err');
    } finally {
      btn.disabled    = false;
      btn.textContent = '✨ Prompt mit KI erstellen';
    }
  }

  document.getElementById('cfg-suggest-btn').addEventListener('click', () => {
    const wantsQuestions = document.getElementById('cfg-suggest-questions').checked;
    if (wantsQuestions) {
      suggestHistory = [];
      const existingPrompt = document.getElementById('cfg-hints').value?.trim() || '';
      const contextNote = existingPrompt
        ? `Vorhandener Prompt der Lehrkraft:\n${existingPrompt}\n\n`
        : '';
      suggestHistory.push({ role: 'user', content: `${contextNote}Bitte stell mir Frage 1 von 5.` });
      window.parent.postMessage({ type: 'moogpt:suggestOpen' }, '*');
      suggestSend('');
    } else {
      suggestDirect();
    }
  });

  document.getElementById('cfg-suggest-questions').addEventListener('change', async function () {
    const value = this.checked ? 1 : 0;
    try {
      await fetch(
        `/api/activity-config/${encodeURIComponent(activityId)}/suggest-preference?token=${encodeURIComponent(token)}`,
        {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ preferSuggestQuestions: value }),
        }
      );
    } catch (_) {}
  });

  document.getElementById('cfg-save-btn').addEventListener('click', saveConfig);

  document.getElementById('cfg-check-btn').addEventListener('click', runPromptCheck);

  document.getElementById('cfg-compare-close').addEventListener('click', () => {
    document.getElementById('cfg-compare-panel').style.display = 'none';
    window.parent.postMessage({ type: 'moogpt:collapseOverlay' }, '*');
  });

  document.getElementById('cfg-compare-use-suggestion').addEventListener('click', () => {
    useAndSave(document.getElementById('cfg-compare-suggestion').value);
  });

  document.getElementById('cfg-compare-use-original').addEventListener('click', () => {
    useAndSave(document.getElementById('cfg-compare-original').value);
  });

  loadConfig();
})();
