"""Phase 2 acceptance check: flashes land on kicks, and audio is in sync to the last frame.

Usage: python scripts/checks/sync-check.py <video.mp4> <music_map.json> [start_time]
Measures the average brightness of every frame, finds each kick's frame (floor(kick * fps)),
and checks that the brightness jump peaks exactly on that frame.
"""
import json, subprocess, sys
import numpy as np

video, mm_path = sys.argv[1], sys.argv[2]
start = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
mm = json.load(open(mm_path))

info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", video], capture_output=True, text=True).stdout)
v = next(s for s in info["streams"] if s["codec_type"] == "video")
a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
num, den = map(int, v["r_frame_rate"].split("/"))
fps = num / den
w, h = 64, 36
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"scale={w}:{h},format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(float)
# Ignore the debug text box (top-left) and the beat box (top-right).
mask = np.ones((h, w), bool); mask[:10, :] = False
luma = frames[:, mask].mean(axis=1)
n = len(luma)
dur = n / fps

sections = mm["sections"]
def section_type(t):
    for s in sections:
        if s["start"] <= t < s["end"]:
            return s["type"]
    return sections[-1]["type"]

kicks = [k for k in mm["onsets"]["kick"] if start <= k < start + dur - 2 / fps and section_type(k) != "breakdown"]
d = np.diff(luma, prepend=luma[0])
exact = near = 0
for k in kicks:
    f = int(np.floor((k - start) * fps + 1e-6))
    lo, hi = max(1, f - 3), min(n - 1, f + 3)
    peak = lo + int(np.argmax(d[lo:hi + 1]))
    exact += peak == f
    near += abs(peak - f) <= 1
last_kick = max(kicks) if kicks else None
lf = int(np.floor((last_kick - start) * fps + 1e-6)) if last_kick else None
last_ok = lf is not None and int(np.argmax(d[max(1, lf - 3):lf + 4])) + max(1, lf - 3) == lf

print(f"frames: {n} at {fps:g} fps = {dur:.3f}s | video stream {float(v.get('duration', 0)):.3f}s | audio stream {float(a['duration']) if a else 0:.3f}s")
print(f"kicks checked: {len(kicks)} | flash on the exact kick frame: {exact}/{len(kicks)} ({100*exact/max(1,len(kicks)):.1f}%) | within ±1 frame: {near}/{len(kicks)}")
print(f"last kick at {last_kick:.3f}s → frame {lf}: {'OK' if last_ok else 'MISSED'}")
ok = exact / max(1, len(kicks)) >= 0.95 and last_ok and (a is None or abs(float(a["duration"]) - float(v["duration"])) <= 1.5 / fps)
print("PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
