import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req) {
  try {
    const { messages, model = 'llama-3.3-70b-versatile' } = await req.json();

    const stream = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are Genie, a helpful, smart, and friendly AI assistant. Be concise but thorough. Use markdown formatting when it improves clarity — bullet points, bold text, code blocks. Never mention Groq, Meta, or Llama — you are Genie AI.',
        },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.7,
      max_tokens: 2048,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? '';
            if (text) controller.enqueue(encoder.encode(text));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('Groq error:', err);
    return Response.json({ error: 'Failed to get response' }, { status: 500 });
  }
}
