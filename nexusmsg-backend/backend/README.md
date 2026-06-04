# NexusMsg backend

Drop-in replacement for your old `wppconnect` script, wired to the 5-step wizard UI.

## Install & run
```bash
npm install
npm start          # http://localhost:3000
```

Optional `.env`:
```
PORT=3000
PER_NUMBER_DELAY_MS=30000     # anti-ban delay between recipients
BETWEEN_MSG_DELAY_MS=1500     # delay between messages in the sequence
```

## How the wizard maps to endpoints

| Wizard step | HTTP call |
|---|---|
| 1. Recipients | `POST /api/session` → `POST /api/session/:id/recipients` (JSON body `{numbers:[]}` or upload `file=*.json`) |
| 2. Messages   | `POST /api/session/:id/messages` (multipart: `messages` JSON + `files[]`) |
| 3. Connect    | `GET /api/session/:id/qr` (SSE: `qr`, `connected`) |
| 4. Sending    | `POST /api/session/:id/start` + `GET /api/session/:id/progress` (SSE: `sent`, `not_wa`, `failed`, `done`) |
| 5. Results    | `GET /api/session/:id/results` + `GET /api/session/:id/export/:kind` (`success` \| `failed` \| `not-whatsapp`) |

The message sequence supports `text`, `image`, `video`, `audio` — each recipient receives them in order.
