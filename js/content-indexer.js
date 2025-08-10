// js/content-indexer.js
class ContentIndexer {
    constructor() {
        this.searchIndex = {
            version: '1.0',
            lastUpdate: null,
            totalIndexedModules: 0,
            index: {}, // moduleId -> indexed content
            keywords: new Set(), // Alle gefundenen Keywords
            categories: {}, // categoryKey -> keyword frequency
            invertedIndex: {} // keyword -> [moduleIds]
        };
        
        // Doppelte Stoppwörter entfernt
        this.stopWords = new Set([
            'der', 'die', 'das', 'und', 'oder', 'aber', 'mit', 'von', 'zu', 'in', 'an', 'auf',
            'für', 'bei', 'durch', 'über', 'unter', 'nach', 'vor', 'bis', 'seit', 'während',
            'wegen', 'trotz', 'ohne', 'gegen', 'um', 'zwischen', 'neben', 'hinter',
            'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sich', 'mich', 'dich', 'uns', 'euch',
            'ist', 'sind', 'war', 'waren', 'hat', 'haben', 'wird', 'werden', 'kann', 'könnte',
            'soll', 'sollte', 'muss', 'müssen', 'darf', 'dürfen', 'will', 'wollen', 'mag', 'mögen',
            'ein', 'eine', 'einer', 'einem', 'einen', 'kein', 'keine', 'keiner', 'keinem', 'keinen',
            'this', 'that', 'with', 'from', 'they', 'been', 'have', 'their', 'said', 'each',
            'which', 'would', 'there', 'what', 'more', 'very', 'like', 'well', 'just'
        ]);
        
        this.medicalTerms = new Set([
            'enzym', 'protein', 'gen', 'mutation', 'defekt', 'störung', 'syndrom', 'krankheit',
            'therapie', 'behandlung', 'diagnose', 'symptom', 'klinik', 'labor', 'test', 'analyse',
            'konzentration', 'aktivität', 'metabolit', 'substrat', 'produkt', 'cofaktor',
            'vitamin', 'mineral', 'spurenelement', 'aminosäure', 'fettsäure', 'nukleotid',
            'glykogen', 'glukose', 'fruktose', 'galaktose', 'saccharose', 'laktose', 'maltose',
            'cholesterin', 'triglyzerid', 'phospholipid', 'sphingolipid', 'steroid',
            'purin', 'pyrimidin', 'adenin', 'guanin', 'cytosin', 'thymin', 'uracil',
            'carnitin', 'coenzym', 'nad', 'nadh', 'fad', 'fadh', 'atp', 'adp', 'amp',
            'mitochondrium', 'peroxisom', 'lysosom', 'endoplasmatisch', 'ribosom',
            'hyperammonämie', 'hypoglykämie', 'ketoazidose', 'laktatazidose', 'azidose'
        ]);
        
        // Request-Throttling für bessere Performance
        this.maxConcurrentRequests = 5;
        
        this.loadIndex();
    }

    /**
     * Lädt den bestehenden Suchindex aus localStorage
     */
    loadIndex() {
        if (!this.isLocalStorageAvailable()) {
            console.warn('⚠️ localStorage nicht verfügbar - Index wird nur im Arbeitsspeicher gehalten');
            return;
        }

        const saved = localStorage.getItem('searchIndex');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.searchIndex = { ...this.searchIndex, ...parsed };
                
                // Set-Objekte wiederherstellen
                this.searchIndex.keywords = new Set(parsed.keywords || []);
                
                console.log('📇 Suchindex geladen:', this.searchIndex.totalIndexedModules, 'Module indexiert');
            } catch (error) {
                console.warn('⚠️ Suchindex konnte nicht geladen werden:', error);
            }
        }
    }

    /**
     * Speichert den Suchindex in localStorage
     */
    saveIndex() {
        if (!this.isLocalStorageAvailable()) {
            console.warn('⚠️ localStorage nicht verfügbar - Index kann nicht gespeichert werden');
            return;
        }

        try {
            const toSave = {
                ...this.searchIndex,
                keywords: Array.from(this.searchIndex.keywords),
                lastUpdate: new Date().toISOString()
            };
            
            localStorage.setItem('searchIndex', JSON.stringify(toSave));
            console.log('💾 Suchindex gespeichert:', this.searchIndex.totalIndexedModules, 'Module');
        } catch (error) {
            console.warn('⚠️ Suchindex konnte nicht gespeichert werden:', error);
        }
    }

    /**
     * Prüft ob localStorage verfügbar ist
     */
    isLocalStorageAvailable() {
        try {
            const test = '__localStorage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Hauptfunktion: Baut den Suchindex für alle Module auf
     */
    async buildIndex() {
        console.log('🔍 Starte Content-Indexierung...');
        
        // Index zurücksetzen
        this.searchIndex.index = {};
        this.searchIndex.keywords.clear();
        this.searchIndex.categories = {};
        this.searchIndex.invertedIndex = {};
        this.searchIndex.totalIndexedModules = 0;

        try {
            // Auto-Discovery Registry holen
            const autoDiscovery = new AutoDiscovery();
            const registry = autoDiscovery.getRegistry();

            // Module in Batches verarbeiten für bessere Performance
            const modules = Object.values(registry.modules);
            await this.processBatches(modules, this.maxConcurrentRequests);

            // Inverted Index erstellen
            this.buildInvertedIndex();

            // Kategorie-Statistiken erstellen
            this.buildCategoryStats();

            // Index speichern
            this.saveIndex();

            console.log(`✅ Content-Indexierung abgeschlossen: ${this.searchIndex.totalIndexedModules} Module indexiert`);
            console.log(`📚 ${this.searchIndex.keywords.size} eindeutige Keywords gefunden`);
        } catch (error) {
            console.error('❌ Fehler bei der Content-Indexierung:', error);
        }
    }

    /**
     * Verarbeitet Module in Batches um Browser nicht zu überlasten
     */
    async processBatches(modules, batchSize) {
        for (let i = 0; i < modules.length; i += batchSize) {
            const batch = modules.slice(i, i + batchSize);
            const batchPromises = batch.map(module => this.indexModule(module));
            
            await Promise.all(batchPromises);
            
            // Kurze Pause zwischen Batches
            if (i + batchSize < modules.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    /**
     * Indexiert ein einzelnes Modul
     */
    async indexModule(module) {
        try {
            console.log(`📄 Indexiere: ${module.title}`);
            
            // HTML-Inhalt laden mit Timeout
            const response = await this.fetchWithTimeout(module.path, 10000);
            if (!response.ok) {
                console.warn(`⚠️ Konnte ${module.path} nicht laden (${response.status})`);
                return;
            }

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Inhalt extrahieren und verarbeiten
            const indexedContent = this.extractAndProcessContent(doc, module);
            
            // In Index speichern
            this.searchIndex.index[module.id] = indexedContent;
            this.searchIndex.totalIndexedModules++;

        } catch (error) {
            console.warn(`⚠️ Fehler beim Indexieren von ${module.title}:`, error);
        }
    }

    /**
     * Fetch mit Timeout
     */
    async fetchWithTimeout(url, timeout = 10000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    /**
     * Extrahiert und verarbeitet den Inhalt eines HTML-Dokuments
     */
    extractAndProcessContent(doc, module) {
        const content = {
            moduleId: module.id,
            title: module.title,
            category: module.category,
            sections: [],
            keywords: new Set(),
            medicalTerms: new Set(),
            fullText: '',
            wordCount: 0,
            readingTime: 0
        };

        // Titel verarbeiten - FIX: forEach statt spread operator
        this.extractKeywords(module.title).forEach(keyword => content.keywords.add(keyword));

        // Hauptinhalt extrahieren
        this.extractSections(doc, content);
        
        // Tabellen extrahieren
        this.extractTables(doc, content);
        
        // Listen extrahieren
        this.extractLists(doc, content);

        // Meta-Keywords extrahieren - FIX: forEach statt spread operator
        const metaKeywords = doc.querySelector('meta[name="keywords"]')?.getAttribute('content');
        if (metaKeywords) {
            metaKeywords.split(',')
                .map(k => k.trim().toLowerCase())
                .forEach(keyword => content.keywords.add(keyword));
        }

        // Medizinische Begriffe identifizieren
        this.identifyMedicalTerms(content);

        // Statistiken berechnen
        content.wordCount = this.countWords(content.fullText);
        content.readingTime = Math.ceil(content.wordCount / 200); // 200 Wörter/Minute

        // Keywords zu globalem Set hinzufügen
        content.keywords.forEach(keyword => this.searchIndex.keywords.add(keyword));

        return content;
    }

    /**
     * Extrahiert Abschnitte aus dem HTML-Dokument
     */
    extractSections(doc, content) {
        // Überschriften und zugehörige Inhalte
        const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
        
        headings.forEach((heading, index) => {
            const section = {
                level: parseInt(heading.tagName.charAt(1)),
                title: heading.textContent.trim(),
                content: '',
                keywords: new Set()
            };

            // Inhalt nach der Überschrift sammeln
            let nextElement = heading.nextElementSibling;
            const contentElements = [];

            while (nextElement && !this.isHeading(nextElement)) {
                if (this.isContentElement(nextElement)) {
                    contentElements.push(nextElement);
                }
                nextElement = nextElement.nextElementSibling;
            }

            // Text aus Content-Elementen extrahieren
            section.content = contentElements
                .map(el => el.textContent.trim())
                .filter(text => text.length > 0)
                .join(' ');

            // Keywords aus Überschrift und Inhalt extrahieren - FIX: forEach statt spread
            this.extractKeywords(section.title).forEach(keyword => section.keywords.add(keyword));
            this.extractKeywords(section.content).forEach(keyword => section.keywords.add(keyword));

            content.sections.push(section);
            content.fullText += section.title + ' ' + section.content + ' ';
            section.keywords.forEach(keyword => content.keywords.add(keyword));
        });

        // Auch Text ohne Überschriften erfassen
        const paragraphs = doc.querySelectorAll('p, div.content, div.text, .module-content');
        paragraphs.forEach(p => {
            const text = p.textContent.trim();
            if (text.length > 20) { // Nur relevante Texte
                content.fullText += text + ' ';
                this.extractKeywords(text).forEach(keyword => content.keywords.add(keyword));
            }
        });
    }

    /**
     * Extrahiert Tabellendaten
     */
    extractTables(doc, content) {
        const tables = doc.querySelectorAll('table');
        
        tables.forEach(table => {
            const tableData = {
                type: 'table',
                headers: [],
                rows: [],
                keywords: new Set()
            };

            // Kopfzeilen extrahieren
            const headerCells = table.querySelectorAll('th');
            headerCells.forEach(th => {
                const headerText = th.textContent.trim();
                tableData.headers.push(headerText);
                this.extractKeywords(headerText).forEach(keyword => tableData.keywords.add(keyword));
            });

            // Datenzeilen extrahieren
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    const rowData = Array.from(cells).map(td => td.textContent.trim());
                    tableData.rows.push(rowData);
                    
                    rowData.forEach(cellText => {
                        this.extractKeywords(cellText).forEach(keyword => tableData.keywords.add(keyword));
                    });
                }
            });

            content.sections.push(tableData);
            tableData.keywords.forEach(keyword => content.keywords.add(keyword));
        });
    }

    /**
     * Extrahiert Listen (ul, ol)
     */
    extractLists(doc, content) {
        const lists = doc.querySelectorAll('ul, ol');
        
        lists.forEach(list => {
            const listData = {
                type: 'list',
                items: [],
                keywords: new Set()
            };

            const items = list.querySelectorAll('li');
            items.forEach(li => {
                const itemText = li.textContent.trim();
                listData.items.push(itemText);
                this.extractKeywords(itemText).forEach(keyword => listData.keywords.add(keyword));
            });

            content.sections.push(listData);
            listData.keywords.forEach(keyword => content.keywords.add(keyword));
        });
    }

    /**
     * Extrahiert Keywords aus einem Text
     */
    extractKeywords(text) {
        if (!text) return [];

        return text
            .toLowerCase()
            .replace(/[^\wäöüß\s-]/g, ' ')
            .split(/\s+/)
            .filter(word => 
                word.length >= 3 && 
                !this.stopWords.has(word) &&
                !/^\d+$/.test(word)
            )
            .map(word => word.trim())
            .filter(word => word.length > 0);
    }

    /**
     * Identifiziert medizinische Fachbegriffe
     */
    identifyMedicalTerms(content) {
        const text = content.fullText.toLowerCase();
        
        this.medicalTerms.forEach(term => {
            if (text.includes(term)) {
                content.medicalTerms.add(term);
                content.keywords.add(term); // Medizinische Begriffe sind wichtige Keywords
            }
        });

        // Erkenne häufige Endungen medizinischer Begriffe
        const medicalSuffixes = ['ämie', 'ose', 'itis', 'pathie', 'logie', 'gramm', 'skopie'];
        content.keywords.forEach(keyword => {
            if (medicalSuffixes.some(suffix => keyword.endsWith(suffix))) {
                content.medicalTerms.add(keyword);
            }
        });
    }

    /**
     * Erstellt den inverted Index für schnelle Suche
     */
    buildInvertedIndex() {
        console.log('📚 Erstelle Inverted Index...');
        
        Object.values(this.searchIndex.index).forEach(content => {
            content.keywords.forEach(keyword => {
                if (!this.searchIndex.invertedIndex[keyword]) {
                    this.searchIndex.invertedIndex[keyword] = [];
                }
                
                if (!this.searchIndex.invertedIndex[keyword].includes(content.moduleId)) {
                    this.searchIndex.invertedIndex[keyword].push(content.moduleId);
                }
            });
        });
    }

    /**
     * Erstellt Kategorie-Statistiken
     */
    buildCategoryStats() {
        console.log('📊 Erstelle Kategorie-Statistiken...');
        
        Object.values(this.searchIndex.index).forEach(content => {
            const category = content.category;
            
            if (!this.searchIndex.categories[category]) {
                this.searchIndex.categories[category] = {
                    moduleCount: 0,
                    totalWords: 0,
                    topKeywords: new Map(),
                    medicalTerms: new Set()
                };
            }
            
            const stats = this.searchIndex.categories[category];
            stats.moduleCount++;
            stats.totalWords += content.wordCount;
            
            // Keyword-Häufigkeit zählen
            content.keywords.forEach(keyword => {
                const current = stats.topKeywords.get(keyword) || 0;
                stats.topKeywords.set(keyword, current + 1);
            });
            
            // Medizinische Begriffe sammeln
            content.medicalTerms.forEach(term => {
                stats.medicalTerms.add(term);
            });
        });
    }

    /**
     * Sucht nach einem Begriff im Index
     */
    search(query, options = {}) {
        const {
            maxResults = 50,
            categoryFilter = null,
            fuzzySearch = true,
            includeExcerpts = true,
            fuzzyThreshold = 0.7,
            maxFuzzyChecks = 1000 // Performance-Limit für Fuzzy Search
        } = options;

        if (!query || query.length < 2) {
            return [];
        }

        const results = [];
        const queryKeywords = this.extractKeywords(query);
        
        // Exakte Suche
        queryKeywords.forEach(keyword => {
            if (this.searchIndex.invertedIndex[keyword]) {
                this.searchIndex.invertedIndex[keyword].forEach(moduleId => {
                    this.addSearchResult(results, moduleId, keyword, 'exact', includeExcerpts);
                });
            }
        });

        // Optimierter Fuzzy Search mit Performance-Limits
        if (fuzzySearch && queryKeywords.length > 0) {
            const indexedKeywords = Object.keys(this.searchIndex.invertedIndex);
            let fuzzyChecks = 0;
            
            for (const indexedKeyword of indexedKeywords) {
                if (fuzzyChecks >= maxFuzzyChecks) break;
                
                // Nur Keywords ähnlicher Länge prüfen (Performance-Optimierung)
                const lengthDiff = Math.abs(indexedKeyword.length - queryKeywords[0].length);
                if (lengthDiff > 3) continue;
                
                for (const queryKeyword of queryKeywords) {
                    const similarity = this.calculateJaroWinkler(queryKeyword, indexedKeyword);
                    if (similarity > fuzzyThreshold && similarity < 1.0) {
                        this.searchIndex.invertedIndex[indexedKeyword].forEach(moduleId => {
                            this.addSearchResult(results, moduleId, indexedKeyword, 'fuzzy', includeExcerpts, similarity);
                        });
                        break;
                    }
                    fuzzyChecks++;
                }
            }
        }

        // Nach Kategorie filtern
        let filteredResults = results;
        if (categoryFilter && categoryFilter !== 'all') {
            filteredResults = results.filter(result => 
                result.category === categoryFilter
            );
        }

        // Nach Relevanz sortieren und begrenzen
        return filteredResults
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, maxResults);
    }

    /**
     * Fügt ein Suchergebnis hinzu oder aktualisiert die Relevanz
     */
    addSearchResult(results, moduleId, keyword, matchType, includeExcerpts, similarity = 1.0) {
        const content = this.searchIndex.index[moduleId];
        if (!content) return;

        let existingResult = results.find(r => r.moduleId === moduleId);
        
        if (!existingResult) {
            existingResult = {
                moduleId,
                title: content.title,
                category: content.category,
                relevanceScore: 0,
                matchedKeywords: [],
                excerpts: [],
                wordCount: content.wordCount,
                readingTime: content.readingTime
            };
            results.push(existingResult);
        }

        // Relevanz-Score berechnen
        let score = matchType === 'exact' ? 10 : 5;
        score *= similarity;
        
        // Bonus für Titel-Matches
        if (content.title.toLowerCase().includes(keyword.toLowerCase())) {
            score *= 2;
        }
        
        existingResult.relevanceScore += score;
        if (!existingResult.matchedKeywords.includes(keyword)) {
            existingResult.matchedKeywords.push(keyword);
        }

        // Textauszüge erstellen
        if (includeExcerpts) {
            const excerpt = this.createExcerpt(content.fullText, keyword);
            if (excerpt && !existingResult.excerpts.includes(excerpt)) {
                existingResult.excerpts.push(excerpt);
            }
        }
    }

    /**
     * Erstellt einen Textauszug um ein Keyword
     */
    createExcerpt(text, keyword, contextLength = 100) {
        const lowerText = text.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        const index = lowerText.indexOf(lowerKeyword);
        
        if (index === -1) return null;

        const start = Math.max(0, index - contextLength);
        const end = Math.min(text.length, index + keyword.length + contextLength);
        
        let excerpt = text.substring(start, end);
        
        if (start > 0) excerpt = '...' + excerpt;
        if (end < text.length) excerpt = excerpt + '...';

        // Keyword hervorheben
        const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
        excerpt = excerpt.replace(regex, '<mark>$1</mark>');

        return excerpt;
    }

    /**
     * Escaped Regex-Zeichen für sichere Verwendung in RegExp
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Berechnet Jaro-Winkler-Ähnlichkeit (effizienter als Levenshtein für Keyword-Suche)
     */
    calculateJaroWinkler(s1, s2) {
        if (s1 === s2) return 1.0;
        if (s1.length === 0 || s2.length === 0) return 0.0;

        const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
        if (matchWindow < 0) return 0.0;

        const s1Matches = new Array(s1.length).fill(false);
        const s2Matches = new Array(s2.length).fill(false);

        let matches = 0;
        let transpositions = 0;

        // Identifiziere Matches
        for (let i = 0; i < s1.length; i++) {
            const start = Math.max(0, i - matchWindow);
            const end = Math.min(i + matchWindow + 1, s2.length);

            for (let j = start; j < end; j++) {
                if (s2Matches[j] || s1[i] !== s2[j]) continue;
                s1Matches[i] = true;
                s2Matches[j] = true;
                matches++;
                break;
            }
        }

        if (matches === 0) return 0.0;

        // Zähle Transpositions
        let k = 0;
        for (let i = 0; i < s1.length; i++) {
            if (!s1Matches[i]) continue;
            while (!s2Matches[k]) k++;
            if (s1[i] !== s2[k]) transpositions++;
            k++;
        }

        const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

        // Winkler-Bonus für gemeinsamen Prefix
        const prefix = Math.min(4, this.getCommonPrefixLength(s1, s2));
        return jaro + (0.1 * prefix * (1 - jaro));
    }

    /**
     * Ermittelt die Länge des gemeinsamen Prefixes
     */
    getCommonPrefixLength(s1, s2) {
        let prefix = 0;
        for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
            if (s1[i] === s2[i]) prefix++;
            else break;
        }
        return prefix;
    }

    /**
     * Hilfsfunktion: Prüft ob Element eine Überschrift ist
     */
    isHeading(element) {
        return /^H[1-6]$/.test(element.tagName);
    }

    /**
     * Hilfsfunktion: Prüft ob Element Inhalt enthält
     */
    isContentElement(element) {
        const contentTags = ['P', 'DIV', 'SPAN', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'PRE'];
        return contentTags.includes(element.tagName) && element.textContent.trim().length > 10;
    }

    /**
     * Hilfsfunktion: Zählt Wörter in einem Text
     */
    countWords(text) {
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }

    /**
     * Gibt Kategorie-Statistiken zurück
     */
    getCategoryStats(categoryKey) {
        return this.searchIndex.categories[categoryKey] || null;
    }

    /**
     * Gibt die häufigsten Keywords zurück
     */
    getTopKeywords(limit = 20) {
        const keywordCounts = new Map();
        
        Object.values(this.searchIndex.index).forEach(content => {
            content.keywords.forEach(keyword => {
                keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
            });
        });

        return Array.from(keywordCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([keyword, count]) => ({ keyword, count }));
    }

    /**
     * Exportiert den Index für Backup
     */
    exportIndex() {
        return {
            ...this.searchIndex,
            keywords: Array.from(this.searchIndex.keywords),
            exportDate: new Date().toISOString()
        };
    }

    /**
     * Importiert einen Index von anderem Gerät
     */
    importIndex(importedIndex) {
        try {
            // Merge-Strategie: Behalte neuere Inhalte
            Object.entries(importedIndex.index).forEach(([moduleId, content]) => {
                this.searchIndex.index[moduleId] = content;
            });

            // Keywords zusammenführen
            if (importedIndex.keywords) {
                importedIndex.keywords.forEach(keyword => {
                    this.searchIndex.keywords.add(keyword);
                });
            }

            // Inverted Index und Kategorien neu aufbauen
            this.buildInvertedIndex();
            this.buildCategoryStats();
            
            this.searchIndex.totalIndexedModules = Object.keys(this.searchIndex.index).length;
            this.saveIndex();
            
            console.log('📥 Suchindex erfolgreich importiert');
        } catch (error) {
            console.error('❌ Fehler beim Importieren des Suchindex:', error);
        }
    }

    /**
     * Gibt Index-Statistiken zurück
     */
    getIndexStats() {
        return {
            totalModules: this.searchIndex.totalIndexedModules,
            totalKeywords: this.searchIndex.keywords.size,
            totalInvertedEntries: Object.keys(this.searchIndex.invertedIndex).length,
            categoriesIndexed: Object.keys(this.searchIndex.categories).length,
            lastUpdate: this.searchIndex.lastUpdate,
            indexSize: JSON.stringify(this.searchIndex).length,
            localStorageAvailable: this.isLocalStorageAvailable()
        };
    }

    /**
     * Löscht den kompletten Index
     */
    clearIndex() {
        this.searchIndex.index = {};
        this.searchIndex.keywords.clear();
        this.searchIndex.categories = {};
        this.searchIndex.invertedIndex = {};
        this.searchIndex.totalIndexedModules = 0;
        
        if (this.isLocalStorageAvailable()) {
            localStorage.removeItem('searchIndex');
        }
        
        console.log('🗑️ Suchindex wurde gelöscht');
    }
}

// Global verfügbar machen
window.ContentIndexer = ContentIndexer;
