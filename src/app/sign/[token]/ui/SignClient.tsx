'use client';

import { useState } from 'react';

export default function SignClient(props: {
  token: string;
  title: string;
  html: string;
  pdfUrl?: string;
  sha256: string;
  requestEmail: string;
  requestStatus: string;
  expiresAt: string;
  expired: boolean;
  packetKind: string;
  requiresRepresentative: boolean;
  requiresSignerProfile: boolean;
  initialRepresentativeName: string;
  initialRepresentativeEmail: string;
  initialSignerFullName: string;
  initialSignerTitle: string;
  initialSignerIdType: string;
  initialSignerIdNo: string;
  initialSignerPhone: string;
}) {
  const {
    token,
    title,
    html,
    pdfUrl,
    sha256,
    requestEmail,
    requestStatus,
    expiresAt,
    expired,
    packetKind,
    requiresRepresentative,
    requiresSignerProfile,
    initialRepresentativeName,
    initialRepresentativeEmail,
    initialSignerFullName,
    initialSignerTitle,
    initialSignerIdType,
    initialSignerIdNo,
    initialSignerPhone,
  } = props;

  const [otp, setOtp] = useState('');
  const [repName, setRepName] = useState(initialRepresentativeName);
  const [repEmail, setRepEmail] = useState(initialRepresentativeEmail);
  const [sending, setSending] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [signerFullName, setSignerFullName] = useState(initialSignerFullName);
  const [signerTitle, setSignerTitle] = useState(initialSignerTitle);
  const [signerIdType, setSignerIdType] = useState(initialSignerIdType || 'NRIC');
  const [signerIdNo, setSignerIdNo] = useState(initialSignerIdNo);
  const [signerPhone, setSignerPhone] = useState(initialSignerPhone);

  const isRorcDecl = packetKind === 'RORC_DECL';
  const isContract = packetKind === 'CONTRACT';

  async function requestOtp() {
    setError(null);
    setInfo(null);
    setSending(true);
    try {
      const res = await fetch(`/api/sign/${token}/request-otp`, { method: 'POST' });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      if (j?.devOtp) setInfo(`OTP: ${j.devOtp}`);
      else setInfo('OTP_SENT');
    } finally {
      setSending(false);
    }
  }

  async function sign() {
    setError(null);
    setInfo(null);
    const code = otp.trim();
    if (!code) {
      setError('OTP_REQUIRED');
      return;
    }
    if (requiresRepresentative) {
      if (!repName.trim() || !repEmail.trim()) {
        setError('REPRESENTATIVE_REQUIRED');
        return;
      }
    }
    if (requiresSignerProfile) {
      if (!signerFullName.trim() || !signerTitle.trim()) {
        setError('SIGNER_PROFILE_REQUIRED');
        return;
      }
      if (isRorcDecl) {
        if (!signerIdNo.trim() || !signerPhone.trim()) {
          setError('SIGNER_PROFILE_REQUIRED');
          return;
        }
      }
      if (isContract) {
        
      }
    }
    setSigning(true);
    try {
      const res = await fetch(`/api/sign/${token}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          otp: code,
          rdrRepresentativeName: repName.trim() || undefined,
          rdrRepresentativeEmail: repEmail.trim() || undefined,
          signerFullName: signerFullName.trim() || undefined,
          signerTitle: signerTitle.trim() || undefined,
          signerIdType: signerIdType || undefined,
          signerIdNo: signerIdNo.trim() || undefined,
          signerPhone: signerPhone.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error ?? `HTTP_${res.status}`);
        return;
      }
      setInfo('SIGNED');
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="min-h-screen bg-black/[0.02]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-xl bg-white border border-black/5 p-6">
          <div className="text-lg font-semibold break-words">{title}</div>
          <div className="mt-1 text-sm text-black/60 break-words">{requestEmail}</div>
          <div className="mt-1 text-xs text-black/50 break-words">{`Status: ${requestStatus}`}</div>
          <div className="mt-1 text-xs text-black/50 break-words">{`Expires: ${new Date(expiresAt).toLocaleString()}`}</div>
          <div className="mt-1 text-xs text-black/50 break-words">{`Document hash: ${sha256}`}</div>

          {expired ? <div className="mt-4 text-sm text-red-600">EXPIRED</div> : null}

          {packetKind === 'RDR' ? (
            <div className="mt-5 rounded-lg border border-black/5 bg-black/[0.02] p-4">
              <div className="text-sm font-medium">Corporate Representative</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <div className="text-black/70">Name</div>
                  <input
                    disabled={!requiresRepresentative || signing}
                    value={repName}
                    onChange={(e) => setRepName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">Email</div>
                  <input
                    disabled={!requiresRepresentative || signing}
                    value={repEmail}
                    onChange={(e) => setRepEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
              </div>
              {requiresRepresentative ? (
                <div className="mt-2 text-xs text-black/50">All directors must sign to confirm the representative.</div>
              ) : null}
            </div>
          ) : null}

          {requiresSignerProfile ? (
            <div className="mt-5 rounded-lg border border-black/5 bg-black/[0.02] p-4">
              <div className="text-sm font-medium">Signer information</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <div className="text-black/70">Full name</div>
                  <input
                    disabled={signing}
                    value={signerFullName}
                    onChange={(e) => setSignerFullName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">Position</div>
                  <input
                    disabled={signing}
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                <label className="text-sm">
                  <div className="text-black/70">Email</div>
                  <input
                    disabled
                    value={requestEmail}
                    className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                  />
                </label>
                {isRorcDecl ? (
                  <>
                    <label className="text-sm">
                      <div className="text-black/70">ID type</div>
                      <select
                        disabled={signing}
                        value={signerIdType}
                        onChange={(e) => setSignerIdType(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                      >
                        <option value="NRIC">NRIC</option>
                        <option value="FIN">FIN</option>
                        <option value="PASSPORT">Passport</option>
                        <option value="IC">IC</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <div className="text-black/70">ID no.</div>
                      <input
                        disabled={signing}
                        value={signerIdNo}
                        onChange={(e) => setSignerIdNo(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <div className="text-black/70">Phone</div>
                      <input
                        disabled={signing}
                        value={signerPhone}
                        onChange={(e) => setSignerPhone(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm disabled:bg-black/[0.02] disabled:text-black/50"
                      />
                    </label>
                  </>
                ) : null}
              </div>
              {isContract ? null : (
                <div className="mt-2 text-xs text-black/50">Required for CC signers who are not in our member records.</div>
              )}
            </div>
          ) : null}

          <div className="mt-6 rounded-lg border border-black/10 overflow-hidden bg-white">
            {pdfUrl ? (
              <iframe title="document" src={pdfUrl} className="w-full" style={{ height: '70vh' }} />
            ) : (
              <iframe title="document" srcDoc={html} className="w-full" style={{ height: '70vh' }} />
            )}
          </div>

          {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
          {info ? <div className="mt-4 text-sm text-green-700">{info}</div> : null}

          <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:items-center">
            <button
              disabled={sending || expired}
              onClick={() => void requestOtp()}
              className="rounded-full bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Request OTP'}
            </button>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Enter OTP"
              className="w-full sm:max-w-[220px] rounded-lg border border-black/10 px-3 py-2 text-sm outline-none"
            />
            <button
              disabled={signing || expired}
              onClick={() => void sign()}
              className="rounded-full bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {signing ? 'Signing...' : 'Sign'}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white border border-black/5 overflow-hidden">
          <div className="px-6 py-3 border-b border-black/5 text-sm font-medium">Document</div>
          <div className="p-6">
            <iframe
              title="document"
              srcDoc={html}
              className="w-full h-[70vh] rounded-lg border border-black/10 bg-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
