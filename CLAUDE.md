# CLAUDE.md

## Descripció del projecte

Simulador interactiu de presa de requeriments (role-playing). L'usuari fa de tècnic de sistemes i conversa amb avatars IA (alimentats per l'API de Claude) que representen diferents perfils d'usuari amb nivells de dificultat variats. Suporta dos modes: **SaaS** (Simli + ElevenLabs + Deepgram) i **fallback** (Web Speech API + SVG avatars).

## Stack tecnològic

- **Frontend**: React 19, JSX, Vite 6
- **Backend**: Express (proxy a Claude, ElevenLabs, Deepgram, Simli)
- **IA**: API de Claude (model `claude-sonnet-4-20250514`)
- **STT**: Deepgram Nova-3 (SaaS) / Web Speech API (fallback)
- **TTS**: ElevenLabs Flash v2.5 (SaaS) / Web Speech API (fallback)
- **Avatars**: Simli WebRTC lip-sync (SaaS) / SVG animat (fallback)
- **Idioma**: Català (`ca-ES`)

## Estructura del projecte

```
simulador-requeriments/
├── server.js                  # Express proxy (5 endpoints API)
├── vite.config.js             # Configuració Vite
├── index.html                 # Entry point HTML (lang="ca")
├── package.json               # Scripts: dev, build, start, server
├── .env                       # Claus API (NO comitejar)
├── .env.example               # Template
├── Dockerfile / .dockerignore # Docker multi-stage
└── src/
    ├── main.jsx               # Entry point React
    ├── App.jsx                # Orquestració (mode SaaS / fallback)
    ├── data.js                # PERSONAS (faceId, voiceId), CHECKLIST, constants
    ├── api.js                 # callClaude(), checkServicesStatus()
    ├── components/
    │   ├── Avatar.jsx         # SVG animat (fallback)
    │   ├── SimliAvatar.jsx    # Vídeo WebRTC (SaaS)
    │   └── MiniChecklist.jsx  # Progrés per fases
    └── hooks/
        ├── useSpeechRecognition.js  # Web Speech API STT (fallback)
        ├── useSpeechSynthesis.js    # Web Speech API TTS (fallback)
        ├── useDeepgram.js           # WebSocket STT → Deepgram (SaaS)
        ├── useElevenLabs.js         # Streaming TTS → PCM16 → Simli (SaaS)
        └── useSimli.js              # SimliClient lifecycle (SaaS)
```

## Endpoints del servidor

| Mètode | Ruta | Descripció |
|--------|------|-----------|
| GET | `/api/services-status` | Retorna quins serveis SaaS estan configurats |
| POST | `/api/messages` | Proxy a l'API de Claude |
| POST | `/api/tts` | Proxy streaming a ElevenLabs (PCM16 @ 16kHz) |
| POST | `/api/deepgram-token` | Retorna JWT temporal per WebSocket directe |
| POST | `/api/simli-token` | Inicia sessió Simli, retorna session token |

## Flux de dades (mode SaaS)

```
Usuari parla → getUserMedia → Deepgram WS → text
  → Claude API → resposta text
  → ElevenLabs /api/tts → PCM16 chunks
  → Simli sendAudioData() → vídeo lip-sync
```

## Mode fallback

Si falten les claus SaaS, l'app usa Web Speech API + SVG. La detecció es fa via `/api/services-status` al carregar.

## Comandes

```bash
npm run dev      # Frontend amb hot reload (localhost:5173)
npm run server   # Servidor proxy API (localhost:3000)
npm run build    # Build de producció (dist/)
npm start        # Build + servidor (tot a localhost:3000)
```

## Docker

```bash
docker build -t simulador-requeriments .
docker run -p 3000:3000 --env-file .env simulador-requeriments
```

## Convencions

- Frontend modularitzat: hooks/, components/, data.js, api.js
- Inline styles (no CSS extern)
- Hooks SaaS i fallback tenen la mateixa interfície per intercanvi transparent
- Cada persona té `faceId` (Simli) i `voiceId` (ElevenLabs) a data.js
- L'avaluació es desencadena amb "ja tinc tota la informació" o el botó "Avaluar"
- Totes les claus API passen pel proxy de server.js

## Seguretat

- `.env` al `.gitignore` — mai comitejar claus
- El servidor carrega `.env` manualment (sense dotenv)
- Deepgram: JWT temporal (120s TTL) per al client
- Simli: session token via endpoint del servidor
