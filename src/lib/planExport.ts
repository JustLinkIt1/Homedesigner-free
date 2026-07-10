// Export the 2D plan as a PNG image or a titled PDF document.
// The framed PNG is produced by Canvas2D via the `planCapture` bridge; the PDF
// gets one auto-oriented A4 page PER STOREY with a title block (project,
// floor name, page number, date).
import { planCapture } from './renderBridge';
import { saveImage } from './native';
import { slugify as slug, APP_NAME } from './appInfo';
import { applyWatermark } from './watermark';
import { useProStore } from '../store/proStore';
import { useDesign } from '../store/designStore';

/** Capture the current design as a framed PNG data URL (null if empty). */
export function capturePlanDataUrl(): string | null {
  return planCapture.current?.() ?? null;
}

/** Save the framed plan as a PNG (web download / Android share). */
export async function exportPlanPNG(projectName: string): Promise<boolean> {
  let url = capturePlanDataUrl();
  if (!url) return false;
  if (!useProStore.getState().isPro) url = await applyWatermark(url);
  await saveImage(url, `${slug(projectName)}-plan.png`);
  return true;
}

const nextFrames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (k: number) => (k <= 0 ? resolve() : requestAnimationFrame(() => step(k - 1)));
    step(n);
  });

async function decode(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = url;
  });
  return img;
}

/** Re-encode over white as JPEG for a compact PDF (jsPDF stores PNG huge). */
function toJpeg(img: HTMLImageElement): { data: string; format: 'PNG' | 'JPEG' } {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const cctx = canvas.getContext('2d');
  if (!cctx) return { data: img.src, format: 'PNG' };
  cctx.fillStyle = '#ffffff';
  cctx.fillRect(0, 0, canvas.width, canvas.height);
  cctx.drawImage(img, 0, 0);
  return { data: canvas.toDataURL('image/jpeg', 0.92), format: 'JPEG' };
}

/**
 * Save the plan as a PDF — one titled A4 page per storey (a single-floor
 * design produces the familiar one-pager). Floors are captured by switching
 * the active storey through the store and rasterising each via planCapture;
 * the original storey is restored afterwards. Returns the page count (0 =
 * nothing to export).
 */
export async function exportPlanPDF(projectName: string): Promise<number> {
  const st = useDesign.getState();
  const floors = [...st.floors].sort((a, b) => a.elevation - b.elevation);
  const original = st.activeFloorId;

  const shots: { name: string; img: HTMLImageElement }[] = [];
  try {
    for (const f of floors) {
      if (useDesign.getState().activeFloorId !== f.id) {
        st.setActiveFloor(f.id);
        await nextFrames(3); // let Konva draw the newly active storey
      }
      const url = capturePlanDataUrl();
      if (url) shots.push({ name: f.name, img: await decode(url) });
    }
  } finally {
    if (useDesign.getState().activeFloorId !== original) {
      st.setActiveFloor(original);
    }
  }
  if (shots.length === 0) return 0;

  const { jsPDF } = await import('jspdf');
  const date = new Date().toLocaleDateString();
  const orient = (img: HTMLImageElement): 'landscape' | 'portrait' =>
    img.width >= img.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation: orient(shots[0].img), unit: 'pt', format: 'a4' });

  shots.forEach((shot, i) => {
    if (i > 0) pdf.addPage('a4', orient(shot.img));
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 36;
    const titleH = 30;
    const footH = 18;
    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2 - titleH - footH;
    const scale = Math.min(availW / shot.img.width, availH / shot.img.height);
    const w = shot.img.width * scale;
    const h = shot.img.height * scale;
    const x = (pageW - w) / 2;
    const y = margin + titleH + (availH - h) / 2;

    // Title block: project left; floor + page right; rule; dated footer.
    pdf.setFontSize(16);
    pdf.setTextColor(20);
    pdf.text(projectName || 'Home plan', margin, margin + 14);
    pdf.setFontSize(10);
    pdf.setTextColor(120);
    const right = shots.length > 1 ? `${shot.name}  ·  page ${i + 1} of ${shots.length}` : shot.name;
    pdf.text(right, pageW - margin, margin + 14, { align: 'right' });
    pdf.setDrawColor(200);
    pdf.line(margin, margin + titleH - 6, pageW - margin, margin + titleH - 6);
    const { data, format } = toJpeg(shot.img);
    pdf.addImage(data, format, x, y, w, h);
    pdf.setFontSize(9);
    pdf.setTextColor(150);
    pdf.text(`${APP_NAME} · ${date}`, pageW - margin, pageH - margin + 8, { align: 'right' });
  });

  // Route through the same save path as images (web download / Android share).
  const dataUri = pdf.output('datauristring');
  await saveImage(dataUri, `${slug(projectName)}-plan.pdf`);
  return shots.length;
}
