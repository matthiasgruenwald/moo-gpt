import { Router } from 'express';
import {
  requireTeacherAuth, requireDashboardAuth, requireAdminAuth, getUserNameFromToken,
} from '../auth-middleware.js';
import {
  getGlobalPersonas, getTeacherPersonas,
  createPersona, deletePersona, promotePersonaToGlobal, getAllTeacherPersonasGrouped,
  getStudentMessages,
} from '../stores/persona.js';
import { GEN_MODEL } from '../env-config.js';
import { recordWerkzeugUsage } from '../cost-service.js';

export function createPersonasRouter({ aiClient }) {
const router = Router();

router.get('/personas', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  res.json({ global: getGlobalPersonas(), own: getTeacherPersonas(userId) });
});

router.post('/personas', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  const { name, description, example_msgs } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name fehlt' });
  const teacherName = getUserNameFromToken(req.query.token);
  createPersona({ teacherId: userId, teacherName, name: name.trim(), description, example_msgs, createdBy: userId });
  res.json({ ok: true, own: getTeacherPersonas(userId) });
});

router.delete('/personas/:id', requireTeacherAuth, (req, res) => {
  const { userId } = req;
  deletePersona(parseInt(req.params.id), userId, false);
  res.json({ ok: true, own: getTeacherPersonas(userId) });
});

router.post('/personas-suggest', requireDashboardAuth, async (req, res) => {
  const { activityId } = req;
  try {
    const { genModel } = req.body;
    const model  = genModel || GEN_MODEL;
    const msgs   = getStudentMessages(activityId);
    const sample = msgs.slice(0, 60).map(m => m.content).join('\n---\n');
    const { text: result, usage } = await aiClient.jsonCall(
      `Du analysierst Schüleräußerungen aus einer Lernaktivität und leitest typische Schüler-Personas ab.
Antworte AUSSCHLIESSLICH mit validem JSON:
{ "personas": [{ "name": "...", "description": "...", "example_msgs": "Beispiel 1|Beispiel 2|Beispiel 3" }] }
Leite 3–5 gut unterscheidbare Personas ab. Wenn keine Äußerungen vorliegen, erstelle generische Schüler-Typen für eine IGS Klasse 9.`,
      msgs.length ? `Schüler-Äußerungen:\n${sample}` : 'Noch keine Schüler-Äußerungen vorhanden. Erstelle typische Klasse-9-Personas.',
      model
    );
    if (activityId) {
      recordWerkzeugUsage(activityId, 'persona', model, usage);
    }
    res.json({
      suggestions: result.personas || [],
      cost: { promptTokens: usage?.input_tokens ?? null, completionTokens: usage?.output_tokens ?? null },
    });
  } catch (e) {
    console.error('[Personas-Suggest] Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/admin/personas', requireAdminAuth, (req, res) => {
  res.json({ personas: getAllTeacherPersonasGrouped() });
});

router.post('/admin/personas', requireAdminAuth, (req, res) => {
  const { userId } = req;
  const { name, description, example_msgs } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name fehlt' });
  createPersona({ teacherId: null, teacherName: null, name: name.trim(), description, example_msgs, createdBy: userId });
  res.json({ ok: true, global: getGlobalPersonas() });
});

router.delete('/admin/personas/:id', requireAdminAuth, (req, res) => {
  deletePersona(parseInt(req.params.id), null, true);
  res.json({ ok: true });
});

router.put('/admin/personas/:id/promote', requireAdminAuth, (req, res) => {
  const { userId } = req;
  promotePersonaToGlobal(parseInt(req.params.id), userId);
  res.json({ ok: true, global: getGlobalPersonas() });
});

  return router;
}
