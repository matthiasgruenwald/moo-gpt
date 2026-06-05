import { getDb } from '../db.js';

/**
 * Widget-Konfiguration einer Aktivität schreiben (Partial-Update möglich).
 * @param {string} activity_id
 * @param {{ opener?, uploadMode?, title?, botIcon?, audioInput?, audioOutput?,
 *           ttsVoice?, audioStudentOptions?, model?, mathMode?,
 *           assistModel?, chatTemperature?, assistTemperature? }} config
 * Alle Felder optional — nur gesetzte Felder werden aktualisiert.
 * Unbekannte Felder werden ignoriert.
 */
export function setWidgetConfig(activity_id, config) {
  const {
    opener,
    uploadMode,
    title,
    botIcon,
    audioInput,
    audioOutput,
    ttsVoice,
    audioStudentOptions,
    model,
    mathMode,
  } = config;

  // Für nullable Felder: undefined = "nicht übergeben" (bestehendes behalten),
  // null = "explizit auf null setzen" (Fallback-Semantik).
  // @*_set-Flags (1/0) unterscheiden im SQL beide Fälle.
  const assistModelSet      = 'assistModel'       in config ? 1 : 0;
  const chatTempSet         = 'chatTemperature'   in config ? 1 : 0;
  const assistTempSet       = 'assistTemperature' in config ? 1 : 0;
  const assistModel         = config.assistModel       ?? null;
  const chatTemperature     = config.chatTemperature   ?? null;
  const assistTemperature   = config.assistTemperature ?? null;

  // Named params (@name) ermöglichen, dass @field in DO UPDATE SET den
  // Original-Wert (null = nicht gesetzt) prüft — CASE WHEN unterscheidet so
  // zwischen "nicht übergeben" (null → bestehendes behalten) und "explizit gesetzt".
  // COALESCE in VALUES setzt Defaults bei frischem INSERT (ohne prior upsertActivity).
  getDb().prepare(`
    INSERT INTO activities (activity_id, opener, upload_mode, title, bot_icon, audio_input, audio_output, tts_voice, audio_student_options, model, math_mode, assist_model, chat_temperature, assist_temperature, updated_at)
    VALUES (@activity_id, @opener, @upload_mode, @title,
            COALESCE(@bot_icon, 'grw'), @audio_input,
            COALESCE(@audio_output, 'off'), COALESCE(@tts_voice, 'nova'), COALESCE(@audio_student_options, 'off'),
            @model, COALESCE(@math_mode, 'off'),
            @assist_model, @chat_temperature, @assist_temperature,
            CURRENT_TIMESTAMP)
    ON CONFLICT(activity_id) DO UPDATE SET
      opener                = COALESCE(@opener, activities.opener),
      upload_mode           = COALESCE(@upload_mode, activities.upload_mode),
      title                 = COALESCE(@title, activities.title),
      bot_icon              = CASE WHEN @bot_icon IS NOT NULL
                                   THEN @bot_icon
                                   ELSE COALESCE(activities.bot_icon, 'grw') END,
      audio_input           = COALESCE(@audio_input, activities.audio_input, 'off'),
      audio_output          = CASE WHEN @audio_output IS NOT NULL
                                   THEN @audio_output
                                   ELSE COALESCE(activities.audio_output, 'off') END,
      tts_voice             = CASE WHEN @tts_voice IS NOT NULL
                                   THEN @tts_voice
                                   ELSE COALESCE(activities.tts_voice, 'nova') END,
      audio_student_options = CASE WHEN @audio_student_options IS NOT NULL
                                   THEN @audio_student_options
                                   ELSE COALESCE(activities.audio_student_options, 'off') END,
      model                 = @model,
      math_mode             = CASE WHEN @math_mode IS NOT NULL
                                   THEN @math_mode
                                   ELSE COALESCE(activities.math_mode, 'off') END,
      assist_model          = CASE WHEN @assist_model_set = 1
                                   THEN @assist_model
                                   ELSE activities.assist_model END,
      chat_temperature      = CASE WHEN @chat_temperature_set = 1
                                   THEN @chat_temperature
                                   ELSE activities.chat_temperature END,
      assist_temperature    = CASE WHEN @assist_temperature_set = 1
                                   THEN @assist_temperature
                                   ELSE activities.assist_temperature END,
      updated_at            = CURRENT_TIMESTAMP
  `).run({
    activity_id,
    opener:                 opener              ?? null,
    upload_mode:            uploadMode          ?? null,
    title:                  title               ?? null,
    bot_icon:               botIcon             ?? null,
    audio_input:            audioInput          ?? null,
    audio_output:           audioOutput         ?? null,
    tts_voice:              ttsVoice            ?? null,
    audio_student_options:  audioStudentOptions ?? null,
    model:                  model               ?? null,
    math_mode:              mathMode            ?? null,
    assist_model:           assistModel,
    assist_model_set:       assistModelSet,
    chat_temperature:       chatTemperature,
    chat_temperature_set:   chatTempSet,
    assist_temperature:     assistTemperature,
    assist_temperature_set: assistTempSet,
  });
}

/**
 * Nur die Widget-Konfigurationsfelder lesen (kein activity_name, kein teacher_id).
 * @param {string} activity_id
 * @returns {{ opener, upload_mode, title, bot_icon, audio_input, audio_output,
 *             tts_voice, audio_student_options, model, math_mode,
 *             assist_model, chat_temperature, assist_temperature } | null}
 */
export function getWidgetConfig(activity_id) {
  return getDb().prepare(
    'SELECT opener, upload_mode, title, bot_icon, audio_input, audio_output, tts_voice, audio_student_options, model, math_mode, assist_model, chat_temperature, assist_temperature FROM activities WHERE activity_id = ?'
  ).get(activity_id) || null;
}
