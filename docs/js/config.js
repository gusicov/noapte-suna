// Where the room server lives. When the page is opened from the server itself
// (local dev or the Render URL) it just uses the same address.
const RENDER_URL = 'https://noapte-suna.onrender.com';

const qs = new URLSearchParams(location.search);
export const SERVER = (qs.get('server') || (location.hostname.endsWith('github.io') ? RENDER_URL : location.origin)).replace(/\/$/, '');
export const ROOM_FROM_URL = (qs.get('room') || '').toUpperCase().slice(0, 4);
