import { describe, expect, it } from "vitest";
import {
  getActiveMentionQuery,
  insertMentionAtQuery,
  parseMentionUsernames,
  segmentMessageWithMentions,
} from "@/lib/mentions/parse-mentions";

describe("parseMentionUsernames", () => {
  it("extracts unique usernames case-insensitively", () => {
    expect(parseMentionUsernames("hey @bry and @BRY again @alice")).toEqual(["bry", "alice"]);
  });

  it("ignores invalid tokens", () => {
    expect(parseMentionUsernames("email@test.com @xy @valid_user")).toEqual(["valid_user"]);
  });
});

describe("getActiveMentionQuery", () => {
  it("detects partial query at cursor", () => {
    const text = "hello @bry";
    expect(getActiveMentionQuery(text, text.length)).toEqual({ query: "bry", start: 6, end: 10 });
  });

  it("returns null after space following @", () => {
    expect(getActiveMentionQuery("hi @done ", 9)).toBeNull();
  });

  it("normalizes uppercase partial queries", () => {
    const text = "hello @Bry";
    expect(getActiveMentionQuery(text, text.length)).toEqual({ query: "bry", start: 6, end: 10 });
  });
});

describe("insertMentionAtQuery", () => {
  it("inserts username with trailing space", () => {
    const text = "yo @br";
    const active = getActiveMentionQuery(text, text.length)!;
    const next = insertMentionAtQuery(text, active, "bryan");
    expect(next.text).toBe("yo @bryan ");
    expect(next.cursor).toBe("yo @bryan ".length);
  });
});

describe("segmentMessageWithMentions", () => {
  it("marks resolved mentions with user ids", () => {
    const segments = segmentMessageWithMentions("Hi @alice!", [
      { userId: "u1", username: "alice" },
    ]);
    expect(segments).toEqual([
      { type: "text", value: "Hi " },
      { type: "mention", username: "alice", userId: "u1" },
      { type: "text", value: "!" },
    ]);
  });

  it("keeps unresolved @handles as plain text", () => {
    const segments = segmentMessageWithMentions("Hi @nobody!", []);
    expect(segments).toEqual([{ type: "text", value: "Hi @nobody!" }]);
  });
});
