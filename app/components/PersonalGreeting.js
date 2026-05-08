'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

// Hand-picked welcomes for specific accounts. Shown once per browser, ever.
const GREETINGS = {
  'radioastra1938@gmail.com': {
    name: 'Ольга',
    title: 'С возвращением, Ольга!',
    body: 'Pro-доступ активирован на 7 дней — все тесты, все режимы, без ограничений. Удачи на экзамене!',
    cta: 'Поехали',
  },
  'anastasiyarubkevich@gmail.com': {
    name: 'Анастасия',
    title: 'С возвращением, Анастасия!',
    body: 'Pro-доступ активирован на 7 дней — все тесты, все режимы, без ограничений. Удачи на экзамене!',
    cta: 'Поехали',
  },
};

export default function PersonalGreeting() {
  const { user } = useAuth();
  const [greeting, setGreeting] = useState(null);

  useEffect(() => {
    if (!user?.email) return;
    const email = user.email.toLowerCase();
    const g = GREETINGS[email];
    if (!g) return;
    const flagKey = `dmvsos_greeted_${email}`;
    if (localStorage.getItem(flagKey)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing one-shot localStorage flag
    setGreeting(g);
    localStorage.setItem(flagKey, '1');
  }, [user?.email]);

  if (!greeting) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={() => setGreeting(null)}>
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #F59E0B, #FB923C, #F59E0B)' }} />
        <div className="p-7 text-center">
          <h3 className="text-xl font-bold text-[#0B1C3D] mb-2">
            {greeting.title}
          </h3>
          <p className="text-sm text-[#64748B] mb-6">
            {greeting.body}
          </p>
          <button
            type="button"
            onClick={() => setGreeting(null)}
            className="w-full py-3.5 rounded-2xl font-bold text-white text-base"
            style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}>
            {greeting.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
