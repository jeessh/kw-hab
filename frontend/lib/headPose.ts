// Head-orientation pointing from mediapipe FaceMesh landmarks. Face landmarks
// are far steadier than a per-frame pointer estimate, so we derive a stable
// yaw/pitch proxy from the nose relative to the eye corners, then fit a linear
// map from that proxy to screen pixels using the calibration dots. The fit
// absorbs axis sign/scale/mirroring automatically.

// mediapipe FaceMesh indices (canonical 468-point topology).
const NOSE = 1;
const LEFT_EYE = 33;
const RIGHT_EYE = 263;

export type HeadProxy = { yaw: number; pitch: number };

// Nose position relative to the eye midpoint, scaled by inter-ocular distance
// (invariant to distance from the camera). null if landmarks are missing.
export function headProxy(lm: number[][]): HeadProxy | null {
  if (!lm || lm.length <= RIGHT_EYE) return null;
  const nose = lm[NOSE];
  const le = lm[LEFT_EYE];
  const re = lm[RIGHT_EYE];
  if (!nose || !le || !re) return null;
  const midX = (le[0] + re[0]) / 2;
  const midY = (le[1] + re[1]) / 2;
  const iod = Math.hypot(re[0] - le[0], re[1] - le[1]);
  if (iod < 1e-6) return null;
  return { yaw: (nose[0] - midX) / iod, pitch: (nose[1] - midY) / iod };
}

// Least-squares linear map [yaw, pitch, 1] → screen x and y, accumulated from
// calibration samples. A touch of ridge regularization keeps it stable.
export class HeadMap {
  private m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  private bx = [0, 0, 0];
  private by = [0, 0, 0];
  private n = 0;
  private wx: number[] | null = null;
  private wy: number[] | null = null;

  add(yaw: number, pitch: number, x: number, y: number) {
    const f = [yaw, pitch, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) this.m[i][j] += f[i] * f[j];
      this.bx[i] += f[i] * x;
      this.by[i] += f[i] * y;
    }
    this.n++;
  }

  fit(): boolean {
    if (this.n < 4) return false;
    const m = this.m.map((row, i) => row.map((v, j) => (i === j ? v + 1e-6 : v)));
    const wx = solve3(m, this.bx);
    const wy = solve3(m, this.by);
    if (!wx || !wy) return false;
    this.wx = wx;
    this.wy = wy;
    return true;
  }

  predict(yaw: number, pitch: number): { x: number; y: number } | null {
    if (!this.wx || !this.wy) return null;
    return {
      x: this.wx[0] * yaw + this.wx[1] * pitch + this.wx[2],
      y: this.wy[0] * yaw + this.wy[1] * pitch + this.wy[2],
    };
  }
}

// 3x3 solve via Gaussian elimination with partial pivoting; null if singular.
function solve3(a: number[][], b: number[]): number[] | null {
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++)
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-9) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c < 4; c++) m[r][c] -= f * m[col][c];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}
