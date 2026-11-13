// Détails : yeux, moustaches, texture 3D des brins de poil, ombre de contact au sol.
import { clamp, vnorm, vsub, vscale, m3v } from '../utils/math.js';
import { HS, RH, h2w, EYE, sdf, project } from './shape.js';

/* ---------- Yeux, moustaches, textures ---------- */
function eyeData(s) { // s = +1 ou -1 selon le côté
  const m = v => m3v(RH, v[0], v[1], v[2] * s);
  return { c: h2w(EYE.c[0], EYE.c[1], EYE.c[2] * s), f: m(EYE.f), u: m(EYE.u) };
}
function buildWhiskers() {
  const pos = [], tan = [], su = [], idx = [];
  let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const add = (guess, d0, L, bendA, ka, bendB, kb) => {
    const root = project(h2w(guess[0], guess[1], guess[2]));
    const D = m3v(RH, d0[0], d0[1], d0[2]), A = m3v(RH, bendA[0], bendA[1], bendA[2]), Bv = m3v(RH, bendB[0], bendB[1], bendB[2]);
    const N = 14, base = pos.length / 3, r0 = vsub(root.p, vscale(root.n, 0.06));
    const at = u => [r0[0] + D[0] * L * u + (A[0] * ka + Bv[0] * kb) * L * u * u, r0[1] + D[1] * L * u + (A[1] * ka + Bv[1] * kb) * L * u * u, r0[2] + D[2] * L * u + (A[2] * ka + Bv[2] * kb) * L * u * u];
    for (let i = 0; i <= N; i++) {
      const u = i / N, p = at(u), t = vnorm(vsub(at(u + 0.01), p));
      for (const side of [-1, 1]) { pos.push(p[0], p[1], p[2]); tan.push(t[0], t[1], t[2]); su.push(side, u); }
      if (i < N) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  };
  for (const s of [1, -1]) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const dir = vnorm([0.5 - 0.38 * c, 0.45 - 0.32 * r, s]);
      add([4.12 + dir[0] * 1.08, -1.82 + dir[1] * 1.08, s * 0.92 + dir[2] * 1.08],
          vnorm([0.16 - 0.24 * c + 0.1 * (rnd() - 0.5), 0.20 - 0.15 * r + 0.08 * (rnd() - 0.5), s]),
          (4.3 + 1.0 * c - 0.5 * Math.abs(r - 1.5)) * (0.9 + 0.2 * rnd()) * HS, [0, -1, 0], 0.16, [-1, 0, 0], 0.10);
    }
    for (let i = 0; i < 2; i++) add([3.3 - 0.25 * i, 1.45 + 0.1 * i, s * (1.35 + 0.5 * i)], vnorm([0.35, 1.0, s * (0.45 + 0.3 * i)]), (1.7 + 0.4 * rnd()) * HS, [-1, 0, 0], 0.35, [0, 0, s], 0.15);
    for (let i = 0; i < 2; i++) add([2.0 - 0.4 * i, -2.3 - 0.25 * i, s * 3.3], vnorm([-0.15, -0.25 - 0.2 * i, s]), 2.4 * HS, [0, -1, 0], 0.15, [-1, 0, 0], 0.1);
  }
  return { pos: new Float32Array(pos), tan: new Float32Array(tan), su: new Float32Array(su), idx: new Uint16Array(idx) };
}
function strandTexture() { // texture 3D répétable : distance au poil le plus proche + identifiant du poil
  const S = 96, Cn = 16, vox = S / Cn, pts = new Float32Array(Cn * Cn * Cn * 4), data = new Uint8Array(S * S * S * 2);
  let seed = 1234567; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < pts.length; i++) pts[i] = rnd();
  let q = 0;
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x + 0.5) / vox, fy = (y + 0.5) / vox, fz = (z + 0.5) / vox, cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz);
    let best = 1e9, id = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const o = (((cx + dx + Cn) % Cn) + Cn * (((cy + dy + Cn) % Cn) + Cn * ((cz + dz + Cn) % Cn))) * 4;
      const ex = cx + dx + pts[o] - fx, ey = cy + dy + pts[o + 1] - fy, ez = cz + dz + pts[o + 2] - fz, d2 = ex * ex + ey * ey + ez * ez;
      if (d2 < best) { best = d2; id = pts[o + 3]; }
    }
    data[q++] = Math.min(255, Math.sqrt(best) / 0.75 * 255); data[q++] = id * 255;
  }
  return { S, data };
}
const AO_RECT = [-27, -11, 44, 22];
function groundAO() { // ombre de contact au sol, déduite de la forme du chaton
  const W = 128, H = 64, data = new Uint8Array(W * H), hs = [0.4, 1.0, 2.0, 3.0], wk = [0.45, 0.3, 0.17, 0.08];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = AO_RECT[0] + (i + 0.5) / W * AO_RECT[2], z = AO_RECT[1] + (j + 0.5) / H * AO_RECT[3];
    let occ = 0; for (let k = 0; k < 4; k++) occ += wk[k] * clamp(1 - sdf(x, hs[k], z) / hs[k], 0, 1);
    data[i + W * j] = 255 * (1 - clamp(occ * 1.2, 0, 1));
  }
  return { W, H, data };
}

export { eyeData, buildWhiskers, strandTexture, AO_RECT, groundAO };
