// Standalone bug-report module — included on dashboard pages other than chats.html

const _brParams = new URLSearchParams(location.search);
const _brToken  = _brParams.get('token')     || '';
const _brActId  = _brParams.get('activityId') || '';

async function _brFetch(path, opts = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`${path}${sep}token=${encodeURIComponent(_brToken)}`, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

(function initBugReport() {
  const modal       = document.getElementById('bug-report-modal');
  const openBtn     = document.getElementById('bug-report-btn');
  const closeBtn    = document.getElementById('bug-report-close');
  const analyzeBtn  = document.getElementById('br-analyze-btn');
  const description = document.getElementById('br-description');
  const loading     = document.getElementById('br-loading');
  const result      = document.getElementById('br-result');
  const titleInput  = document.getElementById('br-issue-title');
  const bodyInput   = document.getElementById('br-issue-body');
  const statusEl    = document.getElementById('br-status');
  const matPrompt   = document.getElementById('br-mat-prompt');
  const matConfig   = document.getElementById('br-mat-config');
  const matChatLog  = document.getElementById('br-mat-chatLog');
  const prevPrompt  = document.getElementById('br-mat-prompt-preview');
  const prevConfig  = document.getElementById('br-mat-config-preview');
  const prevChatLog = document.getElementById('br-mat-chatLog-preview');

  let materials = { prompt: null, config: null, chatLog: null };

  function openModal() {
    description.value = '';
    result.classList.remove('visible');
    titleInput.value  = '';
    bodyInput.value   = '';
    statusEl.textContent = '';
    loading.classList.remove('visible');
    analyzeBtn.disabled = false;
    materials = { prompt: null, config: null, chatLog: null };
    [prevPrompt, prevConfig, prevChatLog].forEach(p => { p.textContent = ''; p.classList.remove('visible'); });
    matPrompt.checked = false; matConfig.checked = false; matChatLog.checked = false;
    modal.classList.add('visible');
    requestAnimationFrame(() => description.focus());
  }

  function closeModal() { modal.classList.remove('visible'); }

  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('visible')) closeModal();
  });

  function wireCheckbox(checkbox, preview, key) {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked && materials[key]) { preview.textContent = materials[key]; preview.classList.add('visible'); }
      else { preview.classList.remove('visible'); }
    });
  }
  wireCheckbox(matPrompt, prevPrompt, 'prompt');
  wireCheckbox(matConfig, prevConfig, 'config');
  wireCheckbox(matChatLog, prevChatLog, 'chatLog');

  analyzeBtn?.addEventListener('click', async () => {
    const desc = description.value.trim();
    if (!desc) { statusEl.textContent = 'Bitte eine Beschreibung eingeben.'; return; }
    analyzeBtn.disabled = true;
    loading.classList.add('visible');
    result.classList.remove('visible');
    statusEl.textContent = '';
    try {
      const data = await _brFetch(`/api/bug-report?activityId=${encodeURIComponent(_brActId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      });
      titleInput.value = data.title || '';
      bodyInput.value  = data.body  || '';
      materials = { prompt: data.materials?.prompt || null, config: data.materials?.config || null, chatLog: data.materials?.chatLog || null };
      document.getElementById('br-mat-row-prompt').style.display  = materials.prompt  ? '' : 'none';
      document.getElementById('br-mat-row-config').style.display  = materials.config  ? '' : 'none';
      document.getElementById('br-mat-row-chatLog').style.display = materials.chatLog ? '' : 'none';
      const suggested = new Set(data.suggestedMaterials || []);
      matPrompt.checked  = suggested.has('prompt')  && !!materials.prompt;
      matConfig.checked  = suggested.has('config')  && !!materials.config;
      matChatLog.checked = false;
      [[matPrompt, prevPrompt, 'prompt'], [matConfig, prevConfig, 'config'], [matChatLog, prevChatLog, 'chatLog']].forEach(([cb, pv, k]) => {
        if (cb.checked && materials[k]) { pv.textContent = materials[k]; pv.classList.add('visible'); }
        else { pv.classList.remove('visible'); }
      });
      result.classList.add('visible');
    } catch (e) {
      statusEl.textContent = `Fehler: ${e.message}`;
    } finally {
      loading.classList.remove('visible');
      analyzeBtn.disabled = false;
    }
  });

  const GITHUB_ISSUE_URL = 'https://github.com/matthiasgruenwald/moo-gpt/issues/new';
  const MAX_URL_BYTES = 8000;

  function buildGithubUrl(title, body) {
    const base = `${GITHUB_ISSUE_URL}?title=${encodeURIComponent(title)}&body=`;
    const full = base + encodeURIComponent(body);
    if (new TextEncoder().encode(full).length <= MAX_URL_BYTES) return full;
    const budget = MAX_URL_BYTES - new TextEncoder().encode(base).length - 50;
    const enc = new TextEncoder();
    let t = body;
    while (enc.encode(encodeURIComponent(t)).length > budget) t = t.slice(0, Math.floor(t.length * 0.9));
    return base + encodeURIComponent(t + '\n\n[Inhalt gekürzt – max. URL-Länge erreicht]');
  }

  function buildBodyWithMaterials() {
    const base = bodyInput.value;
    const sections = [];
    if (matPrompt.checked  && materials.prompt)  sections.push(`\n\n---\n## Aufgabenprompt\n\`\`\`\n${materials.prompt}\n\`\`\``);
    if (matConfig.checked  && materials.config)  sections.push(`\n\n---\n## Aktivitätskonfiguration\n\`\`\`json\n${materials.config}\n\`\`\``);
    if (matChatLog.checked && materials.chatLog) sections.push(`\n\n---\n## Chat-Auszüge (pseudonymisiert)\n\`\`\`\n${materials.chatLog}\n\`\`\``);
    return base + sections.join('');
  }

  document.getElementById('br-send-full-btn')?.addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { statusEl.textContent = 'Bitte einen Titel eingeben.'; return; }
    window.open(buildGithubUrl(title, buildBodyWithMaterials()), '_blank', 'noopener');
    statusEl.textContent = '✓ GitHub geöffnet';
  });

  document.getElementById('br-send-simple-btn')?.addEventListener('click', () => {
    const title = titleInput.value.trim();
    if (!title) { statusEl.textContent = 'Bitte einen Titel eingeben.'; return; }
    window.open(buildGithubUrl(title, bodyInput.value), '_blank', 'noopener');
    statusEl.textContent = '✓ GitHub geöffnet';
  });

  document.getElementById('br-send-simple-btn-early')?.addEventListener('click', () => {
    const desc = description.value.trim();
    if (!desc) return;
    const title = desc.length > 70 ? desc.slice(0, 67) + '…' : desc;
    window.open(buildGithubUrl(title, desc), '_blank', 'noopener');
    closeModal();
  });
})();
