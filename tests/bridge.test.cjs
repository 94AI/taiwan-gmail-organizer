"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const loadRunner = require("../skills/taiwan-gmail-organizer/scripts/codex-bridge.cjs");

(async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-runner-test-"));
  try {
    fs.mkdirSync(path.join(cwd, "work/gmail-agent"), { recursive: true });
    const policy = { policy_version: 2, batch_size: 25, expected_account_email: "tester@example.test" };
    fs.writeFileSync(path.join(cwd, "work/gmail-agent/preferences.json"), JSON.stringify(policy));
    const tools = {
      exec_command: async ({ cmd }) => {
        const r = spawnSync("/bin/sh", ["-c", cmd], { cwd, encoding: "utf8" });
        return { exit_code: r.status, output: r.stdout, original_token_count: 0 };
      },
      apply_patch: async patch => {
        const match = patch.match(/\*\*\* Add File: ([^\n]+)\n\+([^\n]+)\n\*\*\* End Patch/);
        if (!match) throw Error("Unexpected patch");
        fs.writeFileSync(path.join(cwd, match[1]), match[2]); return {};
      }
    };
    let writes = 0;
    const ids = Array.from({ length: 62 }, (_, i) => "synthetic-" + i);
    const api = { profile: async () => ({ email: "tester@example.test" }),
      labels: async () => ({ labels: [{ id: "L", type: "user", name: "通知" }, { id: "INBOX", messagesUnread: 62 }] }),
      search: async () => ({ message_ids: ids }),
      read: async xs => ({ responses: xs.map(id => ({ id, label_ids: ["INBOX", "UNREAD"], payload: {} })) }),
      modify: async () => { writes++; }, trash: async () => { writes++; } };
    const options = { tools, api, skillDirectory: path.resolve(__dirname, "../skills/taiwan-gmail-organizer"), scriptDirectory: path.resolve(__dirname, "../skills/taiwan-gmail-organizer/scripts"), mode: "preview" };
    let runner = await loadRunner(options); await runner.start(); await runner.nextBatch();
    const reason = "不確定，保留；含引號 '、換行\n與 $() `echo x` 不得被當成 shell 執行";
    await runner.plan(ids.slice(0, 25).map(id => ({ id, action: "preserve", category: "uncertain", reason })));
    runner = await loadRunner(options);
    assert.equal(runner.summary().inventory, 62); assert.equal(runner.summary().counts.previewed, 25);
    assert.equal(runner.state().records[ids[0]].decision.reason, reason);
    assert.equal(writes, 0);
    const file = path.join(cwd, "work/gmail-agent/current-run.json");
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    console.log("PASS real atomic checkpoint, chunked reload and literal shell-like content; no Gmail writes");
    const original = fs.readFileSync(file, "utf8"), invalid = path.join(cwd, "work/gmail-agent/bad.staging.json");
    fs.writeFileSync(invalid, "invalid JSON");
    const result = spawnSync("python3", [path.resolve(__dirname, "../skills/taiwan-gmail-organizer/scripts/checkpoint.py"), "commit", invalid, "--destination", file], { encoding: "utf8" });
    assert.notEqual(result.status, 0); assert.equal(fs.readFileSync(file, "utf8"), original);
    console.log("PASS malformed staging file cannot replace the valid checkpoint");
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
