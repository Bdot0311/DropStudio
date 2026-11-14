// Run the worker's Python with the project on PYTHONPATH:  node scripts/run-python.mjs -m pytest
import { spawnPython, venvReady, red } from "./lib.mjs";

if (!venvReady()) {
  console.error(red("The Python environment isn't set up yet. Run:  npm run setup"));
  process.exit(1);
}
const child = spawnPython(process.argv.slice(2));
child.on("exit", (code) => process.exit(code ?? 1));
