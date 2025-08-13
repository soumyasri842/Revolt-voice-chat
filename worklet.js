
// AudioWorklet code inlined via Blob URL
export const workletURL = URL.createObjectURL(new Blob([`
class DownsamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const out = [];
    for (let i = 0; i < ch.length; i++) {
      this.acc += 1;
      if (this.acc >= this.ratio) { this.acc -= this.ratio; out.push(ch[i]); }
    }
    this.port.postMessage(out);
    return true;
  }
}
registerProcessor('downsampler', DownsamplerProcessor);
`], { type: 'application/javascript' }));
