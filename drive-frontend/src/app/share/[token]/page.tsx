'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function ShareLinkPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const accessLink = async () => {
      try {
        await apiFetch(`/files/shares/access-link/${token}`);
        router.push('/dashboard');
      } catch (err: any) {
        if (err.message?.includes('Unauthorized') || err.status === 401) {
          router.push(`/login?redirect=/share/${token}`);
        } else {
          setError(err.message || 'Failed to access shared link');
          setLoading(false);
        }
      }
    };

    accessLink();
  }, [token, router]);

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      {loading ? (
        <div style={{ textAlign: 'center' }}>
          <h2>Accessing shared item...</h2>
          <p style={{ opacity: 0.7 }}>Verifying permissions and adding to your dashboard.</p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#ba1a1a' }}>
          <h2>Access Error</h2>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
