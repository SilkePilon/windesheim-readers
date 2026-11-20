import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import nl from "@/locales/nl";
import { makeLatestOnly, makeLocaleLoader } from "@/lib/locale-load";
import { storageGet, storageSet } from "@/lib/storage";

// Logged out: the last language used on this device, else the browser language. Once
// logged in, the saved user locale wins (`useSavedLocale` applies it and stores it here,
// so the next load starts in the right language).
const stored = storageGet("locale");
const initial = stored === "en" || stored === "nl" ? stored : navigator.language.startsWith("en") ? "en" : "nl";

void i18n.use(initReactI18next).init({
  resources: { nl: { translation: nl } },
  lng: initial,
  fallbackLng: "nl",
  interpolation: { escapeValue: false },
  returnObjects: true,
});

// English is a separate chunk, fetched only when it is needed.
export const ensureLocale = makeLocaleLoader(
  (l, b) => i18n.addResourceBundle(l, "translation", b, true, true),
  () => import("@/locales/en"),
);

const beginLocaleRequest = makeLatestOnly();

export function setLocale(locale: "nl" | "en") {
  storageSet("locale", locale);
  document.documentElement.lang = locale;
  const isLatest = beginLocaleRequest();
  if (i18n.language === locale && i18n.hasResourceBundle(locale, "translation")) return;
  // On failure stay on the current language; a stale request never overrides a newer one.
  ensureLocale(locale)
    .then(() => {
      if (isLatest()) return i18n.changeLanguage(locale);
    })
    .catch(() => {});
}

document.documentElement.lang = initial;

export default i18n;
