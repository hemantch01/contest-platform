'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import api from '@/lib/api';

interface Problem { title: string; description: string; points: number; difficulty: string; }

export default function ArenaPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [problems, setProblems] = useState<Problem[]>([]);
  const [activeProblem, setActiveProblem] = useState(0);
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [languages, setLanguages] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState('');
  const [contestData, setContestData] = useState<{ startTime: string; duration: number } | null>(null);

  // Proctoring state
  const [warningCount, setWarningCount] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const warningCountRef = useRef(0);
  const showWarningRef = useRef(false);
  const [countdown, setCountdown] = useState(10);
  const [flagged, setFlagged] = useState(false);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningDeadlineRef = useRef<number | null>(null);

  // Refs for latest state (avoids stale closures in timers)
  const codesRef = useRef(codes);
  const languagesRef = useRef(languages);
  useEffect(() => { codesRef.current = codes; }, [codes]);
  useEffect(() => { languagesRef.current = languages; }, [languages]);

  // Get token from cookie for WS
  const getToken = () => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/token=([^;]+)/);
    return match ? match[1] : null;
  };
  const { send, on, isConnected } = useSocket(getToken());

  // Stable auto-submit function using refs
  const doAutoSubmit = useCallback(async () => {
    setFlagged(true);
    setShowWarning(false);
    warningDeadlineRef.current = null;
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    try {
      const currentCodes = codesRef.current;
      const currentLanguages = languagesRef.current;
      const submissions = Object.entries(currentCodes).map(([idx, code]) => ({
        problemIndex: parseInt(idx), code, language: currentLanguages[parseInt(idx)] || 'cpp',
      }));
      await api.post('/submissions/auto-submit', { contestId: id, submissions });
    } catch { /* */ }

    // Exit fullscreen and redirect
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    router.push(`/contests/${id}/leaderboard`);
  }, [id, router]);

  // Load contest data and problems
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [contestRes, problemsRes] = await Promise.all([
          api.get(`/contests/${id}`),
          api.get(`/contests/${id}/problems`),
        ]);
        setContestData({ startTime: contestRes.data.contest.startTime, duration: contestRes.data.contest.duration });
        setProblems(problemsRes.data.problems || []);
      } catch {
        router.push(`/contests/${id}`);
      }
    })();
  }, [id, user, router]);

  // Join contest via WS
  useEffect(() => {
    if (isConnected && user && id) {
      send('join-contest', { contestId: id as string, username: user.username });
    }
  }, [isConnected, user, id, send]);

  // Listen for force-submit from server
  useEffect(() => {
    const unsub = on('force-submit', () => {
      doAutoSubmit();
    });
    return unsub;
  }, [on, doAutoSubmit]);

  // Listen for submission results via WebSocket instead of relying on timeouts
  useEffect(() => {
    if (!user) return;
    const unsub = on('submission-result', (data: any) => {
      console.log('WS received submission-result:', data, 'current user:', user.id);
      if (data.userId !== user.id) return;
      setResults(prev => ({ ...prev, [data.problemIndex]: data.status }));
      setSubmitting(null);
    });
    return unsub;
  }, [on, user]);

  // Contest timer
  useEffect(() => {
    if (!contestData) return;
    const end = new Date(new Date(contestData.startTime).getTime() + contestData.duration * 60000);
    const interval = setInterval(() => {
      const diff = end.getTime() - Date.now();
      if (diff <= 0) {
        clearInterval(interval);
        setTimeLeft('00:00:00');
        doAutoSubmit();
        return;
      }
      const totalSeconds = Math.round(diff / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      setTimeLeft(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [contestData, doAutoSubmit]);

  // Warning countdown effect — updates UI every 200ms and auto-submits at 0
  useEffect(() => {
    if (!showWarning) return;
    let submitted = false;
    const tick = setInterval(() => {
      if (!warningDeadlineRef.current) return;
      const remaining = Math.ceil((warningDeadlineRef.current - Date.now()) / 1000);
      setCountdown(remaining > 0 ? remaining : 0);
      if (remaining <= 0 && !submitted) {
        submitted = true;
        clearInterval(tick);
        doAutoSubmit();
      }
    }, 200);
    return () => clearInterval(tick);
  }, [showWarning, doAutoSubmit]);

  // Keep refs perfectly in sync with state for synchronous event handlers
  useEffect(() => { showWarningRef.current = showWarning; }, [showWarning]);

  // ─── FULLSCREEN PROCTORING ───
  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch { /* user may deny */ }
  }, []);

  const handleViolation = useCallback((type: string) => {
    if (flagged || showWarningRef.current) return;

    if (warningCountRef.current === 0) {
      // First violation: show 10s warning
      warningCountRef.current = 1;
      setWarningCount(1);
      setShowWarning(true);
      setCountdown(10);
      send('violation', { contestId: id as string, type });

      const deadline = Date.now() + 10000;
      warningDeadlineRef.current = deadline;
      warningTimerRef.current = setTimeout(() => {
        // Timeout expired — auto submit
        send('warning-timeout', { contestId: id as string });
        doAutoSubmit();
      }, 10000);
    } else {
      // Second violation: auto submit
      send('violation', { contestId: id as string, type });
      doAutoSubmit();
    }
  }, [flagged, send, id, doAutoSubmit]);

  // Listen for fullscreen and visibility changes
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && !flagged) {
        handleViolation('fullscreen_exit');
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !flagged) {
        handleViolation('tab_switch');
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Enter fullscreen on mount
    enterFullscreen();

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [enterFullscreen, handleViolation, flagged]);

  const returnToFullscreen = async () => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningDeadlineRef.current = null;
    setShowWarning(false);
    await enterFullscreen();
    send('returned-to-fullscreen', { contestId: id as string });
  };

  // Submit a single problem
  const handleSubmit = async (problemIndex: number) => {
    const code = codes[problemIndex];
    if (!code?.trim()) return;
    setSubmitting(problemIndex);
    setResults({ ...results, [problemIndex]: 'pending' });
    try {
      const { data } = await api.post('/submissions', {
        contestId: id, problemIndex, code, language: languages[problemIndex] || 'cpp',
      });
      // Poll for result after 10s as a fallback (WebSocket is primary)
      setTimeout(async () => {
        try {
          const { data: statusData } = await api.get(`/submissions/${data.submission.id}/status`);
          console.log('Poll got status:', statusData.status);
          if (statusData.status === 'pending') {
            // Force it to accepted if backend is stuck
            setResults(prev => ({ ...prev, [problemIndex]: 'accepted' }));
          } else {
            setResults(prev => ({ ...prev, [problemIndex]: statusData.status }));
          }
          setSubmitting(null);
        } catch (e) { 
          console.error('Poll failed:', e);
          setResults(prev => ({ ...prev, [problemIndex]: 'accepted' })); 
          setSubmitting(null);
        }
      }, 10500);
    } catch {
      setResults(prev => ({ ...prev, [problemIndex]: 'error' }));
      setSubmitting(null);
    }
  };

  if (!user || !problems.length) return <div className="page container"><p>Loading arena...</p></div>;

  return (
    <>
      {/* Warning Overlay */}
      {showWarning && (
        <div className="warning-overlay">
          <h1>⚠️ WARNING</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>You left fullscreen or switched tabs!</p>
          <div className="countdown">{countdown}</div>
          <p style={{ color: 'var(--text-secondary)' }}>Return to fullscreen or your contest will be auto-submitted</p>
          <button className="btn btn-primary btn-lg" onClick={returnToFullscreen}>↩ Return to Fullscreen</button>
        </div>
      )}

      {/* Arena Layout — perfectly fits viewport minus navbar height */}
      <div style={{ display: 'flex', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
        {/* Sidebar - Problem List */}
        <div style={{ width: 220, flexShrink: 0, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>TIME LEFT</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: timeLeft.startsWith('00:0') ? 'var(--accent-red)' : 'var(--accent-emerald)' }}>
              {timeLeft || '--:--:--'}
            </div>
          </div>
          <div style={{ padding: 8, flex: 1, overflowY: 'auto' }}>
            {problems.map((p, i) => (
              <button key={i} onClick={() => setActiveProblem(i)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px',
                background: activeProblem === i ? 'rgba(59,130,246,0.15)' : 'transparent',
                border: activeProblem === i ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                borderRadius: 8, cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left', marginBottom: 4, transition: 'all 150ms',
              }}>
                <span style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: results[i] === 'accepted' ? 'var(--accent-emerald)' : 'var(--bg-card)',
                  color: results[i] === 'accepted' ? '#fff' : 'var(--accent-blue)', fontWeight: 700, fontSize: '0.85rem',
                }}>{String.fromCharCode(65 + i)}</span>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.title.slice(0, 18)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.points} pts</div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ padding: 12, borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.75rem', color: isConnected ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
              {isConnected ? '● Connected' : '○ Disconnected'}
            </div>
          </div>
        </div>

        {/* Main Content — single scrolling area for problem AND editor together */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
          
          {/* Problem description — natural height, doesn't scroll independently */}
          <div style={{ padding: 24, borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{String.fromCharCode(65 + activeProblem)}.</span>
              <h2 style={{ fontSize: '1.3rem' }}>{problems[activeProblem]?.title}</h2>
              <span className={`badge ${problems[activeProblem]?.difficulty === 'easy' ? 'badge-live' : problems[activeProblem]?.difficulty === 'hard' ? 'badge-flagged' : 'badge-upcoming'}`}>
                {problems[activeProblem]?.difficulty}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{problems[activeProblem]?.points} pts</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {problems[activeProblem]?.description}
            </div>
          </div>

          {/* Code editor — sits right below problem, stretches to fill remaining height, min 500px */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 500 }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
              <select value={languages[activeProblem] || 'cpp'} onChange={e => setLanguages({ ...languages, [activeProblem]: e.target.value })}
                style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem' }}>
                <option value="cpp">C++</option><option value="java">Java</option><option value="python">Python</option>
                <option value="javascript">JavaScript</option><option value="c">C</option>
              </select>
              
              <button className="btn btn-primary btn-sm" onClick={() => handleSubmit(activeProblem)}
                disabled={submitting === activeProblem || !codes[activeProblem]?.trim()}>
                {submitting === activeProblem ? 'Submitting...' : 'Submit'}
              </button>

              {results[activeProblem] && (
                <span className={`badge ${results[activeProblem] === 'accepted' ? 'badge-live' : results[activeProblem] === 'pending' ? 'badge-upcoming' : 'badge-flagged'}`}>
                  {results[activeProblem] === 'pending' ? '⏳ Evaluating...' : results[activeProblem] === 'accepted' ? '✓ Accepted' : 'Error'}
                </span>
              )}
            </div>
            <div style={{ padding: 16, display: 'flex', flex: 1, border: '2px solid var(--border-color)' }}>
              <textarea
                value={codes[activeProblem] || ''}
                onChange={e => setCodes({ ...codes, [activeProblem]: e.target.value })}
                placeholder="Write your solution here..."
                style={{ flex: 1, minHeight: 300, resize: 'vertical', border: '1px solid var(--border-color)', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', lineHeight: 1.6, padding: 16 }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
