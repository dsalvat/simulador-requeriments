export default function handler(req, res) {
  res.json({
    claude: !!process.env.ANTHROPIC_API_KEY,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    deepgram: !!process.env.DEEPGRAM_API_KEY,
    simli: !!process.env.SIMLI_API_KEY,
    saasReady: !!(process.env.ELEVENLABS_API_KEY && process.env.DEEPGRAM_API_KEY && process.env.SIMLI_API_KEY)
  });
}
