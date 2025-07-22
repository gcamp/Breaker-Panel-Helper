/**
 * Internationalization (i18n) Framework
 * Handles language switching and text translation
 */
class I18n {
    constructor() {
        this.currentLanguage = localStorage.getItem('language') || 'en';
        this.translations = {};
        this.fallbackLanguage = 'en';
        this.observers = [];
        
        this.init();
    }

    async init() {
        await this.loadTranslations();
        this.applyLanguage();
        this.setupLanguageSelector();
    }

    async loadTranslations() {
        try {
            // Load all available translations
            const languages = ['en', 'fr'];
            
            for (const lang of languages) {
                const response = await fetch(`/locales/${lang}.json`);
                if (response.ok) {
                    this.translations[lang] = await response.json();
                } else {
                    console.warn(`Could not load translations for ${lang}`);
                }
            }
        } catch (error) {
            console.error('Failed to load translations:', error);
        }
    }


    /**
     * Get translated text for a key
     * @param {string} key - Translation key (e.g., 'app.title')
     * @param {Object} params - Parameters for string interpolation
     * @returns {string} Translated text
     */
    t(key, params = {}) {
        const translation = this.getTranslation(key);
        return this.interpolate(translation, params);
    }

    getTranslation(key) {
        const keys = key.split('.');
        let translation = this.translations[this.currentLanguage];
        
        // Try current language
        for (const k of keys) {
            if (translation && typeof translation === 'object' && k in translation) {
                translation = translation[k];
            } else {
                translation = null;
                break;
            }
        }
        
        // Fallback to default language if not found
        if (!translation && this.currentLanguage !== this.fallbackLanguage) {
            translation = this.translations[this.fallbackLanguage];
            for (const k of keys) {
                if (translation && typeof translation === 'object' && k in translation) {
                    translation = translation[k];
                } else {
                    translation = key; // Return key if translation not found
                    break;
                }
            }
        }
        
        return translation || key;
    }

    interpolate(text, params) {
        if (typeof text !== 'string') return text;
        
        return text.replace(/{(\w+)}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }

    /**
     * Change language
     * @param {string} language - Language code (e.g., 'en', 'fr')
     */
    async setLanguage(language) {
        if (language === this.currentLanguage) return;
        
        this.currentLanguage = language;
        localStorage.setItem('language', language);
        
        // Load translations if not already loaded
        if (!this.translations[language]) {
            await this.loadTranslations();
        }
        
        this.applyLanguage();
        this.notifyObservers();
    }

    applyLanguage() {
        // Update HTML lang attribute
        document.documentElement.lang = this.currentLanguage;
        
        // Update all elements with data-i18n attributes
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const params = element.getAttribute('data-i18n-params');
            const parsedParams = params ? JSON.parse(params) : {};
            
            element.textContent = this.t(key, parsedParams);
        });
        
        // Update placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.t(key);
        });
        
        // Update titles
        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            element.title = this.t(key);
        });
    }

    setupLanguageSelector() {
        // Create language selector if it doesn't exist
        if (!document.getElementById('language-selector')) {
            this.createLanguageSelector();
        }
        
        // Update language selector
        const selector = document.getElementById('language-selector');
        if (selector) {
            selector.value = this.currentLanguage;
            selector.addEventListener('change', (e) => {
                this.setLanguage(e.target.value);
            });
        }
    }

    createLanguageSelector() {
        const controls = document.querySelector('.controls');
        if (!controls) return;
        
        const languageContainer = document.createElement('div');
        languageContainer.className = 'language-selector-container';
        languageContainer.innerHTML = `
            <label for="language-selector" data-i18n="language.title">Language:</label>
            <select id="language-selector">
                <option value="en" data-i18n="language.english">English</option>
                <option value="fr" data-i18n="language.french">Français</option>
            </select>
        `;
        
        controls.appendChild(languageContainer);
    }

    /**
     * Subscribe to language change events
     * @param {Function} callback - Callback function
     */
    subscribe(callback) {
        this.observers.push(callback);
    }

    /**
     * Unsubscribe from language change events
     * @param {Function} callback - Callback function
     */
    unsubscribe(callback) {
        this.observers = this.observers.filter(obs => obs !== callback);
    }

    notifyObservers() {
        this.observers.forEach(callback => callback(this.currentLanguage));
    }

    /**
     * Get available languages
     * @returns {Array} Array of language codes
     */
    getAvailableLanguages() {
        return Object.keys(this.translations);
    }

    /**
     * Get current language
     * @returns {string} Current language code
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }
}

// Create global i18n instance
window.i18n = new I18n();