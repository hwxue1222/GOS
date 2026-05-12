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
