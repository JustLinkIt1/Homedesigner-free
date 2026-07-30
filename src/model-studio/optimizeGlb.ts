import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, prune, quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

export interface GlbStats {
  bytes: number;
  triangles: number;
  vertices: number;
  textures: number;
  maxTextureSize?: number;
  /** Source-space AABB size. Ratios are used to keep catalogue dimensions
   * proportional; generated model units themselves are arbitrary. */
  dimensions?: [number, number, number];
}

export interface OptimizedGlb {
  blob: Blob;
  stats: GlbStats;
}

function geometryStats(document: Awaited<ReturnType<WebIO['readBinary']>>): Omit<GlbStats, 'bytes' | 'maxTextureSize'> {
  let triangles = 0;
  let vertices = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      vertices += position?.getCount() ?? 0;
      const indexCount = primitive.getIndices()?.getCount() ?? position?.getCount() ?? 0;
      triangles += Math.floor(indexCount / 3);
    }
  }
  const scene = document.getRoot().listScenes()[0];
  const bounds = scene ? getBounds(scene) : null;
  const dimensions = bounds
    ? [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]] as [number, number, number]
    : undefined;
  return { triangles, vertices, textures: document.getRoot().listTextures().length, dimensions };
}

async function imageBlobToWebp(image: Uint8Array, mime: string, maxSize: number): Promise<{
  bytes: Uint8Array;
  size: number;
}> {
  const imageCopy = new Uint8Array(image);
  const bitmap = await createImageBitmap(new Blob([imageCopy.buffer], { type: mime }));
  const scale = Math.min(1, maxSize / bitmap.width, maxSize / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  let output: Blob;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image conversion is unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    output = await canvas.convertToBlob({ type: 'image/webp', quality: 0.88 });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image conversion is unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    output = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Texture conversion failed')), 'image/webp', 0.88);
    });
  }
  bitmap.close();
  return { bytes: new Uint8Array(await output.arrayBuffer()), size: Math.max(width, height) };
}

async function makeProfile(
  io: WebIO,
  input: Uint8Array<ArrayBuffer>,
  targetTriangles: number,
  textureSize: number,
  onProgress?: (message: string) => void,
): Promise<OptimizedGlb> {
  const document = await io.readBinary(input);
  const original = geometryStats(document);
  onProgress?.(`Compressing ${textureSize}px textures…`);
  let maxTextureSize = 0;
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    const mime = texture.getMimeType();
    if (!image || !/^image\/(png|jpeg|webp)$/.test(mime)) continue;
    const converted = await imageBlobToWebp(image, mime, textureSize);
    texture.setImage(converted.bytes).setMimeType('image/webp');
    maxTextureSize = Math.max(maxTextureSize, converted.size);
  }

  const transforms = [dedup(), weld()];
  if (original.triangles > targetTriangles * 1.1) {
    onProgress?.(`Reducing mesh to about ${Math.round(targetTriangles / 1000)}k triangles…`);
    transforms.push(simplify({
      simplifier: MeshoptSimplifier,
      ratio: Math.max(0.01, targetTriangles / original.triangles),
      error: 0.01,
    }));
  }
  transforms.push(
    prune(),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await document.transform(...transforms);
  onProgress?.('Writing optimized GLB…');
  const output = await io.writeBinary(document);
  const stats: GlbStats = {
    bytes: output.byteLength,
    ...geometryStats(document),
    ...(maxTextureSize ? { maxTextureSize } : {}),
  };
  return {
    blob: new Blob([new Uint8Array(output).buffer], { type: 'model/gltf-binary' }),
    stats,
  };
}

/** Converts an arbitrary generated GLB into two reviewed delivery tiers. This
 * stays in the owner's browser: a 40k/1024 interactive model and a
 * 150k/2048 render model. The original is never overwritten. */
export async function optimizeGlb(file: Blob, onProgress?: (message: string) => void): Promise<{
  before: GlbStats;
  mobile: OptimizedGlb;
  render: OptimizedGlb;
}> {
  onProgress?.('Reading model…');
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const io = new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  const input = new Uint8Array(await file.arrayBuffer());
  const sourceDocument = await io.readBinary(input);
  const before: GlbStats = { bytes: input.byteLength, ...geometryStats(sourceDocument) };
  const mobile = await makeProfile(io, input, 40_000, 1024, onProgress);
  const render = await makeProfile(io, input, 150_000, 2048, onProgress);
  return { before, mobile, render };
}
