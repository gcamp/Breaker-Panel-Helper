/**
 * Panel Renderer - Handles visual panel rendering and breaker management
 */
class PanelRenderer {
    constructor(app) {
        this.app = app;
    }

    renderPanel() {
        const panelElement = document.getElementById('breaker-panel');
        if (!panelElement || !this.app.currentPanel) return;
        
        panelElement.innerHTML = '';
        const size = this.app.currentPanel.size;
        
        for (let i = 1; i <= size; i++) {
            const breakerContainer = this.createBreakerContainer(i);
            panelElement.appendChild(breakerContainer);
        }
        
        this.loadBreakers();
    }

    createBreakerContainer(position) {
        const breakerContainer = document.createElement('div');
        breakerContainer.className = 'breaker-container';
        breakerContainer.dataset.position = position;
        
        const isLeft = position % 2 === 1;
        
        breakerContainer.innerHTML = `
            ${isLeft ? '<div class="breaker-amperage-box left"></div>' : ''}
            <div class="breaker" data-position="${position}">
                <div class="breaker-number">${position}</div>
                <div class="breaker-label"></div>
                <div class="breaker-indicators"></div>
            </div>
            ${!isLeft ? '<div class="breaker-amperage-box right"></div>' : ''}
        `;
        
        breakerContainer.querySelector('.breaker').addEventListener('click', () => {
            this.openBreakerModal(position);
        });
        
        return breakerContainer;
    }

    async loadBreakers() {
        if (!this.app.currentPanel) return;
        
        try {
            const breakers = await this.app.api.getBreakersByPanel(this.app.currentPanel.id);
            for (const breaker of breakers) {
                await this.updateBreakerDisplay(breaker);
            }
        } catch (error) {
            this.app.handleError('Failed to load breakers', error);
        }
    }

    async updateBreakerDisplay(breaker) {
        const breakerElement = document.querySelector(`[data-position="${breaker.position}"]`);
        if (!breakerElement) return;

        breakerElement.classList.add('occupied');
        
        // Handle flags
        this.updateBreakerFlags(breakerElement, breaker);
        
        // Handle double pole
        this.updateDoublePoleDisplay(breakerElement, breaker);
        
        // Update label with subpanel info
        const displayLabel = await this.getBreakerDisplayLabel(breaker);
        breakerElement.querySelector('.breaker-label').textContent = displayLabel;
        
        // Update amperage display
        this.updateAmperageDisplay(breakerElement, breaker);
        
        // Update indicators
        this.updateIndicators(breakerElement, breaker);
    }

    updateBreakerFlags(breakerElement, breaker) {
        const container = breakerElement.closest('.breaker-container');
        
        // Update classes for styling
        container.classList.toggle('critical', breaker.critical);
        container.classList.toggle('monitor', breaker.monitor);
        
        breakerElement.classList.toggle('critical', breaker.critical);
        breakerElement.classList.toggle('monitor', breaker.monitor);
    }

    updateDoublePoleDisplay(breakerElement, breaker) {
        const container = breakerElement.closest('.breaker-container');
        
        if (breaker.double_pole) {
            breakerElement.classList.add('double-pole');
            container.classList.add('double-pole-container');
            
            // Hide the breaker below
            const belowContainer = document.querySelector(`[data-position="${breaker.position + 2}"]`);
            if (belowContainer) {
                belowContainer.style.display = 'none';
            }
            
            // Update breaker number to show range
            const numberElement = breakerElement.querySelector('.breaker-number');
            numberElement.textContent = `${breaker.position}-${breaker.position + 2}`;
        } else {
            // Remove double pole styling
            breakerElement.classList.remove('double-pole');
            container.classList.remove('double-pole-container');
            
            // Restore hidden breaker
            const belowContainer = document.querySelector(`[data-position="${breaker.position + 2}"]`);
            if (belowContainer) {
                belowContainer.style.display = '';
            }
            
            // Reset breaker number
            const numberElement = breakerElement.querySelector('.breaker-number');
            numberElement.textContent = breaker.position;
        }
    }

    async getBreakerDisplayLabel(breaker) {
        let displayLabel = breaker.label || '';
        
        try {
            const circuits = await this.app.api.getCircuitsByBreaker(breaker.id);
            const subpanelCircuit = circuits.find(circuit => 
                circuit.type === 'subpanel' && circuit.subpanel_id
            );
            
            if (subpanelCircuit) {
                const linkedPanel = this.app.allPanels.find(panel => 
                    panel.id === subpanelCircuit.subpanel_id
                );
                if (linkedPanel) {
                    displayLabel = displayLabel 
                        ? `${displayLabel} → ${linkedPanel.name}` 
                        : `→ ${linkedPanel.name}`;
                    const breakerElement = document.querySelector(`[data-position="${breaker.position}"]`);
                    if (breakerElement) breakerElement.classList.add('has-subpanel');
                }
            } else {
                const breakerElement = document.querySelector(`[data-position="${breaker.position}"]`);
                if (breakerElement) breakerElement.classList.remove('has-subpanel');
            }
        } catch (error) {
            console.error('Error loading circuits for breaker:', error);
        }
        
        return displayLabel;
    }

    updateAmperageDisplay(breakerElement, breaker) {
        const container = breakerElement.closest('.breaker-container');
        const amperageBox = container.querySelector('.breaker-amperage-box');
        
        if (amperageBox && breaker.amperage) {
            amperageBox.textContent = `${breaker.amperage}A`;
            amperageBox.classList.add('has-amperage');
        } else if (amperageBox) {
            amperageBox.textContent = '';
            amperageBox.classList.remove('has-amperage');
        }
    }

    updateIndicators(breakerElement, breaker) {
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
        try {
            this.app.currentBreaker = await this.app.api.getBreakerByPosition(
                this.app.currentPanel.id, 
                position
            );
            
            if (!this.app.currentBreaker) {
                this.app.currentBreaker = {
                    panel_id: this.app.currentPanel.id,
                    position: position,
                    label: '',
                    amperage: 15,
                    critical: false,
                    monitor: false,
                    double_pole: false
                };
            }

            this.populateBreakerForm();
            await this.loadCircuits();
            
            this.app.showModal('breaker-modal');
        } catch (error) {
            this.app.handleError('Failed to load breaker data', error);
        }
    }

    populateBreakerForm() {
        const breaker = this.app.currentBreaker;
        
        this.setFormValue('breaker-label', breaker.label || '');
        this.setFormValue('breaker-amperage', breaker.amperage || 15);
        this.setFormValue('breaker-critical', breaker.critical || false);
        this.setFormValue('breaker-monitor', breaker.monitor || false);
        this.setFormValue('breaker-double-pole', breaker.double_pole || false);
    }

    setFormValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = Boolean(value);
            } else {
                element.value = value;
            }
        }
    }

    async loadCircuits() {
        const circuitsContainer = document.getElementById('circuits-container');
        if (!circuitsContainer) return;
        
        circuitsContainer.innerHTML = '';
        this.app.existingCircuits = [];
        
        if (this.app.currentBreaker.id) {
            try {
                this.app.existingCircuits = await this.app.api.getCircuitsByBreaker(
                    this.app.currentBreaker.id
                );
                this.app.existingCircuits.forEach(circuit => {
                    this.addCircuitForm(circuit);
                });
            } catch (error) {
                this.app.handleError('Failed to load circuits', error);
            }
        }
    }

    addCircuitForm(circuitData = null) {
        const circuitsContainer = document.getElementById('circuits-container');
        if (!circuitsContainer) return;
        
        this.app.circuitCounter++;
        
        const circuitDiv = document.createElement('div');
        circuitDiv.className = 'circuit';
        circuitDiv.dataset.circuitId = circuitData?.id || `new-${this.app.circuitCounter}`;
        
        circuitDiv.innerHTML = this.generateCircuitFormHTML(circuitData);
        
        this.bindCircuitEvents(circuitDiv, circuitData);
        circuitsContainer.appendChild(circuitDiv);
    }

    generateCircuitFormHTML(circuitData) {
        return `
            <div class="circuit-header">
                <div class="circuit-title">Circuit ${this.app.circuitCounter}</div>
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
                        <option value="outlet" ${!circuitData?.type || circuitData?.type === 'outlet' ? 'selected' : ''}>Outlet</option>
                        <option value="lighting" ${circuitData?.type === 'lighting' ? 'selected' : ''}>Lighting</option>
                        <option value="heating" ${circuitData?.type === 'heating' ? 'selected' : ''}>Heating</option>
                        <option value="appliance" ${circuitData?.type === 'appliance' ? 'selected' : ''}>Appliance</option>
                        <option value="subpanel" ${circuitData?.type === 'subpanel' ? 'selected' : ''}>Subpanel</option>
                    </select>
                </div>
                <div class="form-group subpanel-selector" style="display: ${circuitData?.type === 'subpanel' ? 'block' : 'none'};">
                    <label>Linked Panel:</label>
                    <div class="subpanel-controls">
                        <select name="subpanel">
                            <option value="">Select Panel...</option>
                            ${this.generateSubpanelOptions(circuitData?.subpanel_id)}
                        </select>
                        ${circuitData?.subpanel_id ? `<button type="button" class="goto-panel" data-panel-id="${circuitData.subpanel_id}">Go to Panel</button>` : ''}
                    </div>
                </div>
                <div class="form-group circuit-notes">
                    <label>Notes:</label>
                    <textarea name="notes" placeholder="Additional notes...">${circuitData?.notes || ''}</textarea>
                </div>
            </div>
        `;
    }

    bindCircuitEvents(circuitDiv, circuitData) {
        // Remove circuit button
        const removeBtn = circuitDiv.querySelector('.remove-circuit');
        removeBtn.addEventListener('click', async () => {
            if (circuitData?.id) {
                try {
                    await this.app.api.deleteCircuit(circuitData.id);
                } catch (error) {
                    this.app.handleError('Failed to delete circuit', error);
                }
            }
            circuitDiv.remove();
        });
        
        // Type change handler
        const typeSelect = circuitDiv.querySelector('[name="type"]');
        typeSelect.addEventListener('change', (e) => {
            const subpanelSelector = circuitDiv.querySelector('.subpanel-selector');
            if (e.target.value === 'subpanel') {
                subpanelSelector.style.display = 'block';
            } else {
                subpanelSelector.style.display = 'none';
                subpanelSelector.querySelector('[name="subpanel"]').value = '';
            }
        });
        
        // Go to panel button
        const gotoPanelBtn = circuitDiv.querySelector('.goto-panel');
        if (gotoPanelBtn) {
            gotoPanelBtn.addEventListener('click', (e) => {
                const panelId = parseInt(e.target.dataset.panelId);
                this.app.closeModal();
                this.app.switchPanel(panelId);
            });
        }
    }

    generateSubpanelOptions(selectedId = null) {
        return this.app.allPanels
            .filter(panel => panel.id !== this.app.currentPanel.id)
            .map(panel => 
                `<option value="${panel.id}" ${selectedId == panel.id ? 'selected' : ''}>${panel.name}</option>`
            )
            .join('');
    }

    toggleDoublePole(e) {
        const isDoublePole = e.target.checked;
        const position = this.app.currentBreaker.position;
        
        if (isDoublePole && position > this.app.currentPanel.size - 2) {
            alert('Cannot create double pole breaker - not enough space below');
            e.target.checked = false;
            return;
        }
    }

    async saveBreakerForm(e) {
        e.preventDefault();
        
        try {
            const formData = new FormData(e.target);
            
            const breakerData = {
                label: formData.get('label'),
                amperage: parseInt(formData.get('amperage')),
                critical: formData.get('critical') === 'on',
                monitor: formData.get('monitor') === 'on',
                double_pole: formData.get('doublePole') === 'on'
            };

            if (this.app.currentBreaker.id) {
                await this.app.api.updateBreaker(this.app.currentBreaker.id, breakerData);
            } else {
                breakerData.panel_id = this.app.currentBreaker.panel_id;
                breakerData.position = this.app.currentBreaker.position;
                const savedBreaker = await this.app.api.createBreaker(breakerData);
                this.app.currentBreaker.id = savedBreaker.id;
            }

            Object.assign(this.app.currentBreaker, breakerData);
            
            await this.saveCircuits();
            await this.updateBreakerDisplay(this.app.currentBreaker);
            this.closeModal();
        } catch (error) {
            this.app.handleError('Failed to save breaker', error);
        }
    }

    async saveCircuits() {
        const circuitElements = document.querySelectorAll('.circuit');
        
        for (const circuitElement of circuitElements) {
            const circuitId = circuitElement.dataset.circuitId;
            const isNew = circuitId.startsWith('new-');
            
            const room = circuitElement.querySelector('[name="room"]').value;
            const type = circuitElement.querySelector('[name="type"]').value;
            const notes = circuitElement.querySelector('[name="notes"]').value;
            const subpanelSelect = circuitElement.querySelector('[name="subpanel"]');
            const subpanel_id = subpanelSelect ? subpanelSelect.value : null;
            
            const circuitData = {
                room: room || null,
                type: type || null,
                notes: notes || null,
                subpanel_id: subpanel_id && subpanel_id !== '' ? parseInt(subpanel_id) : null
            };
            
            try {
                if (isNew) {
                    if (!this.app.currentBreaker.id) {
                        console.error('Cannot save circuit: breaker has no ID');
                        continue;
                    }
                    circuitData.breaker_id = this.app.currentBreaker.id;
                    await this.app.api.createCircuit(circuitData);
                } else {
                    await this.app.api.updateCircuit(parseInt(circuitId), circuitData);
                }
            } catch (error) {
                this.app.handleError('Failed to save circuit', error);
            }
        }
    }

    closeModal() {
        this.app.hideModal('breaker-modal');
        this.app.currentBreaker = null;
        this.app.circuitCounter = 0;
        this.app.existingCircuits = [];
    }
}