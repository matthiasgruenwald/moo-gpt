export const VALID_UPLOAD_MODES = ['off', 'images', 'files'];
export const VALID_BOT_ICONS    = ['grw', 'grw2', 'weiblich'];

export function validateTemplateFields(uploadMode, botIcon) {
  if (uploadMode !== undefined && !VALID_UPLOAD_MODES.includes(uploadMode))
    return 'Ungültiger uploadMode';
  if (botIcon !== undefined && botIcon !== '' && !VALID_BOT_ICONS.includes(botIcon))
    return 'Ungültiges botIcon';
  return null;
}
