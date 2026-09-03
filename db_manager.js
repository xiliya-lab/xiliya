// db_manager.js
const DB_NAME = 'OmniDB';
const DB_VERSION = 2; // 提升版本号以触发更新

const dbManager = {
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('scenarios')) {
                    db.createObjectStore('scenarios', { keyPath: 'id', autoIncrement: true });
                }
                // 新增：存档表
                if (!db.objectStoreNames.contains('saves')) {
                    db.createObjectStore('saves', { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject('数据库初始化失败: ' + event.target.errorCode);
            };
        });
    },

    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key: key, value: value });
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    },

    async getSetting(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = (e) => reject(e);
        });
    },

    async saveScenario(scenarioData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scenarios'], 'readwrite');
            const store = transaction.objectStore('scenarios');
            const request = store.add(scenarioData);
            request.onsuccess = (e) => resolve(e.target.result); 
            request.onerror = (e) => reject(e);
        });
    },

    async getAllScenarios() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scenarios'], 'readonly');
            const store = transaction.objectStore('scenarios');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    },

    async saveGame(saveData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['saves'], 'readwrite');
            const store = transaction.objectStore('saves');
            const request = store.add(saveData);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e);
        });
    },

    async getSavesByScenario(scenarioId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['saves'], 'readonly');
            const store = transaction.objectStore('saves');
            const request = store.getAll();
            request.onsuccess = () => {
                const filtered = request.result
                    .filter(s => s.scenarioId === scenarioId)
                    .sort((a, b) => b.timestamp - a.timestamp);
                resolve(filtered);
            };
            request.onerror = (e) => reject(e);
        });
    },

    async updateScenario(scenarioData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scenarios'], 'readwrite');
            const store = transaction.objectStore('scenarios');
            const request = store.put(scenarioData); 
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    },

    async deleteScenario(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['scenarios'], 'readwrite');
            const store = transaction.objectStore('scenarios');
            const request = store.delete(id); 
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }
};