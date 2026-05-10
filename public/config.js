(function () {
  const params     = new URLSearchParams(window.location.search);
  const activityId = params.get('activityId');
  const token      = params.get('token');

  const elLoading = document.getElementById('cfg-loading');
  const elError   = document.getElementById('cfg-error');
  const elForm    = document.getElementById('cfg-form');

  let initial = {};

  function showError(msg) {
    elLoading.style.display = 'none';
    elError.style.display   = '';
    elError.textContent     = msg;
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
        const opt   = document.createElement('option');
        opt.value   = m;
        opt.textContent = m;
        modelSel.appendChild(opt);
      }
      modelSel.value = data.myModel || '';

      initial = {
        title:      data.title              || '',
        botIcon:    data.botIcon            || 'grw',
        opener:     data.opener             || '',
        uploadMode: data.uploadMode         || 'off',
        hints:      data.erfahrungsprompt   || '',
        model:      data.myModel            || '',
      };

      elLoading.style.display = 'none';
      elForm.style.display    = '';
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

  async function saveDefaults() {
    const btn    = document.getElementById('cfg-defaults-btn');
    const status = document.getElementById('cfg-status');

    const title      = document.getElementById('cfg-title').value;
    const botIcon    = document.getElementById('cfg-bot-icon').value;
    const opener     = document.getElementById('cfg-opener').value;
    const uploadMode = document.getElementById('cfg-upload-mode').value;

    btn.disabled       = true;
    status.className   = 'cfg-status';
    status.textContent = 'Speichert Voreinstellung…';

    try {
      const res = await fetch(
        `/api/teacher/defaults?token=${encodeURIComponent(token)}`,
        {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title, botIcon, opener, uploadMode }),
        }
      );
      if (res.ok) {
        status.className   = 'cfg-status ok';
        status.textContent = '✓ Voreinstellung gespeichert';
        setTimeout(() => { status.textContent = ''; }, 3000);
      } else {
        status.className   = 'cfg-status err';
        status.textContent = 'Voreinstellung konnte nicht gespeichert werden.';
      }
    } catch (e) {
      status.className   = 'cfg-status err';
      status.textContent = 'Netzwerkfehler: ' + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById('cfg-save-btn').addEventListener('click', saveConfig);
  document.getElementById('cfg-defaults-btn').addEventListener('click', saveDefaults);

  loadConfig();
})();
