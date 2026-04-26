'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';

interface Entry { rank: number; userId: string; username: string; totalScore: number; problemsSolved: number; lastSubmission: string; isFlagged: boolean; }

export default function LeaderboardPage() {
  const { id } = useParams();
  const [leaderboard, setLeaderboard] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [contestTitle, setContestTitle] = useState('');

  const getToken = () => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/token=([^;]+)/);
    return match ? match[1] : null;
  };
  const { on, isConnected } = useSocket(getToken());

  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data } = await api.get(`/contests/${id}/leaderboard`);
      setLeaderboard(data.leaderboard || []);
    } catch { /* */ }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchLeaderboard();
    api.get(`/contests/${id}`).then(({ data }) => setContestTitle(data.contest.title)).catch(() => {});
  }, [id, fetchLeaderboard]);

  // Refresh on WS leaderboard-update event
  useEffect(() => {
    const unsub = on('leaderboard-update', () => { fetchLeaderboard(); });
    return unsub;
  }, [on, fetchLeaderboard]);

  // Also poll every 15s as fallback
  useEffect(() => {
    const interval = setInterval(fetchLeaderboard, 15000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  return (
    <div className="page container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Link href={`/contests/${id}`} style={{ fontSize: '0.85rem' }}>← Back to contest</Link>
          <h1 style={{ fontSize: '1.4rem', marginTop: 4 }}>Standings{contestTitle ? ` — ${contestTitle}` : ''}</h1>
        </div>
        <span style={{ fontSize: '0.8rem', color: isConnected ? 'var(--green)' : 'var(--text-muted)' }}>
          {isConnected ? '● Live' : '○ Polling'}
        </span>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : leaderboard.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No submissions yet
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr><th>#</th><th>Who</th><th>Score</th><th>Solved</th><th>Last Submission</th><th>Status</th></tr>
            </thead>
            <tbody>
              {leaderboard.map(e => (
                <tr key={e.userId} style={{ background: e.isFlagged ? '#fff8f8' : undefined }}>
                  <td style={{ fontWeight: 700, color: e.rank <= 3 ? 'var(--blue)' : 'var(--text)' }}>{e.rank}</td>
                  <td><strong>{e.username}</strong></td>
                  <td style={{ fontWeight: 600 }}>{e.totalScore}</td>
                  <td>{e.problemsSolved}</td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{e.lastSubmission ? new Date(e.lastSubmission).toLocaleTimeString() : '-'}</td>
                  <td>{e.isFlagged ? <span className="badge badge-flagged">⚑ Flagged</span> : <span style={{ color: 'var(--green)' }}>✓</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
