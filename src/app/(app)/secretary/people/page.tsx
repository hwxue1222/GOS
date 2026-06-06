import { redirect } from 'next/navigation';

export default async function SecretaryPeoplePage() {
  redirect('/secretary/members');
}
