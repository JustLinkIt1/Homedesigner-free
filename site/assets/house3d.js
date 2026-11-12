// Scroll-driven 3D house for the "From blank page to dream home" section.
//
// house.glb is a real HomeDesigner sample home ("Sunlit open-plan home"),
// exported from the app's own 3D view by tools/export-web-model.mjs. Its nodes
// keep the app's grouping: walls / floors / roof / furniture. Scroll progress
// through .film drives one timeline:
//   0.00-0.36  Sketch     top-down plan; the walls grow up out of the floor
//   0.36-0.68  Furnish    the real furniture drops in, the camera tilts
//   0.68-1.00  Experience the roof lands, the camera circles, daylight goes gold
// Exports start(film, canvas) -> Promise that rejects if WebGL or the model
// fails, so the page can fall back to the video.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;

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
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);

  const hemi = new THREE.HemisphereLight(0xe4ecff, 0x40382c, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = !small;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const gltf = await new GLTFLoader().loadAsync(new URL('./house.glb', import.meta.url).href);
  const house = gltf.scene;

  // The model is in metres. Centre it on the origin, standing on y = 0.
  const box = new THREE.Box3().setFromObject(house);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  house.position.set(-centre.x, -box.min.y, -centre.z);
  const R = Math.max(size.x, size.z) / 2;
  scene.add(house);

  const byName = (n) => { let f = null; house.traverse((o) => { if (!f && o.name === n) f = o; }); return f; };
  const walls = byName('walls')?.children.slice() ?? [];
  const furniture = byName('furniture')?.children.slice() ?? [];
  const roof = byName('roof');
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
      }
    }
  });
  lights.forEach((l) => l.parent.remove(l));

  // Furniture drops in from the middle of the house outwards.
  const fBase = furniture.map((f) => ({ node: f, y: f.position.y, s: f.scale.clone() }));
  fBase.forEach((f) => {
    const w = new THREE.Vector3(); f.node.getWorldPosition(w);
    f.d = Math.hypot(w.x, w.z);
  });
  fBase.sort((a, b) => a.d - b.d);
  fBase.forEach((f, i) => { f.t0 = (i / Math.max(1, fBase.length - 1)) * 0.7; });
  const wBase = walls.map((w, i) => ({ node: w, s: w.scale.y, t0: (i / Math.max(1, walls.length - 1)) * 0.45 }));
  const roofY = roof ? roof.position.y : 0;

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
  grid.position.y = 0.005;
  scene.add(grid);

  sun.shadow.camera.left = sun.shadow.camera.bottom = -R * 1.6;
  sun.shadow.camera.right = sun.shadow.camera.top = R * 1.6;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = R * 12;

  const blueprint = new THREE.Color(0x2a3550);
  const lawn = new THREE.Color(0x56704a);
  const noon = new THREE.Color(0xffffff);
  const gold = new THREE.Color(0xffc58a);
  const target = new THREE.Vector3();

  function pose(p) {
    // Walls rise during the sketch step.
    const wallT = seg(p, 0.04, 0.34);
    for (const w of wBase) w.node.scale.y = Math.max(0.015, w.s * easeInOut(seg(wallT, w.t0, w.t0 + 0.55)));
    // Furniture drops in during the furnish step.
    const furnT = seg(p, 0.36, 0.66);
    for (const f of fBase) {
      const t = seg(furnT, f.t0, f.t0 + 0.3);
      f.node.visible = t > 0;
      f.node.position.y = f.y + (1 - easeOut(t)) * 2.2;
      f.node.scale.copy(f.s).multiplyScalar(lerp(0.4, 1, easeOutBack(t)));
    }
    // The roof lands at the start of the experience step.
    if (roof) {
      const t = seg(p, 0.7, 0.84);
      roof.visible = t > 0;
      roof.position.y = roofY + (1 - easeOut(t)) * 3.5;
    }
    // Camera: straight down -> three-quarter -> low orbit.
    const a = easeInOut(seg(p, 0.0, 0.66));
    const b = easeInOut(seg(p, 0.66, 1));
    const polar = lerp(lerp(0.06, 0.92, a), 1.16, b);         // from vertical
    const az = lerp(lerp(-0.35, 0.45, a), 1.2, b);
    // Wide screens are limited by height, tall ones by width.
    const fit = camera.aspect < 1 ? 1.55 / Math.max(0.55, camera.aspect) : 1.45;
    const dist = R * lerp(lerp(3.5, 3.0, a), 3.2, b) * fit;
    target.set(0, lerp(0, size.y * 0.25, a), 0);
    camera.position.set(
      target.x + dist * Math.sin(polar) * Math.sin(az),
      target.y + dist * Math.cos(polar),
      target.z + dist * Math.sin(polar) * Math.cos(az),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    // Light and ground: blueprint night-blue -> daylight lawn -> golden hour.
    const day = seg(p, 0.22, 0.5);
    groundMat.color.copy(blueprint).lerp(lawn, day);
    grid.material.opacity = 0.55 * (1 - seg(p, 0.3, 0.45));
    grid.visible = grid.material.opacity > 0.01;
    const dusk = seg(p, 0.78, 1);
    sun.color.copy(noon).lerp(gold, dusk);
    sun.intensity = lerp(2.4, 2.6, dusk);
    hemi.intensity = lerp(1.25, 1.05, dusk);
    // The sun follows the camera from one side, so the face we look at is lit.
    const sunAz = az - lerp(0.9, 0.75, dusk);
    const sunEl = lerp(1.0, 0.5, dusk);
    sun.position.set(Math.sin(sunAz) * Math.cos(sunEl) * R * 5, Math.sin(sunEl) * R * 5, Math.cos(sunAz) * Math.cos(sunEl) * R * 5);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Lift the house above the caption card at the bottom of the stage.
    camera.setViewOffset(w, h, 0, h * (camera.aspect < 1 ? 0.1 : 0.06), w, h);
    camera.updateProjectionMatrix();
  }

  function progress() {
    const rect = film.getBoundingClientRect();
    const total = rect.height - innerHeight;
    return total > 0 ? clamp01(-rect.top / total) : 0;
  }

  let shown = 0, wanted = progress(), visible = true, raf = 0, dirty = true;
  const loop = () => {
    raf = 0;
    if (!visible) return;
    wanted = progress();
    const before = shown;
    shown += (wanted - shown) * 0.12;
    if (Math.abs(wanted - shown) < 0.0005) shown = wanted;
    if (dirty || shown !== before) { pose(shown); renderer.render(scene, camera); dirty = false; }
    raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }, { rootMargin: '100px' }).observe(film);
  addEventListener('resize', () => { resize(); dirty = true; kick(); }, { passive: true });
  resize();
  shown = wanted;
  pose(shown);
  renderer.render(scene, camera);
  kick();
}
