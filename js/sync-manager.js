// js/sync-manager.js
class SyncManager {
    constructor() {
        this.autoDiscovery = new AutoDiscovery();
        this.contentIndexer = new ContentIndexer();
        
       this.syncConfig = {
        autoSyncInterval: 24 * 60 * 60 * 1000, // 24 Stunden (einmal täglich)
        maxRetries: 3,
        retryDelay: 2000,
        backupInterval: 14 * 24 * 60 * 60 * 1000, // 14 Tage
        cloudEnabled: false
    };
        
        this.syncHistory = this.loadSyncHistory();
        this.deviceInfo = this.getDeviceInfo();
        this.syncTimer = null;
        this.isOnline = navigator.onLine;
        
        this.setupEventListeners();
        this.loadConfig();
    }

    /**
     * Initialisiert den Sync-Manager
     */
    init() {
        console.log('🔄 Sync-Manager wird initialisiert...');
        
        // Erste Synchronisation
        this.performInitialSync();
        
        // Automatische Synchronisation starten
        this.startAutoSync();
        
        // Online/Offline Events überwachen
        this.setupNetworkMonitoring();
        
        // Backup-Erinnerungen einrichten
        this.setupBackupReminders();
        
        console.log('✅ Sync-Manager bereit');
    }

    /**
     * Event Listeners einrichten
     */
    setupEventListeners() {
        // Sichtbarkeits-API für Sync bei App-Fokus
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                this.quickSync();
            }
        });

        // Storage Events für Tab-Synchronisation
        window.addEventListener('storage', (e) => {
            if (e.key === 'moduleRegistry' || e.key === 'searchIndex') {
                this.handleStorageChange(e);
            }
        });

        // Vor dem Schließen syncen
        window.addEventListener('beforeunload', () => {
            this.emergencySync();
        });
    }

    /**
     * Lädt Sync-Konfiguration
     */
    loadConfig() {
        const saved = localStorage.getItem('syncConfig');
        if (saved) {
            try {
                this.syncConfig = { ...this.syncConfig, ...JSON.parse(saved) };
            } catch (error) {
                console.warn('⚠️ Sync-Config konnte nicht geladen werden:', error);
            }
        }
    }

    /**
     * Speichert Sync-Konfiguration
     */
    saveConfig() {
        localStorage.setItem('syncConfig', JSON.stringify(this.syncConfig));
    }

    /**
     * Führt erste Synchronisation beim App-Start durch
     */
    async performInitialSync() {
        console.log('🚀 Führe initiale Synchronisation durch...');
        
        try {
            // 1. Module scannen
            await this.syncModules();
            
            // 2. Content-Index aufbauen falls nötig
            await this.syncContentIndex();
            
            // 3. Nutzer-Daten synchronisieren
            await this.syncUserData();
            
            // 4. Sync-Status aktualisieren
            this.updateSyncStatus('success', 'Initiale Synchronisation abgeschlossen');
            
            console.log('✅ Initiale Synchronisation erfolgreich');
            
        } catch (error) {
            console.error('❌ Fehler bei initialer Synchronisation:', error);
            this.updateSyncStatus('error', 'Sync-Fehler: ' + error.message);
        }
    }

    /**
     * Synchronisiert Module zwischen Geräten
     */
    async syncModules() {
        console.log('📁 Synchronisiere Module...');
        
        try {
            // Aktuelle Module scannen
            const currentRegistry = await this.autoDiscovery.scanForModules();
            
            // Prüfe auf neue Module in anderen Tabs/Geräten
            const savedRegistry = this.loadRemoteRegistry();
            
            if (savedRegistry && savedRegistry.lastUpdate !== currentRegistry.lastUpdate) {
                // Merge Module aus verschiedenen Quellen
                const mergedRegistry = this.mergeRegistries(currentRegistry, savedRegistry);
                
                // Registry aktualisieren
                this.autoDiscovery.registry = mergedRegistry;
                this.autoDiscovery.saveRegistry();
                
                console.log('🔄 Module-Registry zusammengeführt');
            }
            
            // Remote-Registry aktualisieren
            this.saveRemoteRegistry(currentRegistry);
            
        } catch (error) {
            console.error('❌ Fehler beim Module-Sync:', error);
            throw error;
        }
    }

    /**
     * Synchronisiert Content-Index
     */
    async syncContentIndex() {
        console.log('🔍 Synchronisiere Content-Index...');
        
        try {
            const indexStats = this.contentIndexer.getIndexStats();
            const lastIndexUpdate = localStorage.getItem('lastIndexUpdate');
            const registryUpdate = this.autoDiscovery.registry.lastUpdate;
            
            // Index neu aufbauen wenn Module neuer sind
            if (!lastIndexUpdate || new Date(registryUpdate) > new Date(lastIndexUpdate)) {
                console.log('🔄 Index wird neu aufgebaut...');
                await this.contentIndexer.buildIndex();
                localStorage.setItem('lastIndexUpdate', new Date().toISOString());
            }
            
        } catch (error) {
            console.error('❌ Fehler beim Index-Sync:', error);
            throw error;
        }
    }

    /**
     * Synchronisiert Benutzerdaten (Notizen, Fortschritt)
     */
    async syncUserData() {
        console.log('👤 Synchronisiere Benutzerdaten...');
        
        try {
            const userData = this.collectUserData();
            const remoteUserData = this.loadRemoteUserData();
            
            if (remoteUserData) {
                const mergedData = this.mergeUserData(userData, remoteUserData);
                this.applyUserData(mergedData);
            }
            
            this.saveRemoteUserData(userData);
            
        } catch (error) {
            console.error('❌ Fehler beim User-Data-Sync:', error);
            throw error;
        }
    }

    /**
     * Sammelt alle Benutzerdaten
     */
    collectUserData() {
        const userData = {
            deviceId: this.deviceInfo.id,
            lastModified: new Date().toISOString(),
            notes: {},
            progress: {},
            settings: {
                theme: localStorage.getItem('theme'),
                syncConfig: this.syncConfig
            },
            searchHistory: JSON.parse(localStorage.getItem('searchHistory') || '[]'),
            analytics: JSON.parse(localStorage.getItem('searchAnalytics') || '[]')
        };

        // Notizen sammeln
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('notes_')) {
                const moduleId = key.replace('notes_', '');
                userData.notes[moduleId] = localStorage.getItem(key);
            } else if (key.startsWith('progress_')) {
                const moduleId = key.replace('progress_', '');
                userData.progress[moduleId] = localStorage.getItem(key);
            }
        }

        return userData;
    }

    /**
     * Führt Benutzerdaten zusammen
     */
    mergeUserData(local, remote) {
        const merged = { ...local };
        
        // Neuere Notizen bevorzugen (basierend auf Länge als Proxy für Vollständigkeit)
        Object.entries(remote.notes || {}).forEach(([moduleId, remoteNote]) => {
            const localNote = local.notes[moduleId];
            if (!localNote || remoteNote.length > localNote.length) {
                merged.notes[moduleId] = remoteNote;
            }
        });

        // Fortschritt: "completed" Status bevorzugen
        Object.entries(remote.progress || {}).forEach(([moduleId, remoteProgress]) => {
            const localProgress = local.progress[moduleId];
            if (remoteProgress === 'completed' || !localProgress) {
                merged.progress[moduleId] = remoteProgress;
            }
        });

        // Suchhistorie zusammenführen
        const combinedHistory = [...(local.searchHistory || []), ...(remote.searchHistory || [])];
        const uniqueHistory = combinedHistory.reduce((acc, item) => {
            const existing = acc.find(h => h.query === item.query);
            if (!existing || item.timestamp > existing.timestamp) {
                acc = acc.filter(h => h.query !== item.query);
                acc.push(item);
            }
            return acc;
        }, []);
        
        merged.searchHistory = uniqueHistory
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50);

        merged.lastModified = new Date().toISOString();
        return merged;
    }

    /**
     * Wendet zusammengeführte Benutzerdaten an
     */
    applyUserData(userData) {
        // Notizen anwenden
        Object.entries(userData.notes).forEach(([moduleId, note]) => {
            localStorage.setItem(`notes_${moduleId}`, note);
        });

        // Fortschritt anwenden
        Object.entries(userData.progress).forEach(([moduleId, progress]) => {
            localStorage.setItem(`progress_${moduleId}`, progress);
        });

        // Suchhistorie anwenden
        if (userData.searchHistory) {
            localStorage.setItem('searchHistory', JSON.stringify(userData.searchHistory));
        }

        // Settings anwenden
        if (userData.settings?.theme) {
            localStorage.setItem('theme', userData.settings.theme);
        }
    }

    /**
     * Führt Module-Registries zusammen
     */
    mergeRegistries(local, remote) {
        const merged = { ...local };
        
        // Module aus Remote-Registry hinzufügen
        Object.values(remote.modules || {}).forEach(remoteModule => {
            const localModule = local.modules[remoteModule.id];
            
            // Neueres Modul bevorzugen
            if (!localModule || new Date(remoteModule.lastModified) > new Date(localModule.lastModified)) {
                merged.modules[remoteModule.id] = remoteModule;
                
                // In Kategorie einfügen
                const category = remoteModule.category;
                if (!merged.categories[category]) {
                    merged.categories[category] = [];
                }
                
                const existingIndex = merged.categories[category]
                    .findIndex(m => m.id === remoteModule.id);
                
                if (existingIndex >= 0) {
                    merged.categories[category][existingIndex] = remoteModule;
                } else {
                    merged.categories[category].push(remoteModule);
                }
            }
        });

        // Gesamtzahl neu berechnen
        merged.totalModules = Object.keys(merged.modules).length;
        merged.lastUpdate = new Date().toISOString();
        
        return merged;
    }

    /**
     * Startet automatische Synchronisation
     */
    startAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }

        this.syncTimer = setInterval(() => {
            if (this.isOnline && !document.hidden) {
                this.quickSync();
            }
        }, this.syncConfig.autoSyncInterval);

        console.log(`🔄 Auto-Sync aktiviert (${this.syncConfig.autoSyncInterval / 1000}s Intervall)`);
    }

    /**
     * Führt schnelle Synchronisation durch
     */
    async quickSync() {
        try {
            console.log('⚡ Schnell-Sync...');
            
            // Nur neue Module und User-Daten syncen
            await this.syncUserData();
            
            const newModules = await this.checkForNewModules();
            if (newModules.length > 0) {
                console.log(`📁 ${newModules.length} neue Module gefunden`);
                await this.syncModules();
                
                // UI benachrichtigen
                if (window.app) {
                    window.app.updateUI();
                    this.showSyncNotification(`${newModules.length} neue Module verfügbar!`);
                }
            }
            
            this.updateSyncStatus('success', 'Synchronisation erfolgreich');
            
        } catch (error) {
            console.warn('⚠️ Schnell-Sync Fehler:', error);
            this.updateSyncStatus('warning', 'Sync-Warnung: ' + error.message);
        }
    }

    /**
     * Prüft auf neue Module
     */
    async checkForNewModules() {
        const currentModules = Object.keys(this.autoDiscovery.registry.modules);
        const remoteRegistry = this.loadRemoteRegistry();
        
        if (!remoteRegistry) return [];
        
        const remoteModules = Object.keys(remoteRegistry.modules || {});
        return remoteModules.filter(id => !currentModules.includes(id));
    }

    /**
     * Notfall-Synchronisation vor dem Schließen
     */
    emergencySync() {
        try {
            const userData = this.collectUserData();
            this.saveRemoteUserData(userData);
            console.log('💾 Notfall-Sync durchgeführt');
        } catch (error) {
            console.error('❌ Notfall-Sync fehlgeschlagen:', error);
        }
    }

    /**
     * Überwacht Netzwerk-Status
     */
    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🌐 Online - Sync wird wiederaufgenommen');
            this.quickSync();
            this.showSyncNotification('Wieder online! Synchronisiere...', 'info');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📴 Offline - Sync pausiert');
            this.showSyncNotification('Offline-Modus aktiviert', 'warning');
        });
    }

    /**
     * Backup-Erinnerungen einrichten
     */
    setupBackupReminders() {
        const lastBackup = localStorage.getItem('lastBackupDate');
        const now = Date.now();
        
        if (!lastBackup || (now - parseInt(lastBackup)) > this.syncConfig.backupInterval) {
            setTimeout(() => {
                this.showBackupReminder();
            }, 30000); // 30 Sekunden nach App-Start
        }
    }

    /**
     * Zeigt Backup-Erinnerung
     */
    showBackupReminder() {
        const reminder = document.createElement('div');
        reminder.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: linear-gradient(135deg, #ffeaa7, #fdcb6e);
            color: #2d3436;
            padding: 20px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            z-index: 1000;
            max-width: 350px;
            font-family: inherit;
        `;
        
        reminder.innerHTML = `
            <h4 style="margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                💾 Backup-Erinnerung
            </h4>
            <p style="margin: 0 0 15px 0; font-size: 0.9rem; line-height: 1.4;">
                Zeit für ein Backup deiner Lernfortschritte und Notizen!
            </p>
            <div style="display: flex; gap: 10px;">
                <button onclick="this.createBackup(); this.parentElement.parentElement.remove();" 
                        style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: #2d3436; color: white; cursor: pointer; font-weight: 500;">
                    Jetzt sichern
                </button>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="padding: 10px 15px; border: none; border-radius: 8px; background: #dfe6e9; cursor: pointer;">
                    Später
                </button>
            </div>
        `;
        
        // Backup-Funktion hinzufügen
        reminder.querySelector('button').onclick = () => {
            this.createFullBackup();
            reminder.remove();
        };
        
        document.body.appendChild(reminder);
    }

    /**
     * Erstellt vollständiges Backup
     */
    createFullBackup() {
        try {
            const backupData = {
                version: '2.0',
                type: 'full_backup',
                deviceInfo: this.deviceInfo,
                timestamp: new Date().toISOString(),
                registry: this.autoDiscovery.exportRegistry(),
                searchIndex: this.contentIndexer.exportIndex(),
                userData: this.collectUserData(),
                syncHistory: this.syncHistory
            };

            const filename = `MetabolicBase_FullBackup_${this.deviceInfo.name}_${new Date().toISOString().split('T')[0]}.json`;
            
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            
            URL.revokeObjectURL(url);
            
            localStorage.setItem('lastBackupDate', Date.now().toString());
            this.showSyncNotification(`Vollbackup erstellt: ${filename}`, 'success');
            
            console.log('💾 Vollbackup erstellt:', filename);
            
        } catch (error) {
            console.error('❌ Backup-Erstellung fehlgeschlagen:', error);
            this.showSyncNotification('Backup fehlgeschlagen: ' + error.message, 'error');
        }
    }

    /**
     * Importiert vollständiges Backup
     */
    async importFullBackup(file) {
        try {
            const text = await file.text();
            const backupData = JSON.parse(text);
            
            if (backupData.type !== 'full_backup' || !backupData.version) {
                throw new Error('Ungültiges Backup-Format');
            }

            const shouldMerge = confirm(
                `Backup von "${backupData.deviceInfo?.name || 'Unbekannt'}" importieren?\n\n` +
                `Backup-Datum: ${new Date(backupData.timestamp).toLocaleString()}\n` +
                `Module: ${backupData.registry?.totalModules || 0}\n\n` +
                `OK = Zusammenführen (empfohlen)\n` +
                `Abbrechen = Abbruch`
            );

            if (!shouldMerge) return;

            console.log('📥 Importiere Vollbackup...');

            // Registry importieren
            if (backupData.registry) {
                this.autoDiscovery.importRegistry(backupData.registry);
            }

            // Search Index importieren
            if (backupData.searchIndex) {
                this.contentIndexer.importIndex(backupData.searchIndex);
            }

            // User Data importieren
            if (backupData.userData) {
                const currentUserData = this.collectUserData();
                const mergedUserData = this.mergeUserData(currentUserData, backupData.userData);
                this.applyUserData(mergedUserData);
            }

            this.showSyncNotification('Backup erfolgreich importiert! App wird neu geladen...', 'success');
            
            // App neu laden
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('❌ Backup-Import fehlgeschlagen:', error);
            this.showSyncNotification('Backup-Import fehlgeschlagen: ' + error.message, 'error');
        }
    }

    /**
     * Storage-Änderungen behandeln (Tab-Sync)
     */
    handleStorageChange(event) {
        if (event.storageArea === localStorage) {
            console.log('🔄 Storage-Änderung erkannt:', event.key);
            
            // Registry neu laden
            if (event.key === 'moduleRegistry') {
                this.autoDiscovery.loadRegistry();
                if (window.app) {
                    window.app.updateUI();
                }
            }
            
            // Search Index neu laden
            if (event.key === 'searchIndex') {
                this.contentIndexer.loadIndex();
            }
        }
    }

    /**
     * Aktualisiert Sync-Status in der UI
     */
    updateSyncStatus(status, message) {
        const statusElement = document.getElementById('lastSyncTime');
        if (statusElement) {
            const now = new Date();
            statusElement.textContent = now.toLocaleTimeString('de-DE', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }

        // Status zur Historie hinzufügen
        this.addToSyncHistory(status, message);
    }

    /**
     * Fügt Eintrag zur Sync-Historie hinzu
     */
    addToSyncHistory(status, message) {
        const historyItem = {
            timestamp: new Date().toISOString(),
            status,
            message,
            deviceId: this.deviceInfo.id
        };

        this.syncHistory.unshift(historyItem);
        
        // Auf 100 Einträge begrenzen
        if (this.syncHistory.length > 100) {
            this.syncHistory = this.syncHistory.slice(0, 100);
        }

        this.saveSyncHistory();
    }

    /**
     * Zeigt Sync-Benachrichtigung
     */
    showSyncNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`📢 ${type.toUpperCase()}: ${message}`);
        }
    }

    /**
     * Geräteinformationen sammeln
     */
    getDeviceInfo() {
        let deviceName = localStorage.getItem('deviceName');
        if (!deviceName) {
            const userAgent = navigator.userAgent;
            if (/android/i.test(userAgent)) {
                deviceName = 'Android-Gerät';
            } else if (/iPad|iPhone|iPod/.test(userAgent)) {
                deviceName = 'iOS-Gerät';
            } else if (/Windows/.test(userAgent)) {
                deviceName = 'Windows-PC';
            } else if (/Mac/.test(userAgent)) {
                deviceName = 'Mac';
            } else {
                deviceName = 'Unbekanntes-Gerät';
            }
            deviceName += '_' + Date.now().toString(36);
            localStorage.setItem('deviceName', deviceName);
        }

        return {
            id: deviceName,
            name: deviceName.replace(/_.*/, ''),
            userAgent: navigator.userAgent,
            screen: {
                width: screen.width,
                height: screen.height
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language
        };
    }

    /**
     * LocalStorage-basierte "Remote"-Funktionen
     * (In echter Implementierung würden diese eine echte Cloud-API verwenden)
     */
    loadRemoteRegistry() {
        const saved = localStorage.getItem('remoteRegistry');
        return saved ? JSON.parse(saved) : null;
    }

    saveRemoteRegistry(registry) {
        localStorage.setItem('remoteRegistry', JSON.stringify(registry));
    }

    loadRemoteUserData() {
        const saved = localStorage.getItem('remoteUserData');
        return saved ? JSON.parse(saved) : null;
    }

    saveRemoteUserData(userData) {
        localStorage.setItem('remoteUserData', JSON.stringify(userData));
    }

    loadSyncHistory() {
        const saved = localStorage.getItem('syncHistory');
        return saved ? JSON.parse(saved) : [];
    }

    saveSyncHistory() {
        localStorage.setItem('syncHistory', JSON.stringify(this.syncHistory));
    }

    /**
     * Öffentliche API
     */
    async manualSync() {
        console.log('🔄 Manuelle Synchronisation gestartet...');
        this.showSyncNotification('Synchronisation wird durchgeführt...', 'info');
        
        try {
            await this.performInitialSync();
            this.showSyncNotification('Synchronisation erfolgreich abgeschlossen!', 'success');
        } catch (error) {
            this.showSyncNotification('Synchronisation fehlgeschlagen: ' + error.message, 'error');
            throw error;
        }
    }

    pauseAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
            console.log('⏸️ Auto-Sync pausiert');
        }
    }

    resumeAutoSync() {
        this.startAutoSync();
        console.log('▶️ Auto-Sync fortgesetzt');
    }

    getSyncStats() {
        return {
            deviceInfo: this.deviceInfo,
            syncHistory: this.syncHistory.slice(0, 10),
            config: this.syncConfig,
            isOnline: this.isOnline,
            autoSyncActive: !!this.syncTimer,
            lastSync: this.syncHistory[0]?.timestamp || null
        };
    }

    updateConfig(newConfig) {
        this.syncConfig = { ...this.syncConfig, ...newConfig };
        this.saveConfig();
        
        // Auto-Sync neu starten wenn Intervall geändert wurde
        if (newConfig.autoSyncInterval) {
            this.startAutoSync();
        }
    }
}

// Global verfügbar machen
window.SyncManager = SyncManager;
