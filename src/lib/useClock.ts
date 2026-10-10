import { useCallback, useEffect, useRef, useState } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A scrubbable clock that runs from 0 to `duration` in milliseconds. */
export function useClock(duration: number, opts: { autoplay?: boolean } = {}) {
  const reduced = prefersReducedMotion();
  const [t, setT] = useState(reduced ? duration : 0);
  const [playing, setPlaying] = useState((opts.autoplay ?? true) && !reduced);
  const [speed, setSpeed] = useState(1);
  const tRef = useRef(t);
  const durRef = useRef(duration);
  durRef.current = duration;

  const set = useCallback((v: number) => {
    tRef.current = v;
    setT(v);
  }, []);

  useEffect(() => {
    if (tRef.current > duration) set(duration);
  }, [duration, set]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      const next = Math.min(durRef.current, tRef.current + dt);
      set(next);
      if (next >= durRef.current) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, set]);

  return {
    t,
    playing,
    speed,
    setSpeed,
    seek: (v: number) => {
      set(Math.max(0, Math.min(durRef.current, v)));
      setPlaying(false);
    },
    play: () => {
      if (tRef.current >= durRef.current) set(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    restart: () => {
      set(0);
      setPlaying(true);
    },
  };
}
