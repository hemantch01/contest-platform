'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface Contest { _id: string; title: string; description: string; startTime: string; duration: number; visibility: string; status: string; shareCode: string; creator?: { username: string }; registeredUsers?: string[]; }

export default function ContestListPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const params = filter ? `?status=${filter}` : '';
        const { data } = await api.get(`/contests${params}`);
        setContests(data.contests || []);
      } catch { /* */ }
      setLoading(false);
    })();
  }, [filter]);

  const statusBadge = (s: string) => {
    if (s === 'live') return <span className="badge badge-live">● LIVE</span>;
    if (s === 'upcoming') return <span className="badge badge-upcoming">Upcoming</span>;
    return <span className="badge badge-ended">Ended</span>;
  };

  return (
    <div className="page container animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: '1.8rem' }}>Contests</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {['', 'upcoming', 'live', 'ended'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setLoading(true); }}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}>
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 16 }} />)}
        </div>
      ) : contests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.1rem' }}>No contests found</p>
          <Link href="/contests/create" className="btn btn-primary" style={{ marginTop: 16 }}>Create One</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {contests.map(c => (
            <Link key={c._id} href={`/contests/${c._id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{c.title}</span>
                      {statusBadge(c.status)}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 8 }}>{c.description.slice(0, 120)}{c.description.length > 120 ? '...' : ''}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      by {c.creator?.username || 'Unknown'} · {new Date(c.startTime).toLocaleString()} · {c.duration} min
                    </p>
                  </div>
                  <span className="btn btn-sm btn-secondary">View →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
