// Construction du maillage à partir de la surface implicite (algorithme « surface nets »).
import { nextFrame, clamp, vnorm, vcross } from '../utils/math.js';
import { sdf, grad } from './shape.js';
import { shadeVertex } from './coat.js';

/* ---------- Maillage (surface nets) ---------- */
const CELL = 0.18;
async function buildKitten(report) {
  const h = CELL, x0 = -22.9, y0 = -0.71, z0 = -8.93;
  const nx = Math.ceil(41 / h) + 1, ny = Math.ceil(25.2 / h) + 1, nz = Math.ceil(17.9 / h) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const B = 4, margin = (1.5 * 1.7321 * h + 2 * h) * 1.5;
  const nbx = Math.ceil(nx / B), nby = Math.ceil(ny / B), nbz = Math.ceil(nz / B);
  let tick = performance.now();
  // 4.1 on n'évalue finement que les blocs proches de la surface
  for (let bk = 0; bk < nbz; bk++) {
    for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
      const d = sdf(x0 + (bi * B + 1.5) * h, y0 + (bj * B + 1.5) * h, z0 + (bk * B + 1.5) * h);
      const i0 = bi * B, j0 = bj * B, k0 = bk * B, i1 = Math.min(nx, i0 + B), j1 = Math.min(ny, j0 + B), k1 = Math.min(nz, k0 + B);
      if (Math.abs(d) > margin) {
        const f = d > 0 ? 1e3 : -1e3;
        for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) { const o = nx * (j + ny * k); for (let i = i0; i < i1; i++) vals[o + i] = f; }
      } else {
        for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) { const o = nx * (j + ny * k), y = y0 + j * h, z = z0 + k * h; for (let i = i0; i < i1; i++) vals[o + i] = sdf(x0 + i * h, y, z); }
      }
    }
    if (performance.now() - tick > 50) { report(0.04 + 0.40 * bk / nbz); await nextFrame(); tick = performance.now(); }
  }
  // 4.2 un sommet par cellule traversée, un quadrilatère par arête traversée
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1, sy = nx, sz = nx * ny, csy = cnx, csz = cnx * cny;
  const cell = new Int32Array(cnx * cny * cnz).fill(-1);
  let P = new Float32Array(1 << 18), nv = 0, I = new Uint32Array(1 << 20), ni = 0;
  const quad = (a, b, c, d, flip) => {
    if (ni + 6 > I.length) { const t = new Uint32Array(I.length * 2); t.set(I); I = t; }
    if (flip) { I[ni++] = a; I[ni++] = c; I[ni++] = b; I[ni++] = a; I[ni++] = d; I[ni++] = c; }
    else { I[ni++] = a; I[ni++] = b; I[ni++] = c; I[ni++] = a; I[ni++] = c; I[ni++] = d; }
  };
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) {
    let o = nx * (j + ny * k), c = cnx * (j + cny * k);
    for (let i = 0; i < cnx; i++, o++, c++) {
      const g0 = vals[o], g1 = vals[o + 1], g2 = vals[o + sy], g3 = vals[o + sy + 1], g4 = vals[o + sz], g5 = vals[o + sz + 1], g6 = vals[o + sz + sy], g7 = vals[o + sz + sy + 1];
      const b0 = g0 < 0, b1 = g1 < 0, b2 = g2 < 0, b3 = g3 < 0, b4 = g4 < 0, b5 = g5 < 0, b6 = g6 < 0, b7 = g7 < 0;
      if (b0 === b1 && b0 === b2 && b0 === b3 && b0 === b4 && b0 === b5 && b0 === b6 && b0 === b7) continue;
      let ax = 0, ay = 0, az = 0, n = 0;
      if (b0 !== b1) { ax += g0 / (g0 - g1); n++; }
      if (b2 !== b3) { ax += g2 / (g2 - g3); ay += 1; n++; }
      if (b4 !== b5) { ax += g4 / (g4 - g5); az += 1; n++; }
      if (b6 !== b7) { ax += g6 / (g6 - g7); ay += 1; az += 1; n++; }
      if (b0 !== b2) { ay += g0 / (g0 - g2); n++; }
      if (b1 !== b3) { ay += g1 / (g1 - g3); ax += 1; n++; }
      if (b4 !== b6) { ay += g4 / (g4 - g6); az += 1; n++; }
      if (b5 !== b7) { ay += g5 / (g5 - g7); ax += 1; az += 1; n++; }
      if (b0 !== b4) { az += g0 / (g0 - g4); n++; }
      if (b1 !== b5) { az += g1 / (g1 - g5); ax += 1; n++; }
      if (b2 !== b6) { az += g2 / (g2 - g6); ay += 1; n++; }
      if (b3 !== b7) { az += g3 / (g3 - g7); ax += 1; ay += 1; n++; }
      if (nv * 3 + 3 > P.length) { const t = new Float32Array(P.length * 2); t.set(P); P = t; }
      P[nv * 3] = x0 + (i + ax / n) * h; P[nv * 3 + 1] = y0 + (j + ay / n) * h; P[nv * 3 + 2] = z0 + (k + az / n) * h;
      cell[c] = nv;
      if (b0 !== b1 && j > 0 && k > 0) quad(nv, cell[c - csy], cell[c - csy - csz], cell[c - csz], !b0);
      if (b0 !== b2 && i > 0 && k > 0) quad(nv, cell[c - csz], cell[c - csz - 1], cell[c - 1], !b0);
      if (b0 !== b4 && i > 0 && j > 0) quad(nv, cell[c - 1], cell[c - 1 - csy], cell[c - csy], !b0);
      nv++;
    }
  }
  report(0.48); await nextFrame();
  // 4.3 on recale chaque sommet sur la surface, on calcule sa normale, puis on le peint
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), fur = new Float32Array(nv * 4), col = new Uint8Array(nv * 4), wts = new Uint8Array(nv * 4);
  const o = {}, e = 0.03;
  tick = performance.now();
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const d = sdf(x, y, z); let g = grad(x, y, z, e); const gl2 = (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) / (16 * e * e) || 1, s = d / gl2 / (4 * e);
    x -= g[0] * s; y -= g[1] * s; z -= g[2] * s;
    g = vnorm(grad(x, y, z, e));
    shadeVertex(x, y, z, g[0], g[1], g[2], o);
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; nrm[v * 3] = g[0]; nrm[v * 3 + 1] = g[1]; nrm[v * 3 + 2] = g[2];
    fur[v * 4] = o.tip[0]; fur[v * 4 + 1] = o.tip[1]; fur[v * 4 + 2] = o.tip[2]; fur[v * 4 + 3] = o.len;
    col[v * 4] = clamp(o.col[0], 0, 1) * 255; col[v * 4 + 1] = clamp(o.col[1], 0, 1) * 255; col[v * 4 + 2] = clamp(o.col[2], 0, 1) * 255; col[v * 4 + 3] = o.ao * 255;
    wts[v * 4] = o.headW * 255; wts[v * 4 + 1] = clamp(o.tailT, 0, 1) * 255; wts[v * 4 + 2] = o.breath * 255; wts[v * 4 + 3] = clamp(o.skin, 0, 1) * 255;
    if ((v & 1023) === 0 && performance.now() - tick > 50) { report(0.48 + 0.46 * v / nv); await nextFrame(); tick = performance.now(); }
  }
  // 4.4 sens des triangles : on vérifie sur un échantillon et on retourne tout si besoin
  let acc = 0;
  for (let t = 0; t < Math.min(ni, 9000); t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const fn = vcross([pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]]);
    acc += fn[0] * nrm[a] + fn[1] * nrm[a + 1] + fn[2] * nrm[a + 2];
  }
  const idx = I.slice(0, ni);
  if (acc < 0) for (let t = 0; t < ni; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  return { pos, nrm, fur, col, wts, idx, nv, nt: ni / 3 };
}

export { CELL, buildKitten };
