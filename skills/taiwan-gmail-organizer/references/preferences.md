# 私人偏好

本工作區使用 `work/gmail-agent/preferences.json`；每個帳號各自一份設定與進度。公開範例在 `examples/preferences.example.json`，不能附帶真實 Gmail、郵件 ID 或憑證。

| 欄位 | 用途 |
| --- | --- |
| schema_version、policy_version | 格式與政策版本；規則改變時不可復用舊決策 |
| expected_account_email | 核對連線帳號；不符停止 |
| preferred_mode | 預览或執行偏好；本身不授權修改 |
| batch_size | 每批 20～30，預設 25 |
| protected_message_ids、keep_inbox_message_ids | 此帳號指定必須留收件匣的信，不能因期限過了解除 |
| important_mail | inbox 表示重要信留收件匣；不等於 Gmail IMPORTANT 自動標籤 |
| pending_label | none 表示不新增「待處理」，待辦直接留收件匣 |
| bank_successful_login_notices | keep 或 trash_when_authorized；不含異常／失敗／安全警示 |
| statements.bank／futures／securities | 各機構獨立設定；monthly 保留，daily 為 keep 或 trash_when_authorized |
| label_preferences | 對應既有顯示名稱；執行時重新查實際 ID，不自動新增整套分類 |

目前人類授權由 Codex 依當前指示及同一工作的既有授權傳給執行器。`authorization` 不存於偏好或進度檔來自動授權新工作。其他使用者首次整理須自行授權。

修正規則後更新 policy_version。已封存信不會因政策版本改變而自動重新掃描；若新規則包含過往日報，另以明確範圍建立新清單。不同帳號的保護清單不可混用。
