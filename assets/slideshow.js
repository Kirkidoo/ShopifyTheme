if (!customElements.get("slideshow-component")) {
  customElements.define(
    "slideshow-component",
    class SlideshowComponent extends HTMLElement {
      constructor() {
        super();
        this.slideshow = this.querySelector(".slideshow");
        this.isTransitioning = false;
        this.contentAnimationDelay = 400;
        this.contentExitDelay = 400;
        this.flickity = null;
      }

      connectedCallback() {
        const autoplayEnabled = this.getAttribute("data-autoplay") === "true";
        const autoPlaySpeed = parseInt(this.getAttribute("data-speed"), 10) * 1000;
        this.animationType = this.getAttribute("data-animation-type") ?? "slide";
        this.autoPlayEnabled = autoplayEnabled && autoPlaySpeed > 0;

        if (!this.slideshow) {
          return;
        }

        this.slideshow.style.display = "block";

        // Initialize all content as hidden
        this.initializeContentStates();

        this.flickity = new Flickity(this.slideshow, {
          autoPlay: false,
          cellAlign: "left",
          percentPosition: true,
          fullscreen: true,
          contain: true,
          resize: true,
          draggable: true,
          prevNextButtons: false,
          fade: this.animationType === "fade",
          cellSelector: ".slideshow-slide",
          initialIndex: 0,
          pageDots: false,
          wrapAround: true,
          accessibility: false,
          on: {
            ready: () => {
              // Show first slide content immediately
              this.showSlideContent(0);

              if (this.autoPlayEnabled) {
                this.startAutoplay(autoPlaySpeed);
              }

              setTimeout(() => {
                this.preloadSlide(1);
              }, 3000);
            },
          },
        });

        this.flickity.on("change", (index) => {
          this.handleSlideChange(index);

          const event = new CustomEvent("slideshow:slide-change", {
            detail: {
              id: this.getAttribute("id"),
              index,
            },
          });
          document.dispatchEvent(event);
        });
      }

      disconnectedCallback() {
        if (this.autoplayInterval) {
          clearInterval(this.autoplayInterval);
        }
      }

      initializeContentStates() {
        const allContent = this.querySelectorAll(".slideshow-content-wrap");
        allContent.forEach((content, index) => {
          // Reset all content to hidden state
          content.classList.remove("content-visible", "content-exit");
          content.classList.add("content-enter");
        });
      }

      resetAllContentStates() {
        const allContent = this.querySelectorAll(".slideshow-content-wrap");
        allContent.forEach((content) => {
          content.classList.remove("content-visible", "content-exit");
          content.classList.add("content-enter");
        });
      }

      showSlideContent(index) {
        // First hide all other content
        this.resetAllContentStates();

        const slide = this.querySelectorAll(".slideshow-slide")[index];
        if (slide) {
          const content = slide.querySelector(".slideshow-content-wrap");
          if (content) {
            // Small delay to ensure proper animation
            setTimeout(() => {
              content.classList.remove("content-enter", "content-exit");
              content.classList.add("content-visible");
            }, this.contentAnimationDelay);
          }
        }
      }

      hideSlideContent(index) {
        const slide = this.querySelectorAll(".slideshow-slide")[index];
        if (slide) {
          const content = slide.querySelector(".slideshow-content-wrap");
          if (content) {
            content.classList.remove("content-visible");
            content.classList.add("content-exit");
          }
        }
      }

      hideCurrentSlideContent() {
        if (this.flickity && typeof this.flickity.selectedIndex !== "undefined") {
          this.hideSlideContent(this.flickity.selectedIndex);
        }
      }

      handleSlideChange(index) {
        this.preloadSlide(index + 1);
        this.showSlideContent(index);

        if (typeof publish !== "undefined") {
          publish(PUB_SUB_EVENTS.slideshowSlideChange, {
            id: this.getAttribute("id"),
            index,
          });
        }
      }

      startAutoplay(speed) {
        this.autoplayInterval = setInterval(() => {
          this.transitionToNext();
        }, speed);
      }

      transitionToNext() {
        if (this.isTransitioning || !this.flickity) {
          return;
        }

        this.isTransitioning = true;

        // Hide current content first
        this.hideCurrentSlideContent();

        // Then change slide
        setTimeout(() => {
          this.flickity.next();
          this.isTransitioning = false;
        }, this.contentExitDelay);
      }

      transitionToPrev() {
        if (this.isTransitioning || !this.flickity) {
          return;
        }

        this.isTransitioning = true;

        this.hideCurrentSlideContent();

        setTimeout(() => {
          this.flickity.previous();
          this.isTransitioning = false;
        }, this.contentExitDelay);
      }

      goToSlide(index) {
        if (this.isTransitioning || !this.flickity) {
          return;
        }

        this.isTransitioning = true;
        this.hideCurrentSlideContent();

        setTimeout(() => {
          this.flickity.select(index);
          this.isTransitioning = false;
        }, this.contentExitDelay);
      }

      preloadSlide(index) {
        const slide = this.querySelectorAll(".slideshow-slide")[index];

        if (slide) {
          const media = slide.querySelector(".slideshow-media");
          if (media) {
            media.style.display = "block";
          }

          const images = slide.querySelectorAll("img");
          [...images].forEach((image) => {
            image.loading = "";
          });
        }
      }
    },
  );
}

if (!customElements.get("slideshow-navigation")) {
  customElements.define(
    "slideshow-navigation",
    class SlideshowNavigation extends HTMLElement {
      constructor() {
        super();
        this.slideshow = this.closest("slideshow-component");
        this.initAttempts = 0;
        this.maxInitAttempts = 20;
      }

      connectedCallback() {
        this.tryInitialize();
      }

      tryInitialize() {
        this.initAttempts++;

        if (!this.slideshow || !this.slideshow.flickity) {
          if (this.initAttempts < this.maxInitAttempts) {
            setTimeout(() => this.tryInitialize(), 100);
          }
          return;
        }

        this.flickity = this.slideshow.flickity;
        this.setupNavigation();
      }

      setupNavigation() {
        // Pagination
        const buttons = this.querySelectorAll(".js-page");

        if (buttons.length > 0) {
          this.flickity.on("select", () => {
            buttons.forEach((button) => {
              button.classList.remove("is-active");
            });

            if (buttons[this.flickity.selectedIndex]) {
              buttons[this.flickity.selectedIndex].classList.add("is-active");
            }
          });

          buttons.forEach((button) => {
            button.addEventListener("click", () => {
              const index = [...buttons].findIndex((x) => x === button);
              this.slideshow.goToSlide(index);
            });
          });
        }

        // Previous/Next buttons
        this.buttonPrev = this.querySelector(".js-prev");
        this.buttonNext = this.querySelector(".js-next");

        if (this.buttonPrev) {
          this.buttonPrev.addEventListener("click", (event) => {
            event.preventDefault();
            this.slideshow.transitionToPrev();
          });
        }

        if (this.buttonNext) {
          this.buttonNext.addEventListener("click", (event) => {
            event.preventDefault();
            this.slideshow.transitionToNext();
          });
        }
      }
    },
  );
}
