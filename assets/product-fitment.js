    /**
     * Product Fitment Section Script
     *
     * Fetches and displays vehicle fitment data from the Gamma Powersports API
     * for the current product. Sorts results by Make and includes filtering.
     */
    document.addEventListener('DOMContentLoaded', () => {
      // Find all fitment sections on the page (usually just one on product page)
      const fitmentSections = document.querySelectorAll('.product-fitment-section');

      fitmentSections.forEach(section => {
        const sectionId = section.dataset.sectionId;
        const endpoint = section.dataset.apiEndpoint;
        const apiToken = section.dataset.apiToken;
        const partNumber = section.dataset.partNumber;
        const hideIfEmpty = section.dataset.hideIfEmpty === 'true';
        const hasInitError = section.dataset.initError === 'true';

        // Find elements within this specific section
        const loadingElement = section.querySelector('.product-fitment__loading');
        const resultsContainer = section.querySelector('.product-fitment__results');
        const errorMessageElement = section.querySelector('.product-fitment__error-message');
        const sectionWrapper = section.closest('.product-fitment-wrapper');
        const filterInput = section.querySelector(`#fitment-filter-${sectionId}`); // Get filter input

        let allFitments = []; // Store the full list of fitments fetched from API

        // If token or part number was missing from the start, don't proceed
        if (hasInitError) {
            if (loadingElement) loadingElement.style.display = 'none';
            if (filterInput) filterInput.disabled = true; // Disable filter if init error
            section.dataset.loading = 'false';
            return;
        }

        // Function to display error messages
        const displayError = (message) => {
          if (loadingElement) loadingElement.style.display = 'none';
          if (resultsContainer) resultsContainer.innerHTML = '';
          if (errorMessageElement) {
            errorMessageElement.textContent = `Error: ${message}`;
            errorMessageElement.style.display = 'block';
          }
          if (filterInput) filterInput.disabled = true; // Disable filter on error
          section.dataset.loading = 'false';
          console.error(`Product Fitment Error (${sectionId}): ${message}`);
        };

        // Function to display fitment results (accepts array to display)
        const displayResults = (fitmentsToDisplay) => {
          if (loadingElement) loadingElement.style.display = 'none';
          if (errorMessageElement) errorMessageElement.style.display = 'none';

          // Check if the original fetch returned no data
          if (allFitments.length === 0) {
             resultsContainer.innerHTML = '<p class="product-fitment__results--empty">No specific fitment data found for this part.</p>';
             if (sectionWrapper) {
                 sectionWrapper.dataset.fitmentEmpty = 'true';
                 sectionWrapper.dataset.hideIfEmpty = hideIfEmpty;
             }
             if (filterInput) filterInput.disabled = true; // Disable filter if no data initially
             return; // Exit early
          }

          // Check if the filtered list is empty (but original list had data)
          if (fitmentsToDisplay.length === 0) {
              resultsContainer.innerHTML = '<p class="product-fitment__results--no-match">No matching fitments found.</p>';
              if (sectionWrapper) sectionWrapper.dataset.fitmentEmpty = 'false'; // Not initially empty
              return; // Exit early
          }


          // Build the HTML list from the provided (potentially filtered) array
          const listHtml = fitmentsToDisplay.map(fitment => `
            <li class="product-fitment__list-item">
              <span class="product-fitment__make">${escapeHtml(fitment.fitmentMake || 'N/A')}</span>
              <span class="product-fitment__model">${escapeHtml(fitment.fitmentModel || 'N/A')}</span>
              <span class="product-fitment__years">(${escapeHtml(fitment.fitmentYears || 'N/A')})</span>
            </li>
          `).join('');

          // Add unique ID to the list for aria-controls
          resultsContainer.innerHTML = `<ul class="product-fitment__list" id="product-fitment-results-list-${sectionId}">${listHtml}</ul>`;
          if (sectionWrapper) sectionWrapper.dataset.fitmentEmpty = 'false'; // Mark as not empty
        };

        // Helper to escape HTML characters
        const escapeHtml = (unsafe) => {
            if (!unsafe) return '';
            return unsafe
                 .toString()
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
         };

        // --- Filter Logic ---
        const handleFilter = (event) => {
            const searchTerm = event.target.value.trim().toLocaleLowerCase();

            if (!allFitments) return; // Safety check

            const filteredFitments = allFitments.filter(fitment => {
                const make = (fitment.fitmentMake || '').toLocaleLowerCase();
                const model = (fitment.fitmentModel || '').toLocaleLowerCase();
                const years = (fitment.fitmentYears || '').toLocaleLowerCase();
                // Check if search term is included in make, model, or years
                return make.includes(searchTerm) || model.includes(searchTerm) || years.includes(searchTerm);
            });

            displayResults(filteredFitments); // Re-render the list with filtered results
        };

        // Add event listener to filter input if it exists
        if (filterInput) {
            filterInput.addEventListener('input', handleFilter);
        }

        // --- Make the API Call ---
        const fetchFitmentData = async () => {
          section.dataset.loading = 'true'; // Set loading state
          if (filterInput) filterInput.disabled = true; // Disable filter during load

          const url = `${endpoint}?itemNumber=${encodeURIComponent(partNumber)}`;

          try {
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Accept': 'application/json'
              }
            });

            if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.status === 'success') {
              // Store the full list
              allFitments = result.data?.fitments || [];

              // --- Sort the full list once after fetching ---
              allFitments.sort((a, b) => {
                const makeA = (a.fitmentMake || '').toLocaleLowerCase();
                const makeB = (b.fitmentMake || '').toLocaleLowerCase();
                if (makeA < makeB) return -1;
                if (makeA > makeB) return 1;
                return 0;
              });
              // --- End Sorting ---

              displayResults(allFitments); // Display initial, sorted list
              if (filterInput && allFitments.length > 0) {
                   filterInput.disabled = false; // Enable filter only if data loaded successfully
              }

            } else if (result.status === 'error' || result.status === 'failed') {
              displayError(result.error?.message || 'An unknown API error occurred.');
            } else {
              displayError('Received an unexpected response format from the API.');
            }

          } catch (error) {
            displayError(error.message || 'Could not fetch fitment data. Check network connection or API configuration.');
          } finally {
             section.dataset.loading = 'false'; // Ensure loading state is removed
             // Re-check if filter should be enabled in case of error after successful fetch attempt
             if (filterInput && allFitments.length === 0) {
                 filterInput.disabled = true;
             }
          }
        };

        // --- Initialize ---
        fetchFitmentData();

      }); // End forEach section
    }); // End DOMContentLoaded
    