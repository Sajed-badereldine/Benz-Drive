'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/Toast';
import styles from '@/app/auth.module.css';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      showToast('Please enter your email address.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        bodyData: { email },
      });
      showToast(response.message || 'Reset link sent!', 'success');
      setSubmitted(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-container">
      {/* Decorative backdrop blobs */}
      <div className="blob blob-blue"></div>
      <div className="blob blob-green"></div>

      <div className="glass-panel">
        <div className={styles.card}>
          <h1 className={styles.title}>BenzDrive</h1>

          <div key={submitted ? 'submitted' : 'forgot'} className={styles.fadeScale}>
            {!submitted ? (
              <>
                <p className={styles.subtitle}>Enter your email to receive a password reset link</p>
                <form onSubmit={handleSubmit} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label htmlFor="email" className={styles.label}>Email Address</label>
                    <input
                      type="email"
                      id="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={styles.input}
                      required
                    />
                  </div>

                  <button type="submit" disabled={loading} className={styles.button}>
                    {loading ? <div className={styles.spinner}></div> : 'Send Reset Link'}
                  </button>
                </form>

                <Link href="/login" className={styles.link} style={{ textAlign: 'center', fontSize: '13px', display: 'block' }}>
                  Back to Sign In
                </Link>
              </>
            ) : (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '48px' }}>✉️</div>
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Reset Link Sent</h2>
                <p className={styles.subtitle}>
                  If an account exists for <strong>{email}</strong>, we sent a password reset email (valid for 15 minutes). Please check your spam folder if you do not receive it shortly.
                </p>
                <Link href="/login" className={styles.button} style={{ marginTop: '12px' }}>
                  Go to Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
