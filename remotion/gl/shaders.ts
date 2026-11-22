// Fragment shaders for the free visualizer. Every scene defines `vec3 scene(vec2 uv)`;
// the shared header/footer add palette, noise, chromatic aberration, bloom, vignette and grain.
import type { SceneId } from "../../lib/presets/configs";

const HEADER = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time, u_beat, u_kick, u_bass, u_low, u_mid, u_high, u_energy, u_int, u_seed;
uniform float u_chroma, u_grain, u_bloom, u_drift, u_flick, u_frame;
uniform vec3 u_c0, u_c1, u_c2, u_c3;
out vec4 fragColor;

#define PI 3.14159265
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float hash1(float n){ return fract(sin(n)*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return v; }
// 4-stop palette, t in [0,1]
vec3 pal(float t){ t=clamp(t,0.,1.)*3.;
  if(t<1.) return mix(u_c0,u_c1,t); if(t<2.) return mix(u_c1,u_c2,t-1.); return mix(u_c2,u_c3,t-2.); }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
`;

const FOOTER = /* glsl */ `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / u_res.y;
  vec3 c;
  float ab = u_chroma * (0.004 + 0.02*u_kick);
  if (ab > 0.0005) {
    c.r = scene(uv*(1.+ab)).r; c.g = scene(uv).g; c.b = scene(uv*(1.-ab)).b;
  } else c = scene(uv);
  c += c*c*u_bloom*(0.25 + 0.9*u_bass);
  c *= 1. + u_flick*(hash1(u_frame*1.37)-0.5);
  c *= 1. - 0.55*dot(uv*vec2(0.8,1.), uv*vec2(0.8,1.));
  c += (hash(floor(gl_FragCoord.xy*0.5) + fract(u_frame*0.137)*311.) - 0.5) * u_grain * 0.12;
  fragColor = vec4(clamp(c, 0., 1.), 1.);
}
`;

const SCENES: Record<SceneId, string> = {
  tunnel: /* glsl */ `
vec3 scene(vec2 uv){
  uv *= rot(u_time*0.05 + u_seed*6.28);
  float r = length(uv), a = atan(uv.y, uv.x);
  float z = 0.32/max(r, 0.015) + u_time*1.6;
  float rings = smoothstep(0.38, 0.5, abs(fract(z*0.5 + u_seed) - 0.5));
  float sides = 4. + floor(u_seed*4.)*2.;
  float spokes = 0.5 + 0.5*cos(a*sides + z*0.35);
  vec3 col = pal(fract(z*0.04 + u_seed + u_drift*0.05*sin(u_time*0.2))) * (0.25 + 0.85*rings) * (0.55 + 0.45*spokes);
  col *= smoothstep(0., 0.4, r) * 2.2;
  col += pal(0.95) * rings * u_kick * 0.8 * smoothstep(0.6, 0.1, r);
  return col;
}`,
  particles: /* glsl */ `
vec3 scene(vec2 uv){
  vec3 col = mix(pal(0.0), pal(0.2), 0.5 + 0.5*uv.y) * 0.55;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float depth = fract(fi*0.2 + u_time*0.06);
    float sc = mix(24., 1.6, depth);
    vec2 p = uv*rot(fi + u_seed*3.) * sc + vec2(fi*13.1 + u_seed*7., fi*7.7);
    vec2 id = floor(p), f = fract(p) - 0.5;
    vec2 off = (vec2(hash(id), hash(id+3.1)) - 0.5) * 0.7;
    float d = length(f - off);
    float size = 0.025 + 0.05*hash(id+1.7);
    float s = smoothstep(size, 0., d) * depth * smoothstep(1., 0.8, depth);
    float glow = 0.015/(d*d*40. + 0.05) * depth * 0.05;
    col += (s*2. + glow) * pal(0.45 + 0.55*hash(id+9.)) * (0.8 + u_kick*1.6 + u_high*0.8);
  }
  return col;
}`,
  liquid: /* glsl */ `
vec3 scene(vec2 uv){
  vec2 p = uv*1.25 + u_seed*4.;
  float t = u_time*0.12;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2,1.3) - t));
  vec2 r = vec2(fbm(p + 3.5*q + vec2(1.7,9.2) + t*0.7), fbm(p + 3.5*q + vec2(8.3,2.8) - t*0.6));
  float f = fbm(p + 3.5*r + u_bass*0.3);
  vec3 col = pal(clamp(f*1.05 + 0.08*sin(u_time*0.13)*u_drift + 0.1*u_mid, 0., 1.));
  col *= 0.55 + 0.9*f*f + 0.25*u_kick;
  col += pal(0.95) * pow(max(r.x, 0.), 6.) * 0.6;
  return col;
}`,
  lasers: /* glsl */ `
vec3 scene(vec2 uv){
  float smoke = fbm(uv*2.2 + vec2(0., -u_time*0.25) + u_seed*5.);
  vec3 col = pal(0.0)*0.5 + pal(0.25)*smoke*0.3;
  vec2 o = vec2(0., -0.62);
  for (int i = 0; i < 11; i++) {
    float fi = float(i);
    float ang = (fi - 5.)*0.16 + sin(u_time*0.9 + fi*1.3 + u_seed*6.28)*0.32*(0.35 + u_high);
    vec2 dir = vec2(sin(ang), cos(ang));
    vec2 d = uv - o;
    float along = dot(d, dir);
    float perp = abs(d.x*dir.y - d.y*dir.x);
    float w = 0.0025 + 0.006*u_kick;
    float beam = (smoothstep(w*4., 0., perp) + 0.25*smoothstep(w*25., 0., perp)) * step(0., along) * (0.5 + 0.7*smoke);
    col += beam * pal(0.55 + 0.45*fract(fi*0.37 + u_seed)) * (0.7 + 1.6*u_kick + 0.5*u_high);
  }
  return col;
}`,
  terrain: /* glsl */ `
vec3 scene(vec2 uv){
  float hz = 0.02;
  vec3 sky = mix(pal(0.15), pal(0.0), clamp((uv.y - hz)*1.8, 0., 1.));
  vec3 col = sky;
  vec2 sp = uv - vec2(0.15*(u_seed - 0.5), 0.17);
  float sunD = length(sp);
  float stripes = step(0., sin(sp.y*70. - u_time*1.5));
  float sun = smoothstep(0.27, 0.262, sunD) * (sp.y > -0.02 ? 1. : stripes);
  col = mix(col, mix(pal(0.7), pal(0.98), clamp(sp.y*3. + 0.5, 0., 1.)) * (1. + 0.4*u_bass), sun);
  col += pal(0.8) * 0.06/(sunD*sunD*8. + 0.3) * (0.4 + u_bass);
  if (uv.y < hz) {
    float depth = hz - uv.y;
    float z = 0.22/depth;
    float x = uv.x*z;
    float zz = z + u_time*2.4;
    float h = fbm(vec2(x*0.25, zz*0.25) + u_seed*9.);
    vec2 g = abs(fract(vec2(x + h*0.6, zz)) - 0.5);
    float line = smoothstep(0.035 + 0.015*z, 0., min(g.x, g.y));
    float fade = exp(-z*0.05);
    vec3 ground = pal(0.02)*0.6 + pal(0.55 + 0.4*h) * line * (0.7 + 1.3*u_kick);
    col = mix(sky*0.6 + pal(0.8)*0.15, ground, fade);
  }
  return col;
}`,
  kaleido: /* glsl */ `
vec3 scene(vec2 uv){
  float r = length(uv), a = atan(uv.y, uv.x);
  float n = 6. + floor(u_seed*4.)*2.;
  float seg = 2.*PI/n;
  a = mod(a + u_time*0.08, seg);
  a = abs(a - seg*0.5);
  vec2 p = vec2(cos(a), sin(a)) * r;
  p *= 2.2 - u_kick*0.25;
  p += vec2(u_time*0.25, u_seed*3.);
  float f = fbm(p*1.4);
  float rings = 0.5 + 0.5*sin(r*18. - u_time*2.5 + f*6.);
  vec3 col = pal(fract(f*0.9 + r*0.25 + u_time*0.02)) * (0.35 + 0.9*rings*f);
  col += pal(0.95) * u_kick * smoothstep(0.55, 0., r) * 0.6;
  return col;
}`,
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

export function fragmentSource(id: SceneId): string {
  return HEADER + SCENES[id] + FOOTER;
}

export const VERTEX = /* glsl */ `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0., 1.); }`;
