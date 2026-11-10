import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth';
import { getSettings, toPublicBranding } from '@/lib/settings';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  if (session) redirect(session.isAdmin && params.next?.startsWith('/admin') ? params.next : '/dashboard');

  const settings = await getSettings();
  const branding = toPublicBranding(settings);

  return (
    <LoginForm
      branding={branding}
      next={params.next}
      passwordReset={params.reset === '1'}
    />
  );
}
