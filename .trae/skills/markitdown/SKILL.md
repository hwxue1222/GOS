---
name: "markitdown"
description: "将 PDF/Office/网页等文件转换为 Markdown。用户要求‘转成Markdown/提取成md/文档转md’或需要把附件内容结构化时调用。"
---

# MarkItDown

将多种格式文件转换为适合阅读与后续处理的 Markdown。

## 适用场景

- 用户发来 `pdf/docx/xlsx/pptx/html`（或图片/网页链接）并说要“转成 Markdown / 提取成 md / 生成可编辑 markdown”。
- 需要把合同/报告/说明书等内容结构化为 `*.md`，方便搜索、引用或进入后续流程。

## 默认输出

- 生成一个 Markdown 文件（默认与输入同名，扩展名为 `.md`），并在对话里给出文件路径。
- 若用户只要片段，则输出对应 Markdown 片段并附带生成文件路径。

## 执行步骤（推荐）

1. 确认输入来源：
   - 本地文件路径（优先）或用户上传的文件。
   - 若是网页链接：先下载为本地文件或直接让 MarkItDown 处理（按需求）。
2. 准备运行环境（Python 3.10+）：
   - 建议使用虚拟环境，避免污染项目依赖。
3. 安装并转换（CLI）：
   - 安装：`pip install markitdown`
   - 转换：`markitdown input.pdf -o output.md`
4. 检查结果：
   - 查看 `output.md` 的结构、标题、列表、表格是否正常。
   - 若内容有大量换行/缩进问题：可二次清洗（去多余空行、修复列表缩进等）。

## 命令示例

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install markitdown

markitdown "./input.docx" -o "./input.md"
markitdown "./input.pdf" -o "./input.md"
```

## Python API 示例

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("document.pdf")
print(result.text_content)
```

## 输出质量约定

- 保留原文的层级结构（标题、编号条款、子弹列表）。
- 不擅自改写语义；只做格式化与结构化。
- 如遇到 OCR/扫描件导致的乱码或断行，会说明可能原因并给出可选修复方式。

