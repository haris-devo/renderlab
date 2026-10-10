import type { ReactNode } from 'react';

const KEYWORDS =
  'import|export|from|default|async|await|function|const|let|return|if|else|new|type|interface|as|typeof|for|of|in|null|true|false';

const RE = new RegExp(
  [
    String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/)`, // 1 comment
    String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`, // 2 string
    String.raw`\b(${KEYWORDS})\b`, // 3 keyword
    String.raw`(<\/?[A-Z][\w.]*|\b[A-Za-z_$][\w$]*(?=\())`, // 4 function or component
    String.raw`\b(\d[\d_.]*)\b`, // 5 number
  ].join('|'),
  'g',
);

/** A very small TypeScript/TSX highlighter. Enough for the snippets on this site. */
export function highlight(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of src.matchAll(RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(src.slice(last, i));
    let cls = 'tk-n';
    if (m[1]) cls = 'tk-c';
    else if (m[2]) cls = /^['"]use /.test(m[2]) ? 'tk-d' : 'tk-s';
    else if (m[3]) cls = 'tk-k';
    else if (m[4]) cls = 'tk-f';
    out.push(
      <span key={key++} className={cls}>
        {m[0]}
      </span>,
    );
    last = i + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}
