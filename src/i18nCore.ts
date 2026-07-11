import deCatalog from './locales/de.json';
import enCatalog from './locales/en.json';

export type AppLanguage = 'de' | 'en';
export type TranslationVariables = Record<string, string | number | boolean | null | undefined>;

export type TranslateFn = (deText: string, enText: string) => string;
export type CatalogTranslateFn = (key: string, variables?: TranslationVariables) => string;
type TranslationCatalog = Record<string, unknown>;

export type I18nContextValue = {
  language: AppLanguage;
  locale: string;
  tr: TranslateFn;
  t: CatalogTranslateFn;
};

const DEFAULT_LANGUAGE: AppLanguage = 'en';
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
  const parts = key
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
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

export const translateFromCatalog = (language: AppLanguage, key: string, variables?: TranslationVariables): string => {
  const value = lookupCatalogValue(catalogs[language], key) ?? lookupCatalogValue(catalogs[DEFAULT_LANGUAGE], key) ?? key;
  return interpolate(value, variables);
};

export const createLanguageTranslations = (language: AppLanguage): I18nContextValue => {
  return {
    language,
    locale: getLocale(language),
    tr: (deText, enText) => trByLanguage(language, deText, enText),
    t: (key, variables) => translateFromCatalog(language, key, variables),
  };
};

export const getDefaultI18nContextValue = (): I18nContextValue => ({
  language: DEFAULT_LANGUAGE,
  locale: getLocale(DEFAULT_LANGUAGE),
  tr: (deText) => deText,
  t: (key, variables) => translateFromCatalog(DEFAULT_LANGUAGE, key, variables),
});
