import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

// Import all locales
import en from './locales/en.json';
import nl from './locales/nl.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import es from './locales/es.json';
import sv from './locales/sv.json';
import fi from './locales/fi.json';
import da from './locales/da.json';
import nb from './locales/nb.json';

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'nb', name: 'Norwegian', nativeName: 'Norsk' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

// Get device locale, fallback to 'en'
const getDeviceLanguage = (): LanguageCode => {
  const deviceLocale = Localization.locale?.split('-')[0] || 'en';
  const isSupported = SUPPORTED_LANGUAGES.some(lang => lang.code === deviceLocale);
  return isSupported ? (deviceLocale as LanguageCode) : 'en';
};

// Resources object for i18next
const resources = {
  en: { translation: en },
  nl: { translation: nl },
  de: { translation: de },
  fr: { translation: fr },
  it: { translation: it },
  es: { translation: es },
  sv: { translation: sv },
  fi: { translation: fi },
  da: { translation: da },
  nb: { translation: nb },
};

// Initialize i18next
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;

// Utility function to change language
export const changeLanguage = async (languageCode: LanguageCode): Promise<void> => {
  await i18n.changeLanguage(languageCode);
};

// Get current language
export const getCurrentLanguage = (): LanguageCode => {
  return i18n.language as LanguageCode;
};

// Format currency based on locale
export const formatCurrency = (cents: number, locale?: string): string => {
  const currentLocale = locale || i18n.language;
  const value = cents / 100;
  
  return new Intl.NumberFormat(currentLocale, {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
};

// Format number based on locale
export const formatNumber = (value: number, decimals = 2, locale?: string): string => {
  const currentLocale = locale || i18n.language;
  
  return new Intl.NumberFormat(currentLocale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

// Format date based on locale
export const formatDate = (date: Date | string, locale?: string): string => {
  const currentLocale = locale || i18n.language;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat(currentLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateObj);
};

// Format relative date
export const formatRelativeDate = (date: Date | string, locale?: string): string => {
  const currentLocale = locale || i18n.language;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return new Intl.DateTimeFormat(currentLocale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  } else if (diffDays === 1) {
    return i18n.t('common.yesterday', 'Yesterday');
  } else if (diffDays < 7) {
    return new Intl.DateTimeFormat(currentLocale, {
      weekday: 'long',
    }).format(dateObj);
  } else {
    return new Intl.DateTimeFormat(currentLocale, {
      month: 'short',
      day: 'numeric',
    }).format(dateObj);
  }
};
