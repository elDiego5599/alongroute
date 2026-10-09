import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parityTraces } from "../scripts/parity-data.ts";

test("seeded TS traces match the committed Dart parity golden", async () => {
  const path = new URL("../../parity/parity-traces.json", import.meta.url);
  const committed = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(parityTraces(), committed);
});
