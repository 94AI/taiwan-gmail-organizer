"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildReport, formatReport, createRunner } = require("../skills/taiwan-gmail-organizer/scripts/workflow.cjs");
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const fixture = mode => ({ mode, stage: "review", account: "private@example.test", order: ["synthetic-secret"],
  records: { "synthetic-secret": { status: "previewed", decision: { action: "trash", category: "promotion",
    label_ids: ["private-label"], reason: "private content <script>doBadThings()</script>" } } } });

test("preview separates suggestions from actual changes and omits identifiers and reasons", () => {
  const state = fixture("preview"), report = buildReport(state), output = JSON.stringify(report) + formatReport(report);
  assert.equal(report.recommended.trash, 1); assert.equal(report.successful_changes.trash, 0);
  assert(output.includes("實際修改數為 0")); assert(output.includes("未取得"));
  for (const secret of ["private@example.test", "synthetic-secret", "private-label", "private content", "doBadThings"])
    assert(!output.includes(secret));
});
test("verified operations count once; incomplete changes and no-ops do not count as success", () => {
  const state = fixture("execute");
  state.order = ["archived", "archived", "partial", "unchanged", "exception"];
  state.records = {
    archived: { status: "verified", before: ["INBOX", "UNREAD"], expected: ["L", "UNREAD"], decision: { action: "archive", label_ids: ["L"] } },
    partial: { status: "inflight", before: ["INBOX"], expected: ["TRASH"], decision: { action: "trash" } },
    unchanged: { status: "verified", before: ["INBOX", "UNREAD"], expected: ["INBOX", "UNREAD"], decision: { action: "inbox", category: "security_alert" } },
    exception: { status: "exception", decision: { action: "preserve", category: "uncertain" } }
  };
  const report = buildReport(state);
  assert.equal(report.inventory, 4); assert.equal(report.successful_changes.archive, 1);
  assert.equal(report.successful_changes.trash, 0); assert.equal(report.successful_changes.inbox, 0);
  assert.equal(report.classified, 1); assert.equal(report.retained_without_changes, 1);
  assert.equal(report.pending.inflight, 1); assert.equal(report.pending.exceptions, 1);
  assert.equal(report.attention.actionable, 1); assert.equal(report.attention.uncertain, 1);
});
test("audit issues are deduplicated and unavailable unread counts stay unknown", () => {
  const state = fixture("preview"); state.stage = "needs_review";
  state.audit = { inbox_messages: 9, inbox_unread: null, unfinished: ["same"], missing_important: ["same"],
    protected_missing: ["other"], new_message_ids: ["new", "new"] };
  const report = buildReport(state), output = formatReport(report);
  assert.equal(report.final_check.issues, 2); assert.equal(report.final_check.new_mail, 1);
  assert.equal(report.final_check.inbox_unread, null); assert(output.includes("未讀：未取得"));
  assert(!JSON.stringify(report).includes('"same"'));
});
test("reporting is read-only and works before start; malformed records fail closed", () => {
  const noTools = new Proxy({}, { get: () => () => { throw Error("Unexpected Gmail access"); } });
  const runner = createRunner({ api: noTools, persist: () => { throw Error("Unexpected persistence"); }, policy: {} });
  assert.equal(runner.report().stage, "not_started");
  assert.throws(() => buildReport({ order: ["missing"], records: {} }), /Invalid checkpoint/);
  const broken = fixture("execute"); broken.records["synthetic-secret"].status = "verified";
  assert.throws(() => buildReport(broken), /original and expected/);
});
test("offline CLI leaves its checkpoint unchanged and never prints private parse errors", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-report-test-"));
  try {
    const file = path.join(cwd, "checkpoint.json"), source = JSON.stringify(fixture("preview"));
    fs.writeFileSync(file, source);
    const script = path.resolve(__dirname, "../skills/taiwan-gmail-organizer/scripts/report.cjs");
    let r = spawnSync(process.execPath, [script, file], { encoding: "utf8" });
    assert.equal(r.status, 0); assert(r.stdout.includes("實際修改數為 0"));
    assert.equal(fs.readFileSync(file, "utf8"), source);
    fs.writeFileSync(file, "PRIVATE MALFORMED CONTENT");
    r = spawnSync(process.execPath, [script, file], { encoding: "utf8" });
    assert.notEqual(r.status, 0); assert(!r.stderr.includes("PRIVATE MALFORMED CONTENT"));
    assert.equal(fs.readFileSync(file, "utf8"), "PRIVATE MALFORMED CONTENT");
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

for (const [name, fn] of tests) { fn(); console.log("PASS " + name); }
console.log(`${tests.length} report tests passed; no Gmail access`);
