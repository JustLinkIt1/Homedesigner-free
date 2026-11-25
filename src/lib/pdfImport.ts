// Render a PDF page or an image file into a canvas so we can both
// display it as a tracing background and run wall detection on its pixels.
import * as pdfjs from 'pdfjs-dist';
// Vite resolves this to a hashed URL for the worker bundle.
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker;

export interface RenderedPlan {
  /** PNG data URL for display. */
  src: string;
  /** Pixels for analysis. */
  imageData: ImageData;
  width: number;
  height: number;
  /** PDF only: total pages in the document. */
  pageCount?: number;
}

/** Longest side we will trace. A 12 MP phone photo is 4000+ px and the tracer's
 *  cost grows with pixel count; every size the dialog uses afterwards (scale
 *  slider, cm/px, preview overlay, background) comes from the RENDERED width and
 *  height, so downscaling here keeps them all consistent. */
export const MAX_TRACE_SIDE = 4000;

/** Size to draw an image at so its longer side is at most `max`, aspect kept. */
export function fitWithin(width: number, height: number, max = MAX_TRACE_SIDE): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= max) return { width, height };
  const k = max / longer;
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
}

/** iPhone photo format, by MIME type or extension. Chrome/Android cannot decode it. */
export function isHeic(file: { name: string; type: string }): boolean {
  return /^image\/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function canvasToResult(canvas: HTMLCanvasElement, pageCount?: number): RenderedPlan {
  const ctx = canvas.getContext('2d')!;
  return {
    src: canvas.toDataURL('image/png'),
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
    ...(pageCount ? { pageCount } : {}),
  };
}

export async function renderPdf(file: File, pageNumber = 1, targetWidth = 2000): Promise<RenderedPlan> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = doc.numPages;
  const page = await doc.getPage(Math.min(Math.max(1, Math.round(pageNumber)), pageCount));
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, Math.max(1, targetWidth / base.width));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  // White backdrop so transparent PDFs binarize correctly.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvasToResult(canvas, pageCount);
}

export async function renderImage(file: File): Promise<RenderedPlan> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const canvas = document.createElement('canvas');
    const size = fitWithin(img.naturalWidth, img.naturalHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvasToResult(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const isPdfFile = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

export async function renderPlanFile(file: File, pageNumber = 1): Promise<RenderedPlan> {
  return isPdfFile(file) ? renderPdf(file, pageNumber) : renderImage(file);
}
