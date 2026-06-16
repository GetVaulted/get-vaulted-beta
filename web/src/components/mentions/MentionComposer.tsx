"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MentionSearchUser } from "@/lib/mentions/mention-types";
import {
  getActiveMentionQuery,
  insertMentionAtQuery,
} from "@/lib/mentions/parse-mentions";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
  singleLine?: boolean;
  "data-testid"?: string;
};

export function MentionComposer({
  value,
  onChange,
  onKeyDown,
  placeholder,
  rows = 2,
  disabled,
  className,
  maxLength,
  singleLine = false,
  "data-testid": testId,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);
  const [results, setResults] = useState<MentionSearchUser[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const active = getActiveMentionQuery(value, cursor);

  useEffect(() => {
    if (!active || active.query.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void fetch(`/api/users/mention-search?q=${encodeURIComponent(active.query)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((j: { users?: MentionSearchUser[] }) => {
          if (cancelled) return;
          const users = Array.isArray(j.users) ? j.users : [];
          setResults(users);
          setOpen(users.length > 0);
          setHighlight(0);
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setOpen(false);
          }
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [active?.query, active?.start, active?.end]);

  const pick = useCallback(
    (user: MentionSearchUser) => {
      if (!active) return;
      const next = insertMentionAtQuery(value, active, user.username);
      onChange(next.text);
      setOpen(false);
      requestAnimationFrame(() => {
        const el = singleLine ? inputRef.current : textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.cursor, next.cursor);
        setCursor(next.cursor);
      });
    },
    [active, onChange, singleLine, value],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (open && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % results.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + results.length) % results.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(results[highlight]!);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative min-w-0 flex-1">
      {open ? (
        <ul className="absolute bottom-full z-20 mb-1 max-h-44 w-full min-w-[12rem] overflow-y-auto rounded-xl border border-white/10 bg-[#0c0c10] py-1 shadow-xl">
          {results.map((u, idx) => (
            <li key={u.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                  idx === highlight ? "bg-gold/15 text-gold-bright" : "text-zinc-200 hover:bg-white/[0.04]"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(u);
                }}
              >
                <span className="font-semibold">@{u.username}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {singleLine ? (
        <input
          ref={inputRef}
          data-testid={testId}
          type="text"
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          className={className}
          onChange={(e) => {
            onChange(e.target.value);
            setCursor(e.target.selectionStart ?? e.target.value.length);
          }}
          onClick={(e) => setCursor(e.currentTarget.selectionStart ?? value.length)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? value.length)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <textarea
          ref={textareaRef}
          data-testid={testId}
          value={value}
          rows={rows}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          className={className}
          onChange={(e) => {
            onChange(e.target.value);
            setCursor(e.target.selectionStart ?? e.target.value.length);
          }}
          onClick={(e) => setCursor(e.currentTarget.selectionStart ?? value.length)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? value.length)}
          onKeyDown={handleKeyDown}
        />
      )}
    </div>
  );
}
