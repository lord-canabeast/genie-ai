'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  Send, Plus, Sun, Moon, Sparkles, Trash2,
  ChevronDown, RotateCcw, Menu, X, Zap, Brain,
  MessageSquare, Pencil, Check as CheckIcon,
} from 'lucide-react';
import MessageBubble from './MessageBubble';

const MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Genie Pro', desc: 'Smart & versatile', icon: Brain },
  { id: 'llama-3.1-8b-instant', label: 'Genie Flash', desc: 'Fast & efficient', icon: Zap },
];

const SUGGESTIONS = [
  { text: 'Explain quantum computing in simple terms' },
  { text: 'Write a cover letter for a software engineer role' },
  { text: 'Give me a 7-day workout plan for beginners' },
  { text: 'Best practices for React performance?' },
  { text: 'Help me plan a trip to Japan for 10 days' },
  { text: 'Write a short story about a robot who learns to paint' },
];

function newConversation() {
  return { id: Date.now(), title: 'New Chat', messages: [], createdAt: Date.now() };
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ChatApp() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [conversations, setConversations] = useState(() => [newConversation()]);
  const [activeId, setActiveId] = useState(() => null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const [modelOpen, setModelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [now, setNow] = useState(Date.now());
  const scrollContainerRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const editInputRef = useRef(null);

  // Mount + localStorage + breakpoint + clock ticker
  useEffect(() => {
    try {
      const saved = localStorage.getItem('genie-conversations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure all convs have createdAt
          const withDates = parsed.map((c) => ({ createdAt: Date.now(), ...c }));
          setConversations(withDates);
          setActiveId(withDates[0].id);
        } else {
          const fresh = newConversation();
          setConversations([fresh]);
          setActiveId(fresh.id);
        }
      } else {
        const fresh = newConversation();
        setConversations([fresh]);
        setActiveId(fresh.id);
      }
    } catch {
      const fresh = newConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
    }

    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);

    // Update relative timestamps every minute
    const ticker = setInterval(() => setNow(Date.now()), 60000);

    setMounted(true);
    return () => { mq.removeEventListener('change', handler); clearInterval(ticker); };
  }, []);

  // Persist
  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem('genie-conversations', JSON.stringify(conversations)); } catch {}
  }, [conversations, mounted]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId) setTimeout(() => editInputRef.current?.focus(), 50);
  }, [editingId]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 120);
  };

  const scrollToBottom = useCallback((smooth = true) => {
    if (smooth) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    else if (scrollContainerRef.current)
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, []);

  const activeConv = conversations.find((c) => c.id === activeId);
  const messages = activeConv?.messages ?? [];

  const updateConv = useCallback((id, updater) =>
    setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c))), []);

  const sendMessage = async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '48px';

    const currentActiveId = activeId;
    const userMsg = { role: 'user', content, id: Date.now() };
    const apiMessages = [...messages, userMsg];
    const assistantMsgId = Date.now() + 1;

    updateConv(currentActiveId, (c) => ({
      ...c,
      title: c.messages.length === 0
        ? content.slice(0, 38) + (content.length > 38 ? '…' : '') : c.title,
      messages: [
        ...c.messages,
        userMsg,
        { role: 'assistant', content: '', id: assistantMsgId, streaming: true, pending: true },
      ],
    }));

    setLoading(true);
    setTimeout(() => scrollToBottom(false), 50);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, model }),
      });
      if (!res.ok) throw new Error('API error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullContent += decoder.decode(value, { stream: true });
        const captured = fullContent;
        updateConv(currentActiveId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, content: captured, streaming: true, pending: false } : m
          ),
        }));
        if (scrollContainerRef.current) {
          const el = scrollContainerRef.current;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 180) el.scrollTop = el.scrollHeight;
        }
      }

      updateConv(currentActiveId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsgId ? { ...m, streaming: false, pending: false } : m
        ),
      }));
      setTimeout(() => scrollToBottom(true), 50);
    } catch {
      updateConv(currentActiveId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: 'Something went wrong. Please try again.', streaming: false, pending: false }
            : m
        ),
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const startNew = () => {
    const conv = newConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setSidebarOpen(false);
  };

  const deleteConv = (id) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) { const f = newConversation(); setActiveId(f.id); return [f]; }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  const startEdit = (conv) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const commitEdit = () => {
    if (editingTitle.trim()) {
      updateConv(editingId, (c) => ({ ...c, title: editingTitle.trim() }));
    }
    setEditingId(null);
  };

  const clearMessages = () =>
    updateConv(activeId, (c) => ({ ...c, messages: [], title: 'New Chat' }));

  const activeModel = MODELS.find((m) => m.id === model) ?? MODELS[0];

  if (!mounted || activeId === null) return null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--chat-bg)' }}>

      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <motion.aside
        initial={false}
        animate={{ x: isDesktop || sidebarOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="app-sidebar fixed lg:relative z-30 flex flex-col w-[260px] h-full shrink-0
          border-r border-violet-100 dark:border-white/[0.06]"
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight leading-none">Genie AI</p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">Powered by Llama 3</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New chat */}
        <div className="px-3 pb-3">
          <button
            onClick={startNew}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold
              bg-gradient-to-r from-violet-600 to-purple-600 text-white
              hover:from-violet-500 hover:to-purple-500 transition-all
              shadow-md shadow-violet-500/20 hover:shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0"
          >
            <Plus className="w-4 h-4" /> New Conversation
          </button>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto px-2.5 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600 px-2 py-2">
            Recent
          </p>
          {conversations.map((conv) => (
            <div key={conv.id} className="group relative mb-0.5">
              {editingId === conv.id ? (
                /* Inline rename input */
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <input
                    ref={editInputRef}
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    onBlur={commitEdit}
                    className="flex-1 text-sm bg-white dark:bg-white/10 border border-violet-300 dark:border-violet-500/40 rounded-lg px-2.5 py-1.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-400/50"
                  />
                  <button onClick={commitEdit} className="p-1.5 rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 shrink-0">
                    <CheckIcon className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { setActiveId(conv.id); setSidebarOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all pr-16 ${
                      conv.id === activeId
                        ? 'bg-white dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-100 font-medium shadow-sm'
                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-white/70 dark:hover:bg-white/[0.05] hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <MessageSquare className="w-3 h-3 shrink-0 opacity-40" />
                      <span className="truncate text-xs font-medium">{conv.title}</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-600 pl-5">
                      {timeAgo(conv.createdAt ?? conv.id)}
                    </p>
                  </button>

                  {/* Rename + Delete buttons */}
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => startEdit(conv)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteConv(conv.id)}
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-violet-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white dark:hover:bg-white/[0.05] transition-colors">
            <div className="relative shrink-0">
              <img src="https://i.pravatar.cc/40?img=11" alt="User" className="w-8 h-8 rounded-full ring-2 ring-violet-500/30" />
              <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white dark:border-[#0e0e16]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">Alex Johnson</p>
              <p className="text-[10px] text-violet-500 dark:text-violet-400 font-medium">Free plan</p>
            </div>
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 transition-colors shrink-0"
            >
              <Sun className="w-3.5 h-3.5" style={{ display: 'var(--show-sun)' }} />
              <Moon className="w-3.5 h-3.5" style={{ display: 'var(--show-moon)' }} />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <header className="app-header flex items-center justify-between px-4 py-3 border-b border-violet-100 dark:border-white/[0.06] backdrop-blur-md shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 transition-colors shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden lg:flex items-center gap-2.5 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-sm shadow-violet-500/30">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-zinc-900 dark:text-white">Genie AI</span>
            </div>
            {messages.length > 0 && (
              <span className="hidden sm:block text-sm text-zinc-400 dark:text-zinc-500 truncate max-w-[160px] sm:max-w-xs border-l border-violet-100 dark:border-white/10 pl-3">
                {activeConv?.title}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Model picker */}
            <div className="relative">
              <button
                onClick={() => setModelOpen((v) => !v)}
                aria-label="Select model"
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 sm:py-1.5 rounded-lg min-h-[36px]
                  border border-violet-200/60 dark:border-white/10
                  bg-white dark:bg-white/[0.05]
                  text-zinc-600 dark:text-zinc-300
                  hover:border-violet-400 dark:hover:border-violet-500/50
                  hover:text-violet-600 dark:hover:text-violet-400 transition-all"
              >
                <activeModel.icon className="w-3 h-3" />
                <span className="hidden md:inline">{activeModel.label}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              <AnimatePresence>
                {modelOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 z-20 w-52 bg-white dark:bg-[#18181f] border border-violet-100 dark:border-white/10 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40 overflow-hidden"
                    >
                      <div className="p-1.5">
                        {MODELS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => { setModel(m.id); setModelOpen(false); }}
                            className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition-colors ${
                              model === m.id ? 'bg-violet-50 dark:bg-violet-500/10' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.05]'
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              model === m.id ? 'bg-violet-100 dark:bg-violet-500/20' : 'bg-zinc-100 dark:bg-white/[0.08]'
                            }`}>
                              <m.icon className={`w-3.5 h-3.5 ${model === m.id ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500 dark:text-zinc-400'}`} />
                            </div>
                            <div>
                              <p className={`text-sm font-semibold ${model === m.id ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-900 dark:text-zinc-100'}`}>{m.label}</p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-500">{m.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {messages.length > 0 && (
              <button onClick={clearMessages} title="Clear conversation"
                className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="hidden lg:flex p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 transition-colors"
            >
              <Sun className="w-4 h-4" style={{ display: 'var(--show-sun)' }} />
              <Moon className="w-4 h-4" style={{ display: 'var(--show-moon)' }} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="app-chat flex-1 overflow-y-auto relative">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-full px-5 py-12">
              <motion.div
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="text-center w-full max-w-lg"
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="relative w-16 h-16 mx-auto mb-6"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-2xl shadow-violet-500/40">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-400/20 to-transparent animate-pulse" />
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white mb-2 tracking-tight"
                >
                  What can I help with?
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 max-w-sm mx-auto leading-relaxed"
                >
                  Ask anything. I can write, analyze, code, brainstorm, and much more.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                >
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s.text)}
                      className="group flex items-start gap-3 text-left px-3 py-3 sm:px-4 sm:py-3.5 rounded-2xl
                        border border-zinc-200 dark:border-white/[0.07]
                        bg-white dark:bg-white/[0.02]
                        hover:border-violet-300 dark:hover:border-violet-500/40
                        hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.07]
                        transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0
                        shadow-sm hover:shadow-md shadow-violet-500/5"
                    >
                      <span className="text-violet-400 dark:text-violet-500 text-xs mt-0.5 shrink-0 font-bold">✦</span>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors leading-snug">
                        {s.text}
                      </span>
                    </button>
                  ))}
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.55 }}
                  className="hidden sm:block text-xs text-zinc-400 dark:text-zinc-600 mt-6"
                >
                  Press{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 font-mono text-[10px]">Enter</kbd>
                  {' '}to send ·{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/10 text-zinc-500 dark:text-zinc-400 font-mono text-[10px]">Shift+Enter</kbd>
                  {' '}for new line
                </motion.p>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-1">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
              </AnimatePresence>
              <div ref={bottomRef} className="h-6" />
            </div>
          )}

          {/* Scroll to bottom */}
          <AnimatePresence>
            {showScrollBtn && (
              <motion.button
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                onClick={() => scrollToBottom(true)}
                className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-10 w-9 h-9 flex items-center justify-center rounded-full
                  bg-white dark:bg-zinc-800 border border-violet-200 dark:border-white/10
                  shadow-lg hover:shadow-xl text-zinc-500 dark:text-zinc-400
                  hover:text-violet-600 dark:hover:text-violet-400 hover:border-violet-300 dark:hover:border-violet-500/50
                  transition-all"
              >
                <ChevronDown className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className="app-input-area px-4 pb-5 pt-3 border-t border-violet-100 dark:border-white/[0.04]">
          <div className="max-w-3xl mx-auto">
            <div className="app-input-box relative rounded-2xl border border-violet-200/60 dark:border-white/[0.09]
              shadow-sm hover:shadow-md transition-all duration-200
              focus-within:border-violet-400 dark:focus-within:border-violet-500/60
              focus-within:shadow-lg focus-within:shadow-violet-500/10"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder="Message Genie…"
                rows={1}
                disabled={loading}
                className="w-full bg-transparent text-sm text-zinc-900 dark:text-zinc-100
                  placeholder-zinc-400 dark:placeholder-zinc-600
                  resize-none focus:outline-none leading-relaxed
                  px-4 pt-3.5 pb-3 pr-14 max-h-[200px] overflow-y-auto disabled:opacity-60"
                style={{ height: '48px' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className={`absolute right-3 bottom-3 w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-200 ${
                  input.trim() && !loading
                    ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105 active:scale-95'
                    : 'bg-zinc-200 dark:bg-white/10 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                }`}
              >
                {loading
                  ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Send className="w-3.5 h-3.5" />
                }
              </button>
            </div>
            <p className="text-center text-[10px] text-zinc-400 dark:text-zinc-600 mt-2.5">
              Genie AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
