import type { FloorInfo, FurnitureItem, Opening, Point, Room, Wall } from '../types';
import { computeWallPolygons } from './wallGeometry';
import { isFence } from './fence';
import { polygonArea } from './geometry';
import { roofEaveHeight } from './ceilings';
import { buildStoreyRoof, parapetSegments } from './roofGeometry';
import { isStairs, stairPlanFor, stairRailsFor, stairToPlan } from './stairs';
import { stairCapY, stairHoleRooms, stairHoleSpillRooms } from './stairCut';
import { stairOpeningPoints } from './walkNavigation';

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
 * IfcWindow (IfcRelFillsElement); an IfcSpace per indoor room; and one floor
 * IfcSlab per storey (an extrusion per indoor room, top at the storey).
 *
 * Roofs (v2). Every storey with a roof gets an IfcRoof aggregating one IfcSlab
 * .ROOF., built by the same `buildStoreyRoof` the 3D view uses: a flat roof is
 * the eave outline extruded by the roof thickness; a shed, gable or hip roof is
 * the 3D mesh written as an IfcTriangulatedFaceSet (gable-end infill included).
 * A flat roof's parapet is one IfcWall .PARAPET. per run from
 * `parapetSegments`, cut at the same walls the 3D parapet stops at. All roof
 * entities are written AFTER everything v1 writes, so a project's walls,
 * openings, spaces and floor slabs come out line for line as they did in v1.
 *
 * Stairs (v2, 1.22.51). Every stair item becomes an IfcStair whose body is
 * one block per step from `stairPlanFor` (the plan symbol's and the 3D view's
 * treads: straight, L, U and spiral; a spiral's thin wedges plus its central
 * post). Each enabled handrail (`stairRailsFor`) is an IfcRailing .HANDRAIL.,
 * an IfcSweptDiskSolid (r = 2 cm) along the rail line 90 cm above the treads
 * with a newel at each end, aggregated into its stair. Stair and rails are cut
 * at `stairCapY` (lib/stairCut.ts), the same height the 3D view clips them at.
 * Stairs are written after the roofs, so a v1.22.50 file is an exact prefix.
 *
 * Stairwells (1.22.51, row 58). Where the 3D view cuts a stairwell in the
 * floor of the storey above a stair (`stairHoleCut`), the export writes an
 * IfcOpeningElement of the stair's footprint through that storey's floor slab
 * and an IfcRelVoidsElement to the slab. These come after the stairs, so the
 * file without them is an exact prefix.
 *
 * Not written: other furniture, roof windows, materials, curved or bay
 * openings (they come out as plain rectangles).
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
  /** `furniture` is optional: only its stairs are written. */
  geom: Record<string, { walls: Wall[]; rooms: Room[]; openings: Opening[]; furniture?: FurnitureItem[] }>;
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
/** Floor slab thickness, m: the 3D view's SLAB_T. */
const SLAB_T = 0.22;
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
  const prism = (ring: Point[], depth: number, position = axisWorld): string => {
    const pts = [...ring, ring[0]].map((p) => st.add(`IFCCARTESIANPOINT((${num(p.x)},${num(p.y)}))`));
    const curve = st.add(`IFCPOLYLINE(${list(pts)})`);
    const profile = st.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${curve})`);
    return st.add(`IFCEXTRUDEDAREASOLID(${profile},${position},${dirZ},${num(depth)})`);
  };
  /** A box w x d centred on the local origin line, starting at the local origin
   *  in x (so it spans 0..w along the wall) and rising by `h`. */
  const box = (w: number, d: number, h: number): string => {
    const centre = st.add(`IFCCARTESIANPOINT((${num(w / 2)},0.))`);
    const pos = st.add(`IFCAXIS2PLACEMENT2D(${centre},$)`);
    const profile = st.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos},${num(w)},${num(d)})`);
    return st.add(`IFCEXTRUDEDAREASOLID(${profile},${axisWorld},${dirZ},${num(h)})`);
  };
  const shape = (...solids: string[]): string => shapeOf('SweptSolid', solids);
  const shapeOf = (kind: string, items: string[]): string => {
    const rep = st.add(`IFCSHAPEREPRESENTATION(${body},'Body',${str(kind)},${list(items)})`);
    return st.add(`IFCPRODUCTDEFINITIONSHAPE($,$,${list([rep])})`);
  };

  const storeys: string[] = [];
  const roofed: { floor: FloorInfo; storey: string; storeyPl: string; walls: Wall[]; above?: Wall[]; riseTo?: number }[] = [];
  const ordered = [...input.floors].sort((a, b) => a.elevation - b.elevation);
  const storeyOf = new Map<string, string>();
  const storeyPlOf = new Map<string, string>();
  const slabOf = new Map<string, string>();
  const roomSlabsOf = new Map<string, Map<string, string>>();
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

    // Floor slab: one IfcSlab per storey, its top at the storey elevation. The
    // body is one extrusion per indoor room (their union, without a boolean
    // that could fail on odd outlines); a storey with no indoor room falls
    // back to the wall outlines. Same thickness as the 3D view's SLAB_T.
    // Overlapping rooms (1.22.52): when a stairwell from the storey below
    // would reach into a room that does not get the hole (stairHoleSpillRooms,
    // lib/stairCut.ts), one opening through the shared slab would cut that
    // room's block too, which the 3D view does not. Such a storey writes one
    // IfcSlab per indoor room instead, and each hole voids only the slabs of
    // the rooms that get it (stairHoleRooms). Other storeys are unchanged.
    const indoorRooms = g.rooms.filter((r) => !r.outdoor && r.points.length >= 3);
    const stairsBelow = fi > 0 ? (input.geom[ordered[fi - 1].id]?.furniture ?? []).filter(isStairs) : [];
    if (stairsBelow.some((item) => stairHoleSpillRooms(item, indoorRooms).length)) {
      const roomSlabs = new Map<string, string>();
      for (const room of indoorRooms) {
        const ring = cleanRing(room.points.map(toIfc));
        if (ring.length < 3 || Math.abs(polygonArea(ring)) <= 1e-6) continue;
        const slab = st.add(
          `IFCSLAB(${guid(`slab|${floor.id}|${room.id}`)},$,${str('Floor slab')},$,$,${placement(storeyPl, axisWorld)},${shape(prism(ring, SLAB_T, axis3(0, 0, -SLAB_T)))},$,.FLOOR.)`,
        );
        contained.push(slab);
        roomSlabs.set(room.id, slab);
      }
      roomSlabsOf.set(floor.id, roomSlabs);
    }
    const slabRings = roomSlabsOf.has(floor.id) ? [] : indoorRooms.map((r) => cleanRing(r.points.map(toIfc)));
    const footprints = slabRings.length ? slabRings : walls.flatMap((w) => {
      const poly = polys.get(w.id);
      return poly ? [cleanRing(poly.map(toIfc))] : [];
    });
    const slabSolids = roomSlabsOf.has(floor.id) ? [] : footprints.filter((r) => r.length >= 3 && Math.abs(polygonArea(r)) > 1e-6)
      .map((r) => prism(r, SLAB_T, axis3(0, 0, -SLAB_T)));
    if (slabSolids.length) {
      const slab = st.add(
        `IFCSLAB(${guid(`slab|${floor.id}`)},$,${str('Floor slab')},$,$,${placement(storeyPl, axisWorld)},${shape(...slabSolids)},$,.FLOOR.)`,
      );
      contained.push(slab);
      slabOf.set(floor.id, slab);
    }

    if (spaces.length) st.add(`IFCRELAGGREGATES(${guid(`rel|storey-spaces|${floor.id}`)},$,$,$,${storey},${list(spaces)})`);
    if (contained.length) {
      st.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`rel|storey-elements|${floor.id}`)},$,$,$,${list(contained)},${storey})`);
    }
    storeys.push(storey);
    storeyOf.set(floor.id, storey);
    storeyPlOf.set(floor.id, storeyPl);
    if (floor.roof) {
      roofed.push({
        floor, storey, storeyPl, walls: g.walls,
        above: next ? input.geom[next.id]?.walls : undefined,
        riseTo: next ? next.elevation - floor.elevation : undefined,
      });
    }
  });

  if (storeys.length) st.add(`IFCRELAGGREGATES(${guid('rel|building-storeys')},$,$,$,${building},${list(storeys)})`);

  // ---- roofs (v2): written after everything v1 writes ----------------------
  for (const r of roofed) {
    const roof = r.floor.roof!;
    // Where the 3D view puts it: on the height most of the walls are built to.
    const eaveY = roofEaveHeight(r.walls) * M;
    const made = buildStoreyRoof(r.walls, roof, eaveY, r.above, r.riseTo);
    if (!made) continue;
    const { outlines, type, built } = made;
    const t = roof.thickness * M;
    const contained: string[] = [];

    let roofShape: string | null = null;
    if (type === 'flat') {
      const ring = cleanRing(outlines.eave.map(toIfc));
      if (ring.length >= 3 && Math.abs(polygonArea(ring)) > 1e-6) roofShape = shape(prism(ring, t, axis3(0, 0, eaveY)));
    } else {
      // three.js is y-up with plan y as z, relative to the storey: (x, y, z) -> (x, -z, y).
      const sets: string[] = [];
      for (const geo of [built.geometry, built.infill]) {
        if (!geo) continue;
        const pos = geo.getAttribute('position');
        const index = geo.getIndex();
        const tri = index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i);
        const keyOf = new Map<string, number>();
        const coords: string[] = [];
        const faces: string[] = [];
        for (let i = 0; i + 2 < tri.length; i += 3) {
          const f: number[] = [];
          for (let k = 0; k < 3; k++) {
            const v = tri[i + k];
            const c = `(${num(pos.getX(v))},${num(-pos.getZ(v))},${num(pos.getY(v))})`;
            let n = keyOf.get(c);
            if (n == null) {
              coords.push(c);
              n = coords.length;
              keyOf.set(c, n);
            }
            f.push(n);
          }
          // Rounding to 0.1 mm can fold a sliver triangle flat; drop it.
          if (f[0] === f[1] || f[1] === f[2] || f[0] === f[2]) continue;
          faces.push(`(${f.join(',')})`);
        }
        if (!faces.length) continue;
        const pts = st.add(`IFCCARTESIANPOINTLIST3D(${list(coords)})`);
        sets.push(st.add(`IFCTRIANGULATEDFACESET(${pts},$,$,${list(faces)},$)`));
      }
      if (sets.length) roofShape = shapeOf('Tessellation', sets);
    }
    if (roofShape) {
      const kind = { flat: 'FLAT_ROOF', shed: 'SHED_ROOF', gable: 'GABLE_ROOF', hip: 'HIP_ROOF' }[type] ?? 'NOTDEFINED';
      const roofEl = st.add(`IFCROOF(${guid(`roof|${r.floor.id}`)},$,${str('Roof')},$,$,${placement(r.storeyPl, axisWorld)},$,$,.${kind}.)`);
      const slab = st.add(
        `IFCSLAB(${guid(`roofslab|${r.floor.id}`)},$,${str('Roof slab')},$,$,${placement(r.storeyPl, axisWorld)},${roofShape},$,.ROOF.)`,
      );
      st.add(`IFCRELAGGREGATES(${guid(`rel|roof-slab|${r.floor.id}`)},$,$,$,${roofEl},${list([slab])})`);
      contained.push(roofEl);
    }

    // Parapet: one wall per run, from the eave up past the roof deck, the same
    // runs the 3D view draws (they stop at any wall that rises through them).
    const rise = Math.max(0, roof.parapet ?? 0) * M;
    if (type === 'flat' && rise > 0 && outlines.wall.length >= 3) {
      parapetSegments(outlines.wall, eaveY, made.parapet).forEach((seg, k) => {
        const ring = cleanRing([seg.outer0, seg.outer1, seg.inner1, seg.inner0].map(toIfc));
        if (ring.length < 3 || Math.abs(polygonArea(ring)) < 1e-6) return;
        contained.push(st.add(
          `IFCWALL(${guid(`parapet|${r.floor.id}|${k}`)},$,${str('Parapet')},$,$,${placement(r.storeyPl, axisWorld)},${shape(prism(ring, t + rise, axis3(0, 0, eaveY)))},$,.PARAPET.)`,
        ));
      });
    }
    if (contained.length) {
      st.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`rel|storey-roof|${r.floor.id}`)},$,$,$,${list(contained)},${r.storey})`);
    }
  }

  // ---- stairs and handrails (v2, 1.22.51): after everything else -----------
  const STAIR_KIND: Record<string, string> = {
    stairs: 'STRAIGHT_RUN_STAIR', stairs_l: 'QUARTER_TURN_STAIR', stairs_u: 'HALF_TURN_STAIR', stairs_spiral: 'SPIRAL_STAIR',
  };
  const RAIL_HEIGHT = 0.9; // m above the treads, as in the 3D view
  const RAIL_R = 0.02;
  type P3 = { x: number; y: number; z: number };
  ordered.forEach((floor, fi) => {
    const g = input.geom[floor.id];
    const stairs = (g?.furniture ?? []).filter(isStairs);
    const storey = storeyOf.get(floor.id);
    const storeyPl = storeyPlOf.get(floor.id);
    if (!g || !stairs.length || !storey || !storeyPl) return;
    const next = ordered[fi + 1];
    const contained: string[] = [];
    for (const item of stairs) {
      const plan = stairPlanFor(item);
      const rise = plan.rise * M;
      const z0 = (item.elevation ?? 0) * M;
      const cap = stairCapY(item, {
        walls: g.walls,
        roof: floor.roof,
        riseTo: next ? next.elevation - floor.elevation : undefined,
        roomsAbove: next ? input.geom[next.id]?.rooms : undefined,
      });
      const capZ = cap ?? Infinity;
      const at = (p: Point): Point => toIfc(stairToPlan(item, p));
      const spiral = !!plan.post;
      const solids: string[] = [];
      for (const tread of plan.treads) {
        const thick = spiral ? Math.min(0.05, rise * 0.4) : rise;
        const top = Math.min(z0 + tread.level * rise, capZ);
        const bottom = z0 + tread.level * rise - thick;
        if (top - bottom < 1e-4) continue;
        const ring = cleanRing(tread.poly.map(at));
        if (ring.length < 3 || Math.abs(polygonArea(ring)) < 1e-8) continue;
        solids.push(prism(ring, top - bottom, axis3(0, 0, bottom)));
      }
      if (plan.post) {
        // The spiral's central post, as the 3D view draws it.
        const r = plan.post.radius * M * 0.55;
        const c = at({ x: 0, y: 0 });
        const h = Math.min(z0 + plan.steps * rise + RAIL_HEIGHT, capZ) - z0;
        if (r > 0 && h > 1e-4) {
          const ring = Array.from({ length: 20 }, (_, i) => ({
            x: c.x + Math.cos((i / 20) * Math.PI * 2) * r,
            y: c.y + Math.sin((i / 20) * Math.PI * 2) * r,
          }));
          solids.push(prism(ring, h, axis3(0, 0, z0)));
        }
      }
      if (!solids.length) continue;
      const stair = st.add(
        `IFCSTAIR(${guid(`stair|${item.id}`)},$,${str(item.name || 'Stair')},$,${str(item.type)},${placement(storeyPl, axisWorld)},${shape(...solids)},$,.${STAIR_KIND[item.type] ?? 'NOTDEFINED'}.)`,
      );
      contained.push(stair);

      // Handrails: the rail line, cut where it passes capZ, and a newel at each end.
      const rails: string[] = [];
      for (const rail of stairRailsFor(plan, item.railing)) {
        const pts: P3[] = rail.pts.map((p) => {
          const q = at(p);
          return { x: q.x, y: q.y, z: z0 + p.level * rise + RAIL_HEIGHT };
        });
        const below = (p: P3) => p.z <= capZ + 1e-9;
        const cross = (a: P3, b: P3): P3 => {
          const f = (capZ - a.z) / (b.z - a.z);
          return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: capZ };
        };
        const runs: P3[][] = [];
        let run: P3[] = [];
        pts.forEach((p, i) => {
          const prev = pts[i - 1];
          if (prev && below(prev) !== below(p)) run.push(cross(prev, p));
          if (below(p)) run.push(p);
          else if (run.length) {
            runs.push(run);
            run = [];
          }
        });
        if (run.length) runs.push(run);
        const items: string[] = [];
        const tube = (line: P3[]) => {
          const cps = line.map((p) => st.add(`IFCCARTESIANPOINT((${num(p.x)},${num(p.y)},${num(p.z)}))`));
          const curve = st.add(`IFCPOLYLINE(${list(cps)})`);
          items.push(st.add(`IFCSWEPTDISKSOLID(${curve},${num(RAIL_R)},$,$,$)`));
        };
        for (const line of runs) {
          const clean = line.filter((p, i) => i === 0 || Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y, p.z - line[i - 1].z) > 1e-4);
          if (clean.length >= 2) tube(clean);
        }
        for (const end of pts.length ? [pts[0], pts[pts.length - 1]] : []) {
          const foot = end.z - RAIL_HEIGHT;
          const top = Math.min(end.z, capZ);
          if (top - foot > 1e-3) tube([{ ...end, z: foot }, { ...end, z: top }]);
        }
        if (!items.length) continue;
        rails.push(st.add(
          `IFCRAILING(${guid(`rail|${item.id}|${rail.side}`)},$,${str('Handrail')},$,$,${placement(storeyPl, axisWorld)},${shapeOf('AdvancedSweptSolid', items)},$,.HANDRAIL.)`,
        ));
      }
      if (rails.length) st.add(`IFCRELAGGREGATES(${guid(`rel|stair-rails|${item.id}`)},$,$,$,${stair},${list(rails)})`);
    }
    if (contained.length) {
      st.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`rel|storey-stairs|${floor.id}`)},$,$,$,${list(contained)},${storey})`);
    }
  });

  // ---- stairwell holes (1.22.51, row 58): after everything else ------------
  // The storey above a stair gets a hole in its floor slab wherever the 3D
  // view cuts one (DesignScene roomShape): the stair's footprint
  // (stairOpeningPoints), in every indoor room that holds it whole
  // (stairHoleRooms, lib/stairCut.ts: the one rule both sides use). The IFC floor slab is ONE IfcSlab per storey made of one
  // extrusion per indoor room, so one IfcOpeningElement voiding that slab cuts
  // exactly the room extrusions the footprint lies in. The opening is the
  // footprint, unchanged, extruded through the slab (1 cm proud of each face,
  // as the wall openings are, so the boolean never leaves a skin).
  const HOLE_PAD = 0.01;
  ordered.forEach((floor, fi) => {
    const next = ordered[fi + 1];
    const stairs = (input.geom[floor.id]?.furniture ?? []).filter(isStairs);
    const slab = next && slabOf.get(next.id);
    const roomSlabs = next && roomSlabsOf.get(next.id);
    const storeyPl = next && storeyPlOf.get(next.id);
    if (!next || !stairs.length || !(slab || roomSlabs) || !storeyPl) return;
    const indoorAbove = (input.geom[next.id]?.rooms ?? []).filter((r) => !r.outdoor && r.points.length >= 3);
    for (const item of stairs) {
      const holeRooms = stairHoleRooms(item, indoorAbove);
      if (!holeRooms.length) continue;
      const ring = cleanRing(stairOpeningPoints(item).map(toIfc));
      if (ring.length < 3 || Math.abs(polygonArea(ring)) < 1e-6) continue;
      if (roomSlabs) {
        // Per-room slabs (overlapping rooms): one opening per room that gets
        // the hole, voiding that room's slab only.
        for (const room of holeRooms) {
          const roomSlab = roomSlabs.get(room.id);
          if (!roomSlab) continue;
          const opening = st.add(
            `IFCOPENINGELEMENT(${guid(`stairwell|${item.id}|${room.id}`)},$,${str('Stairwell opening')},$,$,${placement(storeyPl, axisWorld)},${shape(prism(ring, SLAB_T + 2 * HOLE_PAD, axis3(0, 0, -SLAB_T - HOLE_PAD)))},$,.OPENING.)`,
          );
          st.add(`IFCRELVOIDSELEMENT(${guid(`void|stairwell|${item.id}|${room.id}`)},$,$,$,${roomSlab},${opening})`);
        }
        continue;
      }
      if (!slab) continue;
      const opening = st.add(
        `IFCOPENINGELEMENT(${guid(`stairwell|${item.id}`)},$,${str('Stairwell opening')},$,$,${placement(storeyPl, axisWorld)},${shape(prism(ring, SLAB_T + 2 * HOLE_PAD, axis3(0, 0, -SLAB_T - HOLE_PAD)))},$,.OPENING.)`,
      );
      st.add(`IFCRELVOIDSELEMENT(${guid(`void|stairwell|${item.id}`)},$,$,$,${slab},${opening})`);
    }
  });

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
