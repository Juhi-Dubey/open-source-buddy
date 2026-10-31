import { config } from '../config.js';
import { MockAIProvider } from './mock.js';
import { GeminiProvider } from './gemini.js';
import { GroqProvider } from './groq.js';
import { OllamaProvider } from './ollama.js';

const providers = {
  mock: MockAIProvider,
  gemini: GeminiProvider,
  groq: GroqProvider,
  ollama: OllamaProvider,
};

const Provider = providers[config.aiProvider];
if (!Provider) {
  throw new Error(`Unknown AI_PROVIDER "${config.aiProvider}". Use: ${Object.keys(providers).join(', ')}`);
}

export default new Provider();