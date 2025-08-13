
import { workletURL } from './worklet.js';

const qs = (s) => document.querySelector(s);
const logEl = qs('#log');

function log(text, who='sys') {
  const d = document.createElement('div');
  d.className = 'entry';
  const tag = `<span class="tag">${who}</span>`;
  d.innerHTML = tag + text;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
}

// PCM helpers
function floatTo16BitPCM(f32) {
  const buf = new ArrayBuffer(f32.length * 2);
  const view = new DataView(buf);
  let offset = 0;
  for (let i = 0; i < f32.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, f32[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

let ws = null;
let audioCtx = null;
let mediaStream = null;
let sourceNode = null;
let workletNode = null;
let talking = false;
let playing = false;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

async function startMic() {
  const ctx = ensureAudio();
  await ctx.audioWorklet.addModule(workletURL);
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  sourceNode = ctx.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(ctx, 'downsampler');
  workletNode.port.onmessage = (e) => {
    if (talking && ws && ws.readyState === WebSocket.OPEN) {
      const pcm = floatTo16BitPCM(new Float32Array(e.data));
      ws.send(pcm);
    }
  };
  sourceNode.connect(workletNode);
  // Keep worklet alive with a silent gain -> destination
  const gain = ctx.createGain(); gain.gain.value = 0.0;
  workletNode.connect(gain); gain.connect(ctx.destination);
}

function stopMic() {
  if (sourceNode) sourceNode.disconnect();
  if (workletNode) workletNode.disconnect();
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  sourceNode = null; workletNode = null; mediaStream = null;
}

function playPcm24k(buffer) {
  const ctx = ensureAudio();
  const sr = 24000;
  const i16 = new Int16Array(buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
  const ab = ctx.createBuffer(1, f32.length, sr);
  ab.getChannelData(0).set(f32);
  const src = ctx.createBufferSource();
  src.buffer = ab;
  src.connect(ctx.destination);
  playing = true;
  src.onended = () => { playing = false; };
  src.start();
}

function sendSessionUpdate() {
  const voice = qs('#voice').value.trim() || 'charon';
  const languageCode = qs('#lang').value.trim() || 'en-US';
  const msg = {
    type: 'session.update',
    session: {
      response: { modalities: ['AUDIO','TEXT'], audioFormat: { container: 'RAW', encoding: 'LINEAR16', sampleRateHz: 24000 } },
      tts: { voice, languageCode },
      interrupt: { enableUserInterruptions: true }
    }
  };
  ws.send(JSON.stringify(msg));
}

qs('#connect').onclick = async () => {
  const url = qs('#serverUrl').value.trim();
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  ws.onopen = async () => {
    qs('#wsStatus').textContent = 'connected';
    qs('#disconnect').disabled = false;
    qs('#holdToTalk').disabled = false;
    qs('#tapToTalk').disabled = false;
    qs('#interrupt').disabled = false;
    await startMic();
    sendSessionUpdate();
    log('Connected to server', 'sys');
  };
  ws.onclose = () => {
    qs('#wsStatus').textContent = 'disconnected';
    qs('#disconnect').disabled = true;
    qs('#holdToTalk').disabled = true;
    qs('#tapToTalk').disabled = true;
    qs('#interrupt').disabled = true;
    stopMic();
    log('Disconnected', 'sys');
  };
  ws.onerror = (e) => log('WebSocket error', 'sys');
  ws.onmessage = (evt) => {
    if (evt.data instanceof ArrayBuffer) {
      // Raw PCM from Gemini
      playPcm24k(evt.data);
    } else {
      // JSON events: partial transcripts etc.
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'response.delta' && msg.delta?.text) {
          log(msg.delta.text, 'ai');
        } else if (msg.type === 'response.completed' && msg.response?.output && msg.response.output[0]?.content?.parts) {
          const parts = msg.response.output[0].content.parts;
          const text = parts.filter(p => p.text).map(p => p.text).join(' ');
          if (text) log(text, 'ai');
        } else if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          const text = msg.transcript || msg?.transcription || '';
          if (text) log(text, 'me');
        }
      } catch {}
    }
  };
};

qs('#disconnect').onclick = () => ws && ws.close();

// Push-to-talk (hold)
const holdBtn = qs('#holdToTalk');
holdBtn.onmousedown = () => { talking = true; log('Listening…', 'sys'); };
holdBtn.onmouseup = () => { talking = false; ws?.send(JSON.stringify({ type: 'input_audio.buffer.commit' })); };
holdBtn.onmouseleave = () => { talking = false; };

// Tap-to-talk (toggle)
let tapOn = false;
qs('#tapToTalk').onclick = () => {
  tapOn = !tapOn;
  talking = tapOn;
  log(tapOn ? 'Listening…' : 'Stopped listening', 'sys');
  if (!tapOn) ws?.send(JSON.stringify({ type: 'input_audio.buffer.commit' }));
};

// Interrupt (cancel current response)
qs('#interrupt').onclick = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'response.cancel' }));
    log('Interrupted response', 'sys');
  }
};
