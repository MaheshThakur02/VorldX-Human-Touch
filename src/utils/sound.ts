export function playSoftChime() {
  if (typeof window === "undefined") return;
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  gain.connect(ctx.destination);

  const oscA = ctx.createOscillator();
  oscA.type = "sine";
  oscA.frequency.setValueAtTime(523.25, now);
  oscA.connect(gain);
  oscA.start(now);
  oscA.stop(now + 0.35);

  const oscB = ctx.createOscillator();
  oscB.type = "sine";
  oscB.frequency.setValueAtTime(659.25, now + 0.08);
  oscB.connect(gain);
  oscB.start(now + 0.08);
  oscB.stop(now + 0.35);

  const close = () => {
    void ctx.close();
  };
  oscB.onended = close;
}
