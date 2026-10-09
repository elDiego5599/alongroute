import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const bundlePath = new URL('../../demo/alongroute.js', import.meta.url);
const bundle = readFileSync(bundlePath);
const gzipSize = gzipSync(bundle, { level: 9 }).byteLength;
const limit = 4096;

console.log(`demo/alongroute.js gzip size: ${gzipSize} bytes (limit: ${limit} bytes)`);

if (gzipSize > limit) {
  console.error(`Size limit exceeded by ${gzipSize - limit} bytes.`);
  process.exitCode = 1;
}
