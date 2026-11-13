// Shaders GLSL (WebGL 2).

/* ---------- Shaders ---------- */
const DEFORM = `
uniform mat3 uHeadRot; uniform vec3 uHeadPivot, uTailPivot, uTailAnim; uniform float uBreath;
void deform(inout vec3 p, inout vec3 n, inout vec3 f, vec4 w){
  p += n*(uBreath*w.z);
  if(w.x>0.0){
    vec3 q=uHeadRot*(p-uHeadPivot)+uHeadPivot;
    p=mix(p,q,w.x); n=normalize(mix(n,uHeadRot*n,w.x)); f=normalize(mix(f,uHeadRot*f,w.x));
  }
  if(w.y>0.0){
    float t=w.y, a=uTailAnim.x*sin(uTailAnim.y-t*2.4)*t, c=cos(a), s=sin(a);
    vec3 r=p-uTailPivot;
    p=uTailPivot+vec3(c*r.x+s*r.z, r.y+uTailAnim.z*t*t*sin(uTailAnim.y*0.6), -s*r.x+c*r.z);
    n=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z); f=vec3(c*f.x+s*f.z,f.y,-s*f.x+c*f.z);
  }
}`;
const FUR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aCol; layout(location=3) in vec4 aFur; layout(location=4) in vec4 aWts;
uniform mat4 uVP, uLightVP; uniform float uShells, uFixedH, uFurLen, uDroop;
${DEFORM}
out vec3 vRest, vN, vT, vCol, vWorld; out vec4 vLP; out float vH, vAO, vLen, vSkin;
vec3 shell(vec3 p, vec3 f, float len, float h){ vec3 d=f*(len*h); d.y-=len*h*h*uDroop; return p+d; }
void main(){
  // chaque « couche » est le même maillage, poussé un peu plus loin le long du poil
  float h = uFixedH>=0.0 ? uFixedH : 1.0-float(gl_InstanceID)/uShells;
  vec3 p=aPos, n=aNrm, f=aFur.xyz;
  deform(p,n,f,aWts);
  float len=aFur.w*uFurLen;
  vec3 wp=shell(p,f,len,h);
  vLP=uLightVP*vec4(shell(p,f,len,max(h,0.7))+n*0.15,1.0);
  vRest=aPos; vN=n; vT=normalize(f-vec3(0.0,2.0*h*uDroop,0.0));
  vCol=pow(aCol.rgb,vec3(2.2)); vAO=aCol.a; vH=h; vLen=len; vSkin=aWts.w; vWorld=wp;
  gl_Position=uVP*vec4(wp,1.0);
}`;
const SHADOW_FN = `
float shadow(vec4 lp, float r){
  vec3 q=lp.xyz/lp.w*0.5+0.5;
  if(q.x<0.0||q.x>1.0||q.y<0.0||q.y>1.0||q.z>1.0) return 1.0;
  float px=r/2048.0, s=0.0;
  s+=texture(uShadow,vec3(q.xy+vec2(-px,-px),q.z)); s+=texture(uShadow,vec3(q.xy+vec2(px,-px),q.z));
  s+=texture(uShadow,vec3(q.xy+vec2(-px,px),q.z));  s+=texture(uShadow,vec3(q.xy+vec2(px,px),q.z));
  s+=texture(uShadow,vec3(q.xy,q.z));
  return s*0.2;
}`;
const FUR_FS = `#version 300 es
precision highp float; precision highp sampler3D; precision highp sampler2DShadow;
in vec3 vRest, vN, vT, vCol, vWorld; in vec4 vLP; in float vH, vAO, vLen, vSkin;
uniform sampler3D uStrand; uniform sampler2DShadow uShadow;
uniform vec3 uCam, uLightDir, uLightCol, uSky, uGround; uniform float uDensity, uClay;
out vec4 o;
${SHADOW_FN}
vec4 strandAt(vec3 q, float k){
  vec3 p=q*exp2(-k); if(mod(k,2.0)>0.5) p=p.zxy;
  return texture(uStrand,p*0.0625+fract(k*vec3(0.37,0.61,0.13)));
}
void main(){
  bool base = vH<0.0001;
  // un poil = une petite colonne autour d'un point tiré au hasard ; elle s'affine vers la pointe
  // Sa largeur à l'écran reste de quelques pixels : on passe d'un niveau de finesse au suivant selon le zoom.
  vec3 q=vRest*uDensity;
  float fw=max(max(length(dFdx(q)),length(dFdy(q))),1e-4);            // cellules par pixel au niveau le plus fin
  float lod=clamp(log2(fw/0.62),0.0,6.0), l0=floor(lod), f=lod-l0;
  float clump=texture(uStrand,vRest*0.035).r, lenK=0.8+0.4*clump;
  vec4 sa=strandAt(q,l0), sb=strandAt(q,l0+1.0);
  float ta=vH/((0.55+0.45*sa.g)*lenK), tb=vH/((0.55+0.45*sb.g)*lenK);
  float ra=0.80*sqrt(1.0-f)*(1.0-0.92*ta), rb=0.80*sqrt(f)*(1.0-0.92*tb);   // sous-poil dense à la racine, brins séparés vers la pointe
  float wa=fw*exp2(-l0)*0.75, wb=wa*0.5;
  float a1=clamp((ra-sa.r*0.75)/wa+0.5,0.0,1.0)*step(ta,1.0), a2=clamp((rb-sb.r*0.75)/wb+0.5,0.0,1.0)*step(tb,1.0);
  float a=max(a1,a2), rnd=a1>a2?sa.g:sb.g;
  if(base){ a=1.0; rnd=0.5; }
  else if(vLen<0.025||a<0.06) discard;

  vec3 N=normalize(vN), T=normalize(vT), V=normalize(uCam-vWorld), L=uLightDir, Hh=normalize(L+V);
  float sh=shadow(vLP,1.3);
  float wrap=clamp((dot(N,L)+0.5)/1.5,0.0,1.0);
  float depth=mix(0.55,1.0,pow(vH,0.7));                 // les racines restent dans l'ombre des pointes
  vec3 hemi=mix(uGround,uSky,0.5+0.5*N.y);
  vec3 alb=vCol;
  if(base) alb*=mix(mix(0.72,1.0,vSkin),1.0,uClay);
  else alb*=(0.80+0.34*vH)*(0.78+0.44*rnd);
  if(base&&uClay>0.5){ depth=1.0; }
  float shf=mix(0.32,1.0,sh);                               // la fourrure diffuse la lumière : ombres douces
  float fill=0.20*max(dot(N,V),0.0);                        // lumière d'appoint près de l'objectif, comme en studio
  vec3 col=alb*((hemi*mix(0.66,1.0,vAO)+fill)*mix(0.70,1.0,max(vH,uClay))+uLightCol*wrap*shf*depth);
  float th=dot(T,Hh);
  col+=uLightCol*pow(max(1.0-th*th,0.0),40.0)*0.10*sh*vH;                      // reflet le long du poil
  float rim=pow(1.0-max(dot(N,V),0.0),2.6);
  col+=alb*(uSky*0.9+uLightCol*0.5*shf)*rim*0.50*vH;                            // duvet à contre-jour
  if(base) col+=uLightCol*pow(max(dot(N,Hh),0.0),70.0)*0.45*max(vSkin,uClay*0.25)*sh;  // truffe humide
  col=mix(col,0.6+0.4*tanh((col-0.6)/0.4),step(0.6,col));  // épaule douce : pas de blanc brûlé
  o=vec4(pow(col,vec3(1.0/2.2)),a);
}`;
const VOID_FS = `#version 300 es
precision mediump float; void main(){}`;
const GROUND_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
uniform mat4 uVP, uLightVP;
out vec3 vW, vN; out vec4 vLP;
void main(){ vW=aPos; vN=aNrm; vLP=uLightVP*vec4(aPos+aNrm*0.05,1.0); gl_Position=uVP*vec4(aPos,1.0); }`;
const GROUND_FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW, vN; in vec4 vLP;
uniform sampler2DShadow uShadow; uniform sampler2D uAO;
uniform vec3 uColor, uLightDir, uLightCol, uSky, uGround, uCam; uniform vec4 uAORect; uniform float uCatcher;
out vec4 o;
${SHADOW_FN}
void main(){
  vec3 N=normalize(vN);
  float sh=shadow(vLP,2.2), ao=1.0;
  vec2 uv=(vW.xz-uAORect.xy)/uAORect.zw;
  if(N.y>0.5&&uv.x>0.0&&uv.x<1.0&&uv.y>0.0&&uv.y<1.0) ao=texture(uAO,uv).r;
  if(uCatcher>0.5){ float k=mix(0.80,1.0,sh)*mix(0.55,1.0,ao); o=vec4(1.0-(1.0-k)*vec3(1.0,0.96,0.90),1.0); return; }   // sol de studio : seules les ombres se voient
  vec3 hemi=mix(uGround,uSky,0.5+0.5*N.y);
  vec3 col=uColor*(hemi*mix(0.5,1.0,ao)+uLightCol*max(dot(N,uLightDir),0.0)*sh);
  vec3 V=normalize(uCam-vW);
  col+=uLightCol*pow(max(dot(N,normalize(uLightDir+V)),0.0),120.0)*0.2*sh;
  o=vec4(pow(col,vec3(1.0/2.2)),1.0);
}`;
const EYE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aDir;
uniform mat4 uVP; uniform vec3 uCenter; uniform float uRadius;
out vec3 vDir, vW;
void main(){ vDir=aDir; vW=uCenter+aDir*uRadius; gl_Position=uVP*vec4(vW,1.0); }`;
const EYE_FS = `#version 300 es
precision highp float;
in vec3 vDir, vW;
uniform vec3 uGaze, uGR, uGU, uLidU, uLidU0, uLidL, uCam, uLightDir, uLightCol, uSky, uGround, uLidCol, uRimCol, uBoxDir, uBoxX, uBoxY; uniform float uLid;
out vec4 o;
void main(){
  vec3 N=normalize(vDir), V=normalize(uCam-vW);
  float su=dot(N,uLidU), sl=dot(N,uLidL), ndl=max(dot(N,uLightDir),0.0);
  vec3 hemi=mix(uGround,uSky,0.5+0.5*N.y);
  if(uLid>0.5){                                          // coque des paupières : bord net, liseré sombre
    float su0=dot(N,uLidU0), e, al=1.0;                   // su0 : paupière au repos, su : paupière en mouvement
    if(su0<0.0&&sl<0.0){ if(su<0.0) discard; e=su; }      // la paupière qui descend pendant un clignement
    else { e=max(su0,sl); if(e>0.19) discard; al=1.0-smoothstep(0.11,0.19,e); }   // au repos, seul le bord est lisse, le reste est poilu
    float wrap=clamp((dot(N,uLightDir)+0.5)/1.5,0.0,1.0);
    float grain=fract(sin(dot(floor(N.xy*140.0)+floor(N.z*140.0),vec2(12.9898,78.233)))*43758.5453);
    vec3 c=mix(uRimCol,uLidCol*(0.90+0.16*grain),smoothstep(0.02,0.12,e))*(hemi*0.85+uLightCol*wrap*0.85);
    o=vec4(pow(c,vec3(1.0/2.2)),al); return;
  }
  if(su>0.0||sl>0.0){ o=vec4(0.05,0.035,0.03,1.0); return; }   // sous la paupière
  vec2 uv=vec2(dot(N,uGR),dot(N,uGU));
  float r=length(uv)/0.86, ang=atan(uv.y,uv.x);
  float fib=0.5+0.5*sin(ang*41.0+3.0*sin(ang*13.0+r*4.0));
  vec3 iris=mix(vec3(0.25,0.34,0.42),vec3(0.07,0.11,0.17),smoothstep(0.45,0.98,r));     // bleu-gris de chaton
  iris*=0.80+0.40*fib*smoothstep(0.35,0.7,r);
  iris*=mix(1.0,0.25,smoothstep(0.84,1.0,r));
  vec3 sclera=vec3(0.22,0.17,0.15);
  vec3 col=mix(iris,sclera,smoothstep(0.98,1.06,r));
  if(dot(N,uGaze)<0.0) col=sclera;
  float pr=length(uv/vec2(0.44,0.60));
  col+=vec3(0.07,0.10,0.10)*(1.0-smoothstep(1.0,1.35,pr));
  col=mix(vec3(0.003),col,smoothstep(0.94,1.04,pr));       // grande pupille ovale
  float occ=1.0-0.60*smoothstep(-0.50,0.0,su)-0.22*smoothstep(-0.30,0.0,sl);
  col*=(hemi*1.1+uLightCol*(0.3+0.9*ndl))*occ;
  vec3 R=reflect(-V,N);                                    // reflets sur la cornée : une boîte à lumière près de l'objectif
  float a=dot(R,uBoxDir), box=0.0;
  if(a>0.0){ vec2 p=vec2(dot(R,uBoxX),dot(R,uBoxY))/a; box=(1.0-smoothstep(0.13,0.17,abs(p.x)))*(1.0-smoothstep(0.19,0.24,abs(p.y))); }
  float key=pow(max(dot(R,uLightDir),0.0),500.0);
  float fres=0.03+0.97*pow(1.0-max(dot(N,V),0.0),5.0);
  vec3 env=mix(uGround*0.5,uSky*1.4,smoothstep(-0.3,0.5,R.y));
  col+=(env*fres+vec3(box*0.95+key*1.5))*mix(0.35,1.0,occ);
  o=vec4(pow(col,vec3(1.0/2.2)),1.0);
}`;
const WHISK_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aTan; layout(location=2) in vec2 aSU;
uniform mat4 uVP; uniform vec3 uCam, uHeadPivot; uniform mat3 uHeadRot; uniform float uWidth;
out vec2 vSU;
void main(){
  vec3 p=uHeadRot*(aPos-uHeadPivot)+uHeadPivot, t=uHeadRot*aTan;
  p+=normalize(cross(t,normalize(uCam-p)))*aSU.x*uWidth*mix(1.0,0.2,aSU.y);
  vSU=aSU; gl_Position=uVP*vec4(p,1.0);
}`;
const WHISK_FS = `#version 300 es
precision highp float;
in vec2 vSU; out vec4 o;
void main(){ float a=(1.0-vSU.x*vSU.x)*0.82*(1.0-smoothstep(0.9,1.0,vSU.y)); o=vec4(vec3(0.99,0.98,0.96)*a,a); }`;

export { DEFORM, FUR_VS, SHADOW_FN, FUR_FS, VOID_FS, GROUND_VS, GROUND_FS, EYE_VS, EYE_FS, WHISK_VS, WHISK_FS };
