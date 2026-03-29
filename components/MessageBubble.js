'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Sparkles, User } from 'lucide-react';

function parseMarkdown(text) {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) =>
      `<pre><code class="code-block">${escapeHtml(code.trim())}</code></pre>`
    )
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul class="md-ul">${match}</ul>`)
    .split('\n\n')
    .map((block) => {
      if (block.startsWith('<')) return block;
      const trimmed = block.trim();
      if (!trimmed) return '';
      return `<p class="md-p">${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .join('');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`group flex items-start gap-3 py-2 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isUser
          ? 'bg-zinc-800 dark:bg-zinc-200 shadow-sm'
          : 'bg-gradient-to-br from-violet-500 to-purple-700 shadow-md shadow-violet-500/25'
      }`}>
        {isUser
          ? <User className="w-3.5 h-3.5 text-white dark:text-zinc-800" />
          : <Sparkles className="w-3.5 h-3.5 text-white" />
        }
      </div>

      {/* Bubble */}
      <div className={`flex flex-col gap-1.5 max-w-[88%] sm:max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-tr-sm shadow-sm'
            : 'bg-white dark:bg-white/[0.07] text-zinc-800 dark:text-zinc-100 rounded-tl-sm border border-violet-100/80 dark:border-transparent shadow-sm'
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.pending ? (
            /* Skeleton pulse while waiting for first token */
            <div className="flex flex-col gap-2 py-0.5">
              <div className="h-3 w-48 rounded-full bg-zinc-200 dark:bg-white/10 animate-pulse" />
              <div className="h-3 w-36 rounded-full bg-zinc-200 dark:bg-white/10 animate-pulse opacity-70" />
            </div>
          ) : (
            <div className="chat-prose">
              {message.content ? (
                <div dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }} />
              ) : null}
              {message.streaming && (
                <span className="streaming-cursor" aria-hidden="true" />
              )}
            </div>
          )}
        </div>

        {/* Copy — assistant only, after streaming finishes */}
        {!isUser && !message.streaming && message.content && (
          <button
            onClick={copy}
            className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-all px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 min-h-[32px]"
          >
            {copied
              ? <><Check className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Copied</span></>
              : <><Copy className="w-3 h-3" />Copy</>
            }
          </button>
        )}
      </div>
    </motion.div>
  );
}
