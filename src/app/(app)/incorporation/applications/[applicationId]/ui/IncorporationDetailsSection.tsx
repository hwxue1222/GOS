'use client';

type Application = {
  id: string;
  type: 'REGISTER_COMPANY' | 'TRANSFER_COMPANY_SECRETARY';
  status: 'DRAFT' | 'SUBMITTED' | 'PROCESSING' | 'NEED_MORE_INFO' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  title: string;
  companyId?: string;
  companyName?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

export default function IncorporationDetailsSection(props: {
  application: Application;
  canClientEdit: boolean;
  busy: boolean;
  onChangeApplication: (next: Application) => void;
  onSave: () => void;
  onSubmit: () => void;
}) {
  const app = props.application;
  const payload = app.payload || {};

  return (
    <div className="rounded-xl bg-white border border-black/5 p-4">
      <div className="text-sm font-semibold">Details</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-black/50">Company</div>
          {props.canClientEdit && app.type === 'REGISTER_COMPANY' ? (
            <input
              value={typeof payload.companyName === 'string' ? payload.companyName : ''}
              onChange={(e) => props.onChangeApplication({ ...app, payload: { ...app.payload, companyName: e.target.value } })}
              className="mt-1 w-full rounded-md border border-black/10 px-3 py-2"
              placeholder="Company name"
            />
          ) : (
            <div className="mt-1 font-medium">{String(app.companyName ?? (payload.companyName as string) ?? '-')}</div>
          )}
        </div>
        {app.type === 'TRANSFER_COMPANY_SECRETARY' ? (
          <div>
            <div className="text-black/50">Effective date</div>
            <div className="mt-1 font-medium">{String(payload.effectiveDate ?? '-')}</div>
          </div>
        ) : (
          <div>
            <div className="text-black/50">Incorporation date</div>
            <div className="mt-1 font-medium">{String(payload.incorporationDate ?? '-')}</div>
          </div>
        )}
        {app.type === 'TRANSFER_COMPANY_SECRETARY' ? (
          <>
            <div>
              <div className="text-black/50">New secretary</div>
              <div className="mt-1 font-medium">{String(payload.newSecretaryName ?? '-')}</div>
            </div>
            <div>
              <div className="text-black/50">New secretary email</div>
              <div className="mt-1 font-medium">{String(payload.newSecretaryEmail ?? '-')}</div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="text-black/50">Contact person</div>
              <div className="mt-1 font-medium">{String(payload.contactPerson ?? '-')}</div>
            </div>
            <div>
              <div className="text-black/50">Contact email</div>
              <div className="mt-1 font-medium">{String(payload.contactEmail ?? '-')}</div>
            </div>
          </>
        )}
      </div>

      {props.canClientEdit ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            disabled={props.busy}
            onClick={props.onSave}
            className="rounded-md bg-white border border-black/10 text-black/70 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Save
          </button>
          <button
            disabled={props.busy}
            onClick={props.onSubmit}
            className="rounded-md bg-[#2f7bdc] text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      ) : null}
    </div>
  );
}

