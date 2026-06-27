'use client';

import { usePathname } from 'next/navigation';

import WhatsappSupportButton from '@/components/WhatsappSupportButton';

type Props = {
  phoneE164: string;
  defaultMessage: string;
};

export default function WhatsappSupportGate({ phoneE164, defaultMessage }: Props) {
  const pathname = usePathname() || '';
  const show = pathname === '/portal' || pathname.startsWith('/portal/') || pathname.startsWith('/p/') || pathname.startsWith('/sign/');
  if (!show) return null;
  return <WhatsappSupportButton phoneE164={phoneE164} defaultMessage={defaultMessage} />;
}

