"use client";

import Link from "next/link";
import type { MessageMentionDTO } from "@/lib/mentions/mention-types";
import { segmentMessageWithMentions } from "@/lib/mentions/parse-mentions";
import { sellerProfilePath } from "@/lib/seller-profile-url";

type Props = {
  body: string;
  mentions?: MessageMentionDTO[];
  className?: string;
  mentionClassName?: string;
};

export function MentionText({ body, mentions = [], className, mentionClassName }: Props) {
  const segments = segmentMessageWithMentions(body, mentions);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={`t-${i}`}>{seg.value}</span>;
        }
        const href = seg.userId ? sellerProfilePath(seg.username) : undefined;
        const cls =
          mentionClassName ??
          "font-semibold text-gold-bright hover:text-gold underline-offset-2 hover:underline";
        if (href) {
          return (
            <Link key={`m-${i}`} href={href} className={cls} onClick={(e) => e.stopPropagation()}>
              @{seg.username}
            </Link>
          );
        }
        return (
          <span key={`m-${i}`} className={cls}>
            @{seg.username}
          </span>
        );
      })}
    </span>
  );
}
