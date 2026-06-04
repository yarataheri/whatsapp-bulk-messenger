// Talks to the NexusMsg Node.js backend (default: http://localhost:3000).
// Override via Vite env: VITE_WA_API_BASE=https://my-host:3000
import type { CampaignMessage } from "@/components/wizard/types";

export const API_BASE =
  (import.meta.env.VITE_WA_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:3000";

async function jsonOrThrow<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.text().catch(() => "")) || `HTTP ${r.status}`);
  return r.json();
}

export async function createSession(): Promise<string> {
  const { sessionId } = await jsonOrThrow<{ sessionId: string }>(
    await fetch(`${API_BASE}/api/session`, { method: "POST" }),
  );
  return sessionId;
}

export async function uploadRecipients(sessionId: string, numbers: string[]) {
  return jsonOrThrow<{ count: number }>(
    await fetch(`${API_BASE}/api/session/${sessionId}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers }),
    }),
  );
}

export async function uploadMessages(sessionId: string, messages: CampaignMessage[]) {
  const fd = new FormData();
  const meta = messages.map((m) => {
    if (m.type === "text") return { type: "text", text: m.text ?? "" };
    if (!m.file) throw new Error(`Message "${m.fileName}" is missing its file.`);
    fd.append("files", m.file, m.fileName);
    return { type: m.type, fileName: m.fileName };
  });
  fd.append("messages", JSON.stringify(meta));
  return jsonOrThrow<{ messages: number }>(
    await fetch(`${API_BASE}/api/session/${sessionId}/messages`, { method: "POST", body: fd }),
  );
}

export async function startCampaign(sessionId: string) {
  return jsonOrThrow<{ started: boolean }>(
    await fetch(`${API_BASE}/api/session/${sessionId}/start`, { method: "POST" }),
  );
}

export async function stopCampaign(sessionId: string) {
  return fetch(`${API_BASE}/api/session/${sessionId}/stop`, { method: "POST" });
}

export function exportUrl(sessionId: string, kind: "success" | "failed" | "not-whatsapp") {
  return `${API_BASE}/api/session/${sessionId}/export/${kind}`;
}

/** Subscribe to an SSE endpoint. Returns a cleanup fn. */
export function sse(
  sessionId: string,
  path: "qr" | "progress",
  handlers: Record<string, (data: any) => void>,
): () => void {
  const es = new EventSource(`${API_BASE}/api/session/${sessionId}/${path}`);
  for (const [event, fn] of Object.entries(handlers)) {
    es.addEventListener(event, (e) => {
      try { fn(JSON.parse((e as MessageEvent).data)); } catch { /* ignore */ }
    });
  }
  return () => es.close();
}
