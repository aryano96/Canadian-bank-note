/**
 * Synthesised sound effects (no audio files to load). Created lazily on the
 * first user gesture, as browsers require.
 */
class Sound {
  private ctx: AudioContext | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  enabled = true;

  private audio(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", volume = 0.12) {
    const ctx = this.audio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + start;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  start() {
    this.tone(220, 0, 0.15, "triangle", 0.08);
    this.tone(330, 0.08, 0.2, "triangle", 0.08);
    const ctx = this.audio();
    if (!ctx) return;
    this.stopHum();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 80;
    gain.gain.value = 0.015;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start();
    this.hum = { osc, gain };
  }

  /** Pitch of the press hum follows the multiplier. */
  progress(multiplier: number) {
    if (!this.hum || !this.ctx) return;
    const f = 80 + Math.min(400, Math.log(multiplier / 100) * 90);
    this.hum.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.1);
  }

  win() {
    this.stopHum();
    [784, 988, 1319].forEach((f, i) => this.tone(f, i * 0.07, 0.35, "sine", 0.1));
  }

  /** A brighter chime with a coin shimmer, for Golden round wins. */
  goldenWin() {
    this.win();
    [1568, 1976, 2637, 3136].forEach((f, i) => this.tone(f, 0.22 + i * 0.06, 0.4, "triangle", 0.05));
  }

  lose() {
    this.stopHum();
    this.tone(110, 0, 0.5, "sawtooth", 0.1);
    this.tone(70, 0.05, 0.6, "square", 0.06);
  }

  stopHum() {
    if (!this.hum || !this.ctx) return;
    const { osc, gain } = this.hum;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    osc.stop(this.ctx.currentTime + 0.3);
    this.hum = null;
  }
}

export const sound = new Sound();
