import { Suspense } from 'react';
import LoginFormClient from '@/app/login/LoginFormClient';

export const metadata = {
  title: 'BBY.SG Corporate Secretary Service Portal',
};

export default function PortalLoginPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen flex items-center justify-center px-6 py-12">Loading...</main>}
    >
      <LoginFormClient
        mode="portal"
        title="BBY.SG Corporate Secretary Service Portal"
        subtitle="请使用你的公司账号登录"
        defaultFrom="/dashboard"
      />
    </Suspense>
  );
}
