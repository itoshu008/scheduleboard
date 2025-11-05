import React from 'react';

type S = { hasError: boolean; error?: any };
export class ErrorBoundary extends React.Component<React.PropsWithChildren, S> {
  constructor(props: any){ super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error: any){ return { hasError: true, error }; }
  componentDidCatch(error: any, info: any){ console.error('[ErrorBoundary]', error, info); }
  render(){
    if (this.state.hasError){
      return (
        <div style={{padding:16, background:'#fff3cd', border:'1px solid #ffeeba', borderRadius:8, margin:16}}>
          <strong>画面の表示で問題が発生しました。</strong>
          <pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

