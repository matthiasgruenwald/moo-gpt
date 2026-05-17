let _config = { content: '', model: '' };

export const getCachedConfig = () => _config;

export function updateCachedConfig(content, model) {
  _config = { content, model };
}
