import type { FloorInfo, Opening, Point, Room, Wall } from '../types';
import { computeWallPolygons } from './wallGeometry';
import { isFence } from './fence';
import { polygonArea } from './geometry';

/**
 * Write the design as an IFC4 building model (ISO 10303-21 text, one file, all
 * storeys).
 *
 * A hand-written STEP writer: IFC4 is plain numbered text lines, and we only
 * ever WRITE it, so there is no runtime library. The test suite parses the
 * output back with web-ifc, which is a devDependency and is never shipped.
 *
 * What is written: IfcProject > IfcSite > IfcBuilding > one IfcBuildingStorey
 * per floor; an IfcWall per non-fence wall (the same mitred outline the DXF and
 * 3D view use, extruded to the wall height); an IfcOpeningElement per door and
 * window, cut into its wall (IfcRelVoidsElement) and filled by an IfcDoor or
 * IfcWindow (IfcRelFillsElement); and an IfcSpace per indoor room. Not in v1:
 * furniture, stairs, roofs, slabs, materials, curved or bay openings (they come
 * out as plain rectangles).
 *
 * Units and axes. HD stores centimetres with plan-y pointing DOWN the screen;
 * IFC is metres with y pointing up. We write x/100 and -y/100, which keeps the
 * plan looking the way it does on screen when viewed from above (a mirror image
 * would be the other choice, and a wrong one).
 *
 * Openings on angled walls. Every wall gets its OWN local placement: origin at
 * the wall's start point, local x along the wall direction, z up. The wall
 * outline is written in that frame, and each opening is placed in the same
 * frame (x = offset along the axis, y = 0 on the axis, z = sill). Because the
 * frame rotates with the wall, nothing depends on the wall's angle.
 */

export interface IfcExportInput {
  projectName: string;
  floors: FloorInfo[];
  geom: Record<string, { walls: Wall[]; rooms: Room[]; openings: Opening[] }>;
  /** Written into FILE_NAME. Defaults to a fixed value so the same project
   *  always produces byte-identical output. */
  timestamp?: string;
}

// ---- GUIDs -----------------------------------------------------------------

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** cyrb128: four well-mixed 32-bit words from a string, deterministic. */
function hash128(s: string): number[] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** IFC's compressed GUID: 128 bits as 22 base-64 characters (2 bits, then 21 x 6). */
function compressGuid(words: number[]): string {
  const bits = words.map((w) => w.toString(2).padStart(32, '0')).join('');
  let out = B64[parseInt(bits.slice(0, 2), 2)];
  for (let i = 2; i < 128; i += 6) out += B64[parseInt(bits.slice(i, i + 6), 2)];
  return out;
}

// ---- STEP primitives -------------------------------------------------------

/** STEP string literal. Non-ASCII goes out as \X2\....\X0\ (UTF-16 hex). */
function str(value: string): string {
  const s = value.replace(/[\r\n\t]+/g, ' ');
  let out = '';
  let run = '';
  const flush = () => {
    if (run) out += `\\X2\\${run}\\X0\\`;
    run = '';
  };
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 32 && c <= 126) {
      flush();
      const ch = s[i];
      out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch;
    } else {
      run += c.toString(16).toUpperCase().padStart(4, '0');
    }
  }
  flush();
  return `'${out}'`;
}

/** STEP REAL: always has a decimal point, no exponent. Metres, 0.1 mm. */
function num(v: number): string {
  const r = Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000;
  const s = r === 0 ? '0' : String(r);
  return s.includes('.') ? s : `${s}.`;
}

const list = (items: string[]) => `(${items.join(',')})`;

class Step {
  private lines: string[] = [];
  add(body: string): string {
    this.lines.push(`#${this.lines.length + 1}=${body};`);
    return `#${this.lines.length}`;
  }
  get body(): string {
    return this.lines.join('\n');
  }
}

// ---- geometry helpers ------------------------------------------------------

const M = 0.01; // cm -> m
/** HD plan point (cm, y down) to IFC world XY (m, y up). */
const toIfc = (p: Point): Point => ({ x: p.x * M, y: -p.y * M });

/** Counter-clockwise, no repeated points: what a profile outline wants. */
function cleanRing(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a.x - b.x) <= 1e-6 && Math.abs(a.y - b.y) <= 1e-6) out.pop();
  }
  return polygonArea(out) < 0 ? out.reverse() : out;
}

// ---- the writer ------------------------------------------------------------

export function buildIfc(input: IfcExportInput): string {
  const st = new Step();
  const guids = new Set<string>();
  const guid = (key: string): string => {
    let g = compressGuid(hash128(key));
    // A collision between two different keys is astronomically unlikely, but a
    // duplicate GlobalId makes viewers drop elements; rehash deterministically.
    for (let n = 1; guids.has(g); n++) g = compressGuid(hash128(`${key}#${n}`));
    guids.add(g);
    return str(g);
  };

  // Shared building blocks.
  const origin3 = st.add('IFCCARTESIANPOINT((0.,0.,0.))');
  const dirZ = st.add('IFCDIRECTION((0.,0.,1.))');
  const dirX = st.add('IFCDIRECTION((1.,0.,0.))');
  const axisWorld = st.add(`IFCAXIS2PLACEMENT3D(${origin3},${dirZ},${dirX})`);

  const axis3 = (x: number, y: number, z: number, refDir?: Point): string => {
    const p = st.add(`IFCCARTESIANPOINT((${num(x)},${num(y)},${num(z)}))`);
    if (!refDir) return st.add(`IFCAXIS2PLACEMENT3D(${p},$,$)`);
    const d = st.add(`IFCDIRECTION((${num(refDir.x)},${num(refDir.y)},0.))`);
    return st.add(`IFCAXIS2PLACEMENT3D(${p},${dirZ},${d})`);
  };
  const placement = (rel: string | null, axis: string) =>
    st.add(`IFCLOCALPLACEMENT(${rel ?? '$'},${axis})`);

  // Units: metres, square metres, cubic metres, radians.
  const uLen = st.add('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)');
  const uArea = st.add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)');
  const uVol = st.add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)');
  const uAngle = st.add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
  const units = st.add(`IFCUNITASSIGNMENT(${list([uLen, uArea, uVol, uAngle])})`);

  const ctx = st.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${axisWorld},$)`);
  const body = st.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);

  const project = st.add(
    `IFCPROJECT(${guid(`project|${input.projectName}`)},$,${str(input.projectName || 'HomeDesigner project')},$,$,$,$,${list([ctx])},${units})`,
  );
  const sitePl = placement(null, axisWorld);
  const site = st.add(`IFCSITE(${guid('site')},$,'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const buildingPl = placement(sitePl, axisWorld);
  const building = st.add(`IFCBUILDING(${guid('building')},$,'Building',$,$,${buildingPl},$,$,.ELEMENT.,$,$,$)`);
  st.add(`IFCRELAGGREGATES(${guid('rel|project-site')},$,$,$,${project},${list([site])})`);
  st.add(`IFCRELAGGREGATES(${guid('rel|site-building')},$,$,$,${site},${list([building])})`);

  /** Sweep a closed 2D outline (metres, already CCW) up by `depth`. */
  const prism = (ring: Point[], depth: number): string => {
    const pts = [...ring, ring[0]].map((p) => st.add(`IFCCARTESIANPOINT((${num(p.x)},${num(p.y)}))`));
    const curve = st.add(`IFCPOLYLINE(${list(pts)})`);
    const profile = st.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${curve})`);
    return st.add(`IFCEXTRUDEDAREASOLID(${profile},${axisWorld},${dirZ},${num(depth)})`);
  };
  /** A box w x d centred on the local origin line, starting at the local origin
   *  in x (so it spans 0..w along the wall) and rising by `h`. */
  const box = (w: number, d: number, h: number): string => {
    const centre = st.add(`IFCCARTESIANPOINT((${num(w / 2)},0.))`);
    const pos = st.add(`IFCAXIS2PLACEMENT2D(${centre},$)`);
    const profile = st.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos},${num(w)},${num(d)})`);
    return st.add(`IFCEXTRUDEDAREASOLID(${profile},${axisWorld},${dirZ},${num(h)})`);
  };
  const shape = (solid: string): string => {
    const rep = st.add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',${list([solid])})`);
    return st.add(`IFCPRODUCTDEFINITIONSHAPE($,$,${list([rep])})`);
  };

  const storeys: string[] = [];
  const ordered = [...input.floors].sort((a, b) => a.elevation - b.elevation);
  ordered.forEach((floor, fi) => {
    const g = input.geom[floor.id] ?? { walls: [], rooms: [], openings: [] };
    const elev = floor.elevation * M;
    const storeyPl = placement(buildingPl, axis3(0, 0, elev));
    const storey = st.add(
      `IFCBUILDINGSTOREY(${guid(`storey|${floor.id}`)},$,${str(floor.name || `Level ${fi + 1}`)},$,$,${storeyPl},$,$,.ELEMENT.,${num(elev)})`,
    );

    const walls = g.walls.filter((w) => !isFence(w));
    const polys = computeWallPolygons(walls);
    const contained: string[] = [];

    for (const wall of walls) {
      const poly = polys.get(wall.id);
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const lenCm = Math.hypot(dx, dy);
      if (!poly || lenCm < 1 || !(wall.height > 0)) continue;

      // Wall frame, in IFC space: origin at the start point, x along the wall.
      const o = toIfc(wall.start);
      const ux = dx / lenCm;
      const uy = -dy / lenCm;
      const nx = -uy;
      const ny = ux;
      const local = (p: Point): Point => {
        const q = toIfc(p);
        return { x: (q.x - o.x) * ux + (q.y - o.y) * uy, y: (q.x - o.x) * nx + (q.y - o.y) * ny };
      };
      const ring = cleanRing(poly.map(local));
      if (ring.length < 3 || Math.abs(polygonArea(ring)) < 1e-6) continue;

      const wallPl = placement(storeyPl, axis3(o.x, o.y, 0, { x: ux, y: uy }));
      const wallId = st.add(
        `IFCWALL(${guid(`wall|${wall.id}`)},$,${str('Wall')},$,$,${wallPl},${shape(prism(ring, wall.height * M))},$,.STANDARD.)`,
      );
      contained.push(wallId);

      const t = wall.thickness * M;
      for (const op of g.openings) {
        if (op.wallId !== wall.id) continue;
        // Keep the opening inside the wall's run and height.
        const w = Math.min(op.width * M, lenCm * M);
        const sill = Math.max(0, op.sill) * M;
        const h = Math.min(op.height * M, wall.height * M - sill);
        if (!(w > 0.01) || !(h > 0.01)) continue;
        const c = Math.min(Math.max(op.offset * lenCm * M, w / 2), lenCm * M - w / 2);
        const isDoor = op.type === 'door';
        const kind = isDoor ? 'Door' : 'Window';

        const opPl = placement(wallPl, axis3(c - w / 2, 0, sill));
        // A little deeper than the wall so the cut never leaves a skin.
        const opening = st.add(
          `IFCOPENINGELEMENT(${guid(`opening|${op.id}`)},$,${str(`${kind} opening`)},$,$,${opPl},${shape(box(w, t + 0.04, h))},$,.OPENING.)`,
        );
        st.add(`IFCRELVOIDSELEMENT(${guid(`void|${op.id}`)},$,$,$,${wallId},${opening})`);

        const fillPl = placement(opPl, axis3(0, 0, 0));
        const leaf = shape(box(w, Math.min(t, isDoor ? 0.05 : 0.06), h));
        const filler = isDoor
          ? st.add(`IFCDOOR(${guid(`door|${op.id}`)},$,${str('Door')},$,$,${fillPl},${leaf},$,${num(h)},${num(w)},.DOOR.,$,$)`)
          : st.add(`IFCWINDOW(${guid(`window|${op.id}`)},$,${str('Window')},$,$,${fillPl},${leaf},$,${num(h)},${num(w)},.WINDOW.,$,$)`);
        st.add(`IFCRELFILLSELEMENT(${guid(`fill|${op.id}`)},$,$,$,${opening},${filler})`);
        contained.push(filler);
      }
    }

    // Rooms: indoor only, extruded to the storey's height.
    const next = ordered[fi + 1];
    const wallTop = walls.reduce((m, w) => Math.max(m, w.height), 0);
    const storeyH = (next ? next.elevation - floor.elevation : wallTop || 270) * M;
    const spaces: string[] = [];
    for (const room of g.rooms) {
      if (room.outdoor || room.points.length < 3) continue;
      const ring = cleanRing(room.points.map(toIfc));
      if (ring.length < 3 || Math.abs(polygonArea(ring)) < 1e-6) continue;
      const spacePl = placement(storeyPl, axisWorld);
      const space = st.add(
        `IFCSPACE(${guid(`space|${room.id}`)},$,${str(room.name || 'Room')},$,$,${spacePl},${shape(prism(ring, storeyH))},$,.ELEMENT.,.INTERNAL.,$)`,
      );
      spaces.push(space);
      const area = st.add(`IFCQUANTITYAREA('NetFloorArea',$,$,${num(Math.abs(polygonArea(ring)))},$)`);
      const qto = st.add(
        `IFCELEMENTQUANTITY(${guid(`qto|${room.id}`)},$,'Qto_SpaceBaseQuantities',$,$,${list([area])})`,
      );
      st.add(`IFCRELDEFINESBYPROPERTIES(${guid(`qrel|${room.id}`)},$,$,$,${list([space])},${qto})`);
    }

    if (spaces.length) st.add(`IFCRELAGGREGATES(${guid(`rel|storey-spaces|${floor.id}`)},$,$,$,${storey},${list(spaces)})`);
    if (contained.length) {
      st.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`rel|storey-elements|${floor.id}`)},$,$,$,${list(contained)},${storey})`);
    }
    storeys.push(storey);
  });

  if (storeys.length) st.add(`IFCRELAGGREGATES(${guid('rel|building-storeys')},$,$,$,${building},${list(storeys)})`);

  const header = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(`${input.projectName || 'project'}.ifc`)},${str(input.timestamp ?? '1970-01-01T00:00:00')},(''),(''),'HomeDesigner','HomeDesigner','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
  ].join('\n');
  return `${header}\n${st.body}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
