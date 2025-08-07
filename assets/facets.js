class FacetFiltersForm extends HTMLElement {
  constructor() {
    super();
    this.onActiveFilterClick = this.onActiveFilterClick.bind(this);
    const inputWhitelist = [".facet", ".collection-actions-wrapper"];
    const inputBlacklist = [".collection-actions-compare-toggle"];

    this.debouncedOnSubmit = debounce((event) => {
      this.onSubmitHandler(event);
    }, 500);

    this.debouncedOnSubmitReduced = debounce(
      (event) => {
        this.onSubmitHandler(event);
      },
      250,
      true,
    );

    this.addEventListener("input", (event) => {
      if (
        !inputWhitelist.some((selector) => !!event.target.closest(selector)) ||
        inputBlacklist.some((selector) => !!event.target.closest(selector))
      ) {
        return false;
      }

      if (event.target.closest("price-range")) {
        this.debouncedOnSubmit(event);
      } else {
        this.debouncedOnSubmitReduced(event);
      }
    });
  }

  static setListeners() {
    const onHistoryChange = (event) => {
      const searchParams = event.state
        ? event.state.searchParams
        : FacetFiltersForm.searchParamsInitial;
      if (searchParams === FacetFiltersForm.searchParamsPrev) {
        return;
      }

      FacetFiltersForm.renderPage(searchParams, null, false);
    };
    window.addEventListener("popstate", onHistoryChange);
  }

  static toggleActiveFacets(disable = true) {
    document.querySelectorAll(".js-facet-remove").forEach((element) => {
      element.classList.toggle("disabled", disable);
    });
  }

  static renderPage(searchParams, event, updateURLHash = true, appendResults) {
    FacetFiltersForm.searchParamsPrev = searchParams;
    const sections = FacetFiltersForm.getSections();
    const countContainer = document.getElementById("ProductCount");
    document
      .getElementById("ProductGridContainer")
      .querySelector(".collection")
      .classList.add("loading");

    if (countContainer) {
      countContainer.classList.add("loading");
    }

    sections.forEach((section) => {
      const url = `${window.location.pathname}?section_id=${section.section}&${searchParams}`;
      const filterDataUrl = (element) => element.url === url;

      FacetFiltersForm.filterData.some(filterDataUrl)
        ? FacetFiltersForm.renderSectionFromCache(filterDataUrl, event)
        : FacetFiltersForm.renderSectionFromFetch(url, event, appendResults);
    });

    if (updateURLHash) {
      FacetFiltersForm.updateURLHash(searchParams);
    }

    if (!searchParams.includes("page")) {
      const filtersEvent = new CustomEvent("collection:product-filters", {
        detail: {
          filters: deserializeSearchParams(searchParams),
        },
      });
      document.dispatchEvent(filtersEvent);
    }
  }

  static renderSectionFromFetch(url, event, appendResults) {
    fetch(url)
      .then((response) => response.text())
      .then((responseText) => {
        const html = responseText;
        FacetFiltersForm.filterData = [...FacetFiltersForm.filterData, { html, url }];
        FacetFiltersForm.renderCollectionActions(html);
        FacetFiltersForm.renderFilters(html, event);
        FacetFiltersForm.renderProductGridContainer(html, appendResults);
        FacetFiltersForm.renderProductCount(html);
      });
  }

  static renderSectionFromCache(filterDataUrl, event) {
    const html = FacetFiltersForm.filterData.find(filterDataUrl).html;
    FacetFiltersForm.renderCollectionActions(html);
    FacetFiltersForm.renderFilters(html, event);
    FacetFiltersForm.renderProductGridContainer(html);
    FacetFiltersForm.renderProductCount(html);
  }

  static renderProductGridContainer(html, appendResults) {
    const container = document.getElementById("ProductGridContainer");
    const parsedDom = new DOMParser().parseFromString(html, "text/html");

    if (appendResults) {
      parsedDom
        .getElementById("product-grid")
        .prepend(...[...document.getElementById("product-grid").childNodes]);
    }
    container.innerHTML = parsedDom.getElementById("ProductGridContainer").innerHTML;
  }

  static renderProductCount(html) {
    const count = new DOMParser()
      .parseFromString(html, "text/html")
      .getElementById("ProductCount")?.innerHTML;
    const container = document.getElementById("ProductCount");

    if (!container) {
      return;
    }

    container.innerHTML = count;
    container.classList.remove("loading");
  }

  static renderCollectionActions(html) {
    const container = document.getElementById("CollectionActions");
    const parsedDom = new DOMParser().parseFromString(html, "text/html");

    if (!container) {
      return;
    }

    const parsedContainerActions = parsedDom.getElementById("CollectionActions");

    if (container.classList.contains("is-stuck")) {
      parsedContainerActions.classList.add("is-stuck");
    }

    container.classList = parsedContainerActions.classList;

    const parsedCollectionActionsMain = parsedContainerActions.querySelector(".collection-actions-main");
    const collectionActionsMain = container.querySelector(".collection-actions-main");

    if (parsedCollectionActionsMain && collectionActionsMain) {
      collectionActionsMain.classList = parsedCollectionActionsMain.classList;
      collectionActionsMain.innerHTML = parsedCollectionActionsMain.innerHTML;
    }
  }

  static renderFilters(html, event) {
    const parsedHTML = new DOMParser().parseFromString(html, "text/html");

    const oldFacetElements = document.querySelectorAll("#FacetFiltersForm .js-filter");
    const newFacetElements = parsedHTML.querySelectorAll("#FacetFiltersForm .js-filter");

    const expandedFacets = [];
    document
      .querySelectorAll('#FacetFiltersForm .js-filter collapsible-expandable[expanded="true"]')
      ?.forEach((node) => {
        const parent = node.closest(".js-filter");
        if (node.getAttribute("expanded")) {
          expandedFacets.push(parent.dataset.name);
        }
      });

    const facetsContainer = document.querySelector(
      "#FacetFiltersForm .page-layout-sidebar-inner-content",
    );
    const focusedElement = document.activeElement;
    let focusedFilterId = null;
    if (facetsContainer?.contains(focusedElement)) {
      focusedFilterId = focusedElement.id;
    }

    if (facetsContainer) {
      const previousHeight = facetsContainer?.getBoundingClientRect().height;
      facetsContainer.style.minHeight = `${previousHeight}px`;
    }

    oldFacetElements.forEach((facet) => facet.remove());
    newFacetElements.forEach((element) => {
      const isExpanded = expandedFacets.includes(element.dataset.name);
      element.querySelector(".facet-toggle").setAttribute("aria-expanded", isExpanded);
      element.querySelector("collapsible-expandable").setAttribute("expanded", isExpanded);
      facetsContainer.append(element);
    });

    if (focusedFilterId) {
      document.getElementById(focusedFilterId)?.focus({ preventScroll: true });
    }

    if (facetsContainer) {
      requestAnimationFrame(() => {
        facetsContainer.style.minHeight = "";
      });
    }

    const scrollTop = document.querySelector("facet-filters-form").dataset.scrollTop === "true";
    const container = document.getElementById("CollectionActions");
    if (
      scrollTop &&
      container &&
      window.innerWidth >= 990 &&
      !event?.target.name.includes(".price.")
    ) {
      const offset = document.querySelector("sticky-header:not([disabled])")?.offsetHeight ?? 0;
      const rect = container.getBoundingClientRect();
      const scrollPosition = window.scrollY + rect.top - offset;
      if (rect.top < 0) {
        window.scrollTo({
          top: scrollPosition,
          behavior: "smooth",
        });
      }
    }

    FacetFiltersForm.renderActiveFacets(parsedHTML);
  }

  static renderActiveFacets(html) {
    const activeFacetElementSelectors = [".collection-actions-filters"];

    activeFacetElementSelectors.forEach((selector) => {
      const activeFacetsElement = html.querySelector(selector);
      if (!activeFacetsElement) {
        return;
      }

      document.querySelector(selector).innerHTML = activeFacetsElement.innerHTML;
    });

    FacetFiltersForm.toggleActiveFacets(false);
  }

  static updateURLHash(searchParams, replace) {
    if (replace) {
      history.replaceState(
        { searchParams },
        "",
        `${window.location.pathname}${searchParams && "?".concat(searchParams)}`,
      );
    } else {
      history.pushState(
        { searchParams },
        "",
        `${window.location.pathname}${searchParams && "?".concat(searchParams)}`,
      );
    }
  }

  static getSections() {
    return [
      {
        section: document.querySelector("#product-grid, #product-rows").dataset.id,
      },
    ];
  }

  onSubmitHandler(event) {
    event.preventDefault();
    const formData = new FormData(document.getElementById("FacetsFilterForm"));
    const searchParams = new URLSearchParams(formData).toString();
    FacetFiltersForm.renderPage(searchParams, event);
  }

  onActiveFilterClick(event) {
    event.preventDefault();
    FacetFiltersForm.toggleActiveFacets();
    const url =
      event.currentTarget.href.indexOf("?") == -1
        ? ""
        : event.currentTarget.href.slice(event.currentTarget.href.indexOf("?") + 1);
    FacetFiltersForm.renderPage(url);
  }

  onAjaxPagination(event) {
    event.preventDefault();
    const next = event.currentTarget;
    const url = next.href.indexOf("?") == -1 ? "" : next.href.slice(next.href.indexOf("?") + 1);
    FacetFiltersForm.renderPage(url, event, true);
    document.getElementById("MainContent").scrollIntoView(true);

    const params = new URLSearchParams(url);

    const customEvent = new CustomEvent("pagination:page-change", {
      detail: {
        page: Number(params.get("page")),
      },
    });
    document.dispatchEvent(customEvent);
  }
}

FacetFiltersForm.filterData = [];
FacetFiltersForm.searchParamsInitial = window.location.search.slice(1);
FacetFiltersForm.searchParamsPrev = window.location.search.slice(1);
customElements.define("facet-filters-form", FacetFiltersForm);
FacetFiltersForm.setListeners();

class PriceRange extends HTMLElement {
  constructor() {
    super();
    this.querySelectorAll("input").forEach((element) =>
      element.addEventListener("change", this.onRangeChange.bind(this)),
    );

    this.setMinAndMaxValues();
  }

  onRangeChange(event) {
    this.adjustToValidValues(event.currentTarget);
    this.setMinAndMaxValues();
  }

  setMinAndMaxValues() {
    const inputs = this.querySelectorAll("input");
    const minInput = inputs[0];
    const maxInput = inputs[1];
    if (maxInput.value) minInput.setAttribute("max", maxInput.value);
    if (minInput.value) maxInput.setAttribute("min", minInput.value);
    if (minInput.value === "") maxInput.setAttribute("min", 0);
    if (maxInput.value === "") minInput.setAttribute("max", maxInput.getAttribute("max"));
  }

  adjustToValidValues(input) {
    const value = Number(input.value);
    const min = Number(input.getAttribute("min"));
    const max = Number(input.getAttribute("max"));

    if (value < min) input.value = min;
    if (value > max) input.value = max;
  }
}

customElements.define("price-range", PriceRange);

class FacetRemove extends HTMLElement {
  constructor() {
    super();
    this.querySelector("a").addEventListener("click", (event) => {
      event.preventDefault();
      const form =
        this.closest("facet-filters-form") || document.querySelector("facet-filters-form");
      form.onActiveFilterClick(event);
    });
  }
}

customElements.define("facet-remove", FacetRemove);

class AjaxPaginate extends HTMLElement {
  constructor() {
    super();
    const form = this.closest("facet-filters-form") || document.querySelector("facet-filters-form");
    const buttons = this.querySelectorAll("a");

    buttons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        form.onAjaxPagination(event);
      });
    });
  }
}

customElements.define("ajax-paginate", AjaxPaginate);

class StickyCollectionActions extends HTMLElement {
  constructor() {
    super();

    this.sticky = this.children[0];
    this.createObserver();
  }

  createObserver() {
    const observer = new IntersectionObserver(
      ([entry]) => {
        entry.target.classList.toggle("is-stuck", entry.boundingClientRect.top < 0);
      },
      { threshold: 1 },
    );

    observer.observe(this.sticky);
  }
}

customElements.define("sticky-collection-actions", StickyCollectionActions);

/**
 * Accepts a query string from faceted filtering and returns a
 * deserialized object.
 *
 * @param {string} queryString The query string.
 * @returns {{}}
 */
const deserializeSearchParams = (queryString) => {
  const params = new URLSearchParams(queryString);
  const result = {};

  for (const [key, value] of params.entries()) {
    if (result[key]) {
      result[key] = `${result[key]},${value}`;
    } else if (value) {
      result[key] = value;
    }
  }

  return result;
};
