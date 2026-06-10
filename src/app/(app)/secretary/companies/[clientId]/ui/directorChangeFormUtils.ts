export type PhoneCountryCode = '+65' | '+86' | '+852' | '+886' | '+60' | '+62' | '+66' | '+84' | '+63' | '+81' | '+82' | '+1' | '+44';

export const PHONE_COUNTRY_CODES: Array<{ label: string; value: PhoneCountryCode }> = [
  { label: 'SG +65', value: '+65' },
  { label: 'CN +86', value: '+86' },
  { label: 'HK +852', value: '+852' },
  { label: 'TW +886', value: '+886' },
  { label: 'MY +60', value: '+60' },
  { label: 'ID +62', value: '+62' },
  { label: 'TH +66', value: '+66' },
  { label: 'VN +84', value: '+84' },
  { label: 'PH +63', value: '+63' },
  { label: 'JP +81', value: '+81' },
  { label: 'KR +82', value: '+82' },
  { label: 'US +1', value: '+1' },
  { label: 'UK +44', value: '+44' },
];

export const NATIONALITY_OPTIONS = [
  'Singapore',
  'Singapore PR',
  'EP',
  'China',
  'Chinese/hongkong sar',
  'South Korea',
  'Japan',
  'Malaysia',
  'Indonesia',
  'Thailand',
  'Vietnam',
  'Philippines',
  'United States',
  'Canada',
  'Australia',
  'New Zealand',
  'United Kingdom',
] as const;

export type NewDirector = {
  fullName: string;
  dob: string;
  dobLocked: boolean;
  nationality: string;
  phoneCountryCode: PhoneCountryCode;
  phoneLocal: string;
  idNo: string;
  idTypeLabel: 'Passport No.' | 'NRIC No.' | 'FIN No.' | 'IC No.' | 'ID No.';
  email: string;
  address: string;
  lockedFromMember: boolean;
};

export function normalizePhone(countryCode: string, local: string) {
  const digits = String(local ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return `${countryCode}${digits}`;
}

export function splitPhone(phoneRaw: string): { phoneCountryCode: PhoneCountryCode; phoneLocal: string } {
  const s = String(phoneRaw ?? '').trim();
  const digits = s.replace(/\s+/g, '');
  for (const c of PHONE_COUNTRY_CODES.slice().sort((a, b) => b.value.length - a.value.length)) {
    if (digits.startsWith(c.value)) {
      return { phoneCountryCode: c.value, phoneLocal: digits.slice(c.value.length).replace(/\D/g, '') };
    }
  }
  return { phoneCountryCode: '+65', phoneLocal: digits.replace(/\D/g, '') };
}

export function ymdNDaysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function ymdToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function isYmdWithinPastDays(ymd: string, days: number) {
  const v = String(ymd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const today = ymdToday();
  const min = ymdNDaysAgo(days);
  return v >= min && v <= today;
}

export function isYmd(ymd: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(ymd ?? '').trim());
}

export function isEmail(email: string) {
  const v = String(email ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function draftKey(companyId: string) {
  return `gos.draft.changeDirector.${companyId}`;
}

