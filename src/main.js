// Point d'entrée : WebGL, interface, caméra orbitale et boucle d'affichage.
import { nextFrame, clamp, lerp, vnorm, vcross, vdot, vadd, vsub, vscale, m3v, m3t, rotFromTo, m4persp, m4ortho, m4look, m4mul } from './utils/math.js';
import { HEAD_C, HS, RH, HEAD_PIVOT, EYE, TAIL } from './kitten/shape.js';
import { C } from './kitten/coat.js';
import { buildKitten } from './kitten/mesh.js';
import { eyeData, buildWhiskers, strandTexture, AO_RECT, groundAO } from './kitten/details.js';
import { FUR_VS, FUR_FS, VOID_FS, GROUND_VS, GROUND_FS, EYE_VS, EYE_FS, WHISK_VS, WHISK_FS } from './render/shaders.js';

const $ = s => document.querySelector(s);
const canvas = $('#gl');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Rendu ---------- */
const loader = $('#loader');
const report = p => { $('#loader-bar').style.width = Math.round(p * 100) + '%'; };
const fail = msg => { loader.hidden = false; loader.classList.add('err'); $('#loader-txt').textContent = msg; };

const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
const NO_WEBGL = "Ce navigateur n'active pas WebGL 2 : le chaton ne peut pas s'afficher ici. Essaie avec Chrome, Edge ou Firefox à jour.";

function program(vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
function vao(attrs, idx) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  attrs.forEach(([data, size, type, norm], loc) => { gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, !!norm, 0, 0); });
  if (idx) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); }
  gl.bindVertexArray(null); return v;
}

const state = {
  scene: 'plateforme',
  shells: 32, auto: true,
  furLen: 1, fur: true,
  anim: !reduced, rot: !reduced,
};
const HOME = { az: 150 * Math.PI / 180, el: 9 * Math.PI / 180, dist: 72 };
const cam = { az: HOME.az, el: HOME.el, dist: HOME.dist, vaz: 0, vel: 0 };
const TARGET = [-2.2, 9.2, 0];
const LIGHT = vnorm([0.735, 1.0, -0.272]);
const SCENES = {
  // fond rose et plateforme rouge brique
  plateforme: { bg: [0xfc / 255, 0xa9 / 255, 0x9f / 255], slab: [0x7f / 255, 0x2a / 255, 0x22 / 255], light: [0.84, 0.80, 0.74], sky: [0.44, 0.44, 0.47], ground: [0.40, 0.30, 0.28] },
  studio: { bg: [0xf3 / 255, 0xf1 / 255, 0xed / 255], slab: null, light: [0.80, 0.78, 0.74], sky: [0.48, 0.49, 0.52], ground: [0.44, 0.43, 0.41] },
};

async function main() {
  report(0.02); await nextFrame();
  const strand = strandTexture();
  report(0.04); await nextFrame();
  const K = await buildKitten(report);
  const whiskers = buildWhiskers();
  const gao = groundAO();
  report(0.97); await nextFrame();

  const pFur = program(FUR_VS, FUR_FS), pShadow = program(FUR_VS, VOID_FS), pGround = program(GROUND_VS, GROUND_FS), pEye = program(EYE_VS, EYE_FS), pWhisk = program(WHISK_VS, WHISK_FS);
  const vKitten = vao([[K.pos, 3, gl.FLOAT], [K.nrm, 3, gl.FLOAT], [K.col, 4, gl.UNSIGNED_BYTE, 1], [K.fur, 4, gl.FLOAT], [K.wts, 4, gl.UNSIGNED_BYTE, 1]], K.idx);
  const vWhisk = vao([[whiskers.pos, 3, gl.FLOAT], [whiskers.tan, 3, gl.FLOAT], [whiskers.su, 2, gl.FLOAT]], whiskers.idx);
  // globe oculaire : sphère unité
  const sp = [], si = [], SU = 40, SV = 28;
  for (let j = 0; j <= SV; j++) for (let i = 0; i <= SU; i++) { const th = j / SV * Math.PI, ph = i / SU * 2 * Math.PI; sp.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)); }
  for (let j = 0; j < SV; j++) for (let i = 0; i < SU; i++) { const a = j * (SU + 1) + i, b = a + SU + 1; si.push(a, a + 1, b, a + 1, b + 1, b); }
  const vEye = vao([[new Float32Array(sp), 3, gl.FLOAT]], new Uint16Array(si));
  // plateforme rouge et grand sol du studio
  const boxMesh = (x0, x1, y0, y1, z0, z1) => {
    const p = [], n = [], ix = [];
    const face = (a, b, c, d, nn) => { const s = p.length / 3; p.push(...a, ...b, ...c, ...d); n.push(...nn, ...nn, ...nn, ...nn); ix.push(s, s + 1, s + 2, s, s + 2, s + 3); };
    face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    return { v: vao([[new Float32Array(p), 3, gl.FLOAT], [new Float32Array(n), 3, gl.FLOAT]], new Uint16Array(ix)), n: ix.length };
  };
  const slab = boxMesh(-31, 26, -1.14, 0, -28.5, 28.5), floor = boxMesh(-400, 400, -0.5, 0, -400, 400);

  // textures
  const tStrand = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, tStrand);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG8, strand.S, strand.S, strand.S, 0, gl.RG, gl.UNSIGNED_BYTE, strand.data);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const SM = 2048, tShadow = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tShadow);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SM, SM, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tShadow, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const tAO = gl.createTexture(); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tAO);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gao.W, gao.H, 0, gl.RED, gl.UNSIGNED_BYTE, gao.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const lightVP = m4mul(m4ortho(-27, 27, -22, 22, 1, 140), m4look(vadd([-3, 8, 0], vscale(LIGHT, 70)), [-3, 8, 0], [0, 1, 0]));
  const eyes = [eyeData(1), eyeData(-1)];
  const HEAD_F = m3v(RH, 1, 0, 0);
  const lidCol = C.light.map(c => Math.pow(c, 2.2) * 0.9), rimCol = C.rim.map(c => Math.pow(c, 2.2));
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  /* ---- interface ---- */
  const body = document.body, panel = $('#panel');
  if (innerWidth < 760) panel.open = false;
  const el = { shells: $('#shells'), shellsOut: $('#shells-out'), auto: $('#auto'), len: $('#len'), lenOut: $('#len-out'), fur: $('#fur'), anim: $('#anim'), rot: $('#rot') };
  const nf = n => n.toLocaleString('fr-FR');
  const syncUI = () => {
    body.dataset.scene = state.scene;
    document.querySelectorAll('input[name=scene]').forEach(r => { r.checked = r.value === state.scene; });
    el.shells.value = state.shells; el.shellsOut.textContent = state.shells; el.auto.checked = state.auto;
    el.len.value = Math.round(state.furLen * 100); el.lenOut.textContent = Math.round(state.furLen * 100) + ' %';
    el.fur.checked = state.fur; el.anim.checked = state.anim; el.rot.checked = state.rot;
    $('#st-mesh').textContent = nf(K.nt) + ' triangles';
    $('#st-fur').textContent = state.fur ? state.shells + ' couches, ' + nf(Math.round(K.nt * state.shells / 1e5) / 10) + ' M de triangles par image' : 'masqué, sculpture seule';
  };
  let dirty = true, lastInput = -1e9;
  const touch = () => { dirty = true; };
  document.querySelectorAll('input[name=scene]').forEach(r => r.addEventListener('change', () => { state.scene = r.value; syncUI(); touch(); }));
  el.shells.addEventListener('input', () => { state.shells = +el.shells.value; state.auto = false; syncUI(); touch(); });
  el.auto.addEventListener('change', () => { state.auto = el.auto.checked; });
  el.len.addEventListener('input', () => { state.furLen = el.len.value / 100; syncUI(); touch(); });
  el.fur.addEventListener('change', () => { state.fur = el.fur.checked; syncUI(); touch(); });
  el.anim.addEventListener('change', () => { state.anim = el.anim.checked; touch(); });
  el.rot.addEventListener('change', () => { state.rot = el.rot.checked; lastInput = -1e9; touch(); });
  $('#reset').addEventListener('click', () => { cam.az = HOME.az; cam.el = HOME.el; cam.dist = HOME.dist; cam.vaz = cam.vel = 0; lastInput = performance.now() / 1000; touch(); });

  /* ---- caméra orbitale : glisser, molette, pincement, clavier ---- */
  const ptrs = new Map(); let pinch = 0;
  const look = { x: 0, y: 0, tx: 0, ty: 0, last: -1e9 };
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; lastInput = performance.now() / 1000; });
  canvas.addEventListener('pointermove', e => {
    const now = performance.now() / 1000;
    if (!ptrs.has(e.pointerId)) { look.tx = (e.clientX / innerWidth) * 2 - 1; look.ty = 1 - (e.clientY / innerHeight) * 2; look.last = now; return; }
    const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY; lastInput = now;
    if (ptrs.size === 1) { cam.vaz = -dx * 0.0065; cam.vel = dy * 0.0055; cam.az += cam.vaz; cam.el += cam.vel; }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.dist *= pinch / d; pinch = d; }
    touch();
  });
  const up = e => { ptrs.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); lastInput = performance.now() / 1000; touch(); }, { passive: false });
  canvas.addEventListener('dblclick', () => $('#reset').click());
  canvas.addEventListener('keydown', e => {
    const k = e.key; let used = true;
    if (k === 'ArrowLeft') cam.az += 0.09; else if (k === 'ArrowRight') cam.az -= 0.09; else if (k === 'ArrowUp') cam.el += 0.06; else if (k === 'ArrowDown') cam.el -= 0.06;
    else if (k === '+' || k === '=') cam.dist *= 0.92; else if (k === '-') cam.dist *= 1.08; else used = false;
    if (used) { e.preventDefault(); lastInput = performance.now() / 1000; touch(); }
  });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('Le rendu 3D a été interrompu par le navigateur. Recharge la page pour retrouver le chaton.'); });

  /* ---- taille du canevas ---- */
  let pixelRatio = Math.min(devicePixelRatio || 1, 2), cw = 0, ch = 0;
  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * pixelRatio)), h = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
    if (w !== cw || h !== ch) { canvas.width = cw = w; canvas.height = ch = h; dirty = true; }
  };

  /* ---- boucle d'affichage ---- */
  let last = 0, ft = 16, ftClock = 0, blinkAt = 2.5, blink = 0, blinkDur = 0.17, frames = 0, animT = 0;
  syncUI();
  loader.hidden = true;

  function frame(ms) {
    requestAnimationFrame(frame);
    const t = ms / 1000, dt = Math.min(0.05, Math.max(0.001, t - last)); last = t;
    resize();
    const idle = t - lastInput > 3.5;
    if (ptrs.size === 0) {                                  // inertie puis rotation automatique
      if (Math.abs(cam.vaz) + Math.abs(cam.vel) > 1e-4) { cam.az += cam.vaz; cam.el += cam.vel; cam.vaz *= 0.90; cam.vel *= 0.90; dirty = true; }
      if (state.rot && idle) { cam.az += dt * 0.20; dirty = true; }
    }
    cam.el = clamp(cam.el, 0.03, 1.45); cam.dist = clamp(cam.dist, 26, 150);
    if (!dirty && !state.anim) return;
    dirty = false;
    if (state.anim) animT += dt;

    const S = SCENES[state.scene], asp = cw / ch;
    const fovy = asp > 1.25 ? 35 * Math.PI / 180 : 2 * Math.atan(Math.tan(17.5 * Math.PI / 180) * 1.25 / asp);
    const ce = Math.cos(cam.el), eye = [TARGET[0] + cam.dist * ce * Math.sin(cam.az), TARGET[1] + cam.dist * Math.sin(cam.el), TARGET[2] + cam.dist * ce * Math.cos(cam.az)];
    const view = m4look(eye, TARGET, [0, 1, 0]), VP = m4mul(m4persp(fovy, asp, 2, 600), view);
    const right = [view[0], view[4], view[8]], upv = [view[1], view[5], view[9]];

    // animation : la tête suit le curseur (ou flâne), la queue ondule, le chaton respire et cligne des yeux
    let Rd = I3, tailA = [0, 0, 0], breath = 0;
    if (state.anim) {
      if (t - look.last > 3) { look.tx = 0.55 * Math.sin(animT * 0.31); look.ty = 0.35 * Math.sin(animT * 0.47 + 1); }
      const k = 1 - Math.exp(-dt * 5); look.x += (look.tx - look.x) * k; look.y += (look.ty - look.y) * k;
      Rd = rotFromTo(HEAD_F, vnorm(vadd(HEAD_F, vadd(vscale(right, look.x * 0.36), vscale(upv, look.y * 0.24)))));
      tailA = [0.17, animT * 1.6, 0.9]; breath = 0.05 * Math.sin(animT * 2.3);
      if (animT > blinkAt) { blink = 0.0001; blinkDur = Math.random() < 0.2 ? 0.9 : 0.17; blinkAt = animT + 2.2 + 3.5 * Math.random(); }   // parfois un clignement lent, le « bisou de chat »
      if (blink > 0) { blink += dt / blinkDur; if (blink >= 1) blink = 0; }
    } else blink = 0;
    const lidClose = blink > 0 ? Math.sin(Math.PI * blink) : 0;
    const headRot = new Float32Array(m3t(Rd));
    const xf = p => vadd(m3v(Rd, p[0] - HEAD_PIVOT[0], p[1] - HEAD_PIVOT[1], p[2] - HEAD_PIVOT[2]), HEAD_PIVOT);
    const rv = v => m3v(Rd, v[0], v[1], v[2]);

    const common = (P, vp) => {
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.uVP, false, vp); gl.uniformMatrix4fv(P.u.uLightVP, false, lightVP);
      gl.uniform3fv(P.u.uCam, eye); gl.uniform3fv(P.u.uLightDir, LIGHT); gl.uniform3fv(P.u.uLightCol, S.light); gl.uniform3fv(P.u.uSky, S.sky); gl.uniform3fv(P.u.uGround, S.ground);
      gl.uniformMatrix3fv(P.u.uHeadRot, false, headRot); gl.uniform3fv(P.u.uHeadPivot, HEAD_PIVOT); gl.uniform3fv(P.u.uTailPivot, TAIL.P0); gl.uniform3fv(P.u.uTailAnim, tailA); gl.uniform1f(P.u.uBreath, breath);
      gl.uniform1f(P.u.uFurLen, state.furLen); gl.uniform1f(P.u.uDroop, 0.24); gl.uniform1f(P.u.uDensity, 16.0);
      gl.uniform1i(P.u.uStrand, 0); gl.uniform1i(P.u.uShadow, 1); gl.uniform1i(P.u.uAO, 2);
    };

    // 1. carte d'ombres vue depuis la lumière
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, SM, SM);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
    common(pShadow, lightVP); gl.uniform1f(pShadow.u.uFixedH, state.fur ? 0.7 : 0);
    gl.bindVertexArray(vKitten); gl.drawElements(gl.TRIANGLES, K.idx.length, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // 2. image
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch);
    gl.clearColor(S.bg[0], S.bg[1], S.bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    common(pGround, VP); gl.uniform4fv(pGround.u.uAORect, AO_RECT);
    if (S.slab) { gl.uniform1f(pGround.u.uCatcher, 0); gl.uniform3fv(pGround.u.uColor, S.slab.map(c => Math.pow(c, 2.2))); gl.bindVertexArray(slab.v); gl.drawElements(gl.TRIANGLES, slab.n, gl.UNSIGNED_SHORT, 0); }
    else { gl.uniform1f(pGround.u.uCatcher, 1); gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.ZERO); gl.bindVertexArray(floor.v); gl.drawElements(gl.TRIANGLES, floor.n, gl.UNSIGNED_SHORT, 0); gl.disable(gl.BLEND); }

    common(pFur, VP); gl.uniform1f(pFur.u.uFixedH, 0); gl.uniform1f(pFur.u.uClay, state.fur ? 0 : 1);
    gl.bindVertexArray(vKitten); gl.drawElements(gl.TRIANGLES, K.idx.length, gl.UNSIGNED_INT, 0);          // peau et sous-poil

    const toCam = vnorm(vsub(eye, xf(HEAD_C))), hf = rv(HEAD_F);
    let gd = vnorm(vadd(vscale(hf, 0.55), vscale(toCam, 0.45)));                                          // le regard est attiré par la caméra
    const cg = vdot(gd, hf); if (cg < 0.914) { const pp = vnorm(vsub(gd, vscale(hf, cg))); gd = vnorm(vadd(vscale(hf, 0.914), vscale(pp, 0.406))); }
    const Rg = rotFromTo(hf, gd);
    const bdir = vnorm(vadd(vadd(vscale(right, -0.40), vscale(upv, 0.40)), vscale(toCam, 0.82))), bx = vnorm(vcross([0, 1, 0], bdir)), by = vcross(bdir, bx);
    common(pEye, VP); gl.uniform3fv(pEye.u.uLidCol, lidCol); gl.uniform3fv(pEye.u.uRimCol, rimCol); gl.uniform3fv(pEye.u.uBoxDir, bdir); gl.uniform3fv(pEye.u.uBoxX, bx); gl.uniform3fv(pEye.u.uBoxY, by);
    gl.bindVertexArray(vEye);
    for (const E of eyes) {
      const c = xf(E.c), f = rv(E.f), u = rv(E.u);
      const g = m3v(Rg, f[0], f[1], f[2]);
      const gr = vnorm(vcross(u, g)), gu = vcross(g, gr);
      const a = lerp(EYE.au, EYE.al + 0.03, lidClose);
      gl.uniform3fv(pEye.u.uCenter, c); gl.uniform3fv(pEye.u.uGaze, g); gl.uniform3fv(pEye.u.uGR, gr); gl.uniform3fv(pEye.u.uGU, gu);
      gl.uniform3fv(pEye.u.uLidU, vsub(vscale(u, Math.cos(a)), vscale(f, Math.sin(a))));
      gl.uniform3fv(pEye.u.uLidU0, vsub(vscale(u, Math.cos(EYE.au)), vscale(f, Math.sin(EYE.au))));
      gl.uniform3fv(pEye.u.uLidL, vscale(vsub(vscale(u, Math.cos(EYE.al)), vscale(f, Math.sin(EYE.al))), -1));
      gl.uniform1f(pEye.u.uLid, 0); gl.uniform1f(pEye.u.uRadius, EYE.r * HS); gl.drawElements(gl.TRIANGLES, si.length, gl.UNSIGNED_SHORT, 0);
      gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.uniform1f(pEye.u.uLid, 1); gl.uniform1f(pEye.u.uRadius, (EYE.rl + 0.035) * HS); gl.drawElements(gl.TRIANGLES, si.length, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }

    if (state.fur) {                                         // les couches de poils, de la plus extérieure à la plus proche de la peau
      common(pFur, VP); gl.uniform1f(pFur.u.uFixedH, -1); gl.uniform1f(pFur.u.uShells, state.shells); gl.uniform1f(pFur.u.uClay, 0);
      gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.bindVertexArray(vKitten); gl.drawElementsInstanced(gl.TRIANGLES, K.idx.length, gl.UNSIGNED_INT, 0, state.shells);
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }
    // moustaches
    gl.useProgram(pWhisk.p); gl.uniformMatrix4fv(pWhisk.u.uVP, false, VP); gl.uniform3fv(pWhisk.u.uCam, eye); gl.uniform3fv(pWhisk.u.uHeadPivot, HEAD_PIVOT); gl.uniformMatrix3fv(pWhisk.u.uHeadRot, false, headRot);
    gl.uniform1f(pWhisk.u.uWidth, Math.max(0.022, cam.dist * 0.00062));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(vWhisk); gl.drawElements(gl.TRIANGLES, whiskers.idx.length, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);

    // 3. qualité automatique : on garde une image fluide
    frames++; ft += (dt * 1000 - ft) * 0.1;
    if (state.auto && state.fur && t - ftClock > 0.8 && frames > 20) {
      ftClock = t;
      if (ft > 30 && state.shells > 12) { state.shells = Math.max(12, state.shells - 8); syncUI(); }
      else if (ft > 30 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.5); }
      else if (ft < 17.5 && state.shells < 64) { state.shells += 4; syncUI(); }
    }
  }
  addEventListener('resize', touch);
  requestAnimationFrame(frame);
}
if (!gl) fail(NO_WEBGL);
else main().catch(e => { console.error(e); fail("Le chaton n'a pas pu être construit : " + e.message); });
