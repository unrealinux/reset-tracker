import { en, type Dictionary, type DictionaryKey } from "./dictionaries/en";
import { zhCN } from "./dictionaries/zh-CN";
import { zhTW } from "./dictionaries/zh-TW";
import { ja } from "./dictionaries/ja";
import { ko } from "./dictionaries/ko";
import { es } from "./dictionaries/es";
import { ru } from "./dictionaries/ru";

export interface LocaleMeta {
  code: string;
  label: string;
  english: string;
  htmlLang: string;
  dir: "ltr" | "rtl";
}

export const LOCALES: LocaleMeta[] = [
  { code: "en", label: "English", english: "English", htmlLang: "en", dir: "ltr" },
  { code: "zh-CN", label: "简体中文", english: "Simplified Chinese", htmlLang: "zh-CN", dir: "ltr" },
  { code: "zh-TW", label: "繁體中文", english: "Traditional Chinese", htmlLang: "zh-TW", dir: "ltr" },
  { code: "ja", label: "日本語", english: "Japanese", htmlLang: "ja", dir: "ltr" },
  { code: "ko", label: "한국어", english: "Korean", htmlLang: "ko", dir: "ltr" },
  { code: "es", label: "Español", english: "Spanish", htmlLang: "es", dir: "ltr" },
  { code: "ru", label: "Русский", english: "Russian", htmlLang: "ru", dir: "ltr" },
];

export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "wr_locale";
export const TZ_COOKIE = "wr_tz";

const DICTS: Record<string, Dictionary> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ja,
  ko,
  es,
  ru,
};

/** Case-insensitive lookup so `/zh-cn` and `?lang=ZH-CN` both work. */
export function resolveLocale(input: string | null | undefined): string {
  if (!input) return DEFAULT_LOCALE;
  const lower = input.toLowerCase();
  const exact = LOCALES.find((l) => l.code.toLowerCase() === lower);
  return exact ? exact.code : DEFAULT_LOCALE;
}

export function isLocaleCode(input: string): boolean {
  return LOCALES.some((l) => l.code.toLowerCase() === input.toLowerCase());
}

export function localeMeta(code: string): LocaleMeta {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

export type Translate = (key: DictionaryKey | string, vars?: Record<string, string | number>) => string;

export function getDictionary(locale: string): Dictionary {
  const dict = DICTS[locale];
  if (!dict || locale === DEFAULT_LOCALE) return en;
  return { ...en, ...dict };
}

export function createTranslator(locale: string): Translate {
  const dict = getDictionary(locale);
  return (key, vars) => {
    let value = dict[key as string] ?? en[key as DictionaryKey] ?? (key as string);
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replaceAll(`{${name}}`, String(replacement));
      }
    }
    return value;
  };
}

/** `localizedPath("/codex", "ja")` → `/ja/codex` */
export function localizedPath(pathname: string, locale: string): string {
  const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Strips a known locale prefix. Returns the bare path and the locale found. */
export function stripLocale(pathname: string): { locale: string | null; path: string } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && isLocaleCode(segments[0])) {
    const rest = `/${segments.slice(1).join("/")}`;
    return { locale: resolveLocale(segments[0]), path: rest === "/" ? "/" : rest };
  }
  return { locale: null, path: pathname };
}

export function isDictionaryKey(value: string): value is DictionaryKey {
  return value in en;
}
