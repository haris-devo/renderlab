export type Need = 'none' | 'state' | 'handlers' | 'data';

export interface RscNode {
  id: string;
  name: string;
  /** What this component does, in the tree's own words. */
  does: string;
  need: Need;
  /** Gzipped JavaScript this component and its own dependencies cost if shipped to the browser. */
  kb: number;
  /** A heavy dependency worth calling out. */
  dep?: string;
  /** Body of the component, used to show what the file looks like. */
  body: string;
  children: RscNode[];
}

export const RUNTIME_KB = 45;

export type Lock = 'client' | 'server' | 'free';

export function lockOf(n: RscNode): Lock {
  if (n.need === 'state' || n.need === 'handlers') return 'client';
  if (n.need === 'data') return 'server';
  return 'free';
}

export const LOCK_REASON: Record<Need, string> = {
  state: 'Uses state, so it must run in the browser.',
  handlers: 'Attaches event handlers, so it must run in the browser.',
  data: 'Reads the database or secrets directly, so it must stay on the server.',
  none: 'Pure rendering. It can run on either side.',
};

const n = (
  id: string,
  name: string,
  need: Need,
  kb: number,
  does: string,
  body: string,
  children: RscNode[] = [],
  dep?: string,
): RscNode => ({ id, name, need, kb, does, body, children, dep });

export const PRODUCT_TREE: RscNode = n(
  'page', 'ProductPage', 'data', 3,
  'Loads the product from the database.',
  `const product = await db.product.findUnique({ where: { id } });
return <main>…</main>;`,
  [
    n('header', 'Header', 'none', 4, 'Logo and navigation links.', `return <header><Logo /><Nav /></header>;`, [
      n('search', 'SearchBox', 'state', 12, 'Type-ahead suggestions.', `const [q, setQ] = useState('');
return <input value={q} onChange={(e) => setQ(e.target.value)} />;`),
      n('cartbadge', 'CartBadge', 'handlers', 5, 'Opens the cart drawer.', `return <button onClick={openCart}>Cart</button>;`),
    ]),
    n('gallery', 'Gallery', 'state', 6, 'Tracks which image is selected.', `const [index, setIndex] = useState(0);
return <div>{children}</div>;`, [
      n('zoom', 'ImageZoom', 'handlers', 9, 'Zoom on hover or pinch.', `return <img onMouseMove={track} onClick={zoom} />;`),
    ]),
    n('info', 'ProductInfo', 'data', 3, 'Reads price and stock.', `const { price, stock } = await getOffer(id);
return <section>…</section>;`, [
      n('price', 'Price', 'none', 30, 'Formats money for the visitor’s locale.', `return <span>{formatMoney(amount, currency)}</span>;`, [], 'currency library, 28 KB'),
      n('addtocart', 'AddToCart', 'state', 7, 'Quantity picker and button.', `const [qty, setQty] = useState(1);
return <button onClick={() => add(sku, qty)}>Add</button>;`),
    ]),
    n('tabs', 'DetailsTabs', 'state', 4, 'Switches between Description and Specs.', `const [tab, setTab] = useState('description');
return <div role="tablist">{children}</div>;`, [
      n('desc', 'Description', 'none', 38, 'Renders the markdown description.', `return <div dangerouslySetInnerHTML={{ __html: marked(text) }} />;`, [], 'markdown parser, 35 KB'),
      n('specs', 'SpecsTable', 'none', 9, 'Formats the specification table.', `return <table>{rows.map(formatRow)}</table>;`),
    ]),
    n('reviews', 'Reviews', 'data', 4, 'Loads reviews from the database.', `const reviews = await getReviews(id);
return <section>…</section>;`, [
      n('reviewlist', 'ReviewList', 'none', 20, 'Formats dates and ratings.', `return reviews.map((r) => <li>{format(r.date, 'PP')}</li>);`, [], 'date library, 18 KB'),
      n('reviewform', 'ReviewForm', 'state', 10, 'Controlled form with validation.', `const [text, setText] = useState('');
return <form>…</form>;`),
    ]),
    n('recs', 'Recommendations', 'data', 3, 'Asks the recommendation service.', `const items = await recommend(id);
return <section>…</section>;`, [
      n('carousel', 'Carousel', 'handlers', 14, 'Swipeable row of cards.', `return <div onTouchMove={drag} onWheel={scroll}>{children}</div>;`, [
        n('card', 'ProductCard', 'none', 11, 'One card: image, title, price.', `return <article><img /><h3>{title}</h3></article>;`),
      ]),
    ]),
  ],
);

export interface Choice {
  /** Free components the developer explicitly marked "use client". */
  forced: Record<string, boolean>;
  /** Components passed as children from a server parent, so they stay on the server. */
  slotted: Record<string, boolean>;
}

export type Why = 'locked-client' | 'locked-server' | 'chosen' | 'pulled' | 'slotted' | 'default';

export interface Placement {
  id: string;
  side: 'client' | 'server';
  why: Why;
  /** For "pulled" nodes: the nearest client ancestor that imports it. */
  via?: string;
}

export interface RscResult {
  placement: Record<string, Placement>;
  clientKb: number;
  baselineKb: number;
  savedKb: number;
  savedPct: number;
  clientCount: number;
  serverCount: number;
  /** Share of the app code (excluding the runtime) that stays on the client. */
  clientShare: number;
}

export function flatten(root: RscNode): RscNode[] {
  return [root, ...root.children.flatMap(flatten)];
}

export function compute(root: RscNode, choice: Choice): RscResult {
  const placement: Record<string, Placement> = {};

  const walk = (node: RscNode, parentClient: string | null) => {
    const lock = lockOf(node);
    let side: Placement['side'];
    let why: Why;
    let via: string | undefined;

    if (lock === 'client') {
      side = 'client';
      why = 'locked-client';
    } else if (lock === 'server') {
      side = 'server';
      why = 'locked-server';
    } else if (choice.forced[node.id]) {
      side = 'client';
      why = 'chosen';
    } else if (parentClient) {
      if (choice.slotted[node.id]) {
        side = 'server';
        why = 'slotted';
      } else {
        side = 'client';
        why = 'pulled';
        via = parentClient;
      }
    } else {
      side = 'server';
      why = 'default';
    }

    placement[node.id] = { id: node.id, side, why, via };
    const nextParent = side === 'client' ? (why === 'pulled' ? (via ?? node.id) : node.id) : null;
    for (const c of node.children) walk(c, nextParent);
  };
  walk(root, null);

  const all = flatten(root);
  const appKb = all.reduce((sum, x) => sum + x.kb, 0);
  const clientApp = all.filter((x) => placement[x.id].side === 'client').reduce((sum, x) => sum + x.kb, 0);
  const clientCount = all.filter((x) => placement[x.id].side === 'client').length;
  const baselineKb = RUNTIME_KB + appKb;
  const clientKb = RUNTIME_KB + clientApp;
  return {
    placement,
    clientKb,
    baselineKb,
    savedKb: baselineKb - clientKb,
    savedPct: 1 - clientKb / baselineKb,
    clientCount,
    serverCount: all.length - clientCount,
    clientShare: appKb === 0 ? 0 : clientApp / appKb,
  };
}

export const PRESETS: { id: string; name: string; hint: string; choice: (root: RscNode) => Choice }[] = [
  {
    id: 'client-first',
    name: 'Everything client-side',
    hint: 'Every component that can ship, does. This is roughly what a client-rendered build costs.',
    choice: (root) => ({
      forced: Object.fromEntries(flatten(root).filter((x) => lockOf(x) === 'free').map((x) => [x.id, true])),
      slotted: {},
    }),
  },
  {
    id: 'too-high',
    name: 'Boundaries too high',
    hint: 'Someone added "use client" to silence an error and dragged heavy components along.',
    choice: () => ({ forced: { header: true, price: true }, slotted: {} }),
  },
  {
    id: 'imports',
    name: 'Plain imports',
    hint: 'Only what needs state or handlers is a client component, but tabs and the carousel import their content.',
    choice: () => ({ forced: {}, slotted: {} }),
  },
  {
    id: 'optimal',
    name: 'Children as slots',
    hint: 'The same boundaries, but content is passed in as children so it stays on the server.',
    choice: () => ({ forced: {}, slotted: { desc: true, specs: true, card: true } }),
  },
];

export function sourceFor(node: RscNode, side: 'client' | 'server', imports: string[]): string {
  const directive = side === 'client' ? `'use client';\n` : '';
  const head = imports.length ? imports.join('\n') + '\n\n' : '';
  const asyncKw = side === 'server' && node.need === 'data' ? 'async ' : '';
  const body = node.body
    .split('\n')
    .map((line) => '  ' + line)
    .join('\n');
  return `${directive}${head}export ${asyncKw}function ${node.name}() {\n${body}\n}`;
}

export function importsFor(node: RscNode, side: 'client' | 'server'): string[] {
  const list: string[] = [];
  if (node.need === 'state') list.push(`import { useState } from 'react';`);
  if (node.dep) list.push(`import ${node.dep.split(',')[0].replace(/ /g, '_')} from '…'; // ${node.dep}`);
  if (node.need === 'data' && side === 'server') list.push(`import 'server-only';`);
  return list;
}
