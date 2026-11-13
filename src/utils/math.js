// Outils mathématiques : vecteurs, matrices, bruit.

const nextFrame = () => new Promise(r => requestAnimationFrame(r));

/* ---------- Petites maths ---------- */
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const vnorm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// matrices 3x3 rangées par lignes
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
function m3mul(a, b) { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; }
const m3v = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
const m3t = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
function rotFromTo(a, b) { // rotation la plus courte qui amène a sur b
  const v = vcross(a, b), c = vdot(a, b), k = 1 / (1 + c);
  return [v[0] * v[0] * k + c, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1],
          v[1] * v[0] * k + v[2], v[1] * v[1] * k + c, v[1] * v[2] * k - v[0],
          v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c];
}
// matrices 4x4 rangées par colonnes (convention WebGL)
function m4persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; }
function m4ortho(l, r, b, t, n, f) { const o = new Float32Array(16); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; }
function m4look(e, c, up) {
  const z = vnorm(vsub(e, c)), x = vnorm(vcross(up, z)), y = vcross(z, x), o = new Float32Array(16);
  o[0] = x[0]; o[4] = x[1]; o[8] = x[2]; o[12] = -vdot(x, e);
  o[1] = y[0]; o[5] = y[1]; o[9] = y[2]; o[13] = -vdot(y, e);
  o[2] = z[0]; o[6] = z[1]; o[10] = z[2]; o[14] = -vdot(z, e);
  o[15] = 1; return o;
}
function m4mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
// bruit de valeur
function hash3(i, j, k) { let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1440662683)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let u = x - xi, v = y - yi, w = z - zi; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
  const a = lerp(lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v);
  const b = lerp(lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v);
  return lerp(a, b, w);
}
const fbm = (x, y, z) => (vnoise(x, y, z) + 0.5 * vnoise(2.03 * x + 11.3, 2.03 * y + 5.1, 2.03 * z + 7.7) + 0.25 * vnoise(4.01 * x + 3.7, 4.01 * y + 19.4, 4.01 * z + 1.3)) / 1.75;

export { nextFrame, clamp, lerp, sstep, vnorm, vcross, vdot, vadd, vsub, vscale, mix3, rotX, rotY, rotZ, m3mul, m3v, m3t, rotFromTo, m4persp, m4ortho, m4look, m4mul, hash3, vnoise, fbm };
