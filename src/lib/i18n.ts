import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import nl from "@/locales/nl";
import en from "@/locales/en";

const stored = localStorage.getItem("locale");
const initial = stored === "en" || stored === "nl" ? stored : navigator.language.startsWith("en") ? "en" : "nl";

void i18n.use(initReactI18next).init({
  resources: { nl: { translation: nl }, en: { translation: en } },
  lng: initial,
  fallbackLng: "nl",
  interpolation: { escapeValue: false },
  returnObjects: true,
});

export function setLocale(locale: "nl" | "en") {
  localStorage.setItem("locale", locale);
  document.documentElement.lang = locale;
  void i18n.changeLanguage(locale);
}

document.documentElement.lang = initial;

export default i18n;
