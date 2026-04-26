'use client';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import styles from './Navbar.module.css';

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoIcon}>⚡</span>
          <span>Code<strong>Arena</strong></span>
        </Link>
        <div className={styles.links}>
          <Link href="/contests" className={styles.link}>Contests</Link>
          {!loading && (
            user ? (
              <>
                <Link href="/dashboard" className={styles.link}>Dashboard</Link>
                <span className={styles.user}>@{user.username}</span>
                <button onClick={handleLogout} className="btn btn-sm btn-secondary">Logout</button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="btn btn-sm btn-secondary">Login</Link>
                <Link href="/auth/register" className="btn btn-sm btn-primary">Sign Up</Link>
              </>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
