'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Lock, ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';

export default function ShareLinkPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDenied, setIsDenied] = useState(false);

  useEffect(() => {
    if (!token) return;

    const accessLink = async () => {
      try {
        await apiFetch(`/files/shares/access-link/${token}`);
        router.push('/dashboard');
      } catch (err: any) {
        if (err.message?.includes('Unauthorized') || err.status === 401) {
          router.push(`/login?redirect=/share/${token}`);
        } else if (err.message?.includes('need access') || err.status === 403) {
          setIsDenied(true);
          setError(err.message || 'You do not have permission to view this item.');
          setLoading(false);
        } else {
          setError(err.message || 'Failed to access shared link.');
          setLoading(false);
        }
      }
    };

    accessLink();
  }, [token, router]);

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      width: '100vw',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #fbf9f8 0%, #e4e2e1 100%)',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      color: '#1b1c1c',
      padding: '20px'
    }}>
      {loading ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid rgba(0, 94, 151, 0.2)',
            borderTopColor: '#005e97',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#005e97', marginBottom: '8px' }}>
            Accessing Shared Item...
          </h2>
          <p style={{ fontSize: '14px', color: '#707882' }}>
            Verifying permissions and adding to your drive.
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : isDenied ? (
        <div style={{
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.1)',
          padding: '40px',
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(220, 38, 38, 0.1)',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <Lock size={32} />
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1b1c1c', marginBottom: '12px', letterSpacing: '-0.02em' }}>
            You Need Access
          </h1>

          <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#404751', marginBottom: '28px' }}>
            You don't have permission to view this item. Ask the owner to share it with your account or switch to an account with permission.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => router.push('/dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                borderRadius: '12px',
                background: '#005e97',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <ArrowLeft size={16} />
              <span>Go to My Drive</span>
            </button>

            <button
              onClick={() => router.push(`/login?redirect=/share/${token}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                borderRadius: '12px',
                background: 'rgba(0, 0, 0, 0.05)',
                color: '#404751',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <LogIn size={16} />
              <span>Switch Account</span>
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          padding: '40px',
          maxWidth: '440px',
          width: '100%',
          textAlign: 'center'
        }}>
          <ShieldAlert size={48} style={{ color: '#dc2626', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Link Error</h2>
          <p style={{ fontSize: '14px', color: '#707882', marginBottom: '24px' }}>{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              background: '#005e97',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Return to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
