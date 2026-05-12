const modules = [
  { key: 'employees', name: '员工管理' },
  { key: 'attendance', name: '出勤管理' },
  { key: 'schedule', name: '排班管理' },
  { key: 'inventory', name: '库存管理' },
  { key: 'announcements', name: '通知公告' },
  { key: 'stores', name: '门店管理' },
];

export default function HomePage() {
  return (
    <main className="flex-1 px-6 py-10 max-w-5xl w-full mx-auto">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">GOS</h1>
        <p className="text-sm opacity-80">综合管理程序（独立项目）</p>
      </header>

      <section className="mt-8">
        <h2 className="text-base font-medium">模块入口</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((m) => (
            <a
              key={m.key}
              href="#"
              className="rounded-lg border border-black/10 dark:border-white/10 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <div className="font-medium">{m.name}</div>
              <div className="text-xs opacity-70 mt-1">即将接入</div>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
