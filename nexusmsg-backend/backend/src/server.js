// NexusMsg backend — matches the 5-step wizard frontend.
// Run: npm install && npm start  (Node 18+)
//
// Endpoints
//   POST /api/session                          -> { sessionId }
//   POST /api/session/:id/recipients           -> { count }   body: { numbers: string[] }  OR  multipart 'file' (.json)
//   POST /api/session/:id/messages             -> { messages } multipart: messages[] JSON + files[]
//   GET  /api/session/:id/qr           (SSE)   -> events: qr | connected | error
//   POST /api/session/:id/start                -> { started: true }
//   GET  /api/session/:id/progress     (SSE)   -> events: sent | not_wa | failed | done
//   GET  /api/session/:id/results              -> { total, sent[], notWa[], failed[] }
//   GET  /api/session/:id/export/:kind         -> text/plain (kind = success|failed|not-whatsapp)

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { create } from '@wppconnect-team/wppconnect';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.resolve('./uploads');
const SESSION_DIR = path.resolve('./sessions');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(SESSION_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 50 * 1024 * 1024 } });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------- session store ------------------------- */
/**
 * session = {
 *   id, recipients: string[], messages: [{type, text?, filePath?, mime?, fileName?}],
 *   client: WPPClient|null, qr: string|null, connected: bool,
 *   bus: EventEmitter, status: 'idle'|'sending'|'done'|'aborted',
 *   results: { sent: string[], notWa: string[], failed: {number,reason}[] }
 * }
 */
const sessions = new Map();

function getSession(id) {
  const s = sessions.get(id);
  if (!s) throw Object.assign(new Error('Session not found'), { status: 404 });
  return s;
}

function newSession() {
  const id = randomUUID();
  const s = {
    id,
    recipients: [],
    messages: [],
    client: null,
    qr: null,
    connected: false,
    bus: new EventEmitter(),
    status: 'idle',
    results: { sent: [], notWa: [], failed: [] },
  };
  s.bus.setMaxListeners(50);
  sessions.set(id, s);
  return s;
}

/* ------------------------- SSE helper ---------------------------- */
function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  return { send, close: () => clearInterval(ping) };
}

/* ------------------------- routes -------------------------------- */

app.get('/', (_req, res) => res.send('📨 NexusMsg backend ready'));

// 1) create a session
app.post('/api/session', (_req, res) => {
  const s = newSession();
  res.json({ sessionId: s.id });
});

// 2) recipients — JSON body or uploaded .json file
app.post('/api/session/:id/recipients', upload.single('file'), (req, res) => {
  try {
    const s = getSession(req.params.id);
    let numbers = [];
    if (req.file) {
      const raw = fs.readFileSync(req.file.path, 'utf-8');
      fs.unlinkSync(req.file.path);
      const parsed = JSON.parse(raw);
      numbers = Array.isArray(parsed) ? parsed : parsed.numbers ?? [];
    } else if (Array.isArray(req.body?.numbers)) {
      numbers = req.body.numbers;
    }
    numbers = numbers.map((n) => String(n).trim()).filter(Boolean);
    s.recipients = numbers;
    res.json({ count: numbers.length });
  } catch (e) {
    res.status(e.status ?? 400).json({ error: e.message });
  }
});

// 3) messages — multipart: messages (JSON string) + files[]
app.post('/api/session/:id/messages', upload.array('files'), (req, res) => {
  try {
    const s = getSession(req.params.id);
    const meta = JSON.parse(req.body.messages ?? '[]'); // [{id,type,text?,fileKey?}]
    const filesByName = Object.fromEntries((req.files ?? []).map((f) => [f.originalname, f]));
    s.messages = meta.map((m) => {
      if (m.type === 'text') return { type: 'text', text: m.text ?? '' };
      const f = filesByName[m.fileName];
      if (!f) throw new Error(`Missing file for message: ${m.fileName}`);
      return { type: m.type, filePath: f.path, mime: f.mimetype, fileName: f.originalname };
    });
    res.json({ messages: s.messages.length });
  } catch (e) {
    res.status(e.status ?? 400).json({ error: e.message });
  }
});

// 4) QR + connection stream
app.get('/api/session/:id/qr', async (req, res) => {
  let s;
  try { s = getSession(req.params.id); } catch (e) { return res.status(404).end(); }
  const { send, close } = sse(res);

  // already connected? short-circuit
  if (s.connected) { send('connected', { ok: true }); }

  const onQr = (qr) => send('qr', { qr });
  const onConnected = () => send('connected', { ok: true });
  const onError = (msg) => send('error', { message: msg });
  s.bus.on('qr', onQr);
  s.bus.on('connected', onConnected);
  s.bus.on('error', onError);
  if (s.qr) send('qr', { qr: s.qr });

  // lazy-create the wppconnect client on first QR request
  if (!s.client && !s.connected) {
    try {
      const client = await create({
        session: `session-${s.id}`,
        autoClose: 0,
        headless: true,
        useChrome: true,
        catchQR: (base64Qrimg) => {
          s.qr = base64Qrimg; // data:image/png;base64,...
          s.bus.emit('qr', s.qr);
        },
        statusFind: (status) => {
          if (['isLogged', 'inChat', 'CONNECTED'].includes(status)) {
            s.connected = true;
            s.bus.emit('connected');
          }
        },
        puppeteerOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        },
      });
      s.client = client;
      client.onStateChange(async (state) => {
        if (state === 'CONFLICT') await client.useHere();
        if (state === 'UNPAIRED') { s.connected = false; }
      });
    } catch (err) {
      s.bus.emit('error', err.message ?? String(err));
    }
  }

  req.on('close', () => {
    s.bus.off('qr', onQr);
    s.bus.off('connected', onConnected);
    s.bus.off('error', onError);
    close();
  });
});

// 5) start sending
app.post('/api/session/:id/start', async (req, res) => {
  try {
    const s = getSession(req.params.id);
    if (!s.connected || !s.client) return res.status(400).json({ error: 'Not connected' });
    if (s.status === 'sending') return res.status(409).json({ error: 'Already sending' });
    if (!s.recipients.length) return res.status(400).json({ error: 'No recipients' });
    if (!s.messages.length) return res.status(400).json({ error: 'No messages' });

    s.status = 'sending';
    s.results = { sent: [], notWa: [], failed: [] };
    res.json({ started: true });
    runCampaign(s).catch((err) => s.bus.emit('error', err.message ?? String(err)));
  } catch (e) {
    res.status(e.status ?? 400).json({ error: e.message });
  }
});

// 6) progress stream
app.get('/api/session/:id/progress', (req, res) => {
  let s;
  try { s = getSession(req.params.id); } catch { return res.status(404).end(); }
  const { send, close } = sse(res);

  // replay current results so a reconnecting client catches up
  s.results.sent.forEach((n) => send('sent', { number: n }));
  s.results.notWa.forEach((n) => send('not_wa', { number: n, reason: 'Not on WhatsApp' }));
  s.results.failed.forEach((f) => send('failed', f));
  if (s.status === 'done') send('done', summarize(s));

  const handlers = {
    sent: (d) => send('sent', d),
    not_wa: (d) => send('not_wa', d),
    failed: (d) => send('failed', d),
    done: (d) => send('done', d),
  };
  for (const [k, fn] of Object.entries(handlers)) s.bus.on(k, fn);
  req.on('close', () => {
    for (const [k, fn] of Object.entries(handlers)) s.bus.off(k, fn);
    close();
  });
});

// 7) results JSON + exports
app.get('/api/session/:id/results', (req, res) => {
  try { res.json(summarize(getSession(req.params.id))); }
  catch (e) { res.status(e.status ?? 404).json({ error: e.message }); }
});

app.get('/api/session/:id/export/:kind', (req, res) => {
  try {
    const s = getSession(req.params.id);
    const kind = req.params.kind;
    let lines = [];
    if (kind === 'success') lines = s.results.sent;
    else if (kind === 'not-whatsapp') lines = s.results.notWa;
    else if (kind === 'failed') lines = s.results.failed.map((f) => `${f.number}\t${f.reason}`);
    else return res.status(400).json({ error: 'Unknown export kind' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}.txt"`);
    res.send(lines.join('\n'));
  } catch (e) {
    res.status(e.status ?? 404).json({ error: e.message });
  }
});

/* ------------------------- campaign engine ----------------------- */

function summarize(s) {
  return {
    total: s.recipients.length,
    sent: s.results.sent,
    notWa: s.results.notWa,
    failed: s.results.failed,
    status: s.status,
  };
}

async function sendOne(client, chatId, msg) {
  if (msg.type === 'text') return client.sendText(chatId, msg.text);
  if (msg.type === 'image') return client.sendImage(chatId, msg.filePath, msg.fileName, '');
  if (msg.type === 'video') return client.sendFile(chatId, msg.filePath, msg.fileName, '');
  if (msg.type === 'audio') return client.sendVoice(chatId, msg.filePath);
  throw new Error(`Unsupported message type: ${msg.type}`);
}

async function runCampaign(s) {
  const PER_NUMBER_DELAY_MS = Number(process.env.PER_NUMBER_DELAY_MS ?? 30000);
  const BETWEEN_MSG_DELAY_MS = Number(process.env.BETWEEN_MSG_DELAY_MS ?? 1500);

  for (const raw of s.recipients) {
    if (s.status === 'aborted') break;
    const chatId = raw.includes('@c.us') ? raw : `${raw.replace(/[^\d]/g, '')}@c.us`;
    try {
      const status = await s.client.checkNumberStatus(chatId);
      if (!status?.canReceiveMessage) {
        s.results.notWa.push(raw);
        s.bus.emit('not_wa', { number: raw, reason: 'Not on WhatsApp' });
        continue;
      }
      for (const msg of s.messages) {
        await sendOne(s.client, chatId, msg);
        await delay(BETWEEN_MSG_DELAY_MS);
      }
      s.results.sent.push(raw);
      s.bus.emit('sent', { number: raw });
      await delay(PER_NUMBER_DELAY_MS);
    } catch (err) {
      const reason = err?.message ?? String(err);
      s.results.failed.push({ number: raw, reason });
      s.bus.emit('failed', { number: raw, reason });
    }
  }
  s.status = 'done';
  s.bus.emit('done', summarize(s));
}

/* ------------------------- abort + shutdown ---------------------- */

app.post('/api/session/:id/stop', (req, res) => {
  try {
    const s = getSession(req.params.id);
    s.status = 'aborted';
    res.json({ stopped: true });
  } catch (e) { res.status(404).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`🚀 NexusMsg backend → http://localhost:${PORT}`));
