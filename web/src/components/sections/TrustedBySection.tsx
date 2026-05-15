import { SectionHeading } from "@/components/sections/SectionHeading";

const pillars = [
  {
    title: "Secure checkout",
    body: "Payments flow through structured checkout so buyers and sellers share clear terms at purchase time.",
  },
  {
    title: "Seller readiness",
    body: "Stripe and shipping checks help sellers publish with fewer surprises when an item sells.",
  },
  {
    title: "Live + listings",
    body: "Run live rooms and fixed-price listings in one place instead of stitching tools together.",
  },
  {
    title: "Ship with proof",
    body: "Tracking and fulfillment cues are designed around how collectibles actually move in the real world.",
  },
] as const;

export function TrustedBySection() {
  return (
    <section
      id="trusted-by"
      className="scroll-mt-16 border-t border-white/[0.08] bg-[linear-gradient(180deg,#151518_0%,#050506_100%)] py-9 sm:py-11"
      aria-labelledby="trusted-title"
    >
      <div className="mx-auto w-full max-w-[1920px] px-3 sm:px-4 lg:px-10">
        <SectionHeading titleId="trusted-title" eyebrow="Platform" title="Built for real commerce" dense />
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {pillars.map((s) => (
            <div
              key={s.title}
              className="rounded-xl border border-white/10 bg-[#0c0c10] px-3 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_48px_-28px_rgba(201,162,39,0.12)] transition-all duration-300 hover:border-gold/30"
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-gold-bright sm:text-xs">{s.title}</p>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500 sm:text-[11px]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
