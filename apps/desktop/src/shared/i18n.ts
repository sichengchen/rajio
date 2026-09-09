import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';
import ja from './locales/ja.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import de from './locales/de.json';

export const languages = [
  { value: 'system', label: 'System' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
] as const;
export type Locale = 'en' | 'zh-Hans' | 'zh-Hant' | 'ja' | 'fr' | 'es' | 'de';
export type LanguageChoice = Locale | 'system';
const catalogs: Record<Locale, Record<string, string>> = { en, 'zh-Hans': zhHans, 'zh-Hant': zhHant, ja, fr, es, de };
let locale: Locale = 'en';
let choice: LanguageChoice = 'system';
const listeners = new Set<() => void>();
export function resolveLocale(language: string): Locale {
  if (/^zh/i.test(language)) return /hant|tw|hk|mo/i.test(language) ? 'zh-Hant' : 'zh-Hans';
  const base = language.split(/[-_]/)[0].toLowerCase();
  return base in catalogs ? base as Locale : 'en';
}
export function setLanguage(value: string | undefined, systemLanguage = Intl.DateTimeFormat().resolvedOptions().locale) {
  choice = languages.some(item => item.value === value) ? value as LanguageChoice : 'system';
  const next = resolveLocale(choice === 'system' ? systemLanguage : choice);
  locale = next;
  for (const listener of listeners) listener();
}
export const getLocale = () => locale;
export const getLanguageChoice = () => choice;
export const subscribeLocale = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function t(key: string, values: Record<string, string | number> = {}): string {
  return (catalogs[locale][key] ?? en[key as keyof typeof en] ?? key).replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
