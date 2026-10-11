import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepositoryRunConfigDto, RepositoryRunTemplateDto } from '@/types/repositoryRun';
import { getRepositoryRunPrograms, type RepositoryRunPrerequisitesDto } from '@/shared/repositoryRunPrerequisites';
import { getRunPlatformCommand } from '@/types/repositoryRun';
import { repositoryRunClient } from '@/services/repositoryRunClient';

export function useRunPrerequisiteChecks(
  repoPath: string | null,
  config: RepositoryRunConfigDto | null,
  templates: RepositoryRunTemplateDto[],
  initial?: RepositoryRunPrerequisitesDto,
) {
  const [report, setReport] = useState<RepositoryRunPrerequisitesDto | undefined>(initial);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const currentConfig = useRef(config);
  currentConfig.current = config;
  const platform = initial?.platform ?? report?.platform ?? 'linux';
  const steps = [...Object.values(config?.actions ?? {}).flatMap((action) => action.steps), ...templates.map((template) => template.step)];
  const signature = JSON.stringify(
    [
      ...new Set(
        steps.flatMap((step) => {
          const command = getRunPlatformCommand(step, platform);
          return command ? getRepositoryRunPrograms(command.command, platform).map((program) => `${command.shell}:${program}`) : [];
        }),
      ),
    ].sort(),
  );

  useEffect(() => {
    setReport(initial);
  }, [repoPath, initial]);
  const recheck = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const request = ++generation.current;
    setFailed(false);
    if (!repoPath || !currentConfig.current || signature === '[]') {
      setReport(undefined);
      setChecking(false);
      return;
    }
    const required = JSON.parse(signature) as string[];
    if (!revision && initial && required.every((key) => initial.checks.some((check) => `${check.shell}:${check.program}` === key))) {
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      void repositoryRunClient
        .checkPrerequisites(repoPath, currentConfig.current!)
        .then((result) => {
          if (generation.current !== request) return;
          setChecking(false);
          setFailed(!result.success);
          setReport(result.success ? result.data : undefined);
        })
        .catch(() => {
          if (generation.current !== request) return;
          setChecking(false);
          setFailed(true);
          setReport(undefined);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
    };
  }, [repoPath, signature, revision, initial]);
  useEffect(() => {
    window.addEventListener('focus', recheck);
    return () => window.removeEventListener('focus', recheck);
  }, [recheck]);
  return { report, checking, failed, recheck };
}
