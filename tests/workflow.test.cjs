"use strict";
const assert = require("node:assert/strict");
const { createRunner } = require("../skills/taiwan-gmail-organizer/scripts/workflow.cjs");
const clone = x => JSON.parse(JSON.stringify(x));
const base = { policy_version: 2, batch_size: 25, expected_account_email: "tester@example.test",
  pending_label: "none", important_mail: "inbox", bank_successful_login_notices: "trash_when_authorized",
  statements: { bank: { daily: "trash_when_authorized" }, futures: { daily: "trash_when_authorized" }, securities: { daily: "keep" } } };
const authorized = ["organize", "trash_promotion", "trash_daily_bank", "trash_daily_futures", "trash_bank_successful_login"];
function fixture(count = 1, overrides = {}) {
  const box = Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i), { id: String(i), history_id: "1", label_ids: ["INBOX", "UNREAD"], payload: {} }]));
  let saved, mutations = 0, searchCalls = 0;
  const api = {
    profile: async () => ({ email: "tester@example.test" }),
    labels: async () => ({ labels: [{ id: "L", name: "收藏", type: "user" }, { id: "P", name: "待處理", type: "user" },
      { id: "INBOX", type: "system", messagesUnread: Object.values(box).filter(m => m.label_ids.includes("INBOX") && m.label_ids.includes("UNREAD")).length }] }),
    search: async ({ next_page_token }) => {
      searchCalls++;
      const ids = Object.values(box).filter(m => m.label_ids.includes("INBOX") && !m.label_ids.includes("TRASH")).map(m => m.id);
      const offset = Number(next_page_token || 0);
      return { message_ids: ids.slice(offset, offset + 100), next_page_token: offset + 100 < ids.length ? String(offset + 100) : null };
    },
    read: async ids => ({ responses: ids.map(id => clone(box[id])) }),
    modify: async ({ message_ids, add_labels = [], remove_labels = [] }) => {
      mutations++;
      for (const id of message_ids) {
        box[id].label_ids = [...new Set([...box[id].label_ids.filter(x => !remove_labels.includes(x)), ...add_labels])];
        box[id].history_id = String(Number(box[id].history_id) + 1);
      }
      return {};
    },
    trash: async ids => {
      mutations++;
      for (const id of ids) {
        box[id].label_ids = [...new Set([...box[id].label_ids.filter(x => x !== "INBOX"), "TRASH"])];
        box[id].history_id = String(Number(box[id].history_id) + 1);
      }
      return {};
    }, ...overrides
  };
  const persist = async s => { saved = clone(s); };
  const runner = options => createRunner({ api, persist, policy: base, mode: "execute", authorization: authorized, ...options });
  return { api, box, persist, runner, saved: () => saved, mutations: () => mutations, searches: () => searchCalls };
}
const archive = id => ({ id, action: "archive", category: "routine", label_ids: ["L"], reason: "一般通知已讀內容" });
const trash = id => ({ id, action: "trash", category: "daily_statement", institution_type: "futures", period: "daily",
  content_reviewed: true, certainty: "confirmed", reason: "普通每日期貨報表，已核對正文" });
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("all 231 IDs paginated, deduplicated, archived in 25-message batches", async () => {
  const f = fixture(231), r = f.runner(); await r.start();
  let batches = 0;
  for (;;) { const ms = await r.nextBatch(); if (!ms.length) break; assert(ms.length <= 25); await r.plan(ms.map(m => archive(m.id))); await r.executeBatch(); batches++; }
  const result = await r.audit(); assert.equal(result.inventory, 231); assert.equal(result.changed.archive, 231);
  assert.equal(result.stage, "completed_snapshot"); assert.equal(batches, 10);
  assert.equal(r.report().successful_changes.archive, 231); assert.equal(r.report().classified, 231);
  assert(Object.values(f.box).every(m => m.label_ids.includes("UNREAD") && !m.label_ids.includes("INBOX") && m.label_ids.includes("L")));
});
test("account mismatch blocks before inventory and mutation", async () => {
  const f = fixture(1, { profile: async () => ({ email: "someone@example.test" }) });
  await assert.rejects(() => f.runner().start(), /Wrong connected/); assert.equal(f.mutations(), 0);
});
test("preview remains read-only even if preferences/requested authorization permit writes", async () => {
  const f = fixture(), r = f.runner({ mode: "preview" }); await r.start(); await r.nextBatch(); await r.plan([trash("0")]);
  await assert.rejects(() => r.executeBatch(), /Preview/); assert.equal(f.mutations(), 0); assert.equal((await r.audit()).stage, "preview_complete");
  assert.equal(r.report().recommended.trash, 1); assert.equal(r.report().successful_changes.trash, 0);
});
test("monthly statements and securities daily reports cannot be trashed", async () => {
  const f = fixture(), r = f.runner(); await r.start(); await r.nextBatch();
  await assert.rejects(() => r.plan([{ ...trash("0"), period: "monthly" }]), /monthly/);
  await assert.rejects(() => r.plan([{ ...trash("0"), institution_type: "securities" }]), /bank\/futures/); assert.equal(f.mutations(), 0);
});
test("protected mail, margin calls, uncertain mail, mixed receipts and paid courses survive", async () => {
  const f = fixture(), r = f.runner({ policy: { ...base, protected_message_ids: ["0"] } }); await r.start(); await r.nextBatch();
  await assert.rejects(() => r.plan([trash("0")]), /Protected/);
  const g = fixture(), q = g.runner(); await q.start(); await q.nextBatch();
  for (const d of [{ ...trash("0"), category: "financial_risk" }, { ...archive("0"), category: "uncertain" },
    { ...trash("0"), preserve_document: true }, { ...trash("0"), paid_course: true }]) await assert.rejects(() => q.plan([d]));
  assert.equal(g.mutations(), 0);
});
test("content evidence, valid labels and explicit permission are required", async () => {
  const f = fixture(), r = f.runner({ authorization: [] }); await r.start(); await r.nextBatch();
  await assert.rejects(() => r.plan([trash("0")]), /authorization/);
  await assert.rejects(() => r.plan([{ ...archive("0"), label_ids: ["UNREAD"] }]), /existing user/);
  await assert.rejects(() => r.plan([{ ...archive("0"), label_ids: ["P"] }]), /Pending/);
  const g = fixture(), q = g.runner(); await q.start(); await q.nextBatch();
  await assert.rejects(() => q.plan([{ ...trash("0"), content_reviewed: false }]), /reviewed content/);
});
test("timeout after Gmail applied Trash is verified, not repeated", async () => {
  const f = fixture(); const actual = f.api.trash;
  f.api.trash = async ids => { await actual(ids); throw new Error("transport timed out after commit"); };
  const r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([trash("0")]); await r.executeBatch(); await r.executeBatch();
  assert.equal(r.summary().changed.trash, 1); assert.equal(f.mutations(), 1); assert(f.box["0"].label_ids.includes("UNREAD"));
});
test("partial archive survives a durable checkpoint and a fresh runner", async () => {
  const f = fixture(); const actual = f.api.modify; let fail = true;
  f.api.modify = async args => { if (args.remove_labels && fail) { fail = false; throw new Error("transport failure before archive"); } return actual(args); };
  let r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([archive("0")]); await r.executeBatch();
  assert.equal(r.summary().counts.inflight, 1); assert(f.box["0"].label_ids.includes("L"));
  r = f.runner({ state: f.saved() }); await r.start(); await r.executeBatch(); assert.equal((await r.audit()).changed.archive, 1);
});
test("resumed state cannot supply authorization or reuse changed policy", async () => {
  const f = fixture(), r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([trash("0")]);
  await assert.rejects(() => f.runner({ state: f.saved(), authorization: [] }).executeBatch(), /authorization/);
  assert.throws(() => f.runner({ state: f.saved(), policy: { ...base, policy_version: 3 } }), /Policy\/mode/); assert.equal(f.mutations(), 0);
});
test("concurrent manual Trash/read-state changes are preserved", async () => {
  const f = fixture(), r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([archive("0")]);
  f.box["0"].label_ids = ["TRASH", "UNREAD"];
  await r.executeBatch(); assert.equal(r.summary().counts.exception, 1); assert.equal(f.mutations(), 0);
});
test("permission errors stop the run instead of retrying other groups", async () => {
  const f = fixture(2, { modify: async () => ({ isError: true, content: [{ text: "403 access denied" }] }) });
  const r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([archive("0"), trash("1")]);
  await assert.rejects(() => r.executeBatch(), /Gmail failed/); assert.equal(r.summary().stage, "permission_blocked");
  assert(!f.box["1"].label_ids.includes("TRASH"));
});
test("final audit reports new arrivals, missing important mail and leaked archives", async () => {
  const f = fixture(2), r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([archive("0"), { id: "1", action: "inbox", category: "rights_action", reason: "需要回覆" }]);
  await r.executeBatch(); f.box["0"].label_ids.push("INBOX"); f.box["1"].label_ids = ["UNREAD"];
  f.box.new = { id: "new", label_ids: ["INBOX"], payload: {} };
  const result = await r.audit(); assert.equal(result.stage, "needs_review");
  assert.deepEqual(result.audit.new_message_ids, ["new"]); assert.deepEqual(result.audit.unexpected_inbox, ["0"]); assert.deepEqual(result.audit.missing_important, ["1"]);
});
test("an earlier failed group cannot exhaust retries for untouched later mail", async () => {
  const f = fixture(2); const actual = f.api.modify;
  f.api.modify = async args => { if (args.remove_labels) throw Error("transport timeout before archive"); return actual(args); };
  const r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([archive("0"), trash("1")]);
  for (let i = 0; i < 3; i++) await r.executeBatch();
  assert.equal(r.state().records["1"].status, "verified"); assert.equal(r.state().records["1"].attempts, 1);
  assert.equal(r.state().records["0"].status, "exception"); assert.equal(r.summary().changed.trash, 1);
});
test("manual restore after an ambiguous crash is not overwritten on resume", async () => {
  const f = fixture(); f.box["0"].history_id = "1";
  const originalModify = f.api.modify, originalRead = f.api.read;
  f.api.modify = async args => { await originalModify(args); f.box["0"].history_id = "2"; if (args.remove_labels) throw Error("timeout after archive"); return {}; };
  f.api.read = async ids => { if (f.mutations()) throw Error("verification transport closed"); return originalRead(ids); };
  let r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([archive("0")]); await assert.rejects(() => r.executeBatch());
  f.box["0"].label_ids.push("INBOX"); f.box["0"].history_id = "3"; f.api.read = originalRead;
  const count = f.mutations(); r = f.runner({ state: f.saved() }); await r.start(); await r.executeBatch();
  assert.equal(r.state().records["0"].status, "exception"); assert.equal(f.mutations(), count); assert(f.box["0"].label_ids.includes("INBOX"));
});
test("final audit detects a restored Trash message and removed classification", async () => {
  const f = fixture(2), r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([trash("0"), archive("1")]); await r.executeBatch();
  f.box["0"].label_ids = ["UNREAD"]; f.box["1"].label_ids = ["UNREAD"];
  const result = await r.audit(); assert.equal(result.stage, "needs_review"); assert.deepEqual(result.audit.current_state_mismatches, ["0", "1"]);
});
test("direct permission-denied exceptions stop before other groups", async () => {
  const f = fixture(2, { modify: async () => { throw Error("Permission denied"); } });
  const r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([archive("0"), trash("1")]);
  await assert.rejects(() => r.executeBatch(), /Permission denied/); assert.equal(r.summary().stage, "permission_blocked");
  assert.equal(r.state().records["1"].attempts, 0);
});
test("ambiguous resume without history preserves a manual Inbox restore", async () => {
  const f = fixture(), originalRead = f.api.read, originalModify = f.api.modify;
  const withoutHistory = async ids => ({ responses: (await originalRead(ids)).responses.map(({ history_id, ...m }) => m) });
  f.api.read = async ids => { if (f.mutations()) throw Error("verification transport closed"); return withoutHistory(ids); };
  f.api.modify = async args => { await originalModify(args); if (args.remove_labels) throw Error("timeout after archive"); return {}; };
  let r = f.runner(); await r.start(); await r.nextBatch(); await r.plan([archive("0")]); await assert.rejects(() => r.executeBatch());
  f.box["0"].label_ids.push("INBOX"); f.api.read = withoutHistory;
  const count = f.mutations(); r = f.runner({ state: f.saved() }); await r.start(); await r.executeBatch();
  assert.equal(r.state().records["0"].status, "exception"); assert.equal(f.mutations(), count); assert(f.box["0"].label_ids.includes("INBOX"));
});
test("manual Inbox addition after archived-mail review is preserved", async () => {
  const f = fixture(1, { search: async () => ({ message_ids: ["0"] }) });
  f.box["0"].label_ids = ["UNREAD", "L"];
  const r = f.runner(); await r.start(["label:old-daily-reports"]); await r.nextBatch(); await r.plan([trash("0")]);
  f.box["0"].label_ids.push("INBOX"); await r.executeBatch();
  assert.equal(r.state().records["0"].status, "exception"); assert.equal(f.mutations(), 0); assert(f.box["0"].label_ids.includes("INBOX"));
});

(async () => {
  for (const [name, fn] of tests) { await fn(); console.log("PASS " + name); }
  console.log(`${tests.length} behavioral tests passed; no live Gmail writes`);
})().catch(e => { console.error(e); process.exitCode = 1; });
