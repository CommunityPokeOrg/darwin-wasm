import { useCallback } from 'react';
import { BinaryInfo } from './components/BinaryInfo';
import { Controls } from './components/Controls';
import { CountersPanel } from './components/CountersPanel';
import { DisassemblyPanel } from './components/DisassemblyPanel';
import { Dropzone } from './components/Dropzone';
import { Footer } from './components/Footer';
import { FramebufferPanel } from './components/FramebufferPanel';
import { Header } from './components/Header';
import { HonestyBanner } from './components/HonestyBanner';
import { RegistersPanel } from './components/RegistersPanel';
import { SamplePicker, type Sample } from './components/SamplePicker';
import { SyscallTracker } from './components/SyscallTracker';
import { TerminalPanel } from './components/TerminalPanel';
import { useMachine } from './useMachine';

export function App() {
  const runtime = useMachine();
  const loadSample = useCallback((sample: Sample) => { void runtime.loadUrl(`${import.meta.env.BASE_URL}samples/${sample.file}`); }, [runtime]);
  return <div className="app">
    <Header status={runtime.status} exitCode={runtime.exitCode} />
    <HonestyBanner />
    <main className="dashboard">
      <div className="column">
        <SamplePicker onLoad={loadSample} />
        <Dropzone onLoad={runtime.load} />
        <Controls status={runtime.status} speed={runtime.speed} onSpeed={runtime.setSpeed} onRun={runtime.run} onPause={runtime.pause} onStep={runtime.step} onReset={runtime.reset} />
        <BinaryInfo image={runtime.machine.image} report={runtime.machine.dyldReport} />
      </div>
      <div className="column">
        <FramebufferPanel image={runtime.presented} width={runtime.presentWidth} height={runtime.presentHeight} onInput={runtime.pushInput} />
        <TerminalPanel lines={runtime.terminal} onClear={runtime.clearTerminal} />
        {runtime.error && <div className="error-block">{runtime.error}</div>}
      </div>
      <div className="column">
        <RegistersPanel state={runtime.machine.state} />
        <CountersPanel machine={runtime.machine} />
        <SyscallTracker events={runtime.syscalls} />
        <DisassemblyPanel machine={runtime.machine} />
      </div>
    </main>
    <Footer />
  </div>;
}
