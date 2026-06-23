// Render a PDF (first page) or an image file into a canvas so we can both
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
}

function canvasToResult(canvas: HTMLCanvasElement): RenderedPlan {
  const ctx = canvas.getContext('2d')!;
  return {
    src: canvas.toDataURL('image/png'),
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function renderPdf(file: File, targetWidth = 2000): Promise<RenderedPlan> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const page = await doc.getPage(1);
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
  return canvasToResult(canvas);
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
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvasToResult(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderPlanFile(file: File): Promise<RenderedPlan> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  return isPdf ? renderPdf(file) : renderImage(file);
}
