'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import api from '@/lib/api';

interface Contest { _id: string; title: string; description: string; startTime: string; duration: number; visibility: string; shareCode: string; problems: { title: string; points: number; difficulty: string }[]; creator: { _id: string; username: string }; registeredUsers: { _id: string; username: string }[]; }

export default function ContestDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();
  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get(`/contests/${id}`); setContest(data.contest); }
      catch { /* */ }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="page container"><div className="skeleton" style={{ height: 200, borderRadius: 16 }} /></div>;
  if (!contest) return <div className="page container"><h1>Contest not found</h1></div>;

  const now = new Date();
  const start = new Date(contest.startTime);
  const end = new Date(start.getTime() + contest.duration * 60000);
  const status = now < start ? 'upcoming' : now <= end ? 'live' : 'ended';
  const isRegistered = user && contest.registeredUsers.some(u => u._id === user.id);
  const isCreator = user && contest.creator._id === user.id;
  const totalPoints = contest.problems.reduce((s, p) => s + p.points, 0);

  const handleRegister = async () => {
    if (!user) { router.push('/auth/login'); return; }
    setRegistering(true);
    try { await api.post(`/contests/${id}/register`); window.location.reload(); }
    catch (err: unknown) { alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed'); }
    setRegistering(false);
  };

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/contests/join/${contest.shareCode}`;
  const copyLink = () => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="page container animate-fade" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>{contest.title}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className={`badge ${status === 'live' ? 'badge-live' : status === 'upcoming' ? 'badge-upcoming' : 'badge-ended'}`}>{status === 'live' ? '● LIVE' : status.toUpperCase()}</span>
              <span className={`badge ${contest.visibility === 'public' ? 'badge-public' : 'badge-private'}`}>{contest.visibility}</span>
            </div>
          </div>
          {status === 'live' && (isRegistered || isCreator) && (
            <Link href={`/contests/${id}/arena`} className="btn btn-primary btn-lg">⚡ Enter Arena</Link>
          )}
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.7 }}>{contest.description}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>CREATED BY</span><br/><strong>{contest.creator.username}</strong></div>
          <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>START TIME</span><br/><strong>{start.toLocaleString()}</strong></div>
          <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>DURATION</span><br/><strong>{contest.duration} min</strong></div>
          <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>PARTICIPANTS</span><br/><strong>{contest.registeredUsers.length}</strong></div>
          <div><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>TOTAL POINTS</span><br/><strong>{totalPoints}</strong></div>
        </div>

        {/* Share link */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <input type="text" readOnly value={shareUrl} style={{ flex: 1, fontSize: '0.85rem' }} />
          <button className="btn btn-sm btn-secondary" onClick={copyLink}>{copied ? '✓ Copied' : 'Copy Link'}</button>
        </div>

        {/* Registration */}
        {!isCreator && !isRegistered && status !== 'ended' && (
          <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleRegister} disabled={registering}>
            {registering ? 'Registering...' : '📝 Register for Contest'}
          </button>
        )}
        {isRegistered && <p style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>✓ You are registered</p>}
      </div>

      {/* Problems preview */}
      <div className="card">
        <h2 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Problems ({contest.problems.length})</h2>
        <div className="table-container">
          <table>
            <thead><tr><th>#</th><th>Title</th><th>Difficulty</th><th>Points</th></tr></thead>
            <tbody>
              {contest.problems.map((p, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{String.fromCharCode(65 + i)}</td>
                  <td>{p.title}</td>
                  <td><span className={`badge ${p.difficulty === 'easy' ? 'badge-live' : p.difficulty === 'hard' ? 'badge-flagged' : 'badge-upcoming'}`}>{p.difficulty}</span></td>
                  <td>{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <Link href={`/contests/${id}/leaderboard`} className="btn btn-secondary" style={{ flex: 1 }}>📊 Leaderboard</Link>
        {isCreator && <Link href={`/admin/${id}`} className="btn btn-secondary" style={{ flex: 1 }}>👁️ Admin Panel</Link>}
      </div>
    </div>
  );
}
