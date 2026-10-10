import type { StrategyId } from './types';

export interface Option {
  text: string;
  /** Why this option is right or wrong, shown after answering. */
  why: string;
}

export interface Case {
  id: string;
  title: string;
  prompt: string;
  facts: string[];
  options: Option[];
  /** Index of the best answer. */
  answer: number;
  /** The strategy this scenario is really about, for linking back to the lab. */
  topic: StrategyId;
  followUp: string;
}

export const CASES: Case[] = [
  {
    id: 'docs',
    title: 'A documentation site',
    prompt: 'You are building docs for an open-source library. What do you pick?',
    facts: ['About 400 pages', 'Updated when maintainers merge, a few times a week', 'Must rank on search', 'Hosted on a free static host'],
    options: [
      { text: 'Server-side rendering on every request', why: 'It would work, but you would pay for a server render of pages that change a few times a week, and the host cannot run one anyway.' },
      { text: 'Static generation, rebuilt on every merge', why: 'Right. Content is identical for everyone, changes on a deploy cadence and the host is static. Fastest and cheapest option.' },
      { text: 'Client-side rendering with an API', why: 'Crawlers and link previews would see an empty page, and every visitor pays for a bundle just to read text.' },
      { text: 'Partial prerendering', why: 'Nothing here is dynamic, so there are no holes to stream. It adds platform requirements for no benefit.' },
    ],
    answer: 1,
    topic: 'ssg',
    followUp: 'What changes if the docs grow to 80,000 pages with translations?',
  },
  {
    id: 'pdp',
    title: 'An e-commerce product page',
    prompt: 'Two million products. Prices change hourly. The page has a personal cart and a slow recommendations widget.',
    facts: ['SEO drives most traffic', 'Black Friday traffic is 50× normal', 'Cart and recommendations differ per visitor'],
    options: [
      { text: 'Server-side rendering for every view', why: 'Fresh, but a 50× spike lands entirely on your origin, and the slow widget delays every first byte.' },
      { text: 'Static generation of all two million pages', why: 'Builds would take hours, prices would be stale, and the cart still could not be pre-built.' },
      { text: 'Cache the product with a short lifetime, and stream the cart and recommendations as dynamic holes', why: 'Right. The shared part comes from the CDN, the origin only does per-visitor work, and the slow widget cannot block anything. This is the shape partial prerendering exists for.' },
      { text: 'Client-side rendering with skeletons', why: 'The product, the thing search engines index, would be missing from the HTML.' },
    ],
    answer: 2,
    topic: 'ppr',
    followUp: 'Your host does not support partial prerendering. What is the closest fallback?',
  },
  {
    id: 'dashboard',
    title: 'An internal analytics dashboard',
    prompt: 'A logged-in tool with live charts, filters and drag-and-drop widgets.',
    facts: ['Behind SSO', 'Used on desktops', 'Almost every component is interactive'],
    options: [
      { text: 'Static generation', why: 'There is nothing to pre-build: all the content depends on who is logged in and what they filter.' },
      { text: 'Incremental static regeneration', why: 'A shared cache cannot hold per-user pages, and there is no SEO to gain.' },
      { text: 'Client-side rendering, with route-level code splitting', why: 'Right. SEO does not matter, the app is interactive everywhere so Server Components would save little, and splitting keeps the first load small.' },
      { text: 'Blocking server-side rendering', why: 'Every navigation would wait on the server for pages nobody indexes, and hydration would still ship the whole app.' },
    ],
    answer: 2,
    topic: 'csr',
    followUp: 'Where would you still use a server component in this app?',
  },
  {
    id: 'news',
    title: 'A news homepage',
    prompt: 'Breaking news arrives every few minutes. Millions of anonymous readers hit the homepage.',
    facts: ['Anonymous traffic', 'A story must appear within a minute', 'Sudden traffic spikes'],
    options: [
      { text: 'Static generation, rebuilt hourly', why: 'Far too slow for breaking news.' },
      { text: 'Per-request server rendering with no caching', why: 'Fresh, but every reader costs a render and a spike would take the origin down.' },
      { text: 'A short revalidate window or on-demand revalidation from the newsroom tool', why: 'Right. The CDN absorbs the spike, readers always get an instant response, and a publish webhook can refresh the page within seconds.' },
      { text: 'Client-side rendering', why: 'Readers would stare at a blank page, and search engines would index nothing.' },
    ],
    answer: 2,
    topic: 'isr',
    followUp: 'An editor corrects a headline error. How do you make sure readers stop seeing the old version quickly?',
  },
  {
    id: 'feed',
    title: 'A personalised social feed',
    prompt: 'Every visitor sees a different feed. First paint must be fast, and posts are public so they should be indexable.',
    facts: ['Per-user data', 'A ranking service that takes about a second', 'Mid-range phones'],
    options: [
      { text: 'Static generation with client fetching', why: 'The per-user content would wait for hydration and then a fetch, so the part that matters arrives last.' },
      { text: 'Server rendering that waits for the ranking service', why: 'The first byte would be held for a second by the slowest dependency.' },
      { text: 'Streaming server rendering: shell first, the feed in a Suspense boundary', why: 'Right. The visitor sees structure at once, the ranking call overlaps with the shell travelling, and the feed arrives as soon as it is ready.' },
      { text: 'Incremental static regeneration', why: 'The cache would have to hold a separate page per user, which defeats it.' },
    ],
    answer: 2,
    topic: 'stream',
    followUp: 'How do you stop the skeleton from causing layout shift when the feed arrives?',
  },
  {
    id: 'dead-zone',
    title: 'It looks ready but nothing happens',
    prompt: 'Users on cheap phones tap “Add to cart” right after a server-rendered page appears, and nothing happens. What is going on, and what is the best fix?',
    facts: ['Server-rendered with a 500 KB bundle', 'Good LCP, bad INP on mid-range phones', 'Most of the page is static text'],
    options: [
      { text: 'The server is too slow, so add more instances', why: 'The HTML already arrived quickly. The delay is in the browser.' },
      { text: 'The page is visible before hydration finishes. Ship less client code by keeping static parts as Server Components', why: 'Right. This is the dead zone: handlers are attached only after the bundle has downloaded, run and hydrated. Sending less code to hydrate shrinks it directly.' },
      { text: 'Switch to client-side rendering', why: 'That removes the dead zone by showing nothing at all until everything is ready, which is a worse first impression.' },
      { text: 'Cache the HTML on the CDN', why: 'It is already fast. The problem is JavaScript execution on the device.' },
    ],
    answer: 1,
    topic: 'rsc',
    followUp: 'What can you do to make an early tap work even before hydration finishes?',
  },
  {
    id: 'slow-widget',
    title: 'One slow widget holds up the page',
    prompt: 'Your SSR product page takes 2.5 seconds to first byte. The profile shows the reviews service takes 2.3 s and everything else under 200 ms.',
    facts: ['Reviews are below the fold', 'The same data is needed for every visitor', 'The rest of the page is fast'],
    options: [
      { text: 'Wrap reviews in Suspense so the rest streams first', why: 'Right, and it is the smallest change. The shell and product appear immediately, and reviews stream in when ready.' },
      { text: 'Cache the whole page for an hour', why: 'It hides the problem for repeat views, but the first visitor after expiry still waits and the product data goes stale.' },
      { text: 'Fetch reviews on the client after load', why: 'It unblocks the first byte, but reviews would not be in the HTML and would only start loading after hydration.' },
      { text: 'Move the reviews service closer to the user', why: 'It might help, but the service is the slow part, not the distance. Fix the dependency or stop waiting for it.' },
    ],
    answer: 0,
    topic: 'stream',
    followUp: 'The product itself is now fast. What would you do about the reviews service being slow?',
  },
  {
    id: 'flash',
    title: 'A flash sale',
    prompt: 'A marketing email goes to two million people at 9:00. The landing page shows the offer and a countdown.',
    facts: ['Traffic goes from 10 to 20,000 requests per second', 'The page is the same for everyone', 'The countdown must be accurate'],
    options: [
      { text: 'Server-side rendering, scaled up in advance', why: 'It might survive, but it is the most expensive and fragile way to serve an identical page.' },
      { text: 'A static page from the CDN, with the countdown calculated on the client', why: 'Right. Zero origin work per view, and the countdown only needs the sale’s end time and the device clock.' },
      { text: 'Client-side rendering with an API for the offer', why: 'The API becomes the bottleneck at 20,000 requests per second, and the first paint is slower.' },
      { text: 'Streaming SSR with Suspense', why: 'Streaming helps with slow parts, not with load. Every view would still need a render.' },
    ],
    answer: 1,
    topic: 'ssg',
    followUp: 'The offer changes mid-sale. What do you do?',
  },
  {
    id: 'marketing-personal',
    title: 'A marketing page with one personal banner',
    prompt: 'The home page is identical for everyone except a banner that says “Welcome back, Sam” and a personalised offer.',
    facts: ['Currently fully static', 'The team wants the banner without losing speed', 'Highly cacheable otherwise'],
    options: [
      { text: 'Make the whole page server-rendered', why: 'You would give up a static page’s speed and scalability for one small piece.' },
      { text: 'Keep the page static and make the banner a dynamic hole', why: 'Right. The shell stays on the CDN and only the banner is rendered per visitor. A client-side fetch also works if you do not have partial prerendering.' },
      { text: 'Generate one static page per user', why: 'That is millions of pages, and they would go stale.' },
      { text: 'Drop the personalisation', why: 'A valid trade-off, but nobody asked for it and it is not necessary.' },
    ],
    answer: 1,
    topic: 'ppr',
    followUp: 'If you can only use client-side fetching for the banner, how do you avoid layout shift?',
  },
  {
    id: 'isr-stale',
    title: 'Why was the price wrong?',
    prompt: 'A page uses ISR with revalidate set to 60. An editor changes a price and, a minute later, a visitor still sees the old one. Why?',
    facts: ['The CMS updated at 10:00:00', 'Last regeneration was at 09:59:30', 'A visitor arrives at 10:01:00'],
    options: [
      { text: 'ISR is broken, because it should have refreshed within 60 seconds', why: 'It is working as designed. The window is a minimum age before a regeneration is allowed, not a guarantee.' },
      { text: 'The first request after the window is served the stale page and triggers the refresh; the next visitor sees the new one', why: 'Right. That is stale-while-revalidate. Use on-demand revalidation from the CMS webhook to remove the wait.' },
      { text: 'The CDN is caching it for longer than configured', why: 'Possible in some setups, but nothing here points to it. The behaviour is explained by the model alone.' },
      { text: 'The browser cached the HTML', why: 'The visitor is on a first visit in this scenario.' },
    ],
    answer: 1,
    topic: 'isr',
    followUp: 'The editor wants to see their change immediately after saving. Which API do you reach for?',
  },
  {
    id: 'rsc-boundary',
    title: 'Where should “use client” go?',
    prompt: 'A product tabs component needs state to switch tabs. One tab renders a long markdown description using a 35 KB parser.',
    facts: ['The tabs component needs useState', 'The parser is used only to render markdown', 'The page is mostly reading'],
    options: [
      { text: 'Put "use client" on the page', why: 'Everything underneath would be bundled, including data access that must stay on the server.' },
      { text: 'Make the tabs a client component, and pass the description in as children from a server component', why: 'Right. Children passed through the boundary are rendered on the server, so the parser never reaches the browser.' },
      { text: 'Import the description inside the tabs component', why: 'It works, but the import graph pulls the 35 KB parser into the client bundle.' },
      { text: 'Avoid Server Components entirely', why: 'A fair option for a fully interactive app, but this page is mostly reading, which is the best case for them.' },
    ],
    answer: 1,
    topic: 'rsc',
    followUp: 'How would you check that the parser is not in your client bundle?',
  },
  {
    id: 'seo-spa',
    title: 'The link preview is blank',
    prompt: 'You shared your product link in a chat app and the preview shows no title or image. The site is a client-rendered single page app.',
    facts: ['Title and meta tags are set by JavaScript', 'Search traffic is flat', 'The team is small'],
    options: [
      { text: 'Render the page, or at least its head and main content, on the server or at build time', why: 'Right. Crawlers and preview bots read the HTML they are given and most do not run your JavaScript.' },
      { text: 'Add more meta tags in the client', why: 'They are still set by JavaScript, so the bots still do not see them.' },
      { text: 'Make the bundle smaller', why: 'Helps real users, but does not change what a bot receives.' },
      { text: 'Use a faster CDN', why: 'Speed is not the problem. The HTML is empty.' },
    ],
    answer: 0,
    topic: 'ssr',
    followUp: 'If a full migration is too large, what is the smallest step that fixes link previews?',
  },
];

export const FRAMEWORK: { step: string; ask: string }[] = [
  { step: 'Who sees it', ask: 'Is the page the same for everyone, or does it depend on the visitor?' },
  { step: 'How fresh', ask: 'How wrong can the data be, and for how long, before it hurts?' },
  { step: 'How discoverable', ask: 'Do crawlers and link previews need the content in the HTML?' },
  { step: 'How big', ask: 'How many URLs, and how spiky is the traffic?' },
  { step: 'How heavy', ask: 'How much of the page is interactive, and what devices are in the audience?' },
  { step: 'Choose, then defend', ask: 'Name the strategy, say what you give up, and describe the fallback.' },
];
