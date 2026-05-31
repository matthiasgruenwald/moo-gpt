export const VALID_UPLOAD_MODES  = ['off', 'images', 'files'];
export const VALID_BOT_ICONS     = ['grw', 'grw2', 'weiblich'];
export const VALID_AUDIO_INPUTS  = ['off', 'on'];
export const VALID_MATH_MODES    = ['on', 'off'];

export function validateWidgetConfig(uploadMode, botIcon, audioInput, mathMode) {
  if (uploadMode  !== undefined && !VALID_UPLOAD_MODES.includes(uploadMode))
    return 'Ungültiger uploadMode';
  if (botIcon     !== undefined && botIcon !== '' && !VALID_BOT_ICONS.includes(botIcon))
    return 'Ungültiges botIcon';
  if (audioInput  !== undefined && audioInput !== '' && !VALID_AUDIO_INPUTS.includes(audioInput))
    return 'Ungültiger audioInput';
  if (mathMode    !== undefined && mathMode !== '' && !VALID_MATH_MODES.includes(mathMode))
    return 'Ungültiger mathMode';
  return null;
}
