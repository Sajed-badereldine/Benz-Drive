'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/Toast';
import styles from '@/app/auth.module.css';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // Login form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // 2FA state management
  const [requires2FA, setRequires2FA] = useState(false);
  const [pin, setPin] = useState<string[]>(Array(6).fill(''));
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/dashboard');
    }
  }, [router]);

  // Handle standard password sign-in
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Please enter both email and password.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        bodyData: { email, password },
      });

      if (response.requires2FA) {
        setRequires2FA(true);
        showToast(response.message || 'Two-factor code sent to your email.', 'success');
      } else if (response.data?.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        showToast(response.message || 'Successfully signed in!', 'success');
        router.push('/dashboard');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Focus navigation for 2FA PIN digits
  const handlePinChange = (value: string, index: number) => {
    if (isNaN(Number(value))) return; // Allow numbers only

    const newPin = [...pin];
    newPin[index] = value.substring(value.length - 1); // Keep last char
    setPin(newPin);

    // Auto-focus next input box
    if (value && index < 5) {
      pinRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      // Auto-focus previous input box on backspace
      pinRefs.current[index - 1]?.focus();
    }
  };

  // Submit 2FA Code
  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = pin.join('');
    if (code.length < 6) {
      showToast('Please enter the full 6-digit verification code.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch('/auth/verify-2fa', {
        method: 'POST',
        bodyData: { email, code },
      });

      if (response.data?.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        showToast('Successfully signed in!', 'success');
        router.push('/dashboard');
      }
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
          
          <div key={requires2FA ? '2fa' : 'login'} className={styles.fadeScale}>
            {!requires2FA ? (
              <>
                <p className={styles.subtitle}>Sign in to manage your files securely</p>
                <form onSubmit={handleSignIn} className={styles.form}>
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
                  
                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label htmlFor="password" className={styles.label}>Password</label>
                      <Link href="/forgot-password" className={styles.link} style={{ fontSize: '12px' }}>
                        Forgot Password?
                      </Link>
                    </div>
                    <input
                      type="password"
                      id="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={styles.input}
                      required
                    />
                  </div>

                  <button type="submit" disabled={loading} className={styles.button}>
                    {loading ? <div className={styles.spinner}></div> : 'Sign In'}
                  </button>
                </form>
                
                <p className={styles.linkText}>
                  New to BenzDrive?{' '}
                  <Link href="/signup" className={styles.link}>
                    Create an account
                  </Link>
                </p>
              </>
            ) : (
              <>
                <p className={styles.subtitle}>
                  We sent a 6-digit security code to <strong>{email}</strong>. Enter it below to sign in.
                </p>
                <form onSubmit={handle2FAVerify} className={styles.form}>
                  <div className={styles.pinContainer}>
                    {pin.map((digit, index) => (
                      <input
                        key={index}
                        type="text"
                        maxLength={1}
                        value={digit}
                        ref={(el) => { pinRefs.current[index] = el; }}
                        onChange={(e) => handlePinChange(e.target.value, index)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        className={styles.pinInput}
                        autoFocus={index === 0}
                        required
                      />
                    ))}
                  </div>

                  <button type="submit" disabled={loading} className={styles.button}>
                    {loading ? <div className={styles.spinner}></div> : 'Verify & Continue'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setRequires2FA(false)}
                    className={styles.link}
                    style={{ background: 'none', border: 'none', fontSize: '13px', margin: '0 auto', display: 'block' }}
                  >
                    Back to Sign In
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
