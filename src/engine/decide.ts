import type { StrategyId } from './types';

export interface Answers {
  change: 'rare' | 'daily' | 'minutes' | 'live';
  who: 'same' | 'some' | 'everything';
  seo: 'critical' | 'helpful' | 'none';
  pages: 'few' | 'many' | 'huge';
  interaction: 'reading' | 'mixed' | 'app';
  slow: 'no' | 'yes';
  hosting: 'static' | 'server';
}

export interface Question<K extends keyof Answers = keyof Answers> {
  key: K;
  title: string;
  help: string;
  options: { value: Answers[K]; label: string; hint: string }[];
}

export const QUESTIONS: Question[] = [
  {
    key: 'change',
    title: 'How often does the data change?',
    help: 'Think about the data on the page, not the code.',
    options: [
      { value: 'rare', label: 'Rarely', hint: 'On a deploy or a few times a month' },
      { value: 'daily', label: 'Daily', hint: 'Editors publish through the day' },
      { value: 'minutes', label: 'Every few minutes', hint: 'Prices, inventory, scores' },
      { value: 'live', label: 'Constantly', hint: 'Must be current on every view' },
    ],
  },
  {
    key: 'who',
    title: 'Is the page the same for every visitor?',
    help: 'Cookies, auth, location and A/B tests all count as personal.',
    options: [
      { value: 'same', label: 'Yes, identical', hint: 'Anonymous, one version' },
      { value: 'some', label: 'Mostly, with a few personal parts', hint: 'A cart, a price, a greeting' },
      { value: 'everything', label: 'No, all of it is personal', hint: 'A dashboard or a feed' },
    ],
  },
  {
    key: 'seo',
    title: 'Does search and link preview matter?',
    help: 'Crawlers and chat apps read the HTML they are given.',
    options: [
      { value: 'critical', label: 'Critical', hint: 'Organic traffic is the business' },
      { value: 'helpful', label: 'Helpful', hint: 'Nice to have' },
      { value: 'none', label: 'Not at all', hint: 'Behind a login' },
    ],
  },
  {
    key: 'pages',
    title: 'How many unique URLs are there?',
    help: 'This decides whether you can pre-build all of them.',
    options: [
      { value: 'few', label: 'Under a thousand', hint: 'Docs, a marketing site' },
      { value: 'many', label: 'Thousands to 100k', hint: 'A catalogue or a big blog' },
      { value: 'huge', label: 'More than 100k', hint: 'Marketplaces, user profiles' },
    ],
  },
  {
    key: 'interaction',
    title: 'How interactive is it?',
    help: 'This is about how much code has to run in the browser.',
    options: [
      { value: 'reading', label: 'Mostly reading', hint: 'Articles, docs, listings' },
      { value: 'mixed', label: 'Content with interactive widgets', hint: 'A product page' },
      { value: 'app', label: 'An application', hint: 'Editors, boards, tools' },
    ],
  },
  {
    key: 'slow',
    title: 'Is any part of the page slow to load?',
    help: 'A third-party call, a heavy query, a recommendation service.',
    options: [
      { value: 'no', label: 'No, everything is quick', hint: 'Under about 300 ms' },
      { value: 'yes', label: 'Yes, at least one part', hint: 'Often a second or more' },
    ],
  },
  {
    key: 'hosting',
    title: 'Where will it run?',
    help: 'Some strategies need code running on a server.',
    options: [
      { value: 'static', label: 'Static hosting only', hint: 'S3, GitHub Pages, a plain CDN' },
      { value: 'server', label: 'Servers or serverless are fine', hint: 'Node, Vercel, containers' },
    ],
  },
];

type Rule = {
  [K in keyof Answers]?: Partial<Record<Answers[K], Partial<Record<StrategyId, [number, string?]>>>>;
};

const RULES: Rule = {
  change: {
    rare: {
      ssg: [25, 'The data rarely changes, so a build is all the freshness you need.'],
      isr: [10],
      ssr: [-12, 'Rendering on every request is wasted work when nothing changes.'],
      stream: [-8],
    },
    daily: {
      ssg: [8],
      isr: [22, 'Content changes through the day, which is exactly what time or webhook revalidation is for.'],
      ppr: [5],
    },
    minutes: {
      ssg: [-28, 'A rebuild every few minutes is not realistic for a static build.'],
      isr: [12, 'A short revalidate window keeps pages fresh without rendering every view.'],
      ssr: [8],
      stream: [8],
      rsc: [8],
      ppr: [10],
      csr: [5],
    },
    live: {
      ssg: [-40, 'Static pages cannot be current. They are frozen at build time.'],
      isr: [-22, 'Even a short revalidate window means some visitors see old data.'],
      csr: [15, 'Fetching on every visit is always current.'],
      ssr: [20, 'Rendering per request guarantees fresh data.'],
      stream: [20],
      rsc: [15],
      ppr: [10, 'Dynamic holes stay live while the shell stays cached.'],
    },
  },
  who: {
    same: {
      ssg: [15, 'One version for everyone is the best case for pre-building.'],
      isr: [15],
      ppr: [-8, 'There is nothing personal to put in a dynamic hole.'],
    },
    some: {
      ssg: [-28, 'A static page cannot know who is looking, so personal parts fall back to the client.'],
      isr: [-22],
      ppr: [32, 'A shared shell with a few personal holes is the exact shape partial prerendering is for.'],
      stream: [12],
      rsc: [10],
    },
    everything: {
      ssg: [-40, 'Nothing here can be pre-built when everything depends on the user.'],
      isr: [-35, 'A shared cache cannot hold a page that differs for each visitor.'],
      ppr: [-12, 'The static shell would be nearly empty, so there is little to gain.'],
      csr: [15, 'Per-user data fits naturally in an app that fetches after login.'],
      ssr: [20],
      stream: [20],
      rsc: [20, 'The server already knows the user, so it can render the personal page directly.'],
    },
  },
  seo: {
    critical: {
      csr: [-48, 'Crawlers and link previews would receive an empty page.'],
      ssg: [10],
      isr: [10],
      ssr: [10],
      stream: [10],
      rsc: [10],
      ppr: [10],
    },
    helpful: {
      csr: [-20, 'Search and sharing would suffer without content in the HTML.'],
    },
    none: {
      csr: [22, 'Without a need for crawlers, server rendering buys much less.'],
      ssr: [-6],
      ssg: [-6],
      isr: [-6],
    },
  },
  pages: {
    few: {
      ssg: [10, 'A small site builds in seconds, so you can pre-build all of it.'],
    },
    many: {
      ssg: [-6],
      isr: [15, 'Thousands of pages are better generated on first request than at build.'],
      ppr: [5],
    },
    huge: {
      ssg: [-38, 'Building a hundred thousand pages takes hours, and most will never be visited.'],
      isr: [20, 'Pages are generated on demand, only the ones people actually ask for.'],
      ssr: [10],
      ppr: [10],
      csr: [5],
    },
  },
  interaction: {
    reading: {
      rsc: [15, 'Mostly reading means most components can stay on the server and never ship.'],
      ssg: [10],
      ppr: [10],
      csr: [-12, 'Content pages do not need a full client runtime to display text.'],
    },
    mixed: {
      rsc: [10],
      ppr: [10],
      stream: [5],
    },
    app: {
      csr: [28, 'An app that is interactive everywhere gains little from server-only components.'],
      rsc: [-5],
      ssg: [-12],
      isr: [-8],
      ppr: [-6],
    },
  },
  slow: {
    yes: {
      ssr: [-28, 'The first byte would wait for the slowest part of the page.'],
      stream: [26, 'A Suspense boundary lets the rest of the page appear without waiting for it.'],
      rsc: [14],
      ppr: [20, 'The slow part becomes a dynamic hole that streams in after the static shell.'],
      isr: [10, 'The cache hides the slowness from every visitor but the one who regenerates it.'],
      ssg: [5],
    },
    no: {
      stream: [-6, 'With nothing slow to defer, streaming has little to improve.'],
      ssr: [6],
    },
  },
};

export interface Verdict {
  id: StrategyId;
  /** Fit relative to the best available option: 100 for the top choice. For display. */
  score: number;
  /** Unclamped, used for ranking so strong fits do not tie at 100. */
  raw: number;
  blocked?: string;
  for: string[];
  against: string[];
}

const NEEDS_RUNTIME: StrategyId[] = ['isr', 'ssr', 'stream', 'rsc', 'ppr'];

export function recommend(a: Answers): Verdict[] {
  const ids: StrategyId[] = ['csr', 'ssg', 'isr', 'ssr', 'stream', 'rsc', 'ppr'];
  const verdicts: Verdict[] = ids.map((id) => ({ id, score: 50, raw: 50, for: [], against: [] }));
  const byId = Object.fromEntries(verdicts.map((v) => [v.id, v])) as Record<StrategyId, Verdict>;

  for (const key of Object.keys(a) as (keyof Answers)[]) {
    const table = (RULES[key] as Record<string, Partial<Record<StrategyId, [number, string?]>>> | undefined)?.[a[key]];
    if (!table) continue;
    for (const [id, entry] of Object.entries(table) as [StrategyId, [number, string?]][]) {
      const [delta, why] = entry;
      byId[id].raw += delta;
      if (why) (delta > 0 ? byId[id].for : byId[id].against).push(why);
    }
  }

  if (a.hosting === 'static') {
    for (const id of NEEDS_RUNTIME) {
      byId[id].blocked = 'Needs code running on a server, which static hosting cannot do.';
    }
  }

  const available = verdicts.filter((v) => !v.blocked);
  const topRaw = Math.max(...(available.length ? available : verdicts).map((v) => v.raw));
  for (const v of verdicts) v.score = v.blocked || topRaw <= 0 ? 0 : Math.max(0, Math.round((v.raw / topRaw) * 100));
  return verdicts.sort((x, y) => {
    if (!!x.blocked !== !!y.blocked) return x.blocked ? 1 : -1;
    return y.raw - x.raw;
  });
}

export const SWITCH_IF: Record<StrategyId, string> = {
  csr: 'Move to server rendering as soon as the page has to rank, or first paint starts to cost you conversions.',
  ssg: 'Move to ISR when content has to change between deploys, or PPR when a few parts become personal.',
  isr: 'Move to PPR when a price, cart or greeting needs to be per-user. Move to SSR when stale data is unacceptable.',
  ssr: 'Add Suspense boundaries as soon as one part of the page is slower than the rest.',
  stream: 'Move the JavaScript off the client with Server Components once hydration becomes the bottleneck.',
  rsc: 'Pre-render the stable parts with PPR if time to first byte matters more than per-request freshness.',
  ppr: 'Fall back to ISR if your host cannot stitch a static shell to a streamed response.',
};

export const DEFAULT_ANSWERS: Answers = {
  change: 'daily',
  who: 'some',
  seo: 'critical',
  pages: 'many',
  interaction: 'mixed',
  slow: 'yes',
  hosting: 'server',
};

export const ARCHETYPES: { name: string; answers: Answers }[] = [
  { name: 'Docs site', answers: { change: 'rare', who: 'same', seo: 'critical', pages: 'few', interaction: 'reading', slow: 'no', hosting: 'static' } },
  { name: 'E-commerce product page', answers: { change: 'minutes', who: 'some', seo: 'critical', pages: 'many', interaction: 'mixed', slow: 'yes', hosting: 'server' } },
  { name: 'Admin dashboard', answers: { change: 'live', who: 'everything', seo: 'none', pages: 'few', interaction: 'app', slow: 'yes', hosting: 'static' } },
  { name: 'Social feed', answers: { change: 'live', who: 'everything', seo: 'helpful', pages: 'huge', interaction: 'mixed', slow: 'yes', hosting: 'server' } },
  { name: 'Marketplace listings', answers: { change: 'minutes', who: 'same', seo: 'critical', pages: 'huge', interaction: 'reading', slow: 'no', hosting: 'server' } },
];

/** The lab setup that best matches a set of answers, so a recommendation can be tried out. */
export function labSetupFor(a: Answers): { personalized: boolean; slowMs: number; dataMs: number; jsKb: number; clientShare: number } {
  return {
    personalized: a.who !== 'same',
    slowMs: a.slow === 'yes' ? 1400 : 200,
    dataMs: a.change === 'live' ? 400 : 200,
    jsKb: a.interaction === 'app' ? 520 : a.interaction === 'mixed' ? 320 : 200,
    clientShare: a.interaction === 'app' ? 0.65 : a.interaction === 'mixed' ? 0.35 : 0.2,
  };
}

