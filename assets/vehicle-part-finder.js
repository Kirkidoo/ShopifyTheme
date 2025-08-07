class VehiclePartFinder {
  constructor(element, settings) {
    this.container = element;
    this.settings = settings;
    this.shopifyProducts = new Map();

    this.elements = {
      type: this.container.querySelector('#vpf-type'),
      make: this.container.querySelector('#vpf-make'),
      year: this.container.querySelector('#vpf-year'),
      model: this.container.querySelector('#vpf-model'),
      findBtn: this.container.querySelector('#vpf-find-parts-btn'),
      resultsContainer: this.container.querySelector('#vpf-results-container'),
      resultsGrid: this.container.querySelector('#vpf-results-grid'),
      loader: this.container.querySelector('#vpf-loader'),
      noResultsMsg: this.container.querySelector('#vpf-no-results-message'),
    };

    this.bindEvents();
    this.init();
  }

  async init() {
    this.showLoader();
    await this.loadShopifyProducts();
    await this.loadTypes();
    this.hideLoader();
  }

  bindEvents() {
    this.elements.type.addEventListener('change', () => this.onTypeChange());
    this.elements.make.addEventListener('change', () => this.onMakeChange());
    this.elements.year.addEventListener('change', () => this.onYearChange());
    this.elements.model.addEventListener('change', () => this.onModelChange());
    this.elements.findBtn.addEventListener('click', () => this.findParts());
  }

  async apiFetch(endpoint, params = {}) {
    const url = new URL(`${this.settings.apiUrl}${endpoint}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      const json = await response.json();
      if (json.status !== 'success') {
        throw new Error(json.error?.message || 'API returned an error');
      }
      return json.data;
    } catch (error) {
      console.error('API Fetch Error:', error);
      this.showError('Failed to fetch data from the parts API.');
      return null;
    }
  }

  async loadShopifyProducts() {
    let allProducts = [];
    let page = 1;
    let hasMore = true;

    while(hasMore) {
        try {
            const response = await fetch(`/products.json?limit=250&page=${page}`);
            if (!response.ok) throw new Error('Failed to fetch products');
            const products = await response.json();
            if (products.products.length > 0) {
                allProducts = allProducts.concat(products.products);
                page++;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error('Error fetching Shopify products:', error);
            this.showError('Could not load product data from your store.');
            hasMore = false;
        }
    }

    allProducts.forEach(product => {
      product.variants.forEach(variant => {
        if (variant.sku) {
          this.shopifyProducts.set(variant.sku, {
            title: product.title,
            url: `/products/${product.handle}`,
            featured_image: product.featured_image || variant.featured_image,
            sku: variant.sku
          });
        }
      });
    });
  }

  async loadTypes() {
    const data = await this.apiFetch('/fitment/getFitmentCategories');
    if (data && data.fitmentCategories) {
      const types = new Set();
      data.fitmentCategories.forEach(cat => {
        types.add(`${cat.category} > ${cat.subCategory}`);
      });
      this.populateDropdown(this.elements.type, Array.from(types).sort(), 'Select Type');
    }
  }

  async onTypeChange() {
    this.resetDropdowns(['make', 'year', 'model']);
    const [category, subCategory] = this.elements.type.value.split(' > ');
    if (!category) return;

    this.showLoader();
    const data = await this.apiFetch('/fitment/getMakeOptions', { category, subCategory });
    if (data && data.makes) {
      this.populateDropdown(this.elements.make, data.makes.sort(), 'Select Make');
      this.elements.make.disabled = false;
    }
    this.hideLoader();
  }

  async onMakeChange() {
    this.resetDropdowns(['year', 'model']);
    const [category, subCategory] = this.elements.type.value.split(' > ');
    const make = this.elements.make.value;
    if (!make) return;

    this.showLoader();
    const data = await this.apiFetch('/fitment/getYearOptions', { category, subCategory, make });
    if (data && data.years) {
      this.populateDropdown(this.elements.year, data.years.sort().reverse(), 'Select Year');
      this.elements.year.disabled = false;
    }
    this.hideLoader();
  }

  async onYearChange() {
    this.resetDropdowns(['model']);
    const [category, subCategory] = this.elements.type.value.split(' > ');
    const make = this.elements.make.value;
    const year = this.elements.year.value;
    if (!year) return;

    this.showLoader();
    const data = await this.apiFetch('/fitment/getModelOptions', { category, subCategory, make, year });
    if (data && data.models) {
      this.populateDropdown(this.elements.model, data.models.sort(), 'Select Model');
      this.elements.model.disabled = false;
    }
    this.hideLoader();
  }

  onModelChange() {
    this.elements.findBtn.disabled = !this.elements.model.value;
  }

  async findParts() {
    this.showLoader();
    this.elements.resultsGrid.innerHTML = '';
    this.elements.noResultsMsg.style.display = 'none';

    const make = this.elements.make.value;
    const year = this.elements.year.value;
    const model = this.elements.model.value;
    const [category, subCategory] = this.elements.type.value.split(' > ');

    const data = await this.apiFetch('/fitment/getFitmentProducts', { make, year, model, category, subCategory });

    if (data && data.fitmentProducts) {
      const foundProducts = data.fitmentProducts.filter(p => this.shopifyProducts.has(p.itemNumber));

      if (foundProducts.length > 0) {
        foundProducts.forEach(apiProduct => {
          const shopifyProduct = this.shopifyProducts.get(apiProduct.itemNumber);
          const card = this.createProductCard(shopifyProduct);
          this.elements.resultsGrid.appendChild(card);
        });
      } else {
        this.elements.noResultsMsg.style.display = 'block';
      }
    } else {
      this.elements.noResultsMsg.style.display = 'block';
    }

    this.hideLoader();
  }

  createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'vpf-product-card';

    const imageUrl = product.featured_image ? product.featured_image.src.replace(/(\.[\w\d_-]+)$/i, '_medium$1') : 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';

    card.innerHTML = `
      <a href="${product.url}">
        <div class="vpf-product-card-img-container">
          <img src="${imageUrl}" alt="${product.title}" class="vpf-product-card-img" loading="lazy">
        </div>
        <div class="vpf-product-card-info">
          <p class="vpf-product-card-title">${product.title}</p>
          <p class="vpf-product-card-sku">SKU: ${product.sku}</p>
        </div>
      </a>
    `;
    return card;
  }

  populateDropdown(dropdown, options, defaultOptionText) {
    dropdown.innerHTML = `<option value="">${defaultOptionText}</option>`;
    options.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      dropdown.appendChild(opt);
    });
  }

  resetDropdowns(dropdownNames) {
    dropdownNames.forEach(name => {
      this.elements[name].innerHTML = `<option value="">Select ${name.charAt(0).toUpperCase() + name.slice(1)}</option>`;
      this.elements[name].disabled = true;
    });
    this.elements.findBtn.disabled = true;
  }

  showLoader() {
    this.elements.loader.style.display = 'block';
  }

  hideLoader() {
    this.elements.loader.style.display = 'none';
  }

  showError(message) {
    // Simple alert for now, could be replaced with a more elegant UI element
    alert(`Error: ${message}`);
  }
}
