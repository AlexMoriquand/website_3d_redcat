// Peinture du pelage : couleurs, rayures, longueur et direction des poils, sommet par sommet.
import { clamp, lerp, sstep, vnorm, mix3, m3v, vnoise, fbm } from '../utils/math.js';
import { rcone, RH, h2w, w2h, NECK_A, NECK_AX, EAR, EYE, TAIL, G, sdf, project } from './shape.js';

/* ---------- Peinture du pelage ---------- */
const C = { light: [0.925, 0.735, 0.525], mid: [0.845, 0.605, 0.385], stripe: [0.70, 0.435, 0.23], white: [0.985, 0.965, 0.935], cream: [0.975, 0.925, 0.86], nose: [0.86, 0.52, 0.50], ear: [0.955, 0.75, 0.70], earDeep: [0.80, 0.54, 0.52], rim: [0.40, 0.25, 0.19], mouth: [0.50, 0.29, 0.27] };
const THROAT = h2w(1.6, -3.3, 0), CHEST = [6.2, 6.3, 0];
// tracé de la bouche, posé sur la surface du museau (côté +z, l'autre côté par symétrie)
const MOUTH = [[4.97, -1.47, 0], [4.84, -2.03, 0], [4.62, -2.42, 0.55], [4.12, -2.5, 1.15], [3.6, -2.32, 1.6]].map(q => w2h(project(h2w(q[0], q[1], q[2])).p));

function shadeVertex(px, py, pz, nx, ny, nz, o) {
  sdf(px, py, pz);
  const dT = Math.max(G.torso, 0), dN = Math.max(G.neck, 0), dH = Math.max(Math.min(G.head, G.nose), 0), dE = Math.max(G.ear, 0), dF = Math.max(G.fleg, 0), dB = Math.max(G.hleg, 0), dTa = Math.max(G.tail, 0);
  const lx = G.lx, ly = G.ly, lz = G.lz, alz = Math.abs(lz), tailT = G.tailT, eu = G.eu, ev = G.ev, ew = G.ew, ed2 = G.ed2, eye = G.eye, su = G.su, sl = G.sl, dNose = G.nose;
  const dmin = Math.min(dT, dN, dH, dE, dF, dB, dTa);
  const wf = d => { const t = 1 - (d - dmin) / 1.3; return t > 0 ? t * t : 0; };
  let wT = wf(dT), wN = wf(dN), wH = wf(dH), wE = wf(dE), wF = wf(dF), wB = wf(dB), wTa = wf(dTa);
  const ws = wT + wN + wH + wE + wF + wB + wTa; wT /= ws; wN /= ws; wH /= ws; wE /= ws; wF /= ws; wB /= ws; wTa /= ws;

  const nA = fbm(px * 0.27, py * 0.27, pz * 0.27), nB = vnoise(px * 0.85 + 3.1, py * 0.85, pz * 0.85 + 7.7), nC = vnoise(px * 2.6, py * 2.6 + 9.2, pz * 2.6);
  const base = mix3(C.mid, C.light, clamp(0.18 + 0.60 * nB + 0.22 * sstep(11, 5.5, py), 0, 1));
  // zones blanches : plastron, ventre, chaussettes
  const dCh = rcone(px, py, pz, THROAT[0], THROAT[1], THROAT[2], CHEST[0], CHEST[1], CHEST[2], 0, 0);
  const wChest = 1 - sstep(2.0, 3.0, dCh + 1.3 * (nA - 0.5));
  const wBelly = sstep(6.9, 5.2, py + 1.5 * (nA - 0.5)) * sstep(4.4, 3.2, Math.abs(pz)) * sstep(-8.6, -6.6, px) * sstep(7.8, 5.6, px);

  // torse : rayures verticales, raie dorsale
  let st = sstep(0.52, 0.86, 0.5 + 0.5 * Math.sin(2.7 * (px + 0.32 * (py - 9)) + 5.5 * (nA - 0.5))) * sstep(5.6, 9.4, py) * 0.72;
  st = Math.max(st, sstep(0.80, 0.97, ny) * sstep(1.8, 0.5, Math.abs(pz)) * 0.7);
  let cT = mix3(mix3(base, C.stripe, st), C.white, Math.max(wChest, wBelly));
  const front = sstep(0.2, 0.7, nx) * sstep(3.8, 5.8, px);
  const lT = 1.02 + 0.28 * sstep(8.5, 5.0, py) + 0.25 * wChest, fT = [-1 + 1.15 * front, -0.5 - 0.5 * front, 0], yT = 0.6;
  // cou : colliers
  const ns = (px - NECK_A[0]) * NECK_AX[0] + (py - NECK_A[1]) * NECK_AX[1] + (pz - NECK_A[2]) * NECK_AX[2];
  const sn = sstep(0.55, 0.86, 0.5 + 0.5 * Math.sin(3.1 * ns + 4.5 * (nA - 0.5))) * 0.6 * sstep(-0.3, 0.4, ny);
  const cN = mix3(mix3(base, C.stripe, sn), C.white, wChest), lN = 1.12 + 0.2 * wChest, fN = [-0.45, -0.9, 0], yN = 0.5;
  // tête : le « M » du front, traits des joues, tour des yeux clair, museau blanc
  let fs = sstep(0.42, 0.82, 0.5 - 0.5 * Math.cos(5.2 * lz + 3.0 * (nA - 0.5))) * sstep(1.1, 2.1, ly + 0.2 * lx) * sstep(3.7, 2.4, lx) * sstep(3.6, 2.6, alz);
  let cs = sstep(0.52, 0.86, 0.5 + 0.5 * Math.sin(3.6 * (ly + 0.5 * lx) + 4.0 * (nA - 0.5))) * sstep(2.0, 3.0, alz) * sstep(0.9, -0.1, ly) * sstep(-3.4, -2.3, ly) * sstep(2.7, 1.2, lx);
  let cH = mix3(base, C.stripe, Math.max(fs, cs * 0.85));
  cH = mix3(cH, C.light, (1 - sstep(1.45, 2.45, eye)) * 0.75);
  const wM = 1 - sstep(0.9, 1.12, Math.hypot((lx - 3.95) / 1.8, (ly + 2.2) / 1.4, lz / 2.15) + 0.22 * (nB - 0.5));
  cH = mix3(cH, C.white, Math.max(wM, wChest));
  const wNose = 1 - sstep(0.03, 0.14, dNose);
  cH = mix3(cH, mix3(C.mouth, C.nose, sstep(0.25, 0.9, wNose)), wNose);     // truffe rose, cernée d'un trait plus sombre
  let wMouth = 0;
  if (lx > 2.8 && ly < -1.1 && alz < 2.4) {
    let dm = 9;
    for (let i = 0; i + 1 < MOUTH.length; i++) { const a = MOUTH[i], b = MOUTH[i + 1]; dm = Math.min(dm, rcone(lx, ly, alz, a[0], a[1], a[2], b[0], b[1], b[2], 0, 0)); }
    wMouth = (1 - sstep(0.05, 0.14, dm)) * (1 - wNose);
    cH = mix3(cH, C.mouth, wMouth * 0.8);
  }
  let wRim = 0, lenEye = 1;
  if (eye < 2.8) {
    wRim = (1 - sstep(EYE.rl + 0.04, EYE.rl + 0.20, eye)) * (su < -0.05 && sl < -0.05 ? 1 : 0);
    const bare = (1 - sstep(EYE.rl + 0.06, EYE.rl + 0.22, eye)) * Math.max(1 - sstep(0.16, 0.26, Math.abs(su)), 1 - sstep(0.16, 0.26, Math.abs(sl)), su < 0 && sl < 0 ? 1 : 0);
    lenEye = Math.max(0.2, sstep(EYE.rl + 0.05, EYE.rl + 1.15, eye)) * (1 - bare);
  }
  cH = mix3(cH, C.rim, wRim * 0.85);
  const cheek = sstep(1.5, 2.8, alz) * sstep(0.8, -0.8, ly) * sstep(3.0, 1.4, lx);
  let lH = 0.62 + 0.50 * cheek;
  lH = lerp(lH, 0.24, sstep(2.3, 3.6, lx) * sstep(1.7, 0.6, alz) * sstep(-1.2, -0.4, ly));
  lH = lerp(lH, 0.26, wM) + 0.15 * sstep(-2.6, -3.4, ly) * sstep(3.5, 2.0, lx);
  lH *= lenEye * (1 - wNose) * (1 - wMouth);
  const fl0 = vnorm([lx - 4.6, ly + 0.9, lz]), fH = m3v(RH, fl0[0], fl0[1], fl0[2]), yH = 0.68 - 0.2 * cheek;
  // oreilles : dos roux, intérieur rose, touffe crème à la base
  const inner = sstep(0.0, 0.10, ew) * sstep(-0.12, -0.42, ed2);
  const tuft = inner * sstep(2.3, 0.7, ev) * sstep(-0.4, 0.8, eu);
  let cE = mix3(C.mid, C.stripe, 0.2 + 0.35 * sstep(2.0, 3.4, ev));
  cE = mix3(mix3(cE, mix3(C.ear, C.earDeep, sstep(2.2, 0.2, ev) * sstep(1.3, 0.2, Math.abs(eu))), inner), C.cream, tuft * 0.85);
  const lE = lerp(0.26, 0.0, inner) + 0.85 * tuft, fE = m3v(RH, EAR.V[0], EAR.V[1], EAR.V[2] * (lz < 0 ? -1 : 1)), yE = 0.7 - 0.3 * tuft;
  // pattes : anneaux, chaussettes blanches
  const sF = sstep(0.5, 0.84, 0.5 + 0.5 * Math.sin(3.3 * py + 4.0 * (nA - 0.5) + (pz > 0 ? 1.3 : 0))) * 0.85;
  const sockF = sstep(3.1, 2.3, py + 0.9 * (nB - 0.5) + (pz > 0 ? 0.35 : -0.3));
  const cF = mix3(mix3(base, C.stripe, sF), C.white, Math.max(sockF, wChest));
  const lF = lerp(0.17, lerp(0.36, 0.8, sstep(2.5, 7.5, py)), sstep(1.0, 2.4, py)), fF = py < 1.5 ? [0.9, -0.3, 0] : [0.08, -1, 0], yF = 0.72;
  const sB = sstep(0.5, 0.84, 0.5 + 0.5 * Math.sin(3.1 * py + 4.0 * (nA - 0.5) + (pz > 0 ? 0 : 1.7))) * 0.85;
  const sockH = sstep(3.9, 3.0, py + 0.9 * (nB - 0.5) + (pz > 0 ? -0.3 : 0.35));
  const cB = mix3(mix3(base, C.stripe, sB), C.white, Math.max(sockH, wBelly));
  const lB = lerp(0.17, lerp(0.4, 0.95, sstep(3.0, 8.0, py)), sstep(1.0, 2.4, py)), fB = py < 1.5 ? [0.9, -0.3, 0] : [-0.25, -1, 0], yB = 0.7;
  // queue : anneaux, bout plus foncé
  const sTa = sstep(0.45, 0.82, 0.5 + 0.5 * Math.sin(3.3 * tailT * TAIL.len + 3.0 * (nA - 0.5) + 1.0));
  const cTa = mix3(base, C.stripe, Math.max(sTa * 0.9, sstep(0.84, 1.0, tailT) * 0.9));
  const k = Math.min(TAIL.n - 1, Math.floor(tailT * TAIL.n));
  const lTa = 1.25 - 0.4 * sstep(0.75, 1.0, tailT), fTa = vnorm([TAIL.x[k + 1] - TAIL.x[k], TAIL.y[k + 1] - TAIL.y[k], TAIL.z[k + 1] - TAIL.z[k]]), yTa = 0.5;

  const W = [wT, wN, wH, wE, wF, wB, wTa], Cs = [cT, cN, cH, cE, cF, cB, cTa], Ls = [lT, lN, lH, lE, lF, lB, lTa], Fs = [fT, fN, fH, fE, fF, fB, fTa], Ys = [yT, yN, yH, yE, yF, yB, yTa];
  let r = 0, g = 0, b = 0, len = 0, fx = 0, fy = 0, fz = 0, lay = 0;
  for (let i = 0; i < 7; i++) { const w = W[i]; r += w * Cs[i][0]; g += w * Cs[i][1]; b += w * Cs[i][2]; len += w * Ls[i]; fx += w * Fs[i][0]; fy += w * Fs[i][1]; fz += w * Fs[i][2]; lay += w * Ys[i]; }
  len *= 0.84 + 0.34 * nC;
  // épis : la direction du poil varie doucement d'un endroit à l'autre
  fx += 0.5 * (vnoise(px * 0.55 + 31, py * 0.55, pz * 0.55) - 0.5); fy += 0.5 * (vnoise(px * 0.55, py * 0.55 + 17, pz * 0.55) - 0.5); fz += 0.5 * (vnoise(px * 0.55, py * 0.55, pz * 0.55 + 53) - 0.5);
  const fd = fx * nx + fy * ny + fz * nz, ft = vnorm([fx - nx * fd, fy - ny * fd, fz - nz * fd]);
  const tip = vnorm([nx * (1 - lay) + ft[0] * lay, ny * (1 - lay) + ft[1] * lay, nz * (1 - lay) + ft[2] * lay]);
  const skin = Math.max(wNose * wH, inner * (1 - tuft) * wE, wRim * wH, wMouth * wH);
  const dBody = Math.min(dT, dF, dB, dTa), dHd = Math.min(dH, dE);
  const headW = sstep(0.2, 0.8, dBody / (dBody + dHd + 1e-4));
  // occlusion ambiante : on regarde si la surface est encaissée
  let occ = 0; const hs = [0.35, 0.9, 1.8, 3.0], wk = [0.4, 0.3, 0.2, 0.1];
  for (let i = 0; i < 4; i++) occ += wk[i] * clamp(1 - sdf(px + nx * hs[i], py + ny * hs[i], pz + nz * hs[i]) / hs[i], 0, 1);
  let ao = 1 - clamp(occ * 1.25, 0, 0.85);
  if (ny < 0) ao *= lerp(1, sstep(-0.5, 6, py), -ny * 0.6);
  o.col = [r, g, b]; o.ao = ao; o.len = len; o.tip = tip; o.headW = headW; o.tailT = tailT * sstep(0, 0.6, wTa); o.breath = wT * 0.9; o.skin = skin;
}

export { C, THROAT, CHEST, MOUTH, shadeVertex };
