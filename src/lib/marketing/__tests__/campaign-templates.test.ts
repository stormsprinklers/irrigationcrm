import assert from "node:assert/strict";
import test from "node:test";
import { getCampaignTemplate } from "../campaign-templates";
import { parseIfElseConfig, resolveIfElseBranch } from "../if-else";

function winterizationTemplate() {
  const template = getCampaignTemplate("sprinkler-winterization-2026");
  assert.ok(template);
  return template;
}

test("winterization template is an independent returning-customer draft", () => {
  const first = winterizationTemplate();
  const second = winterizationTemplate();

  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.initial.flowNodes, second.initial.flowNodes);
  assert.equal(first.initial.type, "DRIP");
  assert.equal(first.initial.audienceFilters.recordType, "CUSTOMERS");
  assert.match(first.initial.name, /2026/);
});

test("winterization template has valid flow targets and current pricing", () => {
  const { flowNodes } = winterizationTemplate().initial;
  const ids = flowNodes.map((node) => node.id);
  const idSet = new Set(ids);

  assert.equal(idSet.size, ids.length);
  assert.equal(flowNodes[0]?.type, "TRIGGER");
  assert.equal(flowNodes.at(-1)?.type, "EXIT");

  const targets: string[] = [];
  for (const node of flowNodes) {
    if (typeof node.config.nextId === "string" && node.config.nextId) {
      targets.push(node.config.nextId);
    }
    if (node.type === "BRANCH") {
      const parsed = parseIfElseConfig(node.config);
      targets.push(
        ...parsed.branches.map((branch) => branch.nextId),
        parsed.timeoutNextId
      );
    }
  }
  assert.ok(targets.every((target) => idSet.has(target)));

  const copy = JSON.stringify(flowNodes);
  assert.match(copy, /\$125/);
  assert.match(copy, /\$15/);
  assert.match(copy, /up to 8/);
  assert.doesNotMatch(copy, /Reply STOP/i);
});

test("winterization reply branch routes positive, negative, and other replies", () => {
  const branch = winterizationTemplate().initial.flowNodes.find((node) => node.type === "BRANCH");
  assert.ok(branch);
  const config = parseIfElseConfig(branch.config);
  const contact = {
    name: "Taylor",
    city: "Salt Lake City",
    companyName: "Test Sprinklers",
    tags: [],
    leadSource: "",
    ltv: 0,
    lastAppointmentAt: null,
  };

  assert.equal(
    resolveIfElseBranch({ ...contact, smsReply: "Yes please" }, config, "reply").nextId,
    "tmp-template-sms-positive"
  );
  assert.equal(
    resolveIfElseBranch({ ...contact, smsReply: "No thanks" }, config, "reply").nextId,
    "tmp-template-exit"
  );
  assert.equal(
    resolveIfElseBranch({ ...contact, smsReply: "Not interested" }, config, "reply").nextId,
    "tmp-template-exit"
  );
  assert.equal(
    resolveIfElseBranch({ ...contact, smsReply: "How late do you work?" }, config, "reply").nextId,
    "tmp-template-sms-other"
  );
  assert.equal(
    resolveIfElseBranch(contact, config, "timeout").nextId,
    "tmp-template-email-2"
  );
});

test("winterization emails use a plain correspondence format", () => {
  const emails = winterizationTemplate().initial.flowNodes.filter(
    (node) => node.type === "SEND_EMAIL"
  );
  assert.equal(emails.length, 2);
  for (const email of emails) {
    assert.equal(email.config.bodyHtml, "");
    assert.match(String(email.config.bodyText), /^Hi \{customer_first_name\},/);
    assert.match(String(email.config.bodyText), /\{company_name\}$/);
    assert.doesNotMatch(String(email.config.bodyText), /!{2,}|act now|limited time/i);
  }
});
