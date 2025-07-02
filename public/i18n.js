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
            // Fallback to embedded English translations
            this.translations.en = this.getEmbeddedEnglishTranslations();
        }
    }

    getEmbeddedEnglishTranslations() {
        return {
            // Application title and navigation
            app: {
                title: "Breaker Panel Helper",
                loading: "Loading...",
                error: "Error",
                success: "Success",
                confirm: "Confirm",
                cancel: "Cancel",
                save: "Save",
                delete: "Delete",
                edit: "Edit",
                add: "Add",
                remove: "Remove",
                close: "Close",
                yes: "Yes",
                no: "No",
                ok: "OK"
            },
            
            // Panel management
            panels: {
                title: "Electrical Panels",
                currentPanel: "Current Panel:",
                newPanel: "New Panel",
                deletePanel: "Delete Panel",
                manageRooms: "Manage Rooms",
                createPanel: "Create New Panel",
                updatePanel: "Update Panel",
                panelName: "Panel Name:",
                panelSize: "Panel Size:",
                spaces: "Spaces",
                mainPanel: "Main Panel",
                subpanel: "Subpanel",
                deletePanelConfirm: "Are you sure you want to delete this panel? This will also delete all breakers and circuits.",
                panelCreated: "Panel created successfully",
                panelUpdated: "Panel updated successfully",
                panelDeleted: "Panel deleted successfully"
            },
            
            // Breaker management
            breakers: {
                editBreaker: "Edit Breaker",
                breakerLabel: "Label:",
                amperage: "Amperage:",
                criticalCircuit: "🔋 Critical Circuit",
                shouldMonitor: "📈 Should Monitor",
                testedConfirmed: "✅ Tested & Confirmed",
                breakerType: "Breaker Type:",
                singleBreaker: "Single Breaker",
                doublePoleBreaker: "Double Pole Breaker",
                tandemBreaker: "Tandem Breaker (A+B in same slot)",
                tandemBDisabled: "Tandem option controlled by slot A",
                slotPosition: "Slot Position:",
                slotA: "A (Left/Top)",
                slotB: "B (Right/Bottom)",
                none: "None",
                breakerSaved: "Breaker saved successfully",
                breakerDeleted: "Breaker deleted successfully",
                cannotCreateDoublePole: "Cannot create double pole breaker - not enough space below",
                breakerExists: "A breaker already exists at this position and slot"
            },
            
            // Circuit management
            circuits: {
                title: "Circuits",
                addCircuit: "Add Circuit",
                removeCircuit: "Remove",
                circuitNumber: "Circuit",
                room: "Room:",
                type: "Type:",
                notes: "Notes:",
                linkedPanel: "Linked Panel:",
                selectRoom: "Select Room...",
                selectPanel: "Select Panel...",
                goToPanel: "Go to Panel",
                additionalNotes: "Additional notes...",
                circuitSaved: "Circuit saved successfully",
                circuitDeleted: "Circuit deleted successfully",
                
                // Circuit types
                types: {
                    outlet: "🔵 Outlet",
                    lighting: "🟠 Lighting", 
                    heating: "🔴 Heating",
                    appliance: "🟢 Appliance",
                    subpanel: "🟣 Subpanel"
                }
            },
            
            // Room management
            rooms: {
                title: "Manage Rooms",
                addNewRoom: "Add New Room",
                existingRooms: "Existing Rooms",
                roomName: "Room Name:",
                level: "Level:",
                selectLevel: "Select Level...",
                upperLevel: "🟠 Upper Level",
                mainLevel: "🟢 Main Level",
                basement: "🔵 Basement",
                outside: "⚫ Outside",
                roomCreated: "Room created successfully",
                roomUpdated: "Room updated successfully",
                roomDeleted: "Room deleted successfully",
                roomExists: "A room with this name already exists",
                noRooms: "No rooms configured yet",
                deleteRoomConfirm: "Are you sure you want to delete \"{roomName}\"? This will remove it from all circuits.",
                upperLevel: "Upper Level",
                mainLevel: "Main Level",
                basement: "Basement",
                outside: "Outside"
            },
            
            // Circuit list view
            circuitList: {
                title: "Circuit List",
                panelName: "Circuit List - {panelName}",
                totalCircuits: "Total Circuits:",
                filteredCircuits: "Filtered:",
                search: "Search:",
                searchPlaceholder: "Search circuits, rooms, notes...",
                allRooms: "All Rooms",
                circuitType: "Circuit Type:",
                allTypes: "All Types",
                flags: "Flags:",
                critical: "🔋 Critical",
                monitor: "📈 Monitor",
                notConfirmed: "❌ Not Confirmed",
                clearAll: "Clear All",
                noCircuits: "No circuits configured for this panel.",
                noMatchingCircuits: "No circuits match the current filters.",
                clickToEdit: "Click to edit this circuit",
                
                // Table headers
                headers: {
                    breaker: "Breaker #",
                    amps: "Amps", 
                    room: "Room",
                    type: "Type",
                    notes: "Notes",
                    flags: "Flags"
                },
                
                // Flags
                flagCritical: "🔋 CRITICAL",
                flagMonitor: "📈 MONITOR", 
                flagConfirmed: "✅ CONFIRMED"
            },
            
            // View modes
            viewModes: {
                title: "View Mode:",
                normal: "Normal",
                critical: "Critical", 
                monitor: "Monitor"
            },
            
            // Display modes
            displayModes: {
                title: "Display:",
                panelView: "Panel View",
                circuitList: "Circuit List",
                printPanel: "🖨️ Print Panel"
            },
            
            // Validation messages
            validation: {
                required: "This field is required",
                invalidName: "Name is required and must be a non-empty string",
                invalidSize: "Size must be a number between 12 and 42",
                invalidAmperage: "Amperage must be between 1 and 200",
                invalidPosition: "Valid position is required",
                invalidPanelId: "Valid panel ID is required",
                invalidLevel: "Level must be one of: basement, main, upper, outside",
                invalidCircuitType: "Circuit type must be one of: outlet, lighting, heating, appliance, subpanel",
                invalidSlotPosition: "Slot position must be one of: single, A, B"
            },
            
            // Error messages
            errors: {
                networkError: "Network error: Unable to connect to server",
                loadPanels: "Failed to load panels",
                loadBreakers: "Failed to load breakers", 
                loadCircuits: "Failed to load circuits",
                loadRooms: "Failed to load rooms",
                saveBreaker: "Failed to save breaker",
                saveCircuit: "Failed to save circuit",
                saveRoom: "Failed to save room",
                deleteBreaker: "Failed to delete breaker",
                deleteCircuit: "Failed to delete circuit",
                deleteRoom: "Failed to delete room",
                panelNotFound: "Panel not found",
                breakerNotFound: "Breaker not found",
                circuitNotFound: "Circuit not found",
                roomNotFound: "Room not found",
                applicationInit: "Application initialization failed",
                cannotDeleteLastPanel: "Cannot delete the last panel"
            },
            
            // Print
            print: {
                title: "Electrical Panel: {panelName}",
                printed: "Printed:",
                noPanelSelected: "No panel selected to print",
                panelNotAvailable: "Panel not available for printing"
            },
            
            // Language selector
            language: {
                title: "Language:",
                english: "English",
                french: "Français"
            }
        };
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