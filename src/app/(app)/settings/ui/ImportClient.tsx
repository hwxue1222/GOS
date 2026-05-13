'use client';

import { useState } from 'react';

type ImportError = { row: number; message: string };
type ImportResult = { ok?: boolean; inserted?: number; updated?: number; errors?: ImportError[] };
type SimpleResult = { ok?: boolean; updated?: number; error?: string };

async function readRows(file: File): Promise<Array<Record<string, unknown>>> {
  const mod = (await import('xlsx')) as unknown as {
    read: (data: ArrayBuffer, opts?: unknown) => { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_json: (sheet: unknown, opts?: unknown) => Array<Record<string, unknown>> };
  };

  const wb = mod.read(await file.arrayBuffer(), { cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  return mod.utils.sheet_to_json(sheet, { defval: '' });
}

function Section({
  title,
  hint,
  endpoint,
}: {
  title: string;
  hint: string;
  endpoint: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function run() {
    if (!file) return;
    setRunning(true);
    setResult(null);
    try {
      const rows = await readRows(file);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as ImportResult | null;
      setResult(j ?? { ok: false });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-xl bg-white border border-black/5 p-5">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-sm text-black/60">{hint}</div>
      <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          onClick={run}
          disabled={running || !file}
          className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
        >
          {running ? 'Importing...' : 'Import'}
        </button>
        {result?.ok ? (
          <div className="text-sm text-black/60">
            Inserted {result.inserted ?? 0}, updated {result.updated ?? 0}
            {result.errors?.length ? `, errors ${result.errors.length}` : ''}
          </div>
        ) : result ? (
          <div className="text-sm text-red-600">FAILED</div>
        ) : null}
      </div>
      {result?.errors?.length ? (
        <div className="mt-4 rounded-lg border border-black/10 bg-white p-3 text-sm">
          <div className="font-medium text-black/70">Errors</div>
          <div className="mt-2 space-y-1 text-black/60">
            {result.errors.slice(0, 10).map((e) => (
              <div key={`${e.row}-${e.message}`}>
                Row {e.row}: {e.message}
              </div>
            ))}
            {result.errors.length > 10 ? <div>...</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ImportClient() {
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<SimpleResult | null>(null);
  const [fixingAnnual, setFixingAnnual] = useState(false);
  const [fixAnnualResult, setFixAnnualResult] = useState<SimpleResult | null>(null);

  async function fixGstQuarterly() {
    setFixing(true);
    setFixResult(null);
    try {
      const res = await fetch('/api/admin/fix-gst-quarterly', { method: 'POST' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as SimpleResult | null;
      setFixResult(j ?? { ok: false });
    } finally {
      setFixing(false);
    }
  }

  async function fixAnnualYearly() {
    setFixingAnnual(true);
    setFixAnnualResult(null);
    try {
      const res = await fetch('/api/admin/fix-annual-yearly', { method: 'POST' }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as SimpleResult | null;
      setFixAnnualResult(j ?? { ok: false });
    } finally {
      setFixingAnnual(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl bg-white border border-black/5 p-5">
        <div className="text-sm font-medium">Maintenance</div>
        <div className="mt-1 text-sm text-black/60">Bulk set repeat for specific job names.</div>
        <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <button
            onClick={fixGstQuarterly}
            disabled={fixing}
            className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {fixing ? 'Running...' : 'Fix Tax Service_GST'}
          </button>
          {fixResult?.ok ? (
            <div className="text-sm text-black/60">Updated {fixResult.updated ?? 0}</div>
          ) : fixResult ? (
            <div className="text-sm text-red-600">FAILED</div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:items-center">
          <button
            onClick={fixAnnualYearly}
            disabled={fixingAnnual}
            className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {fixingAnnual ? 'Running...' : 'Fix yearly jobs'}
          </button>
          {fixAnnualResult?.ok ? (
            <div className="text-sm text-black/60">Updated {fixAnnualResult.updated ?? 0}</div>
          ) : fixAnnualResult ? (
            <div className="text-sm text-red-600">FAILED</div>
          ) : null}
        </div>
      </div>
      <Section
        title="Import Clients"
        hint="Excel/CSV first sheet. Required columns: code, name. Optional: company reg no, contact person, address, phone, email."
        endpoint="/api/admin/import/clients"
      />
      <Section
        title="Import Jobs"
        hint="Required: client code, job name. Optional: remark, due date, repeat, manager in charge."
        endpoint="/api/admin/import/jobs"
      />
      <Section
        title="Import Tasks"
        hint="Required: title + (job id OR client code + job name) + assignee. Optional: due date, creation date, done."
        endpoint="/api/admin/import/tasks"
      />
    </div>
  );
}
