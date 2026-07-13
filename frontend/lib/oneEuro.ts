// One-Euro filter: an adaptive low-pass that smooths hard when the signal is
// slow (kills jitter while the cursor holds still) and eases off when it moves
// fast (no lag on a real look). Tuning: lower minCutoff = smoother at rest;
// higher beta = more responsive to fast motion.

class LowPass {
  private s: number | null = null;
  filter(x: number, alpha: number): number {
    this.s = this.s === null ? x : alpha * x + (1 - alpha) * this.s;
    return this.s;
  }
  last(): number | null {
    return this.s;
  }
  reset() {
    this.s = null;
  }
}

export class OneEuro {
  private freq = 60;
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private readonly x = new LowPass();
  private readonly dx = new LowPass();
  private lastTime: number | null = null;

  constructor(opts: { minCutoff?: number; beta?: number; dCutoff?: number } = {}) {
    this.minCutoff = opts.minCutoff ?? 0.8;
    this.beta = opts.beta ?? 0.006;
    this.dCutoff = opts.dCutoff ?? 1.0;
  }

  private alpha(cutoff: number): number {
    const te = 1 / this.freq;
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / te);
  }

  filter(value: number, timestampMs: number): number {
    if (this.lastTime != null && timestampMs > this.lastTime) {
      this.freq = 1000 / (timestampMs - this.lastTime);
    }
    this.lastTime = timestampMs;
    const prev = this.x.last() ?? value;
    const dValue = (value - prev) * this.freq;
    const edValue = this.dx.filter(dValue, this.alpha(this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    return this.x.filter(value, this.alpha(cutoff));
  }

  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastTime = null;
  }
}
