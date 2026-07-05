'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDateDMY } from '@/lib/date';
import { DateInputYMD } from '@/components/DateInputYMD';

type DirectorItem = {
  role: { id: string; appointmentDate?: string; resignationDate?: string };
  person: { id: string; fullName: string; email?: string; phone?: string };
};

export default function DirectorsAndCorporateRepresentativePanel(props: {
  clientId: string;
  canEdit: boolean;
}) {
  const todayYmd = new Date().toISOString().slice(0, 10);

  const [directors, setDirectors] = useState<DirectorItem[]>([]);
  const [directorsLoading, setDirectorsLoading] = useState(false);
  const [directorsError, setDirectorsError] = useState<string | null>(null);
  const [directorSaving, setDirectorSaving] = useState(false);
  const [newDirector, setNewDirector] = useState({ fullName: '', email: '', phone: '', appointmentDate: '' });
  const [editingDirectorId, setEditingDirectorId] = useState<string | null>(null);
  const [editDirectorDraft, setEditDirectorDraft] = useState({
    fullName: '',
    email: '',
    phone: '',
    appointmentDate: '',
    resignationDate: '',
  });

  async function loadDirectors() {
    setDirectorsError(null);
    setDirectorsLoading(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(props.clientId)}/directors?includeResigned=1`, {
        cache: 'no-store',
      }).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!res?.ok) {
        setDirectorsError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      setDirectors(Array.isArray(j?.directors) ? j.directors : []);
    } finally {
      setDirectorsLoading(false);
    }
  }

  useEffect(() => {
    void loadDirectors();
  }, [props.clientId]);

  async function createDirector() {
    setDirectorsError(null);
    const fullName = newDirector.fullName.trim();
    if (!fullName) {
      setDirectorsError('INVALID_INPUT');
      return;
    }
    setDirectorSaving(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(props.clientId)}/directors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email: newDirector.email.trim() || undefined,
          phone: newDirector.phone.trim() || undefined,
          appointmentDate: newDirector.appointmentDate.trim() || undefined,
        }),
      }).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!res?.ok) {
        setDirectorsError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      if (j?.director) {
        setDirectors((prev) => [j.director as DirectorItem, ...prev]);
        setNewDirector({ fullName: '', email: '', phone: '', appointmentDate: '' });
      }
    } finally {
      setDirectorSaving(false);
    }
  }

  function startEditDirector(d: DirectorItem) {
    setDirectorsError(null);
    setEditingDirectorId(d.role.id);
    setEditDirectorDraft({
      fullName: d.person.fullName,
      email: d.person.email ?? '',
      phone: d.person.phone ?? '',
      appointmentDate: d.role.appointmentDate ?? '',
      resignationDate: d.role.resignationDate ?? '',
    });
  }

  function cancelEditDirector() {
    setEditingDirectorId(null);
  }

  async function saveDirector(roleId: string) {
    setDirectorsError(null);
    const fullName = editDirectorDraft.fullName.trim();
    if (!fullName) {
      setDirectorsError('INVALID_INPUT');
      return;
    }
    setDirectorSaving(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(props.clientId)}/directors/${encodeURIComponent(roleId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email: editDirectorDraft.email.trim() || undefined,
          phone: editDirectorDraft.phone.trim() || undefined,
          appointmentDate: editDirectorDraft.appointmentDate.trim() || undefined,
          resignationDate: editDirectorDraft.resignationDate.trim() || undefined,
        }),
      }).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!res?.ok) {
        setDirectorsError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      if (j?.director) {
        setDirectors((prev) => prev.map((x) => (x.role.id === roleId ? (j.director as DirectorItem) : x)));
        setEditingDirectorId(null);
      }
    } finally {
      setDirectorSaving(false);
    }
  }

  async function resignDirector(roleId: string) {
    setDirectorsError(null);
    const ok = window.confirm('Mark this director as resigned today?');
    if (!ok) return;
    setDirectorSaving(true);
    try {
      const res = await fetch(`/api/secretary/companies/${encodeURIComponent(props.clientId)}/directors/${encodeURIComponent(roleId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resignationDate: todayYmd }),
      }).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!res?.ok) {
        setDirectorsError(j?.error ?? `HTTP_${res?.status ?? 'NETWORK'}`);
        return;
      }
      if (j?.director) setDirectors((prev) => prev.map((x) => (x.role.id === roleId ? (j.director as DirectorItem) : x)));
    } finally {
      setDirectorSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl bg-white border border-black/5">
        <div className="p-4 border-b border-black/5 flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">Directors</div>
          {directorsLoading ? <div className="text-sm text-black/50">Loading...</div> : null}
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-sm">
              <div className="text-black/70">Full name</div>
              <input
                disabled={!props.canEdit || directorSaving}
                value={newDirector.fullName}
                onChange={(e) => setNewDirector((v) => ({ ...v, fullName: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
              />
            </label>
            <label className="text-sm">
              <div className="text-black/70">Email</div>
              <input
                disabled={!props.canEdit || directorSaving}
                value={newDirector.email}
                onChange={(e) => setNewDirector((v) => ({ ...v, email: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
              />
            </label>
            <label className="text-sm">
              <div className="text-black/70">Phone</div>
              <input
                disabled={!props.canEdit || directorSaving}
                value={newDirector.phone}
                onChange={(e) => setNewDirector((v) => ({ ...v, phone: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
              />
            </label>
            <label className="text-sm">
              <div className="text-black/70">Appointment date</div>
              <DateInputYMD
                value={newDirector.appointmentDate}
                onChange={(next) => setNewDirector((v) => ({ ...v, appointmentDate: next }))}
                disabled={!props.canEdit || directorSaving}
                inputClassName="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
              />
            </label>
          </div>

          {directorsError ? <div className="mt-3 text-sm text-red-600">{directorsError}</div> : null}

          <div className="mt-4 flex items-center justify-end">
            <button
              disabled={!props.canEdit || directorSaving}
              onClick={() => void createDirector()}
              className="rounded-full bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {directorSaving ? 'Saving...' : 'Add director'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-black/5">
          <table className="min-w-full text-sm">
            <thead className="text-left text-black/60">
              <tr className="border-b border-black/5">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Appointment</th>
                <th className="px-4 py-3 font-medium">Resignation</th>
                <th className="px-4 py-3 font-medium w-40"></th>
              </tr>
            </thead>
            <tbody>
              {directors.map((d) => {
                const editing = editingDirectorId === d.role.id;
                return (
                  <tr key={d.role.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {editing ? (
                        <input
                          disabled={directorSaving}
                          value={editDirectorDraft.fullName}
                          onChange={(e) => setEditDirectorDraft((v) => ({ ...v, fullName: e.target.value }))}
                          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        <div className="truncate max-w-[240px]" title={d.person.fullName}>
                          {d.person.fullName}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {editing ? (
                        <input
                          disabled={directorSaving}
                          value={editDirectorDraft.email}
                          onChange={(e) => setEditDirectorDraft((v) => ({ ...v, email: e.target.value }))}
                          className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        <div className="truncate max-w-[240px]" title={d.person.email ?? ''}>
                          {d.person.email ?? '-'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{editing ? (
                      <input
                        disabled={directorSaving}
                        value={editDirectorDraft.phone}
                        onChange={(e) => setEditDirectorDraft((v) => ({ ...v, phone: e.target.value }))}
                        className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                      />
                    ) : (
                      d.person.phone ?? '-'
                    )}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {editing ? (
                        <DateInputYMD
                          value={editDirectorDraft.appointmentDate}
                          onChange={(next) => setEditDirectorDraft((v) => ({ ...v, appointmentDate: next }))}
                          disabled={directorSaving}
                          inputClassName="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      ) : d.role.appointmentDate ? (
                        formatDateDMY(d.role.appointmentDate)
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {editing ? (
                        <DateInputYMD
                          value={editDirectorDraft.resignationDate}
                          onChange={(next) => setEditDirectorDraft((v) => ({ ...v, resignationDate: next }))}
                          disabled={directorSaving}
                          inputClassName="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
                        />
                      ) : d.role.resignationDate ? (
                        formatDateDMY(d.role.resignationDate)
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {props.canEdit ? (
                        editing ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              disabled={directorSaving}
                              onClick={() => void saveDirector(d.role.id)}
                              className="rounded-md bg-black text-white px-3 py-1.5 text-sm disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              disabled={directorSaving}
                              onClick={cancelEditDirector}
                              className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <button
                              disabled={directorSaving}
                              onClick={() => startEditDirector(d)}
                              className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                            >
                              Edit
                            </button>
                            {!d.role.resignationDate ? (
                              <button
                                disabled={directorSaving}
                                onClick={() => void resignDirector(d.role.id)}
                                className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                              >
                                Resign
                              </button>
                            ) : null}
                          </div>
                        )
                      ) : (
                        <span className="text-black/30">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {directors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-black/50">
                    No directors
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-black/5 p-5">
        <div className="text-sm font-semibold">Corporate Representative</div>
        <div className="mt-1 text-sm text-black/50">Use Corporate Secretary Service to appoint / change GLOBAL corporate representative.</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/corporate-secretary/appoint-corporate-representative"
            onClick={() => window.sessionStorage.setItem('gos.currentCompanyId', props.clientId)}
            className="rounded-md bg-white border border-black/10 px-3 py-2 text-sm text-black/70 hover:bg-black/[0.02]"
          >
            Open Appointment Service
          </Link>
        </div>
      </div>
    </div>
  );
}
