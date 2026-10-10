import { useEffect, useRef, useState } from 'react';
import type { SimResult } from '../engine/types';
import { fmt } from '../engine/explain';
import './browser.css';

type Phase = 'blank' | 'skeleton' | 'content' | 'dead' | 'ready';

export function phaseAt(r: SimResult, t: number): Phase {
  if (t < r.visual.shellAt) return 'blank';
  if (t < r.visual.heroAt) return 'skeleton';
  if (t >= r.marks.tti) return 'ready';
  return r.marks.tti > r.visual.heroAt ? 'dead' : 'content';
}

const LABEL: Record<Phase, string> = {
  blank: 'Blank',
  skeleton: 'Placeholders',
  content: 'Content',
  dead: 'Visible, not interactive',
  ready: 'Interactive',
};

interface Props {
  result: SimResult;
  t: number;
  /** Let the visitor tap the button. */
  tappable?: boolean;
  /** Smaller type and chrome, for the hero race. */
  compact?: boolean;
  title?: string;
}

export function Browser({ result, t, tappable, compact, title }: Props) {
  const { visual, marks } = result;
  const phase = phaseAt(result, t);
  const showShell = t >= visual.shellAt;
  const showHero = t >= visual.heroAt;
  const showWidget = t >= visual.widgetAt;
  const interactive = t >= marks.tti;

  const [cart, setCart] = useState(0);
  const [ignored, setIgnored] = useState(0);
  const [toast, setToast] = useState<{ kind: 'ok' | 'no'; text: string; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const tap = () => {
    if (!tappable) return;
    window.clearTimeout(timer.current);
    if (!interactive) {
      setIgnored((n) => n + 1);
      setToast({ kind: 'no', text: 'Tap ignored. The page has not hydrated yet.', id: Date.now() });
    } else {
      setCart((n) => n + 1);
      setToast({ kind: 'ok', text: 'Added to cart', id: Date.now() });
    }
    timer.current = window.setTimeout(() => setToast(null), 1800);
  };

  const loading = t < marks.lcp;

  return (
    <figure className={`bw ${compact ? 'bw-compact' : ''}`} data-phase={phase}>
      <div className="bw-chrome">
        <span className="bw-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="bw-url">{title ?? 'shop.example/alta-trail-shell'}</span>
        <span className={`bw-spin ${loading ? 'on' : ''}`} aria-hidden="true" />
        <span className="bw-bar" aria-hidden="true" data-on={loading} />
      </div>

      <div className="bw-body">
        {!showShell && <div className="bw-blank" aria-label="Blank page" />}
        {showShell && (
          <div className="bw-page">
            <header className="bw-nav">
              <span className="bw-logo" />
              <span className="bw-search" />
              <span className="bw-cart" aria-label={`Cart, ${cart} items`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 7h14l-1.4 9.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 7Zm0 0-.6-2.6A1 1 0 0 0 3.4 3.6H2M9 7a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {cart > 0 && <b>{cart}</b>}
              </span>
            </header>

            <div className="bw-main">
              <div className={`bw-hero-art ${showHero ? 'in' : 'sk'}`}>{showHero && <span className="bw-art" />}</div>
              <div className="bw-info">
                {showHero ? (
                  <>
                    <h4>Alta Trail Shell</h4>
                    <p className="bw-stars" aria-label="4.8 out of 5">
                      ★★★★★ <span>4.8 · 312 reviews</span>
                    </p>
                    <p className="bw-price">$189</p>
                    <button
                      type="button"
                      className={`bw-buy ${interactive ? 'live' : ''}`}
                      onClick={tap}
                      tabIndex={tappable ? 0 : -1}
                      aria-disabled={!interactive}
                    >
                      Add to cart
                    </button>
                  </>
                ) : (
                  <>
                    <span className="sk sk-title" />
                    <span className="sk sk-line" />
                    <span className="sk sk-price" />
                    <span className="sk sk-btn" />
                  </>
                )}
              </div>
            </div>

            <div className="bw-recs">
              {[0, 1, 2].map((i) =>
                showWidget ? (
                  <span key={i} className="bw-card in">
                    <i className={`bw-thumb t${i}`} />
                    <em />
                  </span>
                ) : (
                  <span key={i} className="bw-card">
                    <i className="sk sk-thumb" />
                    <em className="sk" />
                  </span>
                ),
              )}
            </div>
          </div>
        )}

        {toast && (
          <div key={toast.id} className={`bw-toast ${toast.kind}`} role="status">
            {toast.text}
          </div>
        )}
      </div>

      <figcaption className="bw-status" data-phase={phase}>
        <span className="bw-pill">
          <i />
          {LABEL[phase]}
        </span>
        {tappable && (
          <span className="bw-taps">
            {ignored > 0 ? `${ignored} ignored` : 'Try tapping the button'}
          </span>
        )}
        {!tappable && <span className="bw-taps tabular">{fmt(t)}</span>}
      </figcaption>
    </figure>
  );
}
