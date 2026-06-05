'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { I18nKey, Lang } from '@/lib/i18n';
import { LANG_COOKIE, normalizeLang } from '@/lib/i18n';

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: I18nKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const DICT_CLIENT: Record<Lang, Record<string, string>> = {
  en: {
    'nav.jobs': 'Jobs',
    'nav.clients': 'Clients',
    'nav.invoices': 'Invoices',
    'nav.secretary': 'Secretary',
    'nav.reports': 'Reports',
    'menu.manageTeam': 'Manage My Team',
    'menu.editProfile': 'Edit My Profile',
    'menu.settings': 'Settings',
    'menu.signOut': 'Sign out',
    'secretary.companies': 'Companies',
    'secretary.companyDetail': 'Company Detail',
    'secretary.companyInfo': 'Company Info',
    'secretary.extendedFields': 'Extended fields',
    'secretary.peopleAndRoles': 'People & roles',
    'secretary.peopleLibrary': 'People',
    'secretary.member': 'Member',
    'secretary.regNo': 'Reg No.',
    'secretary.paidUpCapital': 'Paid-up capital',
    'secretary.totalShares': 'Total shares',
    'secretary.rorcController': 'RORC',
    'secretary.secretaryRole': 'Secretary',
    'secretary.directors': 'Directors',
    'secretary.shareholders': 'Shareholders',
    'secretary.createdAt': 'Created',
    'secretary.actions': 'Actions',
    'common.edit': 'Edit',
    'common.view': 'View',
    'common.files': 'Files',
    'common.noResults': 'No results',
    'common.noMatch': 'No matches',
    'people.searchPlaceholder': 'Search name/email/phone/id',
    'people.hint': 'Assign roles in company detail.',
    'people.tags': 'Tags',
    'people.companyCountSuffix': 'companies',
    'roles.director': 'Director',
    'roles.shareholder': 'Shareholder',
    'roles.rorc': 'RORC',
    'roles.secretary': 'Secretary',
    'roles.addPerson': 'Add person to current role',
    'roles.addShareholder': 'Add shareholder (person or company)',
    'roles.person': 'Person',
    'roles.company': 'Company',
    'roles.select': 'Please select',
    'roles.add': 'Add',
    'roles.readOnly': 'Read-only: you can view role info.',
    'roles.shares': 'Shares',
    'roles.shareSummary': 'Shareholders share sum',
    'roles.totalShares': 'Total shares',
    'roles.none': 'None',
    'company.extendedFields': 'Extended fields',
    'company.paidUpCapitalCurrency': 'Paid-up capital currency',
    'company.paidUpCapitalAmount': 'Paid-up capital amount',
    'company.totalShares': 'Total shares',
    'company.incorporationDate': 'Incorporation date',
    'company.registeredOfficeAddress': 'Registered office address',
    'ssic.placeholder': 'Type SSIC code or keywords',
    'ssic.clear': 'Clear selection',
  },
  zh: {
    'nav.jobs': '工作',
    'nav.clients': '客户',
    'nav.invoices': '发票',
    'nav.secretary': '秘书',
    'nav.reports': '报表',
    'menu.manageTeam': '团队管理',
    'menu.editProfile': '编辑资料',
    'menu.settings': '设置',
    'menu.signOut': '退出登录',
    'secretary.companies': '公司',
    'secretary.companyDetail': '公司详情',
    'secretary.companyInfo': '公司信息',
    'secretary.extendedFields': '扩展字段',
    'secretary.peopleAndRoles': '人员与角色',
    'secretary.peopleLibrary': '人员库',
    'secretary.member': '会员',
    'secretary.regNo': '注册号',
    'secretary.paidUpCapital': '注册资本',
    'secretary.totalShares': '总股数',
    'secretary.rorcController': 'RORC实控人',
    'secretary.secretaryRole': '秘书',
    'secretary.directors': '董事',
    'secretary.shareholders': '股东',
    'secretary.createdAt': '创建时间',
    'secretary.actions': '操作',
    'common.edit': '编辑',
    'common.view': '查看',
    'common.files': '文件',
    'common.noResults': '暂无结果',
    'common.noMatch': '无匹配',
    'people.searchPlaceholder': '搜索姓名/邮箱/电话/证件',
    'people.hint': '在公司详情页选择董事/股东/RORC/秘书。',
    'people.tags': '标签',
    'people.companyCountSuffix': '家公司',
    'roles.director': '董事',
    'roles.shareholder': '股东',
    'roles.rorc': 'RORC',
    'roles.secretary': '秘书',
    'roles.addPerson': '添加人员到当前角色',
    'roles.addShareholder': '添加股东（人员或公司）',
    'roles.person': '人员',
    'roles.company': '公司',
    'roles.select': '请选择',
    'roles.add': '添加',
    'roles.readOnly': '只读：你可以查看角色信息。',
    'roles.shares': '股份',
    'roles.shareSummary': '股东股份合计',
    'roles.totalShares': '总股数',
    'roles.none': '暂无',
    'company.extendedFields': '扩展字段',
    'company.paidUpCapitalCurrency': '注册资本币种',
    'company.paidUpCapitalAmount': '注册资本金额',
    'company.totalShares': '总股数',
    'company.incorporationDate': '成立时间',
    'company.registeredOfficeAddress': '注册地址',
    'ssic.placeholder': '输入SSIC code或关键字',
    'ssic.clear': '清除选择',
  },
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('I18nContext missing');
  return ctx;
}

export default function I18nProviderClient({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(normalizeLang(initialLang));

  const value = useMemo<I18nContextValue>(() => {
    return {
      lang,
      setLang: (next) => {
        const normalized = normalizeLang(next);
        setLangState(normalized);
        document.cookie = `${LANG_COOKIE}=${normalized}; Path=/; Max-Age=31536000; SameSite=Lax`;
        router.refresh();
      },
      t: (key) => DICT_CLIENT[lang]?.[key] ?? DICT_CLIENT.en?.[key] ?? key,
    };
  }, [lang, router]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
