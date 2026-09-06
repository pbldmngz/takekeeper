import { useStore } from '../state/store';
import { Editor } from './Editor';
import { Empty } from './Empty';
import { Modals } from './Modals';

export function App() {
  const s = useStore();
  return (
    <>
      {s.state.phase === 'ready' ? <Editor /> : <Empty />}
      <Modals />
    </>
  );
}
