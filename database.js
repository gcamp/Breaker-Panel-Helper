class Database {
    constructor() {
        this.dbName = 'breaker_panel_db';
        this.version = 1;
        this.db = null;
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('Database failed to open');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database opened successfully');
                resolve();
            };

            request.onupgradeneeded = (e) => {
                this.db = e.target.result;
                
                if (!this.db.objectStoreNames.contains('panels')) {
                    const panelStore = this.db.createObjectStore('panels', { keyPath: 'id', autoIncrement: true });
                    panelStore.createIndex('name', 'name', { unique: false });
                }

                if (!this.db.objectStoreNames.contains('breakers')) {
                    const breakerStore = this.db.createObjectStore('breakers', { keyPath: 'id', autoIncrement: true });
                    breakerStore.createIndex('panel_id', 'panel_id', { unique: false });
                    breakerStore.createIndex('position', 'position', { unique: false });
                }

                if (!this.db.objectStoreNames.contains('circuits')) {
                    const circuitStore = this.db.createObjectStore('circuits', { keyPath: 'id', autoIncrement: true });
                    circuitStore.createIndex('breaker_id', 'breaker_id', { unique: false });
                }

                console.log('Database setup complete');
            };
        });
    }

    async savePanel(panelData) {
        const transaction = this.db.transaction(['panels'], 'readwrite');
        const store = transaction.objectStore('panels');
        return store.put(panelData);
    }

    async getPanel(id) {
        const transaction = this.db.transaction(['panels'], 'readonly');
        const store = transaction.objectStore('panels');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllPanels() {
        const transaction = this.db.transaction(['panels'], 'readonly');
        const store = transaction.objectStore('panels');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async saveBreaker(breakerData) {
        const transaction = this.db.transaction(['breakers'], 'readwrite');
        const store = transaction.objectStore('breakers');
        return new Promise((resolve, reject) => {
            const request = store.put(breakerData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getBreaker(id) {
        const transaction = this.db.transaction(['breakers'], 'readonly');
        const store = transaction.objectStore('breakers');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getBreakersByPanel(panelId) {
        const transaction = this.db.transaction(['breakers'], 'readonly');
        const store = transaction.objectStore('breakers');
        const index = store.index('panel_id');
        return new Promise((resolve, reject) => {
            const request = index.getAll(panelId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getBreakerByPosition(panelId, position) {
        const transaction = this.db.transaction(['breakers'], 'readonly');
        const store = transaction.objectStore('breakers');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const breakers = request.result;
                const breaker = breakers.find(b => b.panel_id === panelId && b.position === position);
                resolve(breaker);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteBreaker(id) {
        const transaction = this.db.transaction(['breakers'], 'readwrite');
        const store = transaction.objectStore('breakers');
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async saveCircuit(circuitData) {
        const transaction = this.db.transaction(['circuits'], 'readwrite');
        const store = transaction.objectStore('circuits');
        return new Promise((resolve, reject) => {
            const request = store.put(circuitData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getCircuitsByBreaker(breakerId) {
        const transaction = this.db.transaction(['circuits'], 'readonly');
        const store = transaction.objectStore('circuits');
        const index = store.index('breaker_id');
        return new Promise((resolve, reject) => {
            const request = index.getAll(breakerId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteCircuit(id) {
        const transaction = this.db.transaction(['circuits'], 'readwrite');
        const store = transaction.objectStore('circuits');
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteCircuitsByBreaker(breakerId) {
        const circuits = await this.getCircuitsByBreaker(breakerId);
        const promises = circuits.map(circuit => this.deleteCircuit(circuit.id));
        return Promise.all(promises);
    }
}