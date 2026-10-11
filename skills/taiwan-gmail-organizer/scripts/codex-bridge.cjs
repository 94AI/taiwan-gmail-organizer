"use strict";

// Evaluate this trusted file in functions.exec; the host supplies tools and API.
module.exports = async function loadRunner({ tools, api, skillDirectory, scriptDirectory = skillDirectory + "/scripts",
  policyFile = "work/gmail-agent/preferences.json", ledgerFile = "work/gmail-agent/current-run.json",
  mode = "preview", authorization = [] }) {
  const quote = s => "'" + String(s).replace(/'/g, "'\"'\"'") + "'";
  if (!/^work\/gmail-agent\/[A-Za-z0-9_.-]+\.json$/.test(ledgerFile))
    throw new Error("Use a private workspace ledger under work/gmail-agent/");
  async function shell(cmd) {
    const r = await tools.exec_command({ cmd, max_output_tokens: 25000 });
    if (r.exit_code !== 0 || r.original_token_count > 25000) throw new Error("File operation failed/truncated; no mail mutation");
    return r.output;
  }
  const source = await shell("cat " + quote(scriptDirectory + "/workflow.cjs"));
  const core = { exports: {} }; new Function("module", source)(core);
  const checkpoint = scriptDirectory + "/checkpoint.py";
  const policy = JSON.parse(await shell("python3 " + quote(checkpoint) + " read " + quote(policyFile)));
  if (!policy) throw new Error("Create or explicitly provide private preferences first");
  let state = JSON.parse(await shell("python3 " + quote(checkpoint) + " read " + quote(ledgerFile) + " --section meta"));
  if (state) {
    state.records = {};
    for (let offset = 0; offset < state.order.length; offset += 25)
      Object.assign(state.records, JSON.parse(await shell("python3 " + quote(checkpoint) + " read " + quote(ledgerFile) + " --section records --offset " + offset)));
  }
  const persist = async value => {
    const temporary = ledgerFile.replace(/\.json$/, ".staging.json");
    const r = await tools.apply_patch("*** Begin Patch\n*** Add File: " + temporary + "\n+" + JSON.stringify(value) + "\n*** End Patch");
    if (r?.isError) throw new Error("Cannot save checkpoint; no further Gmail changes");
    await shell("python3 " + quote(checkpoint) + " commit " + quote(temporary) + " --destination " + quote(ledgerFile));
  };
  return core.exports.createRunner({ api, persist, policy, mode, authorization, state });
};
