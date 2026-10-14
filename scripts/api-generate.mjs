#!/usr/bin/env node
/**
 * Fetch the OpenAPI contract from the Laravel API and regenerate the typed
 * client. Spec §3.3.
 *
 *   OPENAPI_URL   where to download from (default: the local API)
 *   OPENAPI_FILE  read a local file instead of downloading
 *
 * The generated output is committed, and CI fails if regeneration produces a
 * diff. So: never hand-edit packages/api-client.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'openapi/openapi.json');

const DEFAULT_URL = 'http://127.0.0.1:8000/docs/api.json';

async function main() {
  await mkdir(dirname(target), { recursive: true });

  const localFile = process.env.OPENAPI_FILE;
  let raw;

  if (localFile) {
    const source = resolve(process.cwd(), localFile);
    if (!existsSync(source)) {
      throw new Error(`OPENAPI_FILE not found: ${source}`);
    }
    console.log(`> reading ${source}`);
    raw = await readFile(source, 'utf8');
  } else {
    const url = process.env.OPENAPI_URL ?? DEFAULT_URL;
    console.log(`> downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Could not fetch the contract (HTTP ${response.status} from ${url}).\n` +
          'Start the API, or point OPENAPI_FILE at a local export:\n' +
          '  make -C ../olivarcalc-api openapi',
      );
    }
    raw = await response.text();
  }

  // Both routes are normalised to the same serialisation before being written.
  //
  // Scramble's on-disk export escapes forward slashes ("\/v1\/parameters") while
  // the HTTP endpoint serves the same document without them. Copying the file
  // verbatim kept the escaped form, so a CI run reading OPENAPI_FILE produced a
  // different openapi.json from a local run downloading it — 48 lines of
  // difference that had nothing to do with the contract itself.
  //
  // Four spaces, not two: that is what Laravel writes and what the committed file
  // already uses, so this change is about the slashes and nothing else. A
  // reindent would bury a real contract change in a thousand lines of noise.
  const parsed = JSON.parse(raw);
  await writeFile(target, `${JSON.stringify(parsed, null, 4)}\n`, 'utf8');
  const pathCount = Object.keys(parsed.paths ?? {}).length;
  console.log(`> openapi ${parsed.openapi}, ${pathCount} path(s)`);

  console.log('> running orval');
  await run('yarn', ['workspace', '@olivar/api-client', 'generate']);
  console.log('> done');
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
      }
    });
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
