function esc(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function normalizeFyeDdMm(input: string) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m1) {
    const dd = String(Number(m1[1])).padStart(2, '0');
    const mm = String(Number(m1[2])).padStart(2, '0');
    return `${dd}/${mm}`;
  }
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const a = Number(m2[1]);
    const b = Number(m2[2]);
    const aa = String(a).padStart(2, '0');
    const bb = String(b).padStart(2, '0');
    if (a > 12) return `${aa}/${bb}`;
    if (b > 12) return `${bb}/${aa}`;
    return `${bb}/${aa}`;
  }
  const m3 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m3) return `${m3[3]}/${m3[2]}`;
  return s;
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

export function renderCompanyUpdateRequestHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  directors?: Array<{ fullName: string; email?: string }>;
  resolutionDateYmd?: string;
  type:
    | 'CHANGE_COMPANY_NAME'
    | 'CHANGE_FINANCIAL_YEAR_END'
    | 'CHANGE_REGISTERED_OFFICE_ADDRESS'
    | 'CHANGE_BUSINESS_ACTIVITIES'
    | 'CHANGE_SECRETARY'
    | 'TRANSFER_COMPANY_SECRETARY';
  original: {
    fye?: string;
    registeredOfficeAddress?: string;
    ssicPrimaryCode?: string;
    ssicSecondaryCode?: string;
  };
  payload: Record<string, unknown>;
}) {
  const companyName = esc(input.companyName);
  const companyRegistrationNo = input.companyRegistrationNo ? esc(input.companyRegistrationNo) : '';
  const nowYmd = (input.resolutionDateYmd ?? new Date().toISOString().slice(0, 10)).slice(0, 10);

  const toDdMmYyyy = (ymd: string) => {
    const m = String(ymd ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    return `${m[3]}/${m[2]}/${m[1]}`;
  };

  const fmtDirector = (d: { fullName: string; email?: string }) => {
    const name = String(d.fullName ?? '').trim();
    const email = String(d.email ?? '').trim();
    if (!name) return '';
    return email ? `${name} <${email}>` : name;
  };

  const directorsLine = (input.directors ?? []).map(fmtDirector).filter(Boolean).join(', ');
  const title = (() => {
    if (input.type === 'CHANGE_COMPANY_NAME') return 'Change of Company Name';
    if (input.type === 'CHANGE_FINANCIAL_YEAR_END') return 'Change of Financial Year End (FYE)';
    if (input.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') return 'Change of Registered Office Address';
    if (input.type === 'CHANGE_BUSINESS_ACTIVITIES') return 'Change of Business Activities';
    if (input.type === 'CHANGE_SECRETARY') return 'Change of Secretary';
    if (input.type === 'TRANSFER_COMPANY_SECRETARY') return 'Transfer of Company Secretary';
    return input.type;
  })();

  const p = input.payload ?? {};

  if (input.type === 'CHANGE_FINANCIAL_YEAR_END') {
    const oldFyeRaw = (input.original.fye ?? '-').trim() || '-';
    const newFyeRaw = String(p.newFye ?? '').trim() || '-';
    const oldFye = normalizeFyeDdMm(oldFyeRaw) || oldFyeRaw;
    const newFye = normalizeFyeDdMm(newFyeRaw) || newFyeRaw;
    const directors = (input.directors ?? [])
      .map((d) => ({ fullName: String(d.fullName ?? '').trim(), email: String(d.email ?? '').trim() || undefined }))
      .filter((d) => !!d.fullName);

    const signatureBlocks = (directors.length ? directors : [{ fullName: '', email: undefined }])
      .map((d) => {
        const nameHtml = d.fullName ? `<div class="sig-name"><strong>${esc(d.fullName)}</strong></div>` : '<div class="sig-name">________________</div>';
        const emailKey = d.email ? esc(d.email.toLowerCase()) : '';
        const marker = emailKey ? `<span class="sig-mark" data-signer="${emailKey}"></span>` : '<span class="sig-mark"></span>';
        return `
<div class="sig-block">
  <div>Director:</div>
  <div class="sig-line">${marker}</div>
  ${nameHtml}
</div>
`.trim();
      })
      .join('');

    const dated = toDdMmYyyy(nowYmd);
    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Change of Financial Year End (FYE)</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      .muted { color: #555; font-size: 12px; }
      .title { font-size: 18px; font-weight: 700; margin: 0; }
      .subtitle { margin-top: 8px; font-size: 14px; font-weight: 700; }
      .block { margin-top: 14px; }
      .sig-block { margin-top: 18px; }
      .sig-line { width: 260px; height: 26px; border-bottom: 1px solid #111; position: relative; margin-top: 10px; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 2px; }
    </style>
  </head>
  <body>
    <div class="title">${companyName}</div>
    <div style="margin-top: 0;"><strong>Co. Reg. No.</strong>: ${companyRegistrationNo || '__________'}</div>
    <div class="muted">(Incorporated in the Republic of Singapore)</div>

    <div style="height: 14px;"></div>

    <div class="subtitle">DIRECTOR’S RESOLUTION IN WRITING PURSUANT TO THE ARTICLES OF ASSOCIATION OF THE COMPANY</div>
    <div class="block">I/We, the undersigned, being the Director(s) of the Company, do hereby pass the following resolution:</div>

    <div class="subtitle">RESOLVED –</div>
    <div class="subtitle" style="font-weight: 700;">CHANGE OF FINANCIAL YEAR END DATE</div>
    <div class="block">
      That the financial year end date of the Company is changed from <strong>${esc(oldFye)}</strong> to <strong>${esc(newFye)}</strong> and determine that the next financial year end date of the Company is effective immediately following its last financial year.
    </div>

    ${signatureBlocks}
    <div style="margin-top: 18px;"><strong>Dated</strong>: ${esc(dated)}</div>
  </body>
</html>
`.trim();
  }

  if (input.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') {
    const oldAddr = String(input.original.registeredOfficeAddress ?? '-').trim() || '-';
    const newAddr = String((p as { newRegisteredOfficeAddress?: unknown }).newRegisteredOfficeAddress ?? '').trim() || '-';
    const directors = (input.directors ?? [])
      .map((d) => ({ fullName: String(d.fullName ?? '').trim(), email: String(d.email ?? '').trim() || undefined }))
      .filter((d) => !!d.fullName);

    const signatureBlocks = (directors.length ? directors : [{ fullName: '', email: undefined }])
      .map((d) => {
        const nameHtml = d.fullName ? `<div class="sig-name"><strong>${esc(d.fullName)}</strong></div>` : '<div class="sig-name">________________</div>';
        const emailKey = d.email ? esc(d.email.toLowerCase()) : '';
        const marker = emailKey ? `<span class="sig-mark" data-signer="${emailKey}"></span>` : '<span class="sig-mark"></span>';
        return `
<div class="sig-block">
  <div>Director:</div>
  <div class="sig-line">${marker}</div>
  ${nameHtml}
</div>
`.trim();
      })
      .join('');

    const dated = toDdMmYyyy(nowYmd);
    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Change of Registered Office Address</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      .muted { color: #555; font-size: 12px; }
      .title { font-size: 18px; font-weight: 700; margin: 0; }
      .subtitle { margin-top: 8px; font-size: 14px; font-weight: 700; }
      .block { margin-top: 14px; }
      .red { color: #dc2626; font-weight: 700; }
      .sig-block { margin-top: 18px; }
      .sig-line { width: 420px; height: 26px; border-bottom: 1px solid #111; position: relative; margin-top: 10px; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 2px; }
    </style>
  </head>
  <body>
    <div class="title">${companyName}</div>
    <div style="margin-top: 0;"><strong>Co. Reg. No.</strong>: ${companyRegistrationNo || '__________'}</div>
    <div class="muted">(Incorporated in the Republic of Singapore)</div>

    <div style="height: 14px;"></div>

    <div class="subtitle">DIRECTOR’S RESOLUTION IN WRITING PURSUANT TO THE ARTICLES OF ASSOCIATION OF THE COMPANY</div>
    <div class="block">I/We, the undersigned, being the Director(s) of the Company, do hereby pass the following resolution:</div>

    <div class="subtitle">RESOLVED –</div>
    <div class="subtitle" style="font-weight: 700;">CHANGE OF REGISTERED OFFICE ADDRESS</div>
    <div class="block" style="white-space: pre-wrap;">
      That the registered office address of the Company is changed from
      <span class="red">${esc(oldAddr)}</span>
      to
      <span class="red">${esc(newAddr)}</span>.
    </div>
    <div class="block">Any Director be authorised to take all necessary steps and to file the relevant notification with ACRA.</div>

    ${signatureBlocks}
    <div style="margin-top: 18px;"><strong>Dated</strong>: ${esc(dated)}</div>
  </body>
</html>
`.trim();
  }

  const lines: string[] = [];
  lines.push('WRITTEN RESOLUTION OF THE DIRECTORS');
  lines.push('');
  lines.push(`Company: ${input.companyName}${companyRegistrationNo ? ` (${input.companyRegistrationNo})` : ''}`);
  if (directorsLine) lines.push(`Directors: ${directorsLine}`);
  lines.push('');
  lines.push('IT WAS RESOLVED THAT:');

  if (input.type === 'CHANGE_COMPANY_NAME') {
    const newCompanyName = String(p.newCompanyName ?? '').trim() || '-';
    const chairman = String(p.chairman ?? '').trim() || '-';
    const startDate = String(p.startDate ?? '').trim() || '-';
    const meetingVenue = String(p.meetingVenue ?? '').trim() || '-';
    const useRegisteredOffice = Boolean((p as { useByBridgeRegisteredOfficeAddress?: unknown }).useByBridgeRegisteredOfficeAddress);
    lines.push(`1. The Company name be changed from "${input.companyName}" to "${newCompanyName}".`);
    lines.push(`2. Chairman: ${chairman}.`);
    lines.push(`3. Meeting time: ${startDate}.`);
    lines.push(`4. Meeting venue: ${meetingVenue}.`);
    lines.push(`5. Use ByBridge registered office address: ${useRegisteredOffice ? 'Yes' : 'No'}.`);
  } else if (input.type === 'CHANGE_BUSINESS_ACTIVITIES') {
    const p1 = String(p.ssicPrimaryCode ?? '').trim() || '-';
    const p2 = String(p.ssicSecondaryCode ?? '').trim() || '-';
    const o1 = (input.original.ssicPrimaryCode ?? '-').trim() || '-';
    const o2 = (input.original.ssicSecondaryCode ?? '-').trim() || '-';
    lines.push('1. The business activities (SSIC) of the Company be changed as follows:');
    lines.push(`   Primary:   ${o1}  ->  ${p1}`);
    lines.push(`   Secondary: ${o2}  ->  ${p2}`);
    lines.push('2. Any Director be authorised to take all necessary steps and to file the relevant notification with ACRA.');
  } else if (input.type === 'CHANGE_SECRETARY') {
    const removeSecretaryRoleId = String(p.removeSecretaryRoleId ?? '').trim() || '-';
    const addSecretaries = Array.isArray(p.addSecretaries) ? (p.addSecretaries as Array<Record<string, unknown>>) : [];
    const useByBridge = Boolean((p as { useByBridgeCompanySecretary?: unknown }).useByBridgeCompanySecretary);
    const addNames = addSecretaries
      .map((x) => ({ fullName: String(x.fullName ?? '').trim(), email: String(x.email ?? '').trim() }))
      .filter((x) => !!x.fullName)
      .map((x) => (x.email ? `${x.fullName} <${x.email}>` : x.fullName));
    lines.push('1. The Company Secretary be changed as follows:');
    lines.push(`   Remove secretary role ID: ${removeSecretaryRoleId}`);
    lines.push(`   Add: ${addNames.length ? addNames.join(', ') : '-'}`);
    lines.push(`2. Use ByBridge company secretary: ${useByBridge ? 'Yes' : 'No'}.`);
    lines.push('3. Any Director be authorised to take all necessary steps and to file the relevant notification with ACRA.');
  } else if (input.type === 'TRANSFER_COMPANY_SECRETARY') {
    const effectiveDate = String(p.effectiveDate ?? '').trim() || '-';
    const newSecretaryName = String(p.newSecretaryName ?? '').trim() || '-';
    const newSecretaryEmail = String(p.newSecretaryEmail ?? '').trim() || '-';
    const reason = String(p.reason ?? '').trim() || '-';
    const notes = String(p.notes ?? '').trim() || '-';
    lines.push(`1. With effect from ${effectiveDate}, the Company Secretary be transferred / changed.`);
    lines.push(`2. New secretary: ${newSecretaryName} <${newSecretaryEmail}>.`);
    lines.push(`3. Reason: ${reason}.`);
    lines.push(`4. Notes: ${notes}.`);
    lines.push('5. Any Director be authorised to take all necessary steps and to file the relevant notification with ACRA.');
  }

  lines.push('');
  lines.push('For and on behalf of the Company.');

  const summaryText = lines.join('\n');

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${esc(title)}</title>
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
    <div class="muted">Date: ${esc(nowYmd)}</div>
    <div class="box" style="margin-top: 12px;">
      <div><strong>Title</strong>: ${esc(title)}</div>
      <div style="margin-top: 10px; white-space: pre-wrap;">${esc(summaryText)}</div>
      <div class="sig">
        <div>Signed by Directors of the Company:</div>
        <div class="muted" style="margin-top: 8px;">Electronic signature is recorded by the system with timestamp, IP, user agent, and document hash.</div>
      </div>
    </div>
  </body>
</html>
`.trim();
}

export function renderRorcDeclarationHtml(input: {
  companyName: string;
  effectiveDate: string;
  message?: string;
  addControllers: Array<{ fullName: string; email?: string }>;
  removeControllers: Array<{ fullName: string; email?: string }>;
}) {
  const companyName = esc(input.companyName);
  const effectiveDate = esc(input.effectiveDate);
  const message = typeof input.message === 'string' ? esc(input.message) : '';

  const fmt = (x: { fullName: string; email?: string }) => {
    const name = esc(x.fullName);
    const email = x.email ? esc(x.email) : '';
    return email ? `${name} &lt;${email}&gt;` : name;
  };

  const addList = input.addControllers.length
    ? `<ul style="margin:8px 0 0 18px;">${input.addControllers.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`
    : '<div class="muted" style="margin-top:6px;">None</div>';
  const removeList = input.removeControllers.length
    ? `<ul style="margin:8px 0 0 18px;">${input.removeControllers.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`
    : '<div class="muted" style="margin-top:6px;">None</div>';

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Declaration of Company Controller (RORC)</title>
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
    <h1>Declaration of Company Controller (RORC)</h1>
    <div class="muted">Effective Date: ${effectiveDate}</div>
    <div class="box" style="margin-top: 12px;">
      <div><strong>Company</strong>: ${companyName}</div>
      ${message ? `<div style="margin-top:10px;"><strong>Message</strong>:</div><div style="margin-top:6px; white-space: pre-wrap;">${message}</div>` : ''}
      <h2>Add Controllers</h2>
      ${addList}
      <h2>Remove Controllers</h2>
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

export function renderAnnualGeneralMeetingMinutesHtml(input: {
  companyName: string;
  meetingDate: string;
  meetingVenue: string;
  chairman: string;
  agendaSummary?: string;
}) {
  const companyName = esc(input.companyName);
  const meetingDate = esc(input.meetingDate);
  const meetingVenue = esc(input.meetingVenue);
  const chairman = esc(input.chairman);
  const agendaSummary = typeof input.agendaSummary === 'string' ? esc(input.agendaSummary) : '';

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Annual General Meeting Minutes</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      .muted { color: #555; font-size: 12px; }
      .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
      .sig { margin-top: 18px; padding-top: 18px; border-top: 1px dashed #ddd; }
    </style>
  </head>
  <body>
    <h1>Annual General Meeting Minutes</h1>
    <div class="muted">Meeting Date: ${meetingDate}</div>
    <div class="box" style="margin-top: 12px;">
      <div><strong>Company</strong>: ${companyName}</div>
      <div style="margin-top: 10px;"><strong>Chairman</strong>: ${chairman}</div>
      <div style="margin-top: 10px;"><strong>Venue</strong>: ${meetingVenue}</div>
      ${agendaSummary ? `<div style="margin-top: 10px;"><strong>Agenda Summary</strong>:</div><div style="margin-top:6px; white-space: pre-wrap;">${agendaSummary}</div>` : ''}
      <div class="sig">
        <div>Signed by Directors of the Company:</div>
        <div class="muted" style="margin-top: 8px;">Electronic signature is recorded by the system with timestamp, IP, user agent, and document hash.</div>
      </div>
    </div>
  </body>
</html>
`.trim();
}
