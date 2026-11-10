import React from 'react';

/**
 * Pure-React Markdown renderer with elegant Tailwind styling.
 * Parses headers, bold, code spans, lists, and quotes without heavy external dependencies.
 */
export const MarkdownRenderer = ({ content, className = '' }) => {
  if (!content) return null;

  // Split by code blocks first
  const renderInlineFormatted = (text) => {
    if (!text) return null;

    // Tokenize text for inline formatting: `code`, **bold**, *italic*
    const tokens = [];
    let remaining = text;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // Inline code: `code`
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        tokens.push(
          <code
            key={`code-${keyIdx++}`}
            className="px-1.5 py-0.5 mx-0.5 bg-indigo-50 text-indigo-700 font-mono text-xs rounded border border-indigo-200"
          >
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // Bold: **text**
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        tokens.push(
          <strong key={`bold-${keyIdx++}`} className="font-semibold text-gray-900">
            {renderInlineFormatted(boldMatch[1])}
          </strong>
        );
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Italic: *text* or _text_
      const italicMatch = remaining.match(/^[*_]([^*_]+)[*_]/);
      if (italicMatch) {
        tokens.push(
          <em key={`italic-${keyIdx++}`} className="italic text-gray-800">
            {italicMatch[1]}
          </em>
        );
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Plain text up to next special char
      const nextSpecial = remaining.search(/[`*_]/);
      if (nextSpecial === -1) {
        tokens.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        // Unmatched character, consume 1 char
        tokens.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        tokens.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }

    return tokens;
  };

  const lines = content.split('\n');
  const elements = [];
  let currentList = [];
  let isNumberedList = false;

  const flushList = () => {
    if (currentList.length > 0) {
      if (isNumberedList) {
        elements.push(
          <ol key={`ol-${elements.length}`} className="my-2 ml-5 list-decimal space-y-1 text-sm text-gray-700">
            {currentList.map((item, i) => <li key={i}>{item}</li>)}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${elements.length}`} className="my-2 ml-4 space-y-1.5 text-sm text-gray-700">
            {currentList.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />
                <span className="flex-1">{item}</span>
              </li>
            ))}
          </ul>
        );
      }
      currentList = [];
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Markdown H5 (##### Header)
    if (trimmed.startsWith('##### ')) {
      flushList();
      elements.push(
        <h6 key={`h5-${idx}`} className="text-xs font-semibold text-slate-600 mt-2 mb-0.5">
          {renderInlineFormatted(trimmed.slice(6))}
        </h6>
      );
      continue;
    }

    // Markdown H4 (#### Header)
    if (trimmed.startsWith('#### ')) {
      flushList();
      elements.push(
        <h5 key={`h4-${idx}`} className="text-xs font-bold text-slate-800 mt-2.5 mb-1 tracking-tight">
          {renderInlineFormatted(trimmed.slice(5))}
        </h5>
      );
      continue;
    }

    // Markdown H3 (### Header)
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={`h3-${idx}`} className="text-sm font-bold text-slate-900 mt-3 mb-1">
          {renderInlineFormatted(trimmed.slice(4))}
        </h4>
      );
      continue;
    }

    // Markdown H2 (## Header)
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={`h2-${idx}`} className="text-sm font-bold text-indigo-900 mt-3 mb-1.5 flex items-center gap-1.5 border-b border-indigo-50 pb-0.5">
          {renderInlineFormatted(trimmed.slice(3))}
        </h3>
      );
      continue;
    }

    // Markdown H1 (# Header)
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={`h1-${idx}`} className="text-base font-bold text-gray-900 mt-3.5 mb-1.5 pb-1 border-b border-gray-200">
          {renderInlineFormatted(trimmed.slice(2))}
        </h2>
      );
      continue;
    }

    // Horizontal Rule (--- or ***)
    if (trimmed.match(/^(?:---|\*\*\*|___)\s*$/)) {
      flushList();
      elements.push(<hr key={`hr-${idx}`} className="my-3 border-t border-slate-200" />);
      continue;
    }

    // Blockquote (> Quote)
    if (trimmed.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote key={`bq-${idx}`} className="my-2 pl-3 border-l-2 border-indigo-400 text-xs italic text-slate-600 bg-slate-50/70 py-1 rounded-r">
          {renderInlineFormatted(trimmed.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Bullet List (- item or * item)
    if (trimmed.match(/^[-*]\s+/)) {
      if (isNumberedList) flushList();
      isNumberedList = false;
      const text = trimmed.replace(/^[-*]\s+/, '');
      currentList.push(renderInlineFormatted(text));
      continue;
    }

    // Numbered List (1. item)
    if (trimmed.match(/^\d+\.\s+/)) {
      if (!isNumberedList) flushList();
      isNumberedList = true;
      const text = trimmed.replace(/^\d+\.\s+/, '');
      currentList.push(renderInlineFormatted(text));
      continue;
    }

    // Normal Paragraph
    flushList();
    elements.push(
      <p key={`p-${idx}`} className="my-1 text-sm text-gray-700 leading-relaxed break-words">
        {renderInlineFormatted(trimmed)}
      </p>
    );
  }

  flushList();

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
};

export default MarkdownRenderer;
