import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { RegisterForm } from '@/components/auth/password-forms';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');
  const settings = await getSettings();
  if (!settings.general.registrationEnabled) redirect('/login');
  return <RegisterForm />;
}
