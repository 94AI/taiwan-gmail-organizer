"use strict";

// Reads only the explicitly provided local checkpoint; never connects to Gmail.
const fs = require("node:fs");
const { buildReport, formatReport } = require("./workflow.cjs");
const args = process.argv.slice(2);
if (args.length !== 1 || ["--help", "-h"].includes(args[0])) {
  console.log("Usage: node skills/taiwan-gmail-organizer/scripts/report.cjs work/gmail-agent/current-run.json");
  if (args.length !== 1) process.exitCode = 1;
} else {
  try {
    const state = JSON.parse(fs.readFileSync(args[0], "utf8"));
    console.log(formatReport(buildReport(state)));
  } catch {
    // Do not echo private file contents or sensitive parse-error snippets.
    console.error("無法讀取有效整理進度；請確認指定檔案與格式。未連接或修改 Gmail。");
    process.exitCode = 1;
  }
}
