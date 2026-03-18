'use client';

import dynamic from 'next/dynamic';

const NexusEditorApp = dynamic(() => import('../src/App'), {
  ssr: false,
  loading: () => <div style={{minHeight: '100vh', background: '#16181d'}} />,
});

export default function Page() {
  return <NexusEditorApp />;
}
