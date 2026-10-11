"use strict";

// Codex supplies existing Gmail tools and storage. This file has no credentials.
const unique = xs => [...new Set(xs)];
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const canonical = x => JSON.stringify(x, (_, v) => v && !Array.isArray(v) && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
function data(r) {
  if (!r || r.isError) {
    const e = new Error("Gmail failed; inspect the actual error before retrying");
    e.permission = /permission|unauthorized|access denied|401|403|授權|權限/i.test(JSON.stringify(r));
    throw e;
  }
  return r.structuredContent || r;
}

function createRunner({ api, persist, policy, mode = "preview", authorization = [], state = null }) {
  if (!api || typeof persist !== "function") throw new Error("Gmail adapter and durable persistence required");
  if (!["preview", "execute"].includes(mode)) throw new Error("Invalid mode");
  const size = policy.batch_size || 25, signature = canonical(policy);
  if (size < 20 || size > 30) throw new Error("Batch size must be 20–30");
  if (state && (state.version !== 1 || state.policy_signature !== signature || state.mode !== mode))
    throw new Error("Policy/mode changed: start a new inventory, not old decisions");
  let s = state;
  const save = async () => { s.updated_at = new Date().toISOString(); await persist(JSON.parse(JSON.stringify(s))); };
  async function profile() {
    const p = data(await api.profile()), expected = s?.account || policy.expected_account_email;
    if (!p.email || (expected && p.email.toLowerCase() !== expected.toLowerCase()))
      throw new Error("Wrong connected Gmail account; no changes permitted");
    return p.email;
  }
  async function read(ids) {
    const ms = data(await api.read(ids)).responses;
    if (!Array.isArray(ms) || ms.length !== ids.length || !same(ms.map(m => m.id), ids) ||
        ms.some(m => !Array.isArray(m.label_ids))) throw new Error("Incomplete read; do not mutate");
    return ms;
  }
  async function collect(query) {
    const ids = [], tokens = new Set(); let token;
    do {
      const p = data(await api.search({ query, max_results: 100, ...(token ? { next_page_token: token } : {}) }));
      if (!Array.isArray(p.message_ids)) throw new Error("Missing search IDs");
      ids.push(...p.message_ids); token = p.next_page_token;
      if (token && tokens.has(token)) throw new Error("Repeated page token");
      if (token) tokens.add(token);
    } while (token);
    return unique(ids);
  }
  async function start(queries = ["in:inbox -in:trash -in:spam"]) {
    const account = await profile(); if (s) return summary();
    const labels = data(await api.labels()).labels;
    if (!Array.isArray(labels)) throw new Error("Missing labels");
    const ids = []; for (const q of queries) ids.push(...await collect(q));
    s = { version: 1, account, mode, policy_signature: signature, stage: "review", queries,
      created_at: new Date().toISOString(), labels: labels.map(l => ({ id: l.id, name: l.name, type: l.type })),
      order: unique(ids), records: {}, audit: null };
    for (const id of s.order) s.records[id] = { status: "queued" };
    await save(); return summary();
  }
  async function nextBatch() {
    if (!s) throw new Error("Start/load the run first");
    const ids = s.order.filter(id => s.records[id].status === "queued").slice(0, size);
    if (!ids.length) return [];
    const ms = await read(ids);
    for (const m of ms) {
      s.records[m.id].review_labels = [...m.label_ids];
      s.records[m.id].review_history = m.history_id;
    }
    await save(); return ms;
  }
  function validate(id, decision, planning = true) {
    const r = s?.records[id];
    if (!r || (planning && r.status !== "queued") || !r.review_labels) throw new Error("Read a queued message before planning");
    const d = { ...decision, label_ids: unique(decision.label_ids || []) };
    if (!["archive", "trash", "inbox", "preserve"].includes(d.action) || !d.category ||
        typeof d.reason !== "string" || !d.reason.trim() || d.reason.length > 500)
      throw new Error("Action, category and compact reason required");
    const allowed = new Set(s.labels.filter(l => l.type === "user").map(l => l.id));
    if (d.label_ids.some(x => !allowed.has(x))) throw new Error("Only existing user labels may be added");
    if (policy.pending_label === "none" && d.label_ids.some(x => s.labels.find(l => l.id === x)?.name === "待處理"))
      throw new Error("Pending label disabled for this account");
    const protectedIds = [...(policy.protected_message_ids || []), ...(policy.keep_inbox_message_ids || [])];
    const urgent = d.requires_action || ["financial_risk", "security_alert", "account_deletion", "rights_action"].includes(d.category);
    if ((protectedIds.includes(id) || urgent || (d.important && policy.important_mail === "inbox")) && d.action !== "inbox")
      throw new Error("Protected/actionable/user-important mail must stay in Inbox");
    if (d.category === "uncertain" && !["inbox", "preserve"].includes(d.action)) throw new Error("Preserve uncertain mail");
    if (d.action === "archive" && !d.label_ids.length && !r.review_labels.some(x => allowed.has(x)))
      throw new Error("Classify before archiving");
    if (d.action === "trash") {
      if (!d.content_reviewed || d.certainty !== "confirmed") throw new Error("Trash requires reviewed content and confirmed evidence");
      if (d.preserve_document || d.paid_course || d.period === "monthly" || ["monthly_statement", "receipt", "paid_course"].includes(d.category))
        throw new Error("Preserved documents/monthly statements cannot be trashed");
      let scope;
      if (d.category === "promotion") scope = "trash_promotion";
      else if (d.category === "bank_successful_login") {
        if (policy.bank_successful_login_notices !== "trash_when_authorized") throw new Error("Bank login deletion disabled");
        scope = "trash_bank_successful_login";
      } else if (d.category === "daily_statement") {
        if (d.period !== "daily" || !["bank", "futures"].includes(d.institution_type) ||
            policy.statements?.[d.institution_type]?.daily !== "trash_when_authorized")
          throw new Error("Daily deletion limited to configured bank/futures reports");
        scope = "trash_daily_" + d.institution_type;
      } else throw new Error("This category cannot be trashed");
      if (mode === "execute" && !authorization.includes(scope)) throw new Error("Missing human authorization: " + scope);
    }
    if (mode === "execute" && (["archive", "inbox"].includes(d.action) || d.label_ids.length) && !authorization.includes("organize"))
      throw new Error("Missing human authorization to organize mail");
    return d;
  }
  async function plan(ds) {
    if (!ds.length || ds.length > size || unique(ds.map(d => d.id)).length !== ds.length) throw new Error("Plan one unique batch");
    const validated = ds.map(({ id, ...d }) => ({ id, decision: validate(id, d) }));
    for (const { id, decision } of validated) Object.assign(s.records[id], { decision, status: mode === "preview" ? "previewed" : "planned" });
    await save(); return summary();
  }
  function expected(before, d) {
    let ls = unique([...before, ...d.label_ids]);
    if (d.action === "archive") ls = ls.filter(x => x !== "INBOX");
    if (d.action === "trash") ls = unique([...ls.filter(x => x !== "INBOX"), "TRASH"]);
    if (d.action === "inbox") ls = unique([...ls, "INBOX"]);
    return ls;
  }
  async function executeBatch() {
    if (mode !== "execute") throw new Error("Preview cannot mutate Gmail");
    await profile();
    const ids = s.order.filter(id => ["inflight", "planned"].includes(s.records[id].status)).slice(0, size);
    if (!ids.length) return summary();
    // Authorization comes from the current human request, never the state file.
    for (const id of ids) validate(id, s.records[id].decision, false);
    const current = await read(ids);
    for (const m of current) {
      const r = s.records[m.id];
      if (r.status === "planned") {
        if (!same(r.review_labels, m.label_ids) ||
            (r.review_history && m.history_id && r.review_history !== m.history_id) ||
            m.label_ids.includes("TRASH") || m.label_ids.includes("SPAM")) {
          r.status = "exception"; r.exception = "Mailbox changed after review; preserved"; continue;
        }
        r.before = [...m.label_ids]; r.expected = expected(m.label_ids, r.decision); r.attempts = 0; r.status = "inflight";
        r.last_observed_history = m.history_id;
      }
      if (same(m.label_ids, r.expected)) r.status = "verified";
    }
    // Save original/expected labels before mutation: recovery reads Gmail first.
    await save();
    const active = ids.filter(id => s.records[id].status === "inflight");
    for (const m of current.filter(m => active.includes(m.id))) {
      const r = s.records[m.id], allowed = unique([...r.before, ...r.expected]), required = r.before.filter(x => r.expected.includes(x));
      const historyChanged = r.last_observed_history && m.history_id && r.last_observed_history !== m.history_id;
      const retryWithoutHistory = r.attempts > 0 && (!r.last_observed_history || !m.history_id);
      if (r.attempts >= 2 || historyChanged || retryWithoutHistory || m.label_ids.some(x => !allowed.includes(x)) || required.some(x => !m.label_ids.includes(x))) {
        r.status = "exception"; r.exception = "Retry limit or concurrent labels/read-state change; preserved";
      }
    }
    await save();
    const work = active.filter(id => s.records[id].status === "inflight"), groups = new Map();
    for (const id of work) {
      const d = s.records[id].decision, key = JSON.stringify({ action: d.action, labels: [...d.label_ids].sort() });
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(id);
    }
    try {
      for (const [key, message_ids] of groups) {
        const { action, labels } = JSON.parse(key);
        // Only a group that reaches an API call has consumed a retry.
        for (const id of message_ids) s.records[id].attempts++;
        await save();
        if (labels.length) data(await api.modify({ message_ids, add_labels: labels }));
        if (action === "archive") data(await api.modify({ message_ids, remove_labels: ["INBOX"] }));
        if (action === "inbox") data(await api.modify({ message_ids, add_labels: ["INBOX"] }));
        if (action === "trash") data(await api.trash(message_ids));
      }
    } catch (e) {
      s.last_error = String(e.message || e).slice(0, 300);
      if (e.permission || /permission|unauthorized|access denied|401|403|授權|權限/i.test(s.last_error)) {
        s.stage = "permission_blocked"; await save(); throw e;
      }
    }
    // Never replay blindly after a timeout; verify actual state first.
    if (work.length) for (const m of await read(work)) {
      const r = s.records[m.id];
      r.last_observed_history = m.history_id;
      if (same(m.label_ids, r.expected)) r.status = "verified";
      else r.last_verification = "Read actual state before retry";
    }
    await save(); return summary();
  }
  function summary() {
    if (!s) return { stage: "not_started" };
    const counts = { queued: 0, planned: 0, inflight: 0, previewed: 0, verified: 0, exception: 0 };
    const changed = { archive: 0, trash: 0, inbox: 0, preserve: 0 };
    for (const r of Object.values(s.records)) {
      counts[r.status]++;
      if (r.status === "verified" && !same(r.before, r.expected)) changed[r.decision.action]++;
    }
    return { account: s.account, mode, stage: s.stage, inventory: s.order.length, counts, changed, audit: s.audit };
  }
  async function audit() {
    await profile();
    const inbox = await collect("in:inbox -in:trash -in:spam"), labels = data(await api.labels()).labels;
    const unfinished = s.order.filter(id => !["verified", "exception", "previewed"].includes(s.records[id].status));
    const unexpected = s.order.filter(id => s.records[id].status === "verified" && ["archive", "trash"].includes(s.records[id].decision.action) && inbox.includes(id));
    const missing = s.order.filter(id => s.records[id].status === "verified" && s.records[id].decision.action === "inbox" && !inbox.includes(id));
    const protectedIds = unique([...(policy.protected_message_ids || []), ...(policy.keep_inbox_message_ids || [])]);
    const protectedMissing = protectedIds.filter(id => !inbox.includes(id));
    const mismatches = [];
    const verified = s.order.filter(id => s.records[id].status === "verified");
    for (let offset = 0; offset < verified.length; offset += size)
      for (const m of await read(verified.slice(offset, offset + size)))
        if (!same(m.label_ids, s.records[m.id].expected)) mismatches.push(m.id);
    s.audit = { inbox_messages: inbox.length, inbox_unread: labels.find(l => l.id === "INBOX")?.messagesUnread ?? null,
      unfinished, unexpected_inbox: unexpected, missing_important: missing, protected_missing: protectedMissing,
      current_state_mismatches: mismatches,
      new_message_ids: inbox.filter(id => !s.records[id]), verified_at: new Date().toISOString() };
    s.stage = unfinished.length + unexpected.length + missing.length + protectedMissing.length + mismatches.length ? "needs_review" :
      mode === "preview" ? "preview_complete" : Object.values(s.records).some(r => r.status === "exception") ? "completed_with_exceptions" : "completed_snapshot";
    await save(); return summary();
  }
  return { start, nextBatch, plan, executeBatch, audit, summary, state: () => JSON.parse(JSON.stringify(s)) };
}

module.exports = { createRunner };
