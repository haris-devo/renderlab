import { rscJsKb } from './simulate';
import type { Scenario, SimResult } from './types';

export type Tone = 'good' | 'warn' | 'bad' | 'info';
export interface Note {
  tone: Tone;
  text: string;
}

export function fmt(ms: number): string {
  if (!Number.isFinite(ms)) return '–';
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s`;
  return `${Math.round(ms)} ms`;
}

/** Turn a simulation into a few sentences about why the numbers look the way they do. */
export function explain(r: SimResult, s: Scenario): Note[] {
  const m = r.marks;
  const slowest = Math.max(s.dataMs, s.slowMs);
  const out: Note[] = [];

  switch (r.strategy) {
    case 'csr': {
      const tone: Tone = m.fcp > 2500 ? 'bad' : m.fcp > 1200 ? 'warn' : 'good';
      out.push({
        tone,
        text: `The screen is blank for ${fmt(m.fcp)}. The browser has to download ${r.jsKb} KB, run it, and only then ask the API for data. Three waits in a row.`,
      });
      out.push({
        tone: 'info',
        text: `Once the code is running the page is already interactive, so there is no dead zone. The cost is paid up front instead.`,
      });
      break;
    }
    case 'ssg': {
      out.push({
        tone: 'good',
        text: `The first byte lands at ${fmt(m.ttfb)} because the HTML is a file on a nearby CDN node. Content is painted at ${fmt(m.fcp)}.`,
      });
      if (s.personalized) {
        out.push({
          tone: 'bad',
          text: `Personal content cannot be pre-built. It waits for the bundle, hydration and a fetch, so the main content only arrives at ${fmt(m.lcp)}.`,
        });
      } else {
        out.push({ tone: 'info', text: 'The content is exactly as old as the last build. Zero origin work per view.' });
      }
      break;
    }
    case 'isr': {
      if (s.cache === 'miss') {
        out.push({
          tone: 'warn',
          text: `Cache miss. This visitor waited ${fmt(m.ttfb)} for a full server render, which is then stored for everyone after them.`,
        });
      } else if (s.cache === 'stale') {
        out.push({
          tone: 'info',
          text: `Stale hit. The visitor got the old page in ${fmt(m.ttfb)} while a fresh copy rebuilds in the background. The next visitor gets the new one.`,
        });
      } else {
        out.push({ tone: 'good', text: `Cache hit. Same speed as a static file: first byte at ${fmt(m.ttfb)}.` });
      }
      if (s.personalized) {
        out.push({ tone: 'bad', text: `Cached HTML is shared, so personal content is fetched after hydration and shows at ${fmt(m.lcp)}.` });
      }
      break;
    }
    case 'ssr': {
      out.push({
        tone: m.ttfb > 1200 ? 'bad' : 'warn',
        text: `Nothing leaves the server for ${fmt(m.ttfb)}. It holds the response until the slowest data (${fmt(slowest)}) is ready and the page is rendered.`,
      });
      out.push({ tone: 'info', text: 'Every page view costs one server render.' });
      break;
    }
    case 'stream': {
      out.push({
        tone: 'good',
        text: `The shell is flushed at ${fmt(m.ttfb)} and painted at ${fmt(m.fcp)}. The slow widget (${fmt(s.slowMs)}) streams in at ${fmt(m.complete)} without holding anything else up.`,
      });
      out.push({
        tone: 'info',
        text: `Streaming moves first paint, not the main data. The main content still needs its ${fmt(s.dataMs)} query, so it lands at ${fmt(m.lcp)}.`,
      });
      break;
    }
    case 'rsc': {
      out.push({
        tone: 'good',
        text: `Only ${r.jsKb} KB of JavaScript is shipped instead of ${s.jsKb} KB. Server components stay on the server, so there is less to download, run and hydrate.`,
      });
      break;
    }
    case 'ppr': {
      out.push({
        tone: 'good',
        text: `The shell is a static file: first byte at ${fmt(m.ttfb)} and first paint at ${fmt(m.fcp)}, even though the page has dynamic parts. They finish at ${fmt(m.complete)} without blocking it.`,
      });
      if (s.personalized) {
        out.push({ tone: 'info', text: `Personal content is a dynamic hole, rendered in parallel from the moment the request reached the edge. It lands at ${fmt(m.lcp)}.` });
      }
      break;
    }
  }

  if (r.deadZone > 600) {
    const tone: Tone = r.deadZone > 2000 ? 'bad' : 'warn';
    const saved = s.jsKb - rscJsKb(s);
    const tail =
      (r.strategy === 'rsc' || r.strategy === 'ppr') && saved > 0
        ? ` Server Components already removed ${saved} KB from this.`
        : '';
    out.push({
      tone,
      text: `Dead zone: the main content is visible at ${fmt(r.visual.heroAt)} but ignores taps until ${fmt(m.tti)}. That is ${fmt(r.deadZone)} spent hydrating ${r.jsKb} KB on a ${s.cpu}× slower CPU.${tail}`,
    });
  }

  return out.slice(0, 4);
}

/** A single sentence on what changed between two strategies, in the viewer's terms. */
export function compareLine(a: SimResult, b: SimResult, nameA: string, nameB: string): string {
  const pick = (key: 'fcp' | 'lcp' | 'tti') => ({ key, d: b.marks[key] - a.marks[key] });
  const diffs = [pick('fcp'), pick('lcp'), pick('tti')].sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  const top = diffs[0];
  const label = { fcp: 'first paint', lcp: 'main content', tti: 'time to interactive' }[top.key];
  if (Math.abs(top.d) < 50) return `${nameA} and ${nameB} are within 50 ms of each other on this setup.`;
  const faster = top.d > 0 ? nameA : nameB;
  const slower = top.d > 0 ? nameB : nameA;
  return `The biggest gap is ${label}: ${faster} is ${fmt(Math.abs(top.d))} ahead of ${slower}.`;
}
