import React, { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, Freeze, Img, OffthreadVideo, getRemotionEnvironment, useVideoConfig } from "remotion";
import { presetConfig, type PresetConfig } from "../lib/presets/configs";
import { ShaderCanvas, type Uniforms } from "./gl/ShaderCanvas";
import { beatInfo, envAt, envMax, hexToRgb, hueRotate, motionTime, rand, sectionAt } from "./lib/music";
import { buildTimeline, clipTime, segmentAt, velocityRamp, type Segment } from "./lib/timeline";
import type { VideoProps } from "./types";
import { whipPan, zoomThrough } from "./transitions";
import { AccentFlash, LightSweep, accentHits, beatAccentAt, cameraShake } from "./fxPorts";
import { AnamorphicFlare, HalftoneOverlay, OrganicLeaks, PixelateGrid, VhsOverlay, WaveformBars, cameraMove, chromaWipe, dirFromSeed, freezeCut, pushWipe, whiteThrough, zoomBlur } from "./fxPack";
import { lastIndexAtOrBefore } from "./lib/music";
import { ArtistCaptions } from "./artistCaptions";
import { Captions, LightLeak, Letterbox, RgbSplitFilter, capcutCamera, clapSplit, isCapcut, velocityOffset } from "./EditFx";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Props = VideoProps & {
  /** Song time in seconds to draw. */
  t: number;
  /** Composition frame (for grain/flicker seeds). */
  frame: number;
  /** Distinguishes GL canvases when two Visuals are on screen (loop crossfade). */
  slotPrefix?: string;
  /** Shader resolution multiplier (previews can render at half resolution). */
  glScale?: number;
  /** Loops and thumbnails never show captions. */
  noCaptions?: boolean;
};

export function Visual(props: Props) {
  const { map, style, t, frame } = props;
  const { width, height, fps } = useVideoConfig();
  const preset = presetConfig(props.preset);
  const segs = useMemo(() => buildTimeline(map, preset, style, props.mode, props.clips, props.bridges ?? []), [map, preset, style, props.mode, props.clips, props.bridges]);
  const colors = useMemo(() => preset.palette.map((h) => hueRotate(hexToRgb(h), style.hueShift)), [preset, style.hueShift]);

  const si = segmentAt(segs, t);
  const cur = segs[si];
  const prev = si > 0 ? segs[si - 1] : null;
  const local = t - cur.start;
  const p = cur.transitionSeconds > 0 ? clamp01(local / cur.transitionSeconds) : 1;

  const fpsE = map.env.fps;
  const kick = envMax(map.env.kick, fpsE, t, 1 / fps);
  const bass = envAt(map.env.bass, fpsE, t);
  const high = envAt(map.env.high, fpsE, t);
  const rms = envAt(map.env.rms, fpsE, t);
  const b = beatInfo(map, t);
  const r = preset.reactive;
  const k = style.intensity;
  const section = map.sections[sectionAt(map, t)];
  const capcut = isCapcut(style);
  const vel = capcut ? 0.9 * Math.min(1.5, k) : 0;
  const velNow = velocityOffset(map, t, vel);

  const baseU = (seg: Segment, tt: number = t): Uniforms => ({
    time: (motionTime(map, tt) + (tt === t ? velNow : velocityOffset(map, tt, vel))) * r.speed + seg.seed * 50,
    beat: b.phase,
    kick: kick * Math.min(1.5, k),
    bass, low: envAt(map.env.low, fpsE, t), mid: envAt(map.env.mid, fpsE, t), high,
    energy: rms, int: k, seed: seg.seed,
    chroma: r.chroma * k, grain: r.grain * k, bloom: r.bassBloom * k, drift: r.drift,
    flick: r.hatFlicker * k * envAt(map.env.high, fpsE, t), frame,
    colors: colors as [number, number, number][],
  });

  // Artist formats (performance / teaser) and the 16:9 band inside vertical videos.
  const artistFmt = style.editStyle === "performance" || style.editStyle === "teaser" || style.editStyle === "cinematic";
  const band = style.frame === "band" && height > width;
  const bandH = band ? Math.round((width * 9) / 16) : height;
  const glW = Math.round(width * (props.glScale ?? 1));
  const glH = Math.round(bandH * (props.glScale ?? 1));
  const slot = (seg: Segment) => `${props.slotPrefix ?? ""}gl${seg.index % 2}`;

  // `tt` lets a transition draw a shot at another time (freeze-cut holds the outgoing shot still).
  const layer = (seg: Segment, css: React.CSSProperties, tt: number = t) =>
    seg.bridge ? (
      <BridgeLayer key={`br${props.slotPrefix ?? ""}${seg.index}`} seg={seg} local={tt - seg.start} fps={fps} style={css} />
    ) : seg.clip ? (
      <ClipLayer
        key={`clip${props.slotPrefix ?? ""}${seg.index}`}
        seg={seg}
        // CapCut: per-cut velocity ramp (burst in, slow-mo out); otherwise real time.
        local={capcut ? (seg.end - seg.start) * velocityRamp((tt - seg.start) / Math.max(0.01, seg.end - seg.start)) : tt - seg.start}
        fps={fps}
        style={css}
      />
    ) : (
      <ShaderCanvas key={slot(seg)} scene={seg.scene} u={baseU(seg, tt)} width={glW} height={glH} style={css} />
    );

  // --- transitions ---
  const layers: React.ReactNode[] = [];
  let flash = 0;
  let transRgb = 0;
  const showPrev = prev && p < 1;
  const accentCss = `rgb(${colors[3].map((c) => Math.round(255 * c)).join(",")})`;
  switch (cur.transition) {
    case "crossfade":
      if (showPrev) layers.push(layer(prev!, {}));
      layers.push(layer(cur, { opacity: showPrev ? p : 1 }));
      break;
    case "flash":
      layers.push(layer(cur, {}));
      flash = Math.pow(1 - p, 2) * 0.95;
      break;
    case "whip": {
      const e = 1 - Math.pow(1 - p, 3);
      if (showPrev) layers.push(layer(prev!, { transform: `translateX(${-e * 100}%)`, filter: `blur(${(1 - Math.abs(0.5 - p) * 2) * 18}px)` }));
      layers.push(layer(cur, { transform: `translateX(${(1 - e) * 100}%)`, filter: showPrev ? `blur(${(1 - Math.abs(0.5 - p) * 2) * 18}px)` : undefined }));
      break;
    }
    case "zoom":
      layers.push(layer(cur, { transform: `scale(${0.7 + 0.3 * p})` }));
      if (showPrev) layers.push(layer(prev!, { transform: `scale(${1 + p * 2.5})`, opacity: 1 - p }));
      break;
    case "whip_pan": {
      const dir: 1 | -1 = cur.index % 2 ? 1 : -1;
      const w = whipPan(p, dir, width, accentCss, `whip-${props.slotPrefix ?? "m"}`);
      if (showPrev) layers.push(layer(prev!, w.prevStyle));
      layers.push(layer(cur, showPrev ? w.curStyle : {}));
      if (showPrev) layers.push(w.extras);
      break;
    }
    case "zoom_through": {
      const z = zoomThrough(p, cur.transitionSeconds, width, `zt-${props.slotPrefix ?? "m"}`);
      if (showPrev) layers.push(layer(prev!, z.prevStyle));
      layers.push(layer(cur, showPrev ? z.curStyle : {}));
      if (showPrev && z.extras) layers.push(z.extras);
      if (showPrev) transRgb = Math.abs(z.rgb);
      break;
    }
    case "chroma_wipe": {
      const c = chromaWipe(p, cur.transitionSeconds, width, dirFromSeed(cur.seed));
      if (showPrev) layers.push(layer(prev!, c.prev));
      layers.push(layer(cur, showPrev ? c.cur : {}));
      if (showPrev && c.extras) layers.push(c.extras);
      if (showPrev) transRgb = c.rgb;
      break;
    }
    case "push_wipe": {
      const w = pushWipe(p, dirFromSeed(cur.seed));
      if (showPrev) layers.push(layer(prev!, w.prev));
      layers.push(layer(cur, showPrev ? w.cur : {}));
      break;
    }
    case "pixelate":
      layers.push(showPrev && p < 0.5 ? layer(prev!, {}) : layer(cur, {}));
      if (showPrev) layers.push(<PixelateGrid key="pix" p={p} width={width} height={height} color={preset.background} />);
      break;
    case "freeze_cut": {
      const f = freezeCut(p);
      if (showPrev && f.showPrev) layers.push(layer(prev!, f.prev, cur.start - 1 / fps));
      else layers.push(layer(cur, {}));
      flash = Math.max(flash, showPrev ? f.flash : 0);
      break;
    }
    case "white_through": {
      const w = whiteThrough(p);
      layers.push(showPrev && w.showPrev ? layer(prev!, {}) : layer(cur, {}));
      if (showPrev) layers.push(<AbsoluteFill key="wash" style={{ background: "#fff", opacity: w.wash }} />);
      break;
    }
    case "zoom_blur": {
      const z = zoomBlur(p, width);
      layers.push(showPrev && z.showPrev ? layer(prev!, z.prev) : layer(cur, showPrev ? z.cur : {}));
      if (showPrev) transRgb = z.rgb;
      break;
    }
    case "glitch": {
      const jitter = showPrev && frame % 3 !== 0;
      if (jitter) layers.push(layer(prev!, { transform: `translateX(${(rand(frame) - 0.5) * 6}%)`, filter: "hue-rotate(90deg) saturate(2)" }));
      else layers.push(layer(cur, showPrev ? { transform: `translateX(${(rand(frame + 1) - 0.5) * 3}%)` } : {}));
      break;
    }
    default:
      layers.push(layer(cur, {}));
  }

  // --- whole-stack motion and grade ---
  const zoom = 1 + kick * r.kickZoom * k;
  const shake = kick * r.kickShake * k * 100;
  const sx = (rand(frame * 1.3) - 0.5) * shake, sy = (rand(frame * 2.1) - 0.5) * shake;
  const sec = map.sections[cur.section];
  const secProgress = clamp01((t - sec.start) / Math.max(0.01, sec.end - sec.start));
  const grade = artistFmt
    ? "contrast(1.06) saturate(1.08)"
    : capcut && (cur.clip || prev?.clip)
    ? `contrast(1.12) saturate(${sec.type === "breakdown" ? 1.0 : 1.22}) brightness(${sec.type === "breakdown" ? 0.92 : 1.02})`
    : sec.type === "drop" ? "saturate(1.15) contrast(1.08)"
    : sec.type === "breakdown" ? "saturate(0.8) brightness(0.88)"
    : sec.type === "build" ? `brightness(${0.95 + 0.15 * secProgress}) saturate(${1 + 0.15 * secProgress})`
    : "saturate(0.92)";
  const usesClip = !!(cur.clip || cur.bridge) || (!!(prev?.clip || prev?.bridge) && p < 1);
  // White kick flashes over real footage look cheap: keep them subtle on clips.
  const kickFlash = Math.min(artistFmt ? (usesClip ? 0 : 0.15) : usesClip ? (capcut ? 0.06 : 0.12) : 1, kick * r.kickFlash * k * (section.type === "breakdown" ? 0.3 : 1));
  // CapCut hard cut: a 2-frame flash frame on the cut.
  if (capcut && cur.transition === "cut" && prev && local < 2 / fps) flash = Math.max(flash, 0.35);
  const mv = cameraMove(style.cameraMove ?? "off", clamp01((t - cur.start) / Math.max(0.01, cur.end - cur.start)), cur.index, sec.type);
  const looks = style.looks ?? { flare: false, leaks: false, vhs: false, halftone: false };
  const ci = lastIndexAtOrBefore(map.claps, t);
  const clapHit = ci >= 0 && t - map.claps[ci] < 0.12 ? 1 - (t - map.claps[ci]) / 0.12 : 0;
  const cam = capcut ? capcutCamera(map, t, frame, k, sec.type) : null;
  const rgbId = `rgb-${props.slotPrefix ?? "m"}`;
  const rgb = Math.max(transRgb, looks.vhs ? Math.max(1, Math.round(width / 960)) + Math.round(clapHit * width / 400) : 0, capcut ? clapSplit(map.claps, t, width, (cam?.strobe ?? 0) * 0.6 + (cam?.slam ?? 0)) : 0);
  // HyperFrames camera shake (strength follows the music's loudness) and beat accent (on hits).
  const shakeT = style.cameraShake && style.cameraShake !== "off" ? cameraShake(style.cameraShake, t, width, height, Math.min(1.5, k) * (0.45 + 0.75 * rms), Math.min(1.5, k) * 1.2) : "";
  const acc = style.beatAccent && style.beatAccent !== "off" ? beatAccentAt(accentHits(map, style.beatAccent), t, Math.min(1.5, k)) : null;
  const accT = acc ? `translate(${acc.sx}%, ${acc.sy}%) scale(${acc.scale})` : "";
  const stackTransform = `${mv.bg} ${shakeT} ${accT} ${cam ? `${cam.transform} scale(${zoom})` : `translate(${sx}%, ${sy}%) scale(${zoom})`}`;
  const stackFilter = `${rgb > 0 ? `url(#${rgbId}) ` : ""}${grade}${cam && cam.blur > 0.05 ? ` blur(${cam.blur.toFixed(2)}px)` : ""}`;
  if (cam) flash = Math.min(1, flash + cam.strobe + cam.slam * 0.5);

  return (
    <AbsoluteFill style={{ background: band ? "#000" : preset.background, overflow: "hidden" }}>
      {rgb > 0 && <RgbSplitFilter id={rgbId} dx={rgb} />}
      <div style={band ? { position: "absolute", left: 0, right: 0, top: (height - bandH) / 2, height: bandH, overflow: "hidden", background: preset.background } : { position: "absolute", inset: 0 }}>
        <AbsoluteFill style={{ transform: stackTransform, filter: stackFilter }}>
          {layers}
          {usesClip && <ClipTreatment preset={preset} colors={colors} frame={frame} grain={r.grain * k} clean={capcut || artistFmt} />}
        </AbsoluteFill>
      {looks.halftone && <HalftoneOverlay width={width} height={bandH} />}
      {looks.flare && (sec.type === "drop" || sec.type === "build") && <AnamorphicFlare t={t} kick={kick} energy={rms} width={width} height={bandH} seed={cur.section + 1} />}
      {looks.leaks && <OrganicLeaks t={t} colors={colors} bpm={map.bpm} />}
      {props.style.useCover && props.coverSrc && (
        <AbsoluteFill style={{ transform: mv.fg }}>
          <CoverLayer src={props.coverSrc} map={map} t={t} kick={kick} bass={bass} preset={preset} />
        </AbsoluteFill>
      )}
      {(capcut || looks.leaks) && <LightLeak map={map} t={t} colors={colors} />}
      {style.waveform && style.waveform !== "off" && <WaveformBars map={map} t={t} width={width} height={bandH} colors={colors} mode={style.waveform} />}
      {looks.vhs && <VhsOverlay t={t} frame={frame} height={bandH} clapHit={clapHit} />}
      </div>
      {acc && <AccentFlash scale={acc.flashScale} opacity={0.45 * acc.flashOpacity * (1 - clamp01(flash + kickFlash))} color={colors[3].map((c) => Math.round(255 * (0.7 + 0.3 * c))).join(",")} />}
      {style.lightSweep && <LightSweep map={map} t={t} width={width} colors={colors} />}
      {!capcut && !artistFmt && <TitleLayer {...props} presetCfg={preset} />}
      {style.letterbox && <Letterbox />}
      {capcut && !props.noCaptions && <Captions {...props} presetCfg={preset} colors={colors} />}
      {artistFmt && !props.noCaptions && <ArtistCaptions {...props} t={t} />}
      {style.textBehind && !props.noCaptions && cur.clip?.ref.matteSrc && !showPrev && canShowAlphaVideo() && (
        // Text behind you: the cut-out of the subject, drawn over the captions with the exact same
        // frame, framing and camera motion as the clip underneath.
        <div style={band ? { position: "absolute", left: 0, right: 0, top: (height - bandH) / 2, height: bandH, overflow: "hidden" } : { position: "absolute", inset: 0 }}>
          <AbsoluteFill style={{ transform: stackTransform, filter: grade }}>
            <ClipLayer
              seg={cur}
              local={capcut ? (cur.end - cur.start) * velocityRamp((t - cur.start) / Math.max(0.01, cur.end - cur.start)) : t - cur.start}
              fps={fps}
              style={{}}
              src={cur.clip.ref.matteSrc}
              transparent
            />
          </AbsoluteFill>
        </div>
      )}
      {/* flashes go over everything, including the cut-out, so a flash never reveals the layering */}
      {(flash > 0 || kickFlash > 0.01) && (
        <AbsoluteFill style={{ background: `rgb(${colors[3].map((c) => Math.round(255 * (0.75 + 0.25 * c))).join(",")})`, opacity: clamp01(flash + kickFlash), mixBlendMode: "screen" }} />
      )}
      {style.debug && <DebugOverlay {...props} seg={cur} kick={kick} />}
    </AbsoluteFill>
  );
}

function ClipLayer({ seg, local, fps, style, src, transparent }: { seg: Segment; local: number; fps: number; style: React.CSSProperties; src?: string; transparent?: boolean }) {
  const c = seg.clip!;
  const frame = Math.max(0, Math.round(clipTime(c, local) * fps));
  const sx = (c.mirror ? -1 : 1) * c.zoom;
  return (
    <AbsoluteFill style={{ ...style, transform: `${style.transform ?? ""} scale(${sx}, ${c.zoom})` }}>
      <Freeze frame={frame}>
        <OffthreadVideo src={src ?? c.ref.src} muted transparent={transparent} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Freeze>
    </AbsoluteFill>
  );
}

/** AI morph: the whole first→last-frame clip, time-stretched to fill the morph window. */
function BridgeLayer({ seg, local, fps, style }: { seg: Segment; local: number; fps: number; style: React.CSSProperties }) {
  const b = seg.bridge!;
  const len = Math.max(0.1, seg.end - seg.start);
  const d = Math.max(0.1, b.duration - 0.05);
  const frame = Math.max(0, Math.round(Math.min(d, (Math.max(0, local) / len) * d) * fps));
  return (
    <AbsoluteFill style={style}>
      <Freeze frame={frame}>
        <OffthreadVideo src={b.src} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </Freeze>
    </AbsoluteFill>
  );
}

/** Transparent (VP9 alpha) video works in renders and in Chrome/Firefox previews, not in Safari's player. */
function canShowAlphaVideo(): boolean {
  if (!getRemotionEnvironment().isPlayer || typeof navigator === "undefined") return true;
  return !/^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
}

/** Ties AI footage to the preset: a palette tint and (deterministic) film grain. */
function ClipTreatment({ preset, colors, frame, grain, clean }: { preset: PresetConfig; colors: number[][]; frame: number; grain: number; clean?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || grain <= 0) return;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(cv.width, cv.height);
    let s = (frame * 2654435761) >>> 0;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = 128 + (((s >>> 24) - 128) >> 1);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [frame, grain]);
  const tint = `rgb(${colors[2].map((c) => Math.round(c * 255)).join(",")})`;
  // CapCut look: clean, punchy footage (the grade does the work) with only a light vignette.
  if (clean) return <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 65%, rgba(0,0,0,0.35) 100%)" }} />;
  return (
    <>
      <AbsoluteFill style={{ background: tint, mixBlendMode: "soft-light", opacity: preset.id === "techno" ? 0.1 : 0.15 }} />
      {preset.id === "techno" && <AbsoluteFill style={{ backdropFilter: "grayscale(0.6) contrast(1.15)" }} />}
      {grain > 0 && <canvas ref={ref} width={640} height={360} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", mixBlendMode: "overlay", opacity: Math.min(0.1, grain * 0.3) }} />}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)" }} />
    </>
  );
}

function CoverLayer({ src, map, t, kick, bass, preset }: { src: string; map: VideoProps["map"]; t: number; kick: number; bass: number; preset: PresetConfig }) {
  const { width, height } = useVideoConfig();
  const si = sectionAt(map, t);
  const sec = map.sections[si];
  const bar = (60 / map.bpm) * 4;
  const visible = (type: string) => (type === "intro" || type === "breakdown" || type === "outro" ? 1 : 0);
  // Fade in/out over one bar at section edges.
  const vin = visible(sec.type);
  const prevV = si > 0 ? visible(map.sections[si - 1].type) : vin;
  const nextV = si + 1 < map.sections.length ? visible(map.sections[si + 1].type) : vin;
  let o = vin;
  if (prevV !== vin) o = prevV + (vin - prevV) * clamp01((t - sec.start) / bar);
  if (nextV !== vin && t > sec.end - bar) o = vin + (nextV - vin) * clamp01((t - (sec.end - bar)) / bar);
  if (o <= 0.001) return null;
  const size = Math.min(width, height) * 0.42;
  const scale = 1 + bass * 0.04 + kick * 0.025;
  const drift = Math.sin(t * 0.25) * size * 0.03;
  const blur = sec.type === "breakdown" ? 1.5 : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: o }}>
      <Img
        src={src}
        style={{
          width: size, height: size, objectFit: "cover", borderRadius: 6,
          transform: `translateY(${drift}px) scale(${scale})`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          filter: `${preset.id === "techno" ? "grayscale(1) contrast(1.2)" : ""} blur(${blur}px)`,
        }}
      />
    </AbsoluteFill>
  );
}

function TitleLayer(props: Props & { presetCfg: PresetConfig }) {
  const { width, height } = useVideoConfig();
  const { map, t, presetCfg: preset, titleMode, style } = props;
  if (titleMode === "none" || !style.titleCard || !props.title) return null;
  const ty = preset.typography;
  const bar = (60 / map.bpm) * 4;
  const vertical = height > width;
  if (titleMode === "persistent") {
    return (
      <AbsoluteFill style={{ justifyContent: vertical ? "flex-start" : "flex-end", alignItems: "center", padding: vertical ? height * 0.08 : height * 0.06 }}>
        <div style={{ textAlign: "center", color: "white", fontFamily: ty.family, fontWeight: ty.weight, letterSpacing: ty.tracking, textTransform: ty.transform, fontStyle: ty.style ?? "normal", textShadow: "0 2px 24px rgba(0,0,0,0.6)" }}>
          <div style={{ fontSize: Math.min(width, height) * 0.045 }}>{props.artist}</div>
          <div style={{ fontSize: Math.min(width, height) * 0.032, opacity: 0.85, marginTop: 6 }}>{props.title}</div>
        </div>
      </AbsoluteFill>
    );
  }
  const start = map.downbeats[0] ?? 0;
  const end = start + 8 * bar;
  if (t < start || t > end) return null;
  const o = Math.min(clamp01((t - start) / bar), clamp01((end - t) / (2 * bar)));
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: o }}>
      <div style={{ textAlign: "center", color: "white", fontFamily: ty.family, fontWeight: ty.weight, letterSpacing: ty.tracking, textTransform: ty.transform, fontStyle: ty.style ?? "normal", textShadow: "0 4px 40px rgba(0,0,0,0.7)", transform: `translateY(${(1 - o) * 10}px)` }}>
        <div style={{ fontSize: Math.min(width, height) * 0.075, lineHeight: 1.1 }}>{props.artist}</div>
        <div style={{ fontSize: Math.min(width, height) * 0.04, marginTop: Math.min(width, height) * 0.02, opacity: 0.85 }}>{props.title}</div>
      </div>
    </AbsoluteFill>
  );
}

function DebugOverlay(props: Props & { seg: Segment; kick: number }) {
  const { map, t, frame, seg, kick } = props;
  const { width } = useVideoConfig();
  const b = beatInfo(map, t);
  const s = Math.max(1, width / 1280);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 16 * s, top: 16 * s, padding: `${8 * s}px ${12 * s}px`, background: "rgba(0,0,0,0.75)", color: "#0f0", fontFamily: "monospace", fontSize: 16 * s, lineHeight: 1.35, borderRadius: 4 * s }}>
        <div>t {t.toFixed(3)}s · frame {frame}</div>
        <div>bar {b.bar + 1}.{b.beatInBar + 1} · beat #{b.beatIndex + 1}</div>
        <div>{map.sections[seg.section].type} · {seg.clip ? `clip ${seg.clip.ref.id}` : seg.scene} · cut {seg.index}</div>
      </div>
      <div style={{ position: "absolute", right: 16 * s, top: 16 * s, width: 48 * s, height: 48 * s, background: kick > 0.5 ? "#f00" : "#300", borderRadius: 4 * s, color: "white", fontFamily: "monospace", fontSize: 28 * s, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {b.beatInBar + 1}
      </div>
    </AbsoluteFill>
  );
}
