/** Dev/QA timing logs for listing publish pipeline. */
export function createPublishTimer(): {
  mark: (label: string) => void;
  finish: () => void;
} {
  const t0 = Date.now();
  let last = t0;
  const marks: { label: string; ms: number }[] = [];

  return {
    mark(label: string) {
      const now = Date.now();
      const ms = now - last;
      last = now;
      marks.push({ label, ms });
      console.info(`[publish] ${label}: ${ms}ms`);
    },
    finish() {
      const total = Date.now() - t0;
      console.info(`[publish] total: ${total}ms`, { steps: marks });
    },
  };
}

export function newPublishRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `pub_${Date.now().toString(36)}_${rand}`;
}
