/**
 * Circuit List Manager - Handles circuit list view, filtering, and sorting
 */
class CircuitListManager {
    constructor(app) {
        this.app = app;
    }

    async loadCircuitList() {
        if (!this.app.currentPanel) return;
        
        try {
            const [breakers, allCircuits] = await Promise.all([
                this.app.api.getBreakersByPanel(this.app.currentPanel.id),
                this.app.api.getAllCircuits()
            ]);
            
            // Filter circuits for current panel's breakers
            const breakerIds = breakers.map(b => b.id);
            const panelCircuits = allCircuits.filter(c => breakerIds.includes(c.breaker_id));
            
            // Store circuit data for filtering
            this.app.allCircuitData = panelCircuits.map(circuit => {
                const breaker = breakers.find(b => b.id === circuit.breaker_id);
                return { circuit, breaker };
            });
            
            this.sortCircuitData();
            this.updateCircuitListHeader();
            this.populateRoomFilter();
            this.resetSortHeaders();
            this.applyCircuitFilters();
            
        } catch (error) {
            this.app.handleError('Failed to load circuit list', error);
            this.app.allCircuitData = [];
            this.displayFilteredCircuits([]);
        }
    }

    updateCircuitListHeader() {
        const panelNameElement = document.getElementById('circuit-list-panel-name');
        const totalCircuitsElement = document.getElementById('total-circuits');
        
        if (panelNameElement) {
            panelNameElement.textContent = this.app.currentPanel.name;
        }
        if (totalCircuitsElement) {
            totalCircuitsElement.textContent = this.app.allCircuitData.length;
        }
    }

    populateRoomFilter() {
        const roomFilter = document.getElementById('room-filter');
        if (!roomFilter) return;
        
        const rooms = [...new Set(this.app.allCircuitData
            .map(item => item.circuit.room)
            .filter(room => room && room.trim() !== '')
        )].sort();
        
        roomFilter.innerHTML = '<option value="">All Rooms</option>';
        
        rooms.forEach(room => {
            const option = document.createElement('option');
            option.value = room;
            option.textContent = room;
            roomFilter.appendChild(option);
        });
    }

    applyCircuitFilters() {
        if (!this.app.allCircuitData || this.app.allCircuitData.length === 0) {
            this.displayFilteredCircuits([]);
            return;
        }
        
        const filters = this.getFilterValues();
        const filteredData = this.filterCircuitData(filters);
        this.displayFilteredCircuits(filteredData);
    }

    getFilterValues() {
        return {
            searchTerm: this.getElementValue('circuit-search', '').toLowerCase(),
            room: this.getElementValue('room-filter', ''),
            type: this.getElementValue('type-filter', ''),
            critical: this.getElementChecked('critical-filter'),
            monitor: this.getElementChecked('monitor-filter')
        };
    }

    getElementValue(id, defaultValue = '') {
        const element = document.getElementById(id);
        return element ? element.value : defaultValue;
    }

    getElementChecked(id) {
        const element = document.getElementById(id);
        return element ? element.checked : false;
    }

    filterCircuitData(filters) {
        return this.app.allCircuitData.filter(({ circuit, breaker }) => {
            // Text search
            if (filters.searchTerm) {
                const searchableText = [
                    breaker.label || '',
                    circuit.room || '',
                    circuit.notes || '',
                    circuit.type || '',
                    breaker.position.toString()
                ].join(' ').toLowerCase();
                
                if (!searchableText.includes(filters.searchTerm)) {
                    return false;
                }
            }
            
            // Room filter
            if (filters.room && circuit.room !== filters.room) {
                return false;
            }
            
            // Type filter
            if (filters.type && circuit.type !== filters.type) {
                return false;
            }
            
            // Flag filters
            if (filters.critical && !breaker.critical) {
                return false;
            }
            
            if (filters.monitor && !breaker.monitor) {
                return false;
            }
            
            return true;
        });
    }

    displayFilteredCircuits(filteredData) {
        const tableBody = document.getElementById('circuit-table-body');
        const filteredCount = document.getElementById('filtered-circuits');
        
        if (!tableBody) return;
        
        if (filteredCount) {
            filteredCount.textContent = filteredData.length;
        }
        
        tableBody.innerHTML = '';
        
        if (filteredData.length === 0) {
            this.showNoCircuitsMessage(tableBody);
            return;
        }
        
        filteredData.forEach(({ circuit, breaker }) => {
            const row = this.createCircuitRow(circuit, breaker);
            tableBody.appendChild(row);
        });
        
        this.bindCircuitRowEvents(tableBody);
    }

    showNoCircuitsMessage(tableBody) {
        const message = this.app.allCircuitData.length === 0 
            ? 'No circuits configured for this panel.'
            : 'No circuits match the current filters.';
        
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="no-circuits-message">
                    ${message}
                </td>
            </tr>
        `;
    }

    createCircuitRow(circuit, breaker) {
        const row = document.createElement('tr');
        
        // Breaker number with double pole indicator
        const breakerNumberHtml = breaker.double_pole 
            ? `${breaker.position}-${breaker.position + 2}<span class="double-pole-indicator">2P</span>`
            : breaker.position;
        
        // Circuit type with colored pill
        const circuitTypeHtml = circuit.type 
            ? `<span class="circuit-type-pill circuit-type-${circuit.type}">${circuit.type}</span>`
            : '<span class="circuit-type-pill no-type">-</span>';
        
        // Flags
        const flags = [];
        if (breaker.critical) flags.push('<span class="flag-badge flag-critical">CRITICAL</span>');
        if (breaker.monitor) flags.push('<span class="flag-badge flag-monitor">MONITOR</span>');
        const flagsHtml = flags.length > 0 ? `<div class="flags-cell">${flags.join('')}</div>` : '';
        
        // Linked panel
        let linkedPanelHtml = '';
        if (circuit.type === 'subpanel' && circuit.subpanel_id) {
            const linkedPanel = this.app.allPanels.find(p => p.id === circuit.subpanel_id);
            if (linkedPanel) {
                linkedPanelHtml = `<a href="#" class="linked-panel-link" data-panel-id="${linkedPanel.id}">${linkedPanel.name}</a>`;
            }
        }
        
        row.innerHTML = `
            <td class="breaker-number-cell">${breakerNumberHtml}</td>
            <td>${breaker.label || '-'}</td>
            <td class="amperage-cell">${breaker.amperage ? breaker.amperage + 'A' : '-'}</td>
            <td>${circuit.room || '-'}</td>
            <td>${circuitTypeHtml}</td>
            <td>${circuit.notes || '-'}</td>
            <td>${flagsHtml}</td>
            <td>${linkedPanelHtml}</td>
        `;
        
        return row;
    }

    bindCircuitRowEvents(tableBody) {
        // Handle linked panel navigation
        tableBody.querySelectorAll('.linked-panel-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const panelId = parseInt(e.target.dataset.panelId);
                this.app.setDisplayMode('panel');
                this.app.switchPanel(panelId);
            });
        });
    }

    clearCircuitFilters() {
        this.setElementValue('circuit-search', '');
        this.setElementValue('room-filter', '');
        this.setElementValue('type-filter', '');
        this.setElementChecked('critical-filter', false);
        this.setElementChecked('monitor-filter', false);
        
        this.resetSortHeaders();
        this.sortCircuitData();
        this.applyCircuitFilters();
    }

    setElementValue(id, value) {
        const element = document.getElementById(id);
        if (element) element.value = value;
    }

    setElementChecked(id, checked) {
        const element = document.getElementById(id);
        if (element) element.checked = checked;
    }

    // ============================================================================
    // SORTING FUNCTIONALITY
    // ============================================================================

    sortCircuitList(column) {
        // Toggle direction if same column, otherwise set to ascending
        if (this.app.currentSort.column === column) {
            this.app.currentSort.direction = this.app.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.app.currentSort.column = column;
            this.app.currentSort.direction = 'asc';
        }
        
        this.updateSortHeaders();
        this.sortCircuitData();
        this.applyCircuitFilters();
    }

    updateSortHeaders() {
        // Remove active classes from all headers
        document.querySelectorAll('.sortable').forEach(header => {
            header.classList.remove('active', 'asc', 'desc');
            const indicator = header.querySelector('.sort-indicator');
            if (indicator) indicator.textContent = '';
        });
        
        // Add active class to current sort column
        const activeHeader = document.querySelector(`[data-column="${this.app.currentSort.column}"]`);
        if (activeHeader) {
            activeHeader.classList.add('active', this.app.currentSort.direction);
            const indicator = activeHeader.querySelector('.sort-indicator');
            if (indicator) {
                indicator.textContent = this.app.currentSort.direction === 'asc' ? '▲' : '▼';
            }
        }
    }

    resetSortHeaders() {
        this.app.currentSort = { column: 'breaker', direction: 'asc' };
        this.updateSortHeaders();
    }

    sortCircuitData() {
        this.app.allCircuitData.sort((a, b) => {
            const { column, direction } = this.app.currentSort;
            const [valueA, valueB] = this.getSortValues(a, b, column);
            
            let comparison = 0;
            if (typeof valueA === 'number' && typeof valueB === 'number') {
                comparison = valueA - valueB;
            } else {
                comparison = valueA.toString().localeCompare(valueB.toString());
            }
            
            return direction === 'asc' ? comparison : -comparison;
        });
    }

    getSortValues(a, b, column) {
        let valueA, valueB;
        
        switch (column) {
            case 'breaker':
                valueA = a.breaker.position;
                valueB = b.breaker.position;
                break;
            case 'label':
                valueA = (a.breaker.label || '').toLowerCase();
                valueB = (b.breaker.label || '').toLowerCase();
                break;
            case 'amperage':
                valueA = a.breaker.amperage || 0;
                valueB = b.breaker.amperage || 0;
                break;
            case 'room':
                valueA = (a.circuit.room || '').toLowerCase();
                valueB = (b.circuit.room || '').toLowerCase();
                break;
            case 'type':
                valueA = (a.circuit.type || '').toLowerCase();
                valueB = (b.circuit.type || '').toLowerCase();
                break;
            case 'notes':
                valueA = (a.circuit.notes || '').toLowerCase();
                valueB = (b.circuit.notes || '').toLowerCase();
                break;
            case 'flags':
                // Sort by number of flags, then by type
                const flagsA = (a.breaker.critical ? 2 : 0) + (a.breaker.monitor ? 1 : 0);
                const flagsB = (b.breaker.critical ? 2 : 0) + (b.breaker.monitor ? 1 : 0);
                valueA = flagsA;
                valueB = flagsB;
                break;
            case 'linked':
                valueA = this.getLinkedPanelName(a.circuit);
                valueB = this.getLinkedPanelName(b.circuit);
                break;
            default:
                valueA = valueB = '';
        }
        
        return [valueA, valueB];
    }

    getLinkedPanelName(circuit) {
        if (circuit.type === 'subpanel' && circuit.subpanel_id) {
            const panel = this.app.allPanels.find(p => p.id === circuit.subpanel_id);
            return panel ? panel.name.toLowerCase() : '';
        }
        return '';
    }
}