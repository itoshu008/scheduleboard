import React, { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false }));
    fetch('/api/groups').then(r => r.json()).then(d => setGroups(d.groups ?? [])).catch(() => {});
  }, []);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', margin: 24 }}>
      <h1>ScheduleBoard 起動OK 🎉</h1>
      <p>これは最小MVP。まずは画面が出ることを優先しています。</p>
      <pre style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        {JSON.stringify(health ?? { loading: true }, null, 2)}
      </pre>
      <h2>Groups</h2>
      <ul>
        {groups.map(g => <li key={g.id}>{g.id}: {g.name}</li>)}
      </ul>
      <p>開発中は <code>/api</code> が <code>localhost:3000</code> にプロキシされます。</p>
    </div>
  );
}
