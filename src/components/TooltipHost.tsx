import { useEffect, useState } from 'react';

/**
 * App-owned tooltips for anything carrying `data-tip`.
 *
 * A native `title` tooltip is drawn by the browser's own UI layer and follows
 * the BROWSER's theme, not the page's — `color-scheme: dark` cannot reach it —
 * so a light-themed Chrome showed light tooltips floating over the dark app.
 *
 * This is a single fixed-position element driven by one delegated listener,
 * rather than a CSS `::after` on each target, because `::after` is clipped by
 * any scrolling or `overflow: hidden` ancestor. The properties panel and the
 * catalog sidebar both scroll, so a pseudo-element tooltip inside them would
 * simply never be seen.
 *
 * An element with `data-tip` must NOT also carry `title`, or the browser draws
 * its own tooltip on top of this one. Keep `aria-label` for the accessible
 * name: this host is purely visual and is never read by a screen reader.
 */
interface Tip {
  text: string;
  x: number;
  y: number;
  /** Below the target by default; flipped above when there is no room. */
  above: boolean;
}

const GAP = 8;
const MARGIN = 6;
/** Matches the delay a native tooltip has, so this doesn't feel twitchy. */
const DELAY_MS = 350;

export default function TooltipHost() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    // Touch has no hover, and a tap would leave a tooltip stranded under the
    // finger. The accessible name still carries the same text.
    if (window.matchMedia('(pointer: coarse)').matches) return;

    let timer = 0;
    const clear = () => {
      window.clearTimeout(timer);
      setTip(null);
    };

    const show = (el: HTMLElement) => {
      const text = el.getAttribute('data-tip');
      if (!text) return;
      const r = el.getBoundingClientRect();
      // Anchor to the target; the host clamps itself horizontally once it has
      // measured its own width.
      const above = r.bottom + GAP + 34 > window.innerHeight;
      setTip({
        text,
        x: r.left + r.width / 2,
        y: above ? r.top - GAP : r.bottom + GAP,
        above,
      });
    };

    const over = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      window.clearTimeout(timer);
      if (!el || el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled) {
        setTip(null);
        return;
      }
      timer = window.setTimeout(() => show(el), DELAY_MS);
    };

    // Keyboard users get the same affordance, without the delay.
    const focus = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      window.clearTimeout(timer);
      if (el) show(el);
      else setTip(null);
    };

    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', clear);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', clear);
    // A tooltip anchored to a scrolled-away element would float over nothing.
    window.addEventListener('scroll', clear, true);
    window.addEventListener('blur', clear);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', clear);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', clear);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('blur', clear);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      className="app-tip"
      // Clamped away from both edges; the translate keeps it centred on the
      // target while `max-width` stops a long label running off screen.
      style={{
        left: Math.min(window.innerWidth - MARGIN, Math.max(MARGIN, tip.x)),
        top: tip.y,
        transform: `translate(-50%, ${tip.above ? '-100%' : '0'})`,
      }}
      role="presentation"
    >
      {tip.text}
    </div>
  );
}
