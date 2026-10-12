# Life’s Too Short for Spam

Taiwan Gmail Organizer — a Traditional Chinese inbox cleaner.

A Traditional Chinese Codex skill for personal Gmail, with Taiwan-specific rules for electronic invoices, ROC calendar dates, pickup reminders, bank statements, insurance, government applications, and purchased courses.

The model reads and classifies mail; a deterministic runner handles pagination, batches of 25, checkpoints, retention guards, and final verification. Requires Codex with connected Gmail tools. Standalone OAuth and scheduling are not implemented.

Copy the complete `skills/taiwan-gmail-organizer/` directory to `.agents/skills/taiwan-gmail-organizer/` in your Codex workspace. Reload the chat, connect your own Gmail, and verify the profile. Copy `examples/preferences.example.json` to private `work/gmail-agent/preferences.json` and configure your account. Start with a preview; explicitly authorize changes before execution.

Development requires Node.js 22+ and Python 3; no third-party packages or Gmail credentials are needed. Run `npm test`: 25 runner/storage/report checks. This does not establish model classification accuracy. Important, actionable, protected, and uncertain mail stays in the inbox. Permanent deletion is never performed.

MIT licensed. Contributions must use fictional mail, never real messages, identifiers, tokens, or private logs. See [the Chinese guide](README.md) and [contribution instructions](CONTRIBUTING.md).

Run `node skills/taiwan-gmail-organizer/scripts/report.cjs work/gmail-agent/current-run.json` for an aggregate-only local report. Suggestions and verified changes are separate; previews do not imply mutations. The report excludes account addresses, message IDs, label names and model-written reasons. It never connects to Gmail.
