'use client';

import React from 'react';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

// Parsing inline tokens (bold, italic, code, link, text) secara aman tanpa HTML injection
function renderInline(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // 1. Inline code: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      elements.push(
        <code
          key={`code-${keyIdx++}`}
          className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-xs border border-slate-200"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 2. Bold: **bold** or __bold__
    const boldMatch = remaining.match(/^(\*\*|__)(.*?)\1/);
    if (boldMatch) {
      elements.push(
        <strong key={`bold-${keyIdx++}`} className="font-bold text-slate-900">
          {renderInline(boldMatch[2])}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 3. Italic: *italic* or _italic_
    const italicMatch = remaining.match(/^(\*|_)(.*?)\1/);
    if (italicMatch) {
      elements.push(
        <em key={`italic-${keyIdx++}`} className="italic text-slate-800">
          {renderInline(italicMatch[2])}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 4. Strikethrough: ~~del~~
    const strikeMatch = remaining.match(/^~~(.*?)~~/);
    if (strikeMatch) {
      elements.push(
        <del key={`strike-${keyIdx++}`} className="line-through text-slate-400">
          {renderInline(strikeMatch[1])}
        </del>
      );
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // 5. Link: [label](url)
    const linkMatch = remaining.match(/^\[(.*?)\]\((.*?)\)/);
    if (linkMatch) {
      const label = linkMatch[1];
      const rawUrl = linkMatch[2].trim();
      // Validasi protokol URL yang aman (cegah javascript: data: vbscript:)
      const isSafeProtocol =
        rawUrl.startsWith('http://') ||
        rawUrl.startsWith('https://') ||
        rawUrl.startsWith('/');

      if (isSafeProtocol) {
        elements.push(
          <a
            key={`link-${keyIdx++}`}
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline font-medium"
          >
            {label}
          </a>
        );
      } else {
        // Jika protokol tidak aman, tampilkan teks label saja
        elements.push(<span key={`unsafe-link-${keyIdx++}`}>{label}</span>);
      }

      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // 6. Plain text sampai karakter spesial berikutnya
    const nextSpecial = remaining.search(/[`*_~\[]/);
    if (nextSpecial === -1) {
      elements.push(<span key={`text-${keyIdx++}`}>{remaining}</span>);
      break;
    } else if (nextSpecial === 0) {
      // Karakter bukan format yang cocok, ambil 1 karakter sebagai teks
      elements.push(<span key={`char-${keyIdx++}`}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
    } else {
      elements.push(
        <span key={`text-${keyIdx++}`}>{remaining.slice(0, nextSpecial)}</span>
      );
      remaining = remaining.slice(nextSpecial);
    }
  }

  return elements;
}

export function SafeMarkdown({ content, className = '' }: SafeMarkdownProps) {
  if (!content) return null;

  const lines = content.split('\n');
  const renderedNodes: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let currentListItems: React.ReactNode[] = [];
  let isOrderedList = false;

  const flushList = (key: number) => {
    if (currentListItems.length > 0) {
      if (isOrderedList) {
        renderedNodes.push(
          <ol
            key={`ol-${key}`}
            className="list-decimal pl-6 space-y-1 text-sm text-slate-700 my-2"
          >
            {currentListItems}
          </ol>
        );
      } else {
        renderedNodes.push(
          <ul
            key={`ul-${key}`}
            className="list-disc pl-6 space-y-1 text-sm text-slate-700 my-2"
          >
            {currentListItems}
          </ul>
        );
      }
      currentListItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Fenced Code Block: ```
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // Akhir code block
        renderedNodes.push(
          <pre
            key={`codeblock-${i}`}
            className="p-3 my-2 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto"
          >
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        flushList(i);
        inCodeBlock = true;
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // 2. Baris kosong
    if (trimmed === '') {
      flushList(i);
      continue;
    }

    // 3. Headings: #, ##, ###, ####
    if (trimmed.startsWith('#### ')) {
      flushList(i);
      renderedNodes.push(
        <h4
          key={`h4-${i}`}
          className="text-sm font-bold text-slate-800 mt-3 mb-1"
        >
          {renderInline(trimmed.slice(5))}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushList(i);
      renderedNodes.push(
        <h3
          key={`h3-${i}`}
          className="text-base font-bold text-slate-900 mt-4 mb-1.5"
        >
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushList(i);
      renderedNodes.push(
        <h2
          key={`h2-${i}`}
          className="text-lg font-bold text-slate-900 mt-5 mb-2 pb-1 border-b border-slate-100"
        >
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList(i);
      renderedNodes.push(
        <h1
          key={`h1-${i}`}
          className="text-xl font-extrabold text-slate-900 mt-6 mb-2"
        >
          {renderInline(trimmed.slice(2))}
        </h1>
      );
      continue;
    }

    // 4. Horizontal Rule: --- or ***
    if (/^(\-{3,}|\*{3,})$/.test(trimmed)) {
      flushList(i);
      renderedNodes.push(
        <hr key={`hr-${i}`} className="my-4 border-t border-slate-200" />
      );
      continue;
    }

    // 5. Blockquote: > text
    if (trimmed.startsWith('> ')) {
      flushList(i);
      renderedNodes.push(
        <blockquote
          key={`quote-${i}`}
          className="pl-3 py-1 my-2 border-l-4 border-blue-400 bg-blue-50/50 text-sm text-slate-600 italic"
        >
          {renderInline(trimmed.slice(2))}
        </blockquote>
      );
      continue;
    }

    // 6. Unordered List item: - or *
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (isOrderedList && currentListItems.length > 0) {
        flushList(i);
      }
      isOrderedList = false;
      currentListItems.push(
        <li key={`li-${i}`}>{renderInline(trimmed.slice(2))}</li>
      );
      continue;
    }

    // 7. Ordered List item: 1. 2. etc
    const olMatch = trimmed.match(/^([0-9]+)\.\s+(.*)/);
    if (olMatch) {
      if (!isOrderedList && currentListItems.length > 0) {
        flushList(i);
      }
      isOrderedList = true;
      currentListItems.push(
        <li key={`li-${i}`}>{renderInline(olMatch[2])}</li>
      );
      continue;
    }

    // 8. Paragraph biasa
    flushList(i);
    renderedNodes.push(
      <p key={`p-${i}`} className="text-sm text-slate-700 leading-relaxed my-1.5">
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList(lines.length);

  return <div className={`space-y-1 ${className}`}>{renderedNodes}</div>;
}
