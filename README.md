# 🎭 Simulador de Presa de Requeriments

Sistema interactiu de role-playing per practicar el guió de presa de requeriments. Inclou 5 perfils d'usuari amb diferents nivells de dificultat, reconeixement de veu, avatars animats i avaluació automàtica.

## Requisits

- **Node.js** 18 o superior
- **Navegador Chrome** (per al reconeixement de veu en català)
- **Clau API d'Anthropic** — [console.anthropic.com](https://console.anthropic.com/)
- **Opcional (mode SaaS)**: Claus de [Simli](https://simli.com), [ElevenLabs](https://elevenlabs.io) i [Deepgram](https://deepgram.com)

## Instal·lació

```bash
# 1. Descomprimeix i entra al directori
cd simulador-requeriments

# 2. Instal·la dependències
npm install

# 3. Configura la clau API
cp .env.example .env
# Edita .env i posa la teva clau: ANTHROPIC_API_KEY=sk-ant-...

# 4. Arrenca el simulador
npm start
```

S'obrirà a **http://localhost:3000**. Usa Chrome per al reconeixement de veu.

## Ús

### Mode Desenvolupament (hot reload)

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Servidor API
npm run server
```

El frontend estarà a `http://localhost:5173` i el proxy API a `http://localhost:3000`.

Per a mode dev, afegeix aquesta línia a `vite.config.js`:

```js
server: { proxy: { '/api': 'http://localhost:3000' } }
```

### Mode Producció

```bash
npm start
```

Construeix el frontend i arrenca el servidor. Tot a `http://localhost:3000`.

## Estructura

```
simulador-requeriments/
├── server.js              # Proxy Express → APIs (Claude, ElevenLabs, Deepgram, Simli)
├── vite.config.js         # Configuració Vite
├── index.html             # Entry point HTML
├── .env                   # Claus API (NO commitegis!)
├── .env.example           # Template
├── Dockerfile / .dockerignore
├── package.json
└── src/
    ├── main.jsx           # Entry point React
    ├── App.jsx            # Orquestració (mode SaaS / fallback)
    ├── data.js            # Personas, checklist, constants
    ├── api.js             # callClaude(), checkServicesStatus()
    ├── components/
    │   ├── Avatar.jsx     # Avatar SVG animat (fallback)
    │   ├── SimliAvatar.jsx# Avatar vídeo Simli (SaaS)
    │   └── MiniChecklist.jsx
    └── hooks/
        ├── useSpeechRecognition.js  # Web Speech API (fallback)
        ├── useSpeechSynthesis.js    # Web Speech API (fallback)
        ├── useDeepgram.js           # STT via WebSocket (SaaS)
        ├── useElevenLabs.js         # TTS streaming → Simli (SaaS)
        └── useSimli.js              # SimliClient lifecycle (SaaS)
```

## Els 5 Avatars

| Avatar | Nom | Dificultat | Descripció |
|--------|-----|-----------|------------|
| 👨‍💻 El Tècnic | Marc | Fàcil | Sap el que vol, respon clar, té números |
| 🤷 La Perduda | Laia | Difícil | No sap el que vol, vaguetats, canvia de tema |
| 🧠 El Savi Confús | Jordi | Mitjà | Ho sap tot però s'enreda, jerga, històries llargues |
| ⚖️ La Indecisa | Anna | Difícil | No pot prioritzar, tot és Must |
| 📱 El Producte Fixat | Sergi | Mitjà-Difícil | Vol carros intel·ligents, no sap el problema real |

## Com funciona

1. **Selecciona** un avatar i el mode (veu o text)
2. **Conversa** fent les preguntes del guió de requeriments
3. L'avatar respon via l'API de Claude amb el personatge assignat
4. La **checklist lateral** mostra el teu progrés
5. Quan acabis, digues **"ja tinc tota la informació"** o prem 📊
6. El sistema **avalua** quins elements has cobert i et dona feedback

## Checklist (28 elements)

El simulador avalua contra 5 fases del guió:

- **Fase 1 — Outcome** (8 elements): Dolor, resultat, Green/Blue Money, KPI, sponsor, data...
- **Fase 2 — Output** (8 elements): Solució, usuaris, accions, integracions, top 3...
- **Fase 3 — MVP** (5 elements): Validació MVP, funcionalitats, MoSCoW...
- **Fase 4 — Validació** (4 elements): Horitzó, responsable, llindars, pla B
- **Fase 5 — Release** (3 elements): Timing, dependències, comunicació

## Modes d'execució

### Mode fallback (per defecte)
Només cal la clau `ANTHROPIC_API_KEY`. Usa Web Speech API (Chrome) per veu i avatars SVG animats. Cost: ~0,02-0,05€/sessió.

### Mode SaaS
Afegeix les 3 claus opcionals al `.env`. L'app detecta automàticament els serveis i activa:
- **Simli** — Avatars de vídeo amb lip-sync en temps real
- **ElevenLabs** — TTS professional en català (model Flash v2.5)
- **Deepgram** — STT en temps real en català (model Nova-3)

Cost estimat: ~0,15-0,30€/sessió.

## Notes

- En mode fallback, la **qualitat de la veu** depèn de les veus instal·lades al sistema.
- El reconeixement de veu en **català** funciona a Chrome (fallback) o amb Deepgram (SaaS).
- Per canviar el model Claude, edita `src/api.js`.

## Docker

```bash
# Construeix la imatge
docker build -t simulador-requeriments .

# Executa el contenidor
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... simulador-requeriments
```

Obre **http://localhost:3000** al navegador (Chrome recomanat).

Alternativament, pots usar un fitxer `.env` existent:

```bash
docker run -p 3000:3000 --env-file .env simulador-requeriments
```

## Seguretat

- La clau API **mai** s'exposa al frontend. El servidor proxy (`server.js`) la gestiona.
- No comitegis el fitxer `.env`. Afegeix-lo al `.gitignore`.

---

*Direcció de Sistemes d'Informació — Febrer 2026*
