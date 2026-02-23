import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const skill = url.searchParams.get('skill') || '';
    if (!skill) {
      return NextResponse.json({ error: 'skill query param required' }, { status: 400 });
    }

    // Build a prompt to generate JSON array of QA objects
    const prompt = `You are an exam generator.\nGenerate exactly 5 multiple-choice questions to assess a user's ability with the skill \"${skill}\".\nEach question should be a simple sentence and have 4 answer options.\nReturn a valid JSON array where each element has fields:\nquestion (string), options (array of 4 strings), correctIndex (0-3).\nDo not include any additional commentary.`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });
    const json = await resp.json();
    let text = '';
    if (json.choices && json.choices[0] && json.choices[0].message) {
      text = json.choices[0].message.content;
    }
    // try to parse JSON from the model output
    try {
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed)) {
        return NextResponse.json(parsed);
      }
    } catch (e) {
      // fall through to error
    }
    // if parsing failed, return empty
    return NextResponse.json([], { status: 200 });
  } catch (err: any) {
    console.error('generate-questions error', err);
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
