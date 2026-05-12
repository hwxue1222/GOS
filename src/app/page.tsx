import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <Link
        href="/jobs"
        className="rounded-lg border border-black/10 dark:border-white/10 px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        进入系统
      </Link>
    </main>
  );
}
