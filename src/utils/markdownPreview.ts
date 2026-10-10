import createDOMPurify from 'dompurify';
import { Marked } from 'marked';

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'mkdn']);
const markdownParser = new Marked({
  async: false,
  breaks: false,
  gfm: true,
});

const getExtension = (filePath: string): string => {
  const fileName =
    String(filePath || '')
      .split(/[\\/]/)
      .pop() || '';
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
};

const stripQueryAndHash = (value: string): string => {
  const queryIndex = value.indexOf('?');
  const hashIndex = value.indexOf('#');
  const cutPoints = [queryIndex, hashIndex].filter((index) => index >= 0);
  if (cutPoints.length === 0) return value;
  return value.slice(0, Math.min(...cutPoints));
};

const tryDecodeUriPath = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeRepoRelativePath = (value: string): string | null => {
  const segments: string[] = [];
  for (const segment of value.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join('/') : null;
};

// Markdown can come from remote release notes or untrusted repositories. Only
// the language hint that marked emits for fenced code may keep a class; any
// other class could borrow app styles (fixed overlays, modals) to spoof the UI.
const MARKDOWN_CLASS_TOKEN = /^language-[A-Za-z0-9_+#.-]+$/;
export const MARKDOWN_USER_CONTENT_ID_PREFIX = 'user-content-';

export const isMarkdownFilePath = (filePath: string): boolean => MARKDOWN_EXTENSIONS.has(getExtension(filePath));

export const isExternalMarkdownUrl = (value: string): boolean => {
  const trimmed = String(value || '').trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//');
};

export const resolveMarkdownPreviewAssetPath = (markdownFilePath: string, rawAssetRef: string): string | null => {
  const trimmedRef = String(rawAssetRef || '').trim();
  if (!trimmedRef || trimmedRef.startsWith('#') || isExternalMarkdownUrl(trimmedRef)) {
    return null;
  }

  const cleanRef = tryDecodeUriPath(stripQueryAndHash(trimmedRef));
  if (!cleanRef || cleanRef.startsWith('#')) return null;

  const markdownPath = String(markdownFilePath || '').replace(/\\/g, '/');
  const lastSlash = markdownPath.lastIndexOf('/');
  const markdownDir = lastSlash >= 0 ? markdownPath.slice(0, lastSlash) : '';
  const joined = cleanRef.startsWith('/') ? cleanRef.slice(1) : `${markdownDir ? `${markdownDir}/` : ''}${cleanRef}`;

  return normalizeRepoRelativePath(joined);
};

export const renderMarkdownToSanitizedHtml = (markdown: string): string => {
  const rawHtml = String(markdownParser.parse(markdown || ''));

  if (typeof window === 'undefined') {
    return rawHtml;
  }

  const purifier = createDOMPurify(window);
  const sanitized = purifier.sanitize(rawHtml, {
    ADD_ATTR: ['checked', 'disabled', 'rel', 'target'],
    ADD_TAGS: ['input'],
    ALLOW_DATA_ATTR: false,
    // Inline styles would let untrusted Markdown cover the whole app window
    // (position: fixed) with a fake interface.
    FORBID_ATTR: ['style'],
    FORBID_TAGS: ['button', 'embed', 'form', 'iframe', 'meta', 'object', 'script', 'style', 'template'],
    // Prefix id/name values so Markdown cannot clobber or collide with app
    // element IDs (for example the React root).
    SANITIZE_NAMED_PROPS: true,
  });

  if (typeof DOMParser === 'undefined') {
    return sanitized;
  }

  const document = new DOMParser().parseFromString(sanitized, 'text/html');
  for (const element of Array.from(document.body.querySelectorAll('[class]'))) {
    const allowedClasses = (element.getAttribute('class') || '').split(/\s+/).filter((token) => MARKDOWN_CLASS_TOKEN.test(token));
    if (allowedClasses.length > 0 && element.tagName.toLowerCase() === 'code') element.setAttribute('class', allowedClasses.join(' '));
    else element.removeAttribute('class');
  }
  for (const anchor of Array.from(document.body.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href') || '';
    if (isExternalMarkdownUrl(href)) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    }
  }
  for (const input of Array.from(document.body.querySelectorAll('input'))) {
    if ((input.getAttribute('type') || '').toLowerCase() !== 'checkbox') {
      input.remove();
      continue;
    }
    input.setAttribute('disabled', 'disabled');
  }
  return document.body.innerHTML;
};

export const collectMarkdownPreviewImageSources = (html: string): string[] => {
  if (typeof DOMParser === 'undefined') return [];

  const document = new DOMParser().parseFromString(html, 'text/html');
  const sources = new Set<string>();
  for (const image of Array.from(document.body.querySelectorAll('img[src]'))) {
    const source = image.getAttribute('src') || '';
    if (source && !isExternalMarkdownUrl(source) && !source.startsWith('#')) {
      sources.add(source);
    }
  }
  return [...sources];
};

export const applyMarkdownPreviewImageDataUrls = (html: string, dataUrlsBySource: Record<string, string>, strictLocalAssets = false): string => {
  if (typeof DOMParser === 'undefined') return html;

  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const image of Array.from(document.body.querySelectorAll('img[src]'))) {
    const source = image.getAttribute('src') || '';
    const dataUrl = dataUrlsBySource[source];
    if (dataUrl) {
      image.setAttribute('src', dataUrl);
      image.setAttribute('loading', 'lazy');
    } else if (strictLocalAssets && !isExternalMarkdownUrl(source)) {
      image.removeAttribute('src');
      image.setAttribute('title', `Asset unavailable in this version: ${source}`);
      image.setAttribute('alt', image.getAttribute('alt') || source);
    }
    if (strictLocalAssets) image.removeAttribute('srcset');
  }
  return document.body.innerHTML;
};
