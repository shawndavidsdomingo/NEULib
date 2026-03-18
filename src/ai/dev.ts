// Dev entrypoint for Genkit flows.
// Requires GEMINI_API_KEY to be set in your environment or .env.local
// Never log or print the API key value.
console.log('[dev] Starting AI-powered visit summary flow...');
console.log('[dev] GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);

import '@/ai/flows/ai-powered-visit-summary-flow.ts';