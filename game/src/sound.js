// Tiny synth: no audio files, just short WebAudio blips for play, clash,
// surge and the end of a duel. Silent until the first gesture unlocks the
// audio context, and a mute toggle lives on the table.
export function createSound() {
  let context = null;
  let muted = false;

  function ensure() {
    if (!context) {
      try {
        const Ctor = window.AudioContext ?? window.webkitAudioContext;
        context = new Ctor();
      } catch { context = null; }
    }
    if (context && context.state === 'suspended') void context.resume();
    return context;
  }

  function blip(frequency, seconds, kind = 'sine', gain = 0.12) {
    if (muted) return;
    const audio = ensure();
    if (!audio) return;
    const start = audio.currentTime;
    const voice = audio.createOscillator();
    const amp = audio.createGain();
    voice.type = kind;
    voice.frequency.setValueAtTime(frequency, start);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    voice.connect(amp);
    amp.connect(audio.destination);
    voice.start(start);
    voice.stop(start + seconds);
  }

  function play() { blip(520, 0.12, 'triangle'); window.setTimeout(() => blip(780, 0.1, 'triangle', 0.08), 60); }
  function clash() { blip(180, 0.15, 'square', 0.1); blip(120, 0.2, 'sawtooth', 0.06); }
  function surge() { blip(660, 0.1, 'sine'); window.setTimeout(() => blip(880, 0.12, 'sine', 0.09), 70); window.setTimeout(() => blip(1320, 0.16, 'sine', 0.07), 140); }
  function win() { [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => blip(f, 0.22, 'triangle', 0.1), i * 110)); }
  function lose() { [392, 330, 262, 196].forEach((f, i) => window.setTimeout(() => blip(f, 0.25, 'triangle', 0.09), i * 130)); }
  function toggleMute() { muted = !muted; return muted; }

  return { play, clash, surge, win, lose, toggleMute, unlock: ensure };
}
