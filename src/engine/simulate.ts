import type { Lane, Scenario, Segment, SegmentKind, SimResult, StrategyId } from './types';

/**
 * A deliberately simple timing model. It is not a browser: it exists so the
 * trade-offs between rendering strategies stay visible and move the way real
 * measurements do. Every constant is in one place so it can be argued with.
 */
export const K = {
  /** CDN processing time per request. */
  EDGE_MS: 8,
  /** React, router and framework runtime that every client bundle carries. */
  RUNTIME_KB: 45,
  /** Parse + compile + run, per gzipped KB, on a desktop. Multiplied by CPU slowdown. */
  EXEC_MS_PER_KB: 1.4,
  /** Re-running components to attach handlers, per KB of client code. */
  HYDRATE_MS_PER_KB: 0.8,
  PARSE_MS_PER_KB: 0.25,
  PAINT_MS: 12,
  CLIENT_RENDER_MS: 30,
  /** The first TCP congestion window carries roughly this much HTML. */
  FIRST_CHUNK_KB: 14,
  DATA_KB: 8,
  HERO_KB: 10,
  SHELL_KB: 8,
  CSR_SHELL_KB: 2,
  SERVER_BASE_MS: 20,
  SERVER_PER_KB_MS: 0.4,
  SHELL_SERVER_MS: 15,
  CHUNK_RENDER_MS: 12,
  /** Flight payload that rides along with the HTML. */
  FLIGHT_OVERHEAD: 1.25,
  /** Share of the HTML that is static when a page uses a prerendered shell. */
  PPR_SHELL_SHARE: 0.55,
} as const;

class Tape {
  segments: Segment[] = [];
  add(lane: Lane, kind: SegmentKind, start: number, end: number, label: string, detail?: string): number {
    this.segments.push({
      id: `${lane}-${kind}-${this.segments.length}`,
      lane,
      kind,
      start,
      end: Math.max(end, start),
      label,
      detail,
    });
    return Math.max(end, start);
  }
}

function costs(s: Scenario) {
  return {
    xfer: (kb: number) => (kb * 8) / s.mbps,
    parse: (kb: number) => kb * K.PARSE_MS_PER_KB * s.cpu,
    paint: K.PAINT_MS * s.cpu,
    exec: (kb: number) => kb * K.EXEC_MS_PER_KB * s.cpu,
    hydrate: (kb: number) => kb * K.HYDRATE_MS_PER_KB * s.cpu,
    clientRender: K.CLIENT_RENDER_MS * s.cpu,
    conn: 2 * s.rtt,
    serverRender: (kb: number) => K.SERVER_BASE_MS + kb * K.SERVER_PER_KB_MS,
  };
}
type Costs = ReturnType<typeof costs>;

/** Client JS shipped when the framework can keep server-only code on the server. */
export function rscJsKb(s: Pick<Scenario, 'jsKb' | 'clientShare'>): number {
  const app = Math.max(0, s.jsKb - K.RUNTIME_KB);
  return Math.round(K.RUNTIME_KB + app * s.clientShare);
}

function connect(t: Tape, c: Costs) {
  t.add('network', 'connect', 0, c.conn, 'Connect', 'TCP + TLS handshake: two round trips');
  return c.conn;
}

/** A static document served straight from the CDN. */
function edgeDocument(t: Tape, s: Scenario, c: Costs, kb: number, label: string) {
  const conn = connect(t, c);
  const ttfb = conn + s.rtt + K.EDGE_MS;
  t.add('network', 'wait', conn, ttfb, 'Request', 'One round trip to the nearest CDN node');
  const docEnd = t.add('network', 'document', ttfb, ttfb + c.xfer(kb), label, `${kb.toFixed(0)} KB`);
  return { ttfb, docEnd };
}

/** A document the origin server has to produce before the first byte can leave. */
function originDocument(t: Tape, s: Scenario, c: Costs, work: number, kb: number, label: string, renderLabel: string) {
  const conn = connect(t, c);
  const serverStart = conn + s.rtt / 2 + K.EDGE_MS + s.originMs / 2;
  const serverEnd = serverStart + work;
  const ttfb = serverEnd + s.originMs / 2 + s.rtt / 2;
  t.add('network', 'wait', conn, ttfb, 'Waiting for the server', 'Request travels to the origin, response travels back');
  t.add('server', 'render', serverStart, serverEnd, renderLabel, `${Math.round(work)} ms of server work`);
  const docEnd = t.add('network', 'document', ttfb, ttfb + c.xfer(kb), label, `${kb.toFixed(0)} KB`);
  return { ttfb, docEnd, serverStart, serverEnd };
}

/** Parse the first chunk of HTML and paint it. Returns when the browser has real pixels. */
function firstPaint(t: Tape, c: Costs, ttfb: number, kb: number, label = 'Parse HTML') {
  const first = Math.min(kb, K.FIRST_CHUNK_KB);
  const headAt = ttfb + c.xfer(first);
  const parseEnd = t.add('main', 'parse', headAt, headAt + c.parse(first), label);
  const fcp = t.add('main', 'paint', parseEnd, parseEnd + c.paint, 'First paint');
  return { headAt, parseEnd, fcp };
}

/** Download, run and optionally hydrate a bundle. */
function boot(t: Tape, s: Scenario, c: Costs, discoveredAt: number, mainFree: number, kb: number, hydrate: boolean) {
  const reqEnd = t.add('network', 'wait', discoveredAt, discoveredAt + s.rtt + K.EDGE_MS, 'Request JS', 'Discovered in the HTML head');
  const dlEnd = t.add('network', 'script', reqEnd, reqEnd + c.xfer(kb), 'JavaScript', `${Math.round(kb)} KB gzipped`);
  const execStart = Math.max(dlEnd, mainFree);
  const execEnd = t.add('main', 'exec', execStart, execStart + c.exec(kb), 'Run JavaScript', `${Math.round(kb)} KB parsed and executed`);
  const hydEnd = hydrate
    ? t.add('main', 'hydrate', execEnd, execEnd + c.hydrate(kb), 'Hydrate', 'Attach handlers by re-running components')
    : execEnd;
  return { dlEnd, execEnd, hydEnd };
}

/** A client-side fetch that starts at `at`. Returns when the JSON has arrived. */
function clientFetch(t: Tape, s: Scenario, c: Costs, at: number, latency: number, label: string) {
  const waitEnd = t.add('network', 'wait', at, at + s.rtt + s.originMs + latency, label, 'Request + server work + response');
  return t.add('network', 'data', waitEnd, waitEnd + c.xfer(K.DATA_KB), `${label} payload`, `${K.DATA_KB} KB JSON`);
}

function finish(
  strategy: StrategyId,
  t: Tape,
  m: { ttfb: number; fcp: number; lcp: number; complete: number; tti: number },
  v: { shellAt: number; heroAt: number; widgetAt: number },
  jsKb: number,
  originLoad: number,
  cacheNote?: string,
): SimResult {
  const lcp = Math.max(m.lcp, m.fcp);
  const tti = Math.max(m.tti, lcp);
  const complete = Math.max(m.complete, lcp);
  return {
    strategy,
    marks: { ttfb: m.ttfb, fcp: m.fcp, lcp, complete, tti },
    visual: v,
    segments: t.segments.sort((a, b) => a.start - b.start),
    jsKb: Math.round(jsKb),
    deadZone: Math.max(0, tti - v.heroAt),
    originLoad,
    cacheNote,
  };
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

function simCsr(s: Scenario): SimResult {
  const t = new Tape();
  const c = costs(s);
  const { ttfb, docEnd } = edgeDocument(t, s, c, K.CSR_SHELL_KB, 'index.html');
  const parseEnd = t.add('main', 'parse', docEnd, docEnd + c.parse(K.CSR_SHELL_KB), 'Parse HTML', 'An empty shell: nothing to show yet');
  const b = boot(t, s, c, docEnd, parseEnd, s.jsKb, false);
  const fcp = t.add('main', 'paint', b.execEnd, b.execEnd + c.paint, 'Paint skeleton');

  const heroData = clientFetch(t, s, c, b.execEnd, s.dataMs, 'API: main content');
  const slowData = clientFetch(t, s, c, b.execEnd, s.slowMs, 'API: slow widget');
  const heroRender = t.add('main', 'render', heroData, heroData + c.clientRender, 'Render content');
  const lcp = t.add('main', 'paint', heroRender, heroRender + c.paint, 'Paint content');
  const slowStart = Math.max(slowData, lcp);
  const complete = t.add('main', 'paint', slowStart, slowStart + c.clientRender + c.paint, 'Paint slow widget');

  return finish(
    'csr',
    t,
    { ttfb, fcp, lcp, complete, tti: lcp },
    { shellAt: fcp, heroAt: lcp, widgetAt: complete },
    s.jsKb,
    0.0,
    'Static shell from the CDN. Data comes from API calls made by the browser.',
  );
}

function simStatic(s: Scenario, strategy: 'ssg' | 'isr'): SimResult {
  const t = new Tape();
  const c = costs(s);
  const state = strategy === 'isr' ? s.cache : 'hit';
  const miss = state === 'miss';

  const doc = miss
    ? originDocument(
        t, s, c,
        Math.max(s.dataMs, s.slowMs) + c.serverRender(s.htmlKb),
        s.htmlKb, 'index.html', 'Render and store in cache',
      )
    : edgeDocument(t, s, c, s.htmlKb, 'index.html');

  const paint = firstPaint(t, c, doc.ttfb, s.htmlKb);
  const rest = Math.max(0, s.htmlKb - K.FIRST_CHUNK_KB);
  const restParse = rest > 0 ? t.add('main', 'parse', Math.max(doc.docEnd, paint.fcp), Math.max(doc.docEnd, paint.fcp) + c.parse(rest), 'Parse the rest') : paint.fcp;
  const staticComplete = Math.max(restParse, doc.docEnd) + (rest > 0 ? c.paint : 0);

  const b = boot(t, s, c, paint.headAt, paint.fcp, s.jsKb, true);

  let lcp = paint.fcp;
  let complete = staticComplete;
  let heroAt = paint.fcp;
  let widgetAt = staticComplete;

  if (s.personalized) {
    // The cached HTML cannot know who is looking, so personal parts load after hydration.
    const heroData = clientFetch(t, s, c, b.hydEnd, s.dataMs, 'API: personal content');
    const slowData = clientFetch(t, s, c, b.hydEnd, s.slowMs, 'API: slow widget');
    const render = t.add('main', 'render', heroData, heroData + c.clientRender, 'Render personal content');
    lcp = t.add('main', 'paint', render, render + c.paint, 'Paint personal content');
    complete = Math.max(lcp, slowData + c.clientRender + c.paint);
    heroAt = lcp;
    widgetAt = complete;
  }

  const note =
    strategy === 'ssg'
      ? 'Pre-built at deploy time. Content is as old as the last build.'
      : state === 'hit'
        ? 'Cache hit: served from the CDN, still within the revalidate window.'
        : state === 'stale'
          ? 'Stale hit: served instantly from cache while a fresh copy is rebuilt in the background.'
          : 'Cache miss: this unlucky visitor waits for a full server render. The result is then cached for everyone else.';

  return finish(
    strategy,
    t,
    { ttfb: doc.ttfb, fcp: paint.fcp, lcp, complete, tti: b.hydEnd },
    { shellAt: paint.fcp, heroAt, widgetAt },
    s.jsKb,
    strategy === 'ssg' ? 0 : miss ? 1 : 0.01,
    note,
  );
}

function simSsr(s: Scenario): SimResult {
  const t = new Tape();
  const c = costs(s);
  // Everything is fetched in parallel, but the first byte waits for the slowest one.
  const work = Math.max(s.dataMs, s.slowMs) + c.serverRender(s.htmlKb);
  const doc = originDocument(t, s, c, work, s.htmlKb, 'index.html', 'Fetch data and render HTML');
  const paint = firstPaint(t, c, doc.ttfb, s.htmlKb);
  const rest = Math.max(0, s.htmlKb - K.FIRST_CHUNK_KB);
  const restParse = rest > 0 ? t.add('main', 'parse', Math.max(doc.docEnd, paint.fcp), Math.max(doc.docEnd, paint.fcp) + c.parse(rest), 'Parse the rest') : paint.fcp;
  const complete = Math.max(restParse, doc.docEnd) + (rest > 0 ? c.paint : 0);
  const b = boot(t, s, c, paint.headAt, paint.fcp, s.jsKb, true);

  return finish(
    'ssr',
    t,
    { ttfb: doc.ttfb, fcp: paint.fcp, lcp: paint.fcp, complete, tti: b.hydEnd },
    { shellAt: paint.fcp, heroAt: paint.fcp, widgetAt: complete },
    s.jsKb,
    1,
    'Rendered on the origin for every request. Nothing is sent until the slowest data is back.',
  );
}

function simStreamed(s: Scenario, kind: 'stream' | 'rsc'): SimResult {
  const t = new Tape();
  const c = costs(s);
  const overhead = kind === 'rsc' ? K.FLIGHT_OVERHEAD : 1;
  const jsKb = kind === 'rsc' ? rscJsKb(s) : s.jsKb;

  const conn = connect(t, c);
  const serverStart = conn + s.rtt / 2 + K.EDGE_MS + s.originMs / 2;
  const shellReady = serverStart + K.SHELL_SERVER_MS;
  const toClient = s.originMs / 2 + s.rtt / 2;
  const ttfb = shellReady + toClient;
  t.add('network', 'wait', conn, ttfb, 'Waiting for the shell', 'Only the shell is rendered before the first flush');
  t.add('server', 'render', serverStart, shellReady, 'Render shell', 'Layout, navigation, Suspense fallbacks');

  const shellKb = K.SHELL_KB * overhead;
  const heroKb = K.HERO_KB * overhead;
  const slowKb = Math.max(4, s.htmlKb - K.SHELL_KB - K.HERO_KB) * overhead;

  const shellEnd = t.add('network', 'document', ttfb, ttfb + c.xfer(shellKb), 'Shell', `${shellKb.toFixed(0)} KB`);

  // Both data fetches start as soon as the server begins rendering, in parallel.
  const heroReady = Math.max(shellReady, serverStart + s.dataMs + K.CHUNK_RENDER_MS);
  const slowReady = Math.max(shellReady, serverStart + s.slowMs + K.CHUNK_RENDER_MS);
  t.add('server', 'wait', serverStart, heroReady, 'Await main data', `${s.dataMs} ms`);
  t.add('server', 'render', heroReady - K.CHUNK_RENDER_MS, heroReady, 'Render main content');
  if (slowReady > heroReady) {
    t.add('server', 'wait', heroReady, slowReady, 'Await slow widget', `${s.slowMs} ms`);
    t.add('server', 'render', slowReady - K.CHUNK_RENDER_MS, slowReady, 'Render slow widget');
  }

  const heroArrive = Math.max(heroReady + toClient + c.xfer(heroKb), shellEnd);
  const slowArrive = Math.max(slowReady + toClient + c.xfer(slowKb), heroArrive);
  t.add('network', 'document', Math.max(heroArrive - c.xfer(heroKb), shellEnd), heroArrive, 'Main content chunk', `${heroKb.toFixed(0)} KB streamed`);
  t.add('network', 'document', Math.max(slowArrive - c.xfer(slowKb), heroArrive), slowArrive, 'Slow widget chunk', `${slowKb.toFixed(0)} KB streamed`);

  const paint = firstPaint(t, c, ttfb, shellKb, 'Parse shell');
  const heroParse = t.add('main', 'parse', Math.max(heroArrive, paint.fcp), Math.max(heroArrive, paint.fcp) + c.parse(heroKb), 'Insert main content');
  const lcp = t.add('main', 'paint', heroParse, heroParse + c.paint, 'Paint main content');
  const slowParse = t.add('main', 'parse', Math.max(slowArrive, lcp), Math.max(slowArrive, lcp) + c.parse(slowKb), 'Insert slow widget');
  const complete = t.add('main', 'paint', slowParse, slowParse + c.paint, 'Paint slow widget');

  const b = boot(t, s, c, paint.headAt, paint.fcp, jsKb, true);

  return finish(
    kind,
    t,
    { ttfb, fcp: paint.fcp, lcp, complete, tti: Math.max(b.hydEnd, lcp) },
    { shellAt: paint.fcp, heroAt: lcp, widgetAt: complete },
    jsKb,
    1,
    kind === 'rsc'
      ? 'Server Components stream as a flight payload. Only client components are shipped and hydrated.'
      : 'The shell flushes first. Suspense boundaries stream in as their data resolves, then the whole tree hydrates.',
  );
}

function simPpr(s: Scenario): SimResult {
  const t = new Tape();
  const c = costs(s);
  const jsKb = rscJsKb(s);
  const shellKb = Math.max(K.SHELL_KB, s.htmlKb * K.PPR_SHELL_SHARE);
  const heroKb = K.HERO_KB * K.FLIGHT_OVERHEAD;
  const slowKb = Math.max(4, s.htmlKb - shellKb - (s.personalized ? K.HERO_KB : 0)) * K.FLIGHT_OVERHEAD;

  // The static shell leaves the CDN immediately...
  const shell = edgeDocument(t, s, c, shellKb, 'Static shell');
  // ...while the same request triggers dynamic rendering at the origin, in parallel.
  const reached = c.conn + s.rtt / 2 + K.EDGE_MS;
  const serverStart = reached + s.originMs / 2;
  const toClient = s.originMs / 2 + s.rtt / 2;

  const heroReady = serverStart + s.dataMs + K.CHUNK_RENDER_MS;
  const slowReady = serverStart + s.slowMs + K.CHUNK_RENDER_MS;
  t.add('server', 'wait', serverStart, slowReady, 'Dynamic holes render', 'Starts the moment the request reaches the edge');
  if (s.personalized) t.add('server', 'render', heroReady - K.CHUNK_RENDER_MS, heroReady, 'Render personal content');
  t.add('server', 'render', slowReady - K.CHUNK_RENDER_MS, slowReady, 'Render slow widget');

  const heroArrive = Math.max(heroReady + toClient + c.xfer(heroKb), shell.docEnd);
  const slowArrive = Math.max(slowReady + toClient + c.xfer(slowKb), shell.docEnd, s.personalized ? heroArrive : 0);
  if (s.personalized) t.add('network', 'document', Math.max(heroArrive - c.xfer(heroKb), shell.docEnd), heroArrive, 'Personal chunk', `${heroKb.toFixed(0)} KB streamed`);
  t.add('network', 'document', Math.max(slowArrive - c.xfer(slowKb), shell.docEnd), slowArrive, 'Dynamic chunk', `${slowKb.toFixed(0)} KB streamed`);

  const paint = firstPaint(t, c, shell.ttfb, shellKb, 'Parse static shell');
  let lcp = paint.fcp;
  let heroAt = paint.fcp;
  if (s.personalized) {
    const p = t.add('main', 'parse', Math.max(heroArrive, paint.fcp), Math.max(heroArrive, paint.fcp) + c.parse(heroKb), 'Insert personal content');
    lcp = t.add('main', 'paint', p, p + c.paint, 'Paint personal content');
    heroAt = lcp;
  }
  const slowParse = t.add('main', 'parse', Math.max(slowArrive, lcp), Math.max(slowArrive, lcp) + c.parse(slowKb), 'Insert dynamic content');
  const complete = t.add('main', 'paint', slowParse, slowParse + c.paint, 'Paint dynamic content');

  const b = boot(t, s, c, paint.headAt, paint.fcp, jsKb, true);

  return finish(
    'ppr',
    t,
    { ttfb: shell.ttfb, fcp: paint.fcp, lcp, complete, tti: Math.max(b.hydEnd, lcp) },
    { shellAt: paint.fcp, heroAt, widgetAt: complete },
    jsKb,
    s.personalized ? 0.6 : 0.4,
    'The shell is a static file on the CDN. Only the dynamic holes cost the origin any work.',
  );
}

export function simulate(strategy: StrategyId, s: Scenario): SimResult {
  const r = (() => {
    switch (strategy) {
      case 'csr': return simCsr(s);
      case 'ssg': return simStatic(s, 'ssg');
      case 'isr': return simStatic(s, 'isr');
      case 'ssr': return simSsr(s);
      case 'stream': return simStreamed(s, 'stream');
      case 'rsc': return simStreamed(s, 'rsc');
      case 'ppr': return simPpr(s);
    }
  })();
  return r;
}

export const STRATEGY_ORDER: StrategyId[] = ['csr', 'ssg', 'isr', 'ssr', 'stream', 'rsc', 'ppr'];

export function simulateAll(s: Scenario): Record<StrategyId, SimResult> {
  return Object.fromEntries(STRATEGY_ORDER.map((id) => [id, simulate(id, s)])) as Record<StrategyId, SimResult>;
}

/** The end of the timeline, with a little headroom, for drawing axes. */
export function horizon(results: SimResult[]): number {
  const end = Math.max(
    ...results.map((r) => Math.max(r.marks.tti, r.marks.complete, ...r.segments.map((x) => x.end))),
  );
  return end;
}
