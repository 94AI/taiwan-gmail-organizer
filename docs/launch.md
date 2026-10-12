# 開源發布與宣傳

目前版本定位：給已有 Codex 與 Gmail 連線的人使用的繁體中文 Skill，以 MIT 分享通用規則、程式與虛構測試；獨立網站及 OAuth 服務尚未實作。

## 發布步驟

1. 建立公開 GitHub 儲存庫，附安裝文件、MIT、測試及貢獻指南。
2. 發布 v0.2.0 Release，說明支援範圍與限制。
3. 用虛構郵件錄製預覽、授權整理、結果回報示範。
4. 分享連結與示範，邀請透過 Issue／Pull Request 回報台灣情境、誤分類及安裝問題。

## 宣傳稿草稿，尚未發送

我把反覆整理 Gmail 的流程，做成「珍惜生命，遠離廣告信」——給台灣人的 Gmail 收件匣清道夫，已以 MIT 開源。

它會先讀既有標籤與郵件內容，再分批分類、封存或把純廣告移到垃圾桶。電子發票、銀行月對帳單、超商取件、保單和已購課程都有保留規則；需要處理或不確定的信會留在收件匣。

目前是 Codex Skill，需要自己的 Gmail 連線。先預覽並確認範圍，再授權一次完成；不永久刪除或清空垃圾桶。

歡迎用虛構案例回報問題，或提交 Pull Request，一起改善台灣郵件的辨識與使用流程。

專案連結：[taiwan-gmail-organizer](https://github.com/94AI/taiwan-gmail-organizer)。

## 類似專案的分享方式

| 形式 | 範例 | 取捨 |
| --- | --- | --- |
| 完整應用，提供託管及自架 | [Inbox Zero](https://github.com/elie222/inbox-zero) | 體驗完整，需要維運登入與部署 |
| 框架範例與部署教學 | [Agents From Scratch](https://github.com/langchain-ai/agents-from-scratch) | 可修改流程，需自行設定服務 |
| Skill／插件套件 | [OpenAI Skills](https://developers.openai.com/plugins/build/skills)、[插件封裝](https://developers.openai.com/plugins/build/plugins) | 沿用宿主能力，受宿主與連線支援限制 |

本專案先採第三種形式。上傳 GitHub 與提交官方插件目錄是不同步驟。
