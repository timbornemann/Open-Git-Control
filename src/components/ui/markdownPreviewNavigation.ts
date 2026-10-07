import type { MouseEvent } from 'react';
import { appClient } from '@/services/appClient';
import { isExternalMarkdownUrl } from '@/utils/markdownPreview';

export function handleMarkdownPreviewClick(event: MouseEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;

  const href = anchor.getAttribute('href') || '';
  event.preventDefault();
  if (href.startsWith('#')) {
    const targetId = href.slice(1);
    if (targetId) document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (isExternalMarkdownUrl(href) && /^https:/i.test(href) && appClient.isAvailable()) {
    void appClient.openExternalUrl(href);
  }
}
