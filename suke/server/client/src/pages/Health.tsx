import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Health() {
  const [msg, setMsg] = useState('checking...');
  
  useEffect(() => {
    api.get('/health')
      .then(r => setMsg(JSON.stringify(r.data)))
      .catch(e => setMsg(`ERROR: ${e?.message}`));
  }, []);
  
  return (
    <pre style={{ padding: 16, fontSize: 14 }}>
      {msg}
    </pre>
  );
}
