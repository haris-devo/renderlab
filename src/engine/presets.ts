import type { Scenario } from './types';

export type NetworkId = 'fiber' | 'fast4g' | '4g' | 'slow4g' | '3g';
export type DeviceId = 'desktop' | 'laptop' | 'phone' | 'lowphone';

export const NETWORKS: { id: NetworkId; name: string; rtt: number; mbps: number; hint: string }[] = [
  { id: 'fiber', name: 'Fibre', rtt: 12, mbps: 200, hint: '12 ms · 200 Mbit/s' },
  { id: 'fast4g', name: 'Fast 4G', rtt: 40, mbps: 30, hint: '40 ms · 30 Mbit/s' },
  { id: '4g', name: '4G', rtt: 70, mbps: 12, hint: '70 ms · 12 Mbit/s' },
  { id: 'slow4g', name: 'Slow 4G', rtt: 150, mbps: 1.6, hint: '150 ms · 1.6 Mbit/s' },
  { id: '3g', name: '3G', rtt: 300, mbps: 0.7, hint: '300 ms · 0.7 Mbit/s' },
];

export const DEVICES: { id: DeviceId; name: string; cpu: number; hint: string }[] = [
  { id: 'desktop', name: 'Desktop', cpu: 1, hint: 'No throttling' },
  { id: 'laptop', name: 'Laptop', cpu: 2, hint: '2× slower' },
  { id: 'phone', name: 'Mid phone', cpu: 4, hint: '4× slower' },
  { id: 'lowphone', name: 'Budget phone', cpu: 6, hint: '6× slower' },
];

export interface Setup extends Scenario {
  networkId: NetworkId;
  deviceId: DeviceId;
  scenarioId: ScenarioId | 'custom';
}

export type ScenarioId = 'product' | 'marketing' | 'news' | 'dashboard' | 'feed';

type PageProfile = Pick<
  Scenario,
  'dataMs' | 'slowMs' | 'jsKb' | 'htmlKb' | 'clientShare' | 'personalized' | 'originMs'
>;

export const SCENARIOS: {
  id: ScenarioId;
  name: string;
  blurb: string;
  profile: PageProfile;
}[] = [
  {
    id: 'product',
    name: 'Product page',
    blurb: 'Catalogue data, a slow recommendations widget, SEO matters.',
    profile: { dataMs: 300, slowMs: 1200, jsKb: 320, htmlKb: 60, clientShare: 0.35, personalized: false, originMs: 40 },
  },
  {
    id: 'marketing',
    name: 'Marketing page',
    blurb: 'Mostly copy and images. Changes when editors publish.',
    profile: { dataMs: 80, slowMs: 200, jsKb: 180, htmlKb: 40, clientShare: 0.25, personalized: false, originMs: 40 },
  },
  {
    id: 'news',
    name: 'News article',
    blurb: 'Big HTML, comments widget that loads slowly.',
    profile: { dataMs: 120, slowMs: 900, jsKb: 260, htmlKb: 90, clientShare: 0.3, personalized: false, originMs: 40 },
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    blurb: 'Behind a login. Everything depends on who you are.',
    profile: { dataMs: 500, slowMs: 1400, jsKb: 520, htmlKb: 45, clientShare: 0.6, personalized: true, originMs: 60 },
  },
  {
    id: 'feed',
    name: 'Social feed',
    blurb: 'Personalised, constantly changing, still needs fast first paint.',
    profile: { dataMs: 350, slowMs: 900, jsKb: 480, htmlKb: 70, clientShare: 0.5, personalized: true, originMs: 50 },
  },
];

export const DEFAULT_SETUP: Setup = {
  networkId: '4g',
  deviceId: 'phone',
  scenarioId: 'product',
  rtt: 70,
  mbps: 12,
  cpu: 4,
  cache: 'hit',
  ...SCENARIOS[0].profile,
};

export function applyNetwork(setup: Setup, id: NetworkId): Setup {
  const n = NETWORKS.find((x) => x.id === id)!;
  return { ...setup, networkId: id, rtt: n.rtt, mbps: n.mbps };
}

export function applyDevice(setup: Setup, id: DeviceId): Setup {
  const d = DEVICES.find((x) => x.id === id)!;
  return { ...setup, deviceId: id, cpu: d.cpu };
}

export function applyScenario(setup: Setup, id: ScenarioId): Setup {
  const p = SCENARIOS.find((x) => x.id === id)!;
  return { ...setup, scenarioId: id, ...p.profile };
}
