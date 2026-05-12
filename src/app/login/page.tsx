import { Suspense } from 'react';
import LoginClient from '@/app/login/LoginClient';

export default function LoginPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen flex items-center justify-center px-6 py-12">Loading...</main>}
    >
      <LoginClient />
    </Suspense>
  );
}
