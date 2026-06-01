'use client';

export default function PrintButtonClient() {
  return (
    <button onClick={() => window.print()} className="rounded-md bg-black text-white px-3 py-2 text-sm font-medium">
      Print / Save PDF
    </button>
  );
}
