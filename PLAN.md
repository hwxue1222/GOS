# Trae Plan（GOS 发票：邮件/链接/预览）

## 目标

- 邮件发送稳定、错误可定位（不再只有 `email_send_failed`）。
- 邮件中的发票链接无需登录即可打开，手机端可读（不分段横滑）。
- 发票预览页在 iPhone 上不出现自动识别的下划线（Email/Website/Address）。
- 方案尽量简单：优先 HTML 预览/打印 + 公开链接；PDF 生成仅在明确需要且稳定后再做。

## 当前原则

- 不在错误设计上打补丁；优先回到最小可用、最简单的正确结构，再逐步加能力。
- 任何“看不出来原因”的失败都必须改到能直接定位（明确错误码 + 关键上下文）。

## 实施步骤

### 1) 统一发票链接策略

- 邮件里只放一个公开链接：`/p/invoice/{token}`。
- 发送邮件时若 `publicToken` 不存在：生成并落库后再发。
- `middleware` 明确放行 `/p`（无需登录）。
- `/p/invoice/{token}`：
  - token 不存在/已删除：返回标准 404（不是空白）。
  - 手机端采用整页缩放适配（ScaleToFit），避免分段横滑。

### 2) 邮件发送稳定性与可观测性

- `sendEmail` 返回更具体的错误（区分 SMTP/Resend、状态码、典型失败原因）。
- API 返回给前端的错误信息保持短且稳定（用于 UI 展示），但服务端日志保留足够信息定位。
- 校验必需环境变量：
  - SMTP：`EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE?`
  - Resend：`EMAIL_FROM, RESEND_API_KEY`
- 失败时 UI 直接显示标准化错误码（例如 `EMAIL_AUTH_FAILED` / `EMAIL_SEND_FAILED:RESEND-403`）。

### 3) 预览页面的 iOS 自动识别样式

- `format-detection` 禁止 iOS 将 email/website/address 自动变为链接并加下划线。
- 预览页容器加 `.no-autolink`，强制链接继承颜色且无下划线，避免 footer 出现横线。

### 4) PDF 生成策略（暂缓/可选）

- 若业务必须“下载 PDF”：再单独立项做一个“模板贴底 + 覆盖写入”的稳定方案，并提供 debug 模式让坐标一次对齐。
- 在未确认需求之前，不再反复切换 PDF 方案，避免复杂化。

## 验证清单

- 发一封测试邮件：能成功发送；失败时错误码可读且可定位。
- 邮件中的链接在未登录设备/手机端可直接打开，不跳登录。
- 手机端显示整页发票，不出现多个区域各自横向滚动。
- footer 的 Email/Website/Address 不出现下划线/横线。

