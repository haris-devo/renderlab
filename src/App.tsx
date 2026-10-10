import { useCallback, useState } from 'react';
import { DEFAULT_SETUP, type Setup } from './engine/presets';
import type { StrategyId } from './engine/types';
import type { Answers } from './engine/decide';
import { readLabState } from './lib/urlState';
import { labSetupFor } from './engine/decide';
import { Decide } from './components/Decide';
import { DeepDive } from './components/DeepDive';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Interview } from './components/Interview';
import { IsrLab } from './components/IsrLab';
import { Lab } from './components/Lab';
import { Nav } from './components/Nav';
import { RscLab } from './components/RscLab';
import { StreamLab } from './components/StreamLab';

const initial = typeof location !== 'undefined' ? readLabState(location.search) : null;

function goto(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function App() {
  const [setup, setSetup] = useState<Setup>(initial?.setup ?? DEFAULT_SETUP);
  const [strategy, setStrategy] = useState<StrategyId>(initial?.strategy ?? 'ssr');
  const [compare, setCompare] = useState<StrategyId | null>(initial?.compare ?? null);
  const [deep, setDeep] = useState<StrategyId>('csr');

  const openLab = useCallback((id: StrategyId) => {
    setStrategy(id);
    setCompare((c) => (c === id ? null : c));
    goto('lab');
  }, []);
  const openDeep = useCallback((id: StrategyId) => {
    setDeep(id);
    goto('deep');
  }, []);

  const tryFromAnswers = useCallback(
    (id: StrategyId, a: Answers) => {
      const p = labSetupFor(a);
      setSetup((s) => ({ ...s, ...p, scenarioId: 'custom' }));
      openLab(id);
    },
    [openLab],
  );

  const applySplit = useCallback(
    (share: number) => {
      setSetup((s) => ({ ...s, clientShare: Math.max(0.05, Math.min(1, share)), scenarioId: 'custom' }));
      openLab(strategy === 'ppr' ? 'ppr' : 'rsc');
    },
    [openLab, strategy],
  );

  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Lab
          setup={setup}
          setSetup={setSetup}
          strategy={strategy}
          setStrategy={setStrategy}
          compare={compare}
          setCompare={setCompare}
          onDeep={(id) => setDeep(id)}
        />
        <DeepDive strategy={deep} setStrategy={setDeep} onOpenLab={openLab} />
        <IsrLab />
        <StreamLab />
        <RscLab onApply={applySplit} />
        <Decide onTry={tryFromAnswers} onDeep={openDeep} />
        <Interview onLab={openLab} onDeep={openDeep} />
      </main>
      <Footer />
    </>
  );
}
