# 安裝及用另一個 Gmail 測試

查核日期：2026-10-11。這個 Skill 不自行執行 OAuth；Gmail 連線由宿主的 Gmail 插件提供。

## 將 Skill 放到工作資料夾

本套件的 Skill 位於 `skills/taiwan-gmail-organizer/`。將此資料夾完整複製到你在 Codex 開啟的工作資料夾之 `.agents/skills/taiwan-gmail-organizer/`，保留 `SKILL.md`、`agents/openai.yaml`、`references/` 及 `scripts/`。

在該工作資料夾的新聊天使用 `$taiwan-gmail-organizer`。若尚未出現，重新開啟工作資料夾／重新啟動 Codex 後檢查。這是工作資料夾範圍的載入，不是發布或全域安裝。[OpenAI：本地 Skill 載入位置](https://learn.chatgpt.com/docs/build-skills)

## 連接第二個帳號

1. 開啟已安裝 Gmail 插件的設定頁。
2. 若提供追加帳號流程，從該流程連接第二個 Gmail，在 Google 授權畫面確認帳號。OpenAI 的插件機制支援多帳號，但各插件與使用者版本是否提供入口，須以實際設定頁為準；本 Skill 無法增加平台沒有提供的入口。[OpenAI：多帳號認證](https://developers.openai.com/plugins/build/auth)
3. 先只確認連線身分。Google 瀏覽器登入哪個帳號，不等於工具已連到哪個帳號。

   ```text
   使用 $taiwan-gmail-organizer。
   這次只使用我指定的測試 Gmail 帳號。
   先查詢連線帳號身分並回報 Gmail 地址，不要搜尋、讀取或修改郵件。
   若不是測試帳號，停止並回報。
   ```

以上提示中另提供實際測試地址，或在私人 `work/gmail-agent/preferences.json` 填 `expected_account_email`。範例不附真實地址。

## 第一輪：預覽 20 封

確認地址正確後，使用：

```text
只檢查剛確認的測試 Gmail 收件匣 20 封。
先預覽，不修改信箱。
列出主旨、建議標籤、建議處置及理由；有待辦或不確定的信保留收件匣。
不要更改已讀／未讀，不要寄信或退訂。
```

先比較純廣告、帳單、已購教材、新帳號驗證及物流待辦。預覽合理後再明確授權這一批的實際分類／封存／垃圾桶動作。工具缺乏單封操作時，含保護信的討論串保持原狀。

## Google 授權顯示 generic 400

只有「The server cannot process the request because it is malformed」不足以判定公司政策封鎖、應用未驗證或測試使用者名單。Google 有不同的具名認證錯誤，須依實際訊息處理。[Google：認證錯誤說明](https://support.google.com/accounts/answer/16668185?hl=en)

- 關閉失敗授權頁，回 Gmail 插件重新發起一次完整授權流程。不要重整或重用同一個失敗網址，也不要手動修改其中參數。這是診斷步驟，不是已確認的 400 成因或保證修復。[Google：OAuth 流程與 state](https://developers.google.com/identity/protocols/oauth2/web-server)
- 使用受支援、已更新的瀏覽器。若宿主提供外部瀏覽器授權流程，可以用它做一次對照；不要將流程中途的網址搬到另一個視窗。[Google：支援的登入瀏覽器](https://support.google.com/accounts/answer/7675428?co=GENIE.Platform%3DDesktop&hl=en)
- 若新流程仍發生相同 400，停止反覆嘗試，向宿主／連接器支援端提供錯誤文字、發生時間、瀏覽器版本、發生階段及錯誤頁網域／路徑。記錄完整授權網址可能包含私人狀態資料，不放進公開 Issue。
- 不把卸載 Gmail、解除原信箱連線、清除全部瀏覽器資料或修改 OAuth client 設定作為第一步。

帳號尚未成功核對前，測試停在連線階段；不能聲稱已讀取或整理第二個信箱。
