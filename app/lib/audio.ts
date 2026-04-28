// Procedural Web Audio sounds — no external files needed.
// All sounds are tiny synthesized blips that evoke the original arcade vibe
// without infringing on copyrighted samples.

type AC = AudioContext | null;

class AudioEngine {
  private ctx: AC = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private chompToggle = false;

  ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor() as AudioContext;
      const masterGain = ctx.createGain();
      masterGain.gain.value = this.muted ? 0 : 0.4;
      masterGain.connect(ctx.destination);
      this.ctx = ctx;
      this.masterGain = masterGain;
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 0.4;
    }
  }

  isMuted() {
    return this.muted;
  }

  private blip(opts: {
    freq: number;
    type?: OscillatorType;
    duration: number;
    gain?: number;
    sweepTo?: number;
  }) {
    const ctx = this.ensure();
    if (!ctx || !this.masterGain) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? "square";
    osc.frequency.setValueAtTime(opts.freq, ctx.currentTime);
    if (opts.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.sweepTo),
        ctx.currentTime + opts.duration,
      );
    }
    const peak = opts.gain ?? 0.5;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + opts.duration,
    );
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(ctx.currentTime + opts.duration + 0.02);
  }

  chomp() {
    // Two alternating short pitches → classic "waka waka" pulse.
    this.chompToggle = !this.chompToggle;
    this.blip({
      freq: this.chompToggle ? 520 : 380,
      type: "square",
      duration: 0.08,
      gain: 0.35,
    });
  }

  eatPower() {
    this.blip({ freq: 220, type: "sawtooth", duration: 0.18, gain: 0.4, sweepTo: 660 });
  }

  eatGhost() {
    this.blip({ freq: 880, type: "square", duration: 0.12, gain: 0.5 });
    setTimeout(() =>
      this.blip({ freq: 1320, type: "square", duration: 0.12, gain: 0.5 }),
      90,
    );
  }

  eatFruit() {
    this.blip({ freq: 660, type: "triangle", duration: 0.18, gain: 0.45 });
  }

  death() {
    const ctx = this.ensure();
    if (!ctx || !this.masterGain) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(700, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.9);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.95);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 1.0);
  }

  intro() {
    const notes = [392, 523, 659, 784, 1046];
    notes.forEach((f, i) =>
      setTimeout(
        () => this.blip({ freq: f, type: "square", duration: 0.12, gain: 0.4 }),
        i * 130,
      ),
    );
  }

  win() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) =>
      setTimeout(
        () =>
          this.blip({ freq: f, type: "triangle", duration: 0.18, gain: 0.45 }),
        i * 110,
      ),
    );
  }

  startSiren(frightened: boolean) {
    const ctx = this.ensure();
    if (!ctx || !this.masterGain) return;
    this.stopSiren();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    const base = frightened ? 110 : 200;
    osc.frequency.value = base;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.08);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    // wobble
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = frightened ? 6 : 2.2;
    lfoGain.gain.value = frightened ? 40 : 25;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    this.sirenOsc = osc;
    this.sirenGain = g;
    (osc as any)._lfo = lfo;
  }

  stopSiren() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.sirenOsc && this.sirenGain) {
      try {
        this.sirenGain.gain.cancelScheduledValues(ctx.currentTime);
        this.sirenGain.gain.exponentialRampToValueAtTime(
          0.0001,
          ctx.currentTime + 0.12,
        );
        this.sirenOsc.stop(ctx.currentTime + 0.15);
        const lfo = (this.sirenOsc as any)._lfo as OscillatorNode | undefined;
        lfo?.stop(ctx.currentTime + 0.15);
      } catch {}
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }
}

export const audio = new AudioEngine();
