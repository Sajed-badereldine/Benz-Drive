'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/Toast';
import styles from '@/app/auth.module.css';
import Link from 'next/link';
import { Cloud, Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // Login form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // 2FA state management
  const [requires2FA, setRequires2FA] = useState(false);
  const [pin, setPin] = useState<string[]>(Array(6).fill(''));
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);

  // Redirect to dashboard if already logged in via HttpOnly cookie
  useEffect(() => {
    localStorage.removeItem('token');
    apiFetch('/auth/me')
      .then((user) => {
        if (user && user.id) {
          localStorage.setItem('user', JSON.stringify(user));
          router.push('/dashboard');
        }
      })
      .catch(() => {
        // Not authenticated, stay on login page
      });
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
      } else if (response.data?.user) {
        if (response.data.token) {
          localStorage.setItem('token', response.data.token);
        }
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

      if (response.data?.user) {
        if (response.data.token) {
          localStorage.setItem('token', response.data.token);
        }
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
          {/* Brand Header */}
          <div style={{ textAlign: 'center' }}>
            <div className={styles.logoIconContainer}>
              <Cloud size={32} style={{ color: 'var(--primary-container, #0070f3)' }} />
            </div>
            <h1 className={styles.title} style={{ marginBottom: '4px' }}>BenzDrive</h1>
            <p className={styles.subtitle} style={{ margin: 0 }}>
              {requires2FA ? 'Two-Factor Authentication' : 'Welcome Back'}
            </p>
          </div>
          
          <div key={requires2FA ? '2fa' : 'login'} className={styles.fadeScale}>
            {!requires2FA ? (
              <>
                <form onSubmit={handleSignIn} className={styles.form}>
                  {/* Email Field */}
                  <div className={styles.formGroup}>
                    <label htmlFor="email" className={styles.label}>Email Address</label>
                    <div className={styles.inputWrapper}>
                      <Mail size={18} className={styles.inputIcon} />
                      <input
                        type="email"
                        id="email"
                        placeholder="name@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`${styles.input} ${styles.inputWithIcon}`}
                        required
                      />
                    </div>
                  </div>
                  
                  {/* Password Field */}
                  <div className={styles.formGroup}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label htmlFor="password" className={styles.label}>Password</label>
                      <Link href="/forgot-password" className={styles.link} style={{ fontSize: '12px' }}>
                        Forgot password?
                      </Link>
                    </div>
                    <div className={styles.inputWrapper}>
                      <Lock size={18} className={styles.inputIcon} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${styles.input} ${styles.inputWithIcon}`}
                        style={{ paddingRight: '42px' }}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className={styles.togglePasswordBtn}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button type="submit" disabled={loading} className={styles.button}>
                    {loading ? <div className={styles.spinner}></div> : 'Sign In'}
                  </button>
                </form>
                
                <p className={styles.linkText} style={{ marginTop: '16px' }}>
                  Don&apos;t have an account?{' '}
                  <Link href="/signup" className={styles.link} style={{ fontWeight: 700 }}>
                    Sign up
                  </Link>
                </p>
              </>
            ) : (
              <>
                <p className={styles.subtitle} style={{ fontSize: '13px', lineHeight: '1.5' }}>
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
