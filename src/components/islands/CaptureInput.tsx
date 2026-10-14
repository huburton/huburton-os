import { useState, useRef, useEffect } from 'react';

type Size = 'small' | 'medium' | 'big';

function parseInput(raw: string): { title: string; tags: string[]; project?: string } {
  const tags: string[] = [];
  let project: string | undefined;
  const title = raw
    .replace(/#(\w+)/g, (_, t) => { tags.push(t.toUpperCase()); return ''; })
    .replace(/@(\w+)/g, (_, p) => { project = p.toUpperCase(); return ''; })
    .replace(/\s+/g, ' ').trim();
  return { title, tags, project };
}

export default function CaptureInput() {
  const [val, setVal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<null | { type: 'ok' | 'err'; msg: string }>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement) return;
      if (document.activeElement instanceof HTMLTextAreaElement) return;
      if (e.key === '/' || e.key === 'n') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  async function submit(size: Size) {
    if (!val.trim() || submitting) return;
    setSubmitting(true);
    const parsed = parseInput(val);
    if (!parsed.title) { setSubmitting(false); return; }
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, size }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setVal('');
      setFlash({ type: 'ok', msg: `✓ ${size.toUpperCase()} CREATED` });
      window.dispatchEvent(new CustomEvent('tasks:changed'));
      setTimeout(() => setFlash(null), 1600);
    } catch (err) {
      setFlash({ type: 'err', msg: `✗ ${(err as Error).message}` });
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const size: Size = e.altKey ? 'big' : e.shiftKey ? 'medium' : 'small';
      submit(size);
    } else if (e.key === 'Escape') {
      inputRef.current?.blur();
      setVal('');
    }
  }

  return (
    <div className="brutal-border-bottom bg-[var(--color-bg)] shrink-0">
      <div className="flex items-center gap-2 px-3 py-[6px]">
        <span className="font-mono text-[14px] leading-none text-[var(--color-acc-red)]">+</span>
        <input
          ref={inputRef}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="TYPE A TASK AND PRESS ENTER  ·  #tag @project  ·  ⇧↵ medium  ·  ⌥↵ big"
          className="flex-1 bg-transparent outline-none font-sans text-[12px] placeholder:font-mono placeholder:text-[10px] placeholder:uppercase placeholder:tracking-wider placeholder:text-[var(--color-fg-faint)] disabled:opacity-50"
          disabled={submitting}
        />
        {flash && (
          <span className={`font-mono text-[10px] uppercase tracking-wider ${flash.type === 'ok' ? 'text-[var(--color-acc-green)]' : 'text-[var(--color-acc-red)]'}`}>
            {flash.msg}
          </span>
        )}
      </div>
    </div>
  );
}
