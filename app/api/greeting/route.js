import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Hand-picked welcomes for specific accounts. Kept server-side so the email
// list never ships in the client bundle.
const GREETINGS = {
  'radioastra1938@gmail.com': {
    title: 'С возвращением, Ольга!',
    body: 'Pro-доступ активирован на 7 дней — все тесты, все режимы, без ограничений. Удачи на экзамене!',
    cta: 'Поехали',
  },
  // anastasiyarubkevich@gmail.com — handled separately by <NastyaGreeting>
  // (fullscreen heart overlay instead of the generic modal).
};

export async function GET(req) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ greeting: null });
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.email) {
    return Response.json({ greeting: null });
  }

  const greeting = GREETINGS[user.email.toLowerCase()] || null;
  return Response.json({ greeting });
}
