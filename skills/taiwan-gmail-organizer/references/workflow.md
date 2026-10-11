# 一次啟動的 Codex 執行流程

這是 Codex 內的執行器：模型負責讀內容與判斷，程式負責完整清單、分批、授權與保留檢查、修改核對及續跑。需要宿主提供已連接的 Gmail 工具，無須另建 OAuth 或填 API 金鑰；不是可離開 Codex 自行登入 Gmail 的服務。

## 載入

腳本在同一 Skill 的 `scripts/`。每次工具 cell 可重建執行器，進度從私人 JSON 讀回，不依賴 functions.store 長期存活。`codex-bridge.cjs` 讀寫本地檔案；`workflow.cjs` 只呼叫提供的 Gmail adapter。

在 functions.exec 使用目前可用的工具名稱建立 adapter；若名稱／結構不同，先查工具說明，不硬套：

```javascript
const api = {
  profile: () => tools.mcp__codex_apps__gmail_get_profile({}),
  labels: () => tools.mcp__codex_apps__gmail_list_labels({}),
  search: args => tools.mcp__codex_apps__gmail_search_email_ids(args),
  read: ids => tools.mcp__codex_apps__gmail_batch_read_email({message_ids: ids}),
  modify: args => tools.mcp__codex_apps__gmail_batch_modify_email(args),
  trash: ids => tools.mcp__codex_apps__gmail_delete_emails({message_ids: ids}),
};
const skillDirectory = '.agents/skills/taiwan-gmail-organizer';
const source = await tools.exec_command({cmd: 'cat .agents/skills/taiwan-gmail-organizer/scripts/codex-bridge.cjs', max_output_tokens: 5000});
if (source.exit_code !== 0) throw Error('Cannot load runner');
const bridge = {exports: null};
new Function('module', source.output)(bridge);
const runner = await bridge.exports({tools, api, skillDirectory,
  policyFile: 'work/gmail-agent/preferences.json',
  ledgerFile: 'work/gmail-agent/current-run.json',
  mode: 'execute',
  authorization: ['organize', 'trash_promotion'] // 只列當前人類已授權範圍
});
text(await runner.start());
```

有銀行成功登入／每日報告授權時，另外傳入 `trash_bank_successful_login`、`trash_daily_bank` 或 `trash_daily_futures`。設定檔允許不等於授權。未授權實際修改時 mode 使用 preview，authorization 使用空陣列。不要同時從兩個聊天修改同帳號、同進度檔。

## 主循環

1. start 先核對帳號，完整逐頁收集單封 ID、去重並保存。續跑時沿用這個初始清單。政策變更後另建清單；若新規則影響已封存郵件，start 的 queries 必須包含該範圍，例如既有期貨標籤下的日報，不能只查收件匣而漏掉舊信。
2. 若 summary 有 inflight 或 planned，先 executeBatch 查實際狀態並恢復未完成部分。權限失敗立即停止；其餘每封最多兩次修改嘗試。
3. nextBatch 回傳最多 25 封 MIME。逐封讀完整內容，必要時另讀原始 MIME／附件；不要把完整正文或憑證印出。程式不代替這項內容判斷。
4. plan 傳入同批的 ID、分類、理由與現有標籤 ID。例如：

```javascript
await runner.plan([{id: actualMessageId,
  action: 'trash', category: 'daily_statement', label_ids: [],
  institution_type: 'futures', period: 'daily',
  content_reviewed: true, certainty: 'confirmed',
  requires_action: false, important: false,
  preserve_document: false, paid_course: false,
  reason: '已核對內文及附件名稱，是普通每日期貨報告'}]);
text(await runner.executeBatch());
```

其他 action 為 archive、inbox、preserve。category 可用 promotion、monthly_statement、receipt、paid_course、routine、important、financial_risk、security_alert、account_deletion、rights_action、uncertain、bank_successful_login。有憑證／已購權益混合內容時設 preserve_document 或 paid_course，不能刪。important 必須依內容與使用者偏好判斷，不能由 Gmail 自動標籤直接決定。

5. executeBatch 先保存原狀態與預期狀態，再成功加分類標籤後封存或移到垃圾桶，重新讀取核對所有標籤與未讀狀態。分類後任何標籤或已知 history 改變，保留人工變動；逾時後核對已成功部分，不重算／盲目重做。未達預期且工具缺少 history 時不自動重試，記為例外。
6. 自動重複直到 queued、planned、inflight 全部為零，不詢問是否繼續。遇到內容不明，plan 為 uncertain＋inbox/preserve，記錄保留原因再處理其他郵件，不以讀不清楚當待辦。
7. audit 重新查實際收件匣，並逐批讀回全部已核對郵件的標籤與垃圾桶／未讀狀態。needs_review 表示未處理、漏封存、重要信或保護信不在收件匣，或實際狀態與預期不同；需先查現況，保留使用者的手動變動，不能直接宣稱原計畫全部成功。completed_with_exceptions 表示例外狀態被保留，結尾明確報告；completed_snapshot 表示初始清單均已核對。執行中新信另列 new_message_ids，不算初始清單的漏信。

進度只存 ID、標籤、短理由及狀態，不存正文、附件內容或憑證。原則上已核對的信不重新讀給模型；政策改變時建立新清單，只重查受影響範圍。寄件者／模板只能協助分流，不能跳過刪除前的內容核對。

## 狀態與保護範圍

queued → planned → inflight → verified；preview 不執行修改，記為 previewed；外部變動或重試上限記為 exception。JSON 在外部修改前保存，寫入暫存檔成功後原子替換，重新載入按 25 封切片，避免輸出過大。

程式檢查依賴模型提供的分類與內容證據旗標，能阻擋違反分類／授權規則的動作，不能保證模型永遠分類正確。少量不確定郵件保留，不能為提高刪除數量猜測內容。
