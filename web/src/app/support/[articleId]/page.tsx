import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpArticleBody } from "@/components/help/HelpArticleBody";
import { CANONICAL_SHARE_SITE_FALLBACK } from "@/lib/live-room-share-metadata";
import { getHelpArticle, HELP_SECTIONS } from "@/lib/help-center-articles";

const SUPPORT_EMAIL = "support@shopgetvaulted.com";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=Get%20Vaulted%20Support%20Request`;

type Props = { params: Promise<{ articleId: string }> };

export async function generateStaticParams() {
  const { HELP_ARTICLES } = await import("@/lib/help-center-articles");
  return HELP_ARTICLES.map((a) => ({ articleId: a.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { articleId } = await params;
  const article = getHelpArticle(articleId);
  if (!article) return { title: "Help article" };
  return {
    title: `${article.title} · Get Vaulted Support`,
    description: article.summary,
    alternates: { canonical: `${CANONICAL_SHARE_SITE_FALLBACK}/support/${article.id}` },
  };
}

export default async function SupportArticlePage({ params }: Props) {
  const { articleId } = await params;
  const article = getHelpArticle(articleId);
  if (!article) notFound();

  const section = HELP_SECTIONS.find((s) => s.id === article.sectionId);

  return (
    <main className="relative flex-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(201,162,39,0.14),transparent)]"
      />

      <div className="relative mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
        <Link href="/support" className="text-xs font-semibold uppercase tracking-wide text-gold-bright hover:underline">
          ← Help Center
        </Link>

        <header className="mt-6">
          {section ? (
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-bright/90">{section.title}</p>
          ) : null}
          <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {article.title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{article.summary}</p>
        </header>

        <article className="mt-8 rounded-2xl border border-white/[0.08] bg-zinc-950/60 p-5 sm:p-8">
          <HelpArticleBody body={article.body} />
        </article>

        <section className="mt-8 rounded-2xl border border-gold/30 bg-gold/5 p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-foreground">Still need help?</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">
            Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-gold-bright hover:underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            with your account email and order or trade ID if this article did not resolve your issue.
          </p>
          <a
            href={SUPPORT_MAILTO}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-5 py-3 text-sm font-bold text-black transition hover:bg-gold-bright"
          >
            Contact Support
          </a>
        </section>
      </div>
    </main>
  );
}
