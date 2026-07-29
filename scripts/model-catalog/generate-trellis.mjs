#!/usr/bin/env node

/**
 * Generate a review-only, mobile-sized GLB with fal.ai TRELLIS 2.
 *
 * This tool never uploads to R2 or edits the live catalogue. FAL_KEY is read
 * only from the process environment and is never written to disk or logged.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fal } from '@fal-ai/client';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const GLTF_TRANSFORM = join(
  ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform',
);
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

const usage = `
Generate a review-only HomeDesigner furniture model with fal.ai TRELLIS 2.

Usage:
  npm run models:trellis -- --image <https-url-or-file> --type <catalog-type> [options]

Required:
  --image <value>        Isolated furniture image (HTTPS URL or local file)
  --type <slug>          Proposed catalogue key, e.g. modern_corner_sofa

Options:
  --output-dir <path>    Destination (default: outputs/trellis/<type>-<time>)
  --seed <integer>       Reproducible seed
  --resolution <value>   512, 1024, or 1536 (default: 512)
  --vertices <count>     5,000-2,000,000 (default: 30000)
  --texture-size <value> 1024, 2048, or 4096 (default: 1024)
  --keep-raw             Retain the unoptimized Fal GLB
  --dry-run              Validate and print the request without spending credits
  --help                 Show this help

FAL_KEY must be supplied through the process environment for a paid request.
The command never publishes a generated asset to Cloudflare R2.
`;

function parseArgs(argv) {
  const values = new Map();
  const switches = new Set();
  const bools = new Set(['help', 'dry-run', 'keep-raw']);
  const valued = new Set([
    'image', 'type', 'output-dir', 'seed', 'resolution', 'vertices', 'texture-size',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (bools.has(name)) {
      switches.add(name);
      continue;
    }
    if (!valued.has(name)) throw new Error(`Unknown option: --${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    if (values.has(name)) throw new Error(`Duplicate option: --${name}`);
    values.set(name, value);
    index += 1;
  }
  return { values, switches };
}

function integerOption(values, name, fallback, allowed) {
  const raw = values.get(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || (allowed && !allowed.includes(value))) {
    throw new Error(`Invalid --${name}: ${raw ?? value}`);
  }
  return value;
}

function safeInputLabel(input) {
  if (!/^https:\/\//i.test(input)) return basename(input);
  const url = new URL(input);
  return `${url.origin}${url.pathname}`;
}

function mimeFor(path) {
  const extension = extname(path).toLowerCase();
  return {
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }[extension];
}

function validateImageInput(input) {
  if (/^https:\/\//i.test(input)) return;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    throw new Error('Hosted input images must use HTTPS');
  }
  const path = resolve(input);
  if (!existsSync(path)) throw new Error(`Input image not found: ${input}`);
  if (!mimeFor(path)) throw new Error('Local image must be PNG, JPEG, WebP, GIF, or AVIF');
}

async function prepareImage(input) {
  if (/^https:\/\//i.test(input)) return input;
  const path = resolve(input);
  if (!existsSync(path)) throw new Error(`Input image not found: ${input}`);
  const mime = mimeFor(path);
  if (!mime) throw new Error('Local image must be PNG, JPEG, WebP, GIF, or AVIF');
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_INPUT_BYTES) throw new Error('Input image exceeds 20 MB');
  console.log(`[fal] Uploading ${basename(path)} (${Math.ceil(bytes.byteLength / 1024)} KB)`);
  return fal.storage.upload(new File([bytes], basename(path), { type: mime }));
}

async function download(url, path) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Generated GLB download failed (${response.status})`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_OUTPUT_BYTES) throw new Error('Generated GLB exceeds 100 MB');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_OUTPUT_BYTES) throw new Error('Generated GLB exceeds 100 MB');
  await writeFile(path, bytes);
  return bytes;
}

async function falKey() {
  const processKey = process.env.FAL_KEY?.trim();
  if (processKey) return processKey;
  const localEnvironment = join(ROOT, '.env.local');
  if (!existsSync(localEnvironment)) return undefined;
  const lines = (await readFile(localEnvironment, 'utf8')).split(/\r?\n/);
  const match = lines.find((line) => /^\s*FAL_KEY\s*=/.test(line));
  if (!match) return undefined;
  const value = match.slice(match.indexOf('=') + 1).trim();
  if (!value) return undefined;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

async function main() {
  const { values, switches } = parseArgs(process.argv.slice(2));
  if (switches.has('help')) {
    console.log(usage.trim());
    return;
  }

  const image = values.get('image');
  const type = values.get('type');
  if (!image || !type) throw new Error('--image and --type are required');
  validateImageInput(image);
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(type)) {
    throw new Error('--type must be a 2-80 character lowercase catalogue slug');
  }

  const resolution = integerOption(values, 'resolution', 512, [512, 1024, 1536]);
  const textureSize = integerOption(values, 'texture-size', 1024, [1024, 2048, 4096]);
  const vertices = integerOption(values, 'vertices', 30_000);
  if (vertices < 5_000 || vertices > 2_000_000) {
    throw new Error('--vertices must be between 5,000 and 2,000,000');
  }
  const seed = values.has('seed') ? integerOption(values, 'seed') : undefined;
  const input = {
    image_url: switchlessImagePlaceholder(image),
    resolution,
    decimation_target: vertices,
    texture_size: textureSize,
    remesh: true,
    ...(seed === undefined ? {} : { seed }),
  };

  if (switches.has('dry-run')) {
    console.log(JSON.stringify({
      model: 'fal-ai/trellis-2',
      type,
      image: safeInputLabel(image),
      input: { ...input, image_url: '<uploaded-or-hosted-image>' },
      publication: 'blocked pending review',
    }, null, 2));
    return;
  }

  const key = await falKey();
  if (!key) throw new Error('FAL_KEY is not set. See docs/FAL_TRELLIS_PIPELINE.md.');
  fal.config({ credentials: key });
  input.image_url = await prepareImage(image);

  console.log(`[fal] Generating ${type} with TRELLIS 2 (${vertices} vertices, ${textureSize}px texture)`);
  const result = await fal.subscribe('fal-ai/trellis-2', {
    input,
    logs: false,
    onQueueUpdate(update) {
      if (update.status === 'IN_QUEUE') console.log('[fal] Request queued');
      if (update.status === 'IN_PROGRESS') console.log('[fal] Generation in progress');
    },
  });
  const modelUrl = result.data?.model_glb?.url;
  if (typeof modelUrl !== 'string' || !/^https:\/\//i.test(modelUrl)) {
    throw new Error('Fal completed without returning a valid GLB URL');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = resolve(values.get('output-dir') ?? join(ROOT, 'outputs', 'trellis', `${type}-${stamp}`));
  await mkdir(outputDir, { recursive: true });
  const rawPath = join(outputDir, `${type}.raw.glb`);
  const modelPath = join(outputDir, `${type}.glb`);
  const rawBytes = await download(modelUrl, rawPath);

  if (!existsSync(GLTF_TRANSFORM)) throw new Error('gltf-transform is missing; run npm install');
  console.log('[local] Optimizing GLB for HomeDesigner');
  execFileSync(GLTF_TRANSFORM, [
    'optimize', rawPath, modelPath,
    '--compress', 'meshopt',
    '--simplify', 'false',
    '--texture-compress', 'webp',
    '--texture-size', String(textureSize),
  ], { cwd: ROOT, stdio: 'inherit' });
  const modelBytes = await readFile(modelPath);
  const inspection = execFileSync(
    GLTF_TRANSFORM,
    ['inspect', modelPath, '--format', 'md'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  await writeFile(join(outputDir, 'inspection.md'), inspection, 'utf8');

  const review = {
    version: 1,
    status: 'review-required',
    createdAt: new Date().toISOString(),
    provider: 'fal.ai',
    model: 'fal-ai/trellis-2',
    requestId: result.requestId,
    proposedType: type,
    input: safeInputLabel(image),
    parameters: {
      resolution,
      vertices,
      textureSize,
      remesh: true,
      ...(seed === undefined ? {} : { seed }),
    },
    output: {
      file: basename(modelPath),
      bytes: modelBytes.byteLength,
      sha256: createHash('sha256').update(modelBytes).digest('hex'),
      rawBytes: rawBytes.byteLength,
    },
    approval: {
      geometry: false,
      textures: false,
      orientation: false,
      scale: false,
      mobilePerformance: false,
    },
    publication: {
      allowed: false,
      reason: 'Generated-asset provenance is not yet accepted by the live catalogue schema.',
    },
  };
  await writeFile(join(outputDir, 'review.json'), `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  if (!switches.has('keep-raw')) await rm(rawPath, { force: true });

  console.log(`[done] Review package: ${outputDir}`);
  console.log(`[done] Optimized GLB: ${modelBytes.byteLength.toLocaleString()} bytes`);
  console.log('[next] Render previews and approve review.json before any R2 publication.');
}

function switchlessImagePlaceholder(image) {
  return /^https:\/\//i.test(image) ? image : '<local-image-upload>';
}

main().catch((error) => {
  console.error(`[trellis] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
