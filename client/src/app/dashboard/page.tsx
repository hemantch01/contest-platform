'use client';
import { useAuth } from '@/context/AuthContext';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

interface Contest { _id: string; title: string; description: string; startTime: string; duration: number; visibility: string; status: string; shareCode: string; registeredUsers?: string[]; }

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [created, setCreated] = useState<Contest[]>([]);
  const [registered, setRegistered] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await api.get('/contests/my');
        setCreated(data.created || []);
        setRegistered(data.registered || []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [user]);

  if (authLoading || !user) return null;

  const statusBadge = (s: string) => {
    if (s === 'live') return <span className="badge badge-live">● LIVE</span>;
    if (s === 'upcoming') return <span className="badge badge-upcoming">Upcoming</span>;
    return <span className="badge badge-ended">Ended</span>;
  };

  const formatDate = (d: string) => new Date(d).toLocaleString();

  const ContestRow = ({ c, showAdmin }: { c: Contest; showAdmin?: boolean }) => (
    <div className="card" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Link href={`/contests/${c._id}`} style={{ fontWeight: 600, fontSize: '1.05rem' }}>{c.title}</Link>
          {statusBadge(c.status)}
          <span className={`badge ${c.visibility === 'public' ? 'badge-public' : 'badge-private'}`}>{c.visibility}</span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(c.startTime)} · {c.duration} min</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {c.status === 'live' && <Link href={`/contests/${c._id}/arena`} className="btn btn-sm btn-primary">Enter Arena</Link>}
        {showAdmin && <Link href={`/admin/${c._id}`} className="btn btn-sm btn-secondary">Admin Panel</Link>}
        <Link href={`/contests/${c._id}/leaderboard`} className="btn btn-sm btn-secondary">Leaderboard</Link>
      </div>
    </div>
  );

  return (
    <div className="page container animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.8rem' }}>Dashboard</h1>
        <Link href="/contests/create" className="btn btn-primary">+ Create Contest</Link>
      </div>

      <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: 16 }}>My Contests</h2>
      {loading ? <div className="skeleton" style={{ height: 80, marginBottom: 12 }} /> : 
        created.length ? created.map(c => <ContestRow key={c._id} c={c} showAdmin />) :
        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>No contests created yet</p>
      }

      <h2 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: 16, marginTop: 32 }}>Registered Contests</h2>
      {loading ? <div className="skeleton" style={{ height: 80 }} /> :
        registered.length ? registered.map(c => <ContestRow key={c._id} c={c} />) :
        <p style={{ color: 'var(--text-muted)' }}>Not registered for any contest yet. <Link href="/contests">Browse contests</Link></p>
      }
    </div>
  );
}
