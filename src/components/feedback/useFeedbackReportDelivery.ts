import { useEffect, useRef, useState } from 'react';
import { appClient } from '@/services/appClient';
import type { FeedbackReportInputDto, FeedbackReportPreviewDto } from '@/types/feedbackDtos';

type Issue = { issueNumber: number; htmlUrl: string };
type Review = { input: FeedbackReportInputDto; preview: FeedbackReportPreviewDto };

export function useFeedbackReportDelivery(onReported: (issue: Issue) => void) {
  const lifecycle = useRef({ generation: 0, busy: false }).current;
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Issue | null>(null);
  const [fallbackOpened, setFallbackOpened] = useState(false);
  useEffect(
    () => () => {
      lifecycle.generation++;
    },
    [lifecycle],
  );

  const run = async (work: (current: () => boolean) => Promise<void>) => {
    if (lifecycle.busy || !appClient.isAvailable()) return;
    const generation = ++lifecycle.generation;
    const current = () => lifecycle.generation === generation;
    lifecycle.busy = true;
    setBusy(true);
    setError('');
    try {
      await work(current);
    } catch (reason) {
      if (current()) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (current()) {
        lifecycle.busy = false;
        setBusy(false);
      }
    }
  };

  const prepare = (input: FeedbackReportInputDto) =>
    run(async (current) => {
      const snapshot = { ...input };
      const response = await appClient.previewFeedbackReport(snapshot);
      if (!current()) return;
      if (!response.success) throw new Error(response.error);
      setReview({ input: snapshot, preview: response.data });
    });

  const submit = () =>
    run(async (current) => {
      if (!review) return;
      if (review.preview.delivery === 'browser') {
        if (!review.preview.fallbackUrl) throw new Error('The browser form is unavailable.');
        const opened = await appClient.openExternalUrl(review.preview.fallbackUrl);
        if (!current()) return;
        if (!opened.success) throw new Error(opened.error);
        setFallbackOpened(true);
        return;
      }
      const response = await appClient.submitFeedbackReport(review.input);
      if (!current()) return;
      if (response.success) {
        setResult(response.data);
        onReported(response.data);
      } else if (response.fallbackUrl) {
        const fallback = await appClient.previewFeedbackReport(review.input, 'browser');
        if (!current()) return;
        if (!fallback.success) throw new Error(fallback.error);
        setReview({ input: review.input, preview: fallback.data });
        setError(response.error);
      } else throw new Error(response.error);
    });

  const openCreatedIssue = () =>
    run(async (current) => {
      if (!result) return;
      const opened = await appClient.openExternalUrl(result.htmlUrl);
      if (current() && !opened.success) throw new Error(opened.error);
    });

  return {
    busy,
    review,
    error,
    result,
    fallbackOpened,
    prepare,
    submit,
    openCreatedIssue,
    back: () => {
      if (!lifecycle.busy) {
        setReview(null);
        setError('');
      }
    },
  };
}
