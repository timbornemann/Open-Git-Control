import { useState } from 'react';
import type { FeedbackReportAreaDto, FeedbackReportCategoryDto, FeedbackReportInputDto } from '@/types/feedbackDtos';
import type { FeedbackDialogRequest } from './FeedbackReportDialog';
import { useFeedbackDiagnostics } from './useFeedbackDiagnostics';

export function useFeedbackReportDraft(request: FeedbackDialogRequest) {
  const [category, setCategory] = useState<FeedbackReportCategoryDto>(request.category);
  const [message, setMessage] = useState(request.errorMessage || '');
  const [area, setArea] = useState<FeedbackReportAreaDto>(request.area || 'Other');
  const [details, setDetails] = useState({ title: '', steps: '', expected: '', desiredWorkflow: '', proposal: '', value: '', context: '', tried: '' });
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const diagnostics = useFeedbackDiagnostics(category === 'bug' && includeDiagnostics);
  const input = (): FeedbackReportInputDto => {
    const base = { title: details.title, area, source: request.source, submissionMode: 'manual' as const };
    if (category === 'bug')
      return {
        ...base,
        category,
        actual: message,
        steps: details.steps,
        expected: details.expected,
        ...(includeDiagnostics ? { diagnostics: diagnostics.value } : {}),
      };
    if (category === 'feature')
      return { ...base, category, problem: message, desiredWorkflow: details.desiredWorkflow, proposal: details.proposal, value: details.value };
    return { ...base, category, question: message, context: details.context, tried: details.tried };
  };
  return {
    category,
    setCategory,
    message,
    setMessage,
    area,
    setArea,
    details,
    changeDetail: (field: keyof typeof details, value: string) => setDetails((previous) => ({ ...previous, [field]: value })),
    includeDiagnostics,
    setIncludeDiagnostics,
    diagnostics,
    valid: Boolean(message.trim()) && !diagnostics.pending,
    input,
  };
}

export type FeedbackReportDraft = ReturnType<typeof useFeedbackReportDraft>;
