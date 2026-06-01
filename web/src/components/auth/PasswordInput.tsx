"use client";

import { useState, type ChangeEventHandler } from "react";

function EyeIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19 12 19c.858 0 1.678-.097 2.458-.266M8.05 8.05A3 3 0 0 0 12 15a3 3 0 0 0 2.05-5.05M15 12a3 3 0 0 1-.224 1.133M9.9 4.24A9.12 9.12 0 0 1 12 4c4.478 0 8.268 2.943 9.542 7a18.45 18.45 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 0 1-4.24-4.24M4 4l16 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type PasswordInputProps = {
  id: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  /** Defaults to "Show password" / "Hide password". */
  toggleLabels?: { show: string; hide: string };
};

export function PasswordInput({
  id,
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  required,
  minLength,
  toggleLabels = { show: "Show password", hide: "Hide password" },
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? toggleLabels.hide : toggleLabels.show;

  return (
    <div className="flex min-h-11 w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#0c0c10] ring-gold/25 transition-[border-color,box-shadow] focus-within:border-gold/40 focus-within:ring-2 focus-within:ring-offset-0">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        value={value}
        onChange={onChange}
        className="h-11 min-h-11 min-w-0 flex-1 border-0 bg-transparent px-3.5 py-0 text-sm text-foreground outline-none placeholder:text-zinc-600"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={toggleLabel}
        aria-pressed={visible}
        aria-controls={id}
        className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center border-l border-white/10 bg-transparent text-zinc-400 outline-none transition-colors hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:z-10 focus-visible:text-zinc-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/40"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
