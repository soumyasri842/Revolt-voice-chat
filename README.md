# Rev Voice — Gemini Live (Server-to-Server, Node/Express)

A minimal replica of the Revolt Motors voice assistant using **Gemini Live API** with **server-to-server** architecture.

## Features
- Realtime audio dialog (push-to-talk + tap-to-talk)
- **Interruptions** (`response.cancel`) while the bot is speaking
- Low-latency streaming audio (RAW PCM 24kHz)
- System prompt constrained to **Revolt Motors–only** topics
- Server-side API key; client only talks to your Node server

## Stack
- Backend: Node.js + Express + ws (WebSocket proxy to Gemini Live)
- Frontend: Vanilla HTML/CSS/JS + Web Audio API

## Prereqs
- Node.js 18+
- Free API key from https://aistudio.google.com (AI Studio)

## Setup
```bash
git clone <your-repo-url>
cd revolt-gemini-live/server
cp .env.example .env
# edit .env: GOOGLE_API_KEY=..., optional VOICE/LANGUAGE_CODE
npm install
npm run start
```

In another terminal:
```bash
# serve the static client with any static server, or open index.html
cd ../client
# for quick serve you can use VS Code Live Server or:
# npx http-server -p 5173 .
```

Open the client at http://localhost:5173 and set **Server WS** to `ws://localhost:8080/live`, then **Connect**.

## Models
- Default: `gemini-2.5-flash-preview-native-audio-dialog` (strict free-tier limits)
- Dev options: `gemini-2.0-flash-live-001`, `gemini-live-2.5-flash-preview`

You can switch models by editing `server/.env` (GEMINI_MODEL).

## Interruption
Click **Interrupt** to send `{type:"response.cancel"}` to Gemini Live, cancelling current TTS and enabling immediate barge-in.

## Languages
Change **Lang** (e.g., `hi-IN`, `en-IN`, `te-IN`) and **Voice** then click **Connect** (or send a Session Update after).

## System Instructions (prompt)
```
You are Rev, the official voice assistant for Revolt Motors. Only discuss Revolt products and services: RV400, RV400 BRZ, booking, pricing, finance, test rides, servicing, warranty, charging, specifications, dealership & service locations, and the MyRevolt app. If users ask about other brands or topics, politely refuse and bring the conversation back to Revolt. Speak concisely, be friendly, and support English, Hindi, and regional Indian languages when requested.
```

## Demo video
- Record 30–60s: connect, ask a question, **interrupt**, ask in another language, show latency.

## Notes
- Free tier has request/day limits; use a dev model for testing.
- This is a starter; production needs auth, logging, retries, and better audio handling.
