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
        
        this.stopWords = new Set([
            'der', 'die', 'das', 'und', 'oder', 'aber', 'mit', 'von', 'zu', 'in', 'an', 'auf',
            'für', 'bei', 'durch', 'über', 'unter', 'nach', 'vor', 'bis', 'seit', 'während',
            'wegen', 'trotz', 'ohne', 'gegen', 'um', 'zwischen', 'neben', 'hinter', 'vor',
            'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sich', 'mich', 'dich', 'uns', 'euch',
            'ist', 'sind', 'war', 'waren', 'hat', 'haben', 'wird', 'werden', 'kann', 'könnte',
            'soll', 'sollte', 'muss', 'müssen', 'darf', 'dürfen', 'will', 'wollen', 'mag', 'mögen',
            'ein', 'eine', 'einer', 'einem', 'einen', 'kein', 'keine', 'keiner', 'keinem', 'keinen',
            'this', 'that', 'with', 'from', 'they', 'been', 'have', 'their', 'said', 'each',
            'which', 'would', 'there', 'what', 'been', 'more', 'very', 'like', 'well', 'just'
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
        
        this.loadIndex();
    }

    /**
     * Lädt den bestehenden Suchindex aus localStorage
     */
    loadIndex() {
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
        const toSave = {
            ...this.searchIndex,
            keywords: Array.from(this.searchIndex.keywords),
            lastUpdate: new Date().toISOString()
        };
        
        localStorage.setItem('searchIndex', JSON.stringify(toSave));
        console.log('💾 Suchindex gespeichert:', this.searchIndex.totalIndexedModules, 'Module');
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

        // Auto-Discovery Registry holen
        const autoDiscovery = new AutoDiscovery();
        const registry = autoDiscovery.getRegistry();

        // Alle Module indexieren
        const indexPromises = Object.values(registry.modules).map(module => 
            this.indexModule(module)
        );

        await Promise.all(indexPromises);

        // Inverted Index erstellen
        this.buildInvertedIndex();

        // Kategorie-Statistiken erstellen
        this.buildCategoryStats();

        // Index speichern
        this.saveIndex();

        console.log(`✅ Content-Indexierung abgeschlossen: ${this.searchIndex.totalIndexedModules} Module indexiert`);
        console.log(`📚 ${this.searchIndex.keywords.size} eindeutige Keywords gefunden`);
    }

    /**
     * Indexiert ein einzelnes Modul
     */
    async indexModule(module) {
        try {
            console.log(`📄 Indexiere: ${module.title}`);
            
            // HTML-Inhalt laden
            const response = await fetch(module.path);
            if (!response.ok) {
                console.warn(`⚠️ Konnte ${module.path} nicht laden`);
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

        // Titel verarbeiten
        content.keywords.add(...this.extractKeywords(module.title));

        // Hauptinhalt extrahieren
        this.extractSections(doc, content);
        
        // Tabellen extrahieren
        this.extractTables(doc, content);
        
        // Listen extrahieren
        this.extractLists(doc, content);

        // Meta-Keywords extrahieren
        const metaKeywords = doc.querySelector('meta[name="keywords"]')?.getAttribute('content');
        if (metaKeywords) {
            content.keywords.add(...metaKeywords.split(',').map(k => k.trim().toLowerCase()));
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

            // Keywords aus Überschrift und Inhalt extrahieren
            section.keywords.add(...this.extractKeywords(section.title));
            section.keywords.add(...this.extractKeywords(section.content));

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
                content.keywords.add(...this.extractKeywords(text));
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
                tableData.keywords.add(...this.extractKeywords(headerText));
            });

            // Datenzeilen extrahieren
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    const rowData = Array.from(cells).map(td => td.textContent.trim());
                    tableData.rows.push(rowData);
                    
                    rowData.forEach(cellText => {
                        tableData.keywords.add(...this.extractKeywords(cellText));
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
                listData.keywords.add(...this.extractKeywords(itemText));
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
            includeExcerpts = true
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

        // Fuzzy Search für bessere Ergebnisse
        if (fuzzySearch) {
            Object.keys(this.searchIndex.invertedIndex).forEach(indexedKeyword => {
                queryKeywords.forEach(queryKeyword => {
                    const similarity = this.calculateSimilarity(queryKeyword, indexedKeyword);
                    if (similarity > 0.7 && similarity < 1.0) {
                        this.searchIndex.invertedIndex[indexedKeyword].forEach(moduleId => {
                            this.addSearchResult(results, moduleId, indexedKeyword, 'fuzzy', includeExcerpts, similarity);
                        });
                    }
                });
            });
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
        existingResult.matchedKeywords.push(keyword);

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
        const regex = new RegExp(`(${keyword})`, 'gi');
        excerpt = excerpt.replace(regex, '<mark>$1</mark>');

        return excerpt;
    }

    /**
     * Berechnet die Ähnlichkeit zwischen zwei Strings (Levenshtein-basiert)
     */
    calculateSimilarity(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        
        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;

        const matrix = Array(len2 + 1).fill().map(() => Array(len1 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[0][i] = i;
        for (let j = 0; j <= len2; j++) matrix[j][0] = j;

        for (let j = 1; j <= len2; j++) {
            for (let i = 1; i <= len1; i++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j - 1][i] + 1,
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i - 1] + cost
                );
            }
        }

        const maxLen = Math.max(len1, len2);
        return (maxLen - matrix[len2][len1]) / maxLen;
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
            indexSize: JSON.stringify(this.searchIndex).length
        };
    }
}

// Global verfügbar machen
window.ContentIndexer = ContentIndexer;
