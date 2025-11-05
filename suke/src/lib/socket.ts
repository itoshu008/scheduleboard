import { io, Socket } from 'socket.io-client';
let s: Socket | null = null;
export function socket() {
  if (!s) s = io({ path: '/socket.io', transports: ['websocket'] });
  return s;
}

