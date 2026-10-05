export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const baseUrl = String(process.env.BHARATVOICEAI_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.BHARATVOICEAI_API_KEY || '').trim();

  if (!baseUrl || !apiKey) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: 'BharatVoiceAI is not configured. Set BHARATVOICEAI_URL and BHARATVOICEAI_API_KEY.'
    }));
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
    if (!text) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Announcement text is required.' }));
      return;
    }

    const lang = typeof body.lang === 'string' ? body.lang : 'en';
    const voice = typeof body.voice === 'string' ? body.voice : 'female_2';
    const speed = Number.isFinite(Number(body.speed)) ? Math.min(2, Math.max(0.5, Number(body.speed))) : 0.85;

    const response = await fetch(`${baseUrl}/v1/tts/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        text,
        lang,
        voice,
        format: 'mp3',
        speed,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      res.statusCode = response.status >= 500 ? 502 : response.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        error: 'BharatVoiceAI TTS request failed.',
        detail: detail.slice(0, 1000),
      }));
      return;
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Length', String(audio.length));
    res.end(audio);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'BharatVoiceAI TTS proxy error.'
    }));
  }
}
