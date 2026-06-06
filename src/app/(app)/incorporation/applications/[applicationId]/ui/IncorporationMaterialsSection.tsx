'use client';

type FileRow = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedByName: string;
  uploadedAt: string;
};

export default function IncorporationMaterialsSection(props: {
  files: FileRow[];
  uploading: boolean;
  onUpload: (files: FileList | null) => void;
}) {
  return (
    <div id="documents" className="rounded-xl bg-white border border-black/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Materials</div>
          <div className="mt-0.5 text-xs text-black/50">Uploaded files</div>
        </div>
        <label className="rounded-md bg-[#14b8a6] text-white px-4 py-2 text-sm font-medium cursor-pointer">
          {props.uploading ? 'Uploading...' : 'Upload'}
          <input type="file" className="hidden" multiple onChange={(e) => props.onUpload(e.target.files)} />
        </label>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-black/60">
            <tr className="border-b border-black/5">
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Uploaded by</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Operate</th>
            </tr>
          </thead>
          <tbody>
            {props.files.map((f) => (
              <tr key={f.id} className="border-b border-black/5">
                <td className="px-3 py-2">{f.fileName}</td>
                <td className="px-3 py-2">{f.uploadedByName}</td>
                <td className="px-3 py-2">{f.uploadedAt.slice(0, 19).replace('T', ' ')}</td>
                <td className="px-3 py-2">
                  <a href={`/api/incorporation/files/${encodeURIComponent(f.id)}/download`} className="text-[#2f7bdc] hover:underline">
                    Download
                  </a>
                </td>
              </tr>
            ))}
            {props.files.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-black/40">
                  No files
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

