export const VALID_UPLOAD_MODES         = ['off', 'images', 'files'];
export const VALID_BOT_ICONS            = ['grw', 'grw2', 'weiblich'];
export const VALID_AUDIO_INPUTS         = ['off', 'on'];
export const VALID_AUDIO_OUTPUTS        = ['off', 'on'];
export const VALID_TTS_VOICES           = ['nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy'];
export const VALID_AUDIO_STUDENT_OPTIONS = ['off', 'on'];
export const VALID_MATH_MODES           = ['on', 'off'];

export function validateWidgetConfig(uploadMode, botIcon, audioInput, mathMode, audioOutput, ttsVoice, audioStudentOptions) {
  if (uploadMode          !== undefined && !VALID_UPLOAD_MODES.includes(uploadMode))
    return 'Ungültiger uploadMode';
  if (botIcon             !== undefined && botIcon !== '' && !VALID_BOT_ICONS.includes(botIcon))
    return 'Ungültiges botIcon';
  if (audioInput          !== undefined && audioInput !== '' && !VALID_AUDIO_INPUTS.includes(audioInput))
    return 'Ungültiger audioInput';
  if (audioOutput         !== undefined && audioOutput !== '' && !VALID_AUDIO_OUTPUTS.includes(audioOutput))
    return 'Ungültiger audioOutput';
  if (ttsVoice            !== undefined && ttsVoice !== '' && !VALID_TTS_VOICES.includes(ttsVoice))
    return 'Ungültige ttsVoice';
  if (audioStudentOptions !== undefined && audioStudentOptions !== '' && !VALID_AUDIO_STUDENT_OPTIONS.includes(audioStudentOptions))
    return 'Ungültige audioStudentOptions';
  if (mathMode            !== undefined && mathMode !== '' && !VALID_MATH_MODES.includes(mathMode))
    return 'Ungültiger mathMode';
  return null;
}
