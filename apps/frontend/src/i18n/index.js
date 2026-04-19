// Fase 6.5 — Infraestructura i18n.
// Idioma base: es (México). Solo la landing está traducida como prueba de
// concepto; el resto de la app queda en español fijo hasta que haya demanda
// real de otro idioma.
//
// Para traducir una nueva pantalla:
//   1. Añadir las keys en `locales/es.json` y `locales/en.json`.
//   2. En el componente: import { useTranslation } from 'react-i18next';
//      const { t } = useTranslation();
//      ...<h1>{t('mi.key')}</h1>
//
// El idioma se detecta del navegador (navigator.language) o del localStorage
// si el usuario lo cambió manualmente vía LanguageSwitcher.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import es from './locales/es.json';
import en from './locales/en.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            es: { translation: es },
            en: { translation: en },
        },
        fallbackLng: 'es',
        supportedLngs: ['es', 'en'],
        interpolation: {
            escapeValue: false, // React ya escapa
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'mp_lang',
        },
    });

export default i18n;
