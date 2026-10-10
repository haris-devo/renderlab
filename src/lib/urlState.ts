import type { StrategyId } from '../engine/types';
import { DEFAULT_SETUP, type Setup } from '../engine/presets';

export interface LabState {
  setup: Setup;
  strategy: StrategyId;
  compare: StrategyId | null;
}

const IDS: StrategyId[] = ['csr', 'ssg', 'isr', 'ssr', 'stream', 'rsc', 'ppr'];
const num = (v: string | null, min: number, max: number): number | undefined => {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};

export function readLabState(search: string): Partial<LabState> | null {
  const q = new URLSearchParams(search);
  if (![...q.keys()].length) return null;
  const s: Setup = { ...DEFAULT_SETUP };
  const n = q.get('n');
  if (n && ['fiber', 'fast4g', '4g', 'slow4g', '3g'].includes(n)) s.networkId = n as Setup['networkId'];
  const d = q.get('d');
  if (d && ['desktop', 'laptop', 'phone', 'lowphone'].includes(d)) s.deviceId = d as Setup['deviceId'];
  const sc = q.get('s');
  if (sc && ['product', 'marketing', 'news', 'dashboard', 'feed', 'custom'].includes(sc)) s.scenarioId = sc as Setup['scenarioId'];
  s.rtt = num(q.get('rtt'), 1, 1000) ?? s.rtt;
  s.mbps = num(q.get('mbps'), 0.1, 1000) ?? s.mbps;
  s.cpu = num(q.get('cpu'), 1, 12) ?? s.cpu;
  s.dataMs = num(q.get('dm'), 0, 5000) ?? s.dataMs;
  s.slowMs = num(q.get('sm'), 0, 6000) ?? s.slowMs;
  s.originMs = num(q.get('om'), 0, 500) ?? s.originMs;
  s.jsKb = num(q.get('js'), 20, 2000) ?? s.jsKb;
  s.htmlKb = num(q.get('html'), 5, 400) ?? s.htmlKb;
  s.clientShare = num(q.get('cs'), 0, 100) !== undefined ? num(q.get('cs'), 0, 100)! / 100 : s.clientShare;
  if (q.get('p') !== null) s.personalized = q.get('p') === '1';
  const c = q.get('c');
  if (c === 'hit' || c === 'stale' || c === 'miss') s.cache = c;
  const a = q.get('a') as StrategyId | null;
  const b = q.get('b') as StrategyId | null;
  return {
    setup: s,
    strategy: a && IDS.includes(a) ? a : undefined,
    compare: b && IDS.includes(b) ? b : null,
  };
}

export function writeLabState(state: LabState): string {
  const q = new URLSearchParams();
  const s = state.setup;
  q.set('a', state.strategy);
  if (state.compare) q.set('b', state.compare);
  q.set('n', s.networkId);
  q.set('d', s.deviceId);
  q.set('s', s.scenarioId);
  q.set('rtt', String(s.rtt));
  q.set('mbps', String(s.mbps));
  q.set('cpu', String(s.cpu));
  q.set('dm', String(s.dataMs));
  q.set('sm', String(s.slowMs));
  q.set('om', String(s.originMs));
  q.set('js', String(s.jsKb));
  q.set('html', String(s.htmlKb));
  q.set('cs', String(Math.round(s.clientShare * 100)));
  q.set('p', s.personalized ? '1' : '0');
  q.set('c', s.cache);
  return q.toString();
}
