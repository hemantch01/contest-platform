import Link from 'next/link';

export default function Home() {
  return (
    <div className="page container">
      <div style={{ textAlign: 'center', padding: '40px 0 30px' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>CodeArena</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          Create and participate in competitive coding contests with real-time leaderboards and proctoring.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link href="/contests/create" className="btn btn-primary">Create a Contest</Link>
          <Link href="/contests" className="btn">Browse Contests</Link>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          { icon: '🔒', title: 'Full-Screen Proctoring', desc: 'Tab switch detection with auto-submit on violation' },
          { icon: '📊', title: 'Live Leaderboard', desc: 'Real-time rankings updated on every submission' },
          { icon: '👁️', title: 'Admin Monitoring', desc: 'Watch participant activity live during contests' },
          { icon: '🔗', title: 'Share & Compete', desc: 'Public or private contests with shareable invite links' },
        ].map(f => (
          <div key={f.title} className="card">
            <div style={{ marginBottom: 8, fontSize: '1.3rem' }}>{f.icon}</div>
            <strong>{f.title}</strong>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
