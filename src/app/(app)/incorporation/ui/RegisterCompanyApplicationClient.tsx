'use client';

import RegisterCompanyWizardClient from '@/app/(app)/incorporation/ui/register-company/RegisterCompanyWizardClient';

type Props = {
  defaultCompanyName?: string;
};

export default function RegisterCompanyApplicationClient(props: Props) {
  return <RegisterCompanyWizardClient mode="create" defaultCompanyName={props.defaultCompanyName} />;
}
