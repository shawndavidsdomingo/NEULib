import { NextRequest, NextResponse } from 'next/server';
import { aiPoweredVisitSummary } from '@/ai/flows/ai-powered-visit-summary-flow';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    if (!body.startDate || !body.endDate || !Array.isArray(body.visitData)) {
      return NextResponse.json(
        { error: 'Invalid input. Required: startDate, endDate, visitData array' },
        { status: 400 }
      );
    }

    console.log(`[API] Generating summary for ${body.visitData.length} visits from ${body.startDate} to ${body.endDate}`);

    // Call the AI summary flow
    const result = await aiPoweredVisitSummary(body);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error in AI summary:', error);
    
    // Check if it's a quota error
    if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json(
        { 
          error: 'API quota exceeded', 
          summary: 'Unable to generate AI summary due to API quota limitations. Please try again later or check your quota at https://makersuite.google.com/app/apikey',
          quotaLink: 'https://makersuite.google.com/app/apikey',
          apiKey: 'AIzaSyBPTi_LH2X2pbVyzBfKhWBH-N5nNKEwADo'
        },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to generate summary', details: error.message },
      { status: 500 }
    );
  }
}