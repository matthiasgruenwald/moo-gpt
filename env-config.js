export const MODEL_NAME = process.env.MODEL_NAME;

if (!MODEL_NAME) {
  console.error('MODEL_NAME ist nicht gesetzt (z.B. gpt-5)');
  process.exit(1);
}

export const AVAILABLE_MODELS = process.env.AVAILABLE_MODELS
  ? process.env.AVAILABLE_MODELS.split(',').map(m => m.trim()).filter(Boolean)
  : [MODEL_NAME];

export const AVAILABLE_BOT_ICONS = process.env.AVAILABLE_BOT_ICONS
  ? process.env.AVAILABLE_BOT_ICONS.split(',').map(b => b.trim()).filter(Boolean)
  : ['grw', 'grw2', 'weiblich', 'grwdev'];

export const GEN_MODEL  = process.env.GEN_MODEL || 'gpt-4.1-nano';
export const GEN_MODELS = [...new Set(['gpt-4.1-nano', 'gpt-4.1', ...AVAILABLE_MODELS])];
