function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    json(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : '';
  const host = typeof req.headers?.host === 'string' ? req.headers.host : '';
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        json(res, 403, { error: 'Cross-origin requests are not allowed.' });
        return;
      }
    } catch {
      json(res, 403, { error: 'Invalid request origin.' });
      return;
    }
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    json(res, 503, { error: 'ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in Vercel settings.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) { json(res, 400, { error: 'Announcement text is required.' }); return; }
    if (text.length > 800) { json(res, 413, { error: 'Announcement must be 800 characters or fewer.' }); return; }

    const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.42, similarity_boost: 0.78, style: 0.25, use_speaker_boost: true },
      }),
    }) as unknown as {
      ok: boolean;
      status: number;
      text(): Promise<string>;
      arrayBuffer(): Promise<ArrayBuffer>;
    };

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      console.error('ElevenLabs TTS request failed:', response.status, detail);
      json(res, 502, { error: 'ElevenLabs could not generate the announcement. Check your voice ID, API key, and plan.' });
      return;
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(audio.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(audio);
  } catch (error) {
    console.error('DJ voice generation error:', error);
    json(res, 500, { error: 'Unable to generate the DJ announcement.' });
  }
}
