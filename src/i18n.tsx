import React, { createContext, useContext, useMemo } from 'react';
import deCatalog from './locales/de.json';
import enCatalog from './locales/en.json';

export type AppLanguage = 'de' | 'en';
export type TranslationVariables = Record<string, string | number | boolean | null | undefined>;

type TranslateFn = (deText: string, enText: string) => string;
type CatalogTranslateFn = (key: string, variables?: TranslationVariables) => string;
type TranslationCatalog = Record<string, unknown>;

type I18nContextValue = {
  language: AppLanguage;
  locale: string;
  tr: TranslateFn;
  t: CatalogTranslateFn;
};

const DEFAULT_LANGUAGE: AppLanguage = 'de';
const catalogs: Record<AppLanguage, TranslationCatalog> = {
  de: deCatalog,
  en: enCatalog,
};

export const getLocale = (language: AppLanguage): string => {
  return language === 'en' ? 'en-US' : 'de-DE';
};

export const trByLanguage = (language: AppLanguage, deText: string, enText: string): string => {
  return language === 'en' ? enText : deText;
};

const lookupCatalogValue = (catalog: TranslationCatalog, key: string): string | null => {
  const parts = key.split('.').map(part => part.trim()).filter(Boolean);
  let cursor: unknown = catalog;

  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }

  return typeof cursor === 'string' ? cursor : null;
};

const interpolate = (template: string, variables: TranslationVariables = {}): string => {
  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, name) => {
    const value = variables[name];
    return value === undefined || value === null ? match : String(value);
  });
};

export const translateFromCatalog = (
  language: AppLanguage,
  key: string,
  variables?: TranslationVariables,
): string => {
  const value = lookupCatalogValue(catalogs[language], key)
    ?? lookupCatalogValue(catalogs[DEFAULT_LANGUAGE], key)
    ?? key;
  return interpolate(value, variables);
};

const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANGUAGE,
  locale: getLocale(DEFAULT_LANGUAGE),
  tr: (deText) => deText,
  t: (key, variables) => translateFromCatalog(DEFAULT_LANGUAGE, key, variables),
});

type I18nProviderProps = {
  language: AppLanguage;
  children: React.ReactNode;
};

export const I18nProvider: React.FC<I18nProviderProps> = ({ language, children }) => {
  const value = useMemo<I18nContextValue>(() => {
    const locale = getLocale(language);
    return {
      language,
      locale,
      tr: (deText, enText) => trByLanguage(language, deText, enText),
      t: (key, variables) => translateFromCatalog(language, key, variables),
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => useContext(I18nContext);
