/**
 * Markdown.tsx — Minimal markdown → React renderer for the in-app rules modal.
 *
 * Hand-rolled (no new dependency). Supports a deliberately small subset:
 *   - `## Section` and `### Subsection` headings
 *   - `-` bullet items (top-level and indented)
 *   - `1.`-style numbered items
 *   - plain paragraphs (multi-line wrapped)
 *   - inline `**bold**`, `*italic*`, `` `code` ``
 *
 * The renderer also auto-colors the words **RED**, **BLACK**, and **Thanni**
 * (case-sensitive, word-boundaried) so the .md file stays clean and the
 * visual styling matches the rest of the app.
 */

import type { ReactNode } from 'react';

type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'bullet'; text: string; level: 0 | 1 }
  | { kind: 'numbered'; n: number; text: string }
  | { kind: 'para'; text: string };

/** Parse the markdown source into a flat list of blocks. */
function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // Skip HTML comment lines (e.g. the leading <!-- ... --> preamble).
    if (/^\s*<!--[\s\S]*?-->\s*$/.test(line)) { i++; continue; }
    if (line.startsWith('## ')) { blocks.push({ kind: 'h2', text: line.slice(3).trim() }); i++; continue; }
    if (line.startsWith('### ')) { blocks.push({ kind: 'h3', text: line.slice(4).trim() }); i++; continue; }
    if (line.startsWith('- ')) { blocks.push({ kind: 'bullet', text: line.slice(2).trim(), level: 0 }); i++; continue; }
    // Indented bullet/sub-bullet: two leading spaces then dash or en-dash.
    const subMatch = line.match(/^  [-–]\s+(.*)/);
    if (subMatch) { blocks.push({ kind: 'bullet', text: subMatch[1].trim(), level: 1 }); i++; continue; }
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) { blocks.push({ kind: 'numbered', n: parseInt(numMatch[1], 10), text: numMatch[2].trim() }); i++; continue; }
    // Plain paragraph (merge consecutive non-special lines until a blank/special line).
    let text = line.trim();
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !/^\s*<!--[\s\S]*?-->\s*$/.test(lines[i])
    ) {
      text += ' ' + lines[i].trim();
      i++;
    }
    blocks.push({ kind: 'para', text });
  }
  return blocks;
}

/** Auto-color keywords (RED / BLACK / Thanni) within a plain text chunk. */
function coloredPlain(text: string, keyBase: string): ReactNode {
  const parts = text.split(/(\bRED\b|\bBLACK\b|\bThanni\b)/g);
  if (parts.length === 1) return text;
  return parts.map((p, i) => {
    if (p === 'RED') return <strong key={`${keyBase}-r${i}`} className="font-bold text-red-400">RED</strong>;
    if (p === 'BLACK') return <strong key={`${keyBase}-b${i}`} className="font-bold text-gray-200">BLACK</strong>;
    if (p === 'Thanni') return <strong key={`${keyBase}-t${i}`} className="font-bold text-purple-300">Thanni</strong>;
    return p || null;
  });
}

/** Render inline markdown: **bold**, *italic*, `code`, plus keyword auto-coloring. */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Note: italic (`*foo*`) must run AFTER bold (`**foo**`) to avoid mis-tokenizing.
  // The combined regex below prefers the leftmost match; for `**bold**` chunks
  // bold wins because the double-asterisk comes first in the alternation.
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(coloredPlain(text.slice(last, m.index), `${keyBase}-p${k}`));
    if (m[1] !== undefined) {
      // Bold text. We want to avoid nested <strong><strong>RED</strong></strong>
      // when the bolded content is — or begins with — one of the auto-colored
      // keywords (RED / BLACK / Thanni). Strategy: if the bolded chunk is *exactly*
      // a keyword, render only the colored strong. Otherwise wrap the recursive
      // rendering in a non-color strong (text-white), letting any nested
      // keyword-color strongs win visually.
      const inner = m[1];
      if (inner === 'RED' || inner === 'BLACK' || inner === 'Thanni') {
        out.push(coloredPlain(inner, `${keyBase}-k${k}`));
      } else {
        out.push(<strong key={`${keyBase}-b${k}`} className="font-bold text-white">{renderInline(inner, `${keyBase}-bi${k}`)}</strong>);
      }
    } else if (m[2] !== undefined) {
      out.push(<em key={`${keyBase}-i${k}`} className="italic">{renderInline(m[2], `${keyBase}-ii${k}`)}</em>);
    } else if (m[3] !== undefined) {
      out.push(
        <code key={`${keyBase}-c${k}`} className="bg-gray-800 px-1 rounded text-[11px] sm:text-xs text-yellow-200">
          {m[3]}
        </code>,
      );
    }
    last = re.lastIndex;
    k++;
  }
  if (last < text.length) out.push(coloredPlain(text.slice(last), `${keyBase}-tail`));
  return out;
}

/** Render a single block body (not the heading). */
function renderBody(b: Block, i: number): ReactNode {
  switch (b.kind) {
    case 'h3':
      return <h4 key={i} className="text-yellow-300 font-bold text-xs sm:text-sm mb-1">{b.text}</h4>;
    case 'bullet':
      return (
        <p key={i} className={b.level === 1 ? 'pl-4 text-gray-300 text-xs sm:text-sm' : 'text-gray-300 text-xs sm:text-sm'}>
          {b.level === 1 ? '– ' : '• '}{renderInline(b.text, `b${i}`)}
        </p>
      );
    case 'numbered':
      return (
        <p key={i} className="text-gray-300 text-xs sm:text-sm">
          <span className="font-bold text-yellow-400">{b.n}.</span>{' '}{renderInline(b.text, `n${i}`)}
        </p>
      );
    case 'para':
      return <p key={i} className="text-gray-300 text-xs sm:text-sm">{renderInline(b.text, `p${i}`)}</p>;
  }
}

/** Group blocks under `## Section` headings and render with section-level spacing. */
export function Markdown({ content }: { content: string }): ReactNode {
  const blocks = parseBlocks(content);
  // Group: every `h2` starts a new section; subsequent non-h2 blocks belong to it.
  const sections: { heading: string; body: Block[] }[] = [];
  let cur: { heading: string; body: Block[] } | null = null;
  for (const b of blocks) {
    if (b.kind === 'h2') {
      if (cur) sections.push(cur);
      cur = { heading: b.text, body: [] };
    } else if (cur) {
      cur.body.push(b);
    } else {
      // Pre-section block (no parent heading yet): synthesize an empty section.
      cur = { heading: '', body: [b] };
    }
  }
  if (cur) sections.push(cur);

  return (
    <div className="space-y-5">
      {sections.map((s, si) => (
        <div key={`s${si}`}>
          {s.heading && (
            <h3 className="text-yellow-400 font-bold text-sm sm:text-base mb-1">{s.heading}</h3>
          )}
          <div className="text-gray-300 text-xs sm:text-sm leading-relaxed space-y-1">
            {s.body.map((b, bi) => renderBody(b, si * 100 + bi))}
          </div>
        </div>
      ))}
    </div>
  );
}