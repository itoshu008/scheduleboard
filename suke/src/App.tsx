import React, { useEffect, useState } from 'react';
import { api, callFirst } from './lib/api';

type Group = { id: number; name: string; color?: string | null };

export default function App(){
  const [health,setHealth]=useState<any>(null);
  const [groups,setGroups]=useState<Group[]|null>(null);
  const [err,setErr]=useState<string|null>(null);
  const [src,setSrc]=useState<string>(''); // which endpoint used

  useEffect(()=>{
    (async ()=>{
      try{
        const h = await api('/health');
        setHealth(h);
      }catch(e:any){ setErr(e.message || String(e)); }
      try{
        // Try admin-based endpoints first, then legacy
        const { source, data } = await callFirst<any>([
          '/admin/groups',
          '/admin/departments',
          '/groups'
        ]);
        setSrc(source);
        // normalize shapes:
        let list: Group[] = [];
        if (data?.groups && Array.isArray(data.groups)) {
          list = data.groups.map((g:any) => ({ id: g.id, name: g.name ?? g.department_name ?? g.title ?? `#${g.id}`, color: g.color ?? null }));
        } else if (data?.departments && Array.isArray(data.departments)) {
          list = data.departments.map((d:any) => ({ id: d.id, name: d.name ?? d.department_name ?? `#${d.id}` }));
        } else if (Array.isArray(data)) {
          list = data.map((x:any, i:number)=>({ id: x.id ?? i+1, name: x.name ?? x.title ?? `#${i+1}` }));
        } else {
          // unknown shape, fallback
          list = [];
        }
        setGroups(list);
      }catch(e:any){ setErr(prev => prev ?? (e.message || String(e))); }
    })();
  },[]);

  return (
    <div style={{fontFamily:'system-ui, sans-serif', margin:24, lineHeight:1.5}}>
      <h1 style={{margin:'0 0 12px'}}>ScheduleBoard</h1>

      <section style={{padding:12, border:'1px solid #e5e7eb', borderRadius:8, marginBottom:16, background:'#f9fafb'}}>
        <strong>Status:</strong>{' '}
        {health ? <code>{JSON.stringify(health)}</code> : 'loading...'}
        {src && <span style={{marginLeft:8, fontSize:12, color:'#6b7280'}}>groups from <code>/api{src}</code></span>}
        {err && (<div style={{color:'#b91c1c', marginTop:8}}>Error: {err}</div>)}
      </section>

      <section>
        <h2 style={{margin:'0 0 8px'}}>Groups</h2>
        {!groups && !err && <div>loading...</div>}
        {groups && groups.length>0 && (
          <ul style={{paddingLeft:16}}>
            {groups.map(g => <li key={g.id}>{g.id}: {g.name}</li>)}
          </ul>
        )}
        {groups && groups.length===0 && <div style={{color:'#6b7280'}}>データがありません</div>}
      </section>
    </div>
  );
}
