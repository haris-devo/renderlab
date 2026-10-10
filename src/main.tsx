import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// The built page is prerendered, so hydrate it. Two cases cannot match the prerendered markup and
// render fresh instead: the dev server (nothing prerendered) and a shared link with its own setup.
if (root.hasChildNodes() && !location.search) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
}
