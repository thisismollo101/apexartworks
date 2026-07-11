'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Magic-link login. Uses only the public anon key, which creates a session
 * and nothing else — table access is denied by RLS regardless of session.
 * Whether the signed-in email is an admin is decided server-side, and this
 * component never learns or reveals it.
 */
export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const send = async () => {
    setState('sending');
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (error) throw error;
      setState('sent');
    } catch {
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <p className="text-center text-[15px] text-txt-secondary">
        If that address can sign in, a magic link is on its way. Check your email.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) send();
      }}
      className="w-full max-w-sm"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        aria-label="Email for sign-in link"
        className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-[15px] text-txt placeholder:text-txt-muted focus:border-txt-muted focus:outline-none"
      />
      <button
        type="submit"
        disabled={state === 'sending'}
        className="mt-4 w-full rounded-full bg-white py-[16px] text-[16px] font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Send sign-in link'}
      </button>
      {state === 'error' && (
        <p className="mt-3 text-center text-[13px] text-txt-secondary">
          That didn&apos;t send. Try again.
        </p>
      )}
    </form>
  );
}

export function ClipJump() {
  const router = useRouter();
  const [id, setId] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (id.trim()) router.push(`/admin/clip/${encodeURIComponent(id.trim())}`);
      }}
      className="flex w-full max-w-sm gap-3"
    >
      <input
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="APX-C-…"
        aria-label="Clip id"
        className="flex-1 rounded-xl border border-hairline bg-surface px-4 py-3 font-mono text-[14px] text-txt placeholder:text-txt-muted focus:border-txt-muted focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-full bg-white px-6 text-[15px] font-semibold text-black transition-opacity hover:opacity-90"
      >
        Open
      </button>
    </form>
  );
}
