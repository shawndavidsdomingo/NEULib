import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// API key is read from the environment variable GEMINI_API_KEY.
// Never hardcode keys in source files — set this in your deployment environment.
// Local dev: add GEMINI_API_KEY=your_key to .env.local (which is git-ignored).
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('[genkit] GEMINI_API_KEY is not set. AI features will use the statistical fallback.');
}

export const ai = genkit({
  plugins: [
    googleAI({ apiKey: apiKey || '' }),
  ],
});