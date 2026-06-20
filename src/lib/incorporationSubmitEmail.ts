import type { IncorporationApplication } from '@/lib/types';

function escapeHtml(s: string) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getString(payload: Record<string, unknown>, key: string) {
  const v = payload[key];
  return typeof v === 'string' ? v.trim() : '';
}

function getNumber(payload: Record<string, unknown>, key: string) {
  const v = payload[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function getBool(payload: Record<string, unknown>, key: string) {
  const v = payload[key];
  return v === true;
}

function formatList(items: string[]) {
  return items.length ? `<ul style="margin:8px 0 0 18px; padding:0;">${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '';
}

function serviceTitle(type: IncorporationApplication['type']) {
  return type === 'REGISTER_COMPANY' ? 'Register Company' : 'Transfer of Company Secretary';
}

function buildRegisterCompanyDetails(payload: Record<string, unknown>) {
  const paidUpCurrency = getString(payload, 'paidUpCapitalCurrency');
  const paidUpAmount = getString(payload, 'paidUpCapitalAmount');
  const totalShares = getNumber(payload, 'totalShares');
  const ssic1 = getString(payload, 'ssicPrimaryCode');
  const ssic2 = getString(payload, 'ssicSecondaryCode');
  const address = getString(payload, 'address');
  const useOffice = getBool(payload, 'useByBridgeRegisteredOfficeAddress');
  const alternativeName = getString(payload, 'alternativeName');

  const shareholdersRaw = payload.shareholders;
  const shareholders = Array.isArray(shareholdersRaw) ? (shareholdersRaw as Array<Record<string, unknown>>) : [];
  const directorsRaw = payload.directors;
  const directors = Array.isArray(directorsRaw) ? (directorsRaw as Array<Record<string, unknown>>) : [];
  const rorcRaw = payload.rorcControllers;
  const rorc = Array.isArray(rorcRaw) ? (rorcRaw as Array<Record<string, unknown>>) : [];
  const secretaryRaw = payload.secretary;
  const secretary = secretaryRaw && typeof secretaryRaw === 'object' ? (secretaryRaw as Record<string, unknown>) : null;
  const nomineeDirector = getBool(payload, 'useByBridgeNomineeDirector');

  const hasCorporateShareholder = shareholders.some((s) => String(s.kind ?? '') === 'COMPANY');

  const requiredDocs = [
    'Shareholders: ID + Residential address proof (bank statement, telephone bill, utility bill, tenancy agreement) issued within the last 3 months',
    'Directors: ID + Residential address proof (bank statement, telephone bill, utility bill, tenancy agreement) issued within the last 3 months',
    'Secretary: ID + Residential address proof (bank statement, telephone bill, utility bill, tenancy agreement) issued within the last 3 months',
  ];
  if (hasCorporateShareholder) {
    requiredDocs.push('Corporate shareholder: Certificate of Incorporation, Constitution, Register of Shareholder, Register of Director, Certificate of Incumbency');
  }

  const shareholderRows = shareholders
    .map((s) => {
      const kind = String(s.kind ?? '') === 'COMPANY' ? 'Company' : 'Individual';
      const shares = typeof s.shares === 'number' ? String(s.shares) : String(s.shares ?? '');
      if (String(s.kind ?? '') === 'COMPANY') {
        const company = s.company && typeof s.company === 'object' ? (s.company as Record<string, unknown>) : {};
        return {
          kind,
          name: getString(company, 'companyName'),
          shares,
          id: getString(company, 'registrationNo'),
          email: getString(company, 'email'),
        };
      }
      const person = s.person && typeof s.person === 'object' ? (s.person as Record<string, unknown>) : {};
      return {
        kind,
        name: getString(person, 'fullName'),
        shares,
        id: getString(person, 'idNo'),
        email: getString(person, 'email'),
      };
    })
    .filter((r) => r.kind || r.name || r.shares || r.id || r.email);

  const directorRows = directors
    .map((p) => ({
      name: getString(p, 'fullName'),
      id: getString(p, 'idNo'),
      email: getString(p, 'email'),
      dob: getString(p, 'dob'),
      nationality: getString(p, 'nationality'),
    }))
    .filter((r) => r.name || r.id || r.email || r.dob || r.nationality);

  const rorcRows = rorc
    .map((c) => {
      const person = c.person && typeof c.person === 'object' ? (c.person as Record<string, unknown>) : {};
      return {
        initiationAt: getString(c, 'initiationAt'),
        name: getString(person, 'fullName'),
        id: getString(person, 'idNo'),
        email: getString(person, 'email'),
      };
    })
    .filter((r) => r.initiationAt || r.name || r.id || r.email);

  const secretaryUseByBridge = getBool(payload, 'useByBridgeCompanySecretary') || (secretary ? getBool(secretary, 'useByBridge') : false);
  const secretaryPerson = secretary && secretary.person && typeof secretary.person === 'object' ? (secretary.person as Record<string, unknown>) : null;

  const table = (headers: string[], rows: Array<Record<string, string>>) => {
    if (!rows.length) return '';
    return `
      <table style="width:100%; border-collapse:collapse; margin-top:8px;">
        <thead>
          <tr>
            ${headers.map((h) => `<th style="text-align:left; padding:6px 8px; border-bottom:1px solid #eee; font-size:12px; color:#666;">${escapeHtml(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              ${headers
                .map((k) => `<td style="padding:6px 8px; border-bottom:1px solid #f4f4f4; font-size:13px;">${escapeHtml(r[k] ?? '')}</td>`)
                .join('')}
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  };

  const shareholdersTable = table(
    ['Type', 'Name', 'Shares', 'ID / Reg', 'Email'],
    shareholderRows.map((r) => ({
      Type: r.kind,
      Name: r.name,
      Shares: r.shares,
      'ID / Reg': r.id,
      Email: r.email,
    })),
  );

  const directorsTable = table(
    ['Name', 'ID No.', 'Email', 'DOB', 'Nationality'],
    directorRows.map((r) => ({
      Name: r.name,
      'ID No.': r.id,
      Email: r.email,
      DOB: r.dob,
      Nationality: r.nationality,
    })),
  );

  const rorcTable = table(
    ['Initiation At', 'Name', 'ID No.', 'Email'],
    rorcRows.map((r) => ({
      'Initiation At': r.initiationAt,
      Name: r.name,
      'ID No.': r.id,
      Email: r.email,
    })),
  );

  const secretaryBlock = secretaryUseByBridge
    ? `<div style="margin-top:8px; font-size:13px;">Secretary: BBY company secretary</div>`
    : secretaryPerson
      ? `
        <div style="margin-top:8px; font-size:13px;">
          <div><b>Secretary</b></div>
          <div style="margin-top:4px;">Name: ${escapeHtml(getString(secretaryPerson, 'fullName'))}</div>
          <div>ID No.: ${escapeHtml(getString(secretaryPerson, 'idNo'))}</div>
          <div>Email: ${escapeHtml(getString(secretaryPerson, 'email'))}</div>
        </div>
      `
      : '';

  return {
    hasCorporateShareholder,
    requiredDocs,
    html: `
      <div style="margin-top:12px;">
        <div style="font-weight:600;">Application details</div>
        <div style="margin-top:8px; font-size:13px;">
          <div>Alternative Name: ${escapeHtml(alternativeName || '-')}</div>
          <div>Registered Share Capital: ${escapeHtml([paidUpCurrency, paidUpAmount].filter(Boolean).join(' ') || '-')}</div>
          <div>Total Number Of Shares: ${escapeHtml(totalShares ? String(totalShares) : '-')}</div>
          <div>Activity 1: ${escapeHtml(ssic1 || '-')}</div>
          <div>Activity 2: ${escapeHtml(ssic2 || '-')}</div>
          <div>Company Address: ${escapeHtml(address || '-')}</div>
          <div>Use BBY registered office: ${useOffice ? 'Yes' : 'No'}</div>
          <div>Use BBY nominee director service: ${nomineeDirector ? 'Yes' : 'No'}</div>
        </div>

        ${shareholdersTable ? `<div style="margin-top:14px;"><div style="font-weight:600;">Shareholders</div>${shareholdersTable}</div>` : ''}
        ${directorsTable ? `<div style="margin-top:14px;"><div style="font-weight:600;">Directors</div>${directorsTable}</div>` : ''}
        ${rorcTable ? `<div style="margin-top:14px;"><div style="font-weight:600;">RORC Controllers</div>${rorcTable}</div>` : ''}
        ${secretaryBlock}
      </div>
    `,
  };
}

function buildTransferSecretaryDetails(payload: Record<string, unknown>) {
  const effectiveDate = getString(payload, 'effectiveDate');
  const newSecretaryName = getString(payload, 'newSecretaryName');
  const newSecretaryEmail = getString(payload, 'newSecretaryEmail');
  const reason = getString(payload, 'reason');
  const notes = getString(payload, 'notes');

  return {
    hasCorporateShareholder: false,
    requiredDocs: ['Secretary: ID + Residential address proof (bank statement, telephone bill, utility bill, tenancy agreement) issued within the last 3 months'],
    html: `
      <div style="margin-top:12px;">
        <div style="font-weight:600;">Application details</div>
        <div style="margin-top:8px; font-size:13px;">
          <div>Effective date: ${escapeHtml(effectiveDate || '-')}</div>
          <div>New secretary name: ${escapeHtml(newSecretaryName || '-')}</div>
          <div>New secretary email: ${escapeHtml(newSecretaryEmail || '-')}</div>
          <div>Reason: ${escapeHtml(reason || '-')}</div>
          <div>Notes: ${escapeHtml(notes || '-')}</div>
        </div>
      </div>
    `,
  };
}

export function buildIncorporationSubmittedEmail(input: {
  application: IncorporationApplication;
  applicantName: string;
  applicantEmail: string;
  origin: string;
}) {
  const app = input.application;
  const company = (app.companyName ?? (typeof app.payload.companyName === 'string' ? String(app.payload.companyName) : '')).trim() || '-';
  const title = serviceTitle(app.type);
  const status = app.status;
  const subject = `${title}_${company}_${status}`;
  const details = app.type === 'REGISTER_COMPANY' ? buildRegisterCompanyDetails(app.payload) : buildTransferSecretaryDetails(app.payload);
  const detailsUrl = `${input.origin}/incorporation/applications/${encodeURIComponent(app.id)}`;

  const reminderLineEn = `Please send the required documents to BBY (Luke@bby.sg).`;
  const reminderLineZh = `请将所需资料发送给百桥咨询（Luke@bby.sg）。`;

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; line-height:1.55; color:#111;">
      <div style="font-size:16px; font-weight:700;">申请已提交 / Application Submitted</div>
      <div style="margin-top:10px; font-size:13px;">
        <div><b>申请人 / Applicant:</b> ${escapeHtml(input.applicantName)} (${escapeHtml(input.applicantEmail)})</div>
        <div><b>服务 / Service:</b> ${escapeHtml(title)}</div>
        <div><b>公司 / Company:</b> ${escapeHtml(company)}</div>
        <div><b>状态 / Status:</b> ${escapeHtml(status)}</div>
        <div><b>申请编号 / Application ID:</b> ${escapeHtml(app.id)}</div>
        <div><b>查看详情 / View details:</b> <a href="${escapeHtml(detailsUrl)}" target="_blank" rel="noreferrer">${escapeHtml(detailsUrl)}</a></div>
      </div>

      ${details.html}

      <div style="margin-top:14px; padding:12px; border:1px solid #eee; border-radius:10px; background:#fafafa;">
        <div style="font-weight:600;">Required documents</div>
        ${formatList(details.requiredDocs)}
        <div style="margin-top:10px; font-size:13px;">
          <div>${escapeHtml(reminderLineZh)}</div>
          <div>${escapeHtml(reminderLineEn)}</div>
        </div>
      </div>

      <div style="margin-top:14px; font-size:12px; color:#666;">This is an automated email.</div>
    </div>
  `;

  return { subject, html };
}

