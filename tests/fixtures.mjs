// Shared by the screenshot script. Plan units are cm.
export const wall = (id, ax, ay, bx, by, extra = {}) => ({ id, start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: 20, height: 270, color: '#f1ece3', ...extra });
export const ring = (tag, pts, extra = {}) => pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return wall(`${tag}${i}`, p.x, p.y, q.x, q.y, extra); });
const room = (id, pts, extra = {}) => ({ id, name: id, points: pts, floorMaterial: 'oak', color: '#d9c7a6', ...extra });
const ROOF = { type: 'flat', pitch: 30, overhang: 15, thickness: 18, covering: 'tile', coveringScaleCm: 100, color: '#8a8a8a', parapet: 94 };
const snap = (name, g1, g2) => ({
  projectName: name,
  walls: g2.walls, rooms: g2.rooms, furniture: [], openings: [], background: null,
  floors: [{ id: 'f1', name: 'Ground', elevation: 0 }, { id: 'f2', name: 'First', elevation: 282, roof: ROOF }],
  floorGeom: { f1: { ...g1, furniture: [], openings: [], background: null }, f2: { ...g2, furniture: [], openings: [], background: null } },
  activeFloorId: 'f2',
});
const box = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }];
// Customer-like: porch bump on the front of storey 2 with thinner walls than the house.
const house = (t) => [
  wall('n', 0, 0, 800, 0, { thickness: t }), wall('e', 800, 0, 800, 600, { thickness: t }),
  wall('s1', 800, 600, 550, 600, { thickness: t }), wall('s2', 250, 600, 0, 600, { thickness: t }), wall('w', 0, 600, 0, 0, { thickness: t }),
];
const porchWalls = (t) => [
  wall('p1', 550, 600, 550, 800, { thickness: t }), wall('p2', 550, 800, 250, 800, { thickness: t }), wall('p3', 250, 800, 250, 600, { thickness: t }),
];
export const FIXTURES = {
  box: snap('box', { walls: ring('a', box), rooms: [room('r1', box)] }, { walls: ring('b', box), rooms: [room('r2', box)] }),
  porch: snap('porch',
    { walls: [...house(25), ...porchWalls(10)], rooms: [room('r1', box)] },
    { walls: [...house(25), ...porchWalls(10)], rooms: [room('r2', box), room('porch', [{x:250,y:600},{x:550,y:600},{x:550,y:800},{x:250,y:800}], { covered: true })] }),
};
// Customer-like clash: storey 2 has the flat roof and parapet, and a smaller
// storey 3 (a stair tower) stands on two edges of the outline, so its walls rise
// through the parapet line.
const tower = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 250 }, { x: 0, y: 250 }];
FIXTURES.tower = {
  projectName: 'tower',
  walls: ring('t', tower), rooms: [room('r3', tower)], furniture: [], openings: [], background: null,
  floors: [{ id: 'f1', name: 'Ground', elevation: 0 }, { id: 'f2', name: 'First', elevation: 282, roof: ROOF }, { id: 'f3', name: 'Second', elevation: 564 }],
  floorGeom: {
    f1: { walls: ring('a', box), rooms: [room('r1', box)], furniture: [], openings: [], background: null },
    f2: { walls: ring('b', box), rooms: [room('r2', box)], furniture: [], openings: [], background: null },
    f3: { walls: ring('t', tower), rooms: [room('r3', tower)], furniture: [], openings: [], background: null },
  },
  activeFloorId: 'f2',
};
// Customer-like clash on the roof storey itself: the back wall's left half is
// drawn taller than the storey (a stair-tower wall), standing on the parapet line.
const tall = [
  wall('n1', 0, 0, 300, 0, { height: 400 }), wall('n2', 300, 0, 800, 0),
  wall('e', 800, 0, 800, 600), wall('s', 800, 600, 0, 600), wall('w', 0, 600, 0, 0),
];
FIXTURES.tall = snap('tall', { walls: ring('a', box), rooms: [room('r1', box)] }, { walls: tall, rooms: [room('r2', box)] });
