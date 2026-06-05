'use client';

import { useI18n } from '@/components/I18nProviderClient';

export default function LanguageToggleClient() {
  const { lang, setLang } = useI18n();

  return (
    <div className="flex items-center rounded-md border border-white/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setLang('en')}
        className={[
          'px-2 py-1 text-xs font-medium',
          lang === 'en' ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
        ].join(' ')}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('zh')}
        className={[
          'px-2 py-1 text-xs font-medium',
          lang === 'zh' ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
        ].join(' ')}
      >
        中文
      </button>
    </div>
  );
}

