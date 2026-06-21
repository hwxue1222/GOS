import { Suspense } from 'react';
import LoginFormClient from '@/app/login/LoginFormClient';

export const metadata = {
  title: 'BBY Corporate secretary service portal',
};

export default function PortalLoginPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen flex items-center justify-center px-6 py-12">Loading...</main>}
    >
      <LoginFormClient
        mode="portal"
        title="BBY Corporate secretary service portal"
        subtitle="百桥秘书服务平台"
        defaultFrom="/portal/companies"
      />
    </Suspense>
  );
}
