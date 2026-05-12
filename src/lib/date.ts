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

