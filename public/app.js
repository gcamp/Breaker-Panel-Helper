/**
 * Breaker Panel Helper - Main Application
 * Manages electrical panel breakers with comprehensive circuit tracking
 */

// Constants
const CIRCUIT_TYPES = ['outlet', 'lighting', 'heating', 'appliance', 'subpanel'];
const VIEW_MODES = ['normal', 'critical', 'monitor'];
const DISPLAY_MODES = ['panel', 'circuit-list'];

/**
 * Main Application Class
 */
class BreakerPanelApp {
    constructor() {
        this.api = new ApiClient();
        this.currentPanel = null;
        this.allPanels = [];
        this.currentBreaker = null;
        this.circuitCounter = 0;
        this.existingCircuits = [];
        this.allCircuitData = [];
        this.currentSort = { column: 'breaker', direction: 'asc' };
        
        // Initialize modules
        this.panelRenderer = new PanelRenderer(this);
        this.circuitListManager = new CircuitListManager(this);
        
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            await this.loadDefaultPanel();
        } catch (error) {
            this.handleError('Application initialization failed', error);
        }
    }

    // ============================================================================
    // EVENT LISTENERS
    // ============================================================================

    setupEventListeners() {
        // Panel management
        this.bindElement('new-panel', 'click', () => this.openNewPanelModal());
        this.bindElement('delete-panel', 'click', () => this.deleteCurrentPanel());
        this.bindElement('prev-panel', 'click', () => this.navigatePanel(-1));
        this.bindElement('next-panel', 'click', () => this.navigatePanel(1));
        this.bindElement('current-panel', 'change', (e) => this.switchPanel(parseInt(e.target.value)));
        
        // New panel modal
        this.bindElement('new-panel-form', 'submit', (e) => this.createNewPanel(e));
        this.bindElement('cancel-new-panel', 'click', () => this.closeNewPanelModal());
        
        // Breaker management
        this.bindElement('breaker-form', 'submit', (e) => this.saveBreakerForm(e));
        this.bindElement('cancel-edit', 'click', () => this.closeModal());
        this.bindElement('add-circuit', 'click', () => this.addCircuitForm());
        this.bindElement('breaker-double-pole', 'change', (e) => this.toggleDoublePole(e));
        
        // View mode buttons
        this.bindElement('normal-mode', 'click', () => this.setViewMode('normal'));
        this.bindElement('critical-mode', 'click', () => this.setViewMode('critical'));
        this.bindElement('monitor-mode', 'click', () => this.setViewMode('monitor'));
        
        // Display mode buttons
        this.bindElement('panel-view', 'click', () => this.setDisplayMode('panel'));
        this.bindElement('circuit-list', 'click', () => this.setDisplayMode('circuit-list'));
        
        // Circuit list filters
        this.bindElement('circuit-search', 'input', () => this.applyCircuitFilters());
        this.bindElement('room-filter', 'change', () => this.applyCircuitFilters());
        this.bindElement('type-filter', 'change', () => this.applyCircuitFilters());
        this.bindElement('critical-filter', 'change', () => this.applyCircuitFilters());
        this.bindElement('monitor-filter', 'change', () => this.applyCircuitFilters());
        this.bindElement('clear-filters', 'click', () => this.clearCircuitFilters());
        
        // Global event listeners
        this.setupGlobalListeners();
    }

    bindElement(id, event, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with ID '${id}' not found`);
        }
    }

    setupGlobalListeners() {
        // Modal close events
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.style.display = 'none';
            });
        });
        
        // Click outside modal to close
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });

        // Sortable headers for circuit list
        document.addEventListener('click', (e) => {
            const sortableHeader = e.target.closest('.sortable');
            if (sortableHeader) {
                const column = sortableHeader.dataset.column;
                this.sortCircuitList(column);
            }
        });
    }

    // ============================================================================
    // PANEL MANAGEMENT
    // ============================================================================

    async loadDefaultPanel() {
        try {
            await this.loadAllPanels();
            if (this.allPanels.length > 0) {
                this.currentPanel = this.allPanels[0];
                this.renderPanel();
            } else {
                await this.createDefaultPanel();
            }
            this.updatePanelControls();
        } catch (error) {
            this.handleError('Failed to load panels', error);
            await this.createDefaultPanel();
        }
    }

    async loadAllPanels() {
        const [panels, circuits] = await Promise.all([
            this.api.getAllPanels(),
            this.api.getAllCircuits()
        ]);
        
        // Identify subpanels
        const subpanelIds = new Set(
            circuits
                .filter(circuit => circuit.type === 'subpanel' && circuit.subpanel_id)
                .map(circuit => circuit.subpanel_id)
        );
        
        // Sort: main panels first, then subpanels
        this.allPanels = panels.sort((a, b) => {
            const aIsMain = !subpanelIds.has(a.id);
            const bIsMain = !subpanelIds.has(b.id);
            
            if (aIsMain && !bIsMain) return -1;
            if (!aIsMain && bIsMain) return 1;
            return a.name.localeCompare(b.name);
        });
        
        await this.populatePanelSelector();
    }

    async populatePanelSelector() {
        const selector = document.getElementById('current-panel');
        if (!selector) return;
        
        selector.innerHTML = '';
        
        const circuits = await this.api.getAllCircuits();
        const subpanelIds = new Set(
            circuits
                .filter(circuit => circuit.type === 'subpanel' && circuit.subpanel_id)
                .map(circuit => circuit.subpanel_id)
        );
        
        this.allPanels.forEach(panel => {
            const option = document.createElement('option');
            option.value = panel.id;
            const isMain = !subpanelIds.has(panel.id);
            const prefix = isMain ? '🏠 ' : '⚡ ';
            option.textContent = prefix + panel.name;
            selector.appendChild(option);
        });
        
        if (this.currentPanel) {
            selector.value = this.currentPanel.id;
        }
    }

    updatePanelControls() {
        const currentIndex = this.allPanels.findIndex(p => p.id === this.currentPanel?.id);
        
        this.updateElementState('prev-panel', 'disabled', currentIndex <= 0);
        this.updateElementState('next-panel', 'disabled', currentIndex >= this.allPanels.length - 1);
        this.updateElementState('delete-panel', 'disabled', this.allPanels.length <= 1);
    }

    updateElementState(id, property, value) {
        const element = document.getElementById(id);
        if (element) {
            element[property] = value;
        }
    }

    async createDefaultPanel() {
        const panelData = { name: 'Main Panel', size: 40 };
        
        try {
            this.currentPanel = await this.api.createPanel(panelData);
            this.allPanels = [this.currentPanel];
            this.renderPanel();
            this.updatePanelControls();
        } catch (error) {
            this.handleError('Failed to create default panel', error);
        }
    }

    // Panel Modal Management
    openNewPanelModal() {
        document.getElementById('panel-name').value = '';
        document.getElementById('panel-size').value = '40';
        this.showModal('new-panel-modal');
    }

    closeNewPanelModal() {
        this.hideModal('new-panel-modal');
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'block';
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
    }

    async createNewPanel(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const panelData = {
            name: formData.get('name'),
            size: parseInt(formData.get('size'))
        };

        try {
            const newPanel = await this.api.createPanel(panelData);
            this.currentPanel = newPanel;
            await this.loadAllPanels();
            this.renderPanel();
            await this.populatePanelSelector();
            this.updatePanelControls();
            this.closeNewPanelModal();
        } catch (error) {
            this.handleError('Failed to create panel', error);
        }
    }

    async switchPanel(panelId) {
        const panel = this.allPanels.find(p => p.id === panelId);
        if (panel) {
            this.currentPanel = panel;
            this.renderPanel();
            this.updatePanelControls();
            
            // Update circuit list if displayed
            if (this.isCircuitListVisible()) {
                this.loadCircuitList();
            }
        }
    }

    async navigatePanel(direction) {
        const currentIndex = this.allPanels.findIndex(p => p.id === this.currentPanel.id);
        const newIndex = currentIndex + direction;
        
        if (newIndex >= 0 && newIndex < this.allPanels.length) {
            this.currentPanel = this.allPanels[newIndex];
            this.renderPanel();
            this.updatePanelControls();
            await this.populatePanelSelector();
            
            if (this.isCircuitListVisible()) {
                this.loadCircuitList();
            }
        }
    }

    async deleteCurrentPanel() {
        if (this.allPanels.length <= 1) {
            alert('Cannot delete the last panel');
            return;
        }

        const confirmDelete = confirm(`Are you sure you want to delete "${this.currentPanel.name}"? This action cannot be undone.`);
        if (!confirmDelete) return;

        try {
            await this.api.deletePanel(this.currentPanel.id);
            await this.loadAllPanels();
            
            if (this.allPanels.length > 0) {
                this.currentPanel = this.allPanels[0];
                this.renderPanel();
                await this.populatePanelSelector();
            }
            this.updatePanelControls();
        } catch (error) {
            this.handleError('Failed to delete panel', error);
        }
    }

    // ============================================================================
    // VIEW MODE MANAGEMENT
    // ============================================================================

    setViewMode(mode) {
        const panelContainer = document.querySelector('.panel-container');
        const modeButtons = document.querySelectorAll('.mode-btn');
        
        if (!panelContainer) return;
        
        // Remove all mode classes
        panelContainer.classList.remove('critical-mode', 'monitor-mode');
        
        // Remove active class from all buttons
        modeButtons.forEach(btn => btn.classList.remove('active'));
        
        // Add the selected mode
        if (mode === 'critical') {
            panelContainer.classList.add('critical-mode');
            this.setActiveButton('critical-mode');
        } else if (mode === 'monitor') {
            panelContainer.classList.add('monitor-mode');
            this.setActiveButton('monitor-mode');
        } else {
            this.setActiveButton('normal-mode');
        }
    }

    setDisplayMode(mode) {
        const displayButtons = document.querySelectorAll('.display-btn');
        const panelContainer = document.querySelector('.panel-container');
        const circuitListContainer = document.querySelector('.circuit-list-container');
        
        if (!panelContainer || !circuitListContainer) return;
        
        // Remove active class from all buttons
        displayButtons.forEach(btn => btn.classList.remove('active'));
        
        if (mode === 'circuit-list') {
            panelContainer.style.display = 'none';
            circuitListContainer.style.display = 'block';
            this.setActiveButton('circuit-list');
            this.loadCircuitList();
        } else {
            panelContainer.style.display = 'block';
            circuitListContainer.style.display = 'none';
            this.setActiveButton('panel-view');
        }
    }

    setActiveButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) button.classList.add('active');
    }

    isCircuitListVisible() {
        const container = document.querySelector('.circuit-list-container');
        return container && container.style.display !== 'none';
    }

    // ============================================================================
    // ERROR HANDLING
    // ============================================================================

    handleError(message, error) {
        console.error(message + ':', error);
        const userMessage = error.message || 'An unexpected error occurred';
        alert(`${message}: ${userMessage}`);
    }

    // ============================================================================
    // PANEL RENDERING METHODS (Delegate to PanelRenderer)
    // ============================================================================

    renderPanel() {
        this.panelRenderer.renderPanel();
    }

    async openBreakerModal(position) {
        return this.panelRenderer.openBreakerModal(position);
    }

    addCircuitForm(circuitData = null) {
        this.panelRenderer.addCircuitForm(circuitData);
    }

    toggleDoublePole(e) {
        this.panelRenderer.toggleDoublePole(e);
    }

    async saveBreakerForm(e) {
        return this.panelRenderer.saveBreakerForm(e);
    }

    closeModal() {
        this.panelRenderer.closeModal();
    }

    // ============================================================================
    // CIRCUIT LIST METHODS (Delegate to CircuitListManager)
    // ============================================================================

    async loadCircuitList() {
        return this.circuitListManager.loadCircuitList();
    }

    applyCircuitFilters() {
        this.circuitListManager.applyCircuitFilters();
    }

    clearCircuitFilters() {
        this.circuitListManager.clearCircuitFilters();
    }

    sortCircuitList(column) {
        this.circuitListManager.sortCircuitList(column);
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    sanitizeInput(input) {
        if (typeof input === 'string') {
            return input.trim();
        }
        return input;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BreakerPanelApp();
});