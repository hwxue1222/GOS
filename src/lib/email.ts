import nodemailer from 'nodemailer';

export type EmailAttachment = { filename: string; contentBase64: string; contentType?: string };

export async function sendEmail(input: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT) || 0;
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpSecureEnv = process.env.SMTP_SECURE?.trim();
  const smtpSecure = smtpSecureEnv ? smtpSecureEnv === 'true' || smtpSecureEnv === '1' : smtpPort === 465;

  if (!from) return { ok: false as const, error: 'EMAIL_NOT_CONFIGURED' as const };

  if (apiKey) {
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

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
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

  try {
    const info = await transporter.sendMail({
      from,
      to: normalizeList(input.to).join(','),
      cc: normalizeList(input.cc).join(',') || undefined,
      subject: input.subject,
      html: input.html,
      attachments: attachments.length ? attachments : undefined,
    });

    if (!info) return { ok: false as const, error: 'EMAIL_SEND_FAILED' as const };
    return { ok: true as const };
  } catch (err) {
    const e = err as { code?: unknown; responseCode?: unknown; command?: unknown } | null;
    const code = typeof e?.code === 'string' ? e.code : '';
    const responseCode = typeof e?.responseCode === 'number' ? e.responseCode : null;
    const command = typeof e?.command === 'string' ? e.command : '';

    if (code === 'EAUTH' || responseCode === 535) return { ok: false as const, error: 'EMAIL_AUTH_FAILED' as const };
    if (code === 'ETIMEDOUT') return { ok: false as const, error: 'EMAIL_TIMEOUT' as const };
    if (code === 'ECONNECTION' || code === 'ESOCKET' || code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENOTFOUND') {
      return { ok: false as const, error: 'EMAIL_CONNECT_FAILED' as const };
    }
    if (code === 'EENVELOPE' || responseCode === 550) return { ok: false as const, error: 'EMAIL_INVALID_RECIPIENT' as const };
    const detail = [code || '', responseCode ? String(responseCode) : '', command || ''].filter(Boolean).join('-');
    return { ok: false as const, error: (`EMAIL_SEND_FAILED${detail ? `:${detail}` : ''}`) as const };
  }
}

export async function sendSigningInvite(input: { to: string; title: string; url: string }) {
  const subject = `Signature required: ${input.title}`;
  const html = `<div style="font-family: ui-sans-serif,system-ui; line-height:1.5;"><div>Please sign:</div><div style="margin-top:8px;"><a href="${input.url}">${input.url}</a></div><div style="color:#555;font-size:12px;margin-top:10px;">This link is unique to you.</div></div>`;
  return sendEmail({ to: input.to, subject, html });
}
