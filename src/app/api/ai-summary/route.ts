import { NextRequest, NextResponse } from 'next/server';
import { aiPoweredVisitSummary } from '@/ai/flows/ai-powered-visit-summary-flow';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.startDate || !body.endDate || !Array.isArray(body.visitData)) {
      return NextResponse.json(
        { error: 'Invalid input. Required: startDate, endDate, visitData array' },
        { status: 400 }
      );
    }

    // Bail early if key is not configured — client will use statistical fallback
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'AI service not configured', summary: null },
        { status: 503 }
      );
    }

    console.log(`[API] Generating summary for ${body.visitData.length} visits from ${body.startDate} to ${body.endDate}`);

    const result = await aiPoweredVisitSummary(body);
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('[API] Error in AI summary:', error);

    if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      // Return a clean error without exposing keys or internal URLs
      return NextResponse.json(
        { error: 'API quota exceeded', summary: null },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate summary', summary: null },
      { status: 500 }
    );
  }
}