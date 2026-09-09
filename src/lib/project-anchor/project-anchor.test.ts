import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { harvestProjectCodeFromField, isHarvestProjectCodeAllowed } from "./config.ts";
import {
  fieldIdFromNames,
  isHarvestProjectFieldName,
  isHarvestTaskFieldName,
  jqlForHarvestProjectField,
} from "./jira-fields.ts";
import { isLikelyDuplicateHarvestEntry, pickDuplicateCandidate } from "./duplicates.ts";
import { extractTaskTag, findTaskAssignment, resolveRequestedTaskName, STANDARD_HARVEST_ROLES } from "./tasks.ts";
import {
  hoursFromSeconds,
  jiraCommentToText,
  parseWorklogWebhook,
  spentDateFromStarted,
  verifyJiraWebhookSignature,
  verifyWebhookAuth,
} from "./webhook.ts";

describe("webhook signature", () => {
  it("accepts the Atlassian HMAC example", () => {
    const secret = "It's a Secret to Everybody";
    const payload = "Hello World!";
    const sig = createHmac("sha256", secret).update(payload).digest("hex");
    assert.equal(
      verifyJiraWebhookSignature(payload, `sha256=${sig}`, secret),
      true
    );
  });

  it("rejects a bad signature", () => {
    assert.equal(verifyJiraWebhookSignature("{}", "sha256=deadbeef", "secret"), false);
  });

  it("accepts a query token when HMAC is missing (UI webhooks)", () => {
    assert.equal(
      verifyWebhookAuth({ rawBody: "{}", signatureHeader: null, queryToken: "s3cret", secret: "s3cret" }),
      true
    );
    assert.equal(
      verifyWebhookAuth({ rawBody: "{}", signatureHeader: null, queryToken: "nope", secret: "s3cret" }),
      false
    );
  });
});

describe("parseWorklogWebhook", () => {
  it("parses worklog_created and ignores other events", () => {
    const parsed = parseWorklogWebhook({
      webhookEvent: "jira:worklog_created",
      worklog: {
        id: "10001",
        issueId: "20002",
        timeSpentSeconds: 5400,
        started: "2026-09-09T09:00:00.000-0500",
        author: { accountId: "abc" },
        comment: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "[UX] research" }] }] },
      },
    });
    assert.ok(parsed);
    assert.equal(parsed?.webhookEvent, "worklog_created");
    assert.equal(parsed?.worklogId, "10001");
    assert.equal(parsed?.commentText, "[UX] research");
    assert.equal(parseWorklogWebhook({ webhookEvent: "comment_created" }), null);
  });
});

describe("hours and dates", () => {
  it("converts seconds to hours", () => {
    assert.equal(hoursFromSeconds(3600), 1);
    assert.equal(hoursFromSeconds(5400), 1.5);
  });

  it("uses Central date from started timestamp", () => {
    assert.equal(spentDateFromStarted("2026-09-09T10:00:00.000-05:00"), "2026-09-09");
  });

  it("flattens ADF comments", () => {
    assert.equal(jiraCommentToText("plain"), "plain");
    assert.equal(
      jiraCommentToText({ content: [{ content: [{ text: "hello" }, { text: "world" }] }] }),
      "hello world"
    );
  });
});

describe("task resolution", () => {
  const assignments = [
    { id: 1, is_active: true, task: { id: 10, name: "Application Developer" } },
    { id: 2, is_active: true, task: { id: 20, name: "Project Manager" } },
    { id: 3, is_active: true, task: { id: 30, name: "UI/UX Designer" } },
  ];

  it("prefers comment tag, then issue field, then user default", () => {
    assert.equal(
      resolveRequestedTaskName({ commentTag: "UX", issueTaskField: "Application Developer", userDefaultTask: "PM" }),
      "UI/UX Designer"
    );
    assert.equal(
      resolveRequestedTaskName({ commentTag: null, issueTaskField: "Application Developer", userDefaultTask: "PM" }),
      "Application Developer"
    );
    assert.equal(
      resolveRequestedTaskName({ commentTag: null, issueTaskField: null, userDefaultTask: "PM" }),
      "Project Manager"
    );
    assert.equal(resolveRequestedTaskName({ commentTag: null, issueTaskField: null, userDefaultTask: null }), null);
  });

  it("extracts [TaskName] tags and maps aliases", () => {
    assert.equal(extractTaskTag("CS-106 [Dev] impl"), "Dev");
    const found = findTaskAssignment(assignments, "Dev");
    assert.equal(found?.task.id, 10);
    assert.equal(findTaskAssignment(assignments, "PM")?.task.id, 20);
  });

  it("uses a company-wide Harvest role list", () => {
    assert.deepEqual([...STANDARD_HARVEST_ROLES], [
      "Application Developer",
      "Back-End Developer",
      "Front End Developer",
      "DevOps Engineer",
      "DevOps Lead",
      "Project Manager",
      "QA Analyst",
      "Technical Architect",
      "UI/UX Designer",
    ]);
  });
});

describe("jira field matching", () => {
  it("matches Harvest Billing Project names", () => {
    assert.equal(isHarvestProjectFieldName("Harvest Billing Project"), true);
    assert.equal(isHarvestProjectFieldName("harvest-project"), true);
    assert.equal(isHarvestProjectFieldName("Harvest Billing Task"), false);
    assert.equal(isHarvestTaskFieldName("Harvest Billing Task"), true);
    assert.equal(isHarvestTaskFieldName("Harvest Billing Project"), false);
  });

  it("reads field ids from search expand=names", () => {
    assert.equal(
      fieldIdFromNames(
        { summary: "Summary", customfield_10123: "Harvest Billing Project" },
        isHarvestProjectFieldName
      ),
      "customfield_10123"
    );
  });

  it("uses cf[] JQL when the field id is known", () => {
    assert.deepEqual(jqlForHarvestProjectField("customfield_10123")[0], "cf[10123] is not EMPTY ORDER BY updated DESC");
    assert.ok(jqlForHarvestProjectField(null)[0].includes("Harvest Billing Project"));
  });
});

describe("allowlist", () => {
  it("allows VL906 by default", () => {
    const previous = process.env.HARVEST_ALLOWED_PROJECT_CODES;
    delete process.env.HARVEST_ALLOWED_PROJECT_CODES;
    try {
      assert.equal(isHarvestProjectCodeAllowed("VL906"), true);
      assert.equal(isHarvestProjectCodeAllowed("OTHER"), false);
      assert.equal(isHarvestProjectCodeAllowed(""), false);
      assert.equal(harvestProjectCodeFromField(" vl906 "), "VL906");
      assert.equal(harvestProjectCodeFromField(""), null);
      assert.equal(harvestProjectCodeFromField(null), null);
    } finally {
      if (previous == null) delete process.env.HARVEST_ALLOWED_PROJECT_CODES;
      else process.env.HARVEST_ALLOWED_PROJECT_CODES = previous;
    }
  });
});

describe("double billing detection", () => {
  const target = {
    harvestUserId: 1,
    spentDate: "2026-09-09",
    hours: 2,
    projectId: 99,
    issueKey: "CS-106",
  };

  it("matches Harvest plugin entries tied to the same Jira issue", () => {
    assert.equal(
      isLikelyDuplicateHarvestEntry(
        {
          id: 55,
          user_id: 1,
          spent_date: "2026-09-09",
          hours: 2,
          project_id: 99,
          notes: null,
          external_reference: { id: "CS-106", permalink: "https://example.atlassian.net/browse/CS-106" },
        },
        target
      ),
      true
    );
  });

  it("does not match a different Jira issue", () => {
    assert.equal(
      isLikelyDuplicateHarvestEntry(
        {
          id: 56,
          user_id: 1,
          spent_date: "2026-09-09",
          hours: 2,
          project_id: 99,
          notes: "CS-107",
          external_reference: { id: "CS-107" },
        },
        target
      ),
      false
    );
  });

  it("skips Harvest entries already mapped to another worklog", () => {
    const picked = pickDuplicateCandidate(
      [
        {
          id: 55,
          user_id: 1,
          spent_date: "2026-09-09",
          hours: 2,
          project_id: 99,
          notes: "CS-106",
        },
      ],
      target,
      new Set([55])
    );
    assert.equal(picked, null);
  });
});
