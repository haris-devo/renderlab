export type StrategyId = 'csr' | 'ssg' | 'isr' | 'ssr' | 'stream' | 'rsc' | 'ppr';

export type CacheState = 'hit' | 'stale' | 'miss';

/** Everything the simulator needs to know about the page, the network and the device. */
export interface Scenario {
  /** Round-trip time between the browser and the edge, in ms. */
  rtt: number;
  /** Downlink bandwidth in Mbit/s. */
  mbps: number;
  /** CPU slowdown versus a fast desktop (1 = desktop). */
  cpu: number;
  /** Extra round trip between the CDN/edge and the origin server, in ms. */
  originMs: number;
  /** Latency of the data the main content needs (database or API), in ms. */
  dataMs: number;
  /** Latency of the slowest secondary widget (recommendations, reviews), in ms. */
  slowMs: number;
  /** Gzipped JavaScript of a fully client-side build, in KB. */
  jsKb: number;
  /** Gzipped size of the fully rendered HTML, in KB. */
  htmlKb: number;
  /** Share of the app code that must stay on the client when using Server Components (0..1). */
  clientShare: number;
  /** Whether the main content depends on the visitor (cookies, auth, geo). */
  personalized: boolean;
  /** Cache state for ISR. */
  cache: CacheState;
}

export type Lane = 'network' | 'server' | 'main';

export type SegmentKind =
  | 'connect'
  | 'wait'
  | 'document'
  | 'script'
  | 'data'
  | 'render'
  | 'parse'
  | 'paint'
  | 'exec'
  | 'hydrate';

export interface Segment {
  id: string;
  lane: Lane;
  kind: SegmentKind;
  start: number;
  end: number;
  label: string;
  detail?: string;
}

export interface Marks {
  /** First byte of the document arrives. */
  ttfb: number;
  /** First pixels of real content. */
  fcp: number;
  /** The main content is on screen. */
  lcp: number;
  /** Every part of the page, including the slow widget, is visible. */
  complete: number;
  /** The main content responds to input. */
  tti: number;
}

/** When each part of the demo page becomes visible. */
export interface Visual {
  shellAt: number;
  heroAt: number;
  widgetAt: number;
}

export interface SimResult {
  strategy: StrategyId;
  marks: Marks;
  visual: Visual;
  segments: Segment[];
  /** JavaScript shipped to the browser, in KB. */
  jsKb: number;
  /** Time the page looks ready but ignores input. */
  deadZone: number;
  /** Illustrative share of page views that make the origin do work (0..1). */
  originLoad: number;
  /** Server-side cache state that applies to this view, if any. */
  cacheNote?: string;
}
