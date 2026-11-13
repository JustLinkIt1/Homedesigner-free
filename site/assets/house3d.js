// Scroll-driven 3D house for the "From blank page to dream home" section.
//
// house.glb is a real HomeDesigner sample home ("Sunlit open-plan home"),
// exported from the app's own 3D view by tools/export-web-model.mjs. Its nodes
// keep the app's grouping: walls / floors / ceilings / roof / furniture, plus
// the street the app lays out in front. Scroll progress through .film drives
// one timeline (STEPS below):
//   0.00-0.20  Sketch       the plan is drawn wall by wall in the 2D editor's
//                           style (plan2d.js), then the walls rise out of it
//   0.20-0.38  Furnish      the real furniture drops in, the camera tilts
//   0.38-0.62  Walk through the camera comes down into the house and walks
//                           the rooms at eye level
//   0.62-0.82  Step outside out through the garden doors to the street, where
//                           it turns to look back at the house
//   0.82-1.00  AI render    that exact view becomes a photo: an AI render made
//                           from it (house-render-*.webp)
// Exports start(film, canvas) -> Promise that rejects if WebGL or the model
// fails, so the page can fall back to the video.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { createPlan2D } from './plan2d.js';

/** Where each step starts, as scroll progress. The page's captions use the same numbers. */
export const STEPS = [0, 0.2, 0.38, 0.62, 0.82];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;

// The first two steps are the timeline this section always had (it ran to
// 0.66 before the walk was added), squeezed into their share of the scroll.
const OLD_END = 0.66;
const SQUEEZE = STEPS[2] / OLD_END;

// The walk, in the plan's own metres: [scroll, stand [x, y, eye height], look at [x, y, height]].
// The house is 11 x 8.5 with the great room on the left, bedroom and bathroom
// on the right, and the front door, garden doors and deck along the bottom.
const WALK = [
  [0.435, [1.5, 7.7, 2.2], [3.8, 4.0, 0.9]],    // down through the open top, just inside the front door
  [0.47, [1.5, 7.2, 1.55], [4.2, 2.0, 1.15]],   // on our feet, looking across the great room
  [0.5, [2.0, 5.3, 1.55], [5.5, 1.2, 1.1]],     // walking in, towards the kitchen
  [0.54, [3.6, 3.3, 1.55], [7.6, 2.2, 1.1]],    // past the island, towards the bedroom door
  [0.585, [6.3, 2.6, 1.55], [9.3, 1.6, 0.95]],  // a look into the bedroom
  [0.603, [4.6, 3.2, 1.55], [7.5, 5.5, 1.1]],   // back round the dining table
  [0.62, [4.4, 5.2, 1.55], [5.6, 9.8, 1.2]],    // turn to the garden doors
  [0.646, [5.6, 7.7, 1.55], [5.9, 12.0, 1.1]],  // at the doors
  [0.662, [5.9, 9.6, 1.6], [3.0, 12.6, 1.1]],   // out on the deck, turning for the front path
  [0.676, [4.2, 9.8, 1.6], [1.8, 13.4, 1.1]],
  [0.695, [2.6, 11.4, 1.6], [2.0, 16.5, 1.1]],  // off the deck
  [0.715, [2.0, 13.6, 1.62], [2.4, 19.5, 1.2]], // down the front path
  [0.731, [2.0, 15.6, 1.65], [7.0, 19.5, 1.3]], // through the gate, glancing along the street
  [0.767, [2.6, 19.8, 1.8], [11.5, 14.5, 1.5]], // crossing the road, turning back
  [0.8, [1.0, 24.0, 2.0], [6.0, 8.5, 1.9]],    // across the street, facing the house
];
const T_IN = WALK[0][0];    // the camera is under the ceiling from here on
const T_END = WALK[WALK.length - 1][0];
const HFOV_END = (ar) => (ar > 1.2 ? 57 : 50); // degrees across the final view: the wide one takes in more

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A sky to stand under: pale at the horizon, blue overhead. */
function skyDome(horizon) {
  const geo = new THREE.SphereGeometry(420, 24, 16);
  const top = new THREE.Color(0x4d95ea), c = new THREE.Color();
  const pos = geo.getAttribute('position');
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    c.copy(horizon).lerp(top, Math.pow(clamp01(pos.getY(i) / 300), 0.6));
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, toneMapped: false, transparent: true, opacity: 0, depthWrite: false });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -2;
  return dome;
}

export async function start(film, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  const small = matchMedia('(max-width: 760px)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 900);
  // Only the far end of the street and the lawn's edge are far enough to haze.
  const horizon = new THREE.Color(0xdcebf8);
  scene.fog = new THREE.Fog(horizon, 110, 360);

  const hemi = new THREE.HemisphereLight(0xe4ecff, 0x40382c, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = !small;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  // Indoors the sun only comes through the windows; a soft lamp walks with the camera.
  const lamp = new THREE.PointLight(0xfff0dc, 0, 16, 1.4);
  scene.add(lamp);

  const gltf = await new GLTFLoader().loadAsync(new URL('./house.glb', import.meta.url).href);
  const house = gltf.scene;
  const byName = (n) => { let f = null; house.traverse((o) => { if (!f && o.name === n) f = o; }); return f; };
  const storey = byName('storey') ?? house;

  // The model is in metres. Centre the house (not its street) on the origin, standing on y = 0.
  const box = new THREE.Box3().setFromObject(storey);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  house.position.set(-centre.x, -box.min.y, -centre.z);
  const R = Math.max(size.x, size.z) / 2;
  scene.add(house);
  /** A point of the plan (metres, with a height) in the scene. */
  const world = ([x, y, h]) => new THREE.Vector3(x + house.position.x, h, y + house.position.z);

  const walls = byName('walls')?.children.slice() ?? [];
  const furniture = byName('furniture')?.children.slice() ?? [];
  const roof = byName('roof');
  const ceilings = byName('ceilings');
  const street = byName('street');
  const lights = [];
  house.traverse((o) => {
    if (o.isLight) lights.push(o);
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        // Real refraction costs an extra render pass; plain see-through glass reads the same at this size.
        if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = 0.28; m.roughness = 0.05; m.depthWrite = false; }
        // The app's outside panes mirror its sky; there is none to mirror here, so they would go black.
        else if (m.metalness > 0.45 && m.roughness < 0.2) { m.metalness = 0.15; m.color.set(0x5f7890); m.roughness = 0.12; }
      }
    }
  });
  lights.forEach((l) => l.parent.remove(l));
  ceilings?.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  street?.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    // The plot's hedges are a flat dark green in the app, which goes near black in this light.
    const c = o.material.color;
    if (c && !o.material.map && c.g > c.r * 1.3 && c.g > c.b * 1.3) { c.set(0x5c8c4c); o.material.emissive.set(0x1d3518); }
  });

  // Furniture drops in from the middle of the house outwards.
  const fBase = furniture.map((f) => ({ node: f, y: f.position.y, s: f.scale.clone() }));
  fBase.forEach((f) => {
    const w = new THREE.Vector3(); f.node.getWorldPosition(w);
    f.d = Math.hypot(w.x, w.z);
  });
  fBase.sort((a, b) => a.d - b.d);
  fBase.forEach((f, i) => { f.t0 = (i / Math.max(1, fBase.length - 1)) * 0.7; });
  const wBase = walls.map((w, i) => ({ node: w, s: w.scale.y, t0: (i / Math.max(1, walls.length - 1)) * 0.45 }));

  // The 2D drawing of the plan lies on the ground; the floors appear once it is drawn.
  const planData = storey.userData.plan;
  let plan2d = planData ? createPlan2D(THREE, planData, getComputedStyle(document.body).fontFamily, small) : null;
  if (plan2d) house.add(plan2d.mesh);
  const floorMats = new Map(); // material -> its real colour
  const floors = byName('floors');
  floors?.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => floorMats.set(m, m.color.clone())); });
  const unlit = new THREE.Color(0x141b2e);

  // Ground: a soft round pad that fades into the page, plus a blueprint grid for the sketch step.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a3550, map: groundTexture(), transparent: true, roughness: 1, depthWrite: false });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R * 3.2, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);
  const shadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(R * 2.4, 64), new THREE.ShadowMaterial({ opacity: 0.32 }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);
  const grid = new THREE.GridHelper(R * 5, Math.round(R * 5), 0x4f8dff, 0x2b4170);
  grid.material.transparent = true;
  grid.material.fog = false;
  grid.position.y = 0.005;
  scene.add(grid);

  // From eye level the pad's edge would show, so the walk gets a lawn to the horizon and a sky.
  const lawn = new THREE.Color(0x56704a);
  const grass = new THREE.Color(0x8db366); // the same lawn in open daylight
  const fieldMat = new THREE.MeshStandardMaterial({ color: grass, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  const field = new THREE.Mesh(new THREE.CircleGeometry(400, 48), fieldMat);
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.03;
  field.renderOrder = -1;
  scene.add(field);
  const sky = skyDome(horizon);
  scene.add(sky);

  sun.shadow.camera.left = sun.shadow.camera.bottom = -R * 1.9;
  sun.shadow.camera.right = sun.shadow.camera.top = R * 1.9;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = R * 12;

  const blueprint = new THREE.Color(0x2a3550);
  const noon = new THREE.Color(0xffffff);
  const warm = new THREE.Color(0xffe6c4);
  const target = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const afternoon = new THREE.Vector3(-0.5, 0.66, 0.56).normalize(); // lights the front, which faces the street
  let W = 1, H = 1, aspect = 1;
  let BAND = [0.15, 0.68]; // the part of the stage's height left free by the heading and the caption
  let viewOff = 0;
  let shot = { x: 0, y: 0, w: 1, h: 1, ar: 1.5 }; // where the final photo sits on the stage, in CSS px
  let path = null;
  const RISE_2D = 0.215; // old-timeline progress at which the drawing is finished and the walls start to rise

  /** The camera of the first two steps: straight down on the drawing, then a three-quarter view. */
  function orbit(q) {
    const a = easeInOut(seg(q, plan2d ? 0.2 : 0, OLD_END));
    // Square-on from above while the plan is drawn, so it reads like the 2D editor.
    const polar = lerp(plan2d ? 0.015 : 0.06, 0.92, a); // from vertical
    const az = lerp(plan2d ? 0 : -0.35, 0.45, a);
    // Wide screens are limited by height, tall ones by width.
    const fit = aspect < 1 ? 1.55 / Math.max(0.55, aspect) : 1.45;
    let dist = R * lerp(3.5, 3.0, a) * fit;
    target.set(0, lerp(0, size.y * 0.25, a), 0);
    if (plan2d && a < 1) {
      // While it is a drawing, fit the plan between the heading and the caption.
      const f = plan2d.frame, tan = Math.tan(THREE.MathUtils.degToRad(36 / 2)) * 2;
      const d2 = Math.max(f.h / (BAND[1] - BAND[0]) / tan, f.w / 0.92 / aspect / tan);
      const down = ((BAND[0] + BAND[1]) / 2 - 0.5 + viewOff) * d2 * tan;
      dist = lerp(d2, dist, a);
      target.x = lerp(f.cx + house.position.x, target.x, a);
      target.z = lerp(f.cz + house.position.z - down, target.z, a);
    }
    pos.set(
      target.x + dist * Math.sin(polar) * Math.sin(az),
      target.y + dist * Math.cos(polar),
      target.z + dist * Math.sin(polar) * Math.cos(az),
    );
    return az;
  }

  /** The walk as two curves: where the camera is and what it looks at. It starts from the furnish view. */
  function buildPath() {
    orbit(OLD_END);
    const keys = [[STEPS[2], pos.clone(), target.clone()], ...WALK.map(([t, stand, look]) => [t, world(stand), world(look)])];
    path = {
      t: keys.map((k) => k[0]),
      pos: new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal'),
      look: new THREE.CatmullRomCurve3(keys.map((k) => k[2]), false, 'centripetal'),
    };
  }
  function walk(p) {
    const t = path.t, n = t.length;
    let i = 0;
    while (i < n - 2 && p > t[i + 1]) i++;
    let local = seg(p, t[i], t[i + 1]);
    if (i === 0) local = easeInOut(local); // leave the furnish view gently and land softly
    const u = (i + local) / (n - 1);
    path.pos.getPoint(u, pos);
    path.look.getPoint(u, target);
  }
  const endFov = (ar) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(HFOV_END(ar) / 2)) / ar));

  // The final photo: its frame closes on the 3D view, then the picture fades in over it.
  const shotEl = film.querySelector('.shot');
  const shotImg = shotEl?.querySelector('img');
  let shotSrc = '', frameShown = -1, photoShown = -1;

  function pose(p, pre) {
    const q = Math.min(p / SQUEEZE, OLD_END); // where the first two steps are on their own timeline
    // Sketch step: the plan is drawn in 2D, the floors light up, then the walls rise out of the drawing.
    if (plan2d) {
      try {
        const fade = 1 - seg(q, 0.25, 0.33);
        plan2d.mesh.visible = fade > 0;
        plan2d.material.opacity = fade;
        // The first walls are drawn while the section scrolls into view, so it never arrives empty.
        if (fade > 0) plan2d.draw(0.45 * seg(pre, 0.4, 1) + 0.55 * seg(q, 0.012, RISE_2D));
        // The floors stay opaque and only change colour: no blending and no shader rebuild on phones.
        const floorT = seg(q, 0.15, RISE_2D);
        if (floors) floors.visible = floorT > 0;
        for (const [m, c] of floorMats) m.color.copy(unlit).lerp(c, floorT);
      } catch (err) {
        // Drawing failed on this device: carry on with the plain 3D version.
        console.warn('2D plan unavailable', err);
        house.remove(plan2d.mesh);
        plan2d = null;
        if (floors) floors.visible = true;
        for (const [m, c] of floorMats) m.color.copy(c);
      }
    }
    const rise = plan2d ? RISE_2D : 0.04;
    const wallT = seg(q, rise, 0.37);
    for (const w of wBase) {
      w.node.visible = !plan2d || q >= rise;
      w.node.scale.y = Math.max(0.015, w.s * easeInOut(seg(wallT, w.t0, w.t0 + 0.55)));
    }
    // Furniture drops in during the furnish step.
    const furnT = seg(q, 0.36, 0.64);
    for (const f of fBase) {
      const t = seg(furnT, f.t0, f.t0 + 0.3);
      f.node.visible = t > 0;
      f.node.position.y = f.y + (1 - easeOut(t)) * 2.2;
      f.node.scale.copy(f.s).multiplyScalar(lerp(0.4, 1, easeOutBack(t)));
    }
    // Once the camera is indoors the house is whole: ceilings, roof, and the street outside.
    const indoors = p >= T_IN;
    if (roof) roof.visible = indoors;
    if (ceilings) ceilings.visible = indoors;
    if (street) street.visible = indoors;
    // A sky and a lawn to the horizon arrive while the camera comes down.
    const open = seg(p, STEPS[2] + 0.004, T_IN - 0.012);
    sky.visible = field.visible = open > 0;
    sky.material.opacity = fieldMat.opacity = open;

    // Camera: straight down -> three-quarter -> the walk.
    let fov = 36, frame = 0;
    const az = orbit(q);
    if (p > STEPS[2]) {
      walk(p);
      const wide = aspect < 1 ? 82 : 62; // tall screens need a taller view to see a room
      fov = lerp(lerp(36, wide, easeInOut(seg(p, STEPS[2] + 0.012, T_IN + 0.012))), endFov(shot.ar), easeInOut(seg(p, 0.7, T_END)));
      frame = easeInOut(seg(p, 0.715, T_END));
    }
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    // The picture area slides from the whole stage (lifted above the caption) onto the photo's frame,
    // so the last 3D view is exactly the view the photo was made from.
    const fw = lerp(W, shot.w, frame), fh = lerp(H, shot.h, frame);
    camera.fov = fov;
    camera.aspect = fw / fh;
    camera.setViewOffset(fw, fh, lerp(0, -shot.x, frame), lerp(H * viewOff, -shot.y, frame), W, H);

    // Light and ground: blueprint night-blue -> daylight lawn -> a warm afternoon outside.
    const day = seg(q, 0.22, 0.5);
    groundMat.color.copy(blueprint).lerp(lawn, day).lerp(grass, open);
    grid.material.opacity = 0.55 * (1 - seg(q, 0.3, 0.45));
    grid.visible = grid.material.opacity > 0.01;
    const late = seg(p, 0.66, T_END);
    sun.color.copy(noon).lerp(warm, late);
    hemi.intensity = lerp(1.25, 1.1, late);
    // From above the sun follows the camera from one side, so the face we look at is lit;
    // for the walk it settles where it lights the front of the house.
    sunDir.set(Math.sin(az - 0.9) * Math.cos(1.0), Math.sin(1.0), Math.cos(az - 0.9) * Math.cos(1.0))
      .lerp(afternoon, easeInOut(seg(p, STEPS[2], T_IN))).normalize();
    sun.position.copy(sunDir).multiplyScalar(R * 5);
    const inside = seg(p, T_IN - 0.01, T_IN + 0.02) * (1 - seg(p, 0.646, 0.67));
    lamp.visible = inside > 0;
    lamp.intensity = 9 * inside;
    lamp.position.copy(pos);
    lamp.position.y += 0.35;

    if (shotEl) {
      if (p > 0.5 && shotImg && !shotImg.getAttribute('src') && shotSrc) shotImg.src = shotSrc; // fetched ahead of its moment
      const f = Math.round(seg(p, T_END + 0.004, 0.828) * 100) / 100;
      const ph = Math.round(easeInOut(seg(p, 0.838, 0.888)) * 100) / 100;
      if (f !== frameShown) { shotEl.style.setProperty('--frame', f); shotEl.style.visibility = f > 0 ? 'visible' : 'hidden'; frameShown = f; }
      if (ph !== photoShown) { shotEl.style.setProperty('--photo', ph); photoShown = ph; }
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    W = w; H = h; aspect = w / h;
    renderer.setSize(w, h, false);
    // Lift the house above the caption at the bottom of the stage.
    viewOff = aspect < 1 ? 0.1 : 0.06;
    BAND = aspect < 1 ? [0.15, 0.68] : [0.2, 0.74];
    // The photo: square on a tall screen, 3:2 on a wide one, as large as the free band allows.
    const ar = aspect < 0.9 ? 1 : 1.5;
    const room = H * (BAND[1] - BAND[0]);
    let sw = Math.min(W * 0.92, 900), sh = sw / ar;
    if (sh > room) { sh = room; sw = sh * ar; }
    shot = { x: (W - sw) / 2, y: H * BAND[0] + (room - sh) / 2, w: sw, h: sh, ar };
    if (shotEl) {
      Object.assign(shotEl.style, { left: `${shot.x}px`, top: `${shot.y}px`, width: `${sw}px`, height: `${sh}px` });
      shotSrc = new URL(ar === 1 ? './house-render-square.webp' : './house-render-wide.webp', import.meta.url).href;
      if (shotImg?.getAttribute('src') && shotImg.src !== shotSrc) shotImg.src = shotSrc;
    }
    buildPath();
  }

  function progress() {
    const rect = film.getBoundingClientRect();
    const total = rect.height - innerHeight;
    return total > 0 ? clamp01(-rect.top / total) : 0;
  }

  // How far the section has scrolled into view before it pins: 0 = just entering, 1 = pinned.
  const approach = () => clamp01(1 - film.getBoundingClientRect().top / innerHeight);

  let shown = 0, shownPre = 0, wanted = progress(), visible = true, raf = 0, dirty = true, held = null;
  const loop = () => {
    raf = 0;
    if (!visible) return;
    wanted = held ?? progress();
    const wantedPre = held == null ? approach() : 1;
    const before = shown, beforePre = shownPre;
    shown += (wanted - shown) * 0.12;
    if (Math.abs(wanted - shown) < 0.0005) shown = wanted;
    shownPre += (wantedPre - shownPre) * 0.12;
    if (Math.abs(wantedPre - shownPre) < 0.0005) shownPre = wantedPre;
    if (dirty || shown !== before || shownPre !== beforePre) { pose(shown, shownPre); renderer.render(scene, camera); dirty = false; }
    raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }, { rootMargin: '100px' }).observe(film);
  // The stage follows the visible height, which changes as a phone's address bar comes and goes.
  new ResizeObserver(() => { resize(); dirty = true; kick(); }).observe(canvas);
  resize();
  shown = wanted;
  shownPre = approach();
  pose(shown, shownPre);
  renderer.render(scene, camera);
  kick();

  return {
    /**
     * The final view as a JPEG data URL, `ar` wide for each unit of height:
     * the picture the AI renders are made from (tools/make-site-render.mjs).
     */
    snapshot(ar, width = 1536) {
      renderer.setPixelRatio(1);
      renderer.setSize(width, Math.round(width / ar), false);
      pose(1, 1);
      camera.clearViewOffset();
      camera.aspect = ar;
      camera.fov = endFov(ar);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const url = canvas.toDataURL('image/jpeg', 0.92);
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75));
      resize();
      dirty = true;
      kick();
      return url;
    },
    /** Hold the timeline at one point whatever the scroll (null lets go): for checking the animation. */
    hold(p) { held = p; if (p != null) shown = p; dirty = true; kick(); },
  };
}
