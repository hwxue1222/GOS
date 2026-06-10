function maskWord(w: string) {
  const s = String(w ?? '').trim();
  if (!s) return '';
  if (s.length === 1) return '*';
  return `${s[0]}${'*'.repeat(Math.max(2, s.length - 1))}`;
}

export function maskName(name: string) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.map(maskWord).join(' ');
}

export function maskDob(ymd: string) {
  const v = String(ymd ?? '').trim();
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '*/**/****';
  return `**/**/${m[1]}`;
}

export function maskEmail(email: string) {
  const v = String(email ?? '').trim();
  const at = v.indexOf('@');
  if (at <= 0) return '*'.repeat(Math.max(6, v.length));
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const lastDot = domain.lastIndexOf('.');
  const domainName = lastDot > 0 ? domain.slice(0, lastDot) : domain;
  const tld = lastDot > 0 ? domain.slice(lastDot) : '';
  const keepTail = Math.min(4, Math.max(0, local.length - 1));
  const maskedLocal =
    local.length <= 1
      ? '*'
      : `${local[0]}${'*'.repeat(Math.max(2, local.length - 1 - keepTail))}${keepTail ? local.slice(local.length - keepTail) : ''}`;
  const maskedDomain = domainName ? `${domainName[0]}${'*'.repeat(Math.max(2, domainName.length - 1))}` : '*'.repeat(4);
  return `${maskedLocal}@${maskedDomain}${tld}`;
}

export function maskPhone(countryCode: string, local: string) {
  const digits = String(local ?? '').replace(/\D/g, '');
  if (!digits) return `${countryCode} ****`;
  if (digits.length <= 4) return `${countryCode} ${'*'.repeat(digits.length)}`;
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  return `${countryCode} ${head}${'*'.repeat(Math.max(2, digits.length - 4))}${tail}`;
}

export function maskNationality(n: string) {
  const parts = String(n ?? '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts
    .map((p) => {
      if (p.length <= 2) return `${p[0] ?? '*'}${'*'.repeat(2)}`;
      return `${p[0]}${'*'.repeat(Math.max(6, p.length - 1))}`;
    })
    .join(' ');
}

export function maskAddress(addr: string) {
  const parts = String(addr ?? '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts
    .map((p) => {
      const s = String(p);
      if (!s) return '';
      return `${s[0]}**`;
    })
    .join(' ');
}

