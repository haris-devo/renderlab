import { useActiveSection } from '../lib/useInView';
import { Icon } from './ui';
import './nav.css';

const SECTIONS = [
  { id: 'lab', label: 'Lab' },
  { id: 'deep', label: 'How each works' },
  { id: 'isr', label: 'Cache clock' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'boundaries', label: 'Boundaries' },
  { id: 'decide', label: 'Decide' },
  { id: 'interview', label: 'Interview' },
];
const IDS = SECTIONS.map((s) => s.id);

export function Nav() {
  const active = useActiveSection(IDS);
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <a href="#top" className="nav-brand" aria-label="renderlab, back to top">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="#0d1a2c" />
            <rect x="6" y="9" width="12" height="3.4" rx="1.7" fill="#7aa2ff" />
            <rect x="11" y="14.3" width="15" height="3.4" rx="1.7" fill="#ff8fb1" />
            <rect x="8" y="19.6" width="9" height="3.4" rx="1.7" fill="#5fe0b0" />
          </svg>
          renderlab
        </a>
        <nav className="nav-links" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined}>
              {s.label}
            </a>
          ))}
        </nav>
        <a className="nav-gh" href="https://github.com/haris-devo/renderlab" target="_blank" rel="noreferrer" aria-label="Source on GitHub">
          {Icon.github}
        </a>
      </div>
    </header>
  );
}
