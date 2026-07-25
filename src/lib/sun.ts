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
  // `day` is already sin(hour angle), so asin(day) is a real solar altitude:
  // genuinely low at dawn/dusk (long raking shadows) and high at noon. The old
  // model clamped the sun high all day (`y = 0.15 + day*1.2`), so cast shadows
  // were always short and hidden under the building — the main reason exteriors
  // read as unlit. Floored at ~6 deg so shadows never stretch to infinity.
  const elevRad = Math.max(0.105, Math.asin(Math.min(1, day)));
  // Azimuth sweeps east -> south -> west, so the lit face and the shadow
  // direction actually change through the day instead of sitting behind the
  // default camera all the time.
  const az = ((t - 6) / 12 - 0.5) * Math.PI; // -PI/2 sunrise, 0 south, +PI/2 sunset
  const ce = Math.cos(elevRad);
  const dir: [number, number, number] = [
    ce * Math.sin(az), // east(-x) -> west(+x)
    Math.sin(elevRad),
    -ce * Math.cos(az), // due south(-z) at midday
  ];
  // Warmth: amber at low sun, neutral-cool at noon.
  const warm = 1 - day; // 1 at dawn/dusk
  const sunColor = `rgb(${Math.round(255)},${Math.round(238 - warm * 60)},${Math.round(210 - warm * 110)})`;
  const sunIntensity = 0.15 + day * 1.7;
  const ambient = 0.12 + day * 0.32;
  const isNight = day < 0.12;
  return { dir, sunColor, sunIntensity, ambient, day, isNight };
}
