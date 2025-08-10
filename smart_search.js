// js/smart-search.js
class SmartSearch {
    constructor() {
        this.contentIndexer = new ContentIndexer();
        this.autoDiscovery = new AutoDiscovery();
        
        this.searchHistory = this.loadSearchHistory();
        this.searchSuggestions = new Set();
        this.debounceTimer = null;
        this.currentQuery = '';
        this.currentFilter = 'all';
        this.isSearching = false;
        
        this.initializeUI();
        this.buildSuggestions();
    }

    /**
     * Initialisiert die Suchoberfläche
     */
    initializeUI() {
        this.searchInput = document.getElementById('searchInput');
        this.searchResults = document.getElementById('searchResults');
        this.searchResultsList = document.getElementById('searchResultsList');
        this.filterButtons = document.querySelectorAll('.filter-btn');
        
        if (!this.searchInput) {
            console.warn('⚠️ Search Input nicht gefunden');
            return;
        }

        // Event Listeners
        this.searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
        this.searchInput.addEventListener('focus', () => this.showSearchSuggestions());
        this.searchInput.addEventListener('blur', () => this.hideSearchSuggestions(200));
        this.searchInput.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Filter Event Listeners
        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleFilterClick(e));
        });

        console.log('🔍 Smart Search UI initialisiert');
    }

    /**
     * Behandelt Sucheingaben mit Debouncing
     */
    handleSearchInput(event) {
        const query = event.target.value.trim();
        this.currentQuery = query;

        // Debouncing für bessere Performance
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            if (query.length === 0) {
                this.hideSearchResults();
            } else if (query.length >= 2) {
                this.performSearch(query);
            }
        }, 300);

        // Live-Suggestions anzeigen
        if (query.length > 0) {
            this.showLiveSuggestions(query);
        }
    }

    /**
     * Führt die eigentliche Suche durch
     */
    async performSearch(query) {
        if (this.isSearching) return;
        
        this.isSearching = true;
        this.showSearchLoading();

        try {
            console.log(`🔍 Suche nach: "${query}"`);
            
            // Suche im Content-Index
            const searchOptions = {
                maxResults: 20,
                categoryFilter: this.currentFilter,
                fuzzySearch: true,
                includeExcerpts: true
            };

            const results = this.contentIndexer.search(query, searchOptions);
            
            // Zusätzliche Modulsuche über Auto-Discovery
            const moduleResults = this.autoDiscovery.searchModules(query);
            
            // Ergebnisse zusammenführen und deduplizieren
            const combinedResults = this.mergeSearchResults(results, moduleResults);
            
            // Suchergebnisse anzeigen
            this.displaySearchResults(combinedResults, query);
            
            // Zur Suchhistorie hinzufügen
            this.addToSearchHistory(query, combinedResults.length);

        } catch (error) {
            console.error('❌ Suchfehler:', error);
            this.showSearchError('Suchfehler aufgetreten');
        } finally {
            this.isSearching = false;
        }
    }

    /**
     * Führt Ergebnisse aus verschiedenen Quellen zusammen
     */
    mergeSearchResults(contentResults, moduleResults) {
        const merged = new Map();

        // Content-Index Ergebnisse (höhere Priorität)
        contentResults.forEach(result => {
            merged.set(result.moduleId, {
                ...result,
                source: 'content',
                relevanceScore: result.relevanceScore * 1.2 // Bonus für Content-Match
            });
        });

        // Modul-Ergebnisse hinzufügen (nur wenn noch nicht vorhanden)
        moduleResults.forEach(result => {
            if (!merged.has(result.id)) {
                merged.set(result.id, {
                    moduleId: result.id,
                    title: result.title,
                    category: result.category,
                    relevanceScore: result.relevanceScore,
                    source: 'module',
                    excerpts: [],
                    matchedKeywords: result.keywords || [],
                    wordCount: 0,
                    readingTime: 0
                });
            }
        });

        return Array.from(merged.values())
            .sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * Zeigt Suchergebnisse in der UI an
     */
    displaySearchResults(results, query) {
        if (!this.searchResults || !this.searchResultsList) return;

        this.searchResults.classList.add('show');
        
        if (results.length === 0) {
            this.showNoResults(query);
            return;
        }

        // Ergebnis-Header
        const header = `
            <div style="margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--bg-lighter);">
                <h3 style="margin: 0; color: var(--text-primary);">
                    ${results.length} Ergebnis${results.length !== 1 ? 'se' : ''} für "${query}"
                </h3>
                <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">
                    Kategorien: ${this.getResultCategories(results).join(', ')}
                </p>
            </div>
        `;

        // Ergebnisliste
        const resultItems = results.map(result => this.createResultItem(result, query)).join('');
        
        this.searchResultsList.innerHTML = header + resultItems;

        // Event Listeners für Ergebnisse
        this.attachResultEventListeners();

        console.log(`✅ ${results.length} Suchergebnisse angezeigt`);
    }

    /**
     * Erstellt ein einzelnes Suchergebnis-Element
     */
    createResultItem(result, query) {
        const module = this.autoDiscovery.getModule(result.moduleId);
        const categoryInfo = this.getCategoryInfo(result.category);
        
        return `
            <div class="search-result-item" data-module-id="${result.moduleId}" data-path="${module?.path || '#'}">
                <div class="result-header" style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <div>
                        <h4 class="result-title" style="margin: 0; font-size: 1.1rem; font-weight: 600;">
                            ${this.highlightText(result.title, query)}
                        </h4>
                        <div class="result-category" style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                            <span>${categoryInfo.icon}</span>
                            <span>${categoryInfo.title}</span>
                            ${this.createRelevanceIndicator(result.relevanceScore)}
                        </div>
                    </div>
                    <div class="result-actions" style="display: flex; gap: 0.5rem;">
                        <button class="action-btn notes-btn" onclick="event.stopPropagation(); openNotes('${result.moduleId}')" title="Notizen">📝</button>
                        <button class="action-btn progress-btn" onclick="event.stopPropagation(); toggleProgress('${result.moduleId}')" title="Fortschritt">✓</button>
                    </div>
                </div>
                
                ${result.excerpts.length > 0 ? `
                    <div class="result-excerpts" style="margin: 0.5rem 0;">
                        ${result.excerpts.slice(0, 2).map(excerpt => `
                            <p class="result-excerpt" style="margin: 0.25rem 0; padding: 0.5rem; background: var(--bg-light); border-radius: 6px; font-size: 0.9rem; line-height: 1.4;">
                                ${excerpt}
                            </p>
                        `).join('')}
                    </div>
                ` : ''}
                
                <div class="result-meta" style="display: flex; gap: 1rem; font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">
                    ${result.wordCount > 0 ? `<span>📖 ${result.wordCount} Wörter</span>` : ''}
                    ${result.readingTime > 0 ? `<span>⏱️ ${result.readingTime} Min.</span>` : ''}
                    ${result.matchedKeywords.length > 0 ? `
                        <span>🔍 Keywords: ${result.matchedKeywords.slice(0, 3).join(', ')}${result.matchedKeywords.length > 3 ? '...' : ''}</span>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Erstellt Relevanz-Indikator
     */
    createRelevanceIndicator(score) {
        const level = score > 20 ? 'high' : score > 10 ? 'medium' : 'low';
        const color = level === 'high' ? '#4facfe' : level === 'medium' ? '#f093fb' : '#ddd';
        
        return `
            <span style="background: ${color}; color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.75rem; font-weight: 500;">
                ${level === 'high' ? '🎯' : level === 'medium' ? '📍' : '📌'} ${Math.round(score)}%
            </span>
        `;
    }

    /**
     * Hebt Suchbegriffe im Text hervor
     */
    highlightText(text, query) {
        if (!query) return text;
        
        const keywords = query.toLowerCase().split(/\s+/);
        let highlightedText = text;
        
        keywords.forEach(keyword => {
            if (keyword.length >= 2) {
                const regex = new RegExp(`(${keyword})`, 'gi');
                highlightedText = highlightedText.replace(regex, '<span class="highlight">$1</span>');
            }
        });
        
        return highlightedText;
    }

    /**
     * Fügt Event Listeners zu Suchergebnissen hinzu
     */
    attachResultEventListeners() {
        const resultItems = this.searchResultsList.querySelectorAll('.search-result-item');
        
        resultItems.forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('action-btn')) return;
                
                const path = item.dataset.path;
                if (path && path !== '#') {
                    window.open(path, '_blank');
                    
                    // Analytics: Klick tracken
                    this.trackSearchResultClick(item.dataset.moduleId, this.currentQuery);
                }
            });
            
            // Hover-Effekte
            item.addEventListener('mouseenter', () => {
                item.style.background = 'var(--bg-light)';
                item.style.transform = 'translateX(4px)';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.background = '';
                item.style.transform = '';
            });
        });
    }

    /**
     * Behandelt Filter-Button Klicks
     */
    handleFilterClick(event) {
        const button = event.target;
        if (!button.classList.contains('filter-btn')) return;

        // Aktiven Filter aktualisieren
        this.filterButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        this.currentFilter = button.dataset.category;
        
        // Erneute Suche wenn Query vorhanden
        if (this.currentQuery.length >= 2) {
            this.performSearch(this.currentQuery);
        }

        console.log(`🔍 Filter geändert zu: ${this.currentFilter}`);
    }

    /**
     * Behandelt Keyboard-Navigation
     */
    handleKeyDown(event) {
        if (!this.searchResults.classList.contains('show')) return;

        const resultItems = this.searchResultsList.querySelectorAll('.search-result-item');
        
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.navigateResults(resultItems, 1);
                break;
                
            case 'ArrowUp':
                event.preventDefault();
                this.navigateResults(resultItems, -1);
                break;
                
            case 'Enter':
                event.preventDefault();
                this.selectActiveResult();
                break;
                
            case 'Escape':
                event.preventDefault();
                this.hideSearchResults();
                this.searchInput.blur();
                break;
        }
    }

    /**
     * Navigiert durch Suchergebnisse mit Pfeiltasten
     */
    navigateResults(resultItems, direction) {
        const activeItem = this.searchResultsList.querySelector('.search-result-item.active');
        let newIndex = 0;
        
        if (activeItem) {
            const currentIndex = Array.from(resultItems).indexOf(activeItem);
            newIndex = Math.max(0, Math.min(resultItems.length - 1, currentIndex + direction));
            activeItem.classList.remove('active');
        }
        
        if (resultItems[newIndex]) {
            resultItems[newIndex].classList.add('active');
            resultItems[newIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Wählt das aktive Suchergebnis aus
     */
    selectActiveResult() {
        const activeItem = this.searchResultsList.querySelector('.search-result-item.active');
        if (activeItem) {
            activeItem.click();
        }
    }

    /**
     * Zeigt Live-Vorschläge während der Eingabe
     */
    showLiveSuggestions(query) {
        // TODO: Implementiere Live-Suggestions basierend auf Suchhistorie und populären Begriffen
        const suggestions = this.generateSuggestions(query);
        
        if (suggestions.length > 0) {
            // Zeige Suggestions in einem Dropdown
            this.displaySuggestions(suggestions);
        }
    }

    /**
     * Generiert Suchvorschläge
     */
    generateSuggestions(query) {
        const suggestions = [];
        const queryLower = query.toLowerCase();
        
        // Aus Suchhistorie
        this.searchHistory.forEach(item => {
            if (item.query.toLowerCase().includes(queryLower) && 
                !suggestions.includes(item.query) && 
                suggestions.length < 5) {
                suggestions.push(item.query);
            }
        });
        
        // Aus Top-Keywords
        const topKeywords = this.contentIndexer.getTopKeywords(100);
        topKeywords.forEach(({ keyword }) => {
            if (keyword.toLowerCase().includes(queryLower) && 
                !suggestions.includes(keyword) && 
                suggestions.length < 8) {
                suggestions.push(keyword);
            }
        });
        
        return suggestions;
    }

    /**
     * Filtert Ergebnisse nach Kategorie
     */
    filterByCategory(categoryKey) {
        this.currentFilter = categoryKey;
        
        if (this.currentQuery.length >= 2) {
            this.performSearch(this.currentQuery);
        }
    }

    /**
     * Zeigt Lade-Animation
     */
    showSearchLoading() {
        if (!this.searchResultsList) return;
        
        this.searchResults.classList.add('show');
        this.searchResultsList.innerHTML = `
            <div class="loading" style="text-align: center; padding: 2rem;">
                <div class="spinner"></div>
                <p style="margin-top: 1rem; color: var(--text-secondary);">Durchsuche Module...</p>
            </div>
        `;
    }

    /**
     * Zeigt "Keine Ergebnisse" Nachricht
     */
    showNoResults(query) {
        if (!this.searchResultsList) return;
        
        this.searchResultsList.innerHTML = `
            <div class="empty-state">
                <div class="icon" style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
                <h3 style="margin-bottom: 0.5rem;">Keine Ergebnisse gefunden</h3>
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                    Keine Module für "${query}" gefunden.
                </p>
                <div style="font-size: 0.9rem; color: var(--text-muted);">
                    <p><strong>Tipps:</strong></p>
                    <ul style="text-align: left; margin: 0.5rem 0;">
                        <li>Überprüfen Sie die Rechtschreibung</li>
                        <li>Verwenden Sie andere Suchbegriffe</li>
                        <li>Entfernen Sie Filter</li>
                        <li>Suchen Sie nach medizinischen Fachbegrffen</li>
                    </ul>
                </div>
            </div>
        `;
    }

    /**
     * Zeigt Suchfehler an
     */
    showSearchError(message) {
        if (!this.searchResultsList) return;
        
        this.searchResultsList.innerHTML = `
            <div class="empty-state">
                <div class="icon" style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="margin-bottom: 0.5rem;">Suchfehler</h3>
                <p style="color: var(--text-secondary);">${message}</p>
            </div>
        `;
    }

    /**
     * Versteckt Suchergebnisse
     */
    hideSearchResults() {
        if (this.searchResults) {
            this.searchResults.classList.remove('show');
        }
    }

    /**
     * Versteckt Suchvorschläge mit Verzögerung
     */
    hideSearchSuggestions(delay = 0) {
        setTimeout(() => {
            // TODO: Verstecke Suggestions Dropdown
        }, delay);
    }

    /**
     * Zeigt Suchvorschläge an
     */
    showSearchSuggestions() {
        if (this.currentQuery.length > 0) {
            this.showLiveSuggestions(this.currentQuery);
        }
    }

    /**
     * Baut initiale Suchvorschläge auf
     */
    buildSuggestions() {
        // Häufige medizinische Begriffe als Vorschläge
        const commonTerms = [
            'Aminosäuren', 'Organische Säuren', 'Mitochondriopathien', 'Glykogenosen',
            'Fettsäureoxidation', 'Harnstoffzyklus', 'Lysosomale Speicherkrankheiten',
            'Phenylketonurie', 'Tyrosinämie', 'Homocystinurie', 'Galaktosämie',
            'Morbus Fabry', 'Morbus Gaucher', 'CDG', 'Peroxisomale Erkrankungen'
        ];
        
        commonTerms.forEach(term => this.searchSuggestions.add(term));
    }

    /**
     * Fügt Suche zur Historie hinzu
     */
    addToSearchHistory(query, resultCount) {
        const historyItem = {
            query,
            resultCount,
            timestamp: Date.now(),
            filter: this.currentFilter
        };
        
        // Duplikate entfernen
        this.searchHistory = this.searchHistory.filter(item => item.query !== query);
        
        // Neues Item hinzufügen
        this.searchHistory.unshift(historyItem);
        
        // Auf maximale Anzahl begrenzen
        if (this.searchHistory.length > 50) {
            this.searchHistory = this.searchHistory.slice(0, 50);
        }
        
        this.saveSearchHistory();
    }

    /**
     * Lädt Suchhistorie aus localStorage
     */
    loadSearchHistory() {
        try {
            const saved = localStorage.getItem('searchHistory');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.warn('⚠️ Suchhistorie konnte nicht geladen werden:', error);
            return [];
        }
    }

    /**
     * Speichert Suchhistorie in localStorage
     */
    saveSearchHistory() {
        try {
            localStorage.setItem('searchHistory', JSON.stringify(this.searchHistory));
        } catch (error) {
            console.warn('⚠️ Suchhistorie konnte nicht gespeichert werden:', error);
        }
    }

    /**
     * Trackt Klicks auf Suchergebnisse
     */
    trackSearchResultClick(moduleId, query) {
        const clickData = {
            moduleId,
            query,
            timestamp: Date.now(),
            position: Array.from(this.searchResultsList.querySelectorAll('.search-result-item'))
                .findIndex(item => item.dataset.moduleId === moduleId)
        };
        
        // In Analytics speichern (könnte später für Ranking-Verbesserungen genutzt werden)
        const analytics = JSON.parse(localStorage.getItem('searchAnalytics') || '[]');
        analytics.push(clickData);
        
        // Auf 1000 Einträge begrenzen
        if (analytics.length > 1000) {
            analytics.splice(0, analytics.length - 1000);
        }
        
        localStorage.setItem('searchAnalytics', JSON.stringify(analytics));
    }

    /**
     * Hilfsfunktionen
     */
    getCategoryInfo(categoryKey) {
        const categories = {
            'notfaelle': { title: 'Notfälle', icon: '🚨' },
            'befundung': { title: 'Befundung', icon: '📊' },
            'differentialdiagnostik': { title: 'Differentialdiagnostik', icon: '🔍' },
            'aminosaeuren': { title: 'Aminosäurestoffwechsel', icon: '🧬' },
            'kohlenhydrate': { title: 'Kohlenhydratstoffwechsel', icon: '🍯' },
            'carnitin': { title: 'Carnitinstoffwechsel', icon: '🚛' },
            'energie': { title: 'Energiestoffwechsel', icon: '⚡' },
            'lipide': { title: 'Lipidstoffwechsel', icon: '🫧' },
            'purin-pyrimidin': { title: 'Purin/Pyrimidin', icon: '🧬' },
            'lysosomal': { title: 'Lysosomale Störungen', icon: '📦' },
            'cdg': { title: 'CDG', icon: '🔗' },
            'sonstige': { title: 'Sonstige IEM', icon: '📚' }
        };
        
        return categories[categoryKey] || { title: 'Unbekannt', icon: '❓' };
    }

    getResultCategories(results) {
        const categories = new Set();
        results.forEach(result => {
            const info = this.getCategoryInfo(result.category);
            categories.add(info.title);
        });
        return Array.from(categories);
    }

    /**
     * Öffentliche API Methoden
     */
    search(query) {
        this.searchInput.value = query;
        this.currentQuery = query;
        this.performSearch(query);
    }

    clearSearch() {
        this.searchInput.value = '';
        this.currentQuery = '';
        this.hideSearchResults();
    }

    getSearchStats() {
        return {
            totalSearches: this.searchHistory.length,
            popularQueries: this.getPopularQueries(10),
            recentSearches: this.searchHistory.slice(0, 10)
        };
    }

    getPopularQueries(limit = 10) {
        const queryCounts = new Map();
        
        this.searchHistory.forEach(item => {
            queryCounts.set(item.query, (queryCounts.get(item.query) || 0) + 1);
        });
        
        return Array.from(queryCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([query, count]) => ({ query, count }));
    }
}

// Global verfügbar machen
window.SmartSearch = SmartSearch;