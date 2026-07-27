import React from 'react';
import { Download } from 'lucide-react';
import { DialogFrame } from '@/components/DialogFrame';
import { ReleaseNotesContent } from '@/components/layout/ReleaseNotesContent';
import { useSettingsStore } from '@/contexts/AppStateContext';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';
import type { UpdaterStatusDto } from '@/types/appDtos';

const updateStates = new Set<UpdaterStatusDto['state']>(['update-available', 'downloading', 'downloaded']);

const versionKey = (status: UpdaterStatusDto): string => status.availableVersion || `${status.state}:${status.lastCheckedAt || 'unknown'}`;

export const UpdateNotification: React.FC = () => {
  const { t } = useI18n();
  const showToast = useAppToast();
  const autoUpdateEnabled = useSettingsStore((state) => state.settings.autoUpdateEnabled);
  const onUpdateSettings = useSettingsStore((state) => state.onUpdateSettings);
  const [status, setStatus] = React.useState<UpdaterStatusDto | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dismissedVersion, setDismissedVersion] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  const announcedPendingReleaseRef = React.useRef<string | null>(null);

  const activeUpdateState = Boolean(status && updateStates.has(status.state));
  const releasePending = status?.state === 'release-pending';
  const updateErrorVisible = Boolean(status?.state === 'error' && status.availableVersion);
  const iconVisible = Boolean(releasePending || status?.state === 'downloaded' || (!autoUpdateEnabled && activeUpdateState) || updateErrorVisible);
  const currentVersionKey = status ? versionKey(status) : null;

  React.useEffect(() => {
    if (!appClient.isAvailable()) return;
    let active = true;

    const applyStatus = (nextStatus: UpdaterStatusDto) => {
      if (!active) return;
      setStatus(nextStatus);
      if (nextStatus.state === 'error' && nextStatus.error) {
        showToast(nextStatus.error, true);
        return;
      }
      if (nextStatus.state === 'release-pending') {
        const pendingReleaseKey = nextStatus.availableVersion || 'unknown-release';
        if (announcedPendingReleaseRef.current !== pendingReleaseKey) {
          announcedPendingReleaseRef.current = pendingReleaseKey;
          showToast(t('updates.releasePendingMessage'), false);
        }
      }
    };

    void appClient
      .getUpdaterStatus()
      .then(applyStatus)
      .catch(() => {
        if (active) setStatus(null);
      });

    const unsubscribe = appClient.onUpdaterEvent(applyStatus);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [showToast, t]);

  React.useEffect(() => {
    if (!autoUpdateEnabled || status?.state !== 'downloaded' || !currentVersionKey || dismissedVersion === currentVersionKey) return;
    setDialogOpen(true);
  }, [autoUpdateEnabled, currentVersionKey, dismissedVersion, status?.state]);

  const dismissDialog = () => {
    if (currentVersionKey) setDismissedVersion(currentVersionKey);
    setDialogOpen(false);
  };

  const installUpdate = async () => {
    if (!status || working || !appClient.isAvailable()) return;
    setWorking(true);
    try {
      if (status.state !== 'downloaded') {
        const download = await appClient.runOneClickAppUpdate();
        if (!download.success) {
          showToast(download.error || t('updates.downloadFailed'), true);
          return;
        }
        if (download.action === 'no-update') {
          showToast(t('updates.noLongerAvailable'), true);
          return;
        }
        if (download.action !== 'downloaded') return;
      }

      const installation = await appClient.installAppUpdate();
      if (!installation.success) {
        showToast(installation.error || t('updates.installFailed'), true);
      }
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : t('updates.installFailed'), true);
    } finally {
      setWorking(false);
    }
  };

  const skipAndDisable = async () => {
    if (working) return;
    setWorking(true);
    try {
      const result = await onUpdateSettings({ autoUpdateEnabled: false });
      if (!result.success) {
        return;
      }
      dismissDialog();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : t('updates.settingsFailed'), true);
    } finally {
      setWorking(false);
    }
  };

  if ((!iconVisible && !dialogOpen) || !status) return null;

  const iconLabel = releasePending
    ? t('updates.releasePendingIconLabel')
    : status.state === 'downloaded'
      ? t('updates.readyIconLabel')
      : t('updates.availableIconLabel');
  const confirmLabel = working
    ? t('updates.preparingInstall')
    : status.state === 'downloaded'
      ? t('updates.installAndRestart')
      : status.state === 'downloading'
        ? t('updates.installAfterDownload')
        : t('updates.downloadAndInstall');

  return (
    <>
      {iconVisible && (
        <button
          className={`icon-btn activity-update-btn activity-update-btn--${status.state}`}
          onClick={() => {
            setDialogOpen(true);
          }}
          title={iconLabel}
          aria-label={iconLabel}
        >
          <Download size={20} />
          <span className="activity-update-badge" aria-hidden="true" />
        </button>
      )}

      <DialogFrame
        open={dialogOpen}
        title={releasePending ? t('updates.releasePendingTitle') : t('updates.dialogTitle')}
        onClose={dismissDialog}
        onConfirm={releasePending ? undefined : () => void installUpdate()}
        onEnter={releasePending ? undefined : () => void installUpdate()}
        onSecondaryAction={releasePending ? undefined : () => void skipAndDisable()}
        confirmLabel={confirmLabel}
        confirmDisabled={working}
        secondaryActionLabel={releasePending ? undefined : t('updates.skipAndDisable')}
        cancelLabel={releasePending ? t('updates.close') : t('updates.later')}
        closeOnBackdrop={false}
      >
        <p className="dialog-message">
          {releasePending
            ? t('updates.releasePendingMessage')
            : t('updates.dialogMessage', { version: status.availableVersion || t('updates.unknownVersion') })}
        </p>
        {!releasePending && (
          <>
            {status.state === 'downloading' && (
              <div className="update-promotion-progress" aria-label={t('updates.downloadProgress')}>
                <div className="update-promotion-progress__bar" style={{ width: `${Math.max(0, Math.min(100, status.downloadPercent || 0))}%` }} />
              </div>
            )}
            <section className="update-promotion-notes">
              <h4>{t('updates.releaseNotes')}</h4>
              {status.releaseNotes ? (
                <ReleaseNotesContent className="update-promotion-notes__content" releaseNotes={status.releaseNotes} />
              ) : (
                <p className="update-promotion-notes__empty">{t('updates.noReleaseNotes')}</p>
              )}
            </section>
          </>
        )}
      </DialogFrame>
    </>
  );
};
