'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function JoinPage() {
  const { shareCode } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/contests/join/${shareCode}`);
        router.push(`/contests/${data.contest._id}`);
      } catch {
        setError('Invalid or expired invite link');
        setLoading(false);
      }
    })();
  }, [shareCode, router]);

  if (loading) return <div className="page container"><p>Redirecting to contest...</p></div>;
  return (
    <div className="page container">
      <div className="card" style={{ maxWidth: 400, margin: '40px auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--red)' }}>{error}</p>
      </div>
    </div>
  );
}
