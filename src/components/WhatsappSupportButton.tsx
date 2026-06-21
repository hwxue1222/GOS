'use client';

export default function WhatsappSupportButton(props: { phoneE164: string; defaultMessage: string }) {
  const phone = props.phoneE164.replaceAll(/[^0-9]/g, '');
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(props.defaultMessage)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:brightness-95"
    >
      WhatsApp
    </a>
  );
}

