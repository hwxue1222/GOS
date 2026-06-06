'use client';

import LoginFormClient from '@/app/login/LoginFormClient';

export default function LoginClient() {
  return <LoginFormClient mode="admin" title="GOS 登录" subtitle="请使用你的员工账号登录" defaultFrom="/jobs" />;
}
