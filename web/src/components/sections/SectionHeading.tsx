import Link from "next/link";

type SectionHeadingProps = {
  titleId?: string;
  eyebrow?: string;
  title: string;
  actionLabel?: string;
  actionHref?: string;
  dense?: boolean;
};

export function SectionHeading({
  titleId,
  eyebrow,
  title,
  actionLabel,
  actionHref,
  dense,
}: SectionHeadingProps) {
  return (
    <div
      className={`flex flex-wrap items-end justify-between gap-2 border-b border-white/10 pb-2.5 ${dense ? "mb-3" : "mb-4 sm:mb-5"}`}
    >
      <div>
        {eyebrow ? (
          <p
            className={`mb-1 font-bold uppercase tracking-[0.18em] text-gold-bright/85 ${dense ? "text-[10px]" : "text-[11px]"}`}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2
          id={titleId}
          className={`font-display font-extrabold tracking-tight text-foreground ${dense ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"}`}
        >
          {title}
        </h2>
      </div>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className={`font-bold text-gold-bright underline-offset-4 transition-all duration-200 hover:brightness-110 hover:underline ${dense ? "text-xs" : "text-sm"}`}
        >
          {actionLabel} →
        </Link>
      ) : null}
    </div>
  );
}
