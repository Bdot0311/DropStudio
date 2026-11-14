// Small helpers shared by the setup/dev scripts. Node built-ins only (runs before `npm install`).
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const IS_WIN = process.platform === "win32";
export const VENV = path.join(ROOT, "worker", ".venv");
export const VENV_BIN = path.join(VENV, IS_WIN ? "Scripts" : "bin");
export const PY = path.join(VENV_BIN, IS_WIN ? "python.exe" : "python");

const c = (n) => (s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);
export const bold = c(1), green = c(32), yellow = c(33), red = c(31), dim = c(2), cyan = c(36);

export function has(cmd) {
  const r = spawnSync(IS_WIN ? "where" : "which", [cmd], { stdio: "ignore" });
  return r.status === 0;
}

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
  return r.status === 0;
}

export function capture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", cwd: ROOT });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function venvReady() {
  return existsSync(PY);
}

export function pythonEnv() {
  return { ...process.env, PYTHONPATH: ROOT, PYTHONUNBUFFERED: "1" };
}

export function spawnPython(args, opts = {}) {
  return spawn(PY, args, { stdio: "inherit", cwd: ROOT, env: pythonEnv(), ...opts });
}
