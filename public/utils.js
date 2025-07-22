class DOMUtils {
    static getElement(id, defaultValue = null) {
        const element = document.getElementById(id);
        return element || defaultValue;
    }

    static getElementValue(id, defaultValue = '') {
        const element = document.getElementById(id);
        return element ? element.value : defaultValue;
    }

    static getElementChecked(id, defaultValue = false) {
        const element = document.getElementById(id);
        return element ? element.checked : defaultValue;
    }

    static setElementValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = Boolean(value);
            } else {
                element.value = value;
            }
        }
    }

    static setElementChecked(id, checked) {
        const element = document.getElementById(id);
        if (element) {
            element.checked = Boolean(checked);
        }
    }

    static toggleClass(id, className, condition) {
        const element = document.getElementById(id);
        if (element) {
            if (condition) {
                element.classList.add(className);
            } else {
                element.classList.remove(className);
            }
        }
    }

    static addClass(id, className) {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add(className);
        }
    }

    static removeClass(id, className) {
        const element = document.getElementById(id);
        if (element) {
            element.classList.remove(className);
        }
    }

    static showElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'block';
        }
    }

    static hideElement(id) {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
        }
    }
}

class ValidationUtils {
    static isValidId(id) {
        return Number.isInteger(id) && id > 0;
    }

    static isValidPosition(position) {
        return Number.isInteger(position) && position > 0;
    }

    static isValidString(str, minLength = 1) {
        return typeof str === 'string' && str.trim().length >= minLength;
    }

    static isValidNumber(num, min = -Infinity, max = Infinity) {
        return typeof num === 'number' && !isNaN(num) && num >= min && num <= max;
    }

    static parseIntSafe(value, defaultValue = null) {
        const parsed = parseInt(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }
}

class ModalUtils {
    static showModal(modalId) {
        DOMUtils.showElement(modalId);
    }

    static hideModal(modalId) {
        DOMUtils.hideElement(modalId);
    }

    static toggleModal(modalId, show) {
        if (show) {
            ModalUtils.showModal(modalId);
        } else {
            ModalUtils.hideModal(modalId);
        }
    }
}

class AsyncUtils {
    static async handleAsyncOperation(operation, errorMessage = 'Operation failed') {
        try {
            return await operation();
        } catch (error) {
            console.error(errorMessage, error);
            throw error;
        }
    }

    static async loadMultiple(operations) {
        return await Promise.all(operations);
    }
}

class PanelUtils {
    static createPanelOptions(panels, circuits) {
        const subpanelIds = new Set(
            circuits
                .filter(circuit => circuit.type === 'subpanel' && circuit.subpanel_id)
                .map(circuit => circuit.subpanel_id)
        );
        
        return panels.map(panel => {
            const isMain = !subpanelIds.has(panel.id);
            const prefix = isMain ? '🏠 ' : '⚡ ';
            return {
                value: panel.id,
                text: prefix + panel.name,
                panel
            };
        });
    }

    static sortPanelsMainFirst(panels, circuits) {
        const subpanelIds = new Set(
            circuits
                .filter(circuit => circuit.type === 'subpanel' && circuit.subpanel_id)
                .map(circuit => circuit.subpanel_id)
        );
        
        return panels.sort((a, b) => {
            const aIsMain = !subpanelIds.has(a.id);
            const bIsMain = !subpanelIds.has(b.id);
            
            if (aIsMain && !bIsMain) return -1;
            if (!aIsMain && bIsMain) return 1;
            return a.name.localeCompare(b.name);
        });
    }
}

class FormUtils {
    static getFormValue(element, defaultValue = '') {
        if (!element) return defaultValue;
        
        if (element.type === 'checkbox') {
            return element.checked;
        }
        return element.value || defaultValue;
    }

    static setFormValue(element, value) {
        if (!element) return;
        
        if (element.type === 'checkbox') {
            element.checked = Boolean(value);
        } else {
            element.value = value || '';
        }
    }

    static clearForm(formId) {
        const form = document.getElementById(formId);
        if (form) {
            form.reset();
        }
    }

    static getFormData(formElement) {
        const formData = new FormData(formElement);
        const data = {};
        
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        return data;
    }
}

class CollectionUtils {
    static groupBy(array, keySelector) {
        return array.reduce((groups, item) => {
            const key = keySelector(item);
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
            return groups;
        }, {});
    }

    static uniqueValues(array, keySelector = (item) => item) {
        return [...new Set(array.map(keySelector))];
    }

    static filterAndSort(array, filterFn, sortFn) {
        return array.filter(filterFn).sort(sortFn);
    }
}

class ErrorUtils {
    static handleError(context, message, error) {
        console.error(`${context}: ${message}`, error);
        const userMessage = error.message || 'An unexpected error occurred';
        alert(`${message}: ${userMessage}`);
    }

    static showSuccess(message) {
        console.log('Success:', message);
        alert(message);
    }

    static showNotification(message) {
        console.log('Notification:', message);
        alert(message);
    }
}

class UIStateUtils {
    static updateElementState(id, property, value) {
        const element = document.getElementById(id);
        if (element) {
            element[property] = value;
        }
    }

    static bindElement(id, event, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with ID '${id}' not found`);
        }
    }

    static setActiveButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) button.classList.add('active');
    }
}

window.DOMUtils = DOMUtils;
window.ValidationUtils = ValidationUtils;
window.ModalUtils = ModalUtils;
window.AsyncUtils = AsyncUtils;
window.PanelUtils = PanelUtils;
window.FormUtils = FormUtils;
window.CollectionUtils = CollectionUtils;
window.ErrorUtils = ErrorUtils;
window.UIStateUtils = UIStateUtils;