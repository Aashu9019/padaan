/**
 * Page-turn sound, synthesised with Web Audio instead of shipping a recording: a short burst
 * of filtered noise whose band sweeps downward, which reads as paper sliding over paper.
 * Each turn is slightly randomised so repeated flips don't sound mechanical.
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (!noise) {
    const length = Math.floor(ctx.sampleRate * 0.5);
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      // Slightly brown noise: softer and more papery than white noise.
      last = (last + (Math.random() * 2 - 1) * 0.12) * 0.985;
      data[i] = last * 3.2;
    }
  }
  return ctx;
}

export function playPageTurn(): void {
  const ac = context();
  if (!ac || !noise) return;
  if (ac.state === 'suspended') void ac.resume();
  const now = ac.currentTime;
  const duration = 0.32 + Math.random() * 0.08;

  const source = ac.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = 0.9 + Math.random() * 0.2;

  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.8;
  band.frequency.setValueAtTime(3200 + Math.random() * 600, now);
  band.frequency.exponentialRampToValueAtTime(900, now + duration);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.12, now + duration * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(band).connect(gain).connect(ac.destination);
  source.start(now, Math.random() * 0.1);
  source.stop(now + duration + 0.02);
}
