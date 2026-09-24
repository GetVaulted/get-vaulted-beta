"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type PullMedia = {
  id: string;
  type: "PHOTO" | "VIDEO";
  url: string;
  durationMs: number | null;
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
};

type PullComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; username: string; image: string | null };
  canDelete: boolean;
};

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${n}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/** Heart icon — filled when liked. */
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={filled ? "#ef4444" : "none"} stroke={filled ? "#ef4444" : "currentColor"} strokeWidth="2">
      <path d="M12 21s-7.5-4.6-10.1-9.1C.5 9 1.4 5.6 4.3 4.3c2.3-1 4.8-.2 6.2 1.7l1.5 2 1.5-2c1.4-1.9 3.9-2.7 6.2-1.7 2.9 1.3 3.8 4.7 2.4 7.6C19.5 16.4 12 21 12 21z" strokeLinejoin="round" />
    </svg>
  );
}

/** Buyer-facing "Pulls" shelf on a seller's public profile. Renders nothing when empty. */
export function SellerPullsSection({ media: initialMedia }: { media: PullMedia[] }) {
  const [media, setMedia] = useState(initialMedia);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [comments, setComments] = useState<PullComment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const commentsEndRef = useRef<HTMLDivElement>(null);

  if (!media.length) return null;

  const openItem = openIndex != null ? media[openIndex] : null;
  const returnTo = pathname || "/";

  const goto = (delta: 1 | -1) => {
    setOpenIndex((i) => {
      if (i == null) return i;
      return (i + delta + media.length) % media.length;
    });
  };

  const loadComments = useCallback(async (id: string) => {
    setComments(null);
    const res = await fetch(`/api/pull-media/${encodeURIComponent(id)}/comments`, { cache: "no-store" });
    if (!res.ok) {
      setComments([]);
      return;
    }
    const body = (await res.json()) as { comments: PullComment[] };
    setComments(body.comments);
  }, []);

  useEffect(() => {
    if (openItem) void loadComments(openItem.id);
    else setComments(null);
    setCommentDraft("");
  }, [openItem?.id, loadComments]);

  const requireAuth = () => {
    if (status === "unauthenticated" || !session?.user?.id) {
      router.push(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
      return false;
    }
    return true;
  };

  const toggleLike = async () => {
    if (!openItem || likeBusy) return;
    if (!requireAuth()) return;
    setLikeBusy(true);
    const method = openItem.viewerHasLiked ? "DELETE" : "POST";
    try {
      const res = await fetch(`/api/pull-media/${encodeURIComponent(openItem.id)}/like`, { method });
      if (!res.ok) return;
      const body = (await res.json()) as { liked: boolean; likeCount: number };
      setMedia((prev) =>
        prev.map((m) => (m.id === openItem.id ? { ...m, viewerHasLiked: body.liked, likeCount: body.likeCount } : m)),
      );
    } finally {
      setLikeBusy(false);
    }
  };

  const submitComment = async () => {
    if (!openItem || posting) return;
    const body = commentDraft.trim();
    if (!body) return;
    if (!requireAuth()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/pull-media/${encodeURIComponent(openItem.id)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json().catch(() => null)) as { comment?: PullComment; error?: string } | null;
      if (!res.ok || !json?.comment) return;
      setComments((prev) => [...(prev ?? []), json.comment!]);
      setMedia((prev) =>
        prev.map((m) => (m.id === openItem.id ? { ...m, commentCount: m.commentCount + 1 } : m)),
      );
      setCommentDraft("");
      requestAnimationFrame(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }));
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!openItem) return;
    const res = await fetch(
      `/api/pull-media/${encodeURIComponent(openItem.id)}/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE" },
    );
    if (!res.ok) return;
    setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
    setMedia((prev) =>
      prev.map((m) => (m.id === openItem.id ? { ...m, commentCount: Math.max(0, m.commentCount - 1) } : m)),
    );
  };

  return (
    <section className="mt-8" aria-label="Seller pulls">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-200">Pulls</h2>
        <span className="text-[11px] text-zinc-500">{media.length} shared</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {media.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="group relative h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 transition hover:border-gold/30"
          >
            {m.type === "PHOTO" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <video
                src={m.url}
                className="h-full w-full object-cover"
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
              />
            )}
            {m.type === "VIDEO" && m.durationMs ? (
              <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {Math.round(m.durationMs / 1000)}s
              </span>
            ) : null}
            {m.likeCount > 0 || m.commentCount > 0 ? (
              <span className="absolute bottom-2 left-2 flex items-center gap-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {m.likeCount > 0 ? (
                  <span className="flex items-center gap-0.5">
                    <HeartIcon filled={m.viewerHasLiked} /> {formatCount(m.likeCount)}
                  </span>
                ) : null}
                {m.commentCount > 0 ? <span>{formatCount(m.commentCount)} 💬</span> : null}
              </span>
            ) : null}
            <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
          </button>
        ))}
      </div>

      {openItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenIndex(null)}
        >
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            aria-label="Close"
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            ✕
          </button>

          {media.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous"
                onClick={(e) => {
                  e.stopPropagation();
                  goto(-1);
                }}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg text-white transition hover:bg-white/20 sm:left-6"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={(e) => {
                  e.stopPropagation();
                  goto(1);
                }}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg text-white transition hover:bg-white/20 sm:right-6"
              >
                ›
              </button>
            </>
          ) : null}

          <div
            className="flex max-h-[88vh] w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-stretch"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {openItem.type === "PHOTO" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={openItem.url}
                  alt=""
                  className="max-h-[60vh] max-w-full rounded-lg object-contain sm:max-h-[88vh]"
                />
              ) : (
                <video
                  src={openItem.url}
                  className="max-h-[60vh] max-w-full rounded-lg sm:max-h-[88vh]"
                  controls
                  autoPlay
                  playsInline
                />
              )}
            </div>

            <div className="flex w-full flex-col rounded-xl border border-white/[0.08] bg-zinc-950/95 sm:w-80">
              <div className="flex items-center gap-4 border-b border-white/[0.08] px-4 py-3">
                <button
                  type="button"
                  onClick={() => void toggleLike()}
                  disabled={likeBusy}
                  className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200 transition hover:text-red-400 disabled:opacity-60"
                >
                  <HeartIcon filled={openItem.viewerHasLiked} />
                  {openItem.likeCount.toLocaleString("en-US")}
                </button>
                <span className="text-sm text-zinc-500">{openItem.commentCount.toLocaleString("en-US")} comments</span>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {comments == null ? (
                  <p className="text-xs text-zinc-500">Loading comments…</p>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-zinc-500">No comments yet. Say something nice.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="group text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-zinc-200">@{c.author.username}</span>
                        <span className="text-[10px] text-zinc-600">{timeAgo(c.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-zinc-300">{c.body}</p>
                      {c.canDelete ? (
                        <button
                          type="button"
                          onClick={() => void deleteComment(c.id)}
                          className="mt-0.5 text-[10px] text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>

              <form
                className="flex items-center gap-2 border-t border-white/[0.08] px-3 py-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitComment();
                }}
              >
                <input
                  type="text"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder="Add a comment…"
                  maxLength={500}
                  className="min-w-0 flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={posting || !commentDraft.trim()}
                  className="text-sm font-semibold text-gold-bright disabled:opacity-40"
                >
                  Post
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
