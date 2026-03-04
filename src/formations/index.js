import requeriments from './requeriments.js';
// Futures formacions:
// import comunicacio from './comunicacio.js';
// import conflictes from './conflictes.js';

const FORMATIONS = { requeriments };

export default FORMATIONS;

export function getFormation(slug) {
  return FORMATIONS[slug] || FORMATIONS.requeriments;
}
