import { useLayoutEffect, useRef } from "react";
import type { SceneId } from "../../lib/presets/configs";
import { VERTEX, fragmentSource } from "./shaders";

export type Uniforms = {
  time: number; beat: number; kick: number; bass: number; low: number; mid: number; high: number; energy: number;
  int: number; seed: number; chroma: number; grain: number; bloom: number; drift: number; flick: number; frame: number;
  colors: [number, number, number][];
};

type GLState = { gl: WebGL2RenderingContext; programs: Map<SceneId, WebGLProgram>; buffer: WebGLBuffer };

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("Shader compile error: " + gl.getShaderInfoLog(s));
  return s;
}

function program(st: GLState, scene: SceneId): WebGLProgram {
  const hit = st.programs.get(scene);
  if (hit) return hit;
  const { gl } = st;
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragmentSource(scene)));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Shader link error: " + gl.getProgramInfoLog(p));
  st.programs.set(scene, p);
  return p;
}

/**
 * Draws one shader scene synchronously during React's layout phase, so the frame is
 * complete before Remotion takes its screenshot. One WebGL context per canvas; the
 * canvas is reused across scene changes (programs are cached).
 */
export function ShaderCanvas({ scene, u, width, height, style }: { scene: SceneId; u: Uniforms; width: number; height: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef<GLState | null>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!st.current) {
      const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
      if (!gl) throw new Error("WebGL2 is not available. In Settings, try a different GL backend (e.g. swangle).");
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      st.current = { gl, programs: new Map(), buffer };
    }
    const s = st.current;
    const { gl } = s;
    const p = program(s, scene);
    gl.useProgram(p);
    const loc = gl.getAttribLocation(p, "a_pos");
    gl.bindBuffer(gl.ARRAY_BUFFER, s.buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const f = (n: string, v: number) => gl.uniform1f(gl.getUniformLocation(p, n), v);
    gl.uniform2f(gl.getUniformLocation(p, "u_res"), canvas.width, canvas.height);
    f("u_time", u.time); f("u_beat", u.beat); f("u_kick", u.kick); f("u_bass", u.bass); f("u_low", u.low);
    f("u_mid", u.mid); f("u_high", u.high); f("u_energy", u.energy); f("u_int", u.int); f("u_seed", u.seed);
    f("u_chroma", u.chroma); f("u_grain", u.grain); f("u_bloom", u.bloom); f("u_drift", u.drift); f("u_flick", u.flick); f("u_frame", u.frame);
    u.colors.forEach((c, i) => gl.uniform3f(gl.getUniformLocation(p, `u_c${i}`), c[0], c[1], c[2]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });

  return <canvas ref={ref} width={width} height={height} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }} />;
}
