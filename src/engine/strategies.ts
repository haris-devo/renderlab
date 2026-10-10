import type { StrategyId } from './types';

export type NodeId = 'build' | 'browser' | 'cdn' | 'origin' | 'data';

export interface FlowStep {
  from: NodeId;
  to: NodeId;
  title: string;
  text: string;
}

export interface CodeVariant {
  label: string;
  file: string;
  code: string;
  note?: string;
}

export type CriterionId =
  | 'firstByte'
  | 'firstPaint'
  | 'interactive'
  | 'freshness'
  | 'personal'
  | 'seo'
  | 'scale'
  | 'simplicity';

export const CRITERIA: { id: CriterionId; name: string; hint: string }[] = [
  { id: 'firstByte', name: 'First byte', hint: 'How soon the browser hears anything back.' },
  { id: 'firstPaint', name: 'First paint', hint: 'How soon the visitor sees real content.' },
  { id: 'interactive', name: 'Interactive', hint: 'How soon taps and clicks work. Falls with every KB hydrated.' },
  { id: 'freshness', name: 'Freshness', hint: 'How current the data is when it is shown.' },
  { id: 'personal', name: 'Per-user', hint: 'How naturally it renders content that depends on the visitor.' },
  { id: 'seo', name: 'Crawlability', hint: 'Whether content is in the HTML a crawler receives.' },
  { id: 'scale', name: 'Cost at scale', hint: 'How little origin work a traffic spike causes.' },
  { id: 'simplicity', name: 'Simplicity', hint: 'How little infrastructure and framework knowledge it needs.' },
];

export interface StrategyMeta {
  id: StrategyId;
  name: string;
  /** Full name, spelled out. */
  full: string;
  tagline: string;
  summary: string;
  /** One line a senior engineer could say out loud. */
  say: string;
  steps: FlowStep[];
  bestFor: string[];
  avoid: string[];
  gotchas: string[];
  code: CodeVariant[];
  /** 1 (weak) to 4 (strong) per criterion. */
  ratings: Record<CriterionId, 1 | 2 | 3 | 4>;
  freshness: string;
  hosting: string;
}

export const STRATEGIES: StrategyMeta[] = [
  {
    id: 'csr',
    name: 'CSR',
    full: 'Client-side rendering',
    tagline: 'Ship an empty page and let the browser build it.',
    summary:
      'The server sends a near-empty HTML file and a JavaScript bundle. The browser runs the bundle, calls your API, then renders. Nothing meaningful is on screen until all three have happened, one after the other.',
    say: 'Pick it when the page is behind a login and SEO does not matter, then keep the bundle small and fetch in parallel.',
    steps: [
      { from: 'browser', to: 'cdn', title: 'Ask for the page', text: 'A plain GET. The CDN has one file for every route: index.html.' },
      { from: 'cdn', to: 'browser', title: 'Receive an empty shell', text: 'A div, a script tag and not much else. The screen stays blank.' },
      { from: 'browser', to: 'cdn', title: 'Download the bundle', text: 'The whole app, routes and all unless you split it. This is the long bar.' },
      { from: 'browser', to: 'browser', title: 'Run the JavaScript', text: 'Parse, compile, execute. On a slow phone this is the biggest cost on the page.' },
      { from: 'browser', to: 'origin', title: 'Fetch data from the API', text: 'Only now does the app learn what to show. This request could have started at the very beginning.' },
      { from: 'browser', to: 'browser', title: 'Render the result', text: 'The data comes back, React renders, pixels appear. Already interactive, because the code is already running.' },
    ],
    bestFor: ['Authenticated dashboards and admin tools', 'Highly interactive apps: editors, canvases, maps', 'Prototypes and internal tools on plain static hosting'],
    avoid: ['Public pages that need to rank or unfurl in chat apps', 'Landing pages where first paint decides conversion', 'Low-end devices on slow networks'],
    gotchas: [
      'Three sequential waits: HTML, then JS, then data. Preload the data call to break the chain.',
      'Crawlers that do not run JavaScript see an empty page, and link previews are blank.',
      'Bundles only grow. Without route splitting, the settings page costs every visitor the whole app.',
    ],
    code: [
      {
        label: 'Client component',
        file: 'app/product/[id]/page.tsx',
        code: `'use client';
import { use, useEffect, useState } from 'react';

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetch('/api/products/' + id)
      .then((res) => res.json())
      .then(setProduct);
  }, [id]);

  if (!product) return <ProductSkeleton />;
  return <ProductView product={product} />;
}`,
        note: 'Everything runs in the browser. The HTML that reaches the visitor has no product in it.',
      },
    ],
    ratings: { firstByte: 4, firstPaint: 1, interactive: 2, freshness: 4, personal: 4, seo: 1, scale: 4, simplicity: 4 },
    freshness: 'Live, fetched on every visit',
    hosting: 'Any static host',
  },
  {
    id: 'ssg',
    name: 'SSG',
    full: 'Static site generation',
    tagline: 'Render every page once, at build time.',
    summary:
      'A build step fetches data, renders each page to HTML and uploads files to a CDN. A visit is a file read at the nearest edge, so the first byte and first paint are as fast as the web gets. The cost moves to build time and to content that is only as fresh as the last build.',
    say: 'Pick it when content changes on a deploy cadence and is the same for everyone. It is the fastest and cheapest thing you can ship.',
    steps: [
      { from: 'build', to: 'data', title: 'Fetch everything at build time', text: 'The build asks your CMS or database for every page it needs.' },
      { from: 'build', to: 'cdn', title: 'Render to HTML and upload', text: 'Each route becomes a finished .html file on the CDN. No server is involved after this.' },
      { from: 'browser', to: 'cdn', title: 'Ask for the page', text: 'The nearest edge node answers from disk or memory.' },
      { from: 'cdn', to: 'browser', title: 'Receive finished HTML', text: 'Real content in the first response. The browser paints as soon as it has parsed the first packets.' },
      { from: 'browser', to: 'cdn', title: 'Download the bundle', text: 'Needed so the page can respond to input, not so it can show content.' },
      { from: 'browser', to: 'browser', title: 'Hydrate', text: 'React re-runs the components to attach event handlers. The page looks ready but ignores taps until this ends.' },
    ],
    bestFor: ['Docs, blogs, marketing sites, changelogs', 'Pages that are identical for every visitor', 'Traffic spikes, since the origin does nothing'],
    avoid: ['Content that changes every few minutes', 'Hundreds of thousands of pages, where builds take hours', 'Anything that depends on the visitor'],
    gotchas: [
      'Build time grows with page count. Past a few thousand pages, build only the popular ones and let the rest generate on demand.',
      'A price change means a rebuild and a deploy unless you add revalidation.',
      'Personalisation falls back to client fetching, which brings the CSR waterfall back for that part of the page.',
    ],
    code: [
      {
        label: 'Next.js 15 and 16',
        file: 'app/blog/[slug]/page.tsx',
        code: `export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  return <Article post={post} />;
}`,
        note: 'A route is static when nothing in it reads request data such as cookies or headers.',
      },
      {
        label: 'With Cache Components',
        file: 'lib/posts.ts',
        code: `import { cacheLife } from 'next/cache';

export async function getPost(slug: string) {
  'use cache';
  cacheLife('max');
  return db.post.findUnique({ where: { slug } });
}`,
        note: 'With cacheComponents on, you opt in to caching per function and the result lands in the prerendered shell.',
      },
    ],
    ratings: { firstByte: 4, firstPaint: 4, interactive: 2, freshness: 1, personal: 1, seo: 4, scale: 4, simplicity: 4 },
    freshness: 'Frozen at the last build',
    hosting: 'Any static host',
  },
  {
    id: 'isr',
    name: 'ISR',
    full: 'Incremental static regeneration',
    tagline: 'Static speed, with a timer or a webhook to refresh it.',
    summary:
      'Pages are served from a cache like SSG, but each cache entry has a lifetime. After it expires, the next visitor still gets the old page instantly while the server quietly rebuilds a fresh one. Pages that were never built are generated on first request.',
    say: 'Pick it for large catalogues and CMS content that changes, when a few seconds of staleness is acceptable and origin load must stay flat.',
    steps: [
      { from: 'browser', to: 'cdn', title: 'Ask for the page', text: 'Usually answered from cache, exactly like SSG.' },
      { from: 'cdn', to: 'browser', title: 'Serve the cached copy', text: 'Hit while fresh. Stale but still served once the revalidate window has passed.' },
      { from: 'cdn', to: 'origin', title: 'Regenerate in the background', text: 'The first request after expiry triggers one rebuild. Others in the meantime do not.' },
      { from: 'origin', to: 'data', title: 'Fetch the latest data', text: 'Only one render per page per window reaches your database, however much traffic arrives.' },
      { from: 'origin', to: 'cdn', title: 'Replace the cache entry', text: 'From now on visitors get the new version. Or call revalidate from a webhook to skip the wait.' },
    ],
    bestFor: ['Product and listing pages with large catalogues', 'CMS-driven content with editors publishing often', 'News archives and long-tail pages'],
    avoid: ['Anything where a stale page is wrong, such as stock levels at checkout', 'Per-user pages', 'Self-hosting several instances without a shared cache'],
    gotchas: [
      'revalidate: 60 is not "fresh within 60 seconds". The first visitor after expiry still sees the stale page.',
      'A cache miss is a full SSR render for that visitor. Pre-build your most popular paths.',
      'Self-hosted, every instance keeps its own cache unless you provide a shared cache handler.',
    ],
    code: [
      {
        label: 'Next.js 15 and 16',
        file: 'app/products/[id]/page.tsx',
        code: `// At most one regeneration per page every 60 seconds.
export const revalidate = 60;

export async function generateStaticParams() {
  const top = await getTopProducts(1000);
  return top.map((p) => ({ id: p.id }));
}

// app/api/revalidate/route.ts: refresh on demand from a CMS webhook
import { revalidateTag } from 'next/cache';
export async function POST(req: Request) {
  const { tag } = await req.json();
  revalidateTag(tag, 'max'); // Next 15 takes a single argument
  return Response.json({ ok: true });
}`,
      },
      {
        label: 'With Cache Components',
        file: 'lib/products.ts',
        code: `import { cacheLife, cacheTag } from 'next/cache';

export async function getProduct(id: string) {
  'use cache';
  cacheLife({ revalidate: 60 });
  cacheTag('product-' + id);
  return db.product.findUnique({ where: { id } });
}

// In a Server Action, expire it so the editor sees their own change:
// updateTag('product-' + id);`,
        note: 'route segment options like revalidate are replaced by cacheLife when cacheComponents is on.',
      },
    ],
    ratings: { firstByte: 4, firstPaint: 4, interactive: 2, freshness: 3, personal: 1, seo: 4, scale: 4, simplicity: 2 },
    freshness: 'At most one revalidate window stale',
    hosting: 'Needs a runtime or a platform that provides one',
  },
  {
    id: 'ssr',
    name: 'SSR',
    full: 'Server-side rendering, waiting for everything',
    tagline: 'Render fresh HTML on the server for every request.',
    summary:
      'Each request reaches your server, which fetches data, renders the whole page and only then sends the first byte. Content is always fresh and can depend on the visitor. The price is that every view costs a render, and the page is as slow as its slowest dependency.',
    say: 'Pick it when the page must be fresh or personal and indexable. Then stop it waiting on the slowest widget, which is what streaming is for.',
    steps: [
      { from: 'browser', to: 'origin', title: 'Ask for the page', text: 'The request passes through the CDN to your server. Nothing is cached.' },
      { from: 'origin', to: 'data', title: 'Fetch all the data', text: 'Queries run, ideally in parallel. The slowest one sets the pace.' },
      { from: 'origin', to: 'origin', title: 'Render the HTML', text: 'The full component tree becomes a string. Nothing leaves the server yet.' },
      { from: 'origin', to: 'browser', title: 'Send the first byte', text: 'Time to first byte now includes all of that work.' },
      { from: 'browser', to: 'cdn', title: 'Download the bundle', text: 'The same bundle CSR would have needed, now for hydration.' },
      { from: 'browser', to: 'browser', title: 'Hydrate', text: 'The page was visible earlier. It becomes usable only now.' },
    ],
    bestFor: ['Personalised pages that must be indexable', 'Search results and filtered listings', 'Content that must never be stale'],
    avoid: ['Pages with a slow third-party dependency in the critical path', 'Spiky public traffic with no CDN caching in front', 'Edge-less deployments far from your users'],
    gotchas: [
      'One slow query or widget delays the first byte for the whole page.',
      'Cold starts and origin distance land directly in time to first byte.',
      'Add Cache-Control: s-maxage with stale-while-revalidate for anonymous traffic, or the origin carries every view.',
    ],
    code: [
      {
        label: 'Next.js 15 and 16',
        file: 'app/dashboard/page.tsx',
        code: `import { cookies } from 'next/headers';

// Reading cookies opts the route into request-time rendering.
export default async function DashboardPage() {
  const session = (await cookies()).get('session')?.value;
  const [user, stats] = await Promise.all([getUser(session), getStats(session)]);
  return <Dashboard user={user} stats={stats} />;
}`,
        note: 'Promise.all matters: sequential awaits would stack the latencies instead of overlapping them.',
      },
    ],
    ratings: { firstByte: 1, firstPaint: 2, interactive: 2, freshness: 4, personal: 4, seo: 4, scale: 1, simplicity: 2 },
    freshness: 'Live, rendered per request',
    hosting: 'Node server, serverless or edge runtime',
  },
  {
    id: 'stream',
    name: 'Streaming SSR',
    full: 'Streaming server rendering with Suspense',
    tagline: 'Send the shell now, stream the slow parts as they resolve.',
    summary:
      'The server flushes the layout and loading placeholders at once, then streams each Suspense boundary into the page the moment its data is ready. The visitor sees structure immediately, the browser starts downloading JavaScript early, and a slow widget no longer holds everything hostage.',
    say: 'Pick it when SSR is right but one slow part drags the whole page. Wrap that part in Suspense and the rest no longer waits.',
    steps: [
      { from: 'browser', to: 'origin', title: 'Ask for the page', text: 'Same request as SSR.' },
      { from: 'origin', to: 'origin', title: 'Render only the shell', text: 'Layout, navigation and fallbacks. Fast, because it needs no slow data.' },
      { from: 'origin', to: 'browser', title: 'Flush the shell', text: 'First byte arrives early. The browser paints placeholders and discovers the script tags.' },
      { from: 'origin', to: 'data', title: 'Fetch in parallel', text: 'Every boundary starts its query at once, while the shell is already travelling.' },
      { from: 'origin', to: 'browser', title: 'Stream each boundary', text: 'A chunk plus a tiny inline script swaps the placeholder for the real content, in the same HTTP response.' },
      { from: 'browser', to: 'browser', title: 'Hydrate selectively', text: 'React hydrates what has arrived first, and prioritises what the visitor interacts with.' },
    ],
    bestFor: ['Pages with one or two slow widgets: reviews, recommendations, ads', 'Personalised feeds', 'Anything where SSR felt slow'],
    avoid: ['Pages where every part depends on the same slow query', 'Cases that need to set status codes or redirects late', 'Streaming through proxies that buffer responses'],
    gotchas: [
      'The status code and headers are sent with the first flush. A 404 discovered later cannot change them.',
      'A region that is not wrapped in Suspense still blocks the shell.',
      'Fallbacks that do not match the final size cause layout shift.',
    ],
    code: [
      {
        label: 'Next.js 15 and 16',
        file: 'app/product/[id]/page.tsx',
        code: `import { Suspense } from 'react';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Header />
      <Suspense fallback={<HeroSkeleton />}>
        <Hero id={id} />
      </Suspense>
      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews id={id} />   {/* slow, but nobody waits for it */}
      </Suspense>
    </>
  );
}

async function Reviews({ id }: { id: string }) {
  const reviews = await getReviews(id);
  return <ReviewList reviews={reviews} />;
}`,
      },
    ],
    ratings: { firstByte: 3, firstPaint: 3, interactive: 2, freshness: 4, personal: 4, seo: 4, scale: 1, simplicity: 2 },
    freshness: 'Live, rendered per request',
    hosting: 'Runtime that supports streaming responses',
  },
  {
    id: 'rsc',
    name: 'RSC',
    full: 'React Server Components',
    tagline: 'Components that run only on the server and never ship.',
    summary:
      'Server Components render on the server and send a compact description of their output instead of their code. Only components that need state or event handlers, marked with "use client", are bundled and hydrated. Heavy libraries used for rendering never reach the browser.',
    say: 'Pick it to cut the JavaScript the browser must run. The whole skill is deciding where the use client boundary goes, and pushing it down to the leaves.',
    steps: [
      { from: 'browser', to: 'origin', title: 'Ask for the page', text: 'A normal request. The framework handles the rest.' },
      { from: 'origin', to: 'data', title: 'Read data where it is used', text: 'Server Components query the database or an internal service directly. No public API layer is needed.' },
      { from: 'origin', to: 'origin', title: 'Render the server tree', text: 'Output is HTML for the first paint plus a flight payload that describes the tree.' },
      { from: 'origin', to: 'browser', title: 'Stream both', text: 'Client components appear in the payload as references to files, not as markup.' },
      { from: 'browser', to: 'cdn', title: 'Download only the islands', text: 'The bundle contains client components and the React runtime, nothing else.' },
      { from: 'browser', to: 'browser', title: 'Hydrate the islands', text: 'Less code to run and less tree to re-render. Later navigations fetch only a payload.' },
    ],
    bestFor: ['Content-heavy pages with a few interactive widgets', 'Pages that format or parse a lot: markdown, dates, syntax highlighting', 'Teams that want data access next to the component that uses it'],
    avoid: ['Apps that are almost entirely interactive', 'Teams without a framework that supports it', 'Code that needs browser APIs on every component'],
    gotchas: [
      '"use client" is contagious: everything a client component imports joins the bundle. Keep boundaries at the leaves.',
      'Props crossing the boundary must be serialisable. Functions and class instances cannot cross.',
      'Mark secrets and database code with server-only so an import mistake fails the build, not production.',
    ],
    code: [
      {
        label: 'Server and client',
        file: 'app/product/[id]/page.tsx',
        code: `// Server Component by default: no hooks, no handlers, zero bytes of JS sent.
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await db.product.findUnique({ where: { id } });

  return (
    <>
      <ProductInfo product={product} />   {/* server: heavy formatting stays here */}
      <AddToCart sku={product.sku} />      {/* client island: the only JS we send */}
    </>
  );
}

// components/AddToCart.tsx
'use client';
import { useTransition } from 'react';

export function AddToCart({ sku }: { sku: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => addToCart(sku))}>
      Add to cart
    </button>
  );
}`,
      },
    ],
    ratings: { firstByte: 3, firstPaint: 3, interactive: 3, freshness: 4, personal: 4, seo: 4, scale: 2, simplicity: 2 },
    freshness: 'Live, or cached per component',
    hosting: 'A framework with RSC support and a runtime',
  },
  {
    id: 'ppr',
    name: 'PPR',
    full: 'Partial prerendering',
    tagline: 'A static shell from the CDN with dynamic holes streamed in.',
    summary:
      'One route is split in two. The parts that do not depend on the request are prerendered into a static shell that the CDN serves instantly. The parts that do are holes marked with Suspense, rendered on the server in parallel and streamed into the same response.',
    say: 'Pick it for pages that are mostly the same for everyone with a few personal or live pieces. You stop choosing between static and dynamic for the whole page.',
    steps: [
      { from: 'build', to: 'cdn', title: 'Prerender the shell', text: 'At build time everything outside a Suspense hole becomes static HTML on the CDN.' },
      { from: 'browser', to: 'cdn', title: 'Ask for the page', text: 'One request. The edge starts two things at once.' },
      { from: 'cdn', to: 'browser', title: 'Send the shell immediately', text: 'First byte and first paint behave like SSG, even for a page that has personal content.' },
      { from: 'cdn', to: 'origin', title: 'Resume dynamic rendering', text: 'In parallel, the origin renders the holes: the cart, the price for this user, live stock.' },
      { from: 'origin', to: 'data', title: 'Fetch per-request data', text: 'Only the dynamic parts hit your database. The shell never did.' },
      { from: 'origin', to: 'browser', title: 'Stream the holes in', text: 'Same response, no second request. Then hydrate only the client components.' },
    ],
    bestFor: ['Product pages with a personal price or cart', 'Home pages with one personalised row', 'Anything you would have made fully dynamic for one small reason'],
    avoid: ['Fully static or fully personal pages, where it adds nothing', 'Hosts that cannot stitch a static shell to a streamed response', 'Teams that cannot yet reason about caching boundaries'],
    gotchas: [
      'Reading cookies, headers or uncached data outside Suspense is a build error. That is the framework protecting the shell.',
      'The shell is only as large as you let it be. One cookie read in the layout turns the page back into SSR.',
      'Next 15 had this behind experimental.ppr. Next 16 folded it into cacheComponents, so check which model your version uses.',
    ],
    code: [
      {
        label: 'Next.js 16',
        file: 'next.config.ts',
        code: `import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;`,
      },
      {
        label: 'Static shell, dynamic hole',
        file: 'app/product/[id]/page.tsx',
        code: `import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { cacheLife, cacheTag } from 'next/cache';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Product id={id} />                     {/* cached: part of the static shell */}
      <Suspense fallback={<CartSkeleton />}>
        <Cart />                              {/* reads cookies: a dynamic hole */}
      </Suspense>
    </>
  );
}

async function Product({ id }: { id: string }) {
  'use cache';
  cacheLife('hours');
  cacheTag('product-' + id);
  return <ProductView product={await getProduct(id)} />;
}

async function Cart() {
  const cartId = (await cookies()).get('cart')?.value;
  return <CartView items={await getCart(cartId)} />;
}`,
      },
    ],
    ratings: { firstByte: 4, firstPaint: 4, interactive: 3, freshness: 3, personal: 3, seo: 4, scale: 3, simplicity: 1 },
    freshness: 'Shell cached, holes live',
    hosting: 'Platform that serves a static shell and streams the rest',
  },
];

export const STRATEGY_BY_ID = Object.fromEntries(STRATEGIES.map((s) => [s.id, s])) as Record<StrategyId, StrategyMeta>;

export const GLOSSARY: { term: string; plain: string }[] = [
  { term: 'TTFB', plain: 'Time to first byte. How long until the first piece of the response arrives. It includes any server work done before sending.' },
  { term: 'FCP', plain: 'First contentful paint. The first moment anything real is drawn: text, an image, a skeleton.' },
  { term: 'LCP', plain: 'Largest contentful paint. When the biggest element in the viewport is drawn. Usually the hero image or headline.' },
  { term: 'TTI', plain: 'Time to interactive. The point where the main content responds to taps. This site measures it as the end of hydration.' },
  { term: 'INP', plain: 'Interaction to next paint. How long the page takes to react to a tap. Hydration delays the first tap.' },
  { term: 'Hydration', plain: 'React re-running your components in the browser to attach handlers to HTML that the server already produced.' },
  { term: 'Flight payload', plain: 'The compact stream that describes the output of Server Components, including references to client components.' },
  { term: 'Stale-while-revalidate', plain: 'Serve the old copy immediately, refresh it in the background, and let the next visitor have the new one.' },
  { term: 'Suspense boundary', plain: 'A place where React can show a fallback while a part of the tree waits for data.' },
  { term: 'Dead zone', plain: 'The time between a page looking ready and actually responding. This lab calls it out because it is the cost of SSR and SSG that is easiest to miss.' },
];
