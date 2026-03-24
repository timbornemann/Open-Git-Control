import { useState } from 'react';
import type {
  GitHubCreateReleaseParamsDto,
  GitHubReleaseContextDto,
  GitHubReleaseDto,
} from '../../../global';

export const usePrAndReleaseState = () => {
  const [showCreatePR, setShowCreatePR] = useState(false);
  const [newPRTitle, setNewPRTitle] = useState('');
  const [newPRBody, setNewPRBody] = useState('');
  const [newPRHead, setNewPRHead] = useState('');
  const [newPRBase, setNewPRBase] = useState('main');

  const [releaseForm, setReleaseFormState] = useState<GitHubCreateReleaseParamsDto>({
    owner: '',
    repo: '',
    tagName: '',
    targetCommitish: '',
    releaseName: '',
    body: '',
    draft: false,
    prerelease: false,
  });
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseSuccess, setReleaseSuccess] = useState<GitHubReleaseDto | null>(null);
  const [showReleaseCreator, setShowReleaseCreator] = useState(false);
  const [releaseContextLoading, setReleaseContextLoading] = useState(false);
  const [releaseContextError, setReleaseContextError] = useState<string | null>(null);
  const [releaseContext, setReleaseContext] = useState<GitHubReleaseContextDto | null>(null);
  const [releaseNotesGenerating, setReleaseNotesGenerating] = useState(false);
  const [releaseNotesLanguage, setReleaseNotesLanguage] = useState<'de' | 'en'>('en');

  return {
    showCreatePR,
    setShowCreatePR,
    newPRTitle,
    setNewPRTitle,
    newPRBody,
    setNewPRBody,
    newPRHead,
    setNewPRHead,
    newPRBase,
    setNewPRBase,
    releaseForm,
    setReleaseFormState,
    releaseSubmitting,
    setReleaseSubmitting,
    releaseError,
    setReleaseError,
    releaseSuccess,
    setReleaseSuccess,
    showReleaseCreator,
    setShowReleaseCreator,
    releaseContextLoading,
    setReleaseContextLoading,
    releaseContextError,
    setReleaseContextError,
    releaseContext,
    setReleaseContext,
    releaseNotesGenerating,
    setReleaseNotesGenerating,
    releaseNotesLanguage,
    setReleaseNotesLanguage,
  };
};

