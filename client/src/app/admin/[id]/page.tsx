'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import Link from 'next/link';
import api from '@/lib/api';

interface Activity { _id: string; eventType: string; details: string; timestamp: string; user: { username: string }; }
interface Participant { user: { id: string; username: string; email: string }; isFlagged: boolean; submissions: number; accepted: number; score: number; }

export default function AdminPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'activity' | 'participants'>('activity');

  const getToken = () => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/token=([^;]+)/);
    return match ? match[1] : null;
  };
  const { send, on, isConnected } = useSocket(getToken());

  const fetchData = useCallback(async () => {
    try {
      const [actRes, partRes] = await Promise.all([
        api.get(`/admin/contests/${id}/activity`),
        api.get(`/admin/contests/${id}/participants`),
      ]);
      setActivities(actRes.data.activities || []);
      setParticipants(partRes.data.participants || []);
    } catch { /* */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Join admin WS room
  useEffect(() => {
    if (isConnected && id) {
      send('join-admin', { contestId: id as string });
    }
  }, [isConnected, id, send]);

  // Listen for live activity
  useEffect(() => {
    const unsub = on('activity-update', (data) => {
      const entry = data as unknown as { eventType: string; user: string; details: string; timestamp: string };
      setActivities(prev => [{
        _id: Date.now().toString(),
        eventType: entry.eventType,
        details: entry.details,
        timestamp: entry.timestamp,
        user: { username: entry.user },
      }, ...prev]);
    });
    return unsub;
  }, [on]);

  // Poll every 10s
  useEffect(() => {
    const i = setInterval(fetchData, 10000);
    return () => clearInterval(i);
  }, [fetchData]);

  const eventColor = (t: string) => {
    if (['flagged', 'auto_submitted'].includes(t)) return 'var(--red)';
    if (['warning_issued', 'tab_switch', 'fullscreen_exit'].includes(t)) return 'var(--amber)';
    if (['joined', 'submission'].includes(t)) return 'var(--green)';
    return 'var(--text-muted)';
  };

  if (!user) return null;

  return (
    <div className="page container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Link href={`/contests/${id}`} style={{ fontSize: '0.85rem' }}>← Back to contest</Link>
          <h1 style={{ fontSize: '1.4rem', marginTop: 4 }}>Admin Panel</h1>
        </div>
        <span style={{ fontSize: '0.8rem', color: isConnected ? 'var(--green)' : 'var(--text-muted)' }}>
          {isConnected ? '● Live' : '○ Polling'}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'activity' ? 'btn-primary' : ''}`} onClick={() => setTab('activity')}>Activity Feed</button>
        <button className={`btn btn-sm ${tab === 'participants' ? 'btn-primary' : ''}`} onClick={() => setTab('participants')}>Participants ({participants.length})</button>
      </div>

      {loading ? <div className="skeleton" style={{ height: 200 }} /> : tab === 'activity' ? (
        <div className="card" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {activities.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No activity yet</p>
          ) : activities.map(a => (
            <div key={a._id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 70, fontFamily: 'var(--mono)' }}>
                {new Date(a.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ fontWeight: 600, minWidth: 100 }}>{a.user?.username || '?'}</span>
              <span style={{ color: eventColor(a.eventType), fontWeight: 600, fontSize: '0.85rem', minWidth: 120 }}>
                {a.eventType.replace(/_/g, ' ').toUpperCase()}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{a.details}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Score</th><th>Submissions</th><th>Accepted</th><th>Status</th></tr></thead>
            <tbody>
              {participants.map(p => (
                <tr key={p.user.id} style={{ background: p.isFlagged ? '#fff8f8' : undefined }}>
                  <td><strong>{p.user.username}</strong></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.user.email}</td>
                  <td style={{ fontWeight: 600 }}>{p.score}</td>
                  <td>{p.submissions}</td>
                  <td>{p.accepted}</td>
                  <td>{p.isFlagged ? <span className="badge badge-flagged">⚑ Flagged</span> : <span style={{ color: 'var(--green)' }}>Active</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
