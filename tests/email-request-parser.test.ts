import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyEmailDraftReply,
  fillDraftDetails,
  parseDraftFromResponse,
  parseStructuredSendFields
} from "../lib/agent/run/email-request-parser.ts";

test("explicit cancel reply is classified as cancel", () => {
  assert.equal(classifyEmailDraftReply("cancel this draft"), "cancel");
  assert.equal(classifyEmailDraftReply("don't send it"), "cancel");
});

test("follow-up edit text is parsed into clean replacement body", () => {
  const parsed = parseStructuredSendFields(
    [
      "send email to x@example.com saying meeting moved to tomorrow",
      "",
      "Additional edits from user: mention that it starts at 3 PM and be polite"
    ].join("\n")
  );

  assert.equal(parsed.recipientEmail, "x@example.com");
  assert.equal(parsed.subject, "Quick note");
  assert.equal(
    parsed.body,
    ["Hi,", "", "Mention that it starts at 3 PM and be polite.", "", "Best regards,"].join("\n")
  );
});

test("informal send rewrites typo 'he his' into second-person phrasing", () => {
  const parsed = parseStructuredSendFields(
    "send mail to maheshsingh3015209@gmail.com that he his working good for the company"
  );

  assert.equal(parsed.recipientEmail, "maheshsingh3015209@gmail.com");
  assert.equal(parsed.subject, "Quick note");
  assert.equal(
    parsed.body,
    [
      "Hi,",
      "",
      "Just wanted to let you know that you are working good for the company.",
      "",
      "Best regards,"
    ].join("\n")
  );
});

test("parseDraftFromResponse extracts subject, to, and body", () => {
  const parsed = parseDraftFromResponse(
    [
      "Here is your draft:",
      "",
      "To: jane@example.com",
      "Subject: Congratulations on Your Promotion",
      "",
      "Hi Jane,",
      "",
      "Congratulations on your new role at VorldX.",
      "You earned it.",
      "",
      "Best regards,"
    ].join("\n")
  );

  assert.equal(parsed?.subject, "Congratulations on Your Promotion");
  assert.equal(parsed?.to, "jane@example.com");
  assert.equal(Boolean(parsed?.body.includes("Hi Jane,")), true);
});

test("fillDraftDetails replaces placeholders and sets missing fields", () => {
  const updated = fillDraftDetails(
    {
      subject: "Congratulations",
      body: "Hi [Recipient's Name],\n\nCongrats on your role at [Company Name].",
      to: null,
      recipientName: null,
      companyName: null,
      status: "draft",
      producedAtTurn: 0
    },
    "his email is sam@example.com company is VorldX his name is Sam"
  );

  assert.equal(updated.to, "sam@example.com");
  assert.equal(updated.companyName, "VorldX");
  assert.equal(updated.recipientName, "Sam");
  assert.equal(Boolean(updated.body.includes("Sam")), true);
  assert.equal(Boolean(updated.body.includes("VorldX")), true);
});
