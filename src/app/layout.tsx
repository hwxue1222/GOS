import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

import I18nProviderClient from '@/components/I18nProviderClient';
import WhatsappSupportButton from '@/components/WhatsappSupportButton';
import { getLangFromCookies } from '@/lib/i18n.server';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});


export const metadata: Metadata = {
  title: 'GOS',
  description: 'GOS 综合管理程序',
  other: {
    'format-detection': 'telephone=no,email=no,address=no',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLangFromCookies();
  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <I18nProviderClient initialLang={lang}>
          {children}
          <WhatsappSupportButton phoneE164="+6589926681" defaultMessage="Hi, I need help with GOS." />
        </I18nProviderClient>
      </body>
    </html>
  );
}
