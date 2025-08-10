// js/auto-discovery.js
class AutoDiscovery {
    constructor() {
        this.basePath = '/metabolic-base/modules/';
        this.categories = {
            '01-notfaelle': 'notfaelle',
            '02-befundung': 'befundung', 
            '03-differentialdiagnostik': 'differentialdiagnostik',
            '04-aminosaeuren': 'aminosaeuren',
            '05-kohlenhydrate': 'kohlenhydrate',
            '06-carnitin': 'carnitin',
            '07-energie': 'energie',
            '08-lipide': 'lipide',
            '09-purin-pyrimidin': 'purin-pyrimidin',
            '10-lysosomal': 'lysosomal',
            '11-cdg': 'cdg',
            '12-sonstige': 'sonstige'
        };
        
        this.registry = {
            version: '2.0',
            lastUpdate: null,
            totalModules: 0,
            categories: {},
            modules: {}
        };
        
        this.loadRegistry();
    }

    /**
     * Lädt das bestehende Registry aus localStorage
     */
    loadRegistry() {
        const saved = localStorage.getItem('moduleRegistry');
        if (saved) {
            try {
                this.registry = { ...this.registry, ...JSON.parse(saved) };
                console.log('📋 Registry geladen:', this.registry.totalModules, 'Module');
            } catch (error) {
                console.warn('⚠️ Registry konnte nicht geladen werden:', error);
            }
        }
    }

    /**
     * Speichert das Registry in localStorage
     */
    saveRegistry() {
        this.registry.lastUpdate = new Date().toISOString();
        localStorage.setItem('moduleRegistry', JSON.stringify(this.registry));
        localStorage.setItem('lastSync', Date.now().toString());
        console.log('💾 Registry gespeichert:', this.registry.totalModules, 'Module');
    }

    /**
     * Hauptfunktion: Scannt alle Kategorien nach HTML-Modulen
     */
    async scanForModules() {
        console.log('🔍 Starte Auto-Discovery...');
        
        // Registry zurücksetzen
        this.registry.categories = {};
        this.registry.modules = {};
        this.registry.totalModules = 0;

        // Alle Kategorien scannen
        for (const [folderName, categoryKey] of Object.entries(this.categories)) {
            await this.scanCategory(folderName, categoryKey);
        }

        // Registry speichern
        this.saveRegistry();
        
        console.log(`✅ Auto-Discovery abgeschlossen: ${this.registry.totalModules} Module gefunden`);
        return this.registry;
    }

    /**
     * Scannt eine spezifische Kategorie nach HTML-Dateien
     */
    async scanCategory(folderName, categoryKey) {
        const categoryPath = this.basePath + folderName + '/';
        
        try {
            console.log(`📁 Scanne Kategorie: ${categoryKey}`);
            
            // Versuche bekannte Dateien zu finden
            const foundModules = await this.discoverModulesInCategory(categoryPath, categoryKey);
            
            if (foundModules.length > 0) {
                this.registry.categories[categoryKey] = foundModules;
                console.log(`✓ ${foundModules.length} Module in ${categoryKey} gefunden`);
            } else {
                this.registry.categories[categoryKey] = [];
                console.log(`📭 Keine Module in ${categoryKey} gefunden`);
            }
            
        } catch (error) {
            console.warn(`⚠️ Fehler beim Scannen von ${categoryKey}:`, error);
            this.registry.categories[categoryKey] = [];
        }
    }

    /**
     * Entdeckt Module in einer Kategorie durch intelligente Methoden
     */
    async discoverModulesInCategory(categoryPath, categoryKey) {
        const modules = [];
        
        // Methode 1: Versuche häufige Dateinamen
        const commonPatterns = [
            'index.html',
            'teil1.html', 'teil2.html', 'teil3.html', 'teil4.html', 'teil5.html',
            'part1.html', 'part2.html', 'part3.html', 'part4.html', 'part5.html',
            'modul1.html', 'modul2.html', 'modul3.html', 'modul4.html', 'modul5.html',
            'grundlagen.html', 'diagnostik.html', 'therapie.html', 'klinik.html',
            'einführung.html', 'überblick.html', 'zusammenfassung.html'
        ];

        for (const pattern of commonPatterns) {
            const modulePath = categoryPath + pattern;
            const moduleData = await this.testModuleFile(modulePath, categoryKey);
            if (moduleData) {
                modules.push(moduleData);
            }
        }

        // Methode 2: Versuche kategoriebasierte Namen
        const categorySpecificPatterns = this.getCategorySpecificPatterns(categoryKey);
        for (const pattern of categorySpecificPatterns) {
            const modulePath = categoryPath + pattern;
            const moduleData = await this.testModuleFile(modulePath, categoryKey);
            if (moduleData && !modules.some(m => m.path === modulePath)) {
                modules.push(moduleData);
            }
        }

        return modules;
    }

    /**
     * Generiert kategorieSpezifische Dateinamen-Muster
     */
    getCategorySpecificPatterns(categoryKey) {
        const patterns = [];
        
        switch (categoryKey) {
            case 'notfaelle':
                patterns.push(
                    'notfall_management.html', 'akute_krisen.html', 'notfallprotokoll.html',
                    'hyperammoniaemie.html', 'hypoglykämie.html', 'ketoazidose.html'
                );
                break;
                
            case 'befundung':
                patterns.push(
                    'aminosäureanalyse.html', 'organische_säuren.html', 'systematische_befundung.html',
                    'chromatographie.html', 'massenspektrometrie.html'
                );
                break;
                
            case 'differentialdiagnostik':
                patterns.push(
                    'algorithmus.html', 'decision_tree.html', 'flowchart.html',
                    'konfirmationsdiagnostik.html', 'screening.html'
                );
                break;
                
            case 'aminosaeuren':
                patterns.push(
                    'aminosäurestörungen.html', 'phenylketonurie.html', 'tyrosinämie.html',
                    'homocystinurie.html', 'ahornsirupkrankheit.html', 'harnstoffzyklus.html'
                );
                break;
                
            case 'kohlenhydrate':
                patterns.push(
                    'glykogenosen.html', 'galaktosämie.html', 'fruktoseintoleranz.html',
                    'glukose_transport.html', 'gsd.html'
                );
                break;
                
            case 'carnitin':
                patterns.push(
                    'carnitintransporter.html', 'cpt_defekte.html', 'carnitin_mangel.html',
                    'transport_defekte.html'
                );
                break;
                
            case 'energie':
                patterns.push(
                    'mitochondriopathien.html', 'atmungskette.html', 'fao_defekte.html',
                    'fettsäureoxidation.html', 'komplexdefekte.html', 'coq10.html'
                );
                break;
                
            case 'lipide':
                patterns.push(
                    'peroxisomale_erkrankungen.html', 'sphingolipidosen.html', 'cholesterin.html',
                    'adrenoleukodystrophie.html', 'zellweger.html'
                );
                break;
                
            case 'purin-pyrimidin':
                patterns.push(
                    'purin_defekte.html', 'pyrimidin_defekte.html', 'lesch_nyhan.html',
                    'nukleotide.html', 'harnsäure.html'
                );
                break;
                
            case 'lysosomal':
                patterns.push(
                    'speichererkrankungen.html', 'fabry.html', 'gaucher.html', 'niemann_pick.html',
                    'mukopolysaccharidosen.html', 'oligosaccharidosen.html', 'lipidosen.html'
                );
                break;
                
            case 'cdg':
                patterns.push(
                    'glykosylierung.html', 'cdg_typ1.html', 'cdg_typ2.html',
                    'n_glykosylierung.html', 'o_glykosylierung.html'
                );
                break;
                
            case 'sonstige':
                patterns.push(
                    'vitamin_defekte.html', 'trace_elements.html', 'seltene_defekte.html',
                    'cofaktor_defekte.html', 'transport_defekte.html'
                );
                break;
        }
        
        return patterns;
    }

    /**
     * Testet ob eine HTML-Datei existiert und extrahiert Metadaten
     */
    async testModuleFile(filePath, categoryKey) {
        try {
            const response = await fetch(filePath, { 
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            if (response.ok) {
                // Datei existiert, lade Metadaten
                const moduleData = await this.extractModuleMetadata(filePath, categoryKey);
                return moduleData;
            }
        } catch (error) {
            // Datei existiert nicht oder ist nicht erreichbar
            return null;
        }
        
        return null;
    }

    /**
     * Extrahiert Metadaten aus einer HTML-Datei
     */
    async extractModuleMetadata(filePath, categoryKey) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) return null;
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extrahiere Titel
            let title = doc.querySelector('title')?.textContent?.trim();
            if (!title) {
                title = doc.querySelector('h1')?.textContent?.trim();
            }
            if (!title) {
                // Fallback: Dateiname verwenden
                const fileName = filePath.split('/').pop().replace('.html', '');
                title = this.beautifyFileName(fileName);
            }
            
            // Extrahiere Beschreibung
            let subtitle = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim();
            if (!subtitle) {
                subtitle = doc.querySelector('h2')?.textContent?.trim();
            }
            if (!subtitle) {
                subtitle = 'Lernmodul';
            }
            
            // Extrahiere Keywords für Suche
            const keywords = [];
            const metaKeywords = doc.querySelector('meta[name="keywords"]')?.getAttribute('content');
            if (metaKeywords) {
                keywords.push(...metaKeywords.split(',').map(k => k.trim()));
            }
            
            // Extrahiere ersten Textinhalt für Suche
            const textContent = doc.body?.textContent?.trim().substring(0, 500) || '';
            
            // Generiere eindeutige ID
            const id = this.generateModuleId(filePath);
            
            const moduleData = {
                id,
                title,
                subtitle,
                path: filePath,
                category: categoryKey,
                keywords,
                textContent,
                lastModified: new Date().toISOString(),
                fileSize: html.length
            };
            
            // In globales Registry einfügen
            this.registry.modules[id] = moduleData;
            this.registry.totalModules++;
            
            console.log(`📄 Modul gefunden: ${title}`);
            return moduleData;
            
        } catch (error) {
            console.warn(`⚠️ Fehler beim Laden der Metadaten von ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Generiert eine eindeutige ID für ein Modul
     */
    generateModuleId(filePath) {
        return filePath
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .toLowerCase();
    }

    /**
     * Verschönert Dateinamen zu lesbaren Titeln
     */
    beautifyFileName(fileName) {
        return fileName
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .replace(/teil(\d+)/gi, 'Teil $1')
            .replace(/part(\d+)/gi, 'Teil $1')
            .replace(/modul(\d+)/gi, 'Modul $1');
    }

    /**
     * Manuelles Hinzufügen eines Moduls
     */
    async addModule(filePath, categoryKey, title = null, subtitle = null) {
        console.log(`➕ Füge Modul manuell hinzu: ${filePath}`);
        
        const moduleData = await this.extractModuleMetadata(filePath, categoryKey);
        if (moduleData) {
            if (title) moduleData.title = title;
            if (subtitle) moduleData.subtitle = subtitle;
            
            // In Kategorie einfügen
            if (!this.registry.categories[categoryKey]) {
                this.registry.categories[categoryKey] = [];
            }
            
            // Prüfe ob bereits vorhanden
            const existingIndex = this.registry.categories[categoryKey]
                .findIndex(m => m.path === filePath);
            
            if (existingIndex >= 0) {
                this.registry.categories[categoryKey][existingIndex] = moduleData;
            } else {
                this.registry.categories[categoryKey].push(moduleData);
            }
            
            this.saveRegistry();
            console.log(`✅ Modul hinzugefügt: ${moduleData.title}`);
            return moduleData;
        }
        
        return null;
    }

    /**
     * Entfernt ein Modul aus dem Registry
     */
    removeModule(moduleId) {
        const module = this.registry.modules[moduleId];
        if (module) {
            // Aus Kategorie entfernen
            const category = this.registry.categories[module.category];
            if (category) {
                const index = category.findIndex(m => m.id === moduleId);
                if (index >= 0) {
                    category.splice(index, 1);
                }
            }
            
            // Aus globalem Registry entfernen
            delete this.registry.modules[moduleId];
            this.registry.totalModules--;
            
            this.saveRegistry();
            console.log(`🗑️ Modul entfernt: ${module.title}`);
        }
    }

    /**
     * Sucht Module basierend auf verschiedenen Kriterien
     */
    searchModules(query) {
        const results = [];
        const queryLower = query.toLowerCase();
        
        Object.values(this.registry.modules).forEach(module => {
            let score = 0;
            
            // Titel-Match (höchste Priorität)
            if (module.title.toLowerCase().includes(queryLower)) {
                score += 10;
            }
            
            // Kategorie-Match
            if (module.category.toLowerCase().includes(queryLower)) {
                score += 5;
            }
            
            // Keywords-Match
            if (module.keywords.some(keyword => 
                keyword.toLowerCase().includes(queryLower))) {
                score += 3;
            }
            
            // Content-Match
            if (module.textContent.toLowerCase().includes(queryLower)) {
                score += 1;
            }
            
            if (score > 0) {
                results.push({ ...module, relevanceScore: score });
            }
        });
        
        // Nach Relevanz sortieren
        return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * Gibt das aktuelle Registry zurück
     */
    getRegistry() {
        return this.registry;
    }

    /**
     * Gibt alle Module einer Kategorie zurück
     */
    getModulesByCategory(categoryKey) {
        return this.registry.categories[categoryKey] || [];
    }

    /**
     * Gibt ein spezifisches Modul zurück
     */
    getModule(moduleId) {
        return this.registry.modules[moduleId];
    }

    /**
     * Prüft auf fehlende Module (für Sync zwischen Geräten)
     */
    getMissingModules(remoteRegistry) {
        const missing = [];
        
        Object.values(remoteRegistry.modules).forEach(remoteModule => {
            if (!this.registry.modules[remoteModule.id]) {
                missing.push(remoteModule);
            }
        });
        
        return missing;
    }

    /**
     * Zeigt Statistiken über die gefundenen Module
     */
    getStatistics() {
        const stats = {
            totalModules: this.registry.totalModules,
            categoriesWithModules: 0,
            averageModulesPerCategory: 0,
            largestCategory: null,
            smallestCategory: null
        };
        
        const categorySizes = {};
        
        Object.entries(this.registry.categories).forEach(([key, modules]) => {
            categorySizes[key] = modules.length;
            if (modules.length > 0) {
                stats.categoriesWithModules++;
            }
        });
        
        if (stats.categoriesWithModules > 0) {
            stats.averageModulesPerCategory = Math.round(
                stats.totalModules / stats.categoriesWithModules
            );
        }
        
        const sizes = Object.values(categorySizes);
        if (sizes.length > 0) {
            const maxSize = Math.max(...sizes);
            const minSize = Math.min(...sizes.filter(s => s > 0));
            
            stats.largestCategory = Object.keys(categorySizes)
                .find(key => categorySizes[key] === maxSize);
            stats.smallestCategory = Object.keys(categorySizes)
                .find(key => categorySizes[key] === minSize);
        }
        
        return stats;
    }

    /**
     * Export für Backup-Zwecke
     */
    exportRegistry() {
        return {
            ...this.registry,
            exportDate: new Date().toISOString(),
            deviceName: localStorage.getItem('deviceName') || 'unknown'
        };
    }

    /**
     * Import von anderem Gerät
     */
    importRegistry(importedRegistry) {
        // Merge-Strategie: Behalte neuere Module
        Object.values(importedRegistry.modules).forEach(importedModule => {
            const existing = this.registry.modules[importedModule.id];
            
            if (!existing || new Date(importedModule.lastModified) > new Date(existing.lastModified)) {
                this.registry.modules[importedModule.id] = importedModule;
                
                // In Kategorie einfügen
                const category = importedModule.category;
                if (!this.registry.categories[category]) {
                    this.registry.categories[category] = [];
                }
                
                const existingIndex = this.registry.categories[category]
                    .findIndex(m => m.id === importedModule.id);
                
                if (existingIndex >= 0) {
                    this.registry.categories[category][existingIndex] = importedModule;
                } else {
                    this.registry.categories[category].push(importedModule);
                }
            }
        });
        
        // Totale neu berechnen
        this.registry.totalModules = Object.keys(this.registry.modules).length;
        this.saveRegistry();
        
        console.log('📥 Registry erfolgreich importiert');
    }
}

// Global verfügbar machen
window.AutoDiscovery = AutoDiscovery;
