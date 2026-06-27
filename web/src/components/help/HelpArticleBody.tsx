function isBulletLine(line: string): boolean {
  return line.startsWith("• ") || line.startsWith("- ");
}

function isNumberedLine(line: string): boolean {
  return /^\d+\.\s/.test(line);
}

function BulletList({ lines }: { lines: string[] }) {
  return (
    <ul className="list-none space-y-2 pl-0">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-zinc-300">
          <span aria-hidden className="shrink-0 text-gold-bright">
            •
          </span>
          <span>{line.replace(/^[•-]\s*/, "")}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ lines }: { lines: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
      {lines.map((line, i) => (
        <li key={i}>{line.replace(/^\d+\.\s*/, "")}</li>
      ))}
    </ol>
  );
}

export function HelpArticleBody({ body }: { body: string }) {
  const blocks = body.split(/\n\n+/).filter(Boolean);

  return (
    <div className="space-y-4">
      {blocks.map((block, blockIdx) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        const bulletLines = lines.filter(isBulletLine);
        const numberedLines = lines.filter(isNumberedLine);
        const proseLines = lines.filter((l) => !isBulletLine(l) && !isNumberedLine(l));

        if (bulletLines.length > 0 && bulletLines.length === lines.length) {
          return <BulletList key={blockIdx} lines={bulletLines} />;
        }

        if (numberedLines.length > 0 && numberedLines.length === lines.length) {
          return <NumberedList key={blockIdx} lines={numberedLines} />;
        }

        if (bulletLines.length > 0 || numberedLines.length > 0) {
          return (
            <div key={blockIdx} className="space-y-3">
              {proseLines.map((line, i) => (
                <p key={`p-${i}`} className="text-sm leading-relaxed text-zinc-300">
                  {line}
                </p>
              ))}
              {numberedLines.length ? <NumberedList lines={numberedLines} /> : null}
              {bulletLines.length ? <BulletList lines={bulletLines} /> : null}
            </div>
          );
        }

        return (
          <p key={blockIdx} className="text-sm leading-relaxed text-zinc-300">
            {block}
          </p>
        );
      })}
    </div>
  );
}
