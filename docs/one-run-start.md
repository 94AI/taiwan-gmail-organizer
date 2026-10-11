# 新使用者啟動

將 `skills/taiwan-gmail-organizer/` 完整複製到自己工作資料夾的 `.agents/skills/`，保留 scripts、references 及 agents。連接自己的 Gmail，先核對工具的 profile。複製 `examples/preferences.example.json` 到私人 `work/gmail-agent/preferences.json`，填入帳號、保護清單及既有標籤；公開套件沒有你的私人設定。

首次先輸入：

```text
使用 $taiwan-gmail-organizer，先核對設定與 Gmail 帳號。
預覽收件匣前 20 封，優先使用既有標籤，不修改信箱。
```

確認規則適合自己後，明確授權：

```text
使用 $taiwan-gmail-organizer，依工作區私人設定整理 Gmail，一次做到完成。
純廣告可移到垃圾桶；憑證、已購課程和無待辦通知分類後封存。
保護郵件、重要信、待辦及不確定的信留收件匣。
保持已讀／未讀，不永久刪除或清空垃圾桶。
```

助理先核對實際連線的帳號、載入規則，再自行分批分類與核對；不用每批說「繼續」。重要信及不確定信留在收件匣，最後集中回報。

若中途因連線或執行環境中斷，恢復後輸入「接續上次 Gmail 整理」，會先讀私人進度、核對郵件現況，再接著做。進度檔不授權切換帳號或使用新規則。

設定檔不是修改授權。銀行登入通知及普通銀行／期貨日報如需刪除，另明確說明；證券日報預設保留。

此版本透過 Codex 與已連接 Gmail 執行。每週排程需要由宿主設定，獨立登入與背景服務尚未實作。
