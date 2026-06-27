"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { HELP_ARTICLES, HELP_SECTIONS, searchHelpArticles } from "@/lib/help-center-articles";

export function HelpCenterBrowse() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHelpArticles(query), [query]);
  const searching = query.trim().length > 0;

  return (
    <>
      <label className="mt-8 block">
        <span className="sr-only">Search help articles</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles…"
          className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-4 text-sm text-foreground outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/20"
        />
      </label>

      {searching ? (
        <div className="mt-6 space-y-3">
          {results.length ? (
            results.map((article) => (
              <Link
                key={article.id}
                href={`/support/${article.id}`}
                className="block rounded-xl border border-white/[0.08] bg-zinc-950/60 p-4 transition hover:border-gold/25 hover:bg-zinc-950/90"
              >
                <p className="font-semibold text-foreground">{article.title}</p>
                <p className="mt-1 text-sm text-zinc-400">{article.summary}</p>
              </Link>
            ))
          ) : (
            <p className="text-sm text-zinc-400">No articles match your search. Try different keywords.</p>
          )}
        </div>
      ) : (
        <div className="mt-10 space-y-8">
          {HELP_SECTIONS.map((section) => {
            const articles = HELP_ARTICLES.filter((a) => a.sectionId === section.id);
            if (!articles.length) return null;
            return (
              <section key={section.id}>
                <h2 className="font-display text-lg font-semibold text-foreground">{section.title}</h2>
                <ul className="mt-3 space-y-2">
                  {articles.map((article) => (
                    <li key={article.id}>
                      <Link
                        href={`/support/${article.id}`}
                        className="group flex flex-col gap-0.5 rounded-xl border border-white/[0.06] bg-zinc-950/40 px-4 py-3 transition hover:border-gold/20 hover:bg-zinc-950/70"
                      >
                        <span className="text-sm font-semibold text-zinc-100 group-hover:text-gold-bright">
                          {article.title}
                        </span>
                        <span className="text-xs leading-snug text-zinc-500">{article.summary}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
