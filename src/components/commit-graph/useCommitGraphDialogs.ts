import { useUIContext } from '@/contexts/AppStateContext';

export const useCommitGraphDialogs = () => {
  const { setConfirmDialog, setInputDialog } = useUIContext();

  return {
    setConfirmDialog,
    setInputDialog,
  };
};
