import { useEffect, useState } from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';

type Request = { path: string; choose: (path: string | null) => void };
const EVENT = 'tutorial:directory-picker';
export async function selectPracticeDirectory(path: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.tutorialHost) return path;
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<Request>(EVENT, { detail: { path, choose: resolve } }));
  });
}
export function TutorialDirectoryPicker({ sessionKey }: { sessionKey: number }) {
  const { tr } = useI18n();
  const [request, setRequest] = useState<Request | null>(null);
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    let pending: Request | null = null;
    const open = (event: Event) => {
      pending?.choose(null);
      pending = (event as CustomEvent<Request>).detail;
      setSelected(false);
      setRequest(pending);
    };
    window.addEventListener(EVENT, open);
    return () => {
      window.removeEventListener(EVENT, open);
      pending?.choose(null);
      setRequest(null);
    };
  }, [sessionKey]);
  const close = (path: string | null) => {
    const active = request;
    setRequest(null);
    active?.choose(path);
  };
  if (!request) return null;
  return (
    <div className="tutorial-directory-picker">
      <DialogFrame
        open
        title={tr('Ordner auswählen – Beispieldaten', 'Choose a folder – sample data')}
        onClose={() => close(null)}
        onConfirm={() => close(request.path)}
        confirmDisabled={!selected}
        confirmLabel={tr('Diesen Ordner wählen', 'Choose this folder')}
      >
        <p className="dialog-message">
          {tr(
            'Im normalen Betrieb erscheint die Ordnerauswahl deines Systems. Hier wählst du ausschließlich einen Beispielordner.',
            'Normally your system folder picker opens. Here you select a sample folder only.',
          )}
        </p>
        <button className="tutorial-button tutorial-directory-choice" type="button" aria-pressed={selected} onClick={() => setSelected(true)}>
          {request.path}
        </button>
      </DialogFrame>
    </div>
  );
}
