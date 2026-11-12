// The sketch step of the scroll house, drawn the way the app's 2D editor draws
// a plan (dark theme): grey wall bodies with a darker edge, dashed fences,
// light-blue windows, door leaves with their swing arc, dimension plates and
// room labels. It paints into a canvas that lies on the ground as a texture,
// so the 3D walls can rise straight out of the drawing.
//
// plan comes from the model's glTF extras (tools/export-web-model.mjs), in
// metres: walls [{a, b, t, kind}], openings [{wall, at, width, type, style,
// flipHinge, flipSwing}], rooms [{name, outdoor, pts}].

const C = {
  wallBody: '#aeb5c2', wallEdge: '#5b6474', pen: '#3b82ff',
  glass: '#bfe3ff', glassEdge: '#6fbcff', door: '#f2f5fa',
  plate: 'rgba(16, 20, 30, 0.92)', plateEdge: 'rgba(255, 255, 255, 0.16)', text: '#ffffff', textDim: '#b9c2d3',
};
const PX = 64;      // texture pixels per metre
const MARGIN = 1.9; // metres of room around the plan for the dimension plates
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createPlan2D(THREE, plan, fontFamily) {
  const xs = [], zs = [];
  for (const w of plan.walls) { xs.push(w.a[0], w.b[0]); zs.push(w.a[1], w.b[1]); }
  for (const r of plan.rooms) for (const p of r.pts) { xs.push(p[0]); zs.push(p[1]); }
  const minX = Math.min(...xs) - MARGIN, minZ = Math.min(...zs) - MARGIN;
  const wM = Math.max(...xs) + MARGIN - minX, hM = Math.max(...zs) + MARGIN - minZ;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(wM * PX);
  cv.height = Math.ceil(hM * PX);
  const g = cv.getContext('2d');
  const X = (x) => (x - minX) * PX, Y = (z) => (z - minZ) * PX;

  // Outward = away from the middle of the building, so plates sit outside it.
  const solid = plan.walls.filter((w) => w.kind !== 'fence');
  const mid = solid.reduce((m, w) => [m[0] + (w.a[0] + w.b[0]) / 2 / solid.length, m[1] + (w.a[1] + w.b[1]) / 2 / solid.length], [0, 0]);
  let total = 0;
  const walls = plan.walls.map((w) => {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
    const len = Math.hypot(dx, dz) || 1e-6;
    const u = [dx / len, dz / len];
    let n = [-u[1], u[0]];
    const cx = (w.a[0] + w.b[0]) / 2 - mid[0], cz = (w.a[1] + w.b[1]) / 2 - mid[1];
    if (n[0] * cx + n[1] * cz < 0) n = [-n[0], -n[1]];
    const weight = len + 1.5; // short walls still get a moment
    const from = total;
    total += weight;
    return { ...w, len, u, n, left: [-u[1], u[0]], from, to: total };
  });
  for (const w of walls) { w.from /= total; w.to /= total; }

  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), material);
  mesh.rotation.x = -Math.PI / 2; // canvas top = smaller z, like the editor's y axis
  mesh.position.set(minX + wM / 2, 0.03, minZ + hM / 2);
  mesh.renderOrder = 2;

  function plate(x, y, angle, lines, scale = 1, alpha = 1) {
    const size = 0.36 * PX * scale;
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.rotate(angle);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${size}px ${fontFamily}`;
    const small = `600 ${size * 0.8}px ${fontFamily}`;
    let w = g.measureText(lines[0]).width;
    if (lines[1]) { g.font = small; w = Math.max(w, g.measureText(lines[1]).width); }
    const padX = size * 0.6, lineH = size * 1.2;
    const bw = w + padX * 2, bh = lineH * lines.length + size * 0.5;
    g.beginPath();
    g.roundRect(-bw / 2, -bh / 2, bw, bh, size * 0.5);
    g.fillStyle = C.plate;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = C.plateEdge;
    g.stroke();
    g.font = `700 ${size}px ${fontFamily}`;
    g.fillStyle = C.text;
    g.fillText(lines[0], 0, lines[1] ? -lineH / 2 : 1);
    if (lines[1]) { g.font = small; g.fillStyle = C.textDim; g.fillText(lines[1], 0, lineH / 2 + 1); }
    g.restore();
  }

  function wallBody(w, k) {
    const L = w.len * k;
    const [ax, az] = w.a, [ux, uz] = w.u;
    if (w.kind === 'fence') {
      g.beginPath();
      g.moveTo(X(ax), Y(az));
      g.lineTo(X(ax + ux * L), Y(az + uz * L));
      g.strokeStyle = C.wallBody;
      g.lineWidth = Math.max(0.05, w.t * 0.6) * PX;
      g.setLineDash([0.2 * PX, 0.13 * PX]);
      g.stroke();
      g.setLineDash([]);
      return;
    }
    const h = w.t / 2;
    const [lx, lz] = w.left;
    const p = (along, side) => [X(ax + ux * along + lx * side), Y(az + uz * along + lz * side)];
    g.beginPath();
    g.moveTo(...p(-h, h));
    g.lineTo(...p(L + h, h));
    g.lineTo(...p(L + h, -h));
    g.lineTo(...p(-h, -h));
    g.closePath();
    g.fillStyle = C.wallBody;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = C.wallEdge;
    g.stroke();
    if (w.kind === 'half') {
      g.beginPath();
      g.moveTo(X(ax), Y(az));
      g.lineTo(X(ax + ux * L), Y(az + uz * L));
      g.setLineDash([0.12 * PX, 0.08 * PX]);
      g.stroke();
      g.setLineDash([]);
    }
  }

  function opening(o, alpha) {
    const w = walls[o.wall];
    if (!w || w.kind === 'fence') return;
    const [ux, uz] = w.u, [lx, lz] = w.left;
    const c = [w.a[0] + ux * w.len * o.at, w.a[1] + uz * w.len * o.at];
    const half = o.width / 2, h = w.t / 2;
    const p = (along, side) => [X(c[0] + ux * along + lx * side), Y(c[1] + uz * along + lz * side)];
    const quad = (a0, a1, s) => { g.beginPath(); g.moveTo(...p(a0, s)); g.lineTo(...p(a1, s)); g.lineTo(...p(a1, -s)); g.lineTo(...p(a0, -s)); g.closePath(); };
    g.save();
    // Cut the gap out of the wall body, then draw the symbol in it.
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = alpha;
    quad(-half, half, h + 2 / PX);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.lineCap = 'round';
    if (o.type === 'window' || o.style === 'sliding') {
      quad(-half, half, h * 0.55);
      g.fillStyle = C.glass;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = C.glassEdge;
      g.stroke();
    } else {
      const leaves = o.style === 'double' ? [[-half, 1, half], [half, -1, half]] : [[o.flipHinge ? half : -half, o.flipHinge ? -1 : 1, o.width]];
      const side = o.flipSwing ? -1 : 1;
      g.strokeStyle = C.door;
      for (const [hinge, dir, r] of leaves) {
        const [hx, hy] = p(hinge, 0);
        const open = p(hinge, side * r), shut = p(hinge + dir * r, 0);
        g.lineWidth = 0.06 * PX;
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(...open); g.stroke();
        const a0 = Math.atan2(open[1] - hy, open[0] - hx), a1 = Math.atan2(shut[1] - hy, shut[0] - hx);
        let d = a1 - a0;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(hx, hy, r * PX, a0, a1, d < 0); g.stroke();
      }
    }
    g.restore();
  }

  let last = -1;
  /** t: 0 = blank page, 1 = finished plan. */
  function draw(t) {
    if (t === last) return;
    last = t;
    g.clearRect(0, 0, cv.width, cv.height);
    const wallsT = clamp01(t / 0.76), detail = seg(t, 0.76, 1);
    let tip = null;
    for (const w of walls) {
      const k = seg(wallsT, w.from, w.to);
      if (k <= 0) continue;
      wallBody(w, k);
      if (k < 1) tip = [w, k];
    }
    plan.openings.forEach((o, i) => {
      const a = easeOut(seg(detail, (i / plan.openings.length) * 0.5, (i / plan.openings.length) * 0.5 + 0.4));
      if (a > 0) opening(o, a);
    });
    // Dimension plates: live while a wall is being drawn, like typing a length in the editor.
    for (const w of walls) {
      const k = seg(wallsT, w.from, w.to);
      if (k <= 0 || w.kind === 'fence' || w.len < 1.5) continue;
      const L = w.len * k, off = w.t / 2 + 0.62;
      let ang = Math.atan2(w.u[1], w.u[0]);
      if (ang > Math.PI / 2 + 1e-6 || ang <= -Math.PI / 2 + 1e-6) ang += Math.PI;
      plate(X(w.a[0] + w.u[0] * L / 2 + w.n[0] * off), Y(w.a[1] + w.u[1] * L / 2 + w.n[1] * off), ang, [`${L.toFixed(2)} m`], 1, Math.min(1, k * 6));
    }
    plan.rooms.forEach((r, i) => {
      const a = easeOut(seg(detail, 0.35 + i * 0.08, 0.75 + i * 0.08));
      if (a <= 0 || !r.name) return;
      let area = 0, cx = 0, cz = 0;
      r.pts.forEach((p, j) => {
        const q = r.pts[(j + 1) % r.pts.length], cross = p[0] * q[1] - q[0] * p[1];
        area += cross; cx += (p[0] + q[0]) * cross; cz += (p[1] + q[1]) * cross;
      });
      if (Math.abs(area) < 1e-6) return;
      plate(X(cx / (3 * area)), Y(cz / (3 * area)), 0, [r.name, `${Math.abs(area / 2).toFixed(2)} m²`], 0.85 + 0.15 * a, a);
    });
    if (tip) {
      const [w, k] = tip, x = X(w.a[0] + w.u[0] * w.len * k), y = Y(w.a[1] + w.u[1] * w.len * k);
      g.beginPath(); g.arc(X(w.a[0]), Y(w.a[1]), 0.1 * PX, 0, Math.PI * 2);
      g.fillStyle = '#fff'; g.fill();
      g.beginPath(); g.arc(x, y, 0.17 * PX, 0, Math.PI * 2);
      g.fillStyle = C.pen; g.fill();
      g.lineWidth = 0.05 * PX; g.strokeStyle = '#fff'; g.stroke();
    }
    texture.needsUpdate = true;
  }

  // What the camera has to frame while the plan is drawn: the plan plus its plates (metres).
  const pad = MARGIN - 0.7;
  const frame = { cx: minX + wM / 2, cz: minZ + hM / 2, w: wM - pad * 2, h: hM - pad * 2 };
  return { mesh, material, draw, frame };
}
