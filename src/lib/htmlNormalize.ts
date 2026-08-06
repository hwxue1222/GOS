export function normalizeDocumentHtml(input: string) {
  let html = String(input ?? '');

  const emptyP = '<p[^>]*>(?:\\s|&nbsp;|<br\\s*\\/?>)*<\\/p>';
  const incorporated = '\\(Incorporated in the Republic of Singapore\\)';
  html = html.replace(
    new RegExp(`(${emptyP}\\s*)+(?=<(?:p|div)[^>]*>[\\s\\S]*?${incorporated}[\\s\\S]*?<\\/(?:p|div)>)`, 'gi'),
    '',
  );

  return html;
}

