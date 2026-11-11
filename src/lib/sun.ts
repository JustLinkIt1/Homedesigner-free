/**
 * Sun model: map a 0..24h clock to a light direction, colour and intensities.
 * The sun rises in the east (−x), peaks south-high at noon, sets west (+x);
 * colour warms toward sunrise/sunset and the whole rig dims into night so
 * artificial fixtures take over. After dark the key light becomes a faint, cool
 * moon so the building keeps its shape instead of sinking into a murky orange
 * dusk. Shared by the 3D view and photo mode so the two always agree on daylight.
 */
export function sunModel(t: number) {
  // Daylight fraction: 0 before 6am / after 8pm, 1 around midday.
  const day = Math.max(0, Math.sin(((t - 6) / 12) * Math.PI)); // 6->0, 12->1, 18->0
  // `day` is already sin(hour angle), so asin(day) is a real solar altitude:
  // genuinely low at dawn/dusk (long raking shadows) and high at noon. The old
  // model clamped the sun high all day (`y = 0.15 + day*1.2`), so cast shadows
  // were always short and hidden under the building — the main reason exteriors
  // read as unlit. Floored at ~6 deg so shadows never stretch to infinity.
  //
  // The altitude peaks at SUN_PEAK, not the zenith. A sun straight overhead
  // (what plain asin(day) gives at noon) puts no direct light on any wall and
  // tucks every shadow under the thing casting it, so the default midday view
  // was the flattest of the whole day. A temperate-latitude summer sun keeps a
  // readable shadow beside walls, trees and furniture from mid-morning to
  // mid-afternoon; dawn and dusk are all but unchanged (sin scales, not clamps).
  const elevRad = Math.max(0.105, Math.asin(Math.min(1, day) * SUN_PEAK_SIN));
  // Azimuth sweeps east -> south -> west, so the lit face and the shadow
  // direction actually change through the day instead of sitting behind the
  // default camera all the time.
  const az = ((t - 6) / 12 - 0.5) * Math.PI; // -PI/2 sunrise, 0 south, +PI/2 sunset
  const ce = Math.cos(elevRad);
  const sunDir: [number, number, number] = [
    ce * Math.sin(az), // east(-x) -> west(+x)
    Math.sin(elevRad),
    -ce * Math.cos(az), // due south(-z) at midday
  ];
  // Moonlight: 0 at sunset/sunrise, full an hour into the night. The key light
  // is all but off at the hand-over, so swapping its direction never pops.
  const sinceSunset = (((t - 18) % 24) + 24) % 24;
  const moon = day > 0 ? 0 : Math.max(0, Math.min(1, sinceSunset, 12 - sinceSunset));
  const dir: [number, number, number] = moon > 0 ? MOON_DIR : sunDir;
  // Warmth: amber at low sun, neutral-cool at noon.
  const warm = 1 - day; // 1 at dawn/dusk
  const sunColor =
    moon > 0
      ? 'rgb(172,196,255)'
      : `rgb(${Math.round(255)},${Math.round(238 - warm * 60)},${Math.round(210 - warm * 110)})`;
  // Slightly convex in `day` so the golden hour still reads as sunlit.
  const sunIntensity = moon > 0 ? 0.04 + moon * 0.34 : 0.04 + Math.pow(day, 0.6) * 1.81;
  // Fill-light level. Rises faster than `day` (which is the sun's height), the
  // way a camera opens up at dusk: the golden hour stays exposed and warm
  // instead of dropping to a dull olive.
  const light = Math.sqrt(day);
  const ambient = 0.12 + light * 0.32 + moon * 0.03;
  const isNight = day < 0.12;
  return { dir, skyDir: sunDir, sunColor, sunIntensity, ambient, day, light, moon, isNight };
}

/** sin of the sun's peak altitude (58 deg, a temperate-latitude summer noon). */
const SUN_PEAK_SIN = 0.848;

/** A high, front-left moon: keeps night shadows short and the model readable. */
const MOON_DIR: [number, number, number] = [-0.4, 0.76, 0.51];
