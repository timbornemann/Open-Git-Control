import React, { useMemo } from 'react';

type ReleaseNotesContentProps = {
  releaseNotes: string;
  className?: string;
};

type ParsedReleaseNotes = { type: 'html'; html: string } | { type: 'text'; text: string };

const ALLOWED_TAGS = new Set(['a', 'blockquote', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'li', 'ol', 'p', 'pre', 'strong', 'ul']);

const BLOCKED_TAGS = new Set(['button', 'embed', 'form', 'iframe', 'img', 'input', 'link', 'meta', 'object', 'script', 'style', 'svg', 'template']);

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SANITIZE_BASE_URL = 'https://github.com';

function isLikelyHtml(input: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(input);
}

function sanitizeAnchor(element: HTMLElement): void {
  const href = element.getAttribute('href');
  for (const { name } of Array.from(element.attributes)) {
    if (name !== 'href' && name !== 'title') {
      element.removeAttribute(name);
    }
  }

  if (!href) {
    element.removeAttribute('href');
    return;
  }

  const trimmedHref = href.trim();
  if (!trimmedHref) {
    element.removeAttribute('href');
    return;
  }

  try {
    const parsed = new URL(trimmedHref, SANITIZE_BASE_URL);
    if (!SAFE_LINK_PROTOCOLS.has(parsed.protocol)) {
      element.removeAttribute('href');
      return;
    }
    element.setAttribute('href', parsed.toString());
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
  } catch {
    element.removeAttribute('href');
  }
}

function sanitizeNode(node: Node): void {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tagName)) {
    element.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    const parent = element.parentNode;
    if (!parent) return;

    while (element.firstChild) {
      const child = element.firstChild;
      parent.insertBefore(child, element);
      sanitizeNode(child);
    }
    parent.removeChild(element);
    return;
  }

  if (tagName === 'a') {
    sanitizeAnchor(element);
  } else {
    for (const { name } of Array.from(element.attributes)) {
      element.removeAttribute(name);
    }
  }

  for (const child of Array.from(element.childNodes)) {
    sanitizeNode(child);
  }
}

function sanitizeReleaseNotesHtml(input: string): string {
  if (typeof DOMParser === 'undefined') return '';

  const document = new DOMParser().parseFromString(input, 'text/html');
  for (const child of Array.from(document.body.childNodes)) {
    sanitizeNode(child);
  }
  return document.body.innerHTML.trim();
}

function parseReleaseNotes(input: string): ParsedReleaseNotes {
  const trimmed = input.trim();
  if (!trimmed) {
    return { type: 'text', text: '' };
  }

  if (!isLikelyHtml(trimmed)) {
    return { type: 'text', text: trimmed };
  }

  const sanitizedHtml = sanitizeReleaseNotesHtml(trimmed);
  if (!sanitizedHtml) {
    return { type: 'text', text: trimmed };
  }

  return { type: 'html', html: sanitizedHtml };
}

export const ReleaseNotesContent: React.FC<ReleaseNotesContentProps> = ({ releaseNotes, className }) => {
  const parsed = useMemo(() => parseReleaseNotes(releaseNotes), [releaseNotes]);

  if (parsed.type === 'html') {
    return <div className={className} dangerouslySetInnerHTML={{ __html: parsed.html }} />;
  }

  return <div className={`${className || ''} release-notes-plain`.trim()}>{parsed.text}</div>;
};
