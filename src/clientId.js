const KEY = '__simulador_client_id';
let id = sessionStorage.getItem(KEY);
if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(KEY, id); }
export const CLIENT_ID = id;
