import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import EventSource from 'eventsource';

const RT_PORT = process.env.RT_PORT || 4002;     // ★ new port, distinct from 8001
const SSE_URL = process.env.SSE_URL || 'https://zatint1991.com/api/sse/events'; // read-only

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  cors: { origin: '*' }
});

function startBridge(){
  let es = new EventSource(SSE_URL);
  let retries = 2000; // 2s start

  console.log('[RT] SSE bridge →', SSE_URL);

  es.onmessage = (ev) => {
    try { io.emit('kintai:update', JSON.parse(ev.data)); }
    catch { io.emit('kintai:update', { type:'message', data: ev.data }); }
  };

  es.onerror = () => {
    console.error('[RT] SSE error, reconnect...');
    try { es.close(); } catch {}
    setTimeout(startBridge, retries);
    retries = Math.min(30000, Math.floor(retries * 1.5));
  };
}

startBridge();

// optional health
app.get('/api/ping', (_req,res)=> res.json({ ok:true, time:new Date().toISOString() }));

server.listen(RT_PORT, () => {
  console.log(`[RT] Realtime bridge on :${RT_PORT}`);
});

