'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/Toast';
import styles from '@/app/auth.module.css';
import Link from 'next/link';

function VerifyEmailComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email address, please wait...');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Invalid or missing verification token.');
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await apiFetch(`/auth/verify?token=${token}`);
        setStatus('success');
        setMessage(response.message || 'Email successfully verified!');
        showToast(response.message || 'Email successfully verified!', 'success');
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Verification failed. The token may have expired.');
        showToast(err.message, 'error');
      }
    };

    verifyToken();
  }, [searchParams, showToast]);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>BenzDrive</h1>

      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
        {status === 'loading' && (
          <>
            <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <p className={styles.subtitle}>{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: '54px', color: 'var(--secondary)' }}>✅</div>
            <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Verification Successful!</h2>
            <p className={styles.subtitle}>{message}</p>
            <Link href="/login" className={styles.button} style={{ marginTop: '12px', width: '100%' }}>
              Go to Sign In
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '54px', color: 'var(--danger)' }}>❌</div>
            <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Verification Failed</h2>
            <p className={styles.subtitle} style={{ color: 'var(--danger)' }}>{message}</p>
            <Link href="/login" className={styles.button} style={{ marginTop: '12px', width: '100%' }}>
              Go to Sign In
            </Link>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="page-container">
      {/* Decorative backdrop blobs */}
      <div className="blob blob-blue"></div>
      <div className="blob blob-green"></div>

      <div className="glass-panel">
        <Suspense fallback={<div className={styles.card}><h1 className={styles.title}>BenzDrive</h1><p className={styles.subtitle}>Loading page...</p></div>}>
          <VerifyEmailComponent />
        </Suspense>
      </div>
    </main>
  );
}
