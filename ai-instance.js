import OpenAI from 'openai';
import { AIClient } from './ai-client.js';

if (!process.env.APIKEY) {
  console.error('APIKEY ist nicht gesetzt');
  process.exit(1);
}

export const oai      = new OpenAI({ apiKey: process.env.APIKEY });
export const aiClient = new AIClient(oai);
