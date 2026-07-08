import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { safeInternalPath } from '@/lib/safeNext'

// Fallback path: the browser client keeps sessions in localStorage (OAuth
// normally lands on the bare origin), so this cookie-based route must stay
// whitelisted-only in Supabase URL Configuration.
export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  // No code, or the exchange failed → surface it on /login instead of
  // silently redirecting a session-less user to a signed-out page.
  if (!code) {
    return NextResponse.redirect(requestUrl.origin + '/login?error=oauth_callback')
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('OAuth code exchange failed:', error)
    return NextResponse.redirect(requestUrl.origin + '/login?error=oauth_callback')
  }

  const next = safeInternalPath(requestUrl.searchParams.get('next'), '/');
  return NextResponse.redirect(requestUrl.origin + next)
}
