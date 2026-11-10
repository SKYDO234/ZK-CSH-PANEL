import { redirect } from 'next/navigation';
import { getSession, type SessionContext } from './auth';

/** Server-component guard: redirects to the login page when unauthenticated. */
export async function requireSession(redirectTo = '/dashboard'): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(redirectTo)}`);
  return session;
}

export async function requireAdmin(redirectTo = '/admin'): Promise<SessionContext> {
  const session = await requireSession(redirectTo);
  if (!session.isAdmin) redirect('/dashboard');
  return session;
}
