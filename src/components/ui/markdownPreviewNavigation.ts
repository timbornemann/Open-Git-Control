import type { MouseEvent } from 'react';
import { appClient } from '@/services/appClient';
import { isExternalMarkdownUrl, MARKDOWN_USER_CONTENT_ID_PREFIX } from '@/utils/markdownPreview';

const decodeFragment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Resolves an in-document anchor inside the preview only; Markdown IDs carry a user-content prefix. */
const findPreviewAnchorTarget = (container: Element, fragment: string): Element | null => {
  const targetId = decodeFragment(fragment);
  if (!targetId) return null;
  const candidates = targetId.startsWith(MARKDOWN_USER_CONTENT_ID_PREFIX) ? [targetId] : [`${MARKDOWN_USER_CONTENT_ID_PREFIX}${targetId}`, targetId];
  for (const candidate of candidates) {
    const target = Array.from(container.querySelectorAll('[id], [name]')).find(
      (element) => element.getAttribute('id') === candidate || element.getAttribute('name') === candidate,
    );
    if (target) return target;
  }
  return null;
};

export function handleMarkdownPreviewClick(event: MouseEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return;

  const href = anchor.getAttribute('href') || '';
  event.preventDefault();
  if (href.startsWith('#')) {
    const container = event.currentTarget instanceof Element ? event.currentTarget : null;
    if (container) findPreviewAnchorTarget(container, href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (isExternalMarkdownUrl(href) && /^https:/i.test(href) && appClient.isAvailable()) {
    void appClient.openExternalUrl(href);
  }
}
