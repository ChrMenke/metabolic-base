// js/auto-discovery.js
class AutoDiscovery {
    constructor(configPath = '/config/categories.json') {
        this.basePath = '/metabolic-base/modules/';
        this.configPath = configPath;

        this.categories = {};
        this.registry = {
            version: '2.1',
            lastUpdate: null,
            totalModules: 0,
            categories: {},
            modules: {}
        };

        this.loadRegistry();
    }

    /** Lade Registry aus localStorage */
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

    /** Speichere Registry in localStorage */
    saveRegistry() {
        this.registry.lastUpdate = new Date().toISOString();
        localStorage.setItem('moduleRegistry', JSON.stringify(this.registry));
        localStorage.setItem('lastSync', Date.now().toString());
        console.log('💾 Registry gespeichert:', this.registry.totalModules, 'Module');
    }

    /** Lade Kategorien-Config aus externer JSON-Datei oder Fallback */
    async loadCategoriesConfig() {
        try {
            const res = await fetch(this.configPath, { cache: 'no-cache' });
            if (!res.ok) throw new Error(`Config-HTTP-Fehler: ${res.status}`);
            this.categories = await res.json();
            console.log('✅ Kategorien aus Config geladen');
        } catch (e) {
            console.warn('⚠️ Konnte Kategorien nicht aus externer Config laden, nutze Fallback:', e);
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
        }
    }

    /** Hauptfunktion: Scanne alle Kategorien */
    async scanForModules() {
        console.log('🔍 Starte Auto-Discovery...');
        await this.loadCategoriesConfig();

        // Registry zurücksetzen
        this.registry.categories = {};
        this.registry.modules = {};
        this.registry.totalModules = 0;

        // Alle Kategorien parallel scannen
        await Promise.all(
            Object.entries(this.categories).map(([folderName, categoryKey]) =>
                this.scanCategory(folderName, categoryKey)
            )
        );

        this.saveRegistry();
        console.log(`✅ Auto-Discovery abgeschlossen: ${this.registry.totalModules} Module gefunden`);
        return this.registry;
    }

    /** Scanne eine Kategorie nach HTML-Dateien */
    async scanCategory(folderName, categoryKey) {
        const categoryPath = this.basePath + folderName + '/';
        console.log(`📁 Scanne Kategorie: ${categoryKey}`);

        let fileList = [];

        // 1. Versuche Directory Listing
        try {
            const dirRes = await fetch(categoryPath);
            if (dirRes.ok) {
                const html = await dirRes.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const links = Array.from(doc.querySelectorAll('a[href$=".html"]'))
                    .map(a => a.getAttribute('href'));
                if (links.length > 0) {
                    fileList = links;
                    console.log(`📂 Directory Listing gefunden: ${links.length} Dateien`);
                }
            }
        } catch {
            // Falls Directory Listing nicht erlaubt, still weitermachen
        }

        // 2. Fallback: vordefinierte Muster
        if (fileList.length === 0) {
            const commonPatterns = [
                'index.html', 'teil1.html', 'teil2.html', 'part1.html', 'modul1.html',
                'grundlagen.html', 'diagnostik.html', 'therapie.html', 'klinik.html',
                'einführung.html', 'überblick.html', 'zusammenfassung.html'
            ];
            const categorySpecificPatterns = this.getCategorySpecificPatterns(categoryKey);
            fileList = [...new Set([...commonPatterns, ...categorySpecificPatterns])];
        }

        // 3. Alle Dateien parallel prüfen
        const foundModules = (
            await Promise.all(
                fileList.map(file => this.testAndExtractModule(categoryPath + file, categoryKey))
            )
        ).filter(Boolean);

        this.registry.categories[categoryKey] = foundModules;
        console.log(`✓ ${foundModules.length} Module in ${categoryKey} gefunden`);
    }

    /** Kategorie-spezifische Patterns */
    getCategorySpecificPatterns(categoryKey) {
        const patterns = {
            notfaelle: [
                'notfall_management.html', 'akute_krisen.html', 'notfallprotokoll.html',
                'hyperammoniaemie.html', 'hypoglykämie.html', 'ketoazidose.html'
            ],
            befundung: [
                'aminosäureanalyse.html', 'organische_säuren.html', 'systematische_befundung.html',
                'chromatographie.html', 'massenspektrometrie.html'
            ],
            differentialdiagnostik: [
                'algorithmus.html', 'decision_tree.html', 'flowchart.html',
                'konfirmationsdiagnostik.html', 'screening.html'
            ],
            aminosaeuren: [
                'aminosäurestörungen.html', 'phenylketonurie.html', 'tyrosinämie.html',
                'homocystinurie.html', 'ahornsirupkrankheit.html', 'harnstoffzyklus.html'
            ],
            kohlenhydrate: [
                'glykogenosen.html', 'galaktosämie.html', 'fruktoseintoleranz.html',
                'glukose_transport.html', 'gsd.html'
            ],
            carnitin: [
                'carnitintransporter.html', 'cpt_defekte.html', 'carnitin_mangel.html',
                'transport_defekte.html'
            ],
            energie: [
                'mitochondriopathien.html', 'atmungskette.html', 'fao_defekte.html',
                'fettsäureoxidation.html', 'komplexdefekte.html', 'coq10.html'
            ],
            lipide: [
                'peroxisomale_erkrankungen.html', 'sphingolipidosen.html', 'cholesterin.html',
                'adrenoleukodystrophie.html', 'zellweger.html'
            ],
            'purin-pyrimidin': [
                'purin_defekte.html', 'pyrimidin_defekte.html', 'lesch_nyhan.html',
                'nukleotide.html', 'harnsäure.html'
            ],
            lysosomal: [
                'speichererkrankungen.html', 'fabry.html', 'gaucher.html', 'niemann_pick.html',
                'mukopolysaccharidosen.html', 'oligosaccharidosen.html', 'lipidosen.html'
            ],
            cdg: [
                'glykosylierung.html', 'cdg_typ1.html', 'cdg_typ2.html',
                'n_glykosylierung.html', 'o_glykosylierung.html'
            ],
            sonstige: [
                'vitamin_defekte.html', 'trace_elements.html', 'seltene_defekte.html',
                'cofaktor_defekte.html', 'transport_defekte.html'
            ]
        };
        return patterns[categoryKey] || [];
    }

    /** Testet Datei & extrahiert Metadaten in einem Schritt */
    async testAndExtractModule(filePath, categoryKey) {
        try {
            const res = await fetch(filePath, { cache: 'no-cache' });
            if (!res.ok) return null;

            const html = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            let title = doc.querySelector('title')?.textContent?.trim()
                || doc.querySelector('h1')?.textContent?.trim()
                || this.beautifyFileName(filePath.split('/').pop().replace('.html', ''));

            let subtitle = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim()
                || doc.querySelector('h2')?.textContent?.trim()
                || 'Lernmodul';

            const keywords = (doc.querySelector('meta[name="keywords"]')?.getAttribute('content') || '')
                .split(',')
                .map(k => k.trim())
                .filter(Boolean);

            const textContent = doc.body?.textContent?.trim().substring(0, 500) || '';
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

            this.updateRegistry(moduleData);
            console.log(`📄 Modul gefunden: ${title}`);
            return moduleData;

        } catch (error) {
            console.warn(`⚠️ Fehler bei ${filePath}:`, error);
            return null;
        }
    }

    /** Fügt Modul in Registry ein */
    updateRegistry(moduleData) {
        this.registry.modules[moduleData.id] = moduleData;
        if (!this.registry.categories[moduleData.category]) {
            this.registry.categories[moduleData.category] = [];
        }
        const idx = this.registry.categories[moduleData.category]
            .findIndex(m => m.id === moduleData.id);
        if (idx >= 0) {
            this.registry.categories[moduleData.category][idx] = moduleData;
        } else {
            this.registry.categories[moduleData.category].push(moduleData);
        }
        this.registry.totalModules = Object.keys(this.registry.modules).length;
    }

    /** Hilfsfunktionen */
    generateModuleId(filePath) {
        return filePath.replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .toLowerCase();
    }

    beautifyFileName(fileName) {
        return fileName
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .replace(/teil(\d+)/gi, 'Teil $1')
            .replace(/part(\d+)/gi, 'Teil $1')
            .replace(/modul(\d+)/gi, 'Modul $1');
    }
}

// Global verfügbar machen
window.AutoDiscovery = AutoDiscovery;
