import assert from "node:assert/strict";
import test from "node:test";

import {
  extractSendReceipt,
  findSentMailboxMatch
} from "../lib/agent/tools/send-verification.ts";

interface TestEmailRecord {
  id: string;
  threadId: string | null;
  from: string | null;
  to: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  receivedAt: string | null;
  raw: Record<string, unknown>;
}

function emailRecord(
  input: Partial<TestEmailRecord> & { id: string }
): TestEmailRecord {
  return {
    id: input.id,
    threadId: input.threadId ?? null,
    from: input.from ?? null,
    to: input.to ?? null,
    subject: input.subject ?? null,
    snippet: input.snippet ?? null,
    bodyText: input.bodyText ?? null,
    receivedAt: input.receivedAt ?? null,
    raw: input.raw ?? {}
  };
}

test("extractSendReceipt ignores connection-like ids as delivery proof", () => {
  const receipt = extractSendReceipt({
    id: "ca_12345678901234567890"
  });

  assert.equal(receipt.deliveryVerified, false);
  assert.equal(receipt.messageId, null);
});

test("extractSendReceipt uses explicit Gmail messageId fields", () => {
  const receipt = extractSendReceipt({
    messageId: "18fd43a2c9b71a9f"
  });

  assert.equal(receipt.deliveryVerified, true);
  assert.equal(receipt.messageId, "18fd43a2c9b71a9f");
});

test("findSentMailboxMatch does not verify unrelated sent messages", () => {
  const matched = findSentMailboxMatch({
    to: "maheshsingh3015209@gmail.com",
    subject: "Quick note",
    emails: [
      emailRecord({
        id: "18fd43a2c9b71a9f",
        to: "someoneelse@example.com",
        subject: "Different subject"
      })
    ]
  });

  assert.equal(matched, null);
});

test("findSentMailboxMatch verifies recipient and subject match", () => {
  const matched = findSentMailboxMatch({
    to: "maheshsingh3015209@gmail.com",
    subject: "Quick note",
    emails: [
      emailRecord({
        id: "18fd43a2c9b71a9f",
        to: "maheshsingh3015209@gmail.com",
        subject: "Quick note about performance"
      })
    ]
  });

  assert.equal(matched?.id, "18fd43a2c9b71a9f");
});

test("findSentMailboxMatch rejects stale sent messages for new attempts", () => {
  const matched = findSentMailboxMatch({
    to: "mp6590648@gmail.com",
    subject: "Quick note",
    body: "Just wanted to let you know that you are working good for the company.",
    sentAfterMs: Date.parse("2026-03-13T07:00:00Z"),
    emails: [
      emailRecord({
        id: "19cd6c1c76d98a2d",
        to: "mp6590648@gmail.com",
        subject: "Quick note",
        bodyText: "Just wanted to let you know that you are working good for the company.",
        receivedAt: "2026-03-10T07:59:09Z"
      })
    ]
  });

  assert.equal(matched, null);
});

test("findSentMailboxMatch accepts fresh sent message evidence", () => {
  const matched = findSentMailboxMatch({
    to: "mp6590648@gmail.com",
    subject: "Quick note",
    body: "Just wanted to let you know that you are working good for the company.",
    sentAfterMs: Date.parse("2026-03-13T06:58:00Z"),
    emails: [
      emailRecord({
        id: "19ff6c1c76d98a2d",
        to: "mp6590648@gmail.com",
        subject: "Quick note",
        bodyText: "Just wanted to let you know that you are working good for the company.",
        receivedAt: "2026-03-13T07:00:30Z"
      })
    ]
  });

  assert.equal(matched?.id, "19ff6c1c76d98a2d");
});
