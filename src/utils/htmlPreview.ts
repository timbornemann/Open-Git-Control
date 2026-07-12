import { resolveMarkdownPreviewAssetPath } from './markdownPreview';

const HTML_EXTENSIONS = new Set(['htm', 'html']);
const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "media-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const INTERNAL_ANCHOR_NAVIGATION_SCRIPT = `
document.addEventListener('click', function (event) {
  var source = event.target;
  if (!(source instanceof Element)) return;
  var anchor = source.closest('a[href^="#"]');
  if (!anchor) return;
  event.preventDefault();
  var hash = anchor.getAttribute('href').slice(1);
  if (!hash) return;
  try {
    var target = document.getElementById(decodeURIComponent(hash));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (_) {}
}, true);
`;

export type HtmlPreviewAssetKind = 'image' | 'script' | 'style';
export type HtmlPreviewAsset = { kind: HtmlPreviewAssetKind; path: string };
export type HtmlPreviewAssetContent = {
  images: Record<string, string>;
  scripts: Record<string, string>;
  styles: Record<string, string>;
};

const getExtension = (filePath: string): string => {
  const fileName =
    String(filePath || '')
      .split(/[\\/]/)
      .pop() || '';
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 && lastDot < fileName.length - 1 ? fileName.slice(lastDot + 1).toLowerCase() : '';
};

const isDataUrl = (value: string): boolean => /^data:/i.test(value.trim());

const isStylesheet = (element: Element): boolean => (element.getAttribute('rel') || '').split(/\s+/).some((value) => value.toLowerCase() === 'stylesheet');

const resolveAsset = (htmlPath: string, rawReference: string): string | null => resolveMarkdownPreviewAssetPath(htmlPath, rawReference);

export const isHtmlFilePath = (filePath: string): boolean => HTML_EXTENSIONS.has(getExtension(filePath));

export const collectHtmlPreviewAssets = (html: string, htmlPath: string): HtmlPreviewAsset[] => {
  if (typeof DOMParser === 'undefined') return [];

  const document = new DOMParser().parseFromString(html, 'text/html');
  const assets = new Map<string, HtmlPreviewAsset>();
  const add = (kind: HtmlPreviewAssetKind, rawReference: string) => {
    const path = resolveAsset(htmlPath, rawReference);
    if (path) assets.set(`${kind}:${path}`, { kind, path });
  };

  for (const link of Array.from(document.querySelectorAll('link[href]'))) {
    if (isStylesheet(link)) add('style', link.getAttribute('href') || '');
  }
  for (const script of Array.from(document.querySelectorAll('script[src]'))) add('script', script.getAttribute('src') || '');
  for (const image of Array.from(document.querySelectorAll('img[src]'))) add('image', image.getAttribute('src') || '');

  return [...assets.values()];
};

const escapeClosingTag = (source: string, tagName: 'script' | 'style'): string => source.replace(new RegExp(`</${tagName}`, 'gi'), `<\\/${tagName}`);

const replaceStylesheet = (link: Element, htmlPath: string, styles: Record<string, string>, document: Document): void => {
  const assetPath = resolveAsset(htmlPath, link.getAttribute('href') || '');
  const stylesheet = assetPath ? styles[assetPath] : undefined;
  if (stylesheet === undefined) {
    link.remove();
    return;
  }

  const style = document.createElement('style');
  style.textContent = escapeClosingTag(stylesheet, 'style');
  link.replaceWith(style);
};

const replaceScript = (script: HTMLScriptElement, htmlPath: string, scripts: Record<string, string>): void => {
  const sourcePath = resolveAsset(htmlPath, script.getAttribute('src') || '');
  const source = sourcePath ? scripts[sourcePath] : undefined;
  if (source === undefined) {
    script.remove();
    return;
  }

  script.removeAttribute('src');
  script.removeAttribute('integrity');
  script.removeAttribute('crossorigin');
  script.textContent = escapeClosingTag(source, 'script');
};

const replaceImage = (image: HTMLImageElement, htmlPath: string, images: Record<string, string>): void => {
  const rawSource = image.getAttribute('src') || '';
  if (isDataUrl(rawSource)) return;

  const sourcePath = resolveAsset(htmlPath, rawSource);
  const dataUrl = sourcePath ? images[sourcePath] : undefined;
  if (dataUrl) image.setAttribute('src', dataUrl);
  else image.removeAttribute('src');
};

/**
 * Produces an isolated document for an iframe preview. All linked assets have
 * to be supplied by the repository-bound caller; remote URLs are stripped.
 */
export const buildSandboxedHtmlPreviewDocument = (html: string, htmlPath: string, assets: HtmlPreviewAssetContent): string => {
  if (typeof DOMParser === 'undefined') return html;

  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const element of Array.from(
    document.querySelectorAll('base, iframe, frame, object, embed, meta[http-equiv="refresh"], meta[http-equiv="Content-Security-Policy"]'),
  )) {
    element.remove();
  }
  for (const link of Array.from(document.querySelectorAll('link'))) {
    if (isStylesheet(link)) replaceStylesheet(link, htmlPath, assets.styles, document);
    else link.remove();
  }
  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))) replaceScript(script, htmlPath, assets.scripts);
  for (const image of Array.from(document.querySelectorAll<HTMLImageElement>('img[src]'))) replaceImage(image, htmlPath, assets.images);
  for (const element of Array.from(document.querySelectorAll('[srcset]'))) element.removeAttribute('srcset');
  for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
    if (!(anchor.getAttribute('href') || '').trim().startsWith('#')) anchor.removeAttribute('href');
    anchor.removeAttribute('target');
  }

  const csp = document.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', HTML_PREVIEW_CSP);
  const anchorNavigation = document.createElement('script');
  anchorNavigation.textContent = INTERNAL_ANCHOR_NAVIGATION_SCRIPT;
  document.head.prepend(anchorNavigation);
  document.head.prepend(csp);

  return `<!doctype html>${document.documentElement.outerHTML}`;
};
