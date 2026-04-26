'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface Problem { title: string; description: string; points: number; difficulty: string; }

export default function CreateContestPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [allowedEmails, setAllowedEmails] = useState('');
  const [problems, setProblems] = useState<Problem[]>([{ title: '', description: '', points: 100, difficulty: 'medium' }]);

  const addProblem = () => setProblems([...problems, { title: '', description: '', points: 100, difficulty: 'medium' }]);
  const removeProblem = (i: number) => setProblems(problems.filter((_, idx) => idx !== i));
  const updateProblem = (i: number, field: string, value: string | number) => {
    const updated = [...problems];
    (updated[i] as unknown as Record<string, string | number>)[field] = value;
    setProblems(updated);
  };

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    try {
      // Convert the local datetime string into a precise UTC ISO string
      const isoStartTime = new Date(startTime).toISOString();
      const body = {
        title, description, visibility, startTime: isoStartTime, duration,
        problems,
        allowedEmails: allowedEmails ? allowedEmails.split(',').map(e => e.trim()) : [],
      };
      const { data } = await api.post('/contests', body);
      router.push(`/contests/${data.contest._id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create contest';
      setError(msg);
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="page container animate-fade" style={{ maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>Create Contest</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Step {step} of 3</p>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--bg-secondary)', borderRadius: 2, marginBottom: 32 }}>
        <div style={{ height: '100%', width: `${(step / 3) * 100}%`, background: 'var(--gradient-primary)', borderRadius: 2, transition: 'width 300ms' }} />
      </div>

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: 'var(--accent-red)', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>}

      {step === 1 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: '1.1rem' }}>Contest Details</h2>
          <div className="input-group"><label>Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekly Coding Challenge #1" /></div>
          <div className="input-group"><label>Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your contest..." /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="input-group"><label>Start Time</label><input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
            <div className="input-group"><label>Duration (minutes)</label><input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={5} max={600} /></div>
          </div>
          <div className="input-group">
            <label>Visibility</label>
            <select value={visibility} onChange={e => setVisibility(e.target.value)}>
              <option value="public">Public — anyone can join</option>
              <option value="private">Private — invite only</option>
            </select>
          </div>
          {visibility === 'private' && (
            <div className="input-group"><label>Allowed Emails (comma-separated)</label><textarea value={allowedEmails} onChange={e => setAllowedEmails(e.target.value)} placeholder="user1@email.com, user2@email.com" /></div>
          )}
          <button className="btn btn-primary" onClick={() => setStep(2)}>Next → Add Problems</button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: '1.1rem' }}>Problems ({problems.length})</h2>
          {problems.map((p, i) => (
            <div key={i} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>Problem {i + 1}</span>
                {problems.length > 1 && <button className="btn btn-sm btn-danger" onClick={() => removeProblem(i)}>Remove</button>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="input-group"><label>Title</label><input type="text" value={p.title} onChange={e => updateProblem(i, 'title', e.target.value)} placeholder="Two Sum" /></div>
                <div className="input-group"><label>Description</label><textarea value={p.description} onChange={e => updateProblem(i, 'description', e.target.value)} placeholder="Given an array of integers..." /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="input-group"><label>Points</label><input type="number" value={p.points} onChange={e => updateProblem(i, 'points', Number(e.target.value))} min={1} /></div>
                  <div className="input-group">
                    <label>Difficulty</label>
                    <select value={p.difficulty} onChange={e => updateProblem(i, 'difficulty', e.target.value)}>
                      <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button className="btn btn-secondary" onClick={addProblem}>+ Add Problem</button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)}>Next → Review</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: '1.1rem' }}>Review & Create</h2>
          <div style={{ display: 'grid', gap: 8, fontSize: '0.9rem' }}>
            <div><strong>Title:</strong> {title}</div>
            <div><strong>Visibility:</strong> <span className={`badge ${visibility === 'public' ? 'badge-public' : 'badge-private'}`}>{visibility}</span></div>
            <div><strong>Start:</strong> {startTime ? new Date(startTime).toLocaleString() : 'Not set'}</div>
            <div><strong>Duration:</strong> {duration} minutes</div>
            <div><strong>Problems:</strong> {problems.length}</div>
            <div><strong>Total Points:</strong> {problems.reduce((s, p) => s + p.points, 0)}</div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={handleSubmit} disabled={loading}>
              {loading ? 'Creating...' : '🚀 Create Contest'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
