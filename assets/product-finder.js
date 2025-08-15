console.log('product-finder.js executing...'); // Version indicator - Enhanced

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event fired.');

  // --- Cache-Related Constants ---
  const CACHE_VERSION_KEY = 'fitmentGlobalCacheVersion';
  const CURRENT_CACHE_VERSION = 'v1.0.2'; // Manually update to force invalidation of localStorage
  const LONG_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; /* 24 hours */
  const SHORT_CACHE_EXPIRY_MS = 30 * 60 * 1000; /* 30 minutes */
  const CACHE_PREFIX = 'fitmentCache_';

  // --- Other Constants ---
  const PLACEHOLDERS = { TYPE: '-- Select Type --', CATEGORY: '-- Select Category --', MAKE: '-- Select Make --', YEAR: '-- Select Year --', MODEL: '-- Select Model --' };
  const API_RESPONSE_KEYS = { TYPES: 'types', CATEGORIES: 'fitmentCategories', MAKES: 'makes', YEARS: 'years', MODELS: 'models', PRODUCTS: 'fitmentProducts', PRODUCT_SKU: 'itemNumber', PRODUCT_DESC: 'description', CATEGORY_MAIN: 'category', CATEGORY_SUB: 'subCategory' };
  const DESKTOP_BREAKPOINT = 769;
  const STORAGE_KEY_PREFIX = 'fitmentToggleState_';
  const LAST_SELECTED_VEHICLE_STORAGE_KEY = 'lastSelectedVehicle';
  const SKELETON_CARD_COUNT = 6;


  // --- Global Cache Version Validation ---
  const initOrValidateLocalCacheVersion = () => {
    try {
      if (typeof localStorage === 'undefined') return;
      const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
      if (storedVersion !== CURRENT_CACHE_VERSION) {
        console.log(`Fitment Cache: Version mismatch. Clearing fitment-related localStorage.`);
        let clearedCount = 0;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith(CACHE_PREFIX)) {
            localStorage.removeItem(key);
            clearedCount++;
          }
        }
        localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
        console.log(`Fitment Cache: Cleared ${clearedCount} items and set version to ${CURRENT_CACHE_VERSION}.`);
      }
    } catch (e) {
      console.error('Fitment Cache: Error during localStorage cache version validation:', e);
    }
  };

  initOrValidateLocalCacheVersion();

  const getStorage = (typeStr) => {
    try {
      if (typeStr === 'local' && typeof localStorage !== 'undefined') return localStorage;
      if (typeStr === 'session' && typeof sessionStorage !== 'undefined') return sessionStorage;
    } catch (e) { /* ignore */ }
    return null;
  };

  if (typeof Choices === 'undefined') {
    console.error('Choices.js library not found.');
  }

  const sectionStates = {};

  const fitmentSections = document.querySelectorAll('.fitment-selector-section');
  console.log(`Found ${fitmentSections.length} fitment sections.`);

  fitmentSections.forEach((section) => {
    const sectionId = section.dataset.sectionId;
    sectionStates[sectionId] = {
      currentActionInProgress: null,
      storageKey: `${STORAGE_KEY_PREFIX}${sectionId}`,
      allProducts: [],
      productCards: [],
    };
    console.log(`Processing section: ${sectionId}`);

    // --- Configuration & Element References ---
    const apiToken = section.dataset.apiToken;
    const isToggleEnabled = section.dataset.toggleEnabled === 'true';

    const apiEndpoints = {
      types: section.dataset.apiGetTypes,
      categories: section.dataset.apiGetCategories,
      makes: section.dataset.apiGetMakes,
      years: section.dataset.apiGetYears,
      models: section.dataset.apiGetModels,
      products: section.dataset.apiGetProducts,
    };

    const elements = {
        typeSelect: section.querySelector(`#fitment-type-${sectionId}`),
        makeSelect: section.querySelector(`#fitment-make-${sectionId}`),
        yearSelect: section.querySelector(`#fitment-year-${sectionId}`),
        modelSelect: section.querySelector(`#fitment-model-${sectionId}`),
        findPartsButton: section.querySelector(`#fitment-find-parts-${sectionId}`),
        resetButton: section.querySelector(`#fitment-reset-${sectionId}`),
        resultsContainer: section.querySelector(`#fitment-results-${sectionId}`),
        errorMessageContainer: section.querySelector(`#fitment-error-message-${sectionId}`),
        filtersContainer: section.querySelector(`#fitment-filters-${sectionId}`),
        filterCategorySelect: section.querySelector(`#fitment-filter-category-${sectionId}`),
        filterSubCategorySelect: section.querySelector(`#fitment-filter-subcategory-${sectionId}`),
        typeLoading: section.querySelector('.fitment-type-loading'),
        makeLoading: section.querySelector('.fitment-make-loading'),
        yearLoading: section.querySelector('.fitment-year-loading'),
        modelLoading: section.querySelector('.fitment-model-loading'),
        searchLoading: section.querySelector('.fitment-search-loading'),
        toggleButton: section.querySelector('.fitment-toggle-button'),
        contentWrapper: section.querySelector('.fitment-content-wrapper'),
    };

    if (!elements.typeSelect || !elements.makeSelect || !elements.yearSelect || !elements.modelSelect || !elements.findPartsButton || !elements.resetButton || !elements.resultsContainer || !elements.errorMessageContainer || !elements.filtersContainer) {
        console.error(`Fitment Selector (${sectionId}): Missing essential HTML elements. Initialization aborted.`);
        return;
    }

    if (!apiToken) {
        displayError('API Token is missing. Please configure it in the Theme Settings.', sectionId);
        disableAllSelectors();
        if(elements.findPartsButton) elements.findPartsButton.disabled = true;
        if(elements.resetButton) elements.resetButton.disabled = true;
        return;
    }

    // --- Helper Functions ---

    const getCache = (key, storageTypeStr = 'session') => {
      const storage = getStorage(storageTypeStr);
      if (!storage) return null;
      const cacheKey = `${CACHE_PREFIX}${sectionId}_${key}`;
      try {
        const itemStr = storage.getItem(cacheKey);
        if (!itemStr) return null;
        const item = JSON.parse(itemStr);
        if (new Date().getTime() > item.expiry) {
          storage.removeItem(cacheKey);
          return null;
        }
        return item.value;
      } catch (e) {
        console.error(`Fitment Cache: Error reading from ${storageTypeStr}Storage:`, e);
        return null;
      }
    };

    const setCache = (key, value, storageTypeStr = 'session') => {
      const storage = getStorage(storageTypeStr);
      if (!storage) return;
      const cacheKey = `${CACHE_PREFIX}${sectionId}_${key}`;
      const expiryDuration = storageTypeStr === 'local' ? LONG_CACHE_EXPIRY_MS : SHORT_CACHE_EXPIRY_MS;
      const item = { value: value, expiry: new Date().getTime() + expiryDuration };
      try {
        storage.setItem(cacheKey, JSON.stringify(item));
      } catch (e) {
        console.error(`Fitment Cache: Error setting ${storageTypeStr}Storage:`, e);
      }
    };

    const clearCache = () => {
      const storage = getStorage('session');
      if (!storage) return;
      try {
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (key && key.startsWith(`${CACHE_PREFIX}${sectionId}_`)) {
            storage.removeItem(key);
          }
        }
      } catch (e) {
        console.error(`Fitment Cache: Error clearing session cache for section ${sectionId}:`, e);
      }
    };

    const toggleLoading = (selectElement, show) => {
      const selectorContainer = selectElement?.closest('.fitment-selector');
      if (selectorContainer) {
        selectorContainer.classList.toggle('is-loading', show);
      }
    };

    const displayError = (message, currentSectionId, isRetryableError = false) => {
      const errorContainer = document.querySelector(`#fitment-error-message-${currentSectionId}`);
      let userFriendlyMessage = message;
      if (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network error")) {
          userFriendlyMessage = "A network error occurred. Please check your connection and try again.";
          isRetryableError = true;
      } else if (message.toLowerCase().includes("timed out")) {
          userFriendlyMessage = "The request timed out. Please try again.";
          isRetryableError = true;
      }
      console.error(`Fitment Error (${currentSectionId}): ${message}`);
      if (errorContainer) {
        errorContainer.innerHTML = `Error: ${userFriendlyMessage} `;
        if (isRetryableError && sectionStates[currentSectionId]?.currentActionInProgress) {
          const tryAgainButton = document.createElement('button');
          tryAgainButton.textContent = 'Try Again';
          tryAgainButton.className = 'fitment-try-again-button';
          tryAgainButton.type = 'button';
          tryAgainButton.onclick = () => {
            clearError(currentSectionId);
            const actionToRetry = sectionStates[currentSectionId].currentActionInProgress;
            if (typeof actionToRetry === 'function') actionToRetry();
          };
          errorContainer.appendChild(tryAgainButton);
        }
        errorContainer.style.display = 'block';
      }
    };

    const clearError = (currentSectionId) => {
      const errorContainer = document.querySelector(`#fitment-error-message-${currentSectionId}`);
      if (errorContainer) {
        errorContainer.innerHTML = '';
        errorContainer.style.display = 'none';
      }
    };

    const resetSelect = (selectElement, placeholder, disable = true) => {
      if (!selectElement) return;
      const placeholderText = placeholder || '-- Select --';
      let placeholderOption = selectElement.querySelector('option[value=""]');
      if (!placeholderOption) {
          placeholderOption = document.createElement('option');
          placeholderOption.value = "";
          placeholderOption.textContent = placeholderText;
      }
      // For main selectors, placeholder is disabled. For filters, it's not.
      placeholderOption.disabled = disable;
      selectElement.innerHTML = '';
      selectElement.appendChild(placeholderOption);
      placeholderOption.selected = true;
      selectElement.disabled = disable;
    };

    const populateSelect = (selectElement, options, valueKey = 'value', textKey = 'text') => {
      if (!selectElement || !Array.isArray(options)) return;
      const placeholder = selectElement.options[0];
      selectElement.innerHTML = '';
      selectElement.appendChild(placeholder);
      placeholder.selected = true;
      options.forEach((option) => {
        const optionElement = document.createElement('option');
        if (typeof option === 'object' && option !== null) {
          optionElement.value = option[valueKey];
          optionElement.textContent = option[textKey];
        } else {
          optionElement.value = option;
          optionElement.textContent = option;
        }
        selectElement.appendChild(optionElement);
      });
      selectElement.disabled = options.length === 0;
    };

    const resetSubsequentDropdowns = (currentLevel) => {
      const levels = ['type', 'make', 'year', 'model'];
      const startIndex = levels.indexOf(currentLevel) + 1;
      for (let i = startIndex; i < levels.length; i++) {
        const level = levels[i];
        let selectElement, placeholder;
        switch (level) {
          case 'make': selectElement = elements.makeSelect; placeholder = PLACEHOLDERS.MAKE; break;
          case 'year': selectElement = elements.yearSelect; placeholder = PLACEHOLDERS.YEAR; break;
          case 'model': selectElement = elements.modelSelect; placeholder = PLACEHOLDERS.MODEL; break;
        }
        if (selectElement) resetSelect(selectElement, placeholder);
      }
      if(elements.findPartsButton) elements.findPartsButton.disabled = true;
      if (['type', 'make', 'year'].includes(currentLevel)) {
        if(elements.resultsContainer) elements.resultsContainer.innerHTML = '<p>Please select your vehicle details above to find compatible parts.</p>';
        if(elements.filtersContainer) elements.filtersContainer.style.display = 'none';
        clearError(sectionId);
      }
    };

    const disableAllSelectors = () => {
        if(elements.typeSelect) elements.typeSelect.disabled = true;
        if(elements.makeSelect) elements.makeSelect.disabled = true;
        if(elements.yearSelect) elements.yearSelect.disabled = true;
        if(elements.modelSelect) elements.modelSelect.disabled = true;
        if(elements.findPartsButton) elements.findPartsButton.disabled = true;
    };

    const resetAllSelectorsAndResults = () => {
      clearCache();
      try {
          const localSt = getStorage('local');
          if (localSt) localSt.removeItem(LAST_SELECTED_VEHICLE_STORAGE_KEY);
      } catch (e) {
          console.warn(`Could not clear last selected vehicle from localStorage:`, e);
      }
      sectionStates[sectionId].allProducts = [];
      sectionStates[sectionId].productCards = [];
      resetSelect(elements.typeSelect, PLACEHOLDERS.TYPE, true);
      resetSelect(elements.makeSelect, PLACEHOLDERS.MAKE, true);
      resetSelect(elements.yearSelect, PLACEHOLDERS.YEAR, true);
      resetSelect(elements.modelSelect, PLACEHOLDERS.MODEL, true);
      if(elements.findPartsButton) elements.findPartsButton.disabled = true;
      if(elements.resultsContainer) elements.resultsContainer.innerHTML = '<p>Please select your vehicle details above to find compatible parts.</p>';
      if(elements.filtersContainer) {
          elements.filtersContainer.style.display = 'none';
          resetSelect(elements.filterCategorySelect, 'All Categories', false);
          resetSelect(elements.filterSubCategorySelect, 'All SubCategories', false);
      }
      clearError(sectionId);
      initialize();
    };

    const saveSelectedVehicle = () => {
        const selectedVehicle = {
            type: elements.typeSelect?.value,
            make: elements.makeSelect?.value,
            year: elements.yearSelect?.value,
            model: elements.modelSelect?.value
        };
        if (selectedVehicle.type && selectedVehicle.make && selectedVehicle.year && selectedVehicle.model) {
            try {
                localStorage.setItem(LAST_SELECTED_VEHICLE_STORAGE_KEY, JSON.stringify(selectedVehicle));
            } catch (e) {
                console.warn('Could not save selected vehicle to localStorage:', e);
            }
        }
    };

    const fetchAPI = async (url, method = 'GET', body = null) => {
        if (!url || !url.startsWith('http')) {
            const err = new Error(`Invalid API endpoint URL: ${url}`);
            err.isRetryable = false;
            throw err;
        }
        const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${apiToken}` };
        const options = { method, headers, signal: AbortSignal.timeout(15000) };
        if (body) {
            options.body = JSON.stringify(body);
            headers['Content-Type'] = 'application/json';
        }
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                let errorMessage = `API Error: ${response.status} ${response.statusText}`;
                let isRetryable = [429, 500, 502, 503, 504].includes(response.status);
                const err = new Error(errorMessage);
                err.isRetryable = isRetryable;
                throw err;
            }
            if (response.status === 204) return null;
            const data = await response.json();
            if (data.status && data.status !== 'success' && data.status !== 200) {
                throw new Error(data.error?.message || 'API returned a non-success status.');
            }
            return data.data || data;
        } catch (error) {
            if (error.name === 'AbortError') {
                error.message = "Request timed out.";
                error.isRetryable = true;
            } else if (error.message.toLowerCase().includes('failed to fetch')) {
                error.message = "Network error. Failed to connect to the API.";
                error.isRetryable = true;
            }
            throw error;
        }
    };

    const fetchShopifyProductBySkuMultiStep = async (sku) => {
        if (!sku) return null;
        const normalizedSku = String(sku).trim().toLowerCase();
        if (!normalizedSku) return null;
        try {
            const suggestUrl = `/search/suggest.json?q=${encodeURIComponent(`variants.sku:"${normalizedSku}"`)}&resources[type]=product&resources[limit]=1&resources[options][unavailable_products]=show&resources[fields]=handle`;
            const suggestResponse = await fetch(suggestUrl);
            if (!suggestResponse.ok) return null;
            const suggestions = await suggestResponse.json();
            const productHandle = suggestions?.resources?.results?.products[0]?.handle;
            if (!productHandle) return null;
            const productJsonUrl = `/products/${productHandle}.js`;
            const productResponse = await fetch(productJsonUrl);
            if (!productResponse.ok) return null;
            const fullProductData = await productResponse.json();
            const matchingVariant = fullProductData?.variants.find(v => v.sku && String(v.sku).trim().toLowerCase() === normalizedSku);
            if (matchingVariant) {
                return {
                    product: { handle: fullProductData.handle, title: fullProductData.title, featured_image: fullProductData.featured_image },
                    variant: { id: String(matchingVariant.id), sku: matchingVariant.sku, title: matchingVariant.title, price: matchingVariant.price, available: matchingVariant.available, featured_image: matchingVariant.featured_image }
                };
            }
            return null;
        } catch (error) {
            console.error(`Shopify product fetch exception for SKU ${normalizedSku}:`, error);
            return null;
        }
    };

    const createProductCard = (product, variant) => {
        if (!product || !variant) return null;
        const cardLink = document.createElement('a');
        cardLink.className = 'fitment-product-card card-fade-in';
        const variantIdNumber = variant.id ? String(variant.id).substring(String(variant.id).lastIndexOf('/') + 1) : null;
        cardLink.href = variantIdNumber ? `/products/${product.handle}?variant=${variantIdNumber}` : `/products/${product.handle}`;
        const imageContainer = document.createElement('div');
        imageContainer.className = 'fitment-product-image-container';
        const imageElement = document.createElement('img');
        imageElement.className = 'fitment-product-image';
        const pfi = product.featured_image;
        const vfi = variant.featured_image;
        let imageUrl = vfi?.url || vfi?.src || pfi?.url || pfi?.src || pfi || 'https://placehold.co/180x120/e9ecef/6c757d?text=No+Image';
        imageElement.src = imageUrl;
        imageElement.alt = vfi?.altText || vfi?.alt || pfi?.altText || pfi?.alt || product.title;
        imageElement.loading = 'lazy';
        imageElement.onerror = (e) => {
            e.target.closest('.fitment-product-image-container')?.classList.add('image-load-error');
            e.target.onerror = null;
        };
        imageContainer.appendChild(imageElement);
        cardLink.appendChild(imageContainer);
        const infoElement = document.createElement('div');
        infoElement.className = 'fitment-product-info';
        const titleElement = document.createElement('div');
        titleElement.className = 'fitment-product-title';
        titleElement.textContent = product.title || 'Product Title Missing';
        if (variant.title && variant.title.toLowerCase() !== 'default title') {
            const variantTitleSpan = document.createElement('span');
            variantTitleSpan.className = 'fitment-product-variant-title';
            variantTitleSpan.textContent = variant.title;
            titleElement.appendChild(variantTitleSpan);
        }
        infoElement.appendChild(titleElement);
        const stockElement = document.createElement('div');
        stockElement.className = 'fitment-product-stock';
        stockElement.textContent = variant.available ? 'In Stock' : 'Out of Stock';
        stockElement.classList.add(variant.available ? 'stock-in' : 'stock-out');
        infoElement.appendChild(stockElement);
        const priceElement = document.createElement('div');
        priceElement.className = 'fitment-product-price';
        priceElement.textContent = typeof variant.price === 'number' ? `${(variant.price / 100).toFixed(2)}` : 'N/A';
        infoElement.appendChild(priceElement);
        cardLink.appendChild(infoElement);
        return cardLink;
    };

    const createSkeletonCard = () => {
        const skeletonCard = document.createElement('div');
        skeletonCard.className = 'fitment-product-card skeleton-card';
        skeletonCard.innerHTML = `
            <div class="skeleton-image"></div>
            <div class="skeleton-info">
                <div class="skeleton-line title"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-line price"></div>
            </div>
        `;
        return skeletonCard;
    };

    const createUnmatchedSkuCard = (sku, description) => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'fitment-product-not-found card-fade-in';
        cardDiv.innerHTML = `<p>Part Found:</p><strong>${description || 'Unknown Description'}</strong><small>(SKU: ${sku || 'N/A'})</small><span>Not available in this store.</span>`;
        return cardDiv;
    };

    const displayResults = (productCards) => {
      if (!elements.resultsContainer) return;
      elements.resultsContainer.innerHTML = '';
      if (!Array.isArray(productCards) || productCards.length === 0) {
          const selectedCategory = elements.filterCategorySelect.value;
          const selectedSubCategory = elements.filterSubCategorySelect.value;
          if (selectedCategory || selectedSubCategory) {
            elements.resultsContainer.innerHTML = '<p>No matching parts found for the current filter selection.</p>';
          } else {
            elements.resultsContainer.innerHTML = '<p>No matching part numbers found for the selected vehicle.</p>';
          }
          return;
      }
      const productGrid = document.createElement('div');
      productGrid.className = 'fitment-product-grid';
      const fragment = document.createDocumentFragment();
      productCards.forEach(cardData => {
          fragment.appendChild(cardData.element);
      });
      productGrid.appendChild(fragment);
      elements.resultsContainer.appendChild(productGrid);
    };

    const loadDataFor = async (level, params, cacheKey, selectElement, placeholder, responseKey, processFn) => {
        sectionStates[sectionId].currentActionInProgress = () => loadDataFor(level, params, cacheKey, selectElement, placeholder, responseKey, processFn);
        toggleLoading(selectElement, true);
        clearError(sectionId);
        try {
            const cachedData = getCache(cacheKey, 'session');
            let data;
            if (cachedData) {
                data = cachedData;
            } else {
                const apiUrl = `${apiEndpoints[level]}?${new URLSearchParams(params).toString()}`;
                const apiResponse = await fetchAPI(apiUrl);
                data = apiResponse?.[responseKey] || apiResponse || [];
                if (!Array.isArray(data)) throw new Error(`Invalid ${level} data format.`);
                setCache(cacheKey, data, 'session');
            }
            const processedData = processFn(data);
            if (processedData.length === 0) {
                displayError(`No ${level} found for the current selection.`, sectionId);
                resetSelect(selectElement, placeholder, true);
            } else {
                populateSelect(selectElement, processedData);
            }
        } catch (error) {
            displayError(`Failed to load ${level}: ${error.message}`, sectionId, error.isRetryable);
            resetSelect(selectElement, placeholder, true);
        } finally {
            toggleLoading(selectElement, false);
            sectionStates[sectionId].currentActionInProgress = null;
        }
    };

    const loadMakesData = () => {
        const type = elements.typeSelect?.value;
        if (!type) return;
        loadDataFor('makes', { type }, `makes_${type}`, elements.makeSelect, PLACEHOLDERS.MAKE, API_RESPONSE_KEYS.MAKES, data => data.sort());
    };

    const loadYearsData = () => {
        const type = elements.typeSelect?.value;
        const make = elements.makeSelect?.value;
        if (!type || !make) return;
        loadDataFor('years', { type, make }, `years_${type}_${make}`, elements.yearSelect, PLACEHOLDERS.YEAR, API_RESPONSE_KEYS.YEARS, data => data.map(Number).filter(Boolean).sort((a, b) => b - a));
    };

    const loadModelsData = () => {
        const type = elements.typeSelect?.value;
        const make = elements.makeSelect?.value;
        const year = elements.yearSelect?.value;
        if (!type || !make || !year) return;
        loadDataFor('models', { type, make, year }, `models_${type}_${make}_${year}`, elements.modelSelect, PLACEHOLDERS.MODEL, API_RESPONSE_KEYS.MODELS, data => data.sort());
    };

    const applyFilters = () => {
        const selectedCategory = elements.filterCategorySelect.value;
        const selectedSubCategory = elements.filterSubCategorySelect.value;
        const allCards = sectionStates[sectionId].productCards;

        const filteredCards = allCards.filter(cardData => {
            const categoryMatch = !selectedCategory || cardData.category === selectedCategory;
            const subCategoryMatch = !selectedSubCategory || cardData.subCategory === selectedSubCategory;
            return categoryMatch && subCategoryMatch;
        });

        displayResults(filteredCards);
    };

    const populateAndShowFilters = (products) => {
        const { filterCategorySelect, filterSubCategorySelect, filtersContainer } = elements;
        if (!products || products.length === 0) {
            filtersContainer.style.display = 'none';
            return;
        }

        const categories = [...new Set(products.map(p => p[API_RESPONSE_KEYS.CATEGORY_MAIN]).filter(Boolean))].sort();
        const subCategories = [...new Set(products.map(p => p[API_RESPONSE_KEYS.CATEGORY_SUB]).filter(Boolean))].sort();

        resetSelect(filterCategorySelect, 'All Categories', false);
        populateSelect(filterCategorySelect, categories);
        filterCategorySelect.disabled = categories.length === 0;

        resetSelect(filterSubCategorySelect, 'All SubCategories', false);
        populateSelect(filterSubCategorySelect, subCategories);
        filterSubCategorySelect.disabled = subCategories.length === 0;

        if (categories.length > 0 || subCategories.length > 0) {
            filtersContainer.style.display = 'flex';
        } else {
            filtersContainer.style.display = 'none';
        }
    };

    const performSearch = async () => {
      sectionStates[sectionId].currentActionInProgress = performSearch;
      saveSelectedVehicle();
      const { typeSelect, makeSelect, yearSelect, modelSelect, findPartsButton, resultsContainer, filtersContainer } = elements;
      if (!typeSelect.value || !makeSelect.value || !yearSelect.value || !modelSelect.value) {
          displayError('Please ensure all fields are selected.', sectionId);
          sectionStates[sectionId].currentActionInProgress = null;
          return;
      }
      findPartsButton.classList.add('is-loading');
      findPartsButton.disabled = true;
      clearError(sectionId);
      resultsContainer.innerHTML = '';
      filtersContainer.style.display = 'none';
      const productGrid = document.createElement('div');
      productGrid.className = 'fitment-product-grid';
      for (let i = 0; i < SKELETON_CARD_COUNT; i++) {
        productGrid.appendChild(createSkeletonCard());
      }
      resultsContainer.appendChild(productGrid);

      try {
          const params = { make: makeSelect.value, year: yearSelect.value, model: modelSelect.value };
          const apiUrl = `${apiEndpoints.products}?${new URLSearchParams(params).toString()}`;
          const gammaData = await fetchAPI(apiUrl);
          const productsData = gammaData?.[API_RESPONSE_KEYS.PRODUCTS] || gammaData || [];
          if (!Array.isArray(productsData)) throw new Error('Invalid product data format.');

          sectionStates[sectionId].allProducts = productsData;

          const shopifyDataPromises = productsData.map(gammaProduct =>
            fetchShopifyProductBySkuMultiStep(gammaProduct?.[API_RESPONSE_KEYS.PRODUCT_SKU])
                .then(shopifyResult => ({
                    gammaProduct,
                    shopifyResult
                }))
          );

          const combinedResults = await Promise.all(shopifyDataPromises);

          sectionStates[sectionId].productCards = combinedResults.map(({ gammaProduct, shopifyResult }) => {
            let cardElement;
            if (shopifyResult?.product && shopifyResult?.variant) {
                cardElement = createProductCard(shopifyResult.product, shopifyResult.variant);
            } else {
                cardElement = createUnmatchedSkuCard(gammaProduct?.[API_RESPONSE_KEYS.PRODUCT_SKU], gammaProduct?.[API_RESPONSE_KEYS.PRODUCT_DESC]);
            }
            return {
              element: cardElement,
              category: gammaProduct?.[API_RESPONSE_KEYS.CATEGORY_MAIN],
              subCategory: gammaProduct?.[API_RESPONSE_KEYS.CATEGORY_SUB],
            };
          });

          displayResults(sectionStates[sectionId].productCards);
          populateAndShowFilters(productsData);

      } catch (error) {
          displayError(`Failed to find parts: ${error.message}`, sectionId, error.isRetryable);
          if(resultsContainer) resultsContainer.innerHTML = '<p>Could not load products due to an error.</p>';
      } finally {
          findPartsButton.classList.remove('is-loading');
          findPartsButton.disabled = !modelSelect.value;
          sectionStates[sectionId].currentActionInProgress = null;
      }
    };

    elements.typeSelect?.addEventListener('change', () => { resetSubsequentDropdowns('type'); saveSelectedVehicle(); if (elements.typeSelect.value) loadMakesData(); });
    elements.makeSelect?.addEventListener('change', () => { resetSubsequentDropdowns('make'); saveSelectedVehicle(); if (elements.makeSelect.value) loadYearsData(); });
    elements.yearSelect?.addEventListener('change', () => { resetSubsequentDropdowns('year'); saveSelectedVehicle(); if (elements.yearSelect.value) loadModelsData(); });
    elements.modelSelect?.addEventListener('change', () => {
      resetSubsequentDropdowns('model');
      saveSelectedVehicle();
      elements.findPartsButton.disabled = !elements.modelSelect.value;
    });
    elements.findPartsButton?.addEventListener('click', performSearch);
    elements.resetButton?.addEventListener('click', resetAllSelectorsAndResults);
    elements.filterCategorySelect?.addEventListener('change', applyFilters);
    elements.filterSubCategorySelect?.addEventListener('change', applyFilters);

    const setInitialToggleState = () => {
        if (!isToggleEnabled || !elements.toggleButton) return;
        try {
            const savedState = localStorage.getItem(sectionStates[sectionId].storageKey);
            const isInitiallyCollapsed = savedState !== null ? savedState === 'true' : window.innerWidth < DESKTOP_BREAKPOINT;
            section.classList.toggle('is-collapsed', isInitiallyCollapsed);
            elements.toggleButton.setAttribute('aria-expanded', String(!isInitiallyCollapsed));
        } catch (e) {
            console.warn("Could not read toggle state from localStorage", e);
        }
    };

    if (isToggleEnabled && elements.toggleButton) {
        elements.toggleButton.addEventListener('click', (e) => {
            e.preventDefault();
            const isNowCollapsed = section.classList.toggle('is-collapsed');
            elements.toggleButton.setAttribute('aria-expanded', String(!isNowCollapsed));
            try { localStorage.setItem(sectionStates[sectionId].storageKey, String(isNowCollapsed)); }
            catch (error) { console.warn(`Could not save toggle state to localStorage:`, error); }
        });
        setInitialToggleState();
    }

    const initialize = async () => {
        sectionStates[sectionId].currentActionInProgress = initialize;
        toggleLoading(elements.typeSelect, true);
        clearError(sectionId);
        disableAllSelectors();
        try {
            const cachedData = getCache('types', 'local');
            let typesData;
            if (cachedData) {
                typesData = cachedData;
            } else {
                if (!apiEndpoints.types) throw new Error("Types API endpoint is missing.");
                const apiResponse = await fetchAPI(apiEndpoints.types);
                typesData = apiResponse?.[API_RESPONSE_KEYS.TYPES] || apiResponse || [];
                if (!Array.isArray(typesData)) throw new Error('Invalid types data format.');
                setCache('types', typesData, 'local');
            }
            const sortedTypes = typesData.sort((a, b) => a.localeCompare(b));
            populateSelect(elements.typeSelect, sortedTypes);
            if (sortedTypes.length === 0) {
                displayError("No vehicle types are available.", sectionId);
            }
        } catch (error) {
            displayError(`Initialization failed: ${error.message}`, sectionId, error.isRetryable);
        } finally {
            toggleLoading(elements.typeSelect, false);
            sectionStates[sectionId].currentActionInProgress = null;
        }
    };

    initialize();
  });
});