'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/Toast';
import styles from '@/app/auth.module.css';
import Link from 'next/link';

function ResetPasswordComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      showToast('Invalid or missing reset token.', 'error');
    } else {
      setToken(tokenParam);
    }
  }, [searchParams, showToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      showToast('No valid reset token found. Please click the link in your email again.', 'error');
      return;
    }

    if (!password || !confirmPassword) {
      showToast('Please fill out all fields.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    // Check strength locally
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
      showToast('Password is too weak. It must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch(`/auth/reset-password?token=${token}`, {
        method: 'POST',
        bodyData: { password },
      });

      showToast(response.message || 'Password reset successful!', 'success');
      setSuccess(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>BenzDrive</h1>

      <div key={success ? 'success' : 'reset'} className={styles.fadeScale}>
        {!success ? (
          <>
            <p className={styles.subtitle}>Enter a strong, secure new password for your account</p>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label htmlFor="password" className={styles.label}>New Password</label>
                <input
                  type="password"
                  id="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.input}
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', marginTop: '2px' }}>
                  Must be 8+ chars with at least one uppercase, lowercase, number, and special char.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="confirmPassword" className={styles.label}>Confirm New Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={styles.input}
                  required
                />
              </div>

              <button type="submit" disabled={loading} className={styles.button}>
                {loading ? <div className={styles.spinner}></div> : 'Reset Password'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '54px', color: 'var(--secondary)' }}>✅</div>
            <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Password Reset Complete</h2>
            <p className={styles.subtitle}>
              Your password has been changed successfully. You can now log into your account using your new credentials.
            </p>
            <Link href="/login" className={styles.button} style={{ marginTop: '12px' }}>
              Go to Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="page-container">
      {/* Decorative backdrop blobs */}
      <div className="blob blob-blue"></div>
      <div className="blob blob-green"></div>

      <div className="glass-panel">
        <Suspense fallback={<div className={styles.card}><h1 className={styles.title}>BenzDrive</h1><p className={styles.subtitle}>Loading page...</p></div>}>
          <ResetPasswordComponent />
        </Suspense>
      </div>
    </main>
  );
}
