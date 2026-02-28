export async function callClaude(messages, systemPrompt) {
  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.content?.map(b => b.text || "").join("\n") || "Error de connexió.";
  } catch (e) {
    console.error('API error:', e);
    return `⚠️ Error de connexió: ${e.message}. Verifica que el servidor està actiu.`;
  }
}

export async function checkServicesStatus() {
  try {
    const res = await fetch('/api/services-status');
    return await res.json();
  } catch {
    return { claude: false, elevenlabs: false, deepgram: false, simli: false, saasReady: false };
  }
}
