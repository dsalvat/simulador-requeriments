import { getFormation } from './formations/index.js';

// Re-export formació per defecte per retrocompatibilitat
const defaultFormation = getFormation('requeriments');

export const PERSONAS = defaultFormation.personas;
export const CHECKLIST = defaultFormation.checklist;
export const PHASE_NAMES = defaultFormation.phaseNames;
export const PHASE_COLORS = defaultFormation.phaseColors;

export const COST_RATES = {
  anthropic: { inputPerMToken: 3.0, outputPerMToken: 15.0, unit: 'tokens' },
  elevenlabs: { perKChars: 0.15, unit: 'car\u00e0cters' },
  deepgram: { perMinute: 0.0043, unit: 'minuts' },
  simli: { perMinute: 0.01, unit: 'minuts' }
};
