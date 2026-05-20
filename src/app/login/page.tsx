import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@/lib/supabase';
import { safeRedirect } from '@/lib/safeRedirect';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  const { redirect: redirectParam, error } = await searchParams;
  const dest = safeRedirect(redirectParam);

  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect(dest);

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="w-full max-w-sm bg-surface-card rounded-2xl shadow-sm p-8 text-center">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Split Bill</h1>
        <p className="text-text-secondary mb-6">
          Sign in to create and manage your bill-splitting sessions.
        </p>

        {error && (
          <p className="mb-4 text-sm text-status-danger">
            Sign-in was cancelled or failed. Please try again.
          </p>
        )}

        <GoogleSignInButton redirect={dest} />

        <p className="mt-6 text-xs text-text-secondary">
          Joining a session from a shared link? You don&apos;t need to sign in.
        </p>
      </div>
    </main>
  );
}
