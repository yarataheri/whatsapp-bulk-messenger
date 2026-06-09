// nexusmsg-backend/backend/src/server.js
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const wppconnect = require("@wppconnect-team/wppconnect");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({ dest: path.join(__dirname, "..", "uploads") });
const PORT = process.env.PORT || 8787;

// ---------------- session store ----------------
/**
 * sessions: Map<sessionId, {
 *   client: WppClient|null,
 *   ready: boolean,
 *   lastQr: string|null,           // data:image/png;base64,...
 *   qrIssuedAt: number|null,       // ms
 *   qrTtlSeconds: number,          // wppconnect autoClose-ish
 *   state: string,                 // human label
 *   recipients: string[],
 *   messages: Array<{type,text?,fileName?,filePath?}>,
 *   progress: { sent:0, failed:0, notWa:0, total:0 },
 *   results:  { success:[], failed:[], notWa:[] },
 *   subs: { qr:Set<res>, progress:Set<res> },
 *   running: boolean,
 *   stopRequested: boolean,
 * }>
 */
const sessions = new Map();

function getSession(id) {
  return sessions.get(id) || null;
}
function newSession() {
  const id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  sessions.set(id, {
    client: null,
    ready: false,
    lastQr: null,
    qrIssuedAt: null,
    qrTtlSeconds: 40,
    state: "Starting WhatsApp session…",
    recipients: [],
    messages: [],
    progress: { sent: 0, failed: 0, notWa: 0, total: 0 },
    results: { success: [], failed: [], notWa: [] },
    subs: { qr: new Set(), progress: new Set() },
    running: false,
    stopRequested: false,
  });
  return id;
}

// ---------------- SSE helpers ----------------
function sseInit(res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
}
function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function broadcast(set, event, data) {
  for (const res of set) {
    try { sseSend(res, event, data); } catch { /* ignore */ }
  }
}

function remainingQrSeconds(s) {
  if (!s.qrIssuedAt) return null;
  const elapsed = Math.floor((Date.now() - s.qrIssuedAt) / 1000);
  return Math.max(0, s.qrTtlSeconds - elapsed);
}

// ---------------- WhatsApp bootstrap ----------------
async function startWppSession(sessionId) {
  const s = getSession(sessionId);
  if (!s) return;

  const client = await wppconnect.create({
    session: sessionId,
    headless: true,
    logQR: true,                    // <-- prints QR in the terminal
    autoClose: 0,                   // we manage the timer ourselves
    disableWelcome: true,
    updatesLog: false,
    puppeteerOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },

    catchQR: (base64Qr, _asciiQR, attempts /*, urlCode */) => {
      // base64Qr from wppconnect already includes the data: prefix
      const dataUrl = base64Qr.startsWith("data:")
        ? base64Qr
        : `data:image/png;base64,${base64Qr}`;
      s.lastQr = dataUrl;
      s.qrIssuedAt = Date.now();
      s.qrTtlSeconds = 40;          // refresh window
      s.ready = false;
      s.state = `QR ready — scan it in WhatsApp (attempt ${attempts})`;
      broadcast(s.subs.qr, "qr", {
        qr: dataUrl,
        state: s.state,
        expiresIn: s.qrTtlSeconds,
      });
    },

    statusFind: (status) => {
      s.state = `Status: ${status}`;
      const okStates = ["inChat", "isLogged", "chatsAvailable", "successChat"];
      const badStates = ["notLogged", "browserClose", "qrReadFail", "autocloseCalled", "desconnectedMobile"];
      if (okStates.includes(status)) {
        s.ready = true;
        s.lastQr = null;
        s.qrIssuedAt = null;
        s.state = "Connected — ready to start sending";
        broadcast(s.subs.qr, "connected", { state: s.state });
      } else if (badStates.includes(status)) {
        s.ready = false;
        broadcast(s.subs.qr, "state", { state: `Not connected: ${status}`, connected: false });
      } else {
        broadcast(s.subs.qr, "state", { state: s.state, connected: s.ready });
      }
    },
  });

  s.client = client;

  client.onStateChange((state) => {
    s.state = `State: ${state}`;
    if (state === "CONNECTED") {
      s.ready = true;
      s.lastQr = null;
      s.qrIssuedAt = null;
      s.state = "Connected — ready to start sending";
      broadcast(s.subs.qr, "connected", { state: s.state });
    } else if (["UNPAIRED", "UNPAIRED_IDLE", "CONFLICT", "UNLAUNCHED"].includes(state)) {
      s.ready = false;
      broadcast(s.subs.qr, "state", { state: `Disconnected: ${state}`, connected: false });
    } else {
      broadcast(s.subs.qr, "state", { state: s.state, connected: s.ready });
    }
  });
}

// Tick the QR countdown every second to all qr subscribers
setInterval(() => {
  for (const s of sessions.values()) {
    if (s.ready || !s.qrIssuedAt) continue;
    const eta = remainingQrSeconds(s);
    broadcast(s.subs.qr, "state", { etaSeconds: eta, state: s.state, connected: false });
  }
}, 1000);

// ---------------- routes ----------------
app.post("/api/session", async (_req, res) => {
  const id = newSession();
  res.json({ sessionId: id });
  startWppSession(id).catch((err) => {
    console.error("wpp start failed:", err);
    const s = getSession(id);
    if (s) {
      s.state = `Failed to start: ${err.message}`;
      broadcast(s.subs.qr, "error", { message: s.state });
    }
  });
});

app.get("/api/session/:id/qr", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).end();
  sseInit(res);
  s.subs.qr.add(res);

  // replay current state to late subscriber
  if (s.ready) {
    sseSend(res, "connected", { state: s.state });
  } else if (s.lastQr) {
    sseSend(res, "qr", {
      qr: s.lastQr,
      state: s.state,
      expiresIn: remainingQrSeconds(s),
    });
  } else {
    sseSend(res, "state", { state: s.state, connected: false });
  }

  req.on("close", () => s.subs.qr.delete(res));
});

app.post("/api/session/:id/recipients", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: "session not found" });
  const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
  s.recipients = numbers.map(String);
  res.json({ count: s.recipients.length });
});

app.post("/api/session/:id/messages", upload.array("files"), (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: "session not found" });
  let meta = [];
  try { meta = JSON.parse(req.body.messages || "[]"); }
  catch { return res.status(400).json({ error: "invalid messages json" }); }
  const files = req.files || [];
  let fi = 0;
  s.messages = meta.map((m) => {
    if (m.type === "text") return { type: "text", text: m.text || "" };
    const f = files[fi++];
    return { type: m.type, fileName: m.fileName, filePath: f?.path };
  });
  res.json({ messages: s.messages.length });
});

app.get("/api/session/:id/progress", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).end();
  sseInit(res);
  s.subs.progress.add(res);
  sseSend(res, "progress", s.progress);
  req.on("close", () => s.subs.progress.delete(res));
});

app.post("/api/session/:id/start", async (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: "session not found" });
  if (!s.client || !s.ready) return res.status(409).json({ error: "WhatsApp is not connected yet" });
  if (s.running) return res.status(409).json({ error: "already running" });

  s.running = true;
  s.stopRequested = false;
  s.progress = { sent: 0, failed: 0, notWa: 0, total: s.recipients.length };
  s.results = { success: [], failed: [], notWa: [] };
  broadcast(s.subs.progress, "progress", s.progress);
  res.json({ started: true });

  (async () => {
    for (const raw of s.recipients) {
      if (s.stopRequested) break;
      const number = String(raw).replace(/[^\d]/g, "");
      const chatId = `${number}@c.us`;
      try {
        const check = await s.client.checkNumberStatus(chatId);
        if (!check?.numberExists) {
          s.progress.notWa++;
          s.results.notWa.push(number);
        } else {
          for (const m of s.messages) {
            if (m.type === "text") {
              await s.client.sendText(chatId, m.text || "");
            } else if (m.type === "image" && m.filePath) {
              await s.client.sendImage(chatId, m.filePath, m.fileName || "image", "");
            } else if (m.type === "audio" && m.filePath) {
              await s.client.sendVoice(chatId, m.filePath);
            } else if (m.filePath) {
              await s.client.sendFile(chatId, m.filePath, m.fileName || "file", "");
            }
          }
          s.progress.sent++;
          s.results.success.push(number);
        }
      } catch (err) {
        s.progress.failed++;
        s.results.failed.push({ number, error: err?.message || String(err) });
      }
      broadcast(s.subs.progress, "progress", s.progress);
    }
    s.running = false;
    broadcast(s.subs.progress, "done", s.results);
  })().catch((err) => {
    console.error("send loop failed:", err);
    s.running = false;
    broadcast(s.subs.progress, "error", { message: err.message });
  });
});

app.post("/api/session/:id/stop", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).json({ error: "session not found" });
  s.stopRequested = true;
  res.json({ stopping: true });
});

app.get("/api/session/:id/export/:kind", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) return res.status(404).end();
  const kind = req.params.kind;
  let rows = [];
  if (kind === "success")        rows = [["number"], ...s.results.success.map((n) => [n])];
  else if (kind === "failed")    rows = [["number","error"], ...s.results.failed.map((r) => [r.number, r.error])];
  else if (kind === "not-whatsapp") rows = [["number"], ...s.results.notWa.map((n) => [n])];
  else return res.status(400).end();
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  res.set({ "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${kind}.csv"` });
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`NexusMsg backend listening on http://localhost:${PORT}`);
});
