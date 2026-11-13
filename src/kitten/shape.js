// Forme du chaton : une surface implicite (SDF) faite de formes simples fondues entre elles.
import { clamp, vnorm, vcross, vdot, vsub, vscale, rotX, rotY, rotZ, m3mul, m3v, m3t } from '../utils/math.js';

/* ---------- Le chaton en surface implicite ----------
   Le corps est une somme de formes simples (ellipsoïdes, cônes arrondis) fondues entre elles.
   Repère : x vers l'avant du chaton, y vers le haut, unités proches du centimètre. */
const ell = (px, py, pz, cx, cy, cz, rx, ry, rz) => {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = Math.sqrt(x * x + y * y + z * z), x1 = x / rx, y1 = y / ry, z1 = z / rz, k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
};
const sph = (px, py, pz, cx, cy, cz, r) => { const x = px - cx, y = py - cy, z = pz - cz; return Math.sqrt(x * x + y * y + z * z) - r; };
const rcone = (px, py, pz, ax, ay, az, bx, by, bz, r1, r2) => {
  const bax = bx - ax, bay = by - ay, baz = bz - az, pax = px - ax, pay = py - ay, paz = pz - az;
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz); h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r1 + (r2 - r1) * h);
};
const smin = (a, b, k) => { const h = k - Math.abs(a - b); return h > 0 ? Math.min(a, b) - h * h / (4 * k) : Math.min(a, b); };
const smax = (a, b, k) => { const h = k - Math.abs(a - b); return h > 0 ? Math.max(a, b) + h * h / (4 * k) : Math.max(a, b); };
function sdTri(px, py, ax, ay, bx, by, cx, cy) {
  const e0x = bx - ax, e0y = by - ay, e1x = cx - bx, e1y = cy - by, e2x = ax - cx, e2y = ay - cy;
  const v0x = px - ax, v0y = py - ay, v1x = px - bx, v1y = py - by, v2x = px - cx, v2y = py - cy;
  let t = clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y), 0, 1); const q0x = v0x - e0x * t, q0y = v0y - e0y * t;
  t = clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y), 0, 1); const q1x = v1x - e1x * t, q1y = v1y - e1y * t;
  t = clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y), 0, 1); const q2x = v2x - e2x * t, q2y = v2y - e2y * t;
  const s = Math.sign(e0x * e2y - e0y * e2x);
  const d = Math.min(q0x * q0x + q0y * q0y, q1x * q1x + q1y * q1y, q2x * q2x + q2y * q2y);
  const m = Math.min(s * (v0x * e0y - v0y * e0x), s * (v1x * e1y - v1y * e1x), s * (v2x * e2y - v2y * e2x));
  return -Math.sqrt(d) * Math.sign(m);
}

// Tête : centre et orientation (tournée vers la caméra, légèrement penchée)
const HEAD_C = [8.9, 14.9, 0], HS = 1.16;               // une grosse tête ronde : c'est ce qui fait « chaton »
const RH = m3mul(rotY(0.60), m3mul(rotZ(-0.13), rotX(0.10)));
const RHT = m3t(RH);
const h2w = (x, y, z) => { const r = m3v(RH, x * HS, y * HS, z * HS); return [r[0] + HEAD_C[0], r[1] + HEAD_C[1], r[2] + HEAD_C[2]]; };
const w2h = p => { const r = m3v(RHT, p[0] - HEAD_C[0], p[1] - HEAD_C[1], p[2] - HEAD_C[2]); return [r[0] / HS, r[1] / HS, r[2] / HS]; };
const NECK_A = [4.9, 11.6, 0], NECK_B = h2w(-1.2, -1.2, 0);
const NECK_AX = vnorm(vsub(NECK_B, NECK_A));
const HEAD_PIVOT = h2w(-2.2, -1.8, 0);
// Oreille et œil sont décrits du côté +z de la tête ; l'autre côté s'obtient par symétrie.
const EAR = (() => {
  const B = [-0.9, 2.5, 2.5], T = [-1.3, 6.5, 3.7], V = vnorm(vsub(T, B));
  let W = vnorm([0.80, 0.10, 0.59]); W = vnorm(vsub(W, vscale(V, vdot(W, V))));
  return { B, V, W, U: vcross(V, W) };
})();
const EYE = (() => {
  const c = [2.68, -0.05, 1.82], f = vnorm([Math.cos(0.15), 0.03, Math.sin(0.15)]);
  const l0 = vnorm(vsub([0, 0, 1], vscale(f, f[2]))), u0 = vcross(l0, f), sl = 0.16;
  const u = vsub(vscale(u0, Math.cos(sl)), vscale(l0, Math.sin(sl)));
  const au = 0.60, al = -0.72;
  const nu = vsub(vscale(u, Math.cos(au)), vscale(f, Math.sin(au)));
  const nl = vscale(vsub(vscale(u, Math.cos(al)), vscale(f, Math.sin(al))), -1);
  return { c, f, u, nu, nl, au, al, r: 1.31, rl: 1.34 };
})();
const TAIL = (() => {
  const P = [[-8.4, 11.1, 0], [-11.0, 12.5, -0.3], [-13.8, 13.0, -1.0], [-16.3, 12.3, -2.2], [-18.2, 10.9, -3.6], [-19.2, 9.4, -4.8]];
  const n = 16, x = [], y = [], z = [], r = [];
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i <= n; i++) {
    const s = i / n * (P.length - 1), k = Math.min(Math.floor(s), P.length - 2), t = s - k;
    const p0 = P[Math.max(k - 1, 0)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(k + 2, P.length - 1)];
    x.push(cr(p0[0], p1[0], p2[0], p3[0], t)); y.push(cr(p0[1], p1[1], p2[1], p3[1], t)); z.push(cr(p0[2], p1[2], p2[2], p3[2], t));
    r.push(1.35 - 0.85 * Math.pow(i / n, 1.25));
  }
  let len = 0; for (let i = 0; i < n; i++) len += Math.hypot(x[i + 1] - x[i], y[i + 1] - y[i], z[i + 1] - z[i]);
  return { n, x, y, z, r, len, P0: P[0] };
})();

// Distances par partie, remplies à chaque appel de sdf() : elles servent à peindre le pelage.
const G = { torso: 0, neck: 0, head: 0, ear: 0, nose: 0, fleg: 0, hleg: 0, fpaw: 9, hpaw: 9, tail: 0, tailT: 0, lx: 0, ly: 0, lz: 0, eu: 0, ev: 0, ew: 0, ed2: 9, eye: 9, su: 0, sl: 0 };

function earSdf(lx, ly, az) {
  const dx = lx - EAR.B[0], dy = ly - EAR.B[1], dz = az - EAR.B[2];
  const v = dx * EAR.V[0] + dy * EAR.V[1] + dz * EAR.V[2];
  const u = dx * EAR.U[0] + dy * EAR.U[1] + dz * EAR.U[2];
  let w = dx * EAR.W[0] + dy * EAR.W[1] + dz * EAR.W[2];
  const cv = v - 1.7, bd = Math.sqrt(u * u + cv * cv + w * w);
  if (bd > 6.0) { G.ed2 = 9; return bd - 3.6; }
  w -= 0.20 * u * u;                                   // pavillon creusé vers l'avant
  const d2 = sdTri(u, v, -1.55, -0.6, 1.55, -0.6, 0.1, 3.2) - 0.38;
  const t = 0.13 + 0.12 * clamp(1 - v / 4.2, 0, 1);
  const dw = Math.abs(w) - t, ox = d2 > 0 ? d2 : 0, oy = dw > 0 ? dw : 0;
  G.eu = u; G.ev = v; G.ew = w; G.ed2 = d2;
  return (Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(d2, dw), 0) - 0.08) * 0.75;
}
function headSdf(px, py, pz) {
  const dx = (px - HEAD_C[0]) / HS, dy = (py - HEAD_C[1]) / HS, dz = (pz - HEAD_C[2]) / HS, r2 = dx * dx + dy * dy + dz * dz;
  if (r2 > 106) { const d = (Math.sqrt(r2) - 7.7) * HS; G.head = G.ear = G.nose = d; G.eye = 9; G.ed2 = 9; return d; }
  const lx = RHT[0] * dx + RHT[1] * dy + RHT[2] * dz, ly = RHT[3] * dx + RHT[4] * dy + RHT[5] * dz, lz = RHT[6] * dx + RHT[7] * dy + RHT[8] * dz;
  const az = Math.abs(lz);
  G.lx = lx; G.ly = ly; G.lz = lz;
  let h = ell(lx, ly, lz, 0, 0, 0, 4.1, 3.75, 4.25);                         // crâne
  h = smin(h, sph(lx, ly, lz, 1.5, 0.9, 0, 3.0), 1.0);                       // front bombé
  h = smin(h, ell(lx, ly, az, 1.5, -1.7, 2.2, 2.4, 2.0, 2.3), 0.8);          // joues
  h = smin(h, ell(lx, ly, lz, 3.3, -1.55, 0, 2.0, 1.5, 2.2), 0.7);           // museau
  h = smin(h, sph(lx, ly, az, 4.12, -1.82, 0.92, 1.08), 0.35);               // coussinets des moustaches
  h = smin(h, sph(lx, ly, lz, 3.3, -2.85, 0, 1.0), 0.5);                     // menton
  h = smin(h, rcone(lx, ly, lz, 2.6, 0.3, 0, 4.55, -0.85, 0, 1.3, 0.7), 0.6); // chanfrein
  const ex = lx - EYE.c[0], ey = ly - EYE.c[1], ez = az - EYE.c[2], de = Math.sqrt(ex * ex + ey * ey + ez * ez);
  G.eye = de;
  if (de < 2.8) {                                                             // orbite et paupières
    const cx = ex - EYE.f[0] * 0.62, cy = ey - EYE.f[1] * 0.62, cz = ez - EYE.f[2] * 0.62;
    h = smax(h, 1.10 - Math.sqrt(cx * cx + cy * cy + cz * cz), 0.18);
    const su = ex * EYE.nu[0] + ey * EYE.nu[1] + ez * EYE.nu[2], sl = ex * EYE.nl[0] + ey * EYE.nl[1] + ez * EYE.nl[2];
    G.su = su; G.sl = sl;
    const lid = de - EYE.rl;
    h = smin(h, Math.max(lid, -su), 0.10);
    h = smin(h, Math.max(lid, -sl), 0.10);
  }
  G.head = h * HS;
  let nz = ell(lx, ly, lz, 5.0, -1.02, 0, 0.42, 0.34, 0.62);                   // truffe
  nz = smin(nz, sph(lx, ly, lz, 4.95, -1.3, 0, 0.24), 0.12);
  G.nose = nz * HS;
  const e = earSdf(lx, ly, az);
  G.ear = e * HS;
  return smin(smin(h, nz, 0.10), e, 0.5) * HS;
}
function tailSdf(px, py, pz) {
  const bx = px + 14, by = py - 11.3, bz = pz + 2.2, bd = Math.sqrt(bx * bx + by * by + bz * bz);
  if (bd > 10.8) { G.tailT = 0; return bd - 7.6; }
  const X = TAIL.x, Y = TAIL.y, Z = TAIL.z, R = TAIL.r, n = TAIL.n;
  let best = 1e9, bt = 0;
  for (let i = 0; i < n; i++) {
    const ax = X[i], ay = Y[i], az = Z[i], bax = X[i + 1] - ax, bay = Y[i + 1] - ay, baz = Z[i + 1] - az, pax = px - ax, pay = py - ay, paz = pz - az;
    let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz); h = h < 0 ? 0 : h > 1 ? 1 : h;
    const ex = pax - bax * h, ey = pay - bay * h, ez = paz - baz * h;
    const d = Math.sqrt(ex * ex + ey * ey + ez * ez) - (R[i] + (R[i + 1] - R[i]) * h);
    if (d < best) { best = d; bt = (i + h) / n; }
  }
  G.tailT = bt; return best;
}
function sdf(px, py, pz) {
  const sg = pz < 0 ? -1 : 1, az = sg * pz;
  let torso = ell(px, py, pz, 3.6, 9.7, 0, 3.9, 4.1, 3.9);                     // poitrine
  torso = smin(torso, ell(px, py, pz, -0.9, 9.3, 0, 4.8, 4.4, 4.4), 2.0);      // ventre rond
  torso = smin(torso, ell(px, py, pz, -5.3, 9.6, 0, 3.8, 4.0, 3.9), 2.0);      // bassin
  G.torso = torso;
  let fl, fp = 9;                                                             // pattes avant (décalées l'une de l'autre)
  if (py > 15.5) fl = py - 12.6;
  else {
    const x = px - sg * 0.6;
    fl = ell(x, py, az, 4.0, 8.6, 2.6, 2.3, 3.0, 1.9);
    fl = smin(fl, rcone(x, py, az, 4.0, 7.4, 2.7, 4.4, 3.6, 2.7, 1.8, 1.42), 0.8);
    fl = smin(fl, rcone(x, py, az, 4.4, 3.6, 2.7, 4.7, 1.3, 2.7, 1.42, 1.22), 0.3);
    if (py < 3.2) {
      fp = ell(x, py, az, 5.4, 0.95, 2.7, 1.8, 0.95, 1.45);
      let toes = sph(x, py, az, 6.45, 0.62, 1.77, 0.5);
      toes = smin(toes, sph(x, py, az, 6.67, 0.62, 2.39, 0.5), 0.12);
      toes = smin(toes, sph(x, py, az, 6.67, 0.62, 3.01, 0.5), 0.12);
      toes = smin(toes, sph(x, py, az, 6.45, 0.62, 3.63, 0.5), 0.12);
      fp = smin(fp, toes, 0.3);
      fl = smin(fl, fp, 0.5);
    }
  }
  G.fleg = fl; G.fpaw = fp;
  let hl, hp = 9;                                                             // pattes arrière
  if (py > 15.5) hl = py - 12.5;
  else {
    const x = px + sg * 0.5;
    hl = ell(x, py, az, -4.9, 7.7, 2.9, 3.3, 3.8, 2.1);                         // cuisse
    hl = smin(hl, rcone(x, py, az, -3.8, 5.1, 3.0, -6.4, 3.2, 2.95, 1.6, 1.12), 0.9);
    hl = smin(hl, rcone(x, py, az, -6.4, 3.2, 2.95, -5.9, 1.3, 2.95, 1.12, 1.05), 0.3);
    if (py < 3.2) {
      hp = ell(x, py, az, -5.1, 0.95, 2.95, 1.9, 0.95, 1.45);
      let toes = sph(x, py, az, -4.0, 0.62, 2.02, 0.5);
      toes = smin(toes, sph(x, py, az, -3.8, 0.62, 2.64, 0.5), 0.12);
      toes = smin(toes, sph(x, py, az, -3.8, 0.62, 3.26, 0.5), 0.12);
      toes = smin(toes, sph(x, py, az, -4.0, 0.62, 3.88, 0.5), 0.12);
      hp = smin(hp, toes, 0.3);
      hl = smin(hl, hp, 0.5);
    }
  }
  G.hleg = hl; G.hpaw = hp;
  const neck = rcone(px, py, pz, NECK_A[0], NECK_A[1], NECK_A[2], NECK_B[0], NECK_B[1], NECK_B[2], 3.3, 3.2);
  G.neck = neck;
  const head = headSdf(px, py, pz);
  const tail = tailSdf(px, py, pz);
  G.tail = tail;
  let d = smin(torso, fl, 1.3);
  d = smin(d, hl, 1.3);
  d = smin(d, neck, 1.5);
  d = smin(d, head, 1.0);
  return smin(d, tail, 1.2);
}
function grad(x, y, z, e) { // gradient par quatre échantillons en tétraèdre
  const a = sdf(x + e, y - e, z - e), b = sdf(x - e, y - e, z + e), c = sdf(x - e, y + e, z - e), d = sdf(x + e, y + e, z + e);
  return [a - b - c + d, -a - b + c + d, -a + b - c + d];
}
function project(p) { // ramène un point sur la peau du chaton
  let [x, y, z] = p, n = [0, 1, 0];
  for (let i = 0; i < 6; i++) {
    const d = sdf(x, y, z), g = grad(x, y, z, 0.03), gl = Math.hypot(g[0], g[1], g[2]) / 0.12 || 1;
    n = vnorm(g); x -= n[0] * d / gl; y -= n[1] * d / gl; z -= n[2] * d / gl;
  }
  return { p: [x, y, z], n };
}

export { ell, sph, rcone, smin, smax, sdTri, HEAD_C, HS, RH, RHT, h2w, w2h, NECK_A, NECK_B, NECK_AX, HEAD_PIVOT, EAR, EYE, TAIL, G, earSdf, headSdf, tailSdf, sdf, grad, project };
