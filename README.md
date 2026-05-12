# GOS

独立的综合管理程序（GOS）。

## 开发

```bash
npm i
npm run dev
```

## 数据库（重要）

GOS 默认使用本地 JSON 数据库：

- 本地开发：`./.gos/db.json`（已在 `.gitignore` 中忽略，不会提交到仓库）
- Vercel：默认落到临时目录 `/tmp/gos/db.json`（serverless 环境会重启/多实例，数据不保证持久化；你看到的“退出再登录数据全没了”就是这个原因）

要让线上数据持久化并且多次登录不丢失，建议在 Vercel 项目里接入 Redis（Vercel Marketplace / Upstash Redis），并设置环境变量：

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- （可选）`GOS_KV_DB_KEY`：默认 `gos:db`

设置后，GOS 会自动改用 KV 存储整个 DB（用户、client、job、task、session）并在多实例间保持一致。

如果你也希望本地开发和线上使用同一份数据，把同样的 KV 环境变量也放到本地的 `.env.local`（不要提交）。
