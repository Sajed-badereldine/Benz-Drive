'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/Toast';
import styles from '@/app/auth.module.css';
import Link from 'next/link';

export default function SignUpPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/dashboard');
    }
  }, [router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !email || !password || !confirmPassword) {
      showToast('Please fill out all fields.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    // Client-side quick check (Backend will fully validate as well)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!passwordRegex.test(password)) {
      showToast('Password is too weak. It must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch('/auth/signup', {
        method: 'POST',
        bodyData: { username, email, password },
      });

      showToast(response.message || 'Registration successful! Verification email sent.', 'success');
      setRegistered(true);
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

          <div key={registered ? 'check-email' : 'signup'} className={styles.fadeScale}>
            {!registered ? (
              <>
                <p className={styles.subtitle}>Create an account to securely host your files</p>
                <form onSubmit={handleSignUp} className={styles.form}>
                  <div className={styles.formGroup}>
                    <label htmlFor="username" className={styles.label}>Username</label>
                    <input
                      type="text"
                      id="username"
                      placeholder="john_doe"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="email" className={styles.label}>Email Address</label>
                    <input
                      type="email"
                      id="email"
                      placeholder="john@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={styles.input}
                      required
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="password" className={styles.label}>Password</label>
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
                    <label htmlFor="confirmPassword" className={styles.label}>Confirm Password</label>
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
                    {loading ? <div className={styles.spinner}></div> : 'Create Account'}
                  </button>
                </form>

                <p className={styles.linkText}>
                  Already have an account?{' '}
                  <Link href="/login" className={styles.link}>
                    Sign in
                  </Link>
                </p>
              </>
            ) : (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '48px' }}>✉️</div>
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Check your inbox</h2>
                <p className={styles.subtitle}>
                  We sent a verification link to <strong>{email}</strong>. Please check your email and click the link to verify your account (expires in 15 minutes).
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
