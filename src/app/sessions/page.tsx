import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerComponentClient, createServerClient } from '@/lib/supabase';
import { listSessionsForUser } from '@/lib/sessions';
import { AccountMenu } from '@/components/AccountMenu';
import { SessionListTabs } from '@/components/SessionListTabs';

// Server-guarded: only the authenticated owner sees their sessions.
export default async function MySessionsPage() {
  const cookieStore = await cookies();
  const authClient = createServerComponentClient(cookieStore);
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/sessions');
  }

  // Service-role read, scoped to the verified user inside the helper. Seeds the
  // first Active page so the list renders without a client round-trip.
  const supabase = createServerClient();
  const initialActive = await listSessionsForUser(supabase, user.id, 'active', null);

  return (
    <main className="min-h-screen bg-surface-bg py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <AccountMenu />
        </div>
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-text-primary">My Sessions</h1>
          <Link
            href="/"
            className="text-sm font-semibold text-brand-primary hover:text-brand-primary-hover"
          >
            + Create session
          </Link>
        </header>

        <SessionListTabs initialActive={initialActive} />
      </div>
    </main>
  );
}
