/**
 * Sun model: map a 0..24h clock to a light direction, colour and intensities.
 * The sun rises in the east (−x), peaks south-high at noon, sets west (+x);
 * colour warms toward sunrise/sunset and the whole rig dims into night so
 * artificial fixtures take over. Shared by the 3D view and photo mode so the
 * two always agree on daylight.
 */
export function sunModel(t: number) {
  // Daylight fraction: 0 before 6am / after 8pm, 1 around midday.
  const day = Math.max(0, Math.sin(((t - 6) / 12) * Math.PI)); // 6->0, 12->1, 18->0
  const azimuth = ((t - 6) / 12) * Math.PI; // east(0) -> west(PI) across the day
  const elev = day; // 0 at horizon, 1 at zenith
  const dir: [number, number, number] = [
    Math.cos(azimuth) * (1 - elev * 0.6), // + morning east, - evening west
    0.15 + elev * 1.2, // never fully underground so shadows stay sane
    0.35 + elev * 0.4,
  ];
  // Warmth: amber at low sun, neutral-cool at noon.
  const warm = 1 - day; // 1 at dawn/dusk
  const sunColor = `rgb(${Math.round(255)},${Math.round(238 - warm * 60)},${Math.round(210 - warm * 110)})`;
  const sunIntensity = 0.15 + day * 1.7;
  const ambient = 0.12 + day * 0.32;
  const isNight = day < 0.12;
  return { dir, sunColor, sunIntensity, ambient, day, isNight };
}
