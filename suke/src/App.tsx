import React, { useEffect, useState } from 'react';
import { api } from './lib/api';

export default function App(){
  const [health,setHealth]=useState<any>(null);
  const [groups,setGroups]=useState<any[]|null>(null);
  const [err,setErr]=useState<string|null>(null);

  useEffect(()=>{
    (async ()=>{
      try{
        const h = await api('/health');
        setHealth(h);
      }catch(e:any){ setErr(e.message || String(e)); }
      try{
        const g = await api('/groups');
        setGroups(g?.groups ?? []);
      }catch(e:any){ setErr(prev => prev ?? (e.message || String(e))); }
    })();
  },[]);

    return (
    <div style={{fontFamily:'system-ui, sans-serif', margin:24}}>
      <div style={{padding:8, border:'1px solid #e5e7eb', borderRadius:8, marginBottom:16, background:'#f9fafb'}}>
        <strong>Status:</strong>{' '}
        {health ? <code>{JSON.stringify(health)}</code> : 'loading...'}
        {err && (<div style={{color:'#b91c1c', marginTop:8}}>Error: {err}</div>)}
      </div>
      <h1>ScheduleBoard</h1>
      <h2>Groups</h2>
      {!groups && !err && <div>loading...</div>}
      {groups && <ul>{groups.map(g => <li key={g.id}>{g.id}: {g.name}</li>)}</ul>}
      </div>
    );
  }
