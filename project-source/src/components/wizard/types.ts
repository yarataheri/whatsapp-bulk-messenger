export type MessageType = "text" | "image" | "video" | "audio";

export interface CampaignMessage {
  id: string;
  type: MessageType;
  text?: string;
  fileName?: string;
  file?: File;
}

export type RecipientMode = "json" | "manual";

export interface LogEntry {
  id: number;
  status: "sent" | "failed" | "not_wa";
  number: string;
  reason?: string;
  ts: string;
}

export interface CampaignResult {
  total: number;
  sent: string[];
  notWa: string[];
  failed: { number: string; reason: string }[];
}
