import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { LEGACY_TEXT_MAP_EN, LEGACY_REGEX_REPLACERS_EN } from './i18n/legacyTranslations';

export type AppLanguage = 'de' | 'en';

type TranslateFn = (deText: string, enText: string) => string;

type I18nContextValue = {
  language: AppLanguage;
  locale: string;
  tr: TranslateFn;
};

const DEFAULT_LANGUAGE: AppLanguage = 'de';
const TRANSLATABLE_ATTRS = ['title', 'placeholder', 'aria-label'] as const;
type TranslatableAttr = (typeof TRANSLATABLE_ATTRS)[number];


export const getLocale = (language: AppLanguage): string => {
  return language === 'en' ? 'en-US' : 'de-DE';
};

export const trByLanguage = (language: AppLanguage, deText: string, enText: string): string => {
  return language === 'en' ? enText : deText;
};

const translateLegacyToEn = (value: string): string => {
  if (!value) return value;

  const exact = LEGACY_TEXT_MAP_EN[value];
  if (exact) return exact;

  let next = value;
  for (const [pattern, replacement] of LEGACY_REGEX_REPLACERS_EN) {
    next = next.replace(pattern, replacement);
  }

  return next;
};

const LEGACY_TEXT_MAP_DE: Record<string, string> = {
  'Datei-Aenderungen verwerfen?': 'Datei-Änderungen verwerfen?',
  'Alle nicht gespeicherten Aenderungen dieser Datei werden verworfen.': 'Alle nicht gespeicherten Änderungen dieser Datei werden verworfen.',
  'Aenderungen verwerfen': 'Änderungen verwerfen',
  'Alle unstaged Aenderungen verwerfen?': 'Alle unstaged Änderungen verwerfen?',
  'Alle lokalen unstaged Aenderungen werden auf den letzten Commit zurueckgesetzt.': 'Alle lokalen unstaged Änderungen werden auf den letzten Commit zurückgesetzt.',
  'Nicht gespeicherte Aenderungen gehen unwiderruflich verloren.': 'Nicht gespeicherte Änderungen gehen unwiderruflich verloren.',
  'Untracked Datei loeschen?': 'Untracked Datei löschen?',
  'Datei loeschen': 'Datei löschen',
  'Aenderungen stashen': 'Änderungen stashen',
  'Optional eine Nachricht fuer den neuen Stash hinterlegen.': 'Optional eine Nachricht für den neuen Stash hinterlegen.',
  'Aenderungen werden temporaer aus dem Working Tree entfernt und im Stash gespeichert.': 'Änderungen werden temporär aus dem Working Tree entfernt und im Stash gespeichert.',
  'Der laufende Merge wird verworfen und auf den Zustand vor dem Merge zurueckgesetzt.': 'Der laufende Merge wird verworfen und auf den Zustand vor dem Merge zurückgesetzt.',
  'Alle noch nicht gesicherten Merge-Konfliktaufloesungen gehen verloren.': 'Alle noch nicht gesicherten Merge-Konfliktauflösungen gehen verloren.',
  'Alle noch nicht gesicherten Rebase-Aufloesungen gehen verloren.': 'Alle noch nicht gesicherten Rebase-Auflösungen gehen verloren.',
  'Bitte in den Einstellungen zuerst ein KI-Modell auswaehlen.': 'Bitte in den Einstellungen zuerst ein KI-Modell auswählen.',
  'Bitte zuerst alle Konflikte aufloesen.': 'Bitte zuerst alle Konflikte auflösen.',
  'Keine Aenderungen fuer KI Auto-Commit vorhanden.': 'Keine Änderungen für KI Auto-Commit vorhanden.',
  'Als geloest markieren': 'Als gelöst markieren',
  'Konflikte aufloesen, danach committen...': 'Konflikte auflösen, danach committen...',
  'Datei zu .gitignore hinzufuegen': 'Datei zu .gitignore hinzufügen',
};

const LEGACY_REGEX_REPLACERS_DE: Array<[RegExp, string]> = [
  [/^Branch \"(.+)\" geloescht\.$/, 'Branch "$1" gelöscht.'],
  [/^Tag \"(.+)\" geloescht\.$/, 'Tag "$1" gelöscht.'],
  [/^(.+) geloescht$/, '$1 gelöscht'],
  [/^(.+) als geloest markiert$/, '$1 als gelöst markiert'],
  [/^(.+): ours uebernommen$/, '$1: ours übernommen'],
  [/^(.+): theirs uebernommen$/, '$1: theirs übernommen'],
  [/^Ignore-Regel hinzugefuegt: (.+)$/, 'Ignore-Regel hinzugefügt: $1'],
  [/^Remote \"(.+)\" hinzugefuegt\.$/, 'Remote "$1" hinzugefügt.'],
];

const normalizeLegacyGerman = (value: string): string => {
  if (!value) return value;

  const exact = LEGACY_TEXT_MAP_DE[value];
  if (exact) return exact;

  let next = value;
  for (const [pattern, replacement] of LEGACY_REGEX_REPLACERS_DE) {
    next = next.replace(pattern, replacement);
  }

  return next;
};

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANGUAGE,
  locale: getLocale(DEFAULT_LANGUAGE),
  tr: (deText) => deText,
});

type I18nProviderProps = {
  language: AppLanguage;
  children: React.ReactNode;
};

export const I18nProvider: React.FC<I18nProviderProps> = ({ language, children }) => {
  const originalTextNodesRef = useRef(new WeakMap<Text, string>());
  const originalAttrsRef = useRef(new WeakMap<Element, Partial<Record<TranslatableAttr, string>>>());

  const value = useMemo<I18nContextValue>(() => {
    const locale = getLocale(language);
    return {
      language,
      locale,
      tr: (deText, enText) => trByLanguage(language, deText, enText),
    };
  }, [language]);

  useEffect(() => {
    const root = document.body;
    if (!root) return;

    const processTextNode = (node: Text) => {
      if (!node.parentElement) return;
      const tag = node.parentElement.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;

      if (language === 'en') {
        const hadOriginal = originalTextNodesRef.current.has(node);
        const storedOriginal = originalTextNodesRef.current.get(node);
        let original = storedOriginal ?? node.data;

        if (hadOriginal) {
          const translatedStored = translateLegacyToEn(original);
          // If text changed externally (for example by React state updates),
          // treat the new value as the new source instead of forcing the old one.
          if (translatedStored !== node.data) {
            original = node.data;
            originalTextNodesRef.current.set(node, original);
          }
        } else {
          originalTextNodesRef.current.set(node, original);
        }

        const translated = translateLegacyToEn(original);
        if (translated !== node.data) {
          node.data = translated;
        }
        return;
      }

      const original = originalTextNodesRef.current.get(node) ?? node.data;
      const normalized = normalizeLegacyGerman(original);
      if (normalized !== node.data) {
        node.data = normalized;
      }
      originalTextNodesRef.current.delete(node);
    };

    const processAttributes = (element: Element) => {
      for (const attr of TRANSLATABLE_ATTRS) {
        if (!element.hasAttribute(attr)) continue;

        const originalAttrs = originalAttrsRef.current.get(element) || {};
        const currentValue = element.getAttribute(attr) || '';
        const originalValue = originalAttrs[attr] ?? currentValue;

        if (language === 'en') {
          if (!(attr in originalAttrs)) {
            originalAttrs[attr] = currentValue;
            originalAttrsRef.current.set(element, originalAttrs);
          }
          const translated = translateLegacyToEn(originalValue);
          if (translated !== currentValue) {
            element.setAttribute(attr, translated);
          }
          continue;
        }

        const normalized = normalizeLegacyGerman(originalValue);
        if (normalized !== currentValue) {
          element.setAttribute(attr, normalized);
        }

        delete originalAttrs[attr];
        if (Object.keys(originalAttrs).length === 0) {
          originalAttrsRef.current.delete(element);
        } else {
          originalAttrsRef.current.set(element, originalAttrs);
        }
      }
    };

    const processNodeDeep = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        processTextNode(node as Text);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as Element;
      processAttributes(element);
      for (const child of Array.from(element.childNodes)) {
        processNodeDeep(child);
      }
    };

    processNodeDeep(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
          processTextNode(mutation.target as Text);
        }

        if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          processAttributes(mutation.target as Element);
        }

        if (mutation.type === 'childList') {
          for (const addedNode of Array.from(mutation.addedNodes)) {
            processNodeDeep(addedNode);
          }
        }
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRS],
    });

    return () => observer.disconnect();
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => useContext(I18nContext);




