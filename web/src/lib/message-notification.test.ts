import { describe, expect, it } from "vitest";
import {
  firstMessageNotification,
  MESSAGE_RECEIVED_TYPE,
  MESSAGE_REQUESTED_TYPE,
  REPLY_MESSAGE_NOTIFICATION,
} from "./message-notification";

describe("firstMessageNotification", () => {
  it("uses 'Message Requested' for a cold contact in the request folder", () => {
    expect(firstMessageNotification("request")).toEqual({
      type: MESSAGE_REQUESTED_TYPE,
      title: "Message Requested",
    });
  });

  it("uses 'Received a Message' when the thread lands in the inbox", () => {
    expect(firstMessageNotification("primary")).toEqual({
      type: MESSAGE_RECEIVED_TYPE,
      title: "Received a Message",
    });
  });

  it("treats replies as 'Received a Message'", () => {
    expect(REPLY_MESSAGE_NOTIFICATION).toEqual({
      type: MESSAGE_RECEIVED_TYPE,
      title: "Received a Message",
    });
  });
});
