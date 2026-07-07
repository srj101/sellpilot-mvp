/**
 * Synthesizes a premium double-chime notification sound using the Web Audio API.
 * This is completely client-side, requiring no static audio file downloads.
 */
export function playChime() {
  try {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();

    const playNote = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    // Beautiful soft double chime (C6 followed by E6)
    playNote(1046.50, ctx.currentTime, 0.4);
    playNote(1318.51, ctx.currentTime + 0.08, 0.5);
  } catch (err) {
    console.error("Failed to play notification chime:", err);
  }
}
