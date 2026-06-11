export function formatDateDMY(input?: string | null) {
  if (!input) return '-';

  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m = input.match(ymd);
  if (m) {
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`;
  }

  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function parseDateDMYToYmd(input?: string | null) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m1 = s.match(ymd);
  if (m1) return s;
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m2) return null;
  const dd = Number(m2[1]);
  const mm = Number(m2[2]);
  const yyyy = Number(m2[3]);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() + 1 !== mm || d.getUTCDate() !== dd) return null;
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function formatDateTimeDMY(input?: string | null) {
  const s = String(input ?? '').trim();
  if (!s) return '-';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:T|\s)(\d{2}:\d{2}:\d{2})/);
  if (m) return `${formatDateDMY(m[1])} ${m[2]}`;
  return formatDateDMY(s);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function addMonthsYmd(ymd: string, months: number) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const d = new Date(Date.UTC(yyyy, mm - 1 + months, dd));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addYearsYmd(ymd: string, years: number) {
  return addMonthsYmd(ymd, years * 12);
}
