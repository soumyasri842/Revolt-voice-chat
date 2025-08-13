
/**
 * Revolt Motors voice assistant clone (server-to-server)
 * Node/Express + WebSocket proxy for Gemini Live API
 *
 * SECURITY: API key stays on the server. Browser connects only to /live on this server.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';

const app = express();
const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.ORIGIN || '*';

app.use(helmet());
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_, res) => res.json({ ok: true }));

const httpServer = app.listen(PORT, () => {
  console.log(`HTTP server on http://localhost:${PORT}`);
});

/**
 * WebSocket proxy: ws://localhost:8080/live  <->  wss://generativelanguage.googleapis.com/ws?...&key=...
 */
const wss = new WebSocketServer({ server: httpServer, path: '/live' });

wss.on('connection', (client) => {
  console.log('Client connected to /live');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    client.close(1011, 'Missing GOOGLE_API_KEY on server');
    return;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-native-audio-dialog';
  const upstreamURL = `wss://generativelanguage.googleapis.com/ws?model=${encodeURIComponent(model)}&key=${encodeURIComponent(apiKey)}`;

  const upstream = new WebSocket(upstreamURL);
  let opened = false;

  upstream.on('open', () => {
    opened = true;
    console.log('Upstream (Gemini Live) opened');

    // Initial session configuration: Revolt-only system prompt and audio params
    const systemInstruction = {
      parts: [{
        text: "You are Rev, the official voice assistant for Revolt Motors. " +
              "Only discuss Revolt products and services: RV400, RV400 BRZ, booking, pricing, finance, test rides, servicing, warranty, charging, specifications, dealership & service locations, and the MyRevolt app. " +
              "If users ask about other brands or topics, politely refuse and bring the conversation back to Revolt. " +
              "Speak concisely, be friendly, and support English, Hindi, and regional Indian languages when requested."
      }]
    };

    const sessionUpdate = {
      type: 'session.update',
      session: {
        turnTruncation: { maxTurns: 8 },
        systemInstruction,
        response: {
          modalities: ['AUDIO', 'TEXT'],
          audioFormat: { container: 'RAW', encoding: 'LINEAR16', sampleRateHz: 24000 }
        },
        tts: { voice: process.env.VOICE || 'charon', languageCode: process.env.LANGUAGE_CODE || 'en-US' },
        interrupt: { enableUserInterruptions: true }
      }
    };
    upstream.send(JSON.stringify(sessionUpdate));
  });

  // Relay: client -> upstream
  client.on('message', (data, isBinary) => {
    if (opened && upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    }
  });

  // Relay: upstream -> client
  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  const closeBoth = (code, reason) => {
    try { client.close(code, reason?.toString() || ''); } catch {}
    try { upstream.close(code, reason?.toString() || ''); } catch {}
  };

  upstream.on('close', (code, reason) => {
    console.log('Upstream closed', code, reason?.toString());
    closeBoth(code, reason);
  });
  upstream.on('error', (err) => {
    console.error('Upstream error', err);
    closeBoth(1011, 'Upstream error');
  });

  client.on('close', (code, reason) => {
    console.log('Client closed', code, reason?.toString());
    try { upstream.close(code, reason?.toString() || ''); } catch {}
  });
  client.on('error', (err) => {
    console.error('Client error', err);
    try { upstream.close(1011, 'Client error'); } catch {}
  });
});
