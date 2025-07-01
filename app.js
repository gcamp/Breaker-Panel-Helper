class BreakerPanelApp {
    constructor() {
        this.db = new Database();
        this.currentPanel = null;
        this.currentBreaker = null;
        this.circuitCounter = 0;
        this.init();
    }

    async init() {
        await this.db.init();
        this.setupEventListeners();
        this.loadDefaultPanel();
    }

    setupEventListeners() {
        document.getElementById('create-panel').addEventListener('click', () => this.createPanel());
        document.getElementById('breaker-form').addEventListener('submit', (e) => this.saveBreakerForm(e));
        document.getElementById('cancel-edit').addEventListener('click', () => this.closeModal());
        document.getElementById('add-circuit').addEventListener('click', () => this.addCircuitForm());
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        document.getElementById('breaker-double-pole').addEventListener('change', (e) => this.toggleDoublePole(e));
        
        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('breaker-modal')) {
                this.closeModal();
            }
        });
    }

    async loadDefaultPanel() {
        const panels = await this.db.getAllPanels();
        if (panels.length > 0) {
            this.currentPanel = panels[0];
            this.renderPanel();
        } else {
            this.createPanel();
        }
    }

    async createPanel() {
        const size = parseInt(document.getElementById('panel-size').value);
        
        const panelData = {
            id: 1,
            name: 'Main Panel',
            size: size,
            created_at: new Date().toISOString()
        };

        await this.db.savePanel(panelData);
        this.currentPanel = panelData;
        this.renderPanel();
    }

    renderPanel() {
        const panelElement = document.getElementById('breaker-panel');
        panelElement.innerHTML = '';
        
        const size = this.currentPanel.size;
        
        for (let i = 1; i <= size; i++) {
            const breakerElement = document.createElement('div');
            breakerElement.className = 'breaker';
            breakerElement.dataset.position = i;
            
            const isLeft = i % 2 === 1;
            const displayNumber = isLeft ? i : i + 1;
            
            breakerElement.innerHTML = `
                <div class="breaker-number">${displayNumber}</div>
                <div class="breaker-label"></div>
                <div class="breaker-amperage"></div>
                <div class="breaker-indicators"></div>
            `;
            
            breakerElement.addEventListener('click', () => this.openBreakerModal(i));
            panelElement.appendChild(breakerElement);
        }
        
        this.loadBreakers();
    }

    async loadBreakers() {
        if (!this.currentPanel) return;
        
        const breakers = await this.db.getBreakersByPanel(this.currentPanel.id);
        
        breakers.forEach(breaker => {
            this.updateBreakerDisplay(breaker);
        });
    }

    updateBreakerDisplay(breaker) {
        const breakerElement = document.querySelector(`[data-position="${breaker.position}"]`);
        if (!breakerElement) return;

        breakerElement.classList.add('occupied');
        
        if (breaker.critical) {
            breakerElement.classList.add('critical');
        }
        
        if (breaker.monitor) {
            breakerElement.classList.add('monitor');
        }
        
        if (breaker.double_pole) {
            breakerElement.classList.add('double-pole');
            const nextBreaker = document.querySelector(`[data-position="${breaker.position + 1}"]`);
            if (nextBreaker) {
                nextBreaker.style.display = 'none';
            }
        }

        breakerElement.querySelector('.breaker-label').textContent = breaker.label || '';
        breakerElement.querySelector('.breaker-amperage').textContent = breaker.amperage ? `${breaker.amperage}A` : '';
        
        const indicators = breakerElement.querySelector('.breaker-indicators');
        indicators.innerHTML = '';
        
        if (breaker.critical) {
            const criticalIndicator = document.createElement('div');
            criticalIndicator.className = 'indicator critical';
            criticalIndicator.title = 'Critical Circuit';
            indicators.appendChild(criticalIndicator);
        }
        
        if (breaker.monitor) {
            const monitorIndicator = document.createElement('div');
            monitorIndicator.className = 'indicator monitor';
            monitorIndicator.title = 'Should Monitor';
            indicators.appendChild(monitorIndicator);
        }
    }

    async openBreakerModal(position) {
        this.currentBreaker = await this.db.getBreakerByPosition(this.currentPanel.id, position);
        
        if (!this.currentBreaker) {
            this.currentBreaker = {
                panel_id: this.currentPanel.id,
                position: position,
                label: '',
                amperage: 15,
                critical: false,
                monitor: false,
                double_pole: false
            };
        }

        document.getElementById('breaker-label').value = this.currentBreaker.label || '';
        document.getElementById('breaker-amperage').value = this.currentBreaker.amperage || 15;
        document.getElementById('breaker-critical').checked = this.currentBreaker.critical || false;
        document.getElementById('breaker-monitor').checked = this.currentBreaker.monitor || false;
        document.getElementById('breaker-double-pole').checked = this.currentBreaker.double_pole || false;
        
        await this.loadCircuits();
        
        document.getElementById('breaker-modal').style.display = 'block';
    }

    async loadCircuits() {
        const circuitsContainer = document.getElementById('circuits-container');
        circuitsContainer.innerHTML = '';
        
        if (this.currentBreaker.id) {
            const circuits = await this.db.getCircuitsByBreaker(this.currentBreaker.id);
            circuits.forEach(circuit => {
                this.addCircuitForm(circuit);
            });
        }
    }

    addCircuitForm(circuitData = null) {
        const circuitsContainer = document.getElementById('circuits-container');
        this.circuitCounter++;
        
        const circuitDiv = document.createElement('div');
        circuitDiv.className = 'circuit';
        circuitDiv.dataset.circuitId = circuitData?.id || `new-${this.circuitCounter}`;
        
        circuitDiv.innerHTML = `
            <div class="circuit-header">
                <div class="circuit-title">Circuit ${this.circuitCounter}</div>
                <button type="button" class="remove-circuit">Remove</button>
            </div>
            <div class="circuit-form">
                <div class="form-group">
                    <label>Room:</label>
                    <input type="text" name="room" value="${circuitData?.room || ''}" placeholder="e.g., Kitchen">
                </div>
                <div class="form-group">
                    <label>Type:</label>
                    <select name="type">
                        <option value="outlet" ${circuitData?.type === 'outlet' ? 'selected' : ''}>Outlet</option>
                        <option value="lighting" ${circuitData?.type === 'lighting' ? 'selected' : ''}>Lighting</option>
                        <option value="heating" ${circuitData?.type === 'heating' ? 'selected' : ''}>Heating</option>
                        <option value="appliance" ${circuitData?.type === 'appliance' ? 'selected' : ''}>Appliance</option>
                        <option value="subpanel" ${circuitData?.type === 'subpanel' ? 'selected' : ''}>Subpanel</option>
                    </select>
                </div>
                <div class="form-group circuit-notes">
                    <label>Notes:</label>
                    <textarea name="notes" placeholder="Additional notes...">${circuitData?.notes || ''}</textarea>
                </div>
            </div>
        `;
        
        circuitDiv.querySelector('.remove-circuit').addEventListener('click', () => {
            circuitDiv.remove();
        });
        
        circuitsContainer.appendChild(circuitDiv);
    }

    toggleDoublePole(e) {
        const isDoublePole = e.target.checked;
        const position = this.currentBreaker.position;
        
        if (isDoublePole && position % 2 === 0) {
            alert('Double pole breakers must start on odd positions (left side)');
            e.target.checked = false;
            return;
        }
        
        if (isDoublePole && position === this.currentPanel.size) {
            alert('Cannot create double pole breaker at the last position');
            e.target.checked = false;
            return;
        }
    }

    async saveBreakerForm(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        
        this.currentBreaker.label = formData.get('label');
        this.currentBreaker.amperage = parseInt(formData.get('amperage'));
        this.currentBreaker.critical = formData.get('critical') === 'on';
        this.currentBreaker.monitor = formData.get('monitor') === 'on';
        this.currentBreaker.double_pole = formData.get('doublePole') === 'on';
        
        const savedBreaker = await this.db.saveBreaker(this.currentBreaker);
        this.currentBreaker.id = savedBreaker.target.result;
        
        await this.saveCircuits();
        
        this.updateBreakerDisplay(this.currentBreaker);
        this.closeModal();
    }

    async saveCircuits() {
        const circuitElements = document.querySelectorAll('.circuit');
        
        for (const circuitElement of circuitElements) {
            const circuitId = circuitElement.dataset.circuitId;
            const isNew = circuitId.startsWith('new-');
            
            const room = circuitElement.querySelector('[name="room"]').value;
            const type = circuitElement.querySelector('[name="type"]').value;
            const notes = circuitElement.querySelector('[name="notes"]').value;
            
            if (room || type || notes) {
                const circuitData = {
                    breaker_id: this.currentBreaker.id,
                    room: room,
                    type: type,
                    notes: notes
                };
                
                if (!isNew) {
                    circuitData.id = parseInt(circuitId);
                }
                
                await this.db.saveCircuit(circuitData);
            }
        }
    }

    closeModal() {
        document.getElementById('breaker-modal').style.display = 'none';
        this.currentBreaker = null;
        this.circuitCounter = 0;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BreakerPanelApp();
});