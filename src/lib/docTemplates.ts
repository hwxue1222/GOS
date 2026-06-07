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

export function renderCompanyUpdateRequestHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
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
  const now = new Date().toISOString().slice(0, 10);

  const row = (k: string, v: string) => `<div style="margin-top: 10px;"><strong>${esc(k)}</strong>: ${esc(v)}</div>`;
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
  const body = (() => {
    if (input.type === 'CHANGE_COMPANY_NAME') {
      const newCompanyName = String(p.newCompanyName ?? '').trim();
      const chairman = String(p.chairman ?? '').trim();
      const startDate = String(p.startDate ?? '').trim();
      const meetingVenue = String(p.meetingVenue ?? '').trim();
      const useRegisteredOffice = Boolean((p as { useByBridgeRegisteredOfficeAddress?: unknown }).useByBridgeRegisteredOfficeAddress);
      return (
        row('Original Company', input.companyName) +
        row('New Company', newCompanyName || '-') +
        row('Chairman', chairman || '-') +
        row('Start Time', startDate || '-') +
        row('Meeting Venue', meetingVenue || '-') +
        row('Use ByBridge registered office address', useRegisteredOffice ? 'Yes' : 'No')
      );
    }

    if (input.type === 'CHANGE_FINANCIAL_YEAR_END') {
      const newFye = String(p.newFye ?? '').trim();
      return row('Original FYE', input.original.fye ?? '-') + row('New FYE', newFye || '-');
    }

    if (input.type === 'CHANGE_REGISTERED_OFFICE_ADDRESS') {
      const newRegisteredOfficeAddress = String(p.newRegisteredOfficeAddress ?? '').trim();
      const useByBridge = Boolean((p as { useByBridgeRegisteredOfficeAddress?: unknown }).useByBridgeRegisteredOfficeAddress);
      return (
        row('Original Registered Office Address', input.original.registeredOfficeAddress ?? '-') +
        row('New Registered Office Address', newRegisteredOfficeAddress || '-') +
        row('Use ByBridge registered office address', useByBridge ? 'Yes' : 'No')
      );
    }

    if (input.type === 'CHANGE_BUSINESS_ACTIVITIES') {
      const ssicPrimaryCode = String(p.ssicPrimaryCode ?? '').trim();
      const ssicSecondaryCode = String(p.ssicSecondaryCode ?? '').trim();
      return (
        row('Original Activity 1 (SSIC)', input.original.ssicPrimaryCode ?? '-') +
        row('Original Activity 2 (SSIC)', input.original.ssicSecondaryCode ?? '-') +
        row('New Activity 1 (SSIC)', ssicPrimaryCode || '-') +
        row('New Activity 2 (SSIC)', ssicSecondaryCode || '-')
      );
    }

    if (input.type === 'CHANGE_SECRETARY') {
      const removeSecretaryRoleId = String(p.removeSecretaryRoleId ?? '').trim();
      const addSecretaries = Array.isArray(p.addSecretaries) ? (p.addSecretaries as Array<Record<string, unknown>>) : [];
      const useByBridge = Boolean((p as { useByBridgeCompanySecretary?: unknown }).useByBridgeCompanySecretary);
      const addList = addSecretaries
        .map((x) => ({ fullName: String(x.fullName ?? '').trim(), email: String(x.email ?? '').trim() }))
        .filter((x) => !!x.fullName)
        .map((x) => (x.email ? `${esc(x.fullName)} &lt;${esc(x.email)}&gt;` : esc(x.fullName)));
      const addHtml = addList.length
        ? `<ul style="margin:8px 0 0 18px;">${addList.map((x) => `<li>${x}</li>`).join('')}</ul>`
        : '<div class="muted" style="margin-top:6px;">None</div>';

      return (
        row('Remove secretary role ID', removeSecretaryRoleId || '-') +
        `<div style="margin-top: 10px;"><strong>Add secretaries</strong>:</div>${addHtml}` +
        row('Use ByBridge company secretary', useByBridge ? 'Yes' : 'No')
      );
    }

    if (input.type === 'TRANSFER_COMPANY_SECRETARY') {
      const effectiveDate = String(p.effectiveDate ?? '').trim();
      const newSecretaryName = String(p.newSecretaryName ?? '').trim();
      const newSecretaryEmail = String(p.newSecretaryEmail ?? '').trim();
      const reason = String(p.reason ?? '').trim();
      const notes = String(p.notes ?? '').trim();
      return (
        row('Effective date', effectiveDate || '-') +
        row('New secretary name', newSecretaryName || '-') +
        row('New secretary email', newSecretaryEmail || '-') +
        row('Reason', reason || '-') +
        row('Notes', notes || '-')
      );
    }

    return '';
  })();

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
    <h1>${esc(title)}</h1>
    <div class="muted">Date: ${esc(now)}</div>
    <div class="box" style="margin-top: 12px;">
      <div><strong>Company</strong>: ${companyName}${companyRegistrationNo ? ` (${companyRegistrationNo})` : ''}</div>
      ${body}
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
