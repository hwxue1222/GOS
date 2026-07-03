import nodemailer from 'nodemailer';
import { getInvoiceIssuerConfig } from '@/lib/invoice';

export type EmailAttachment = { filename: string; contentBase64: string; contentType?: string };

export async function sendEmail(input: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = (process.env.EMAIL_FROM?.trim() || 'bbysgsg@gmail.com').trim();
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT) || 0;
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpSecureEnv = process.env.SMTP_SECURE?.trim();
  const smtpSecure = smtpSecureEnv ? smtpSecureEnv === 'true' || smtpSecureEnv === '1' : smtpPort === 465;

  const extractEmailAddress = (v: string) => {
    const s = v.trim();
    const m = s.match(/<([^>]+)>/);
    return (m?.[1] ?? s).trim();
  };
  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  if (!from) return { ok: false as const, error: 'EMAIL_NOT_CONFIGURED' as const };
  if (!isEmail(extractEmailAddress(from))) return { ok: false as const, error: 'EMAIL_FROM_INVALID' as const };

  const smtpReady = !!smtpHost && !!smtpPort && !!smtpUser && !!smtpPass;

  if (!smtpReady && apiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        html: input.html,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.contentBase64,
          content_type: a.contentType,
        })),
      }),
    }).catch(() => null);

    if (!res?.ok) {
      let detail = res ? `RESEND-${res.status}` : 'RESEND-NETWORK';
      try {
        const j = (await res?.json().catch(() => null)) as { error?: unknown; message?: unknown; name?: unknown } | null;
        const parts = [
          typeof j?.name === 'string' ? j.name : '',
          typeof j?.message === 'string' ? j.message : '',
          typeof j?.error === 'string' ? j.error : '',
        ]
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 2);
        if (parts.length) detail += `-${parts.join('-')}`;
      } catch {}
      return { ok: false as const, error: (`EMAIL_SEND_FAILED:${detail}`) as const };
    }
    return { ok: true as const };
  }

  if (!smtpReady) {
    return { ok: false as const, error: 'EMAIL_NOT_CONFIGURED' as const };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const normalizeList = (v: string | string[] | undefined) => {
    if (!v) return [];
    return (Array.isArray(v) ? v : [v])
      .map((x) => x.trim())
      .filter(Boolean);
  };

  const attachments = (input.attachments ?? []).map((a) => ({
    filename: a.filename,
    content: Buffer.from(a.contentBase64, 'base64'),
    contentType: a.contentType,
  }));

  const toList = normalizeList(input.to);
  const ccList = normalizeList(input.cc);
  const fromEmail = extractEmailAddress(from);
  const smtpUserEmail = smtpUser && isEmail(smtpUser) ? smtpUser : '';
  const envelopeFrom = smtpUserEmail || fromEmail;

  const sendViaSmtp = async (fromHeader: string) => {
    return transporter.sendMail({
      from: fromHeader,
      sender: envelopeFrom,
      replyTo: fromEmail,
      to: toList.join(','),
      cc: ccList.join(',') || undefined,
      subject: input.subject,
      html: input.html,
      attachments: attachments.length ? attachments : undefined,
      envelope: {
        from: envelopeFrom,
        to: toList.join(','),
        cc: ccList.join(',') || undefined,
      },
    });
  };

  const isMailFromRejected = (err: unknown) => {
    const e = err as { code?: unknown; responseCode?: unknown; command?: unknown; response?: unknown } | null;
    const code = typeof e?.code === 'string' ? e.code : '';
    const responseCode = typeof e?.responseCode === 'number' ? e.responseCode : null;
    const command = typeof e?.command === 'string' ? e.command : '';
    const responseText = typeof e?.response === 'string' ? e.response : '';
    return (code === 'EENVELOPE' || responseCode === 501) && /MAIL FROM/i.test(command || responseText);
  };

  try {
    const info = await sendViaSmtp(from);
    if (!info) return { ok: false as const, error: 'EMAIL_SEND_FAILED' as const };
    return { ok: true as const };
  } catch (err) {
    if (smtpUserEmail && extractEmailAddress(from) !== smtpUserEmail && isMailFromRejected(err)) {
      try {
        const info2 = await sendViaSmtp(smtpUserEmail);
        if (info2) return { ok: true as const };
      } catch {}
    }
    const e = err as {
      code?: unknown;
      responseCode?: unknown;
      command?: unknown;
      response?: unknown;
      rejected?: unknown;
      rejectedErrors?: unknown;
    } | null;
    const code = typeof e?.code === 'string' ? e.code : '';
    const responseCode = typeof e?.responseCode === 'number' ? e.responseCode : null;
    const command = typeof e?.command === 'string' ? e.command : '';
    const responseText = typeof e?.response === 'string' ? e.response : '';
    const rejected = Array.isArray(e?.rejected) ? e?.rejected.filter((x): x is string => typeof x === 'string') : [];

    if (code === 'EAUTH' || responseCode === 535) return { ok: false as const, error: 'EMAIL_AUTH_FAILED' as const };
    if (code === 'ETIMEDOUT') return { ok: false as const, error: 'EMAIL_TIMEOUT' as const };
    if (code === 'ECONNECTION' || code === 'ESOCKET' || code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENOTFOUND') {
      return { ok: false as const, error: 'EMAIL_CONNECT_FAILED' as const };
    }

    if ((code === 'EENVELOPE' || responseCode === 501) && /MAIL FROM/i.test(command || responseText)) {
      return { ok: false as const, error: 'EMAIL_SENDER_REJECTED' as const };
    }
    if (code === 'EENVELOPE' || (responseCode !== null && responseCode >= 550 && responseCode < 560)) {
      const looksInvalid =
        responseCode === 550 &&
        /user unknown|no such user|invalid recipient|mailbox unavailable|recipient address rejected|unknown user|does not exist/i.test(
          responseText,
        );
      if (looksInvalid) return { ok: false as const, error: 'EMAIL_INVALID_RECIPIENT' as const };
      const detail = [code || '', responseCode ? String(responseCode) : '', command || '', rejected.length ? rejected.join(',') : '']
        .filter(Boolean)
        .join('-');
      return { ok: false as const, error: (`EMAIL_RECIPIENT_REJECTED${detail ? `:${detail}` : ''}`) as const };
    }
    const detail = [code || '', responseCode ? String(responseCode) : '', command || ''].filter(Boolean).join('-');
    return { ok: false as const, error: (`EMAIL_SEND_FAILED${detail ? `:${detail}` : ''}`) as const };
  }
}

export async function sendSigningInvite(input: {
  to: string;
  url: string;
  title?: string;
  applicationName?: string;
  companyName?: string;
  documentTitle?: string;
  signerRole?: string;
  subject?: string;
  message?: string;
}) {
  const issuer = getInvoiceIssuerConfig('BBY_SG');
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = String(today.getFullYear());
  const dated = `${dd}/${mm}/${yyyy}`;

  const applicationName = String(input.applicationName ?? '').trim();
  const companyName = String(input.companyName ?? '').trim();
  const documentTitle = String(input.documentTitle ?? '').trim();
  const signerRole = String(input.signerRole ?? '').trim();

  const escHtml = (s: string) =>
    s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const salutation = 'Dear Sir/Madam,';
  const subject = `${companyName || 'Company'}_${applicationName || 'Signing'}`;

  const intro = (() => {
    const pieces: string[] = [];
    if (companyName) pieces.push(`Company: <strong>${companyName}</strong>`);
    if (applicationName) pieces.push(`Application: <strong>${applicationName}</strong>`);
    if (documentTitle) pieces.push(`Document: <strong>${documentTitle}</strong>`);
    if (signerRole) pieces.push(`Signing as: <strong>${signerRole}</strong>`);
    return pieces.length ? pieces.join('<br />') : '';
  })();
  const message = String(input.message ?? '').trim();
  const html = `
<div style="font-family: ui-sans-serif,system-ui; line-height:1.6; font-size:14px; color:#111;">
  <div>${salutation}</div>
  <div style="margin-top:10px;">
    ${intro || 'Please click the link below to review and sign.'}
  </div>
  ${message ? `<div style="margin-top:10px;">${escHtml(message).replaceAll('\n', '<br />')}</div>` : ''}
  <div style="margin-top:12px;">
    <a href="${input.url}">${input.url}</a>
  </div>
  <div style="margin-top:10px; color:#555; font-size:12px;">This link is valid for 10 days.</div>
  <div style="margin-top:16px; color:#111; font-size:12px;">
    ${issuer.displayName} (${issuer.uen})<br />
    ${dated}
  </div>
</div>
`.trim();
  return sendEmail({ to: input.to, subject, html });
}
