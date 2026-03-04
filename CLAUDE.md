# CLAUDE.md

## Descripció del projecte

Plataforma de simulació de role-playing per a formació professional. Suporta **múltiples formacions** (presa de requeriments, comunicació, gestió de conflictes...) i **multi-organització** (empreses amb rols admin/professor/alumne). L'usuari conversa amb avatars IA (API de Claude) que representen diferents perfils amb nivells de dificultat variats. Dos modes: **SaaS** (Simli + ElevenLabs + Deepgram) i **fallback** (Web Speech API + SVG avatars).

## Stack tecnològic

- **Frontend**: React 19, JSX, Vite 6
- **Backend**: Express (proxy a Claude, ElevenLabs, Deepgram, Simli) + API REST per auth, sessions, orgs
- **BD**: PostgreSQL (Neon) amb migracions SQL
- **IA**: API de Claude (model `claude-sonnet-4-20250514`)
- **Auth**: Google OAuth 2.0 + JWT
- **STT**: Deepgram Nova-3 (SaaS) / Web Speech API (fallback)
- **TTS**: ElevenLabs Flash v2.5 (SaaS) / Web Speech API (fallback)
- **Avatars**: Simli WebRTC lip-sync (SaaS) / SVG animat (fallback)
- **Deploy**: Vercel + GitHub Actions (CI/CD amb migracions automàtiques)
- **Idioma**: Català (`ca-ES`)

## Estructura del projecte

```
simulador-requeriments/
├── server.js                  # Express: proxy IA + API REST (auth, sessions, orgs, formations)
├── lib/
│   ├── auth.js                # verifyAuth, requireAuth, requireAdmin, checkOrgRole
│   └── db.js                  # Pool PostgreSQL + helper query()
├── db/
│   ├── init.sql               # Schema base: users, sessions, session_participants
│   ├── migrate.js             # Migration runner (schema_migrations tracking)
│   └── migrate_*.sql          # Migracions SQL ordenades
├── vite.config.js             # Configuració Vite
├── index.html                 # Entry point HTML (lang="ca")
├── package.json               # Scripts: dev, build, start, server, migrate
├── .env                       # Claus API (NO comitejar)
├── .env.example               # Template
├── .github/workflows/
│   └── deploy.yml             # CI/CD: migracions + deploy Vercel
├── Dockerfile / .dockerignore # Docker multi-stage
└── src/
    ├── main.jsx               # Entry point React
    ├── App.jsx                # Orquestració (formació dinàmica, mode SaaS/fallback)
    ├── data.js                # Re-exporta formació per defecte + COST_RATES
    ├── api.js                 # callClaude(), checkServicesStatus()
    ├── formations/
    │   ├── index.js           # Registre de formacions + getFormation(slug)
    │   └── requeriments.js    # Formació: personas, checklist, phases
    ├── components/
    │   ├── Avatar.jsx         # SVG animat (fallback, genèric per propietats)
    │   ├── SimliAvatar.jsx    # Vídeo WebRTC (SaaS)
    │   ├── MiniChecklist.jsx  # Progrés per fases (props dinàmics)
    │   ├── AchievementToast.jsx # Notificacions d'assoliment
    │   ├── AdminPanel.jsx     # Gestió: usuaris, sessions, empreses
    │   └── SessionManager.jsx # Crear/llistar sessions (org + formació)
    └── hooks/
        ├── useSpeechRecognition.js  # Web Speech API STT (fallback)
        ├── useSpeechSynthesis.js    # Web Speech API TTS (fallback)
        ├── useDeepgram.js           # WebSocket STT → Deepgram (SaaS)
        ├── useElevenLabs.js         # Streaming TTS → PCM16 → Simli (SaaS)
        ├── useSimli.js              # SimliClient lifecycle (SaaS)
        └── useSession.js            # Hook sessions actives
```

## Arquitectura multi-organització

```
Super-admin (global, users.role='admin')
 └─ Organitzacions (empreses)
     ├─ Membres: admin / professor / alumne
     ├─ Formacions assignades (quines pot usar cada empresa)
     └─ Sessions (scoped a org + formació)

Particulars (sense org): accés a sessions "lliures" (organization_id=NULL)
```

## Sistema de formacions

Cada formació és un fitxer JS a `src/formations/` que exporta:
```js
{
  slug, name, description, icon,
  personas: [...],      // Personatges amb system prompt, dificultat, colors
  checklist: [...],     // Ítems d'avaluació per fases
  phaseNames: {...},    // Noms de cada fase
  phaseColors: {...},   // Colors per fase
}
```
La DB (`formations` table) guarda metadades. El contingut viu als fitxers JS.

Per afegir una formació nova:
1. Crear `src/formations/nova.js` amb l'estructura anterior
2. Registrar a `src/formations/index.js`
3. `INSERT INTO formations (slug, name, description)` a la DB

## Endpoints del servidor

### Serveis IA
| Mètode | Ruta | Descripció |
|--------|------|-----------|
| GET | `/api/services-status` | Quins serveis SaaS estan configurats |
| POST | `/api/messages` | Proxy a l'API de Claude |
| POST | `/api/tts` | Proxy streaming a ElevenLabs (PCM16 @ 16kHz) |
| POST | `/api/deepgram-token` | JWT temporal per WebSocket directe |
| POST | `/api/simli-token` | Session token Simli |

### Auth
| Mètode | Ruta | Descripció |
|--------|------|-----------|
| POST | `/api/auth/google` | Login amb Google OAuth |
| GET | `/api/auth/me` | Usuari actual + organitzacions |

### Admin (requireAdmin)
| Mètode | Ruta | Descripció |
|--------|------|-----------|
| GET/POST/PATCH/DELETE | `/api/admin/organizations` | CRUD organitzacions |
| GET/POST | `/api/admin/organizations/:id/members` | Membres d'una org |
| PATCH/DELETE | `/api/admin/organizations/:orgId/members/:userId` | Gestió membre |
| GET/PUT | `/api/admin/organizations/:id/formations` | Formacions d'una org |
| GET/PUT | `/api/admin/users/:id/organizations` | Membresies d'un usuari |
| GET | `/api/formations` | Llista formacions actives |

### Sessions
| Mètode | Ruta | Descripció |
|--------|------|-----------|
| GET/POST | `/api/admin/sessions` | CRUD sessions (org_id + formation_slug) |
| GET | `/api/sessions/active` | Sessió activa (filtrada per org membership) |

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
npm run migrate  # Executar migracions SQL pendents
```

## Deploy (CI/CD)

GitHub Actions (`.github/workflows/deploy.yml`): cada push a `main` executa migracions i desplega a Vercel.

**Secrets requerits a GitHub (Repository secrets):**
- `DATABASE_URL` — Connection string PostgreSQL
- `VERCEL_TOKEN` — Token personal de Vercel
- `VERCEL_ORG_ID` — ID organització Vercel
- `VERCEL_PROJECT_ID` — ID projecte Vercel

## Docker

```bash
docker build -t simulador-requeriments .
docker run -p 3000:3000 --env-file .env simulador-requeriments
```

## Convencions

- Frontend modularitzat: hooks/, components/, formations/, data.js, api.js
- Inline styles (no CSS extern)
- Hooks SaaS i fallback tenen la mateixa interfície per intercanvi transparent
- Cada persona té `faceId` (Simli) i `voiceId` (ElevenLabs) definits a la formació
- Formacions com a fitxers JS bundlejats (no a DB), amb registre a `formations/index.js`
- Components reben dades de formació via props (phaseNames, phaseColors, checklist)
- Avatar.jsx usa propietats genèriques (hairStyle, hasGlasses) en lloc de checks per persona.id
- L'avaluació es desencadena amb "ja tinc tota la informació" o el botó "Avaluar"
- Totes les claus API passen pel proxy de server.js
- Sessions amb organization_id=NULL són "lliures" (accessibles per tothom)
- Sessions amb organization_id filtren per membership de l'usuari

## Seguretat

- `.env` al `.gitignore` — mai comitejar claus
- El servidor carrega `.env` manualment (sense dotenv)
- Auth: Google OAuth 2.0 → JWT signat amb JWT_SECRET
- Deepgram: JWT temporal (120s TTL) per al client
- Simli: session token via endpoint del servidor
- Rols: super-admin (global) > org admin > org professor > org alumne
