document.addEventListener('DOMContentLoaded', () => {
  console.log('[FitmentStatus] DOMContentLoaded');
  const fitmentStatusContainers = document.querySelectorAll('.product-fitment-status-container');
  console.log(`[FitmentStatus] Found ${fitmentStatusContainers.length} container(s).`);

  fitmentStatusContainers.forEach((container, index) => {
    const sectionId = container.dataset.sectionId || `block-${index}`; // Fallback ID for logging if sectionId is missing
    console.log(`[FitmentStatus ${sectionId}] Processing container.`);

    const apiToken = container.dataset.apiToken;
    const apiBaseUrl = container.dataset.apiBaseUrl;
    const productSku = container.dataset.productSku;

    console.log(`[FitmentStatus ${sectionId}] API Token:`, apiToken ? '****** (loaded)' : 'MISSING or empty');
    console.log(`[FitmentStatus ${sectionId}] API Base URL:`, apiBaseUrl);
    console.log(`[FitmentStatus ${sectionId}] Product SKU:`, productSku);

    const placeholder = container.querySelector('.fitment-status-placeholder');
    
    const sectionElement = container; // Assuming container is the section/block element itself with data attributes
    
    let fitsMessage = (sectionElement && sectionElement.dataset.fitsMessage) || "This product fits your {vehicle_name}.";
    let doesNotFitMessage = (sectionElement && sectionElement.dataset.doesNotFitMessage) || "This product does not fit your {vehicle_name}.";
    let noVehicleSelectedMessage = (sectionElement && sectionElement.dataset.noVehicleSelectedMessage) || "Select your vehicle using the Product Finder to check fitment.";
    let apiErrorMessage = (sectionElement && sectionElement.dataset.apiErrorMessage) || "Could not retrieve fitment information. Please try again later.";

    console.log(`[FitmentStatus ${sectionId}] Message - Fits:`, sectionElement.dataset.fitsMessage || 'Using default');
    console.log(`[FitmentStatus ${sectionId}] Message - No Fit:`, sectionElement.dataset.doesNotFitMessage || 'Using default');
    console.log(`[FitmentStatus ${sectionId}] Message - No Vehicle:`, sectionElement.dataset.noVehicleSelectedMessage || 'Using default');
    console.log(`[FitmentStatus ${sectionId}] Message - API Error:`, sectionElement.dataset.apiErrorMessage || 'Using default');

    const displayMessage = (message, type = 'info') => {
      console.log(`[FitmentStatus ${sectionId}] Displaying message: "${message}", type: ${type}`);
      if (placeholder) {
        placeholder.textContent = message;
        placeholder.className = `fitment-status-message type-${type}`;
      } else {
        console.error(`[FitmentStatus ${sectionId}] Placeholder element not found!`);
        container.innerHTML = `<p class="fitment-status-message type-${type}">${message}</p>`;
      }
    };

    if (!apiToken || !apiBaseUrl) {
      console.error(`[FitmentStatus ${sectionId}] API token or base URL is missing. Cannot proceed.`);
      if (placeholder) placeholder.style.display = 'none';
      return;
    }

    if (!productSku) {
      console.warn(`[FitmentStatus ${sectionId}] Product SKU not found on the page. Cannot check fitment.`);
      if (placeholder) placeholder.style.display = 'none';
      return;
    }

    const lastSelectedVehicleString = localStorage.getItem('lastSelectedVehicle');
    console.log(`[FitmentStatus ${sectionId}] Raw lastSelectedVehicle from localStorage:`, lastSelectedVehicleString);

    if (!lastSelectedVehicleString) {
      console.log(`[FitmentStatus ${sectionId}] No vehicle selected. Hiding container.`);
      container.style.display = 'none'; // Hide the entire container
      return;
    }

    let lastSelectedVehicle;
    try {
      lastSelectedVehicle = JSON.parse(lastSelectedVehicleString);
      console.log(`[FitmentStatus ${sectionId}] Parsed lastSelectedVehicle:`, lastSelectedVehicle);
    } catch (e) {
      console.error(`[FitmentStatus ${sectionId}] Error parsing lastSelectedVehicle from localStorage.`, e);
      displayMessage(apiErrorMessage, 'error');
      return;
    }

    if (!lastSelectedVehicle || !lastSelectedVehicle.type || !lastSelectedVehicle.make || !lastSelectedVehicle.year || !lastSelectedVehicle.model || !lastSelectedVehicle.category) {
      console.warn(`[FitmentStatus ${sectionId}] Last selected vehicle data from localStorage is incomplete.`, lastSelectedVehicle);
      displayMessage(noVehicleSelectedMessage, 'no-vehicle');
      return;
    }
    
    const vehicleName = `${lastSelectedVehicle.year} ${lastSelectedVehicle.make} ${lastSelectedVehicle.model}`;
    console.log(`[FitmentStatus ${sectionId}] Constructed vehicleName:`, vehicleName);

    const apiUrl = new URL(`${apiBaseUrl.replace(/\/$/, '')}/fitment/getFitmentProducts`);
    apiUrl.searchParams.append('make', lastSelectedVehicle.make);
    apiUrl.searchParams.append('year', lastSelectedVehicle.year);
    apiUrl.searchParams.append('model', lastSelectedVehicle.model);
    apiUrl.searchParams.append('category', lastSelectedVehicle.category);
    if (lastSelectedVehicle.subCategory) {
      apiUrl.searchParams.append('subCategory', lastSelectedVehicle.subCategory);
    }
    apiUrl.searchParams.append('itemList', productSku);
    console.log(`[FitmentStatus ${sectionId}] Constructed API URL:`, apiUrl.toString());

    fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      }
    })
    .then(response => {
      console.log(`[FitmentStatus ${sectionId}] API response status:`, response.status);
      if (!response.ok) {
        return response.text().then(text => { // Get text for more detailed error
          const errorMsg = `API request failed with status ${response.status}. Response: ${text}`;
          console.error(`[FitmentStatus ${sectionId}] ${errorMsg}`);
          throw new Error(errorMsg); 
        });
      }
      return response.json();
    })
    .then(data => {
      console.log(`[FitmentStatus ${sectionId}] API response data:`, data);
      if (data && data.data && Array.isArray(data.data.fitmentProducts)) {
        const productIsFit = data.data.fitmentProducts.some(
          fitProduct => fitProduct.itemNumber === productSku && fitProduct.type === lastSelectedVehicle.type
        );
        console.log(`[FitmentStatus ${sectionId}] Product is fit:`, productIsFit);
        if (productIsFit) {
          displayMessage(fitsMessage.replace('{vehicle_name}', vehicleName), 'fits');
        } else {
          displayMessage(doesNotFitMessage.replace('{vehicle_name}', vehicleName), 'does-not-fit');
        }
      } else if (data && data.status === 404) { // This condition might be redundant if !response.ok handles 404s
        console.warn(`[FitmentStatus ${sectionId}] API returned 404 (interpreted as no fit). SKU ${productSku}, Vehicle: ${vehicleName}. Raw Response:`, data);
        displayMessage(doesNotFitMessage.replace('{vehicle_name}', vehicleName), 'does-not-fit');
      } else {
        console.warn(`[FitmentStatus ${sectionId}] Unexpected API response structure.`, data);
        displayMessage(apiErrorMessage, 'error');
      }
    })
    .catch(error => {
      console.error(`[FitmentStatus ${sectionId}] API call failed or error processing response.`, error);
      displayMessage(apiErrorMessage, 'error');
    });
  });
});
