import type { ReactNode } from "react";

/**
 * Solid surface + soft gold wash only (no body grid) for a cleaner join experience.
 */
export default function SignupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#030303] bg-[radial-gradient(ellipse_115%_65%_at_50%_-18%,rgba(201,162,39,0.042),transparent_56%)]">
      {children}
    </div>
  );
}
