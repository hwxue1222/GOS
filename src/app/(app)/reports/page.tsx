import AppTopNav from '@/components/AppTopNav';

export default function ReportsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <AppTopNav active="reports" />
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold">Reports</h1>
          <div className="mt-4 rounded-xl bg-white border border-black/5 p-6 text-sm text-black/60">
            Coming soon
          </div>
        </div>
      </div>
    </div>
  );
}

