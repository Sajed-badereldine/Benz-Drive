'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    apiFetch('/auth/me')
      .then((user) => {
        if (user && user.id) {
          router.push('/dashboard');
        } else {
          router.push('/login');
        }
      })
      .catch(() => {
        router.push('/login');
      });
  }, [router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fbf9f8' }}>
      <div style={{ width: '30px', height: '30px', border: '3px solid rgba(0,94,151,0.1)', borderTop: '3px solid #005e97', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
