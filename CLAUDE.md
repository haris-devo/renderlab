# renderlab

Interactive lab for frontend rendering strategies (CSR, SSG, ISR, SSR, streaming, RSC, PPR). Deployed to https://haris-devo.github.io/renderlab/ by `.github/workflows/pages.yml` on every push to `main`.

## Layout
- `src/engine/` is the logic and has no React: `simulate.ts` (timing model), `isr.ts` (cache state machine), `stream.ts` (streaming/PPR planner), `rsc.ts` (client/server boundary model), `decide.ts` (ranking), `explain.ts` (commentary), `strategies.ts` and `interview.ts` (content). Every engine has a `.test.ts`.
- `src/components/` is one component and one CSS file per section. Styles are plain CSS with tokens in `src/styles/global.css`; one hue per strategy (`--c-csr` ... `--c-ppr`).
- `scripts/prerender.mjs` renders the app into `dist/index.html` at build time; `src/main.tsx` hydrates it (or renders fresh on the dev server and on shared-link URLs, which carry a query string).

## Rules
- Content claims about Next.js must match the current docs. Check with Context7 before changing a code sample. Next 16 uses `cacheComponents`, `'use cache'`, `cacheLife`, `cacheTag`, `updateTag`, and `revalidateTag(tag, profile)`.
- A change to a timing constant in `simulate.ts` should keep `simulate.test.ts` green. The tests encode the lessons (for example, streaming moves first paint, not the main data). If a lesson changes, change the test on purpose.
- Grids need `grid-template-columns: minmax(0, 1fr)` or code blocks widen the page on phones. Check for horizontal overflow at 375 px.
- Dev server is the `renderlab` entry in `~/DEV/personal/.claude/launch.json` (port 5181). `renderlab-built` previews the production build at `/renderlab/`.
- Fonts are Google Sans Flex and Google Sans Code. "Google Sans Pro" is not a published font.
