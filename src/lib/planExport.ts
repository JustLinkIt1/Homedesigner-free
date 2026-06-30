// Export the 2D plan as a PNG image or a titled PDF page.
// The framed PNG is produced by Canvas2D via the `planCapture` bridge; the PDF
// lays that image on an auto-oriented A4 page with the project name as a title.
import { planCapture } from './renderBridge';
import { saveImage } from './native';

/** Filesystem-safe slug for export filenames. */
function slug(name: string): string {
  const s = (name || 'home-plan')
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s || 'home-plan';
}

/** Capture the current design as a framed PNG data URL (null if empty). */
export function capturePlanDataUrl(): string | null {
  return planCapture.current?.() ?? null;
}

/** Save the framed plan as a PNG (web download / Android share). */
export async function exportPlanPNG(projectName: string): Promise<boolean> {
  const url = capturePlanDataUrl();
  if (!url) return false;
  await saveImage(url, `${slug(projectName)}-plan.png`);
  return true;
}

/** Save the framed plan as a one-page PDF titled with the project name. */
export async function exportPlanPDF(projectName: string): Promise<boolean> {
  const url = capturePlanDataUrl();
  if (!url) return false;

  // Measure the captured image so the PDF page can match its orientation.
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = url;
  });

  // Re-encode as JPEG over white for a compact PDF (the PNG embed is huge —
  // tens of MB — because jsPDF stores it near-losslessly).
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const cctx = canvas.getContext('2d');
  let imgData = url;
  let imgFormat: 'PNG' | 'JPEG' = 'PNG';
  if (cctx) {
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, canvas.width, canvas.height);
    cctx.drawImage(img, 0, 0);
    imgData = canvas.toDataURL('image/jpeg', 0.92);
    imgFormat = 'JPEG';
  }

  const { jsPDF } = await import('jspdf');
  const landscape = img.width >= img.height;
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const titleH = 30;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2 - titleH;
  const scale = Math.min(availW / img.width, availH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (pageW - w) / 2;
  const y = margin + titleH + (availH - h) / 2;

  pdf.setFontSize(16);
  pdf.text(projectName || 'Home plan', margin, margin + 14);
  pdf.addImage(imgData, imgFormat, x, y, w, h);

  // Route through the same save path as images (web download / Android share).
  const dataUri = pdf.output('datauristring');
  await saveImage(dataUri, `${slug(projectName)}-plan.pdf`);
  return true;
}
