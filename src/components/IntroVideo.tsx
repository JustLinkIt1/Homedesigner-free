import { useEffect, useRef, useState } from 'react';
import { markIntroPlayed, shouldPlayIntro } from '../lib/introPref';

/**
 * Full-screen animated-logo intro shown automatically once per installation.
 * After that first play it defaults off; users can opt into replaying it on cold
 * launches from Settings.
 */
const SESSION_KEY = 'hd-intro-seen';
// Module-scoped so it survives React StrictMode's dev remount (which would
// otherwise re-mount a fresh component). Set only once the intro is dismissed,
// keeping the useState initializer pure (StrictMode double-invokes it).
let played = false;

export default function IntroVideo() {
  const prefersReduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Pure read: show unless the user prefers reduced motion or it has already
  // played this session (module flag, or persisted across a reload).
  const [show, setShow] = useState(() => {
    if (prefersReduced || played || !shouldPlayIntro()) return false;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return false;
    } catch {
      /* private mode — just show it this once */
    }
    return true;
  });
  const [closing, setClosing] = useState(false);
  const [bg, setBg] = useState('#0a0d14');
  const videoRef = useRef<HTMLVideoElement>(null);

  const dismiss = () => {
    played = true;
    markIntroPlayed();
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
    setClosing(true);
    setTimeout(() => setShow(false), 420);
  };

  useEffect(() => {
    if (!show) return;
    // Safety net: never let a stalled/broken video trap the user on the splash.
    const hardStop = setTimeout(dismiss, 7000);
    return () => clearTimeout(hardStop);
  }, [show]);

  if (!show) return null;

  // Sample the top-left pixel once there's a frame, and match the backdrop to it
  // so a square clip on a tall screen has no jarring letterbox bars.
  const matchBackdrop = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    try {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, 8, 8);
      const [r, g, b] = ctx.getImageData(1, 1, 1, 1).data;
      setBg(`rgb(${r}, ${g}, ${b})`);
    } catch {
      /* tainted canvas / not ready — keep the default backdrop */
    }
  };

  return (
    <div
      className={`intro-video ${closing ? 'closing' : ''}`}
      style={{ background: bg }}
      onClick={dismiss}
      role="button"
      aria-label="Skip intro"
    >
      <video
        ref={videoRef}
        src={`${import.meta.env.BASE_URL}intro.mp4`}
        autoPlay
        muted
        playsInline
        // preload the whole clip so playback is smooth from the first frame
        preload="auto"
        onLoadedData={matchBackdrop}
        onPlaying={matchBackdrop}
        onEnded={dismiss}
        onError={dismiss}
      />
      <button
        className="intro-skip"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
      >
        Skip
      </button>
    </div>
  );
}
