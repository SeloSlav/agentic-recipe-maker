import { MODELS } from '../../../lib/models';
import { lazyAIClient } from '../../../lib/ai-client';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const ai = lazyAIClient();

/**
 * Lightweight API to generate fun facts about the user's meal plan type.
 * Designed to return quickly (small prompt, few tokens) so it can load
 * before the full meal plan and be cycled through during the wait.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const preferences = (body.preferences || body.mealPlanPrompt || '').trim();

    const context = preferences
      ? `about ${preferences} cooking and meal planning`
      : 'about cooking, meal planning, and healthy eating in general';

    const completion = await ai.chat.completions.create({
      model: MODELS.enrichment,
      max_tokens: 400,
      temperature: 0.9,
      messages: [
        {
          role: 'system',
          content: `You are Baba Selo, a warm grandmother from Eastern Europe. Generate exactly 6 short, fun facts ${context}. Output ONLY the facts, one per line. No numbering, no bullets, no quotes, no JSON. Each fact under 25 words. Light, surprising, or heartwarming.`,
        },
        {
          role: 'user',
          content: `Give me 6 fun facts ${context}, one per line.`,
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    // Parse newline-separated facts (more reliable than JSON)
    const facts = raw
      .split(/\n+/)
      .map((s) => s.replace(/^[\d\.\-\*\•]\s*/, '').trim())
      .filter((s) => s.length > 10 && s.length < 200);

    return NextResponse.json({ facts: facts.slice(0, 8) });
  } catch (error) {
    console.error('Fun facts API error:', error);
    return NextResponse.json({ facts: [] });
  }
}
