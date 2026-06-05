/**
 * services/chat-response.js — Issue #76
 *
 * DI-Factory für streamResponse: extrahiert aus server.js.
 * Streamt eine Antwort via Responses API und spiegelt sie in SQLite.
 *
 * Abhängigkeiten werden als Parameter übergeben — ermöglicht Tests ohne echte
 * DB/AI-Verbindung.
 */

import { buildInput as _buildInput } from '../message-formatter.js';
import { getEffectiveModel as _getEffectiveModel } from '../model-resolver.js';
import { buildInstructions as _buildInstructions } from '../prompt-builder.js';
import { getStudentMemory as _getStudentMemory } from '../stores/student-memory.js';
import { getCachedConfig as _getCachedConfig } from '../stores/prompt.js';
import { getActiveErfahrungsprompt as _getActiveErfahrungsprompt } from '../stores/prompt.js';
import { getMessagesAll as _getMessagesAll, saveMessage as _saveMessage } from '../stores/chat.js';
import { recordUsage as _recordUsage } from '../token-log.js';
import { resolveWidgetConfig as _resolveWidgetConfig } from './widget-config-resolver.js';
import { getWidgetConfig as _getWidgetConfig } from '../stores/widget-config.js';

const productionModuleDeps = {
  buildInput:                _buildInput,
  getEffectiveModel:         _getEffectiveModel,
  buildInstructions:         _buildInstructions,
  getStudentMemory:          _getStudentMemory,
  getCachedConfig:           _getCachedConfig,
  getActiveErfahrungsprompt: _getActiveErfahrungsprompt,
  getMessagesAll:            _getMessagesAll,
  saveMessage:               _saveMessage,
  recordUsage:               _recordUsage,
  resolveWidgetConfig:       _resolveWidgetConfig,
  getWidgetConfig:           _getWidgetConfig,
};

/**
 * Erstellt die streamResponse-Funktion mit injizierter Infrastruktur.
 *
 * @param {{ dashboardRegistry: object, aiClient: object }} infra
 * @param {object} [moduleDeps] — optionale Module-Dependencies für Tests
 * @returns {(ws: object, settings: object, threadDbId: number) => Promise<void>}
 */
export function createStreamResponse({ dashboardRegistry, aiClient }, moduleDeps = productionModuleDeps) {
  const {
    buildInput,
    getEffectiveModel,
    buildInstructions,
    getStudentMemory,
    getCachedConfig,
    getActiveErfahrungsprompt,
    getMessagesAll,
    saveMessage,
    recordUsage,
    resolveWidgetConfig,
    getWidgetConfig,
  } = moduleDeps;

  /**
   * Streamt eine Antwort via Responses API und spiegelt sie in SQLite.
   * History wird vollständig aus der DB aufgebaut (inkl. task_image).
   */
  return async function streamResponse(ws, settings, threadDbId) {
    const chatMsg = { end: false, messages: '' };

    const effectiveModel = getEffectiveModel(settings.activityId);
    if (!effectiveModel) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({
        end: true,
        error: 'Kein Modell konfiguriert. Bitte wende dich an die Lehrkraft oder den Administrator.',
      }));
      return;
    }
    const memoryEntry    = (!ws.isTeacher && settings.userId)
      ? getStudentMemory(settings.userId)
      : null;
    const widgetCfg         = resolveWidgetConfig(settings.activityId, null);
    const mathMode          = widgetCfg.mathMode;
    const chatTemperature   = getWidgetConfig(settings.activityId)?.chat_temperature ?? null;
    const instructions      = buildInstructions({
      systemContent:    getCachedConfig().content,
      erfahrungContent: getActiveErfahrungsprompt(settings.activityId)?.content ?? '',
      aufgabenprompt:   settings.hints,
      aufgabe:          settings.task,
      date:             new Date(),
      studentMemory:    memoryEntry?.preference_text ?? null,
      mathMode,
    });
    const input = buildInput(getMessagesAll(threadDbId));

    let resContent = '';

    try {
      const streamOpts = chatTemperature != null ? { temperature: chatTemperature } : undefined;
      const stream = await aiClient.stream(instructions, input, effectiveModel, streamOpts);

      let usage = null;
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          resContent += event.delta;
          chatMsg.messages = resContent;
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(chatMsg));
        } else if (event.type === 'response.completed') {
          usage = event.response?.usage ?? null;
        }
      }

      resContent = resContent.replace('sandbox:/mnt/data/', 'storage/');
      console.log(`[Chat] Antwort (${resContent.length} Zeichen)`);

      // Assistenten-Antwort in DB spiegeln
      const msgId = saveMessage({ thread_db_id: threadDbId, role: 'assistant', content: resContent });

      // Token-Verbrauch speichern (Responses API: input_tokens / output_tokens)
      const costs = await recordUsage(threadDbId, settings?.activityId || null, effectiveModel, usage, msgId);

      // Dashboard benachrichtigen
      if (settings.activityId) {
        dashboardRegistry.broadcast(settings.activityId, {
          type:         'newMessage',
          threadDbId,
          userId:       settings.userId   || null,
          userName:     settings.userName || null,
          role:         'assistant',
          content:      resContent,
          createdAt:    new Date().toISOString(),
          messageId:    msgId,
          runCost:      costs?.runCost      ?? null,
          threadCost:   costs?.threadCost   ?? null,
          activityCost: costs?.activityCost ?? null,
        });
      }

      chatMsg.end      = true;
      chatMsg.messages = resContent;
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(chatMsg));

    } catch (error) {
      console.error('[Chat] streamResponse Fehler:', error);
      chatMsg.end      = true;
      chatMsg.messages = 'Error: ' + error.message;
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(chatMsg));
    }
  };
}
