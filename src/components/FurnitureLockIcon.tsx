import type { CSSProperties } from 'react';

/**
 * Owner-supplied armchair-with-padlock glyph for the "Lock objects" toggle
 * (clearer than a bare padlock). Rendered as a CSS mask filled with
 * `currentColor`, so — unlike a plain <img> — it inherits the toggle's theme
 * colour and brand-tinted active state, matching the lucide icons around it.
 */
export default function FurnitureLockIcon({ style }: { style?: CSSProperties }) {
  const url = `${import.meta.env.BASE_URL}icons/furniture-lock.png`;
  return (
    <span
      className="fl-icon"
      aria-hidden
      style={{ WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`, ...style }}
    />
  );
}
