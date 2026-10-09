import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parityTraces } from "./parity-data.ts";

const output = new URL("../../parity/parity-traces.json", import.meta.url);
await mkdir(new URL("../../parity/", import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(parityTraces(), null, 2)}\n`);
console.log(`Wrote ${fileURLToPath(output)}`);
