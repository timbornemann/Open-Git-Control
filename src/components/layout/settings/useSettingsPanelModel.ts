import { useMemo } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import type { GitJobEventDto } from '@/types/aiDtos';
import { useI18n } from '@/i18n';
import { useSettingsAiUpdater } from '../hooks/useSettingsAiUpdater';
import type { SettingsUpdateHandler } from './SettingsSectionPrimitives';

type Params = {
  settings: AppSettingsDto;
  onUpdateSettings: SettingsUpdateHandler;
  jobs: GitJobEventDto[];
};

export const useSettingsPanelModel = ({ settings, onUpdateSettings, jobs }: Params) => {
  const { t, tr, locale } = useI18n();
  const sortedJobs = useMemo(() => [...jobs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20), [jobs]);
  const aiUpdater = useSettingsAiUpdater({ settings, onUpdateSettings, t, tr });

  return {
    t,
    tr,
    locale,
    sortedJobs,
    aiUpdater,
  };
};
