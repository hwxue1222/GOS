function esc(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function renderRdrAuthorizationHtml(input: {
  companyName: string;
  representativeName?: string;
  purpose: string;
  dateYmd: string;
}) {
  const companyName = esc(input.companyName);
  const representativeName = input.representativeName ? esc(input.representativeName) : '________________';
  const purpose = esc(input.purpose);
  const dateYmd = esc(input.dateYmd);

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Corporate Representative Authorization</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      .muted { color: #555; font-size: 12px; }
      .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
      .sig { margin-top: 18px; padding-top: 18px; border-top: 1px dashed #ddd; }
    </style>
  </head>
  <body>
    <h1>Appointment of Corporate Representative</h1>
    <div class="muted">Date: ${dateYmd}</div>
    <div class="box" style="margin-top: 12px;">
      <div><strong>Company</strong>: ${companyName}</div>
      <div style="margin-top: 10px;"><strong>Appointed Representative</strong>: ${representativeName}</div>
      <div style="margin-top: 10px;"><strong>Purpose</strong>: ${purpose}</div>
      <div class="sig">
        <div>Signed by Directors of the Company:</div>
        <div class="muted" style="margin-top: 8px;">Electronic signature is recorded by the system with timestamp, IP, user agent, and document hash.</div>
      </div>
    </div>
  </body>
</html>
`.trim();
}

export function renderShareTransferAgreementHtml(input: {
  targetCompanyName: string;
  transferorName: string;
  transfereeName: string;
  shares: number;
  shareClass?: string;
  effectiveDate: string;
}) {
  const targetCompanyName = esc(input.targetCompanyName);
  const transferorName = esc(input.transferorName);
  const transfereeName = esc(input.transfereeName);
  const shareClass = input.shareClass ? esc(input.shareClass) : '';
  const effectiveDate = esc(input.effectiveDate);

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Share Transfer Agreement</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      .muted { color: #555; font-size: 12px; }
      .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
      .sig { margin-top: 18px; padding-top: 18px; border-top: 1px dashed #ddd; }
    </style>
  </head>
  <body>
    <h1>Share Transfer Agreement</h1>
    <div class="muted">Effective Date: ${effectiveDate}</div>
    <div class="box" style="margin-top: 12px;">
      <div><strong>Target Company</strong>: ${targetCompanyName}</div>
      <div style="margin-top: 10px;"><strong>Transferor</strong>: ${transferorName}</div>
      <div style="margin-top: 10px;"><strong>Transferee</strong>: ${transfereeName}</div>
      <div style="margin-top: 10px;"><strong>Shares</strong>: ${input.shares}${shareClass ? ` (${shareClass})` : ''}</div>
      <div class="sig">
        <div>Signatures:</div>
        <div class="muted" style="margin-top: 8px;">Electronic signature is recorded by the system with timestamp, IP, user agent, and document hash.</div>
      </div>
    </div>
  </body>
</html>
`.trim();
}

export function renderBoardResolutionHtml(input: {
  companyName: string;
  resolutionDate: string;
  summary: string;
}) {
  const companyName = esc(input.companyName);
  const resolutionDate = esc(input.resolutionDate);
  const summary = esc(input.summary);

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Board Resolution</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      .muted { color: #555; font-size: 12px; }
      .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
      .sig { margin-top: 18px; padding-top: 18px; border-top: 1px dashed #ddd; }
    </style>
  </head>
  <body>
    <h1>Board Resolution</h1>
    <div class="muted">Date: ${resolutionDate}</div>
    <div class="box" style="margin-top: 12px;">
      <div><strong>Company</strong>: ${companyName}</div>
      <div style="margin-top: 10px;"><strong>Resolution</strong>:</div>
      <div style="margin-top: 6px; white-space: pre-wrap;">${summary}</div>
      <div class="sig">
        <div>Signed by Directors of the Company:</div>
        <div class="muted" style="margin-top: 8px;">Electronic signature is recorded by the system with timestamp, IP, user agent, and document hash.</div>
      </div>
    </div>
  </body>
</html>
`.trim();
}

export function renderDirectorChangeRequestHtml(input: {
  companyName: string;
  effectiveDate: string;
  message?: string;
  addDirectors: Array<{ fullName: string; email?: string }>;
  removeDirectors: Array<{ fullName: string; email?: string }>;
}) {
  const companyName = esc(input.companyName);
  const effectiveDate = esc(input.effectiveDate);
  const message = typeof input.message === 'string' ? esc(input.message) : '';

  const fmt = (x: { fullName: string; email?: string }) => {
    const name = esc(x.fullName);
    const email = x.email ? esc(x.email) : '';
    return email ? `${name} &lt;${email}&gt;` : name;
  };

  const addList = input.addDirectors.length
    ? `<ul style="margin:8px 0 0 18px;">${input.addDirectors.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`
    : '<div class="muted" style="margin-top:6px;">None</div>';
  const removeList = input.removeDirectors.length
    ? `<ul style="margin:8px 0 0 18px;">${input.removeDirectors.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`
    : '<div class="muted" style="margin-top:6px;">None</div>';

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Director Change Request</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      h2 { font-size: 14px; margin: 16px 0 6px; }
      .muted { color: #555; font-size: 12px; }
      .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
      .sig { margin-top: 18px; padding-top: 18px; border-top: 1px dashed #ddd; }
    </style>
  </head>
  <body>
    <h1>Director Change Request</h1>
    <div class="muted">Effective Date: ${effectiveDate}</div>
    <div class="box" style="margin-top: 12px;">
      <div><strong>Company</strong>: ${companyName}</div>
      ${message ? `<div style="margin-top:10px;"><strong>Message</strong>:</div><div style="margin-top:6px; white-space: pre-wrap;">${message}</div>` : ''}
      <h2>Add Directors</h2>
      ${addList}
      <h2>Remove Directors</h2>
      ${removeList}
      <div class="sig">
        <div>Signed by Directors of the Company:</div>
        <div class="muted" style="margin-top: 8px;">Electronic signature is recorded by the system with timestamp, IP, user agent, and document hash.</div>
      </div>
    </div>
  </body>
</html>
`.trim();
}
