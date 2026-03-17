import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// Use the Gemini Developer API key directly (the second one you shared)
// This key typically has higher quotas for Gemini models
const GEMINI_API_KEY = 'AIzaSyBPTi_LH2X2pbVyzBfKhWBH-N5nNKEwADo';

export const ai = genkit({
  plugins: [
    googleAI({ apiKey: GEMINI_API_KEY }),
  ],
});