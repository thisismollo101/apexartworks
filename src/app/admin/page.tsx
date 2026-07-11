import { assertAdmin } from '@/lib/admin';
import { AdminLogin, ClipJump } from '@/components/AdminLogin';

export const dynamic = 'force-dynamic';

/**
 * /admin — the only pre-auth admin surface. Renders nothing sensitive in any
 * state: signed-out and signed-in-non-admin both see the login form (no
 * confirmation of adminhood); a verified admin gets a clip-id jump box.
 * Linked from no client page.
 */
export default async function AdminPage() {
  const isAdmin = await assertAdmin();

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center px-6 py-32">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-txt-muted">
        Apex Artworks
      </p>
      <h1 className="mt-3 text-[32px] font-bold tracking-[-0.01em]">
        {isAdmin ? 'Prompt viewer' : 'Sign in'}
      </h1>
      <div className="mt-10 flex w-full justify-center">
        {isAdmin ? <ClipJump /> : <AdminLogin />}
      </div>
      {isAdmin && (
        <p className="mt-6 text-[13px] text-txt-muted">
          Open a keeper by clip id. Internal surface — prompts only.
        </p>
      )}
    </main>
  );
}
