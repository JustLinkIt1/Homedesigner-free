import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Art-directed sky: a zenith-to-horizon gradient with a soft sun (or moon)
 * glow. It replaces the physical Preetham sky, whose horizon burned out to
 * flat white at midday and gave a muddy brown dusk. A gradient costs one cheap
 * draw call on every tier, and its horizon colour is handed to the scene fog,
 * so the lawn fades into the sky with no visible edge.
 */
export interface SkyPalette {
  zenith: string;
  horizon: string;
  /** Sky tint for the hemisphere light, so fill light matches the sky. */
  hemi: string;
}

const KEYS = {
  noon: { zenith: '#3f83d6', horizon: '#cfe2f3', hemi: '#f1f6ff' },
  dusk: { zenith: '#465a92', horizon: '#f6b785', hemi: '#ffdcba' },
  night: { zenith: '#070b17', horizon: '#18233d', hemi: '#2a3654' },
} as const;

const mixHex = (a: string, b: string, t: number) =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/** `day` and `moon` come from sunModel(): dusk at the hand-over between them. */
export function skyPalette(day: number, moon: number): SkyPalette {
  const to = day > 0 ? KEYS.noon : KEYS.night;
  const x = day > 0 ? Math.min(1, day / 0.5) : moon;
  const t = x * x * (3 - 2 * x);
  return {
    zenith: mixHex(KEYS.dusk.zenith, to.zenith, t),
    horizon: mixHex(KEYS.dusk.horizon, to.horizon, t),
    hemi: mixHex(KEYS.dusk.hemi, to.hemi, t),
  };
}

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Pin to the far plane: always behind the scene, whatever the dome radius.
  gl_Position.z = gl_Position.w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlowDir;
uniform vec3 uGlowColor;
uniform float uGlow;
uniform float uDisc;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, 1.0 - pow(1.0 - h, 2.5));
  float s = max(dot(d, uGlowDir), 0.0);
  col += uGlowColor * uGlow * (pow(s, uDisc) * 3.0 + pow(s, 40.0) * 0.22 + pow(s, 6.0) * 0.07);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function GradientSky({
  palette,
  glowDir,
  glowColor,
  day,
  moon,
}: {
  palette: SkyPalette;
  /** Direction to the sun by day, the moon by night. */
  glowDir: [number, number, number];
  glowColor: string;
  day: number;
  moon: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGlowDir: { value: new THREE.Vector3(0, 1, 0) },
          uGlowColor: { value: new THREE.Color() },
          uGlow: { value: 0 },
          uDisc: { value: 900 },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const u = material.uniforms;
  u.uZenith.value.set(palette.zenith);
  u.uHorizon.value.set(palette.horizon);
  u.uGlowDir.value.set(glowDir[0], glowDir[1], glowDir[2]).normalize();
  u.uGlowColor.value.set(glowColor);
  // The sun fades out as it sets; the moon is a smaller, dimmer disc.
  u.uGlow.value = moon > 0 ? moon * 0.55 : Math.min(1, day * 5);
  u.uDisc.value = moon > 0 ? 2600 : 900;

  // Keep the dome centred on the camera so it never shows parallax.
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });

  return (
    <mesh ref={ref} material={material} frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[100, 32, 16]} />
    </mesh>
  );
}
