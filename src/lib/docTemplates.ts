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

function replaceAllLiteral(input: string, from: string, to: string) {
  if (!from) return input;
  return input.split(from).join(to);
}

function injectHiddenSignerPlaceholders(html: string, emails: string[]) {
  const normalized = emails
    .map((e) => String(e ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (!normalized.length) return html;
  const block = `<div style="display:none">${normalized
    .map((e) => `<span data-signer="${esc(e)}"></span>`)
    .join('')}</div>`;
  return html.includes('</body>') ? html.replace('</body>', `${block}</body>`) : `${html}${block}`;
}

function replaceAgmSme(
  html: string,
  input: Partial<{
    companyName: string;
    companyRegistrationNo: string;
    meetingVenue: string;
    meetingDateDmy: string;
    meetingTime: string;
    fiscalYearEndYmd: string;
    signerName: string;
    chairmanName: string;
    registrableControllerName: string;
    datedDmy: string;
  }>,
) {
  let out = html;

  const companyNameEsc = input.companyName ? esc(String(input.companyName)) : '';
  if (companyNameEsc) {
    out = replaceAllLiteral(out, 'JUNDO\nPTE LTD', companyNameEsc);
    out = replaceAllLiteral(out, 'JUNDO\r\nPTE LTD', companyNameEsc);
    out = replaceAllLiteral(out, 'JUNDO PTE LTD', companyNameEsc);
  }

  const regNoEsc = input.companyRegistrationNo ? esc(String(input.companyRegistrationNo)) : '';
  if (regNoEsc) out = replaceAllLiteral(out, '202244987D', regNoEsc);

  const venueRaw = String(input.meetingVenue ?? '').trim();
  const venueEsc = venueRaw ? esc(venueRaw) : '';
  if (venueEsc) {
    out = replaceAllLiteral(out, '_testing', `_${venueEsc}`);
    out = replaceAllLiteral(out, 'testing', venueEsc);
  }

  const meetingDateEsc = input.meetingDateDmy ? esc(String(input.meetingDateDmy)) : '';
  if (meetingDateEsc) out = replaceAllLiteral(out, '14/06/2026', meetingDateEsc);

  const meetingTimeEsc = input.meetingTime ? esc(String(input.meetingTime)) : '';
  if (meetingTimeEsc) out = replaceAllLiteral(out, '10:00', meetingTimeEsc);

  const fyeEsc = input.fiscalYearEndYmd ? esc(String(input.fiscalYearEndYmd)) : '';
  if (fyeEsc) out = replaceAllLiteral(out, '2026-11-30', fyeEsc);

  const signerNameEsc = input.signerName ? esc(String(input.signerName)) : '';
  if (signerNameEsc) {
    out = replaceAllLiteral(out, 'Xue\nHongwei', signerNameEsc);
    out = replaceAllLiteral(out, 'Xue Hongwei', signerNameEsc);
  }

  const chairmanNameEsc = input.chairmanName ? esc(String(input.chairmanName)) : '';
  if (chairmanNameEsc) {
    out = replaceAllLiteral(out, 'Xue\nHongwei', chairmanNameEsc);
    out = replaceAllLiteral(out, 'Xue Hongwei', chairmanNameEsc);
  }

  const rcEsc = input.registrableControllerName ? esc(String(input.registrableControllerName)) : '';
  if (rcEsc) {
    out = replaceAllLiteral(out, 'Lu\nQianying', rcEsc);
    out = replaceAllLiteral(out, 'Lu Qianying', rcEsc);
  }

  const datedEsc = input.datedDmy ? esc(String(input.datedDmy)) : '';
  if (datedEsc) out = replaceAllLiteral(out, '30/05/2026', datedEsc);

  return out;
}

const AGM_NOTICE_SME_HTML = `<!DOCTYPE html>
<html>
<head>
	<meta http-equiv="content-type" content="text/html; charset=utf-8"/>
	<title>Word Document</title>
	<meta name="generator" content="LibreOffice 26.2.3.2 (MacOSX)"/>
	<meta name="created" content="2026-06-14T06:57:00"/>
	<meta name="changedby" content="Hongwei Xue"/>
	<meta name="changed" content="2026-06-14T06:58:00"/>
	<meta name="AppVersion" content="16.0000"/>
	<style type="text/css">
		@page { size: 8.27in 11.69in; margin-left: 1.25in; margin-right: 1.25in; margin-top: 1in; margin-bottom: 1in }
		p { direction: ltr; widows: 0; orphans: 0; margin-bottom: 0.1in; text-align: justify; line-height: 115%; background: transparent }
	</style>
</head>
<body lang="en-US" link="#000080" vlink="#800000" dir="ltr"><p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><b>JUNDO
PTE LTD</b></font></font></font></p>
<p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Co.
Reg. No.: </font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">202244987D</font></font></font></p>
<p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">(Incorporated
in the Republic of Singapore)</font></font></p>
<p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><b>NOTICE
OF ANNUAL GENERAL MEETING</b></font></font></p>
<p align="left" style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">NOTICE
IS HEREBY GIVEN THAT the Annual General Meeting of the Company will
be held at _</font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>_testing</u></font></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>_</u></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">
 on </font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>
</u></font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>14/06/2026
</u></font></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>10:00
</u></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">.
for the following business and that any of the Directors be
authorized to send notice of the said Meeting:-</font></font></p>
<p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u><b>ORDINARY
BUSINESS</b></u></font></font></p>
<ol>
	<li><p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
	<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">To
	confirm the Minute of the Annual General Meeting held;</font></font></p></li>
	<li><p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
	<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">To
	approve unaudited financial statements for the year ended
	</font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>2026-11-30</u></font></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">;</font></font></p></li>
	<li><p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
	<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">To
	declare the Registrable Controller.</font></font></p></li>
</ol>
<p align="left" style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff"><a name="_gjdgxs"></a>
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">On
behalf of the Board of Directors</font></font></p>
<p align="left" style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>_______________</u></font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Xue
Hongwei</font></font></p>
<p align="left" style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Dated:
</font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">30/05/2026</font></font></font></p>
<p style="margin-bottom: 0in; line-height: 100%"><br/>

</p>
</body>
</html>`;

const AGM_MINUTES_SME_HTML = `<!DOCTYPE html>
<html>
<head>
	<meta http-equiv="content-type" content="text/html; charset=utf-8"/>
	<title></title>
	<meta name="generator" content="LibreOffice 26.2.3.2 (MacOSX)"/>
	<meta name="author" content="Data"/>
	<meta name="created" content="2026-06-14T07:01:00"/>
	<meta name="changedby" content="Hongwei Xue"/>
	<meta name="changed" content="2026-06-14T07:01:00"/>
	<meta name="AppVersion" content="16.0000"/>
	<meta name="KSOProductBuildVer" content="1033-5.6.0.8082"/>
	<style type="text/css">
		@page { size: 8.27in 11.69in; margin-left: 1.25in; margin-right: 1.25in; margin-top: 1in; margin-bottom: 1in }
		p { direction: ltr; widows: 0; text-align: justify; line-height: 115%; margin-bottom: 0.1in; orphans: 0; font-size: 10pt; background: transparent }
	</style>
</head>
<body lang="en-US" link="#000080" vlink="#800000" dir="ltr"><p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><b>JUNDO
PTE LTD</b></font></font></font></p>
<p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Co.
Reg. No.: </font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">202244987D</font></font></font></p>
<p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">(Incorporated
in the Republic of Singapore)</font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><b>MINUTES
OF ANNUAL GENERAL MEETING</b></font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Minutes
of the Annual General Meeting of the Company held at </font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>_</u></font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>testing</u></font></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>__</u></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">on
</font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>
 </u></font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>14/06/2026
</u></font></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>10:00</u></font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">PRESENT:</font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u><b>_____________</b></u></font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Xue
Hongwei</font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p style="margin-bottom: 0in; line-height: 100%"><br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff; page-break-before: always">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Chairman	:
</font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u><b>Xue
Hongwei</b></u></font></font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">
</font></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">was
in the chair.</font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Notice
of Meeting	: The notice was taken as read.</font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Resolved:</font></font></p>
<p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff"><a name="_gjdgxs"></a>
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Financial
statements: That the unaudited financial statements for the year
ended </font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>2026-11-30</u></font></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">
be and they are hereby adopted.</font></font></p>
<p style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Registrable
Controller: That </font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>Lu
Qianying</u></font></font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">
</font></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">is
identified as Registrable Individual Controller.</font></font></p>
<p style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">General	:
The Secretary is hereby instructed to file the Annual Return to the
Accounting and Corporate Regulatory Authority in accordance to the
Companies Act. Cap. 50.</font></font></p>
<p style="margin-bottom: 0in; orphans: 2; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Termination	:
There being no other business, the meeting was terminated with a vote
of thanks to the Chair.</font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Certified
as a True Record of Minutes</font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>_________________</u></font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Name:
 </font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Xue
Hongwei</font></font></font></p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<br/>

</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Dated:
</font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">14/06/2026
</font></font></font>
</p>
<p align="left" style="orphans: 2; margin-bottom: 0in; line-height: 100%; widows: 2">
<br/>

</p>
</body>
</html>`;

const AGM_DIR_STMT_SME_HTML = `<!DOCTYPE html>
<html>
<head>
	<meta http-equiv="content-type" content="text/html; charset=utf-8"/>
	<title>Word Document</title>
	<meta name="generator" content="LibreOffice 26.2.3.2 (MacOSX)"/>
	<meta name="created" content="2026-06-14T06:55:00"/>
	<meta name="changedby" content="Hongwei Xue"/>
	<meta name="changed" content="2026-06-14T06:56:00"/>
	<meta name="AppVersion" content="16.0000"/>
	<style type="text/css">
		@page { size: 8.27in 11.69in; margin-left: 1.25in; margin-right: 1.25in; margin-top: 1in; margin-bottom: 1in }
		p { direction: ltr; widows: 0; orphans: 0; margin-bottom: 0.1in; text-align: justify; line-height: 115%; background: transparent }
	</style>
</head>
<body lang="en-US" link="#000080" vlink="#800000" dir="ltr"><p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><b>JUNDO
PTE LTD</b></font></font></font></p>
<p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Co.
Reg. No.: </font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">202244987D</font></font></font></p>
<p align="center" style="orphans: 2; margin-bottom: 0in; widows: 2; line-height: 100%; background: #ffffff">
<font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">(Incorporated
in the Republic of Singapore)</font></font></p>
<p style="margin-bottom: 0in; line-height: 100%"><br/>

</p>
<p align="center" style="margin-bottom: 0in; line-height: 100%"><font face="Verdana, sans-serif"><font size="2" style="font-size: 10pt"><b>STATEMENT
BY AN EXEMPT PRIVATE COMPANY </b></font></font>
</p>
<p align="center" style="margin-bottom: 0in; line-height: 100%"><font face="Verdana, sans-serif"><font size="2" style="font-size: 10pt"><b>EXEMPTED
FROM AUDIT</b></font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 10pt">
</font></font><font face="Verdana, sans-serif"><font size="2" style="font-size: 10pt"><b>REQUIREMENTS
</b></font></font>
</p>
<p align="left" style="margin-bottom: 0.15in; border: none; padding: 0in; line-height: 109%">
<br/>
<br/>

</p>
<p align="left" style="border: none; padding: 0in; margin-bottom: 0.15in; line-height: 109%">
<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><b>Name
of Company : </b></font></font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><b>JUNDO
PTE LTD</b></font></font></font></p>
<p align="left" style="border: none; padding: 0in; margin-bottom: 0.15in; line-height: 109%">
<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Unique
Entity Number (UEN) : </font></font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><b>202244987D</b></font></font></font></p>
<p style="border: none; padding: 0in; margin-bottom: 0.18in; line-height: 109%">
<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">I,
the director of the abovementioned company, hereby declare that/on
behalf of the Board of Directors that -</font></font></font></p>
<ol type="a">
	<li><p style="border: none; padding: 0in; margin-bottom: 0.18in; line-height: 109%">
	<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">for
	the entire financial year concerned, the company had been an exempt
	private company at all relevant times as defined under Section 4(1)
	of the Companies Act by virtue of its being a private company of
	which no beneficial interest in shares is held, directly or
	indirectly, by any corporation and having not more than 20 members;</font></font></font></p></li>
	<li><p style="border: none; padding: 0in; margin-bottom: 0.18in; line-height: 109%">
	<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">an
	unaudited profit and loss account and balance sheet made up to the
	date stated in the annual return which comply with the requirements
	of the Companies Act have been presented before the company in the
	annual general meeting on the date stated in this annual return;</font></font></font></p></li>
	<li><p style="border: none; padding: 0in; margin-bottom: 0.18in; line-height: 109%">
	<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">as
	at the date that the profit and loss account for the financial year
	has been made up, the company appeared to be able to meet its
	liabilities as and when they fall due;</font></font></font></p></li>
	<li><p style="border: none; padding: 0in; margin-bottom: 0.18in; line-height: 109%">
	<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">as
	at the end of the financial year, the company is exempt from audit
	requirements as its revenue in the year does not exceed the
	prescribed amount namely S$10 million since the date of
	incorporation;</font></font></font></p></li>
	<li><p style="border: none; padding: 0in; margin-bottom: 0.18in; line-height: 109%">
	<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">no
	notice has been received from any member under Section 205B(6)
	requiring the company to obtain an audit of its accounts in relation
	to the year; and</font></font></font></p></li>
	<li><p style="border: none; padding: 0in; margin-bottom: 0.16in; line-height: 109%">
	<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">the
	accounting and other records required to be kept by the company in
	accordance with Section 199 of the Companies Act have been so kept.</font></font></font></p></li>
</ol>
<p align="left" style="margin-bottom: 0in; border: none; padding: 0in; line-height: 109%">
<br/>

</p>
<p align="left" style="border: none; padding: 0in; margin-bottom: 0in; line-height: 109%">
<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Directors</font></font></font></p>
<p align="left" style="margin-bottom: 0in; border: none; padding: 0in; line-height: 109%">
<br/>

</p>
<p align="left" style="margin-bottom: 0in; border: none; padding: 0in; line-height: 109%">
<br/>

</p>
<p align="left" style="border: none; padding: 0in; margin-bottom: 0in; line-height: 100%">
<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt"><u>_______________</u></font></font></font></p>
<p align="left" style="border: none; padding: 0in; margin-bottom: 0in; line-height: 100%">
<font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Xue
Hongwei                  </font></font></font>
</p>
<p style="margin-bottom: 0in; line-height: 100%">                    
                                                  
</p>
<p align="left" style="border: none; padding: 0in; margin-bottom: 0in; line-height: 109%">
<font color="#000000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">Dated:
</font></font></font><font color="#ee0000"><font face="Verdana, sans-serif"><font size="2" style="font-size: 9pt">30/05/2026</font></font></font></p>
</body>
</html>`;

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

function directorResolutionIntroLine(input: { directorCount: number; pluralResolutions: boolean }) {
  const tail = input.pluralResolutions ? 'resolutions' : 'resolution';
  return input.directorCount > 1
    ? `We, the undersigned, being the Directors of the Company, do hereby pass the following ${tail}:`
    : `I, the undersigned, being the sole Director of the Company, do hereby pass the following ${tail}:`;
}

function directorSignatureLabel(directorCount: number) {
  return directorCount > 1 ? 'Directors:' : 'Director:';
}

function directorSignatureLabelUpper(directorCount: number) {
  return directorCount > 1 ? 'DIRECTORS' : 'DIRECTOR';
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
  representativeEmail?: string;
  representativeAddress: string;
  witnessIdTypeLabel: string;
  witnessIdNo: string;
  witnessPhone?: string;
  witnessEmail: string;
  directorSignerName: string;
  directorSignerEmail?: string;
  dateYmd: string;
}) {
  const directorSig = signatureLineBlocks({
    signers: [{ fullName: input.directorSignerName, email: input.directorSignerEmail }],
  });
  const repSig = signatureLineBlocks({
    signers: [{ fullName: input.representativeName, email: input.representativeEmail }],
  });
  const datedLong = toDayOfMonthLong(input.dateYmd);
  const shareholderAddress = input.shareholderCompanyAddress.trim() ? esc(input.shareholderCompanyAddress) : '______________________________';
  const representativeAddress = input.representativeAddress.trim() ? esc(input.representativeAddress) : '______________________________';
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
    ${directorSig}
    <div class="block">On Behalf of ${esc(input.shareholderCompanyName)}</div>

    <div class="grid2 block">
      <div>
        <div>Signature of authorised representative</div>
        ${repSig}
      </div>
      <div>
        <div>Witnessed by</div>
        <div class="mt2">Name:&nbsp;&nbsp;</div>
        <div class="mt2">NRIC/Passport No.:&nbsp;&nbsp;</div>
        <div class="mt2">Phone No.:&nbsp;&nbsp;</div>
        <div class="mt2">Email:&nbsp;&nbsp;</div>
      </div>
    </div>
  </body>
</html>
`.trim();
}

export function renderShareTransferCertificateOfAppointmentOfCorporateRepresentativeHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  companyAddress: string;
  representativeName: string;
  representativeEmail?: string;
  representativeAddress: string;
  directorSignerName: string;
  directorSignerEmail?: string;
  dateYmd: string;
}) {
  const directorSig = signatureLineBlocks({
    signers: [{ fullName: input.directorSignerName, email: input.directorSignerEmail }],
  });
  const repSig = signatureLineBlocks({
    signers: [{ fullName: input.representativeName, email: input.representativeEmail }],
  });
  const datedLong = toDayOfMonthLong(input.dateYmd);
  const companyAddress = input.companyAddress.trim() ? esc(input.companyAddress) : '______________________________';
  const representativeAddress = input.representativeAddress.trim()
    ? esc(input.representativeAddress)
    : '______________________________';
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
    <div class="title">${esc(input.companyName)}</div>
    ${input.companyRegistrationNo ? `<div>Co. Reg. No.: ${esc(input.companyRegistrationNo)}</div>` : ''}

    <div class="block title center">CERTIFICATE OF APPOINTMENT OF CORPORATE REPRESENTATIVE</div>

    <div class="block">We, ${esc(input.companyName)} of ${companyAddress} hereby appoint:-</div>

    <div class="block">${esc(input.representativeName)}</div>
    <div class="block">of address:&nbsp;&nbsp;${representativeAddress}</div>

    <div class="block">or failing him / her,</div>
    <div class="block">Mr / Ms</div>
    <div class="block">of address:</div>

    <div class="block">as our representative with full authority to sign, execute and exercise the same powers on our behalf to act on, vote on, sign and execute, on our behalf, all relevant documents relating to share transfer.</div>
    <div class="block">The authorisation conferred by this Certificate shall continue to have effect until revoked by us by notice in writing to the Company or by the issue of a subsequent Certificate.</div>

    <div class="block">Dated this ${esc(datedLong)}</div>

    <div class="block">We confirm that ${esc(input.companyName)} is not required to have a Common Seal under the provisions of its Articles of Association or the prevailing laws applicable to the company in its country of incorporation.</div>
    <div class="block">This Certificate is executed in such manner as to be binding upon ${esc(input.companyName)}</div>

    <div class="block">${esc(input.directorSignerName)}</div>
    <div class="block">Director</div>

    <div class="block">Signed For &amp;</div>
    ${directorSig}
    <div class="block">On Behalf of ${esc(input.companyName)}</div>

    <div class="grid2 block">
      <div>
        <div>Signature of authorised representative</div>
        ${repSig}
      </div>
      <div>
        <div>Witnessed by</div>
        <div class="mt2">Name:&nbsp;&nbsp;</div>
        <div class="mt2">NRIC/Passport No.:&nbsp;&nbsp;</div>
        <div class="mt2">Phone No.:&nbsp;&nbsp;</div>
        <div class="mt2">Email:&nbsp;&nbsp;</div>
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
  const sigBlocks = signatureBlocksByEmail({ signers: input.directors, label: directorSignatureLabel(input.directors.length) });
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
    <div class="block">${esc(directorResolutionIntroLine({ directorCount: input.directors.length, pluralResolutions: true }))}</div>

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
    <div class="block">${esc(directorResolutionIntroLine({ directorCount: input.directors.length, pluralResolutions: true }))}</div>
    <div class="subtitle">RESOLVED –</div>

    ${apptLines ? `<div class=\"subtitle\">APPOINTMENT OF SECRETARY</div><div class=\"block\">${apptLines}</div>` : ''}
    ${resignLine ? `<div class=\"subtitle\">RESIGNATION OF SECRETARY</div><div class=\"block\">${resignLine}</div>` : ''}

    <div class="subtitle">${directorSignatureLabelUpper(input.directors.length)}:</div>
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
  transferor: {
    kind: 'PERSON' | 'COMPANY';
    name: string;
    idTypeLabel?: string;
    idNo?: string;
    nationality?: string;
    companyRegistrationNo?: string;
  };
  transferee: {
    kind: 'PERSON' | 'COMPANY';
    name: string;
    idTypeLabel?: string;
    idNo?: string;
    nationality?: string;
    companyRegistrationNo?: string;
  };
  transferorSignerName?: string;
  transfereeSignerName?: string;
  shares: number;
  valueSgd?: number;
  shareClass?: string;
  dateYmd?: string;
}) {
  const companyName = esc(input.targetCompanyName);
  const shareClassRaw = (input.shareClass ?? '').trim();
  const shareClassDisplay = shareClassRaw ? esc(shareClassRaw === 'ORDINARY SHARE' ? 'Ordinary share' : shareClassRaw === 'PREFERENCE SHARE' ? 'Preference share' : shareClassRaw) : '';
  const dateYmd = (input.dateYmd ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const signedDate = esc(toDdMmYyyy(dateYmd));
  const sharesText = esc(String(input.shares));
  const value = Number(input.valueSgd);
  const considerationText = Number.isFinite(value) ? `S$${esc(value.toFixed(1))}` : '';

  const idLabel = (raw?: string) => {
    const v = String(raw ?? '').trim().toUpperCase();
    if (v === 'FIN') return 'FIN';
    if (v === 'NRIC') return 'NRIC';
    if (v === 'IC') return 'IC';
    if (v === 'PASSPORT') return 'Passport';
    return v ? esc(String(raw ?? '').trim()) : 'Passport/NRIC';
  };

  const partyPhrase = (p: typeof input.transferor, role: 'transferor' | 'transferee') => {
    if (p.kind === 'COMPANY') {
      const reg = String(p.companyRegistrationNo ?? '').trim();
      const regPart = reg ? ` (Company Registration No. ${esc(reg)})` : '';
      return `${esc(p.name)}${regPart} (the “${role}”)`;
    }
    const no = String(p.idNo ?? '').trim();
    const nat = String(p.nationality ?? '').trim();
    const natPart = nat ? `, ${esc(nat)}` : '';
    const idPart = no ? `${idLabel(p.idTypeLabel)} No. ${esc(no)}` : `${idLabel(p.idTypeLabel)} No.`;
    return `${esc(p.name)}, ${idPart}${natPart} (the “${role}”)`;
  };

  const transferorPhrase = partyPhrase(input.transferor, 'transferor');
  const transfereePhrase = partyPhrase(input.transferee, 'transferee');
  const transferorPartyName = esc(input.transferor.name);
  const transfereePartyName = esc(input.transferee.name);
  const transferorSignerName = esc(input.transferorSignerName ?? input.transferor.name);
  const transfereeSignerName = esc(input.transfereeSignerName ?? input.transferee.name);

  const transferorSigLabel =
    input.transferor.kind === 'COMPANY'
      ? `${transferorSignerName} (on behalf of ${transferorPartyName})`
      : transferorSignerName;
  const transfereeSigLabel =
    input.transferee.kind === 'COMPANY'
      ? `${transfereeSignerName} (on behalf of ${transfereePartyName})`
      : transfereeSignerName;

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Share Transfer Form</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.6; padding: 28px 36px; color: #111; }
      h1 { font-size: 20px; margin: 0 0 18px; text-align: center; }
      .p { margin: 10px 0; }
      .sigline { margin-top: 24px; }
      .line { display: inline-block; min-width: 220px; border-bottom: 1px solid #111; height: 18px; vertical-align: bottom; }
      .label { margin-top: 6px; }
    </style>
  </head>
  <body>
    <h1>SHARE TRANSFER FORM</h1>

    <div class="p">I, ${transferorPhrase}, being the registered shareholder for the consideration stated here do hereby transfer to ${transfereePhrase}, or executors, assigns and administrators the shares as specified here standing in my name in the Register of Members of ${companyName} subject to the conditions on which I held the same at the date of signing hereof.</div>

    <div class="p">I, the transferee, do hereby agree to accept the said shares on the same conditions.</div>

    <div class="p">Full description of shares: ${shareClassDisplay}</div>
    <div class="p">Number of shares: ${sharesText}</div>
    <div class="p">Consideration: ${considerationText}</div>

    <div class="p" style="margin-top: 18px;">Signed, sealed and delivered by the above named</div>

    <div class="sigline">
      <div class="line"></div>
      <div class="label">${transferorSigLabel}</div>
      <div class="label">Transferor</div>
    </div>

    <div class="sigline">
      <div class="line"></div>
      <div class="label">${transfereeSigLabel}</div>
      <div class="label">Transferee</div>
    </div>

    <div class="p" style="margin-top: 18px;">Date:${signedDate}</div>
  </body>
</html>
`.trim();
}

export function renderShareTransferDirectorsResolutionHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  considerationSgd?: number;
  transferorName: string;
  transfereeName: string;
  shares: number;
  dateYmd?: string;
  directors: string[];
}) {
  const companyName = esc(input.companyName);
  const companyRegistrationNo = esc(String(input.companyRegistrationNo ?? '').trim());
  const dateYmd = (input.dateYmd ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const dated = esc(toDdMmYyyy(dateYmd));

  const value = Number(input.considerationSgd);
  const considerationText = Number.isFinite(value) ? `SGD ${esc(value.toLocaleString('en-SG', { maximumFractionDigits: 0 }))}` : 'SGD -';
  const transferorName = esc(input.transferorName);
  const transfereeName = esc(input.transfereeName);
  const sharesText = esc(String(input.shares));
  const directors = input.directors.map((x) => String(x ?? '').trim()).filter(Boolean);
  const directorCount = directors.length;

  const sigBlocks = directors.length
    ? directors
        .map(
          (d) => `
          <div style="margin-top: 18px;">
            <div style="text-decoration: underline;">_______________</div>
            <div style="margin-top: 6px;">${esc(d)}</div>
          </div>
        `.trim(),
        )
        .join('')
    : `
          <div style="margin-top: 18px;">
            <div style="text-decoration: underline;">_______________</div>
          </div>
        `.trim();

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Director's Resolution</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.6; padding: 28px 36px; color: #111; }
      .center { text-align: center; }
      .h { font-weight: 700; }
      .u { text-decoration: underline; }
      .p { margin: 10px 0; }
    </style>
  </head>
  <body>
    <div class="center" style="margin-bottom: 10px;">
      <div class="h">${companyName}</div>
      <div>(Company Registration No. ${companyRegistrationNo || '-'})</div>
      <div>(“the Company”)</div>
      <div>(Incorporated in the Republic of Singapore)</div>
    </div>

    <div class="center h">${directorResolutionHeaderLabel(directorCount || 1)}</div>

    <div class="p" style="margin-top: 18px;">RESOLVED</div>
    <div class="p h u">TRANSFER OF SHARES</div>

    <div class="p">That the transfer of the following shares in the capital of the Company at a total consideration price of ${considerationText} as described in the respective share transfer form hereby approved, subject to the instrument of transfer being properly executed and stamped in accordance with the provision of the Stamp Duties Act, and presented for registration accordingly.</div>

    <div class="p"><span class="u">Transferor</span>: ${transferorName}</div>
    <div class="p"><span class="u">Transferee</span>: ${transfereeName}</div>
    <div class="p"><span class="u">No. of shares</span>: ${sharesText}</div>

    <div class="p">Term of issue: payable in cash</div>
    <div class="p">That the Secretary of the Company is hereby authorized to file the above transfer of shares with the relevant Authority.</div>

    <div class="center h u" style="margin-top: 18px;">${directorSignatureLabelUpper(directorCount || 1)}</div>
    ${sigBlocks}

    <div class="p" style="margin-top: 18px;">Dated:${dated}</div>
  </body>
</html>
`.trim();
}

export function renderCertificateOfAppointmentOfCorporateSecretaryHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  countryOfIncorporation: string;
  corporateSecretaryName: string;
  corporateRepresentativeName: string;
  directorNames: string[];
  dateYmd?: string;
}) {
  const companyName = esc(input.companyName);
  const companyRegistrationNo = esc(String(input.companyRegistrationNo ?? '').trim());
  const country = esc(input.countryOfIncorporation);
  const csName = esc(input.corporateSecretaryName);
  const corpRepName = esc(input.corporateRepresentativeName);
  const directors = input.directorNames.map((x) => String(x ?? '').trim()).filter(Boolean);
  const dateYmd = (input.dateYmd ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const dated = esc(toDdMmYyyy(dateYmd));

  const directorSig = directors.length
    ? directors
        .map(
          (d) => `
          <div style="margin-top: 16px;">
            <div style="text-decoration: underline;">_______________</div>
            <div style="margin-top: 6px;">${esc(d)}</div>
            <div style="margin-top: 2px;">Director</div>
          </div>
        `.trim(),
        )
        .join('')
    : `
          <div style="margin-top: 16px;">
            <div style="text-decoration: underline;">_______________</div>
            <div style="margin-top: 2px;">Director</div>
          </div>
        `.trim();

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Certificate of Appointment of Corporate Secretary</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; line-height: 1.6; padding: 28px 36px; color: #111; }
      .center { text-align: center; }
      .h { font-weight: 700; }
      .p { margin: 10px 0; }
      .u { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="center">
      <div class="h">CERTIFICATE OF APPOINTMENT OF CORPORATE SECRETARY</div>
    </div>

    <div class="p" style="margin-top: 18px;">
      We, the undersigned, being a Director and the Corporate Representative of ${companyName}
      ${companyRegistrationNo ? `(Company Registration No. ${companyRegistrationNo})` : ''}
      (Country of incorporation: ${country}), hereby certify that ${csName} is appointed as the corporate secretary of the Company.
    </div>

    <div class="p">Dated: ${dated}</div>

    <div class="p h u" style="margin-top: 18px;">DIRECTOR</div>
    ${directorSig}

    <div class="p h u" style="margin-top: 18px;">CORPORATE REPRESENTATIVE</div>
    <div style="margin-top: 16px;">
      <div style="text-decoration: underline;">_______________</div>
      <div style="margin-top: 6px;">${corpRepName} (on behalf of the Company)</div>
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

    const signatureBlocks = signatureBlocksByEmail({ signers: directors, label: directorSignatureLabel(directors.length) });

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
    <div class="block">${esc(directorResolutionIntroLine({ directorCount: directors.length, pluralResolutions: false }))}</div>

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

    const currentItems = [
      ...(old1Code ? [`<div>Activity 1: <strong>${esc(old1)}</strong></div>`] : []),
      ...(old2Code ? [`<div>Activity 2: <strong>${esc(old2)}</strong></div>`] : []),
    ].join('');

    const nextItems = [
      ...(next1Code ? [`<div>Activity 1: <strong>${esc(next1)}</strong></div>`] : []),
      ...(next2Code ? [`<div>Activity 2: <strong>${esc(next2)}</strong></div>`] : []),
    ].join('');

    const statement =
      currentItems && nextItems
        ? `
That the business activities of the Company are changed from:
<div style="margin-left: 18px; margin-top: 6px;">${currentItems}</div>
<div style="margin-top: 10px;">to:</div>
<div style="margin-left: 18px; margin-top: 6px;">${nextItems}</div>
<div style="margin-top: 10px;">with immediate effect.</div>
`.trim()
        : 'That the business activities of the Company remain unchanged.';

    const directors = (input.directors ?? [])
      .map((d) => ({ fullName: String(d.fullName ?? '').trim(), email: String(d.email ?? '').trim() || undefined }))
      .filter((d) => !!d.fullName);

    const signatureBlocks = signatureBlocksByEmail({ signers: directors, label: directorSignatureLabel(directors.length) });

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
    <div class="block">${esc(directorResolutionIntroLine({ directorCount: directors.length, pluralResolutions: false }))}</div>
    <div class="subtitle">RESOLVED –</div>
    <div class="subtitle">CHANGE OF BUSINESS ACTIVITIES</div>
    <div class="block" style="white-space: pre-wrap;">
      ${statement}
    </div>
    ${signatureBlocks}
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

    <div class="block">${esc(directorResolutionIntroLine({ directorCount: directors.length, pluralResolutions: true }))}</div>

    <div class="subtitle">RESOLVED –</div>
    <div class="subtitle underline">CHANGE OF REGISTERED ADDRESS</div>

    <div class="block" style="white-space: pre-wrap;">That the registered office address of the Company be changed from <span class="underline">${esc(oldAddr)}</span> to <span class="underline">${esc(newAddr)}</span> from immediate effect.</div>

    <div class="block">${esc(directorSignatureLabel(directors.length))}</div>

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
  companyRegistrationNo?: string;
  controllerType: 'PERSON' | 'COMPANY';
  effectiveDate: string;
  signedDateYmd?: string;
  signatoryName?: string;
  signatoryTitle?: string;
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
  const companyRegistrationNo = esc(String(input.companyRegistrationNo ?? '').trim());
  const effectiveDateIso = String(input.effectiveDate ?? '').trim();
  const effectiveDate = esc(toDdMmYyyy(effectiveDateIso));
  const signedDateYmd = (String(input.signedDateYmd ?? '').trim() || effectiveDateIso || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const signedDate = esc(toDdMmYyyy(signedDateYmd));
  const t = input.controllerType;
  const p = input.controllerPerson;
  const c = input.controllerCompany;
  const signatoryName = esc(String(input.signatoryName ?? '').trim() || (t === 'PERSON' ? p?.fullName ?? '' : c?.companyName ?? ''));
  const signatoryTitle = esc(String(input.signatoryTitle ?? '').trim());

  const tableRow = (k: string, v?: string | null) => {
    const s = String(v ?? '').trim();
    return `<tr><td class="k">${esc(k)}</td><td class="v">${s ? esc(s) : 'NA'}</td></tr>`;
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
      .center { text-align: center; }
      h1 { font-size: 20px; margin: 0; font-weight: 700; }
      h2 { font-size: 14px; margin: 18px 0 8px; font-weight: 700; }
      .sub { margin-top: 4px; }
      .muted { color: #555; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; }
      td { vertical-align: top; padding: 10px 8px; border: 1px solid #ddd; }
      td.k { width: 48%; color: #222; }
      td.v { width: 52%; color: #111; }
      .confirm { margin-top: 18px; }
      .sig { margin-top: 18px; }
      .line { margin-top: 12px; text-decoration: underline; letter-spacing: 1px; }
    </style>
  </head>
  <body>
    <div class="center">
      <div style="font-size:16px; font-weight:700;">${companyName}</div>
      ${companyRegistrationNo ? `<div class="sub" style="font-size:14px;">UEN No: ${companyRegistrationNo}</div>` : ''}
      <div class="sub" style="font-size:14px; font-weight:700; margin-top: 10px;">Register of Registrable Controllers</div>
      <div class="sub" style="font-size:14px; font-weight:700;">公司控制人登记簿</div>
    </div>

    <div style="margin-top: 18px;">The following particulars of individual controllers are likely to be provided and maintained in the register:</div>
    <div class="muted" style="margin-top: 2px;">如果公司控制人是个人：</div>
    <table style="margin-top: 10px;">
      <tbody>
        ${t === 'PERSON' ? tableRow('full name (including aliases) 姓名', p?.fullName) : tableRow('full name (including aliases) 姓名', '')}
        ${t === 'PERSON' ? tableRow('residential address 常住地址', p?.address) : tableRow('residential address 常住地址', '')}
        ${t === 'PERSON' ? tableRow('Nationality 国籍', p?.nationality) : tableRow('Nationality 国籍', '')}
        ${t === 'PERSON' ? tableRow('identification number e.g. IC or passport number 证件号', [p?.idNo].filter(Boolean).join(' ')) : tableRow('identification number e.g. IC or passport number 证件号', '')}
        ${t === 'PERSON' ? tableRow('date of birth 出生日期', p?.dateOfBirth) : tableRow('date of birth 出生日期', '')}
        ${t === 'PERSON' ? tableRow('date on which the person becomes何时成为公司控制人', signedDateYmd) : tableRow('date on which the person becomes何时成为公司控制人', '')}
        ${tableRow('if applicable, the date on which the person ceases to be a controller 何时不再是公司控制人（如适用）', '')}
      </tbody>
    </table>

    <div style="margin-top: 18px;">The following particulars of corporate controllers are likely to be provided and maintained in the register:</div>
    <div class="muted" style="margin-top: 2px;">如果公司控制人是一个公司：</div>
    <table style="margin-top: 10px;">
      <tbody>
        ${t === 'COMPANY' ? tableRow('Name公司名字', c?.companyName) : tableRow('Name公司名字', '')}
        ${t === 'COMPANY' ? tableRow('If applicable, Unique Entity Number or other similar identification number 公司注册号', c?.registerNumber) : tableRow('If applicable, Unique Entity Number or other similar identification number 公司注册号', '')}
        ${t === 'COMPANY' ? tableRow('Address of registered office 公司注册地址', c?.companyAddress) : tableRow('Address of registered office 公司注册地址', '')}
        ${t === 'COMPANY' ? tableRow('Legal form of the entity and the law by which it is governed 在何地成立', [c?.legalForm, c?.governedByLawAndJurisdiction].filter(Boolean).join(' / ')) : tableRow('Legal form of the entity and the law by which it is governed 在何地成立', '')}
        ${t === 'COMPANY' ? tableRow('If applicable, the register of companies in which it is entered (including details of the state, country and the entity’s registration number in that register) 公司注册所在地区机构名称（如适用）', c?.registerOfCompanies) : tableRow('If applicable, the register of companies in which it is entered (including details of the state, country and the entity’s registration number in that register) 公司注册所在地区机构名称（如适用）', '')}
        ${t === 'COMPANY' ? tableRow('Date on which the person becomes 何时成为公司控制人', signedDateYmd) : tableRow('Date on which the person becomes 何时成为公司控制人', '')}
        ${tableRow('if applicable, the date on which the person ceases to be a controller 何时不再是公司控制人（如适用）', '')}
      </tbody>
    </table>

    <div class="confirm">
      <div>我确认以上信息真实和完整。</div>
      <div style="margin-top: 6px;">I hereby confirm that the above mentioned person is registrable controller of the Company and certify the information contained in this self-certification questionnaire to be true and complete.</div>
    </div>

    <div class="sig">
      <div style="font-weight:700;">签名Signatory</div>
      <div class="line">_______________</div>
      <div style="margin-top: 10px;">姓名Name: ${signatoryName}</div>
      ${signatoryTitle ? `<div style="margin-top: 6px;">职位Position: ${signatoryTitle}</div>` : ''}
      <div style="margin-top: 10px;">时间Date：${signedDate}</div>
    </div>
  </body>
</html>
`.trim();
}

export function renderAnnualGeneralMeetingMinutesHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  meetingDateYmd: string;
  meetingTime?: string;
  meetingVenue: string;
  chairmanName: string;
  companyCategory?: 'DORMANT' | 'SME' | 'AUDITED' | string;
  fiscalYearEndYmd?: string;
  registrableControllerNames?: string[];
  signer: { fullName: string; email?: string };
}) {
  const companyCategory = String(input.companyCategory ?? '').trim();
  if (companyCategory === 'SME') {
    const companyNameRaw = String(input.companyName ?? '').trim();
    const regNoRaw = String(input.companyRegistrationNo ?? '').trim();
    const meetingVenueRaw = String(input.meetingVenue ?? '').trim();
    const chairmanRaw = String(input.chairmanName ?? '').trim();
    const meetingDateDmy = toDdMmYyyy(input.meetingDateYmd);
    const meetingTimeRaw = String(input.meetingTime ?? '').trim();
    const fyeRaw = String(input.fiscalYearEndYmd ?? '').trim();
    const rcNames = (input.registrableControllerNames ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
    const rc = rcNames.length ? rcNames.join(', ') : '';

    let html = AGM_MINUTES_SME_HTML;
    html = replaceAgmSme(html, {
      companyName: companyNameRaw,
      companyRegistrationNo: regNoRaw,
      meetingVenue: meetingVenueRaw,
      meetingDateDmy,
      meetingTime: meetingTimeRaw,
      fiscalYearEndYmd: fyeRaw,
      chairmanName: chairmanRaw,
      registrableControllerName: rc,
      datedDmy: meetingDateDmy,
    });
    html = injectHiddenSignerPlaceholders(html, [input.signer?.email].filter(Boolean) as string[]);
    return html;
  }

  const companyName = esc(input.companyName);
  const regNo = String(input.companyRegistrationNo ?? '').trim();
  const meetingDateDmy = esc(toDdMmYyyy(input.meetingDateYmd));
  const meetingTime = String(input.meetingTime ?? '').trim();
  const meetingVenue = esc(input.meetingVenue);
  const chairmanName = esc(input.chairmanName);
  const fiscalYearEndYmd = String(input.fiscalYearEndYmd ?? '').trim();
  const registrableControllers = (input.registrableControllerNames ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
  const sig = signatureLineBlocks({ signers: [input.signer] });

  const rcLine = registrableControllers.length
    ? `Registrable Controller: That ${registrableControllers.map((n) => `<strong>${esc(n)}</strong>`).join(', ')} ${
        registrableControllers.length > 1 ? 'are' : 'is'
      } identified as Registrable ${registrableControllers.length > 1 ? 'Controllers' : 'Individual Controller'}.`
    : '';

  const fyLine = fiscalYearEndYmd ? `for the year ended <strong>${esc(fiscalYearEndYmd)}</strong>` : '';

  const bodyLines =
    companyCategory === 'DORMANT'
      ? [
          '1. THAT the Minute of the Annual General Meeting held is hereby confirmed;',
          rcLine ? `2. ${rcLine}` : '',
          '3. THAT the submission of annual return as dormant company with exemption of preparation of financial statements is hereby approved;',
          '4. THAT the submission for the application for waiver of income tax return as a dormant company is hereby approved.',
        ].filter(Boolean)
      : companyCategory === 'AUDITED'
        ? [
            `Financial statements: That the audited financial statements ${fyLine} be and they are hereby adopted.`,
            rcLine || 'Registrable Controller: That the Registrable Controller is declared.',
            'General: The Secretary is hereby instructed to file the Annual Return to the Accounting and Corporate Regulatory Authority in accordance to the Companies Act. Cap. 50.',
            'Termination: There being no other business, the meeting was terminated with a vote of thanks to the Chair.',
          ]
        : [
            `Financial statements: That the unaudited financial statements ${fyLine} be and they are hereby adopted.`,
            rcLine || 'Registrable Controller: That the Registrable Controller is declared.',
            'General: The Secretary is hereby instructed to file the Annual Return to the Accounting and Corporate Regulatory Authority in accordance to the Companies Act. Cap. 50.',
            'Termination: There being no other business, the meeting was terminated with a vote of thanks to the Chair.',
          ];

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Minutes of Annual General Meeting</title>
    <style>
      body { font-family: Verdana, ui-sans-serif, system-ui, -apple-system; line-height: 1.45; padding: 28px; color: #111; font-size: 12px; }
      .center { text-align: center; }
      .title { font-weight: 700; text-transform: uppercase; }
      .block { margin-top: 10px; }
      .sig-row { margin-top: 14px; }
      .sig-line { width: 220px; height: 20px; border-bottom: 1px solid #111; position: relative; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="title">${companyName}</div>
    ${regNo ? `<div>Co. Reg. No.: ${esc(regNo)}</div>` : ''}
    <div class="block" style="color:#444;">(Incorporated in the Republic of Singapore)</div>

    <div class="block title center">MINUTES OF ANNUAL GENERAL MEETING</div>

    <div class="block">Chairman : <strong>${chairmanName}</strong> was in the chair.</div>
    <div class="block">Notice of Meeting : The notice was taken as read.</div>

    <div class="block"><u><strong>ORDINARY BUSINESS</strong></u></div>
    <div class="block"><strong>RESOLVED:</strong></div>
    <div class="block" style="white-space: pre-wrap;">${bodyLines.map((x) => esc(x)).join('\n\n')}</div>

    <div class="block">Certified as a True Record of Minutes</div>
    ${sig}
    <div class="block">Dated: ${meetingDateDmy}${meetingTime ? ` ${esc(meetingTime)}` : ''}</div>
  </body>
</html>
`.trim();
}

export function renderAnnualGeneralMeetingNoticeHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  meetingDateYmd: string;
  meetingTime?: string;
  meetingVenue: string;
  noticeDateYmd: string;
  companyCategory?: 'DORMANT' | 'SME' | 'AUDITED' | string;
  fiscalYearEndYmd?: string;
  signer: { fullName: string; email?: string };
}) {
  const companyCategory = String(input.companyCategory ?? '').trim();
  if (companyCategory === 'SME') {
    const companyNameRaw = String(input.companyName ?? '').trim();
    const regNoRaw = String(input.companyRegistrationNo ?? '').trim();
    const meetingVenueRaw = String(input.meetingVenue ?? '').trim();
    const meetingDateDmy = toDdMmYyyy(input.meetingDateYmd);
    const meetingTimeRaw = String(input.meetingTime ?? '').trim();
    const fyeRaw = String(input.fiscalYearEndYmd ?? '').trim();
    const signerNameRaw = String(input.signer?.fullName ?? '').trim();
    const datedDmy = toDdMmYyyy(input.noticeDateYmd);

    let html = AGM_NOTICE_SME_HTML;
    html = replaceAgmSme(html, {
      companyName: companyNameRaw,
      companyRegistrationNo: regNoRaw,
      meetingVenue: meetingVenueRaw,
      meetingDateDmy,
      meetingTime: meetingTimeRaw,
      fiscalYearEndYmd: fyeRaw,
      signerName: signerNameRaw,
      datedDmy,
    });
    html = injectHiddenSignerPlaceholders(html, [input.signer?.email].filter(Boolean) as string[]);
    return html;
  }

  const companyName = esc(input.companyName);
  const regNo = String(input.companyRegistrationNo ?? '').trim();
  const meetingDateDmy = esc(toDdMmYyyy(input.meetingDateYmd));
  const meetingTime = String(input.meetingTime ?? '').trim();
  const meetingVenue = esc(input.meetingVenue);
  const dated = esc(toDdMmYyyy(input.noticeDateYmd));
  const fiscalYearEndYmd = String(input.fiscalYearEndYmd ?? '').trim();
  const sig = signatureLineBlocks({ signers: [input.signer] });

  const fyLine = fiscalYearEndYmd ? `for the year ended ${esc(fiscalYearEndYmd)}` : '';
  const businessItems =
    companyCategory === 'DORMANT'
      ? [
          'To confirm the Minute of the Annual General Meeting held;',
          'To approve the submission of annual return as dormant company with exemption of preparation of financial statements;',
          'To approve to submit the application for waiver of income tax return as a dormant company.',
        ]
      : companyCategory === 'AUDITED'
        ? [
            'To confirm the Minute of the Annual General Meeting held;',
            `To approve audited financial statements ${fyLine};`,
            'To declare the Registrable Controller.',
          ]
        : [
            'To confirm the Minute of the Annual General Meeting held;',
            `To approve unaudited financial statements ${fyLine};`,
            'To declare the Registrable Controller.',
          ];

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Notice of Annual General Meeting</title>
    <style>
      body { font-family: Verdana, ui-sans-serif, system-ui, -apple-system; line-height: 1.45; padding: 28px; color: #111; font-size: 12px; }
      .center { text-align: center; }
      .title { font-weight: 700; text-transform: uppercase; }
      .block { margin-top: 10px; }
      .sig-row { margin-top: 14px; }
      .sig-line { width: 220px; height: 20px; border-bottom: 1px solid #111; position: relative; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="title">${companyName}</div>
    ${regNo ? `<div>Co. Reg. No.: ${esc(regNo)}</div>` : ''}
    <div class="block" style="color:#444;">(Incorporated in the Republic of Singapore)</div>

    <div class="block title center">NOTICE OF ANNUAL GENERAL MEETING</div>

    <div class="block">
      NOTICE IS HEREBY GIVEN THAT the Annual General Meeting of the Company will be held at <u>${meetingVenue || '_____________'}</u> on <u>${meetingDateDmy}</u>${
        meetingTime ? ` <u>${esc(meetingTime)}</u>` : ''
      }.
      for the following business and that any of the Directors be authorized to send notice of the said Meeting:-
    </div>

    <div class="block"><u><strong>ORDINARY BUSINESS</strong></u></div>
    <ol class="block">
      ${businessItems.map((x) => `<li>${esc(x)}</li>`).join('')}
    </ol>

    <div class="block">On behalf of the Board of Directors</div>
    ${sig}
    <div class="block">Dated: ${dated}</div>
  </body>
</html>
`.trim();
}

export function renderAnnualGeneralMeetingDirectorStatementHtml(input: {
  companyName: string;
  companyRegistrationNo?: string;
  dateYmd: string;
  companyCategory?: 'DORMANT' | 'SME' | 'AUDITED' | string;
  signers: Array<{ fullName: string; email?: string }>;
}) {
  const companyCategory = String(input.companyCategory ?? '').trim();
  if (companyCategory === 'SME') {
    const companyNameRaw = String(input.companyName ?? '').trim();
    const regNoRaw = String(input.companyRegistrationNo ?? '').trim();
    const signerNameRaw = String(input.signers?.[0]?.fullName ?? '').trim();
    const datedDmy = toDdMmYyyy(input.dateYmd);

    let html = AGM_DIR_STMT_SME_HTML;
    html = replaceAgmSme(html, {
      companyName: companyNameRaw,
      companyRegistrationNo: regNoRaw,
      signerName: signerNameRaw,
      datedDmy,
    });
    html = injectHiddenSignerPlaceholders(
      html,
      (input.signers ?? []).map((s) => s.email).filter(Boolean) as string[],
    );
    return html;
  }

  const companyName = esc(input.companyName);
  const regNo = esc(String(input.companyRegistrationNo ?? '').trim());
  const dated = esc(toDdMmYyyy(input.dateYmd));
  const sig = signatureLineBlocks({ signers: input.signers });

  const statement =
    companyCategory === 'DORMANT'
      ? `I/We, the under mentioned officer(/s) of the abovementioned company, hereby certify to the best of my/our knowledge and belief that -

(1.1) that the company has been dormant for the period from the time of its formation or since the end of the previous financial year, as the case may be; (1.2) that no notice has been received under section 201A(3) of the Companies Act in relation to the financial year; and; (1.3) the accounting and other records required by the Companies Act to be kept by the company have been kept in accordance with section 199 of the Companies Act.

(2.1) that the company has been dormant for the period from the time of its formation or since the end of the previous financial year, as the case may be; (2.2) that no notice has been received under section 205B(6) of the Companies Act in relation to the financial year; and; (2.3) the accounting and other records required by the Companies Act to be kept by the company have been kept in accordance with section 199 of the Companies Act.

(3.1) that the company qualifies as a small company under section 205C read with the Thirteenth Schedule; (3.2) that no notice has been received under section 205C(2) of the Companies Act in relation to the financial year; and; (3.3) The accounting and other records required by the Companies Act to be kept by the company have been kept in accordance with section 199 of the Companies Act.`
      : companyCategory === 'AUDITED'
        ? `I/We, the director(s) of the abovementioned company, hereby declare that the audited financial statements have been presented at the annual general meeting on the date stated in the annual return, and the accounting and other records required to be kept by the company have been so kept in accordance with Section 199 of the Companies Act.`
        : `I, the director of the abovementioned company, hereby declare that/on behalf of the Board of Directors that -

a) for the entire financial year concerned, the company had been an exempt private company at all relevant times as defined under Section 4(1) of the Companies Act by virtue of its being a private company of which no beneficial interest in shares is held, directly or indirectly, by any corporation and having not more than 20 members;

b) an unaudited profit and loss account and balance sheet made up to the date stated in the annual return which comply with the requirements of the Companies Act have been presented before the company in the annual general meeting on the date stated in this annual return;

c) as at the date that the profit and loss account for the financial year has been made up, the company appeared to be able to meet its liabilities as and when they fall due;

d) as at the end of the financial year, the company is exempt from audit requirements as its revenue in the year does not exceed the prescribed amount namely S$10 million since the date of incorporation;

e) no notice has been received from any member under Section 205B(6) requiring the company to obtain an audit of its accounts in relation to the year; and

f) the accounting and other records required to be kept by the company in accordance with Section 199 of the Companies Act have been so kept.`;

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Director's Statement</title>
    <style>
      body { font-family: Verdana, ui-sans-serif, system-ui, -apple-system; line-height: 1.45; padding: 28px; color: #111; font-size: 12px; }
      .block { margin-top: 10px; }
      .sig-row { margin-top: 14px; }
      .sig-line { width: 220px; height: 20px; border-bottom: 1px solid #111; position: relative; }
      .sig-mark { position: absolute; left: 0; bottom: 2px; font-size: 12px; color: #111; font-family: ui-serif, Georgia, serif; }
      .sig-name { margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="block"><strong>Name of Company :</strong> ${companyName}</div>
    <div class="block">Unique Entity Number (UEN) : <strong>${regNo || '_____________'}</strong></div>
    <div class="block" style="white-space: pre-wrap;">${esc(statement)}</div>
    <div class="block">Directors</div>
    ${sig}
    <div class="block">Dated: ${dated}</div>
  </body>
</html>
`.trim();
}

export function renderContractHtml(input: {
  templateHtml: string;
  contractNo: string;
  clientName: string;
  clientEmail: string;
  fields: Record<string, string>;
}) {
  const signerEmail =
    String((input.fields ?? {}).signer_email ?? '').trim() ||
    String((input.fields ?? {}).partyA_email ?? '').trim() ||
    String(input.clientEmail ?? '').trim();

  const map: Record<string, string> = {
    contract_no: input.contractNo,
    client_name: input.clientName,
    client_email: input.clientEmail,
    signer_email: signerEmail,
    ...(input.fields ?? {}),
  };

  let html = String(input.templateHtml ?? '');
  for (const [k, v] of Object.entries(map)) {
    const key = String(k ?? '').trim();
    if (!key) continue;
    const raw = String(v ?? '').trim();
    const safe = esc(raw).replaceAll('\n', '<br />');
    html = html.replaceAll(`{{${key}}}`, safe);
  }
  html = html.replaceAll(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '');

  if (html.includes('NOMINEE SERVICES INDEMNITY AGREEMENT')) {
    html = html.replace(
      /(<p class="p(?:8|9)">\s*\d+\.\d[\s\S]*?<\/p>)\s*(?!<p class="p4"><br><\/p>)(<p class="p(?:8|9)">\s*\d+\.\d)/g,
      '$1\n<p class="p4"><br></p>\n$2',
    );
  }
  return html;
}
