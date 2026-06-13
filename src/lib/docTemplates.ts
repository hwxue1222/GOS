import ssic from '@/data/ssic.json';

function esc(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function toDdMmYyyy(ymd: string) {
  const m = String(ymd ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

type SsicRow = { code: string; description: string };

const ssicRows = (Array.isArray(ssic) ? ssic : []) as unknown as SsicRow[];
const ssicDescByCode = (() => {
  const m = new Map<string, string>();
  for (const r of ssicRows) {
    const code = String(r.code ?? '').trim();
    const description = String(r.description ?? '').trim();
    if (code && description) m.set(code.toLowerCase(), description);
  }
  return m;
})();

function formatSsic(codeRaw: string) {
  const code = String(codeRaw ?? '').trim();
  if (!code) return '-';
  const desc = ssicDescByCode.get(code.toLowerCase()) ?? '';
  if (!desc) return code;
  return `${desc}(${code})`;
}

function signatureBlocksByEmail(input: {
  signers: Array<{ fullName: string; email?: string }>;
  label?: string;
}) {
  const label = input.label ?? 'Director:';
  const list = input.signers.length ? input.signers : [{ fullName: '', email: undefined }];
  return list
    .map((d) => {
      const nameHtml = d.fullName ? `<div class="sig-name"><strong>${esc(d.fullName)}</strong></div>` : '<div class="sig-name">________________</div>';
      const emailKey = d.email ? esc(String(d.email).toLowerCase()) : '';
      const marker = emailKey ? `<span class="sig-mark" data-signer="${emailKey}"></span>` : '<span class="sig-mark"></span>';
      const labelHtml = label ? `<div>${esc(label)}</div>` : '';
      return `
<div class="sig-block">
  ${labelHtml}
  <div class="sig-line">${marker}</div>
  ${nameHtml}
</div>
`.trim();
    })
    .join('');
}

function signatureLineBlocks(input: {
  signers: Array<{ fullName: string; email?: string }>;
  nameColor?: string;
}) {
  const list = input.signers.length ? input.signers : [{ fullName: '', email: undefined }];
  const nameColor = String(input.nameColor ?? '').trim();
  const nameStyle = nameColor ? ` style="color:${esc(nameColor)}"` : '';
  return list
    .map((d) => {
      const emailKey = d.email ? esc(String(d.email).toLowerCase()) : '';
      const marker = emailKey ? `<span class="sig-mark" data-signer="${emailKey}"></span>` : '<span class="sig-mark"></span>';
      const name = d.fullName ? esc(d.fullName) : '___________________';
      return `
<div class="sig-row">
  <div class="sig-line">${marker}</div>
  <div class="sig-name"${nameStyle}>${name}</div>
</div>
`.trim();
    })
    .join('');
}

function directorResolutionHeaderLabel(directorCount: number) {
  return directorCount > 1
    ? "DIRECTORS' RESOLUTION IN WRITING PURSUANT TO THE CONSTITUTION OF THE COMPANY"
    : "DIRECTOR'S RESOLUTION IN WRITING PURSUANT TO THE CONSTITUTION OF THE COMPANY";
}

export function renderSecretaryConsentToActHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  secretary: {
    fullName: string;
    email?: string;
    address: string;
    nationality: string;
    idNo: string;
    idTypeLabel?: 'Passport No.' | 'NRIC No.' | 'FIN No.' | 'IC No.';
    effectiveDateYmd: string;
    declarationQualifications: Array<'i' | 'ii' | 'iii' | 'iv' | 'v' | 'vi' | 'vii'>;
  };
  signedDateYmd: string;
}) {
  const s = input.secretary;
  const idLabel = String(s.idTypeLabel ?? 'FIN No.').trim() || 'FIN No.';
  const qset = new Set((s.declarationQualifications ?? []).map((x) => String(x)));
  const strike = (k: string, text: string) => (qset.has(k) ? text : `<span class="strike">${text}</span>`);
  const signer = [{ fullName: s.fullName, email: s.email }];
  const blocks = signatureBlocksByEmail({ signers: signer, label: '' });
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Consent to Act as Secretary</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      .title { font-size: 16px; font-weight: 700; text-align: center; }
      .center { text-align: center; }
      .block { margin-top: 12px; }
      .muted { color: #555; font-size: 12px; }
      .sig-block { margin-top: 18px; }
      .sig-line { width: 260px; height: 26px; border-bottom: 1px solid #111; position: relative; margin-top: 10px; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 2px; }
      .kv { margin-top: 8px; }
      .kv div { margin-top: 4px; }
      ul { margin: 8px 0 0 0; padding-left: 0; list-style: none; }
      li { margin-top: 6px; }
      .strike { text-decoration: line-through; }
    </style>
  </head>
  <body>
    <div class="center">THE COMPANIES ACT</div>
    <div class="center">(CHAPTER 50)</div>
    <div class="center">SECTION 173 (4A)</div>
    <div class="title block">CONSENT TO ACT AS SECRETARY</div>

    <div class="kv">
      <div><strong>Name of Company:</strong> ${esc(input.companyName)}</div>
      <div><strong>Company UEN:</strong> ${esc(input.companyRegistrationNo ?? '')}</div>
    </div>

    <div class="block">1. I, the undermentioned person, hereby consent to act as a secretary of the abovenamed company with effect from ${esc(input.secretary.effectiveDateYmd)}.</div>
    <div class="block">2. I am a qualified person under section 171(1AA) of the Companies Act by virtue of my being —</div>

    <ul>
      <li>${strike('i', '(i) a secretary of a company for at least 3 of the 5 years immediately preceding the abovementioned date of my appointment as secretary of the abovenamed company.')}</li>
      <li>${strike('ii', '(ii) a qualified person under the Legal Profession Act (Cap. 161).')}</li>
      <li>${strike('iii', '(iii) public accountant registered or deemed to be registered under the Accountants Act (Cap. 2).')}</li>
      <li>${strike('iv', '(iv) a member of the Singapore Association of the Institute of Chartered Secretaries and Administrators.')}</li>
      <li>${strike('v', '(v) a member of the Institute of Singapore Chartered Accountants (formerly known as the Institute of Certified Public Accountants of Singapore).')}</li>
      <li>${strike('vi', '(vi) a member of the Association of International Accountants (Singapore Branch).')}</li>
      <li>${strike('vii', '(vii) a member of The Institute of Company Accountants, Singapore.')}</li>
    </ul>

    ${blocks}

    <div class="block"><strong>Name:</strong> ${esc(s.fullName)}</div>
    <div class="block"><strong>Address:</strong> ${esc(s.address)}</div>
    <div class="block"><strong>${esc(idLabel)}</strong> ${esc(s.idNo)} &nbsp;&nbsp;&nbsp; <strong>Nationality:</strong> ${esc(s.nationality)}</div>
    <div class="block"><strong>Date:</strong> ${esc(toDdMmYyyy(input.signedDateYmd))}</div>
    <div class="block muted"># to be completed by secretaries of public companies only or by secretaries of private companies appointed under section 171(1AB) of the Act.</div>
  </body>
</html>
`.trim();
}

export function renderSecretaryResignationLetterHtml(input: {
  companyName: string;
  resignedSecretary: { fullName: string; email?: string };
  dateYmd: string;
}) {
  const signer = [{ fullName: input.resignedSecretary.fullName, email: input.resignedSecretary.email }];
  const blocks = signatureBlocksByEmail({ signers: signer, label: '' });
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Letter of Resignation</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.6; padding: 24px; color: #111; }
      .block { margin-top: 12px; }
      .sig-block { margin-top: 18px; }
      .sig-line { width: 260px; height: 26px; border-bottom: 1px solid #111; position: relative; margin-top: 10px; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 2px; }
    </style>
  </head>
  <body>
    <div>Date: ${esc(toDdMmYyyy(input.dateYmd))}</div>
    <div class="block">The Board of Directors</div>
    <div>${esc(input.companyName)}</div>
    <div class="block">Dear Sirs,</div>

    <div class="block"><strong>LETTER OF RESIGNATION</strong></div>
    <div class="block">I hereby tender my resignation as Secretary of the Company with immediate effect.</div>
    <div class="block">I acknowledge that I shall henceforth have no further claims against the Company in respect of all matters and disputes which have arisen prior to this date on the understanding that the Company shall likewise have no claims whatsoever against me.</div>
    <div class="block">Yours faithfully</div>

    ${blocks}
  </body>
</html>
`.trim();
}

export function renderDirectorResignationLetterHtml(input: {
  companyName: string;
  resignedDirector: { fullName: string; email?: string };
  dateYmd: string;
  resignationDateYmd?: string;
}) {
  const signer = [{ fullName: input.resignedDirector.fullName, email: input.resignedDirector.email }];
  const blocks = signatureBlocksByEmail({ signers: signer, label: '' });
  const resignationLine = input.resignationDateYmd
    ? `I hereby tender my resignation as Director of the Company with effect from ${esc(toDdMmYyyy(input.resignationDateYmd))}.`
    : 'I hereby tender my resignation as Director of the Company with immediate effect.';
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Letter of Resignation</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.6; padding: 24px; color: #111; }
      .block { margin-top: 12px; }
      .sig-block { margin-top: 18px; }
      .sig-line { width: 260px; height: 26px; border-bottom: 1px solid #111; position: relative; margin-top: 10px; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 2px; }
    </style>
  </head>
  <body>
    <div>Date: ${esc(toDdMmYyyy(input.dateYmd))}</div>
    <div class="block">The Board of Directors</div>
    <div>${esc(input.companyName)}</div>
    <div class="block">Dear Sirs,</div>

    <div class="block"><strong>LETTER OF RESIGNATION</strong></div>
    <div class="block">${resignationLine}</div>
    <div class="block">I acknowledge that I shall henceforth have no further claims against the Company in respect of all matters and disputes which have arisen prior to this date on the understanding that the Company shall likewise have no claims whatsoever against me.</div>
    <div class="block">Yours faithfully</div>

    ${blocks}
  </body>
</html>
`.trim();
}

export function renderNoticeOfExtraordinaryGeneralMeetingChangeCompanyNameHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  noticeDateYmd: string;
  meetingDateYmd: string;
  meetingVenue: string;
  chairman: string;
  chairmanEmail?: string;
  newCompanyName: string;
}) {
  const signer = [{ fullName: input.chairman, email: input.chairmanEmail }];
  const blocks = signatureLineBlocks({ signers: signer });
  const meetingLong = toDayOfMonthLong(input.meetingDateYmd);
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Notice of Extraordinary General Meeting</title>
    <style>
      body { font-family: Verdana, ui-sans-serif, system-ui, -apple-system; line-height: 1.55; padding: 28px; color: #111; font-size: 12px; }
      .title { font-weight: 700; text-transform: uppercase; }
      .center { text-align: center; }
      .block { margin-top: 10px; }
      .sig-row { margin-top: 16px; }
      .sig-line { width: 220px; height: 20px; border-bottom: 1px solid #111; position: relative; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="title">${esc(input.companyName)}</div>
    ${input.companyRegistrationNo ? `<div>Co. Reg. No.: ${esc(input.companyRegistrationNo)}</div>` : ''}
    <div>(Incorporated in the Republic of Singapore)</div>

    <div class="block title center">NOTICE OF EXTRAORDINARY GENERAL MEETING</div>
    <div class="block">NOTICE IS HEREBY GIVEN THAT an Extraordinary General Meeting of the Company will be held at&nbsp;&nbsp;&nbsp;&nbsp;${esc(input.meetingVenue)}&nbsp;&nbsp;on the ${esc(meetingLong)} at 10.00 a.m. for the purpose of considering and, if thought fit, passing the following resolution(s):-</div>

    <div class="block"><strong>SPECIAL RESOLUTION</strong></div>
    <div class="block"><strong>THE PROPOSED CHANGE OF NAME OF THE COMPANY</strong></div>
    <div class="block">(a)&nbsp;&nbsp;subject to the approval of the Accounting and Corporate Regulatory Authority of Singapore (“ACRA”), the name of the Company be and is changed from “${esc(input.companyName)}” to “${esc(input.newCompanyName)}” and that the name “${esc(input.newCompanyName)}” be substituted for “${esc(input.companyName)}” wherever the latter name appears in the Constitution of the Company; and</div>
    <div class="block">(b)&nbsp;&nbsp;each of the Directors of the Company be and is hereby authorised to complete and do all such acts and things (including executing or amending all such documents as may be required) as he may consider expedient, necessary or appropriate to give effect to this resolution as he may deem fit.</div>

    <div class="block"><strong>BY ORDER OF THE BOARD</strong></div>
    ${blocks}
    <div class="block">DIRECTOR</div>
    <div class="block">Date: ${esc(toDdMmYyyy(input.noticeDateYmd))}</div>
  </body>
</html>
`.trim();
}

export function renderMinutesOfExtraordinaryGeneralMeetingChangeCompanyNameHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  meetingDateYmd: string;
  meetingVenue: string;
  chairman: string;
  oldCompanyName: string;
  newCompanyName: string;
  shareholders?: Array<{ fullName: string; email?: string }>;
}) {
  const blocks = signatureLineBlocks({ signers: input.shareholders ?? [] });
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Minutes of Extraordinary General Meeting</title>
    <style>
      body { font-family: Verdana, ui-sans-serif, system-ui, -apple-system; line-height: 1.55; padding: 28px; color: #111; font-size: 12px; }
      .title { font-weight: 700; text-transform: uppercase; }
      .block { margin-top: 10px; }
      .u { text-decoration: underline; text-underline-offset: 3px; }
      .sig-row { margin-top: 8px; }
      .sig-line { width: 220px; height: 20px; border-bottom: 1px solid #111; position: relative; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 4px; }
      .chair-line { width: 240px; height: 20px; border-bottom: 1px solid #111; margin-top: 16px; }
    </style>
  </head>
  <body>
    <div class="title">${esc(input.companyName)}</div>
    ${input.companyRegistrationNo ? `<div>Co. Reg. No.: ${esc(input.companyRegistrationNo)}</div>` : ''}
    <div>(Incorporated in the Republic of Singapore)</div>

    <div class="block title">MINUTES OF EXTRAORDINARY GENERAL MEETING</div>
    <div class="block">Minutes of the Extraordinary General Meeting of the Company held at&nbsp;&nbsp;${esc(input.meetingVenue)}&nbsp;&nbsp;on&nbsp;&nbsp;${esc(toDdMmYyyy(input.meetingDateYmd))} 10:00</div>

    <div class="block"><strong>PRESENT:</strong></div>
    <div class="block">${blocks || '-'}</div>

    <div class="block">Chairman&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;${esc(input.chairman)} was in the chair.</div>
    <div class="block">Notice of Meeting&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;The notice was taken as read.</div>

    <div class="block"><strong>SPECIAL RESOLUTION</strong></div>
    <div class="block"><strong>THE PROPOSED CHANGE OF NAME OF THE COMPANY</strong></div>
    <div class="block">(a)&nbsp;&nbsp;subject to the approval of the Accounting and Corporate Regulatory Authority of Singapore (“ACRA”), the name of the Company be and is changed from “${esc(input.oldCompanyName)}” to “${esc(input.newCompanyName)}” and that the name “${esc(input.newCompanyName)}” be substituted for “${esc(input.oldCompanyName)}” wherever the latter name appears in the Constitution of the Company; and</div>
    <div class="block">(b)&nbsp;&nbsp;each of the Directors of the Company be and is hereby authorised to complete and do all such acts and things (including executing or amending all such documents as may be required) as he may consider expedient, necessary or appropriate to give effect to this resolution as he may deem fit.</div>

    <div class="block">There being no other business, the meeting ended with a vote of thanks to the Chairman.</div>

    <div class="block">Certified as a True Record of Minutes</div>
    <div class="chair-line"></div>
    <div class="block">Name:&nbsp;&nbsp;${esc(input.chairman)}</div>
    <div class="block">Chairman</div>
    <div class="block">Date:&nbsp;&nbsp;${esc(toDdMmYyyy(input.meetingDateYmd))}</div>
  </body>
</html>
`.trim();
}

export function renderCertificateOfAppointmentOfCorporateRepresentativeHtml(input: {
  shareholderCompanyName: string;
  shareholderCompanyRegistrationNo?: string;
  shareholderCompanyAddress: string;
  targetCompanyName: string;
  representativeName: string;
  representativeAddress: string;
  witnessIdTypeLabel: string;
  witnessIdNo: string;
  witnessPhone?: string;
  witnessEmail: string;
  directorSignerName: string;
  directorSignerEmail?: string;
  dateYmd: string;
}) {
  const sig = signatureLineBlocks({
    signers: [{ fullName: input.directorSignerName, email: input.directorSignerEmail }],
  });
  const datedLong = toDayOfMonthLong(input.dateYmd);
  const shareholderAddress = input.shareholderCompanyAddress.trim() ? esc(input.shareholderCompanyAddress) : '______________________________';
  const representativeAddress = input.representativeAddress.trim() ? esc(input.representativeAddress) : '______________________________';
  const witnessPhone = String(input.witnessPhone ?? '').trim();
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Certificate of Appointment of Corporate Representative</title>
    <style>
      body { font-family: Verdana, ui-sans-serif, system-ui, -apple-system; line-height: 1.55; padding: 28px; color: #111; font-size: 12px; }
      .title { font-weight: 700; text-transform: uppercase; }
      .center { text-align: center; }
      .block { margin-top: 10px; }
      .sig-row { margin-top: 16px; }
      .sig-line { width: 220px; height: 20px; border-bottom: 1px solid #111; position: relative; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 4px; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; }
      .mt2 { margin-top: 8px; }
    </style>
  </head>
  <body>
    <div class="title">${esc(input.shareholderCompanyName)}</div>
    ${input.shareholderCompanyRegistrationNo ? `<div>Co. Reg. No.: ${esc(input.shareholderCompanyRegistrationNo)}</div>` : ''}

    <div class="block title center">CERTIFICATE OF APPOINTMENT OF CORPORATE REPRESENTATIVE</div>

    <div class="block">We, ${esc(input.shareholderCompanyName)} of ${shareholderAddress} upon being a member of ${esc(input.targetCompanyName)} (Company) hereby appoint:-</div>

    <div class="block">${esc(input.representativeName)}</div>
    <div class="block">of address:&nbsp;&nbsp;${representativeAddress}</div>
    <div class="block">or failing him / her,</div>
    <div class="block">Mr / Ms</div>
    <div class="block">of address:</div>

    <div class="block">as our representative at all general meetings of the Company and at any adjournments thereof with full authority to sign, execute and exercise the same powers on our behalf as we could exercise if we were an individual member of the Company including, without limitation to the foregoing, the power to accept shorter notice or to waive notice of any such general meetings of the Company, and to act on, vote on, sign and execute, on our behalf, all relevant documents recording members’ resolutions.</div>
    <div class="block">The authorisation conferred by this Certificate shall continue to have effect until revoked by us by notice in writing to the Company or by the issue of a subsequent Certificate.</div>

    <div class="block">Dated this ${esc(datedLong)}</div>

    <div class="block">We confirm that ${esc(input.shareholderCompanyName)} is not required to have a Common Seal under the provisions of its Articles of Association or the prevailing laws applicable to the company in its country of incorporation.</div>
    <div class="block">This Certificate is executed in such manner as to be binding upon ${esc(input.shareholderCompanyName)}</div>

    <div class="block">${esc(input.directorSignerName)}</div>
    <div class="block">Director</div>

    <div class="block">Signed For &amp;</div>
    <div class="block">On Behalf of ${esc(input.shareholderCompanyName)}</div>

    <div class="grid2 block">
      <div>
        <div>Signature of authorised representative</div>
        ${sig}
      </div>
      <div>
        <div>Witnessed by</div>
        <div class="mt2">Name:&nbsp;&nbsp;${esc(input.representativeName)}</div>
        <div class="mt2">NRIC/Passport No.:&nbsp;&nbsp;${esc(input.witnessIdTypeLabel)} ${esc(input.witnessIdNo)}</div>
        <div class="mt2">Phone No.:&nbsp;&nbsp;${esc(witnessPhone)}</div>
        <div class="mt2">Email:&nbsp;&nbsp;${esc(input.witnessEmail)}</div>
      </div>
    </div>
  </body>
</html>
`.trim();
}

function toDayOfMonthLong(ymd: string) {
  const m = String(ymd ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const month = months[mm - 1] ?? '';
  const suffix = dd % 100 >= 11 && dd % 100 <= 13 ? 'th' : dd % 10 === 1 ? 'st' : dd % 10 === 2 ? 'nd' : dd % 10 === 3 ? 'rd' : 'th';
  return `${dd}${suffix} day of ${month} ${yyyy}`;
}

export function renderDirectorConsentToActHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  director: {
    fullName: string;
    email: string;
    address: string;
    nationality: string;
    idNo: string;
    idTypeLabel?: 'Passport No.' | 'NRIC No.' | 'FIN No.' | 'IC No.' | 'ID No.';
    dobYmd: string;
    effectiveDateYmd: string;
  };
  signedDateYmd: string;
}) {
  const d = input.director;
  const idLabel = String(d.idTypeLabel ?? 'ID No.').trim() || 'ID No.';
  const signer = [{ fullName: d.fullName, email: d.email }];
  const blocks = signatureBlocksByEmail({ signers: signer, label: '' });
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Consent to Act as Director</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      .title { font-size: 16px; font-weight: 700; text-align: center; }
      .center { text-align: center; }
      .block { margin-top: 12px; }
      .muted { color: #555; font-size: 12px; }
      .sig-block { margin-top: 18px; }
      .sig-line { width: 260px; height: 26px; border-bottom: 1px solid #111; position: relative; margin-top: 10px; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 2px; }
      .kv { margin-top: 8px; }
      .kv div { margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="center">THE COMPANIES ACT</div>
    <div class="center">(CHAPTER 50)</div>
    <div class="title block">CONSENT TO ACT AS DIRECTOR</div>

    <div class="kv">
      <div><strong>Name of Company:</strong> ${esc(input.companyName)}</div>
      <div><strong>Company UEN:</strong> ${esc(input.companyRegistrationNo ?? '')}</div>
    </div>

    <div class="block">I, the undermentioned person, hereby consent to act as a Director of the abovenamed company with effect from ${esc(input.director.effectiveDateYmd)}.</div>

    ${blocks}

    <div class="block"><strong>Name:</strong> ${esc(d.fullName)}</div>
    <div class="block"><strong>Address:</strong> ${esc(d.address)}</div>
    <div class="block"><strong>${esc(idLabel)}</strong> ${esc(d.idNo)} &nbsp;&nbsp;&nbsp; <strong>Nationality:</strong> ${esc(d.nationality)}</div>
    <div class="block"><strong>Date of Birth:</strong> ${esc(toDdMmYyyy(d.dobYmd))}</div>
    <div class="block"><strong>Date:</strong> ${esc(toDdMmYyyy(input.signedDateYmd))}</div>
    <div class="block muted">Electronic signature is recorded by the system with timestamp, IP, user agent, and document hash.</div>
  </body>
</html>
`.trim();
}

export function renderChangeDirectorResolutionHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  directors: Array<{ fullName: string; email?: string }>;
  resolutionDateYmd: string;
  effectiveDateYmd: string;
  appointedDirectors: Array<{ fullName: string; idTypeLabel?: string; idNo?: string }>;
  resignedDirectors: Array<{ fullName: string; idTypeLabel?: string; idNo?: string }>;
  resignationDateYmd?: string;
}) {
  const sigBlocks = signatureBlocksByEmail({ signers: input.directors, label: '' });
  const headerLabel = directorResolutionHeaderLabel(input.directors.length);
  const appts = input.appointedDirectors;
  const resigs = input.resignedDirectors;

  const fmtIdPart = (x: { idTypeLabel?: string; idNo?: string }) => {
    const idNo = String(x.idNo ?? '').trim();
    const idTypeLabel = String(x.idTypeLabel ?? '').trim();
    return idNo ? ` (${esc(idTypeLabel || 'ID No.')} ${esc(idNo)})` : '';
  };

  const apptLines = appts.length
    ? appts
        .map(
          (d) =>
            `That ${esc(d.fullName)}${fmtIdPart(d)} having consented to act as Director of the Company, be and is hereby appointed with effect from <strong>${esc(toDdMmYyyy(input.effectiveDateYmd))}</strong>.`,
        )
        .join('<br />')
    : '';

  const resignLines = resigs.length
    ? resigs
        .map((d) => {
          const datePart = input.resignationDateYmd
            ? `with effect from <strong>${esc(toDdMmYyyy(input.resignationDateYmd))}</strong>`
            : 'with immediate effect';
          return `That the resignation of ${esc(d.fullName)}${fmtIdPart(d)} as Director of the Company, be and is hereby approved ${datePart}.`;
        })
        .join('<br />')
    : '';

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Change of Director</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      .title { font-size: 18px; font-weight: 700; margin: 0; }
      .muted { color: #555; font-size: 12px; }
      .subtitle { margin-top: 8px; font-size: 14px; font-weight: 700; }
      .block { margin-top: 14px; }
      .sig-block { margin-top: 18px; }
      .sig-line { width: 260px; height: 26px; border-bottom: 1px solid #111; position: relative; margin-top: 10px; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 2px; }
    </style>
  </head>
  <body>
    <div class="title">${esc(input.companyName)}</div>
    <div style="margin-top: 0;"><strong>Co. Reg. No.</strong>: ${esc(input.companyRegistrationNo ?? '')}</div>
    <div class="muted">(Incorporated in the Republic of Singapore)</div>

    <div style="height: 14px;"></div>

    <div class="subtitle">${headerLabel}</div>
    <div class="block">I/We, the undersigned, being the Director(s) of the Company, do hereby pass the following resolutions:</div>

    <div class="subtitle">RESOLVED –</div>
    <div class="subtitle" style="font-weight: 700;">CHANGE OF DIRECTOR</div>

    ${resignLines ? `<div class="block">${resignLines}</div>` : ''}
    ${apptLines ? `<div class="block">${apptLines}</div>` : ''}

    ${sigBlocks}

    <div style="margin-top: 18px;"><strong>Dated</strong>: ${esc(toDdMmYyyy(input.resolutionDateYmd))}</div>
  </body>
</html>
`.trim();
}

export function renderChangeSecretaryResolutionHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  directors: Array<{ fullName: string; email?: string }>;
  resolutionDateYmd: string;
  appointedSecretaries: Array<{ fullName: string; idTypeLabel?: string; idNo?: string }>;
  resignedSecretary?: { fullName: string; idTypeLabel?: string; idNo?: string };
}) {
  const sigBlocks = signatureBlocksByEmail({ signers: input.directors, label: '' });
  const headerLabel = directorResolutionHeaderLabel(input.directors.length);
  const appts = input.appointedSecretaries;
  const apptLines = appts
    .map((s) => {
      const idNo = String(s.idNo ?? '').trim();
      const idTypeLabel = String(s.idTypeLabel ?? '').trim();
      const idPart = idNo ? ` (${esc(idTypeLabel || 'ID No.')} ${esc(idNo)})` : '';
      return `That ${esc(s.fullName)}${idPart} having consented to act as Secretary of the Company, be and is hereby appointed with immediate effect.`;
    })
    .join('<br />');
  const resigned = input.resignedSecretary;
  const resignLine = resigned
    ? (() => {
        const idNo = String(resigned.idNo ?? '').trim();
      const idTypeLabel = String(resigned.idTypeLabel ?? '').trim();
      const idPart = idNo ? ` (${esc(idTypeLabel || 'ID No.')} ${esc(idNo)})` : '';
        return `That the resignation of ${esc(resigned.fullName)}${idPart} as Secretary of the Company, be and is hereby approved with immediate effect.`;
      })()
    : '';

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Change of Secretary</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      .title { font-size: 18px; font-weight: 700; margin: 0; }
      .muted { color: #555; font-size: 12px; }
      .subtitle { margin-top: 8px; font-size: 14px; font-weight: 700; }
      .block { margin-top: 14px; }
      .sig-block { margin-top: 18px; }
      .sig-line { width: 260px; height: 26px; border-bottom: 1px solid #111; position: relative; margin-top: 10px; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 2px; }
    </style>
  </head>
  <body>
    <div class="title">${esc(input.companyName)}</div>
    <div style="margin-top: 0;"><strong>Co. Reg. No.</strong>: ${esc(input.companyRegistrationNo ?? '')}</div>
    <div class="muted">(Incorporated in the Republic of Singapore)</div>

    <div class="subtitle">${headerLabel}</div>
    <div class="block">I/We, the undersigned, being the Director(s) of the Company, do hereby pass the following resolutions:</div>
    <div class="subtitle">RESOLVED –</div>

    ${apptLines ? `<div class=\"subtitle\">APPOINTMENT OF SECRETARY</div><div class=\"block\">${apptLines}</div>` : ''}
    ${resignLine ? `<div class=\"subtitle\">RESIGNATION OF SECRETARY</div><div class=\"block\">${resignLine}</div>` : ''}

    <div class="subtitle">DIRECTORS:</div>
    ${sigBlocks}
    <div style="margin-top: 18px;"><strong>Date</strong>: ${esc(toDdMmYyyy(input.resolutionDateYmd))}</div>
  </body>
</html>
`.trim();
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
  valueSgd?: number;
  shareClass?: string;
  effectiveDate: string;
}) {
  const targetCompanyName = esc(input.targetCompanyName);
  const transferorName = esc(input.transferorName);
  const transfereeName = esc(input.transfereeName);
  const shareClass = input.shareClass ? esc(input.shareClass) : '';
  const effectiveDate = esc(input.effectiveDate);
  const valueSgd = Number(input.valueSgd);
  const valueLine = Number.isFinite(valueSgd) ? `<div style="margin-top: 10px;"><strong>Value of shares transferred</strong>: S$${esc(String(valueSgd))}</div>` : '';

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
      ${valueLine}
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
    <title>Director Resolution</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      .muted { color: #555; font-size: 12px; }
      .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
      .sig { margin-top: 18px; padding-top: 18px; border-top: 1px dashed #ddd; }
    </style>
  </head>
  <body>
    <h1>Director Resolution</h1>
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

  if (input.type === 'CHANGE_SECRETARY') {
    const p = input.payload ?? {};
    const addSecretaries = Array.isArray((p as { addSecretaries?: unknown }).addSecretaries)
      ? (((p as { addSecretaries?: unknown }).addSecretaries ?? []) as Array<Record<string, unknown>>)
      : [];
    const appointedSecretaries = addSecretaries
      .map((x) => ({
        fullName: String(x.fullName ?? '').trim(),
        idTypeLabel: String(x.idTypeLabel ?? '').trim() || undefined,
        idNo: String(x.idNo ?? '').trim() || undefined,
      }))
      .filter((x) => !!x.fullName);

    const resignedName = String((p as { resignedSecretaryName?: unknown }).resignedSecretaryName ?? '').trim();
    const resignedIdNo = String((p as { resignedSecretaryIdNo?: unknown }).resignedSecretaryIdNo ?? '').trim() || undefined;
    const resignedIdTypeLabel =
      String((p as { resignedSecretaryIdTypeLabel?: unknown }).resignedSecretaryIdTypeLabel ?? '').trim() || undefined;
    const resignedSecretary = resignedName
      ? { fullName: resignedName, idTypeLabel: resignedIdTypeLabel, idNo: resignedIdNo }
      : undefined;

    return renderChangeSecretaryResolutionHtml({
      companyName: input.companyName,
      companyRegistrationNo: input.companyRegistrationNo,
      directors: input.directors ?? [],
      resolutionDateYmd: nowYmd,
      appointedSecretaries,
      resignedSecretary,
    });
  }

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

    <div class="subtitle">${directorResolutionHeaderLabel(directors.length)}</div>
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

  if (input.type === 'CHANGE_BUSINESS_ACTIVITIES') {
    const old1Code = String(input.original.ssicPrimaryCode ?? '').trim();
    const old2Code = String(input.original.ssicSecondaryCode ?? '').trim();
    const next1Code = String((p as { ssicPrimaryCode?: unknown }).ssicPrimaryCode ?? '').trim();
    const next2Code = String((p as { ssicSecondaryCode?: unknown }).ssicSecondaryCode ?? '').trim();
    const old1 = formatSsic(old1Code);
    const old2 = formatSsic(old2Code);
    const next1 = formatSsic(next1Code);
    const next2 = formatSsic(next2Code);
    const changed1 = !!next1Code && old1Code.toLowerCase() !== next1Code.toLowerCase();
    const changed2 = !!next2Code && old2Code.toLowerCase() !== next2Code.toLowerCase();
    const parts = [
      changed1
        ? old1Code
          ? `from "<strong>${esc(old1)}</strong>" to "<strong>${esc(next1)}</strong>"`
          : `to "<strong>${esc(next1)}</strong>"`
        : '',
      changed2
        ? old2Code
          ? `from "<strong>${esc(old2)}</strong>" to "<strong>${esc(next2)}</strong>"`
          : `to "<strong>${esc(next2)}</strong>"`
        : '',
    ].filter(Boolean);

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
    <title>Change of Business Activities</title>
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

    <div class="subtitle">${directorResolutionHeaderLabel(directors.length)}</div>
    <div class="block">I/We, the undersigned, being the Director(s) of the Company, do hereby pass the following resolution:</div>
    <div class="subtitle">RESOLVED –</div>
    <div class="subtitle">CHANGE OF BUSINESS ACTIVITIES</div>
    <div class="block" style="white-space: pre-wrap;">
      ${parts.length ? `That the business activities are changed ${parts.join(' and ')} with immediate effect.` : 'That the business activities of the Company remain unchanged.'}
    </div>
    ${signatureBlocks}
    <div style="margin-top: 18px;">Date: <span class="red">${esc(dated)}</span></div>
    <div style="margin-top: 18px;"><strong>Dated</strong>: ${esc(dated)}</div>
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
      .underline { text-decoration: underline; }
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

    <div class="subtitle">${directorResolutionHeaderLabel(directors.length)}</div>

    <div class="block">I/We, the undersigned, being the Director(s) of the Company, do hereby pass the following resolutions:</div>

    <div class="subtitle">RESOLVED –</div>
    <div class="subtitle underline">CHANGE OF REGISTERED ADDRESS</div>

    <div class="block" style="white-space: pre-wrap;">That the registered office address of the Company be changed from <span class="underline">${esc(oldAddr)}</span> to <span class="underline">${esc(newAddr)}</span> from immediate effect.</div>

    <div class="block">Directors:</div>

    ${signatureBlocks}
    <div style="margin-top: 18px;">Date: ${esc(dated)}</div>
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
    <h1>Director Resolution</h1>
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

export function renderRorcControllerDeclarationHtml(input: {
  companyName: string;
  controllerType: 'PERSON' | 'COMPANY';
  effectiveDate: string;
  controllerPerson?: {
    fullName: string;
    idType?: string;
    idNo?: string;
    dateOfBirth?: string;
    email?: string;
    nationality?: string;
    phone?: string;
    address?: string;
    ccEmailAddress?: string;
    useCcEmailInstead?: boolean;
  };
  controllerCompany?: {
    companyName: string;
    registerNumber?: string;
    legalForm?: string;
    governedByLawAndJurisdiction?: string;
    registerOfCompanies?: string;
    companyAddress?: string;
    ccEmailAddress?: string;
    useCcEmailInstead?: boolean;
  };
}) {
  const companyName = esc(input.companyName);
  const effectiveDate = esc(toDdMmYyyy(input.effectiveDate));
  const t = input.controllerType;
  const p = input.controllerPerson;
  const c = input.controllerCompany;

  const row = (k: string, v?: string | null) => {
    const s = String(v ?? '').trim();
    return `<div class="row"><div class="k">${esc(k)}</div><div class="v">${s ? esc(s) : '-'}</div></div>`;
  };

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Declaration of Company Controller (RORC)</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.5; padding: 24px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      .muted { color: #555; font-size: 12px; }
      .box { border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
      .row { display: grid; grid-template-columns: 220px 1fr; gap: 10px; padding: 8px 0; border-top: 1px solid #eee; }
      .row:first-child { border-top: 0; }
      .k { color: #444; }
      .v { color: #111; }
    </style>
  </head>
  <body>
    <h1>Declaration of Company Controller (RORC)</h1>
    <div class="muted">Company: ${companyName}</div>
    <div class="muted" style="margin-top: 4px;">Effective date: ${effectiveDate}</div>
    <div class="box" style="margin-top: 12px;">
      ${t === 'PERSON' ? `<div class="muted" style="margin-bottom: 8px;">Personal Controller</div>` : `<div class="muted" style="margin-bottom: 8px;">Company Controller</div>`}
      ${t === 'PERSON' ? row('RORC Controller Full Name', p?.fullName) : row('RORC Controller Company', c?.companyName)}
      ${t === 'PERSON' ? row('Passport/NRIC/FIN', [p?.idType, p?.idNo].filter(Boolean).join(' ')) : row('RORC Controller Company Register Number', c?.registerNumber)}
      ${t === 'PERSON' ? row('Date Of Birth', p?.dateOfBirth ? toDdMmYyyy(p.dateOfBirth) : '') : row('Legal Form Of The Entity', c?.legalForm)}
      ${t === 'PERSON' ? row('Email', (p?.useCcEmailInstead ? p?.ccEmailAddress : p?.email) ?? '') : row('The Law By Which It Is Governed And In Which Jurisdiction', c?.governedByLawAndJurisdiction)}
      ${t === 'PERSON' ? row('Nationality', p?.nationality) : row('The Register Of Companies', c?.registerOfCompanies)}
      ${t === 'PERSON' ? row('Phone', p?.phone) : row('Date On Which The Company Becomes Controller', input.effectiveDate)}
      ${t === 'PERSON' ? row('Address', p?.address) : row('RORC Controller Company Address', c?.companyAddress)}
      ${row('Cc Email Address', (t === 'PERSON' ? p?.ccEmailAddress : c?.ccEmailAddress) ?? '')}
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
  directorSendingNotice?: string;
  fiscalYearReport?: string;
  companyCategory?: string;
  agendaSummary?: string;
}) {
  const companyName = esc(input.companyName);
  const meetingDate = esc(input.meetingDate);
  const meetingVenue = esc(input.meetingVenue);
  const chairman = esc(input.chairman);
  const noticeDirector = esc(String(input.directorSendingNotice ?? '').trim());
  const fiscalYearReport = esc(String(input.fiscalYearReport ?? '').trim());
  const companyCategory = esc(String(input.companyCategory ?? '').trim());
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
      ${noticeDirector ? `<div style="margin-top: 10px;"><strong>Director sending notice</strong>: ${noticeDirector}</div>` : ''}
      ${fiscalYearReport ? `<div style="margin-top: 10px;"><strong>Fiscal Financial Year Report</strong>: ${fiscalYearReport}</div>` : ''}
      ${companyCategory ? `<div style="margin-top: 10px;"><strong>Company Category</strong>: ${companyCategory}</div>` : ''}
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
