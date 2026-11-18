import { useEffect, useState } from 'react';
import { AppProvider, useApp } from '@/lib/appState.tsx';
import { Today } from '@/screens/Today.tsx';
import { Phrases } from '@/screens/Phrases.tsx';
import { Me } from '@/screens/Me.tsx';
import { FirstRun } from '@/screens/FirstRun.tsx';
import { Practice, type Plan } from '@/screens/Practice.tsx';
import { Icon } from '@/components/Icon.tsx';
import { ToastHost } from '@/components/Toast.tsx';
import { EPISODES } from '@/content/season1.ts';
import { listenInstallPrompt } from '@/lib/install.ts';

type Tab = 'today' | 'phrases' | 'me';

function Shell() {
  const { ready, settings, update } = useApp();
  const [tab, setTab] = useState<Tab>('today');
  const [run, setRun] = useState<{ id: string; plan: Plan } | null>(null);

  useEffect(() => { listenInstallPrompt(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  if (!ready) return <div className="boot" />;

  if (run) {
    return (
      <Practice
        key={`${run.id}-${run.plan}`}
        episodeId={run.id}
        plan={run.plan}
        onClose={() => {
          if (run.plan === 'first' && !settings.firstRunDone) void update({ firstRunDone: true });
          setRun(null);
        }}
      />
    );
  }

  if (!settings.firstRunDone) {
    return <FirstRun onStart={() => setRun({ id: EPISODES[0].id, plan: 'first' })} onSkip={() => setTab('today')} />;
  }

  return (
    <div className="app">
      <main className="app__main">
        {tab === 'today' && <Today onStart={(id, plan) => setRun({ id, plan })} onGoMe={() => setTab('me')} />}
        {tab === 'phrases' && <Phrases />}
        {tab === 'me' && <Me />}
      </main>
      <nav className="tabbar" aria-label="主导航">
        {([
          ['today', 'home', '今天'],
          ['phrases', 'book', '句库'],
          ['me', 'user', '我'],
        ] as const).map(([id, icon, label]) => (
          <button key={id} className={`tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            <Icon name={icon} size={24} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
      <ToastHost />
    </AppProvider>
  );
}
