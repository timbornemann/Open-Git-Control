import React, { createContext, useContext, useMemo } from 'react';
import { createLanguageTranslations, getDefaultI18nContextValue, type AppLanguage, type I18nContextValue } from '@/i18nCore';

export type { AppLanguage, CatalogTranslateFn, I18nContextValue, TranslateFn, TranslationVariables } from '@/i18nCore';

const I18nContext = createContext<I18nContextValue>(getDefaultI18nContextValue());

export const useLanguageTranslations = (language: AppLanguage): I18nContextValue => {
  return useMemo(() => createLanguageTranslations(language), [language]);
};

type I18nProviderProps = {
  language: AppLanguage;
  children: React.ReactNode;
};

export const I18nProvider: React.FC<I18nProviderProps> = ({ language, children }) => {
  const value = useLanguageTranslations(language);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => useContext(I18nContext);
