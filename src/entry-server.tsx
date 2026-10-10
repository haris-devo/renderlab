import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

/** Render the whole page to a string. Used once, at build time, by scripts/prerender.mjs. */
export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
