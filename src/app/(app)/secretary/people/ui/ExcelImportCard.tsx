'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

type ImportMapping = {
  fullName?: string;
  email?: string;
  phone?: string;
  idType?: string;
  idNo?: string;
  nationality?: string;
  dob?: string;
  address?: string;
};

type Props = {
  canImport: boolean;
  onImported: (message: string) => void;
  onError: (message: string) => void;
};

function toStringCell(v: unknown) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function normalizeHeader(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function guessMapping(headers: string[]): ImportMapping {
  const byKey = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const pick = (keys: string[]) => {
    for (const k of keys) {
      const hit = byKey.get(k);
      if (hit) return hit;
    }
    return undefined;
  };
  return {
    fullName: pick(['full name', 'name', '姓名', '名字']),
    email: pick(['email', '邮箱', '电邮']),
    phone: pick(['phone', 'mobile', '联系电话', '电话', '手机']),
    idType: pick(['id type', '证件类型']),
    idNo: pick(['id no', 'id number', 'nric', 'passport', '证件号', '证件号码']),
    nationality: pick(['nationality', '国籍']),
    dob: pick(['dob', 'date of birth', '出生日期']),
    address: pick(['address', '地址']),
  };
}

export default function ExcelImportCard({ canImport, onImported, onError }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [importing, setImporting] = useState(false);

  const preview = useMemo(() => rows.slice(0, 10), [rows]);

  async function onPickFile(file: File) {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : null;
    if (!ws) {
      onError('INVALID_XLSX');
      return;
    }
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as unknown as string[][];
    const headerRow = Array.isArray(data[0]) ? data[0].map((x) => toStringCell(x).trim()).filter(Boolean) : [];
    const body = data.slice(1).filter((r) => Array.isArray(r) && r.some((x) => toStringCell(x).trim()));
    const normalizedRows = body.map((r) => {
      const o: Record<string, string> = {};
      for (let i = 0; i < headerRow.length; i++) {
        const key = headerRow[i];
        if (!key) continue;
        o[key] = toStringCell((r as unknown as unknown[])[i]).trim();
      }
      return o;
    });
    setHeaders(headerRow);
    setRows(normalizedRows);
    setMapping(guessMapping(headerRow));
  }

  async function runImport() {
    if (!canImport) return;
    const nameKey = mapping.fullName;
    if (!nameKey) {
      onError('请选择 Full Name 列');
      return;
    }
    const items = rows
      .map((r) => ({
        fullName: (r[nameKey] ?? '').trim(),
        email: mapping.email ? (r[mapping.email] ?? '').trim() : undefined,
        phone: mapping.phone ? (r[mapping.phone] ?? '').trim() : undefined,
        idType: mapping.idType ? (r[mapping.idType] ?? '').trim() : undefined,
        idNo: mapping.idNo ? (r[mapping.idNo] ?? '').trim() : undefined,
        nationality: mapping.nationality ? (r[mapping.nationality] ?? '').trim() : undefined,
        dob: mapping.dob ? (r[mapping.dob] ?? '').trim() : undefined,
        address: mapping.address ? (r[mapping.address] ?? '').trim() : undefined,
      }))
      .filter((x) => !!x.fullName);
    if (items.length === 0) {
      onError('没有可导入的数据');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch('/api/people/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: items.map((x) => {
            const raw = (x.idType ?? '').trim().toUpperCase();
            const idType = raw === 'NRIC' || raw === 'PASSPORT' || raw === 'OTHER' ? (raw as 'NRIC' | 'PASSPORT' | 'OTHER') : undefined;
            return { ...x, idType };
          }),
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = await res?.json().catch(() => null);
        onError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      const j = (await res.json().catch(() => null)) as { created?: number; updated?: number; skipped?: number } | null;
      onImported(`Imported. created=${j?.created ?? 0}, updated=${j?.updated ?? 0}, skipped=${j?.skipped ?? 0}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="rounded-xl bg-white border border-black/5 p-5">
      <div className="text-sm font-semibold">Excel 导入</div>
      <div className="mt-3 text-sm text-black/60">支持 .xlsx，第一行作为表头。</div>
      <div className="mt-4">
        <input
          type="file"
          accept=".xlsx"
          disabled={!canImport}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
          }}
          className="block w-full text-sm"
        />
        {!canImport ? <div className="mt-2 text-xs text-black/50">你没有导入权限。</div> : null}
        {fileName ? <div className="mt-2 text-xs text-black/50">{fileName}</div> : null}
      </div>

      {headers.length ? (
        <div className="mt-4">
          <div className="text-xs text-black/50">字段映射（至少选择 Full Name）</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              ['fullName', 'Full Name*'],
              ['email', 'Email'],
              ['phone', 'Phone'],
              ['idType', 'ID Type'],
              ['idNo', 'ID No'],
              ['nationality', 'Nationality'],
              ['dob', 'DOB'],
              ['address', 'Address'],
            ] as Array<[keyof ImportMapping, string]>).map(([k, label]) => (
              <label key={k} className="text-sm">
                <div className="text-black/60">{label}</div>
                <select
                  value={mapping[k] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value || undefined }))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm bg-white"
                >
                  <option value="">-</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-black/5 overflow-x-auto">
            <table className="min-w-[700px] w-full text-xs">
              <thead className="bg-black/2">
                <tr className="text-left text-black/60">
                  <th className="px-3 py-2">Preview</th>
                  <th className="px-3 py-2">Full Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">ID No</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, idx) => (
                  <tr key={idx} className="border-t border-black/5">
                    <td className="px-3 py-2">#{idx + 1}</td>
                    <td className="px-3 py-2">{mapping.fullName ? r[mapping.fullName] ?? '' : ''}</td>
                    <td className="px-3 py-2">{mapping.email ? r[mapping.email] ?? '' : ''}</td>
                    <td className="px-3 py-2">{mapping.phone ? r[mapping.phone] ?? '' : ''}</td>
                    <td className="px-3 py-2">{mapping.idNo ? r[mapping.idNo] ?? '' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-end">
            <button
              onClick={runImport}
              disabled={!canImport || importing}
              className="rounded-md bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
