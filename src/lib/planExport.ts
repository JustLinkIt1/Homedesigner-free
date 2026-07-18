// Export the 2D plan as a PNG image or a titled PDF plan pack.
// The framed PNG is produced by Canvas2D via the `planCapture` bridge; the PDF
// gets one auto-oriented A4 page PER STOREY (title block, true scale bar,
// floor area) plus a summary page with a per-room area schedule, the total
// living area and a doors & windows schedule.
import { planCapture, type PlanShot } from './renderBridge';
import { saveImage } from './native';
import { slugify as slug, APP_NAME } from './appInfo';
import { applyWatermark } from './watermark';
import { useProStore } from '../store/proStore';
import { useDesign } from '../store/designStore';
import { formatArea, formatLength, type Units } from './units';
import { buildFloorSchedules, buildOpeningSchedule } from './planSchedule';
import { buildBom } from './bom';
import { t, useLang } from './i18n';

/** Capture the current design as a framed PNG data URL (null if empty). */
export function capturePlanDataUrl(): string | null {
  return planCapture.current?.()?.url ?? null;
}

/** Save the framed plan as a PNG (web download / Android share). */
export async function exportPlanPNG(projectName: string): Promise<boolean> {
  let url = capturePlanDataUrl();
  if (!url) return false;
  if (!useProStore.getState().isPro) url = await applyWatermark(url);
  await saveImage(url, `${slug(projectName)}-plan.png`);
  return true;
}

// jsPDF's built-in Helvetica only encodes cp1252, so translated PDF text is
// limited to locales that fit it; the rest keep the English labels (mojibake
// would be worse). UI strings are unaffected.
const CP1252_LANGS = new Set(['en', 'fr', 'es', 'de', 'it', 'pt', 'nl']);
const tp = (en: string): string => (CP1252_LANGS.has(useLang.getState().lang) ? t(en) : en);

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

/** Largest "round" bar length whose printed width stays modest. */
function pickScaleBarCm(ptPerCm: number): number {
  const candidates = [1000, 500, 300, 200, 100, 50];
  for (const cm of candidates) if (cm * ptPerCm <= 150) return cm;
  return 50;
}

// Layout constants shared by the floor pages (pt).
const MARGIN = 36;
const TITLE_H = 30;
const FOOT_H = 30; // scale-bar row + dated footer

interface JsPdf {
  addPage: (format: string, orientation: 'landscape' | 'portrait') => void;
  addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  text: (txt: string, x: number, y: number, opts?: { align?: 'right' | 'center' }) => void;
  setFontSize: (n: number) => void;
  setTextColor: (n: number) => void;
  setDrawColor: (n: number) => void;
  setFont: (name: string, style: 'normal' | 'bold') => void;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  output: (kind: 'datauristring') => string;
}

function drawFloorPage(
  pdf: JsPdf,
  shot: { name: string; img: HTMLImageElement; pxPerCm: number; areaCm2: number },
  projectName: string,
  pageLabel: string,
  units: Units,
  date: string,
) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const availW = pageW - MARGIN * 2;
  const availH = pageH - MARGIN * 2 - TITLE_H - FOOT_H;
  const scale = Math.min(availW / shot.img.width, availH / shot.img.height);
  const w = shot.img.width * scale;
  const h = shot.img.height * scale;
  const x = (pageW - w) / 2;
  const y = MARGIN + TITLE_H + (availH - h) / 2;

  // Title block: project left; floor + page right; rule.
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(20);
  pdf.text(projectName || 'Home plan', MARGIN, MARGIN + 14);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(120);
  pdf.text(pageLabel, pageW - MARGIN, MARGIN + 14, { align: 'right' });
  pdf.setDrawColor(200);
  pdf.line(MARGIN, MARGIN + TITLE_H - 6, pageW - MARGIN, MARGIN + TITLE_H - 6);

  const { data, format } = toJpeg(shot.img);
  pdf.addImage(data, format, x, y, w, h);

  // Scale bar (true paper scale) bottom-left + floor area bottom-right.
  const ptPerCm = scale * shot.pxPerCm;
  const barCm = pickScaleBarCm(ptPerCm);
  const barW = barCm * ptPerCm;
  const barY = pageH - MARGIN - 10;
  pdf.setDrawColor(60);
  pdf.line(MARGIN, barY, MARGIN + barW, barY);
  pdf.line(MARGIN, barY - 4, MARGIN, barY + 4);
  pdf.line(MARGIN + barW, barY - 4, MARGIN + barW, barY + 4);
  pdf.setFontSize(9);
  pdf.setTextColor(60);
  pdf.text(formatLength(barCm, units), MARGIN + barW + 6, barY + 3);
  // Paper ratio, e.g. "≈ 1:75" (1 pt of paper is 2.54/72 cm).
  const ratio = Math.round(1 / ptPerCm / (2.54 / 72) / 5) * 5;
  if (ratio >= 5) pdf.text(`~ 1:${ratio}`, MARGIN, barY - 8);
  if (shot.areaCm2 > 0) {
    pdf.text(
      `${tp('Floor area')}: ${formatArea(shot.areaCm2, units)}`,
      pageW - MARGIN,
      barY + 3,
      { align: 'right' },
    );
  }

  pdf.setFontSize(9);
  pdf.setTextColor(150);
  pdf.text(`${APP_NAME} · ${date}`, pageW - MARGIN, pageH - MARGIN + 24, { align: 'right' });
}

/** Table writer for the summary page: handles pagination + column layout. */
class SummaryWriter {
  y = MARGIN + TITLE_H;
  constructor(
    private pdf: JsPdf,
    private title: string,
  ) {}
  private ensure(rowH: number) {
    const pageH = this.pdf.internal.pageSize.getHeight();
    if (this.y + rowH <= pageH - MARGIN) return;
    this.pdf.addPage('a4', 'portrait');
    this.y = MARGIN;
  }
  head() {
    const pageW = this.pdf.internal.pageSize.getWidth();
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setFontSize(16);
    this.pdf.setTextColor(20);
    this.pdf.text(this.title, MARGIN, MARGIN + 14);
    this.pdf.setDrawColor(200);
    this.pdf.line(MARGIN, MARGIN + TITLE_H - 6, pageW - MARGIN, MARGIN + TITLE_H - 6);
  }
  section(label: string) {
    this.ensure(40);
    this.y += 20;
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.setFontSize(12);
    this.pdf.setTextColor(20);
    this.pdf.text(label, MARGIN, this.y);
    this.y += 6;
  }
  /** Three columns: name (left), size (middle), value (right). */
  row(name: string, size: string, value: string, opts?: { bold?: boolean; rule?: boolean }) {
    this.ensure(16);
    const pageW = this.pdf.internal.pageSize.getWidth();
    this.y += 15;
    if (opts?.rule) {
      this.pdf.setDrawColor(225);
      this.pdf.line(MARGIN, this.y - 10, pageW - MARGIN, this.y - 10);
    }
    this.pdf.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(opts?.bold ? 20 : 60);
    this.pdf.text(name, MARGIN, this.y);
    if (size) this.pdf.text(size, pageW - MARGIN - 110, this.y, { align: 'right' });
    this.pdf.text(value, pageW - MARGIN, this.y, { align: 'right' });
  }
}

/**
 * Save the plan as a PDF plan pack — one titled A4 page per storey (plan
 * image, true scale bar, floor area) plus a summary page (room schedule with
 * areas, total living area, doors & windows). Floors are captured by
 * switching the active storey through the store and rasterising each via
 * planCapture; the original storey is restored afterwards. Returns the page
 * count (0 = nothing to export).
 */
export async function exportPlanPDF(projectName: string): Promise<number> {
  const st = useDesign.getState();
  const floors = [...st.floors].sort((a, b) => a.elevation - b.elevation);
  const original = st.activeFloorId;
  const units = st.units;
  const schedules = buildFloorSchedules(st.floors, st.floorGeom);
  const openings = buildOpeningSchedule(st.floors, st.floorGeom);
  const areaByFloor = new Map(schedules.map((s) => [s.floorName, s.totalArea]));

  const shots: { name: string; img: HTMLImageElement; pxPerCm: number; areaCm2: number }[] = [];
  try {
    for (const f of floors) {
      if (useDesign.getState().activeFloorId !== f.id) {
        st.setActiveFloor(f.id);
        await nextFrames(3); // let Konva draw the newly active storey
      }
      const shot: PlanShot | null = planCapture.current?.() ?? null;
      if (shot) {
        shots.push({
          name: f.name,
          img: await decode(shot.url),
          pxPerCm: shot.pxPerCm,
          areaCm2: areaByFloor.get(f.name) ?? 0,
        });
      }
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
  const pdf = new jsPDF({ orientation: orient(shots[0].img), unit: 'pt', format: 'a4' }) as unknown as JsPdf;

  const pages = shots.length + 1;
  shots.forEach((shot, i) => {
    if (i > 0) pdf.addPage('a4', orient(shot.img));
    const pageLabel = `${tp(shot.name)}  ·  ${i + 1} / ${pages}`;
    drawFloorPage(pdf, shot, projectName, pageLabel, units, date);
  });

  // Summary page: room schedule per storey, total living area, openings.
  pdf.addPage('a4', 'portrait');
  const sum = new SummaryWriter(pdf, `${projectName || 'Home plan'} — ${tp('Summary')}`);
  sum.head();
  const dims = (w: number, d: number) => `${formatLength(w, units)} × ${formatLength(d, units)}`;
  let living = 0;
  for (const floor of schedules) {
    if (floor.rooms.length === 0) continue;
    living += floor.totalArea;
    sum.section(tp(floor.floorName));
    for (const r of floor.rooms) {
      sum.row(tp(r.name), dims(r.width, r.depth), formatArea(r.area, units), { rule: true });
    }
    if (floor.wallLength > 0) {
      sum.row(tp('Wall length'), '', formatLength(floor.wallLength, units), { rule: true });
    }
    sum.row(tp('Floor total'), '', formatArea(floor.totalArea, units), { bold: true, rule: true });
  }
  if (living > 0) {
    sum.section('');
    sum.row(tp('Total living area'), '', formatArea(living, units), { bold: true });
  }
  if (openings.length > 0) {
    sum.section(tp('Doors & windows'));
    for (const o of openings) {
      sum.row(tp(o.label), dims(o.width, o.height), `× ${o.count}`, { rule: true });
    }
  }
  // Furniture shopping list — same aggregation as the in-app panel.
  const bom = buildBom(st.floors, st.floorGeom);
  if (bom.length > 0) {
    sum.section(tp('Shopping list'));
    for (const b of bom) {
      sum.row(tp(b.name), dims(b.width, b.depth), `× ${b.count}`, { rule: true });
    }
  }
  {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(150);
    pdf.text(`${APP_NAME} · ${date}`, pageW - MARGIN, pageH - MARGIN + 24, { align: 'right' });
  }

  // Route through the same save path as images (web download / Android share).
  const dataUri = pdf.output('datauristring');
  await saveImage(dataUri, `${slug(projectName)}-plan.pdf`);
  return pages;
}
