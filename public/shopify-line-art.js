(() => {
  const mount = document.getElementById('line-art-customizer-mount');
  if (!mount || mount.dataset.initialized === 'true') return;
  mount.dataset.initialized = 'true';
  mount.innerHTML = "<div class=\"line-art-customizer-root\"><div class=\"app-container\">\n    <div class=\"wizard-content-container\">\n\n      <!-- STEP 1: Upload -->\n      <div class=\"step-content active\" id=\"step-pane-1\">\n        <div class=\"glass-panel upload-step-layout\">\n\n          <div class=\"upload-zone\" id=\"drop-zone\">\n            <svg class=\"upload-icon\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\" stroke-width=\"1.5\">\n              <path stroke-linecap=\"round\" stroke-linejoin=\"round\"\n                d=\"M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z\" />\n            </svg>\n            <div class=\"upload-text\" id=\"upload-status-text\">Drag & drop photo here</div>\n            <div class=\"upload-subtext\">Supports PNG, JPEG, WEBP up to 10MB</div>\n            <button class=\"btn btn-secondary\" onclick=\"triggerFileSelect()\">Browse Files</button>\n            <input type=\"file\" id=\"file-input\" accept=\"image/png, image/jpeg, image/webp\" class=\"hidden\">\n          </div>\n\n          <div class=\"preview-card hidden\" id=\"upload-preview-card\">\n            <canvas id=\"crop-canvas\" class=\"crop-canvas\" width=\"520\" height=\"520\" aria-label=\"Crop preview\"></canvas>\n            <div class=\"preview-card-info\" id=\"preview-filename\">image.jpg</div>\n          </div>\n\n          <div class=\"button-row\" style=\"justify-content: flex-end;\">\n            <button class=\"btn btn-primary\" id=\"btn-process-image\" disabled onclick=\"processSourceImage()\">\n              Generate Line Arts\n              <svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\"\n                stroke-width=\"2\" style=\"width:14px;height:14px;\">\n                <path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M13 5l7 7-7 7M5 5l7 7-7 7\" />\n              </svg>\n            </button>\n          </div>\n        </div>\n      </div>\n\n      <!-- STEP 2: Style Selection -->\n      <div class=\"step-content locked\" id=\"step-pane-2\">\n        <div class=\"glass-panel\">\n          <h2 style=\"font-family:'Montserrat',sans-serif; font-size: 18px; font-weight: 600; margin-bottom: 24px;\">\n            Select Line Art Variant</h2>\n\n          <div class=\"variants-grid\" id=\"variants-container\">\n            <!-- Dynamic Variant Cards will go here -->\n          </div>\n\n          <div class=\"button-row\">\n            <button class=\"btn btn-secondary\" onclick=\"navigateToStep(1)\">\n              <svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\"\n                stroke-width=\"2\" style=\"width:14px;height:14px;\">\n                <path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M11 19l-7-7 7-7M20 19l-7-7 7-7\" />\n              </svg>\n              Back to Upload\n            </button>\n          </div>\n        </div>\n      </div>\n\n      <!-- STEP 3: Customize Typography & Colors -->\n      <div class=\"step-content locked\" id=\"step-pane-3\">\n        <div class=\"glass-panel\">\n          <div class=\"customize-layout\">\n\n            <!-- Left Workspace Preview -->\n            <div class=\"canvas-panel\">\n              <div class=\"svg-artwork-container checkerboard-bg\" id=\"svg-container\">\n\n                <!-- Main Interactive SVG -->\n                <svg id=\"artwork-svg\" viewBox=\"0 0 500 500\" width=\"100%\" height=\"100%\"\n                  xmlns=\"http://www.w3.org/2000/svg\">\n                  <defs>\n                    <!-- Font styles imported for SVG rendering context inside canvas -->\n                    <style>\n                      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Montserrat:wght@600;700&family=Outfit:wght@500;700&family=Playfair+Display:ital,wght@0,600;1,600&family=Rochester&display=swap');\n\n                      .svg-text-above,\n                      .svg-text-below {\n                        text-anchor: middle;\n                        user-select: none;\n                      }\n                    </style>\n                  </defs>\n                  <!-- Background rect for high-res clean renders -->\n                  <rect width=\"500\" height=\"500\" fill=\"none\" id=\"svg-bg-rect\" />\n\n                  <!-- Selected Transparent Line Art Image -->\n                  <image id=\"svg-image-element\" x=\"120\" y=\"120\" width=\"260\" height=\"260\"\n                    preserveAspectRatio=\"xMidYMid meet\" />\n\n                  <!-- Curved Path Definitions -->\n                  <path id=\"above-text-path\" fill=\"none\" stroke=\"none\" />\n                  <path id=\"below-text-path\" fill=\"none\" stroke=\"none\" />\n\n                  <!-- Text Elements -->\n                  <g id=\"above-text-group\"></g>\n                  <g id=\"below-text-group\"></g>\n                </svg>\n\n              </div>\n            </div>\n\n            <!-- Right Controls Card -->\n            <div class=\"controls-panel\">\n\n              <!-- Typography Font Family -->\n              <div class=\"control-group\">\n                <label class=\"control-label\">Typography Style</label>\n                <select class=\"select-field\" id=\"font-family-select\" onchange=\"updateSvgLayout()\">\n                  <option value=\"'Outfit', sans-serif\">Outfit (Modern Geometric)</option>\n                  <option value=\"'Montserrat', sans-serif\">Montserrat (Bold Modern)</option>\n                  <option value=\"'Playfair Display', serif\">Playfair Display (Elegant Serif)</option>\n                  <option value=\"'Cinzel', serif\">Cinzel (Roman Calligraphy)</option>\n                  <option value=\"'Rochester', cursive\">Rochester (Classic Script)</option>\n                </select>\n              </div>\n\n              <!-- Size Selector -->\n              <div class=\"control-group\">\n                <label class=\"control-label\">Size</label>\n                <div class=\"size-selector\" style=\"margin-top:8px;\">\n                  <button class=\"size-option\" id=\"size-m\" onclick=\"setSize('m')\">M - 4 in</button>\n                  <button class=\"size-option active\" id=\"size-l\" onclick=\"setSize('l')\">L - 6 in</button>\n                  <button class=\"size-option\" id=\"size-xl\" onclick=\"setSize('xl')\">XL - 8 in</button>\n                  <button class=\"size-option\" id=\"size-xxl\" onclick=\"setSize('xxl')\">XXL - 10 in</button>\n                </div>\n              </div>\n\n              <!-- Text Arc Radius Slider -->\n              <div class=\"control-group\" id=\"radius-control-group\">\n                <label class=\"control-label\">\n                  Text Wrap Diameter\n                  <span class=\"value\" id=\"val-radius-slider\">310px</span>\n                </label>\n                <input type=\"range\" class=\"range-slider\" id=\"radius-slider\" min=\"125\" max=\"210\" value=\"155\"\n                  oninput=\"updateSvgLayout()\">\n              </div>\n\n              <!-- Above Text Customizer -->\n              <div style=\"border-top: 1px solid var(--border-color); padding-top: 20px;\" class=\"control-group\">\n                <label class=\"control-label\">Above Text (Optional)</label>\n                <input type=\"text\" class=\"input-field\" id=\"above-text-input\" placeholder=\"Type text here...\"\n                  oninput=\"updateSvgLayout()\">\n\n                <div class=\"toggle-row\" id=\"above-curve-toggle-row\">\n                  <div class=\"toggle-info\">\n                    <span class=\"toggle-name\">Curve Above Text</span>\n                    <span class=\"toggle-desc\">Wraps text over the top circle arc</span>\n                  </div>\n                  <label class=\"switch\">\n                    <input type=\"checkbox\" id=\"above-curved-toggle\" checked\n                      onchange=\"toggleRadiusControl(); updateSvgLayout();\">\n                    <span class=\"slider-toggle\"></span>\n                  </label>\n                </div>\n\n                <div class=\"control-group\" style=\"margin-top: 8px;\">\n                  <label class=\"control-label\">\n                    Above Font Size\n                    <span class=\"value\" id=\"val-above-size\">24px</span>\n                  </label>\n                  <input type=\"range\" class=\"range-slider\" id=\"above-size-slider\" min=\"14\" max=\"44\" value=\"24\"\n                    oninput=\"updateSvgLayout()\">\n                </div>\n              </div>\n\n              <!-- Below Text Customizer -->\n              <div style=\"border-top: 1px solid var(--border-color); padding-top: 20px;\" class=\"control-group\">\n                <label class=\"control-label\">Below Text (Optional)</label>\n                <input type=\"text\" class=\"input-field\" id=\"below-text-input\" placeholder=\"Type text here...\"\n                  oninput=\"updateSvgLayout()\">\n\n                <div class=\"toggle-row\" id=\"below-curve-toggle-row\">\n                  <div class=\"toggle-info\">\n                    <span class=\"toggle-name\">Curve Below Text</span>\n                    <span class=\"toggle-desc\">Wraps text under the bottom circle arc</span>\n                  </div>\n                  <label class=\"switch\">\n                    <input type=\"checkbox\" id=\"below-curved-toggle\" checked\n                      onchange=\"toggleRadiusControl(); updateSvgLayout();\">\n                    <span class=\"slider-toggle\"></span>\n                  </label>\n                </div>\n\n                <div class=\"control-group\" style=\"margin-top: 8px;\">\n                  <label class=\"control-label\">\n                    Below Font Size\n                    <span class=\"value\" id=\"val-below-size\">24px</span>\n                  </label>\n                  <input type=\"range\" class=\"range-slider\" id=\"below-size-slider\" min=\"14\" max=\"44\" value=\"24\"\n                    oninput=\"updateSvgLayout()\">\n                </div>\n              </div>\n\n              <div class=\"button-row\">\n                <button class=\"btn btn-secondary\" onclick=\"navigateToStep(2)\">Back to Styles</button>\n                <button class=\"btn btn-primary\" onclick=\"proceedToMockups()\">\n                  Apply to Mockups\n                  <svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\"\n                    stroke-width=\"2\" style=\"width:14px;height:14px;\">\n                    <path stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M9 5l7 7-7 7\" />\n                  </svg>\n                </button>\n              </div>\n\n            </div>\n          </div>\n        </div>\n      </div>\n\n      <!-- STEP 4: Product Mockup previews & Export -->\n      <div class=\"step-content locked\" id=\"step-pane-4\">\n        <div class=\"glass-panel\">\n          <h2 style=\"font-family:'Montserrat',sans-serif; font-size: 18px; font-weight: 600; margin-bottom: 24px;\">Your\n            Product Mockups</h2>\n\n          <div class=\"mockups-grid\" id=\"mockups-container\">\n            <!-- Mockup cards loaded dynamically -->\n          </div>\n\n          <div class=\"export-options-bar\">\n            <button class=\"btn btn-primary\" onclick=\"restartWorkflow()\">\n              Start New Design\n              <svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\"\n                stroke-width=\"2\" style=\"width:14px;height:14px;\">\n                <path stroke-linecap=\"round\" stroke-linejoin=\"round\"\n                  d=\"M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18\" />\n              </svg>\n            </button>\n          </div>\n\n          <div class=\"button-row\" style=\"margin-top: 40px;\">\n            <button class=\"btn btn-secondary\" onclick=\"navigateToStep(3)\">Back to Customizer</button>\n          </div>\n        </div>\n      </div>\n\n    </div>\n  </div>\n\n  <!-- Loading Overlay -->\n  <div class=\"loading-overlay\" id=\"loading-overlay\">\n    <div class=\"progress-shell\">\n      <div class=\"loading-text\" id=\"loading-text\">Generating your line art...</div>\n      <div class=\"progress-track\"><div class=\"progress-bar\" id=\"loading-progress-bar\" style=\"width:0%\"></div></div>\n    </div>\n  </div>\n\n  <!-- Temporary Canvas for operations -->\n  <canvas id=\"hidden-canvas\" class=\"hidden\"></canvas></div>";

    // State Variables
    let currentStep = 1;
    let sourceImage = null;      // Selected HTMLImageElement
    let sourceImageDataUrl = "";
    let sourceFileName = "";
    let sourceInputMode = "whole";
    let cropState = { zoom: 1, x: 0, y: 0 };
    let cropPointers = new Map();
    let cropGesture = null;
    let loadingProgressTimer = null;
    let loadingProgressValue = 0;
    let generatedLineArtVariants = []; // Stores generated line art canvases
    let generatedVariantPreviews = [];
    let generatedVariantSourceUrls = [];
    let selectedVariant = null;   // Active lineArt object chosen (width, height, imageData)
    let currentInkColor = "black";
    let selectedSize = 'xxl'; // fixed default size
    let isGeneratingLineArt = false;
    let savedDesignId = "";
    let finalDesignImageUrl = "";
    let isSavingCartDesign = false;
    let isPreparingMockups = false;
    let cartDesignSavePromise = null;
    let selectedDesignSavePromise = null;
    let selectedDesignSaveIndex = -1;
    let selectedDesignAssetsSavePromise = null;
    let uploadProgressTimer = null;
    let uploadProgressValue = 0;
    let uploadStatusMessageTimer = null;
    let uploadStatusMessageIndex = 0;
    let lastSwipeNavigationAt = 0;
    let cartDesignRevision = 0;
    let lastSavedCartDesignRevision = -1;
    let cartDesignAutoSaveTimer = null;
    let selectedVariantIndex = -1;
    let currentGenerationCacheKey = "";
    const BACKEND_BASE_URL = (window.LINE_ART_BACKEND_URL || "https://stamptrial-production.up.railway.app").replace(/\/$/, "");
    const GENERATION_SESSION_CACHE_PREFIX = "lineArtGenerationCache:";
    const GENERATION_LAST_SESSION_CACHE_KEY = "lineArtGenerationCache:last";
    const GENERATION_SESSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const LOADING_MESSAGE = "Generating preview...";
    const GENERATION_LOADING_TARGET = "#line-art-customizer-mount";
    const GENERATION_STATUS_MESSAGES = [
"Analyzing your logo...",
"Tracing every detail...",
"Converting to crisp line art...",
"Refining the edges...",
"Sharpening your design...",
"Cleaning up the outlines...",
"Balancing the contrast...",
"Preparing your options...",
"Mapping the silhouette...",
"Isolating key contours...",
"Simplifying the shapes...",
"Removing the noise...",
"Boosting the black levels...",
"Smoothing stray pixels...",
"Locking in proportions...",
"Checking every small mark...",
"Polishing the strokes...",
"Aligning the negative space...",
"Finalizing the vector paths...",
"Rendering your emblem...",
"Almost ready...",
"Adding the finishing touches...",
    ];
    const GENERATION_STATUS_MESSAGE_MS = 2100;

    // Constants
    const INK_COLORS = {
      black: [28, 25, 23],
      red: [220, 38, 38],
      blue: [29, 78, 216],
      green: [5, 150, 105]
    };

    const INK_HEX = {
      black: "#1c1917",
      red: "#dc2626",
      blue: "#1d4ed8",
      green: "#059669"
    };

    const SIZE_MAP = {
      m: 200,
      l: 300,
      xl: 360,
      xxl: 420
    };
    const SIZE_MAP_WITH_TEXT = {
      m: 190,
      l: 270,
      xl: 315,
      xxl: 330
    };
    const SIZE_RADIUS = {
      m: 135,
      l: 170,
      xl: 205,
      xxl: 220
    };

    function getShopifyProductForms() {
      return Array.from(document.querySelectorAll('form[action*="/cart/add"]'));
    }

    function syncThemeSizeSelector(sizeKey) {
      const sizeMatchMap = {
        m: { aliases: ["m"], inches: "4" },
        l: { aliases: ["l"], inches: "6" },
        xl: { aliases: ["xl"], inches: "8" },
        xxl: { aliases: ["xxl", "2xl"], inches: "10" }
      };
      const target = sizeMatchMap[sizeKey];
      if (!target) return;

      const formSelects = getShopifyProductForms().flatMap((form) =>
        Array.from(form.querySelectorAll('select[name="id"]'))
      );
      const allVariantSelects = Array.from(document.querySelectorAll('select[name="id"]'));
      const selects = Array.from(new Set([...formSelects, ...allVariantSelects]));
      const inchPattern = new RegExp(`(^|\\D)${target.inches}\\s*(inch|in|")\\b`, "i");

      selects.forEach((select) => {
        if (!select) return;

        const matchingOption = Array.from(select.options).find((option) => {
          const label = option.textContent
            .replace(/[–—]/g, "-")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
          const hasSizeAlias = target.aliases.some((alias) =>
            new RegExp(`(^|\\s)${alias}\\s*(-|\\s)`, "i").test(label)
          );
          return hasSizeAlias && inchPattern.test(label);
        });

        if (!matchingOption || select.value === matchingOption.value) return;

        Array.from(select.options).forEach((option) => {
          option.selected = option === matchingOption;
          if (option === matchingOption) {
            option.setAttribute("selected", "selected");
          } else {
            option.removeAttribute("selected");
          }
        });
        select.selectedIndex = Array.from(select.options).indexOf(matchingOption);
        select.value = matchingOption.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new CustomEvent("variant:change", {
          bubbles: true,
          detail: { variantId: matchingOption.value }
        }));
      });
    }

    function scheduleThemeSizeSelectorSync(sizeKey) {
      syncThemeSizeSelector(sizeKey);
      [50, 250, 750].forEach((delay) => {
        setTimeout(() => syncThemeSizeSelector(sizeKey), delay);
      });
    }

    function ensureCartPropertyInputs() {
      const fields = [
        "_Design Preview",
        "_Design ID",
        "Reference ID",
        "Stamp Color"
      ];

      getShopifyProductForms().forEach((form) => {
        fields.forEach((field) => {
          const name = `properties[${field}]`;
          let input = Array.from(form.elements).find((el) => el.name === name);
          if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.dataset.lineArtProperty = field;
            form.appendChild(input);
          }
        });
      });
    }

    function setCartProperty(name, value, { keepWhenEmpty = false } = {}) {
      getShopifyProductForms().forEach((form) => {
        const inputName = `properties[${name}]`;
        let input = Array.from(form.elements).find((el) => el.name === inputName);
        const normalizedValue = value || "";
        if (!normalizedValue && !keepWhenEmpty) {
          if (input) input.remove();
          return;
        }
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.name = inputName;
          input.dataset.lineArtProperty = name;
          form.appendChild(input);
        }
        input.value = normalizedValue;
      });
    }

    function getSelectedVariantPreviewUrl(index = selectedVariantIndex) {
      return index >= 0 ? (generatedVariantSourceUrls[index] || "") : "";
    }

    function getSelectedVariantStyleName(index = selectedVariantIndex) {
      return index >= 0 ? (generatedVariantPreviews[index]?.caption || `Style ${index + 1}`) : "";
    }

    function getDesignSettings(index = selectedVariantIndex) {
      return {
        sourceFileName,
        selectedVariantIndex: index,
        selectedStyleName: getSelectedVariantStyleName(index),
        selectedVariantPreviewUrl: getSelectedVariantPreviewUrl(index),
        selectedSize,
        inkColor: currentInkColor,
        aboveText: document.getElementById("above-text-input")?.value || "",
        belowText: document.getElementById("below-text-input")?.value || "",
        notesForDesigner: document.getElementById("designer-notes-input")?.value || ""
      };
    }

    function syncCartProperties() {
      ensureCartPropertyInputs();
      setCartProperty("_Design Preview", finalDesignImageUrl || getSelectedVariantPreviewUrl());
      setCartProperty("_Design ID", savedDesignId);
      setCartProperty("Reference ID", savedDesignId);
      setCartProperty("Stamp Color", currentInkColor);
      setCartProperty("Top Text", document.getElementById("above-text-input")?.value?.trim() || "");
      setCartProperty("Bottom Text", document.getElementById("below-text-input")?.value?.trim() || "");
      setCartProperty("Design Notes", document.getElementById("designer-notes-input")?.value?.trim() || "");

      ["Design Preview", "Design ID", "Ink Color", "Above Text", "Below Text", "Notes For Designer"].forEach((legacyField) => {
        setCartProperty(legacyField, "");
      });
    }

    function markCartDesignChanged({ scheduleAutoSave = true } = {}) {
      cartDesignRevision++;
      finalDesignImageUrl = "";
      syncCartProperties();
      if (scheduleAutoSave) scheduleCartDesignAutoSave();
    }

    function clearCartDesignAutoSave() {
      if (cartDesignAutoSaveTimer) clearTimeout(cartDesignAutoSaveTimer);
      cartDesignAutoSaveTimer = null;
    }

    function scheduleCartDesignAutoSave(delay = 250) {
      clearCartDesignAutoSave();
      if (!sourceImageDataUrl || !selectedVariant || isGeneratingLineArt) return;

      cartDesignAutoSaveTimer = setTimeout(() => {
        cartDesignAutoSaveTimer = null;
        if (!sourceImageDataUrl || !selectedVariant || finalDesignImageUrl || isGeneratingLineArt) return;
        saveFinalDesignForCart({ silent: true }).catch((error) => {
          console.warn("Background design save skipped:", error);
        });
      }, delay);
    }

    function renderFinalDesignDataUrl() {
      const svgElement = document.getElementById("artwork-svg");
      if (!svgElement) return Promise.resolve("");
      document.getElementById("svg-bg-rect").setAttribute("fill", "none");

      return svgToImage(svgElement).then((img) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 520;
        canvas.height = 520;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      });
    }

    async function uploadCurrentCartDesignSnapshot() {
      const revisionAtStart = cartDesignRevision;
      updateSvgLayout({ skipDirty: true });
      const finalDesignDataUrl = await renderFinalDesignDataUrl();
      const payload = {
        designId: savedDesignId,
        finalDesignDataUrl,
        settings: getDesignSettings()
      };

      if (!savedDesignId) {
        const variantCanvas = makeTransparentLineCanvas(selectedVariant, currentInkColor);
        payload.originalImageDataUrl = sourceImageDataUrl;
        payload.chosenVariantDataUrl = variantCanvas.toDataURL("image/png");
      }

      const response = await fetch(`${BACKEND_BASE_URL}/api/save-design`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Design save failed.");
      }

      if (revisionAtStart !== cartDesignRevision) return false;

      savedDesignId = data.designId || savedDesignId;
      finalDesignImageUrl = data.finalDesignUrl || data.chosenVariantUrl || "";
      lastSavedCartDesignRevision = revisionAtStart;
      syncCartProperties();
      return Boolean(finalDesignImageUrl);
    }

    async function saveFinalDesignForCart({ silent = false } = {}) {
      if (!sourceImageDataUrl || !selectedVariant) return false;
      if (!savedDesignId && selectedDesignSavePromise) await selectedDesignSavePromise;
      if (finalDesignImageUrl && lastSavedCartDesignRevision === cartDesignRevision) return true;
      if (cartDesignSavePromise) return cartDesignSavePromise;

      cartDesignSavePromise = (async () => {
        isSavingCartDesign = true;
        clearCartDesignAutoSave();
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            const saved = await uploadCurrentCartDesignSnapshot();
            if (saved) return true;
          }
          return false;
        } catch (err) {
          if (!silent) console.warn("Final design save skipped:", err);
          return false;
        } finally {
          isSavingCartDesign = false;
          cartDesignSavePromise = null;
        }
      })();

      return cartDesignSavePromise;
    }

    function getCartSubmitButton(form) {
      return form.querySelector('button[type="submit"], input[type="submit"], button[name="add"], [name="add"]');
    }

    function setCartSubmitLoading(form, isLoading, label = "Adding to cart...") {
      const button = getCartSubmitButton(form);
      if (!button) return;

      if (isLoading) {
        if (!button.dataset.lineArtOriginalHtml) {
          button.dataset.lineArtOriginalHtml = button.innerHTML;
        }
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        if (button.tagName === "INPUT") {
          if (!button.dataset.lineArtOriginalValue) button.dataset.lineArtOriginalValue = button.value;
          button.value = label;
        } else {
          button.innerHTML = `<span class="line-art-button-spinner" aria-hidden="true"></span><span>${label}</span>`;
        }
      } else {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        if (button.tagName === "INPUT") {
          button.value = button.dataset.lineArtOriginalValue || button.value;
        } else if (button.dataset.lineArtOriginalHtml) {
          button.innerHTML = button.dataset.lineArtOriginalHtml;
        }
      }
    }

    function attachShopifyCartBridge() {
      ensureCartPropertyInputs();
      getShopifyProductForms().forEach((form) => {
        if (form.dataset.lineArtBridgeReady === "true") return;
        form.dataset.lineArtBridgeReady = "true";
        form.addEventListener("submit", async (event) => {
          if (form.dataset.lineArtSubmitting === "true") return;

          if (!sourceImageDataUrl || !selectedVariant) {
            event.preventDefault();
            event.stopPropagation();
            alert("Please upload a photo and choose a style before adding this product to cart.");
            navigateToStep(sourceImageDataUrl ? 2 : 1);
            return;
          }

          syncCartProperties();
          if (savedDesignId) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          setCartSubmitLoading(form, true, "Adding to cart...");
          if (!savedDesignId && !selectedDesignSavePromise) {
            saveSelectedDesign(selectedVariantIndex >= 0 ? selectedVariantIndex : 0);
          }
          const saved = savedDesignId || await selectedDesignSavePromise;

          if (!saved) {
            setCartSubmitLoading(form, false);
            alert("Please finish your custom line art before adding this product to cart.");
            return;
          }

          syncCartProperties();
          form.dataset.lineArtSubmitting = "true";
          if (typeof form.requestSubmit === "function") {
            form.requestSubmit();
          } else {
            form.submit();
          }
          setTimeout(() => {
            form.dataset.lineArtSubmitting = "false";
            setCartSubmitLoading(form, false);
          }, 1000);
        }, true);
      });
    }

    function setSize(key) {
      selectedSize = key;
      // Toggle active classes for buttons
      ['m','l','xl','xxl'].forEach(k => {
        const el = document.getElementById('size-' + k);
        if (el) el.classList.toggle('active', k === key);
      });

      // Apply size class to preview container
      const svgContainer = document.getElementById('svg-container');
      if (svgContainer) {
        svgContainer.classList.remove('size-m','size-l','size-xl','size-xxl');
        svgContainer.classList.add('size-' + (key === 'm' ? 'm' : key === 'l' ? 'l' : key === 'xl' ? 'xl' : 'xxl'));
      }
      // Auto-adjust text wrap diameter (radius slider) for the chosen size
      const radiusEl = document.getElementById('radius-slider');
      if (radiusEl) {
        radiusEl.max = 225;
        const rv = SIZE_RADIUS[key] || parseInt(radiusEl.value);
        radiusEl.value = rv;
        const display = document.getElementById('val-radius-slider');
        if (display) display.textContent = `${rv * 2}px`;
      }
      const belowRadiusEl = document.getElementById('below-radius-slider');
      if (belowRadiusEl) {
        belowRadiusEl.max = 225;
        const rv = SIZE_RADIUS[key] || parseInt(belowRadiusEl.value);
        belowRadiusEl.value = rv;
        const display = document.getElementById('val-below-radius-slider');
        if (display) display.textContent = `${rv * 2}px`;
      }

      scheduleThemeSizeSelectorSync(key);
      updateSvgLayout();
    }

    const DEFAULT_BACKGROUNDS = [
      {
        title: "Jar Mockup",
        src: "https://cdn.shopify.com/s/files/1/0776/5891/4989/files/bg1.webp?v=1782986777",
        box: { x: 0.31, y: 0.35, width: 0.38, height: 0.40 },
        fitScale: 1.02,
        yOffset: 0.03,
        rotation: 0
      },
      {
        title: "Fine Art Paper Mockup",
        src: "https://cdn.shopify.com/s/files/1/0776/5891/4989/files/bg2.jpg?v=1782986777",
        box: { x: 0.23, y: 0.13, width: 0.54, height: 0.66 },
        fitScale: 0.96,
        yOffset: 0.02,
        rotation: -0.13
      },
      {
        title: "Tote Bag Mockup",
        src: "https://cdn.shopify.com/s/files/1/0776/5891/4989/files/bg3.png?v=1782986780",
        box: { x: 0.22, y: 0.34, width: 0.56, height: 0.48 },
        fitScale: 0.94,
        yOffset: 0.02,
        rotation: 0
      },
      {
        title: "Shipping Box Mockup",
        src: "https://cdn.shopify.com/s/files/1/0776/5891/4989/files/bg4.jpg?v=1782986776",
        box: { x: 0.27, y: 0.18, width: 0.46, height: 0.62 },
        fitScale: 0.96,
        yOffset: 0.02,
        rotation: 0
      }
    ];

    // Initialize drop-zone listeners
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");

    dropZone.addEventListener("click", (event) => {
      if (event.target.closest("button") || event.target === fileInput) return;
      triggerFileSelect();
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragging");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("dragging");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragging");
      if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", () => {
      if (fileInput.files.length > 0) {
        handleFileSelect(fileInput.files[0]);
      }
    });

    initSourceInputModeControls();
    initSeparateRadiusControls();
    initSimplifiedFlowUi();
    initCropCanvas();
    initMobileStepSwipe();

    function triggerFileSelect() {
      fileInput.click();
    }

    function handleFileSelect(file) {
      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        alert("Please select a PNG, JPEG, or WEBP image.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert("Please upload an image under 10MB.");
        return;
      }

      sourceFileName = file.name;
      clearCartDesignAutoSave();
      cartDesignRevision++;
      lastSavedCartDesignRevision = -1;
      savedDesignId = "";
      finalDesignImageUrl = "";
      selectedVariant = null;
      selectedVariantIndex = -1;
      currentGenerationCacheKey = "";
      generatedLineArtVariants = [];
      generatedVariantPreviews = [];
      generatedVariantSourceUrls = [];
      selectedDesignSavePromise = null;
      selectedDesignSaveIndex = -1;
      selectedDesignAssetsSavePromise = null;
      document.getElementById("variants-container").innerHTML = "";
      syncCartProperties();
      document.getElementById("preview-filename").textContent = file.name;

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          sourceImage = img;
          sourceImageDataUrl = e.target.result;
          resetCropControls();
          setSourceInputMode("whole");
          document.getElementById("upload-preview-card").classList.remove("hidden");
          document.getElementById("btn-process-image").removeAttribute("disabled");
          document.getElementById("upload-status-text").textContent = "Image uploaded. Generating preview...";
          processSourceImage();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function initSourceInputModeControls() {
      const previewCard = document.getElementById("upload-preview-card");
      const canvas = document.getElementById("crop-canvas");
      if (!previewCard || !canvas || previewCard.dataset.sourceModeReady === "true") return;

      previewCard.dataset.sourceModeReady = "true";
      const controls = document.createElement("div");
      controls.className = "source-mode-selector";
      controls.innerHTML = `
        <button type="button" class="source-mode-option active" data-source-mode="whole">Whole logo</button>
        <button type="button" class="source-mode-option" data-source-mode="crop">Crop image</button>
      `;

      controls.querySelectorAll("[data-source-mode]").forEach((button) => {
        button.addEventListener("click", () => setSourceInputMode(button.dataset.sourceMode));
      });

      previewCard.insertBefore(controls, canvas);
      setSourceInputMode(sourceInputMode);
    }

    function initSeparateRadiusControls() {
      const aboveGroup = document.getElementById("radius-control-group");
      const aboveSlider = document.getElementById("radius-slider");
      const aboveValue = document.getElementById("val-radius-slider");
      if (!aboveGroup || !aboveSlider || aboveGroup.dataset.separateRadiusReady === "true") return;

      aboveGroup.dataset.separateRadiusReady = "true";
      const aboveLabel = aboveGroup.querySelector(".control-label");
      if (aboveLabel) {
        aboveLabel.innerHTML = `Above Text Wrap Diameter <span class="value" id="val-radius-slider">${aboveValue?.textContent || ""}</span>`;
      }
      aboveSlider.max = 225;

      const belowGroup = document.createElement("div");
      belowGroup.className = "control-group";
      belowGroup.id = "below-radius-control-group";
      belowGroup.innerHTML = `
        <label class="control-label">
          Below Text Wrap Diameter
          <span class="value" id="val-below-radius-slider"></span>
        </label>
        <input type="range" class="range-slider" id="below-radius-slider" min="125" max="225" value="${aboveSlider.value}">
      `;

      belowGroup.querySelector("#below-radius-slider").addEventListener("input", updateSvgLayout);
      aboveGroup.insertAdjacentElement("afterend", belowGroup);
    }

    function initSimplifiedFlowUi() {
      const processButton = document.getElementById("btn-process-image");
      if (processButton) {
        processButton.closest(".button-row")?.classList.add("hidden");
      }

      const variantsHeading = document.querySelector("#step-pane-2 h2");
      if (variantsHeading) variantsHeading.textContent = "Choose a Style";

      const variantBackButton = document.querySelector("#step-pane-2 .button-row .btn-secondary");
      if (variantBackButton) {
        const icon = variantBackButton.querySelector("svg");
        variantBackButton.textContent = "Upload Different Image";
        if (icon) variantBackButton.prepend(icon);
      }

      const loadingText = document.getElementById("loading-text");
      if (loadingText) loadingText.textContent = LOADING_MESSAGE;

      initUploadPictureButton();
      hideAdvancedTextControls();
      initDesignerNotesControl();
      initNoMockupCustomizerFlow();
    }

    function initNoMockupCustomizerFlow() {
      document.getElementById("step-pane-4")?.classList.add("hidden");

      const customizePanel = document.querySelector("#step-pane-3 .glass-panel");
      const customizeLayout = document.querySelector("#step-pane-3 .customize-layout");
      const bottomRow = document.querySelector("#step-pane-3 .button-row");
      const backButton = bottomRow?.querySelector(".btn-secondary");
      const applyButton = bottomRow?.querySelector(".btn-primary");

      applyButton?.remove();

      if (customizePanel && customizeLayout && backButton && !document.querySelector("#step-pane-3 .customizer-top-actions")) {
        const topActions = document.createElement("div");
        topActions.className = "customizer-top-actions";
        backButton.textContent = "Back to Styles";
        backButton.classList.add("customizer-back-btn");
        topActions.appendChild(backButton);
        customizePanel.insertBefore(topActions, customizeLayout);
      }

      if (bottomRow && !bottomRow.children.length) {
        bottomRow.remove();
      }

      initCustomizerPreviewFullscreen();
    }

    function initCustomizerPreviewFullscreen() {
      const preview = document.getElementById("svg-container");
      if (!preview || preview.dataset.fullscreenReady === "true") return;

      preview.dataset.fullscreenReady = "true";
      preview.setAttribute("role", "button");
      preview.setAttribute("tabindex", "0");
      preview.setAttribute("aria-label", "Open preview fullscreen");

      const openPreview = async () => {
        if (Date.now() - lastSwipeNavigationAt < 600) return;
        if (!selectedVariant) return;
        try {
          const previewUrl = await renderFinalDesignDataUrl();
          openFullscreenImage(previewUrl, "Stamp preview");
        } catch (error) {
          console.warn("Could not open preview fullscreen:", error);
        }
      };

      preview.addEventListener("click", openPreview);
      preview.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPreview();
        }
      });
    }

    function initUploadPictureButton() {
      const uploadButton = document.querySelector("#drop-zone .btn-secondary");
      if (!uploadButton) return;

      uploadButton.innerHTML = '<span class="upload-picture-label">Upload your logo</span>';
      uploadButton.classList.add("upload-picture-btn");
      uploadButton.style.setProperty("--upload-progress", "0%");
      document.querySelectorAll("#drop-zone .upload-required-marker").forEach((marker) => marker.remove());
    }

    function setUploadButtonLoading(isLoading, progress = 0) {
      const uploadButton = document.querySelector("#drop-zone .upload-picture-btn");
      if (!uploadButton) return;

      const label = uploadButton.querySelector(".upload-picture-label") || uploadButton;
      const clampedProgress = Math.max(0, Math.min(100, Math.round(progress || 0)));
      uploadButton.classList.toggle("is-loading", isLoading);
      uploadButton.disabled = isLoading;
      uploadButton.style.setProperty("--upload-progress", isLoading ? `${clampedProgress}%` : "0%");
      uploadButton.setAttribute("aria-busy", isLoading ? "true" : "false");

      if (!isLoading) {
        stopUploadStatusMessages();
        label.textContent = "Upload your logo";
        return;
      }

      if (!label.querySelector(".upload-loader-content")) {
        label.innerHTML = '<span class="upload-loader-content"><span class="upload-loader-percent">0%</span><span class="upload-loader-roller"><span class="upload-loader-message"></span></span></span>';
      }

      const percent = label.querySelector(".upload-loader-percent");
      if (percent) percent.textContent = `${clampedProgress}%`;

      if (clampedProgress >= 100) {
        stopUploadStatusMessages({ reset: false });
        uploadStatusMessageIndex = GENERATION_STATUS_MESSAGES.length - 1;
      } else {
        startUploadStatusMessages();
      }

      refreshUploadStatusMessage();
    }

    function refreshUploadStatusMessage() {
      const messageEl = document.querySelector("#drop-zone .upload-loader-message");
      if (!messageEl) return;

      const message = GENERATION_STATUS_MESSAGES[uploadStatusMessageIndex] || GENERATION_STATUS_MESSAGES[0];
      if (messageEl.dataset.message === message) return;

      messageEl.dataset.message = message;
      messageEl.textContent = message;
      messageEl.style.animation = "none";
      void messageEl.offsetWidth;
      messageEl.style.animation = "";
    }

    function startUploadStatusMessages() {
      if (uploadStatusMessageTimer) return;

      uploadStatusMessageTimer = setInterval(() => {
        uploadStatusMessageIndex = (uploadStatusMessageIndex + 1) % GENERATION_STATUS_MESSAGES.length;
        refreshUploadStatusMessage();
      }, GENERATION_STATUS_MESSAGE_MS);
    }

    function stopUploadStatusMessages({ reset = true } = {}) {
      if (uploadStatusMessageTimer) clearInterval(uploadStatusMessageTimer);
      uploadStatusMessageTimer = null;
      if (reset) uploadStatusMessageIndex = 0;
    }

    function stopUploadProgressTimer() {
      if (uploadProgressTimer) clearInterval(uploadProgressTimer);
      uploadProgressTimer = null;
      uploadProgressValue = 0;
    }

    function animateUploadProgress(progress = 0) {
      if (!uploadProgressTimer && !uploadStatusMessageTimer) uploadStatusMessageIndex = 0;
      uploadProgressValue = Math.max(uploadProgressValue, Math.round(progress || 0));
      setUploadButtonLoading(true, uploadProgressValue);

      if (uploadProgressTimer) return;
      uploadProgressTimer = setInterval(() => {
        const cap = uploadProgressValue < 70 ? 91 : 96;
        const step = uploadProgressValue < 35 ? 4 : uploadProgressValue < 70 ? 2 : 0.65;
        uploadProgressValue = Math.min(cap, uploadProgressValue + step);
        setUploadButtonLoading(true, uploadProgressValue);
      }, 320);
    }

    function setGenerationLoading(isLoading = false, progress = 0) {
      if (isLoading) {
        if (progress >= 100) {
          stopUploadProgressTimer();
          setUploadButtonLoading(true, 100);
        } else {
          animateUploadProgress(progress);
        }
      } else {
        stopUploadProgressTimer();
        setUploadButtonLoading(false);
      }

      document
        .querySelectorAll(`${GENERATION_LOADING_TARGET} .section-loading-overlay`)
        .forEach((overlay) => overlay.remove());

      const globalOverlay = document.getElementById("loading-overlay");
      if (globalOverlay) {
        globalOverlay.classList.remove("active");
        globalOverlay.style.display = "none";
      }
      stopGlobalProgress();
    }

    function getApplyMockupsButton() {
      return document.querySelector("#step-pane-3 .button-row .btn-primary");
    }

    function setMockupsButtonLoading(isLoading) {
      const button = getApplyMockupsButton();
      if (!button) return;

      button.classList.toggle("is-loading", isLoading);
      button.disabled = isLoading;
      button.setAttribute("aria-busy", isLoading ? "true" : "false");
      button.innerHTML = isLoading
        ? '<span class="button-spinner" aria-hidden="true"></span><span>Preparing mockups...</span>'
        : 'Apply to Mockups<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>';
    }

    function ensureFullscreenViewer() {
      let viewer = document.getElementById("line-art-fullscreen-viewer");
      if (viewer) return viewer;

      viewer = document.createElement("div");
      viewer.id = "line-art-fullscreen-viewer";
      viewer.className = "line-art-fullscreen-viewer";
      viewer.innerHTML = `
        <button class="fullscreen-close-btn" type="button" aria-label="Close preview">Close</button>
        <div class="fullscreen-image-shell">
          <img class="fullscreen-image" alt="">
          <div class="fullscreen-controls-stack">
            <div class="fullscreen-caption"></div>
            <div class="fullscreen-dots hidden" aria-label="Style position"></div>
            <div class="fullscreen-thumbnails" aria-label="Generated styles"></div>
            <button class="fullscreen-pick-btn hidden" type="button">Pick this style</button>
          </div>
        </div>
      `;

      viewer.addEventListener("click", (event) => {
        if (event.target === viewer || event.target.closest(".fullscreen-close-btn")) {
          closeFullscreenImage();
        }
      });

      let swipeStart = null;
      viewer.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1 || event.target.closest(".fullscreen-thumb, .fullscreen-dot, .fullscreen-pick-btn, .fullscreen-close-btn")) {
          swipeStart = null;
          return;
        }
        const touch = event.touches[0];
        swipeStart = { x: touch.clientX, y: touch.clientY, t: Date.now() };
      }, { passive: true });

      viewer.addEventListener("touchend", (event) => {
        if (!swipeStart || !event.changedTouches.length) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - swipeStart.x;
        const dy = touch.clientY - swipeStart.y;
        const elapsed = Date.now() - swipeStart.t;
        swipeStart = null;

        if (Math.abs(dx) > 58 && Math.abs(dy) < 70 && Math.abs(dx) > Math.abs(dy) * 1.25 && elapsed < 900) {
          event.preventDefault();
          moveFullscreenVariant(viewer, dx < 0 ? 1 : -1);
        }
      }, { passive: false });

      document.body.appendChild(viewer);
      return viewer;
    }

    function setFullscreenPickVisible(viewer, isVisible) {
      const pickButton = viewer.querySelector(".fullscreen-pick-btn");
      if (!pickButton) return;
      pickButton.classList.toggle("hidden", !isVisible);
    }

    function updateFullscreenStripLayout(viewer) {
      const shell = viewer && viewer.querySelector(".fullscreen-image-shell");
      const image = viewer && viewer.querySelector(".fullscreen-image");
      const thumbnails = viewer && viewer.querySelector(".fullscreen-thumbnails");
      if (!shell || !image || !thumbnails || thumbnails.classList.contains("hidden")) return;

      const viewport = window.visualViewport || window;
      const viewportWidth = Math.floor(viewport.width || window.innerWidth || 0);
      const shellWidth = Math.floor(shell.getBoundingClientRect().width || viewportWidth);
      const imageWidth = Math.floor(image.getBoundingClientRect().width || 0);
      const maxStripWidth = Math.max(280, Math.min(shellWidth, viewportWidth - 32, 700));
      const smallImageMinimum = viewportWidth <= 600 ? 340 : 520;
      const comfortableMinimum = viewportWidth <= 600 ? 300 : 420;
      const targetWidth = imageWidth > 0 && imageWidth < comfortableMinimum
        ? smallImageMinimum
        : Math.max(comfortableMinimum, imageWidth);
      const stripWidth = Math.max(280, Math.min(maxStripWidth, targetWidth));

      shell.style.setProperty("--fullscreen-strip-width", `${stripWidth}px`);
    }

    function scheduleFullscreenStripLayout(viewer) {
      if (!viewer) return;
      requestAnimationFrame(() => updateFullscreenStripLayout(viewer));
      window.setTimeout(() => updateFullscreenStripLayout(viewer), 120);
    }

    function setFullscreenPreview(viewer, src, caption, activeIndex = -1, { showPick } = {}) {
      const image = viewer.querySelector(".fullscreen-image");
      const captionEl = viewer.querySelector(".fullscreen-caption");
      image.onload = () => scheduleFullscreenStripLayout(viewer);
      image.src = src;
      image.alt = caption;
      captionEl.textContent = caption;
      viewer.dataset.activeIndex = String(activeIndex);

      viewer.querySelectorAll(".fullscreen-thumb").forEach((thumb) => {
        thumb.classList.toggle("active", Number(thumb.dataset.index) === activeIndex);
      });
      viewer.querySelectorAll(".fullscreen-dot").forEach((dot) => {
        dot.classList.toggle("active", Number(dot.dataset.index) === activeIndex);
      });
      setFullscreenPickVisible(viewer, typeof showPick === "boolean" ? showPick : Boolean(viewer._lineArtPickStyle));
      scheduleFullscreenStripLayout(viewer);
    }

    function moveFullscreenVariant(viewer, delta) {
      const gallery = viewer._lineArtGallery || [];
      if (gallery.length <= 1) return;
      const currentIndex = Number(viewer.dataset.activeIndex || 0);
      const nextIndex = (currentIndex + delta + gallery.length) % gallery.length;
      const item = gallery[nextIndex];
      if (!item) return;
      setFullscreenPreview(viewer, item.src, item.caption || `Style ${nextIndex + 1}`, nextIndex);
    }

    function openFullscreenImage(src, caption = "Preview", options = {}) {
      if (Date.now() - lastSwipeNavigationAt < 600) return;
      if (!src) return;
      const viewer = ensureFullscreenViewer();
      const thumbnails = viewer.querySelector(".fullscreen-thumbnails");
      const dots = viewer.querySelector(".fullscreen-dots");
      const pickButton = viewer.querySelector(".fullscreen-pick-btn");
      const gallery = Array.isArray(options.gallery) ? options.gallery.filter((item) => item && item.src) : [];
      const activeIndex = Number.isInteger(options.activeIndex) ? options.activeIndex : gallery.findIndex((item) => item.src === src);
      viewer._lineArtGallery = gallery;
      viewer._lineArtPickStyle = typeof options.onPick === "function" ? options.onPick : null;

      if (pickButton) {
        pickButton.onclick = (event) => {
          event.stopPropagation();
          const index = Number(viewer.dataset.activeIndex);
          if (viewer._lineArtPickStyle && Number.isInteger(index) && index >= 0) {
            closeFullscreenImage();
            viewer._lineArtPickStyle(index);
          }
        };
      }

      if (thumbnails) {
        thumbnails.innerHTML = "";
        thumbnails.classList.toggle("hidden", gallery.length <= 1);
        gallery.forEach((item, index) => {
          const button = document.createElement("button");
          button.className = "fullscreen-thumb";
          button.type = "button";
          button.dataset.index = String(index);
          button.setAttribute("aria-label", `View ${item.caption || `Style ${index + 1}`}`);
          button.innerHTML = `<img src="${item.src}" alt="">`;
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            setFullscreenPreview(viewer, item.src, item.caption || `Style ${index + 1}`, index);
          });
          thumbnails.appendChild(button);
        });
      }

      if (dots) {
        dots.innerHTML = "";
        dots.classList.toggle("hidden", gallery.length <= 1);
        gallery.forEach((item, index) => {
          const button = document.createElement("button");
          button.className = "fullscreen-dot";
          button.type = "button";
          button.dataset.index = String(index);
          button.setAttribute("aria-label", `View ${item.caption || `Style ${index + 1}`}`);
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            setFullscreenPreview(viewer, item.src, item.caption || `Style ${index + 1}`, index);
          });
          dots.appendChild(button);
        });
      }

      setFullscreenPreview(viewer, src, caption, activeIndex);
      viewer.classList.add("active");
      document.body.classList.add("line-art-fullscreen-open");
      scheduleFullscreenStripLayout(viewer);

      if (viewer.requestFullscreen && !document.fullscreenElement) {
        viewer.requestFullscreen()
          .then(() => scheduleFullscreenStripLayout(viewer))
          .catch(() => {});
      }
    }

    function closeFullscreenImage() {
      const viewer = document.getElementById("line-art-fullscreen-viewer");
      if (!viewer) return;
      viewer.classList.remove("active");
      document.body.classList.remove("line-art-fullscreen-open");

      if (document.fullscreenElement === viewer && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFullscreenImage();
    });

    window.addEventListener("resize", () => {
      const viewer = document.getElementById("line-art-fullscreen-viewer");
      if (viewer && viewer.classList.contains("active")) scheduleFullscreenStripLayout(viewer);
    });

    document.addEventListener("fullscreenchange", () => {
      const viewer = document.getElementById("line-art-fullscreen-viewer");
      if (viewer && viewer.classList.contains("active")) scheduleFullscreenStripLayout(viewer);
    });

    function hideAdvancedTextControls() {
      [
        document.querySelector(".size-selector")?.closest(".control-group"),
        document.getElementById("font-family-select")?.closest(".control-group"),
        document.getElementById("radius-control-group"),
        document.getElementById("below-radius-control-group"),
        document.getElementById("above-curve-toggle-row"),
        document.getElementById("below-curve-toggle-row"),
        document.getElementById("above-size-slider")?.closest(".control-group"),
        document.getElementById("below-size-slider")?.closest(".control-group")
      ].forEach((element) => {
        element?.classList.add("hidden");
      });
    }

    function initDesignerNotesControl() {
      if (document.getElementById("designer-notes-input")) return;

      const belowTextInput = document.getElementById("below-text-input");
      const belowTextGroup = belowTextInput?.closest(".control-group");
      if (!belowTextGroup) return;

      const notesGroup = document.createElement("div");
      notesGroup.className = "control-group designer-notes-group";
      notesGroup.innerHTML = `
        <label class="control-label">Notes For Your Designer (Optional)</label>
        <textarea class="textarea-field" id="designer-notes-input" placeholder="Add any extra instructions..." rows="4"></textarea>
      `;

      const notesInput = notesGroup.querySelector("#designer-notes-input");
      notesInput.addEventListener("input", () => markCartDesignChanged());
      belowTextGroup.insertAdjacentElement("afterend", notesGroup);
    }

    function setSourceInputMode(mode) {
      sourceInputMode = mode === "crop" ? "crop" : "whole";

      document.querySelectorAll(".source-mode-option").forEach((button) => {
        button.classList.toggle("active", button.dataset.sourceMode === sourceInputMode);
      });

      const canvas = document.getElementById("crop-canvas");
      if (canvas) {
        canvas.classList.toggle("crop-enabled", sourceInputMode === "crop");
      }

      updateSourcePreview();
    }

    function resetCropControls() {
      cropState = { zoom: 1, x: 0, y: 0 };
      cropPointers.clear();
      cropGesture = null;
    }

    function getCropSettings() {
      return cropState;
    }

    function clampCropState() {
      cropState.zoom = Math.max(1, Math.min(4, cropState.zoom));
      cropState.x = Math.max(-1, Math.min(1, cropState.x));
      cropState.y = Math.max(-1, Math.min(1, cropState.y));
    }

    function getCropMetrics(size) {
      const zoom = cropState.zoom;
      const coverScale = Math.max(size / sourceImage.width, size / sourceImage.height) * zoom;
      const drawW = sourceImage.width * coverScale;
      const drawH = sourceImage.height * coverScale;
      return {
        drawW,
        drawH,
        maxX: Math.max(0, (drawW - size) / 2),
        maxY: Math.max(0, (drawH - size) / 2)
      };
    }

    function drawCropToCanvas(canvas, outputSize) {
      if (!sourceImage || !canvas) return null;
      const size = outputSize || canvas.width || 520;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const { drawW, drawH, maxX, maxY } = getCropMetrics(size);
      const drawX = (size - drawW) / 2 + cropState.x * maxX;
      const drawY = (size - drawH) / 2 + cropState.y * maxY;

      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceImage, drawX, drawY, drawW, drawH);
      return canvas;
    }

    function drawWholeImageToCanvas(canvas, outputSize) {
      if (!sourceImage || !canvas) return null;
      const size = outputSize || canvas.width || 520;
      const padding = Math.round(size * 0.06);
      const fitSize = size - padding * 2;
      const scale = Math.min(fitSize / sourceImage.width, fitSize / sourceImage.height);
      const drawW = sourceImage.width * scale;
      const drawH = sourceImage.height * scale;
      const drawX = (size - drawW) / 2;
      const drawY = (size - drawH) / 2;

      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceImage, drawX, drawY, drawW, drawH);
      return canvas;
    }

    function cropPointDistance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function cropCenter(points) {
      return {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length
      };
    }

    function beginCropGesture() {
      if (sourceInputMode !== "crop") return;
      const points = Array.from(cropPointers.values());
      if (!points.length) {
        cropGesture = null;
        return;
      }
      cropGesture = {
        points,
        center: cropCenter(points),
        distance: points.length > 1 ? cropPointDistance(points[0], points[1]) : 1,
        x: cropState.x,
        y: cropState.y,
        zoom: cropState.zoom
      };
    }

    function applyCropGesture() {
      if (sourceInputMode !== "crop" || !cropGesture || !sourceImage) return;
      const canvas = document.getElementById("crop-canvas");
      const points = Array.from(cropPointers.values());
      if (!canvas || !points.length) return;

      const size = canvas.getBoundingClientRect().width || 520;
      const center = cropCenter(points);
      if (points.length > 1 && cropGesture.points.length > 1) {
        const distance = cropPointDistance(points[0], points[1]) || cropGesture.distance;
        cropState.zoom = cropGesture.zoom * (distance / cropGesture.distance);
      }

      clampCropState();
      const { maxX, maxY } = getCropMetrics(size);
      cropState.x = cropGesture.x + (center.x - cropGesture.center.x) / (maxX || size);
      cropState.y = cropGesture.y + (center.y - cropGesture.center.y) / (maxY || size);
      clampCropState();
      updateCropPreview();
    }

    function initCropCanvas() {
      const canvas = document.getElementById("crop-canvas");
      if (!canvas) return;

      canvas.addEventListener("pointerdown", (event) => {
        if (!sourceImage || sourceInputMode !== "crop") return;
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        canvas.classList.add("is-dragging");
        beginCropGesture();
      });

      canvas.addEventListener("pointermove", (event) => {
        if (!cropPointers.has(event.pointerId)) return;
        cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        applyCropGesture();
      });

      ["pointerup", "pointercancel"].forEach((type) => {
        canvas.addEventListener(type, (event) => {
          cropPointers.delete(event.pointerId);
          if (!cropPointers.size) {
            canvas.classList.remove("is-dragging");
            cropGesture = null;
          } else {
            beginCropGesture();
          }
        });
      });

      canvas.addEventListener("wheel", (event) => {
        if (!sourceImage || sourceInputMode !== "crop") return;
        event.preventDefault();
        cropState.zoom *= event.deltaY < 0 ? 1.08 : 0.92;
        clampCropState();
        updateCropPreview();
      }, { passive: false });

      canvas.addEventListener("dblclick", () => {
        if (sourceInputMode !== "crop") return;
        resetCropControls();
        updateSourcePreview();
      });
    }

    function initMobileStepSwipe() {
      const root = document.querySelector(".app-container");
      if (!root || root.dataset.swipeBackReady === "true") return;
      root.dataset.swipeBackReady = "true";

      let start = null;
      const ignored = "button,input,select,textarea,a,.crop-canvas,.upload-zone,.line-art-fullscreen-viewer";

      root.addEventListener("touchstart", (event) => {
        const target = event.target;
        if (document.body.classList.contains("line-art-fullscreen-open") || currentStep <= 1 || event.touches.length !== 1 || !target || target.closest(ignored)) {
          start = null;
          return;
        }
        const touch = event.touches[0];
        start = { x: touch.clientX, y: touch.clientY, t: Date.now() };
      }, { passive: true });

      root.addEventListener("touchend", (event) => {
        if (!start || !event.changedTouches.length) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        const elapsed = Date.now() - start.t;
        start = null;

        if (dx > 80 && Math.abs(dy) < 70 && dx > Math.abs(dy) * 1.35 && elapsed < 900) {
          event.preventDefault();
          lastSwipeNavigationAt = Date.now();
          navigateToStep(currentStep - 1);
        }
      }, { passive: false });

      root.addEventListener("touchcancel", () => {
        start = null;
      }, { passive: true });
    }

    function updateSourcePreview() {
      const canvas = document.getElementById("crop-canvas");
      if (sourceInputMode === "crop") {
        drawCropToCanvas(canvas, 520);
      } else {
        drawWholeImageToCanvas(canvas, 520);
      }
    }

    function updateCropPreview() {
      updateSourcePreview();
    }

    function getProcessingImageDataUrl() {
      const canvas = document.createElement("canvas");
      const processingSize = 1280;
      if (sourceInputMode === "crop") {
        drawCropToCanvas(canvas, processingSize);
      } else {
        drawWholeImageToCanvas(canvas, processingSize);
      }
      return canvas.toDataURL("image/jpeg", 0.86);
    }

    function updateProgressUI(scope, progress, text) {
      const clamped = Math.max(0, Math.min(100, Math.round(progress || 0)));
      const bar = scope && scope.querySelector(".progress-bar");
      const label = scope && scope.querySelector(".loading-text");
      if (bar) bar.style.width = `${clamped}%`;
      if (label) label.textContent = LOADING_MESSAGE;
    }

    function getLoadingOverlay() {
      let overlay = document.getElementById("loading-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "loading-overlay";
        overlay.className = "loading-overlay";
        overlay.style.display = "none";
        overlay.innerHTML = `<div class="progress-shell"><div class="loading-text" id="loading-text">${LOADING_MESSAGE}</div><div class="progress-track"><div class="progress-bar" style="width:0%"></div></div></div>`;
      }

      if (overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
      }

      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "2147483647";
      overlay.style.flexDirection = "column";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.gap = "20px";
      overlay.style.background = "rgba(255,255,255,.92)";
      overlay.style.backdropFilter = "blur(4px)";

      const shell = overlay.querySelector(".progress-shell");
      if (shell) {
        shell.style.width = "min(280px, calc(100% - 32px))";
        shell.style.display = "grid";
        shell.style.gap = "12px";
        shell.style.textAlign = "center";
      }

      const track = overlay.querySelector(".progress-track");
      if (track) {
        track.style.height = "8px";
        track.style.background = "#e5e7eb";
        track.style.borderRadius = "999px";
        track.style.overflow = "hidden";
      }

      const bar = overlay.querySelector(".progress-bar");
      if (bar) {
        bar.style.height = "100%";
        bar.style.background = "var(--accent, #111827)";
        bar.style.borderRadius = "inherit";
        bar.style.transition = "width .25s ease";
      }

      const label = overlay.querySelector(".loading-text");
      if (label) {
        label.style.fontSize = "15px";
        label.style.fontWeight = "600";
        label.style.color = "var(--text-primary, #111827)";
      }

      return overlay;
    }

    function advanceGlobalProgress(progress) {
      const globalOverlay = getLoadingOverlay();
      loadingProgressValue = Math.max(loadingProgressValue, progress || 0);
      updateProgressUI(globalOverlay, loadingProgressValue, LOADING_MESSAGE);

      if (loadingProgressTimer) return;
      loadingProgressTimer = setInterval(() => {
        const cap = loadingProgressValue < 70 ? 78 : 94;
        const step = loadingProgressValue < 70 ? 1.1 : 0.35;
        loadingProgressValue = Math.min(cap, loadingProgressValue + step);
        updateProgressUI(globalOverlay, loadingProgressValue, LOADING_MESSAGE);
      }, 450);
    }

    function stopGlobalProgress() {
      if (loadingProgressTimer) clearInterval(loadingProgressTimer);
      loadingProgressTimer = null;
      loadingProgressValue = 0;
    }

    function setLoading(isLoading, text = "Loading...", targetSelector, progress = 0) {
      if (!targetSelector) {
        const globalOverlay = getLoadingOverlay();
        const globalText = document.getElementById("loading-text");
        if (globalText) globalText.textContent = LOADING_MESSAGE;
        if (globalOverlay) {
          globalOverlay.classList.toggle("active", isLoading);
          globalOverlay.style.display = isLoading ? "flex" : "none";
          if (isLoading) {
            advanceGlobalProgress(progress);
          } else {
            stopGlobalProgress();
            updateProgressUI(globalOverlay, 0, LOADING_MESSAGE);
          }
        }
        return;
      }

      const target = document.querySelector(targetSelector);
      if (!target) {
        return;
      }

      if (isLoading) {
        // ensure target is positioned for absolute overlay
        const computed = window.getComputedStyle(target);
        if (computed.position === 'static') target.style.position = 'relative';

        let overlay = target.querySelector('.section-loading-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'section-loading-overlay';
          target.appendChild(overlay);
        } else {
          overlay.style.display = 'flex';
        }
        if (sourceImageDataUrl) {
          overlay.classList.add("section-loading-overlay-with-image");
          overlay.innerHTML = "";
          const shell = document.createElement("div");
          shell.className = "preview-loader-shell";
          const image = document.createElement("div");
          image.className = "preview-loader-image";
          image.style.backgroundImage = `url("${sourceImageDataUrl}")`;
          const label = document.createElement("div");
          label.className = "loading-text";
          label.textContent = LOADING_MESSAGE;
          const track = document.createElement("div");
          track.className = "progress-track";
          const bar = document.createElement("div");
          bar.className = "progress-bar";
          bar.style.width = "0%";
          track.appendChild(bar);
          shell.append(image, label, track);
          overlay.appendChild(shell);
        } else {
          overlay.classList.remove("section-loading-overlay-with-image");
          overlay.innerHTML = `<div class="progress-shell"><div class="loading-text">${LOADING_MESSAGE}</div><div class="progress-track"><div class="progress-bar" style="width:0%"></div></div></div>`;
        }
        updateProgressUI(overlay, progress, LOADING_MESSAGE);
      } else {
        const overlay = target.querySelector('.section-loading-overlay');
        if (overlay) overlay.remove();
      }
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function nextPaint() {
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    // Step Navigation
    function navigateToStep(stepNum) {
      const pane = document.getElementById(`step-pane-${stepNum}`);
      if (!pane) return;
      document.querySelectorAll('.step-content').forEach((stepPane) => {
        stepPane.classList.add('locked');
      });
      pane.classList.remove('locked');
      pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
      currentStep = stepNum;
    }

    function revealStep(stepNum) {
      navigateToStep(stepNum);
    }

    function toggleRadiusControl() {
      const aboveCurved = document.getElementById("above-curved-toggle").checked;
      const belowCurved = document.getElementById("below-curved-toggle").checked;
      const aboveControl = document.getElementById("radius-control-group");
      const belowControl = document.getElementById("below-radius-control-group");

      if (aboveCurved) {
        aboveControl?.classList.remove("hidden");
      } else {
        aboveControl?.classList.add("hidden");
      }

      if (belowCurved) {
        belowControl?.classList.remove("hidden");
      } else {
        belowControl?.classList.add("hidden");
      }
    }

    // Convert process trigger
    async function processSourceImage() {
      if (!sourceImage || isGeneratingLineArt) return;
      isGeneratingLineArt = true;

      const loadingStartedAt = Date.now();
      setGenerationLoading(true, 8);
      await nextPaint();

      try {
        const sourceForProcessing = getProcessingImageDataUrl() || await fileToDataUrl(fileInput.files[0]);
        const sessionCacheKey = await getGenerationSessionCacheKey(sourceForProcessing);
        currentGenerationCacheKey = sessionCacheKey;
        const cachedGeneration = getGenerationSessionCache(sessionCacheKey);
        if (cachedGeneration) {
          setGenerationLoading(true, 68);
          await renderGeneratedVariants(cachedGeneration.imageUrls);
          setGenerationSessionCache(sessionCacheKey, {
            imageUrls: cachedGeneration.imageUrls,
            sourceImageDataUrl: sourceForProcessing,
            sourceFileName
          });
          setGenerationLoading(true, 100);
          await sleep(Math.max(100, 250 - (Date.now() - loadingStartedAt)));
          return;
        }

        setGenerationLoading(true, 18);

        const response = await fetch(`${BACKEND_BASE_URL}/api/generate-line-art`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            imageDataUrl: sourceForProcessing
          })
        });

        setGenerationLoading(true, 58);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.detail || data.error || data.message || "Generation failed.");
        }

        const imageUrls = Array.isArray(data.imageUrls) ? data.imageUrls : getGeneratedImageUrls(data);
        if (!imageUrls.length) {
          throw new Error("No generated images were returned.");
        }

        setGenerationSessionCache(sessionCacheKey, {
          imageUrls,
          sourceImageDataUrl: sourceForProcessing,
          sourceFileName
        });

        setGenerationLoading(true, 70);
        await renderGeneratedVariants(imageUrls);
        setGenerationLoading(true, 100);
        await sleep(Math.max(100, 250 - (Date.now() - loadingStartedAt)));
      } catch (err) {
        console.warn(err);
        alert("Could not generate line art variants. Please try another image.");
      } finally {
        isGeneratingLineArt = false;
        setGenerationLoading(false);
      }
    }

    function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        if (!file) {
          reject(new Error("No source file selected."));
          return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Could not prepare the selected image."));
        reader.readAsDataURL(file);
      });
    }

    async function getGenerationSessionCacheKey(imageDataUrl) {
      const text = String(imageDataUrl || "");
      if (window.crypto?.subtle && window.TextEncoder) {
        const bytes = new TextEncoder().encode(text);
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }

      let hash = 5381;
      for (let index = 0; index < text.length; index++) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
      }
      return `fallback-${hash >>> 0}-${text.length}`;
    }

    function getGenerationSessionCache(cacheKey) {
      if (!cacheKey) return null;
      try {
        const raw = sessionStorage.getItem(`${GENERATION_SESSION_CACHE_PREFIX}${cacheKey}`);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (!cached || !Array.isArray(cached.imageUrls) || !cached.imageUrls.length) return null;
        if (Date.now() - Number(cached.savedAt || 0) > GENERATION_SESSION_CACHE_TTL_MS) {
          sessionStorage.removeItem(`${GENERATION_SESSION_CACHE_PREFIX}${cacheKey}`);
          return null;
        }
        return cached;
      } catch {
        return null;
      }
    }

    function setGenerationSessionCache(cacheKey, payload) {
      if (!cacheKey || !payload || !Array.isArray(payload.imageUrls) || !payload.imageUrls.length) return;
      try {
        const cached = {
          cacheKey,
          imageUrls: payload.imageUrls.slice(0, 4),
          sourceImageDataUrl: payload.sourceImageDataUrl || "",
          sourceFileName: payload.sourceFileName || sourceFileName || "uploaded-image",
          savedAt: Date.now()
        };
        sessionStorage.setItem(`${GENERATION_SESSION_CACHE_PREFIX}${cacheKey}`, JSON.stringify(cached));
        sessionStorage.setItem(GENERATION_LAST_SESSION_CACHE_KEY, cacheKey);
      } catch (error) {
        console.warn("Generation session cache skipped:", error);
      }
    }

    async function restoreLastGenerationSession() {
      let cacheKey = "";
      try {
        cacheKey = sessionStorage.getItem(GENERATION_LAST_SESSION_CACHE_KEY) || "";
      } catch {
        return false;
      }

      const cached = getGenerationSessionCache(cacheKey);
      if (!cached || !cached.sourceImageDataUrl) return false;

      currentGenerationCacheKey = cacheKey;
      sourceFileName = cached.sourceFileName || "uploaded-image";
      sourceImageDataUrl = cached.sourceImageDataUrl;
      sourceInputMode = "whole";
      selectedVariant = null;
      selectedVariantIndex = -1;
      generatedLineArtVariants = [];
      generatedVariantPreviews = [];
      generatedVariantSourceUrls = [];

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
          sourceImage = img;
          resetCropControls();
          setSourceInputMode("whole");
          document.getElementById("preview-filename").textContent = sourceFileName;
          document.getElementById("upload-preview-card").classList.remove("hidden");
          document.getElementById("btn-process-image").removeAttribute("disabled");
          document.getElementById("upload-status-text").textContent = "Previous styles restored.";
          try {
            setGenerationLoading(true, 72);
            await renderGeneratedVariants(cached.imageUrls);
            setGenerationLoading(true, 100);
            await sleep(120);
            resolve(true);
          } catch (error) {
            console.warn("Could not restore generated styles:", error);
            resolve(false);
          } finally {
            setGenerationLoading(false);
          }
        };
        img.onerror = () => resolve(false);
        img.src = cached.sourceImageDataUrl;
      });
    }

    function getGeneratedImageUrls(data) {
      const images = Array.isArray(data.images)
        ? data.images
        : Array.isArray(data.data && data.data.images)
          ? data.data.images
          : [];

      return images
        .map((image) => {
          if (typeof image === "string") return image;
          return image.url || image.image_url || image.data_url || "";
        })
        .filter(Boolean)
        .slice(0, 4);
    }

    async function renderGeneratedVariants(urls, variantNameOverrides, processingProfiles) {
      const container = document.getElementById("variants-container");
      container.innerHTML = "";
      generatedVariantPreviews = [];
      generatedVariantSourceUrls = urls.slice(0, 4);

      const variantNames = variantNameOverrides || [
        "Style 1 (Bold)",
        "Style 2 (Detailed)",
        "Style 3 (Clean)",
        "Style 4 (Original Match)"
      ];
      const loadedImages = await Promise.all(urls.map((url, index) =>
        loadImageUrl(url).then((img) => {
          setGenerationLoading(true, 70 + Math.round(((index + 1) / urls.length) * 12));
          return img;
        })
      ));

      for (let index = 0; index < loadedImages.length; index++) {
        setGenerationLoading(true, 82 + Math.round((index / loadedImages.length) * 12));
        const img = loadedImages[index];
        const lineArt = cleanLineArt(img, processingProfiles && processingProfiles[index]);
        generatedLineArtVariants[index] = lineArt;

        const displayCanvas = makeTransparentLineCanvas(lineArt, "black");
        const displayUrl = displayCanvas.toDataURL();
        generatedVariantPreviews[index] = {
          src: displayUrl,
          caption: variantNames[index] || `Style ${index + 1}`
        };

        const card = document.createElement("div");
        card.className = "variant-card";
        card.onclick = () => selectVariant(index);

        card.innerHTML = `
          <div class="variant-header">
            <span class="variant-title">${variantNames[index] || `Variant ${index + 1}`}</span>
          </div>
          <div class="variant-preview-container" role="button" tabindex="0" aria-label="Open ${variantNames[index] || `Variant ${index + 1}`} fullscreen">
            <img src="${displayUrl}" alt="${variantNames[index] || `Variant ${index + 1}`}">
          </div>
          <button class="variant-select-btn">Pick your style</button>
        `;

        const preview = card.querySelector(".variant-preview-container");
        const openPreview = (event) => {
          event.stopPropagation();
          openFullscreenImage(displayUrl, variantNames[index] || `Style ${index + 1}`, {
            gallery: generatedVariantPreviews,
            activeIndex: index,
            onPick: selectVariant
          });
        };
        preview.addEventListener("click", openPreview);
        preview.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPreview(event);
          }
        });

        container.appendChild(card);
      }

      revealStep(2);
    }

    function selectVariant(index) {
      selectedVariantIndex = index;
      selectedVariant = generatedLineArtVariants[index];
      saveSelectedDesign(index);

      // Update selected cards state
      document.querySelectorAll(".variant-card").forEach((card, idx) => {
        if (idx === index) {
          card.classList.add("selected");
        } else {
          card.classList.remove("selected");
        }
      });

      // Move forward automatically with small aesthetic delay
      setTimeout(() => {
        // Init typography setting
        selectInkColor("black");
        updateSvgLayout();
        revealStep(3);
      }, 350);
    }

    async function saveSelectedDesign(index) {
      if (!sourceImageDataUrl || !selectedVariant) return false;
      if (selectedDesignSavePromise && selectedDesignSaveIndex === index) return selectedDesignSavePromise;

      selectedDesignSaveIndex = index;
      const savePromise = (async () => {
        const response = await fetch(`${BACKEND_BASE_URL}/api/save-design`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            designId: savedDesignId,
            lightweight: true,
            settings: getDesignSettings(index)
          })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Design save failed.");
        }

        savedDesignId = data.designId || savedDesignId || "";
        syncCartProperties();
        selectedDesignAssetsSavePromise = saveSelectedDesignAssets(index).catch((error) => {
          console.warn("Selected design asset upload skipped:", error);
          return false;
        });
        return Boolean(savedDesignId);
      })();
      selectedDesignSavePromise = savePromise;

      try {
        return await savePromise;
      } catch (err) {
        console.warn("Design save skipped:", err);
        return false;
      } finally {
        if (selectedDesignSavePromise === savePromise) {
          selectedDesignSavePromise = null;
          selectedDesignSaveIndex = -1;
        }
      }
    }

    async function saveSelectedDesignAssets(index) {
      if (!sourceImageDataUrl || !savedDesignId || index < 0) return false;
      const lineArt = generatedLineArtVariants[index];
      if (!lineArt) return false;

      const variantCanvas = makeTransparentLineCanvas(lineArt, "black");
      const response = await fetch(`${BACKEND_BASE_URL}/api/save-design`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          designId: savedDesignId,
          originalImageDataUrl: sourceImageDataUrl,
          chosenVariantDataUrl: variantCanvas.toDataURL("image/png"),
          settings: getDesignSettings(index)
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Design asset save failed.");
      }

      if (index !== selectedVariantIndex) return false;
      savedDesignId = data.designId || savedDesignId || "";
      if (!finalDesignImageUrl) finalDesignImageUrl = data.finalDesignUrl || data.chosenVariantUrl || "";
      syncCartProperties();
      return true;
    }

    function selectInkColor(color) {
      currentInkColor = color;

      document.querySelectorAll(".color-swatches .swatch").forEach((sw) => {
        sw.classList.remove("selected");
      });

      const activeSwatch = document.querySelector(`.color-swatches .swatch-${color}`);
      if (activeSwatch) activeSwatch.classList.add("selected");

      updateSvgLayout();
    }

    // Dynamic SVG layout
    function updateSvgLayout({ skipDirty = false } = {}) {
      if (!selectedVariant) return;
      if (!skipDirty) markCartDesignChanged();

      // Generate transparent line art image in chosen ink color
      const lineCanvas = makeTransparentLineCanvas(selectedVariant, currentInkColor);
      const transparentDataUrl = lineCanvas.toDataURL("image/png");

      // Update Image element inside SVG
      const svgImage = document.getElementById("svg-image-element");
      svgImage.setAttribute("href", transparentDataUrl);

      // Fit and center the artwork only; text is saved for the designer but not rendered in preview.
      const maxFitSize = SIZE_MAP[selectedSize] || 300;
      const scale = Math.min(maxFitSize / lineCanvas.width, maxFitSize / lineCanvas.height);
      const drawW = lineCanvas.width * scale;
      const drawH = lineCanvas.height * scale;
      const drawX = 250 - drawW / 2;
      const drawY = 250 - drawH / 2;

      svgImage.setAttribute("x", drawX);
      svgImage.setAttribute("y", drawY);
      svgImage.setAttribute("width", drawW);
      svgImage.setAttribute("height", drawH);

      document.getElementById("above-text-group").innerHTML = "";
      document.getElementById("below-text-group").innerHTML = "";
      syncCartProperties();
    }

    // Step 4: Composing on backgrounds
    async function proceedToMockups() {
      if (isPreparingMockups) return;
      isPreparingMockups = true;
      setMockupsButtonLoading(true);
      await nextPaint();

      const container = document.getElementById("mockups-container");
      container.innerHTML = "";

      try {
        const svgElement = document.getElementById("artwork-svg");

        // Temporarily set svg background to none (transparent overlay)
        document.getElementById("svg-bg-rect").setAttribute("fill", "none");

        // Convert SVG to self-contained Overlay Image
        const svgOverlayImg = await svgToImage(svgElement);

        let successCount = 0;

        for (let i = 0; i < DEFAULT_BACKGROUNDS.length; i++) {
          const mockup = DEFAULT_BACKGROUNDS[i];
          try {
            const bgImg = await loadImageUrl(mockup.src);
            const resultUrl = await composeOverlayOnBackground(bgImg, svgOverlayImg, mockup);

            const card = document.createElement("div");
            card.className = "mockup-card";

            card.innerHTML = `
              <div class="mockup-title">${mockup.title}</div>
              <div class="mockup-image-container" role="button" tabindex="0" aria-label="Open ${mockup.title} fullscreen">
                <img src="${resultUrl}" alt="${mockup.title}">
              </div>
            `;

            const mockupPreview = card.querySelector(".mockup-image-container");
            const openMockup = () => openFullscreenImage(resultUrl, mockup.title);
            mockupPreview.addEventListener("click", openMockup);
            mockupPreview.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openMockup();
              }
            });

            container.appendChild(card);
            successCount++;
          } catch (e) {
            console.warn(`Failed composing background: ${mockup.title}`, e);
          }
        }

        if (successCount === 0) {
          throw new Error("Could not fetch or composite mockup backgrounds. Check network connection.");
        }

        saveFinalDesignForCart({ silent: true }).catch((error) => {
          console.warn("Background final design save skipped:", error);
        });

    
        revealStep(4);
      } catch (err) {
        alert("Mockup composite failed: " + err.message);
      } finally {
        isPreparingMockups = false;
        setMockupsButtonLoading(false);
      }
    }

    // Helper SVG to Image Converter
    function svgToImage(svgElement) {
      return new Promise((resolve, reject) => {
        // Convert SVG element to string
        const svgString = new XMLSerializer().serializeToString(svgElement);
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(new Error("Could not parse SVG as Image overlay: " + e.message));
        };
        img.src = url;
      });
    }

    async function composeOverlayOnBackground(background, overlay, placement) {
      const canvas = document.getElementById("hidden-canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const maxSide = 2200;
      const bgScale = Math.min(1, maxSide / Math.max(background.width, background.height));
      const bgWidth = Math.max(1, Math.round(background.width * bgScale));
      const bgHeight = Math.max(1, Math.round(background.height * bgScale));

      canvas.width = bgWidth;
      canvas.height = bgHeight;
      ctx.drawImage(background, 0, 0, bgWidth, bgHeight);

      const box = {
        x: bgWidth * placement.box.x,
        y: bgHeight * placement.box.y,
        width: bgWidth * placement.box.width,
        height: bgHeight * placement.box.height
      };

      const padding = Math.min(box.width, box.height) * 0.05;
      const fitScale = placement.fitScale;

      const targetWidth = (box.width - padding * 2) * fitScale;
      const targetHeight = (box.height - padding * 2) * fitScale;

      const scale = Math.min(targetWidth / overlay.width, targetHeight / overlay.height);
      const drawWidth = overlay.width * scale;
      const drawHeight = overlay.height * scale;

      const drawX = box.x + (box.width - drawWidth) / 2;
      const yOffset = box.height * placement.yOffset;
      const drawY = box.y + (box.height - drawHeight) / 2 + yOffset;

      const centerX = drawX + drawWidth / 2;
      const centerY = drawY + drawHeight / 2;

      ctx.save();
      ctx.globalCompositeOperation = placement.blendMode || "source-over";
      ctx.globalAlpha = placement.opacity || 0.98;
      ctx.shadowColor = "rgba(255, 255, 255, 0.45)";
      ctx.shadowBlur = Math.max(2, Math.round(Math.min(bgWidth, bgHeight) * 0.004));
      ctx.translate(centerX, centerY);
      ctx.rotate(placement.rotation);
      ctx.drawImage(overlay, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();

      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Could not render canvas to Blob."));
            return;
          }
          resolve(URL.createObjectURL(blob));
        }, "image/png");
      });
    }

    

    function restartWorkflow() {
      sourceImage = null;
      sourceImageDataUrl = "";
      selectedVariant = null;
      selectedVariantIndex = -1;
      selectedDesignSavePromise = null;
      selectedDesignSaveIndex = -1;
      selectedDesignAssetsSavePromise = null;
      currentGenerationCacheKey = "";
      clearCartDesignAutoSave();
      cartDesignRevision++;
      lastSavedCartDesignRevision = -1;
      savedDesignId = "";
      finalDesignImageUrl = "";
      generatedLineArtVariants = [];
      generatedVariantPreviews = [];
      generatedVariantSourceUrls = [];
      document.getElementById("btn-process-image").setAttribute("disabled", "true");
      document.getElementById("upload-preview-card").classList.add("hidden");
      document.getElementById("upload-status-text").textContent = "Drag & drop photo here";
      document.getElementById("above-text-input").value = "";
      document.getElementById("below-text-input").value = "";
      const notesInput = document.getElementById("designer-notes-input");
      if (notesInput) notesInput.value = "";
      document.getElementById("file-input").value = "";
      setSourceInputMode("whole");
      resetCropControls();
      syncCartProperties();
      // Scroll to top (upload step)
      navigateToStep(1);
    }

    // Image loading helper
    function loadImageUrl(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image from URL: ${url}`));
        img.src = url;
      });
    }

    /* Core Grayscale Image Processing Utilities */
    function grayAt(data, index) {
      return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    }

    function prepareImage(image) {
      const canvas = document.getElementById("hidden-canvas");
      const ctx = canvas.getContext("2d");

      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      return { width, height, imageData: ctx.getImageData(0, 0, width, height) };
    }

    function otsuThreshold(gray) {
      const hist = new Uint32Array(256);
      for (let i = 0; i < gray.length; i++) {
        hist[Math.max(0, Math.min(255, Math.round(gray[i])))]++;
      }

      let total = gray.length;
      let sum = 0;
      for (let i = 0; i < 256; i++) {
        sum += i * hist[i];
      }

      let sumB = 0;
      let weightB = 0;
      let bestVariance = -1;
      let threshold = 180;

      for (let i = 0; i < 256; i++) {
        weightB += hist[i];
        if (weightB === 0) continue;
        const weightF = total - weightB;
        if (weightF === 0) break;

        sumB += i * hist[i];
        const meanB = sumB / weightB;
        const meanF = (sum - sumB) / weightF;
        const variance = weightB * weightF * (meanB - meanF) * (meanB - meanF);

        if (variance > bestVariance) {
          bestVariance = variance;
          threshold = i;
        }
      }

      return Math.max(110, Math.min(220, threshold + 25));
    }

    function buildIntegral(gray, width, height) {
      const integral = new Float64Array((width + 1) * (height + 1));
      for (let y = 1; y <= height; y++) {
        let rowSum = 0;
        for (let x = 1; x <= width; x++) {
          rowSum += gray[(y - 1) * width + (x - 1)];
          integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum;
        }
      }
      return integral;
    }

    function neighborhoodMean(integral, width, height, x, y, radius) {
      const x1 = Math.max(0, x - radius);
      const y1 = Math.max(0, y - radius);
      const x2 = Math.min(width - 1, x + radius);
      const y2 = Math.min(height - 1, y + radius);
      const stride = width + 1;
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);

      const sum =
        integral[(y2 + 1) * stride + (x2 + 1)] -
        integral[y1 * stride + (x2 + 1)] -
        integral[(y2 + 1) * stride + x1] +
        integral[y1 * stride + x1];

      return sum / area;
    }

    // Cleans generated line art into a transparent, recolorable form.
    function cleanLineArt(image, profile = {}) {
      const { width, height, imageData } = prepareImage(image);
      const canvas = document.getElementById("hidden-canvas");
      const ctx = canvas.getContext("2d");
      const src = imageData.data;
      const output = ctx.createImageData(width, height);
      const dst = output.data;
      const gray = new Float32Array(width * height);
      const ink = new Uint8Array(width * height);
      const cleaned = new Uint8Array(width * height);
      const useInvertedLogoExtraction = shouldUseInvertedLogoExtraction(src);
      const useLogoExtraction = shouldUseLogoExtraction(src);

      for (let i = 0, p = 0; i < src.length; i += 4, p++) {
        gray[p] = grayAt(src, i);
      }

      if (useInvertedLogoExtraction) {
        const borderLight = getBorderConnectedLightPixels(src, width, height, profile);
        const boundaryRadius = Math.max(2, Math.round(Math.min(width, height) / 180));

        for (let i = 0, p = 0; i < src.length; i += 4, p++) {
          if (!borderLight[p] && isLightLogoInk(src, i, profile)) {
            ink[p] = 1;
          }
        }

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const p = y * width + x;
            if (ink[p]) continue;

            if (isDarkLogoInk(src, p * 4, profile) && hasMappedNeighbor(borderLight, width, height, x, y, boundaryRadius)) {
              ink[p] = 1;
            }
          }
        }
      } else if (useLogoExtraction) {
        for (let i = 0, p = 0; i < src.length; i += 4, p++) {
          if (isDarkLogoInk(src, i, profile)) {
            ink[p] = 1;
          }
        }
      } else {
        const globalThreshold = otsuThreshold(gray);
        const integral = buildIntegral(gray, width, height);
        const radius = Math.max(14, Math.round(Math.min(width, height) / 42));

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const p = y * width + x;
            const mean = neighborhoodMean(integral, width, height, x, y, radius);
            const adaptiveThreshold = Math.min(235, mean - 13);

            if (gray[p] < globalThreshold || (gray[p] < adaptiveThreshold && gray[p] < 232)) {
              ink[p] = 1;
            }
          }
        }
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = y * width + x;
          if (!ink[p]) continue;

          let neighbors = 0;
          for (let yy = -1; yy <= 1; yy++) {
            for (let xx = -1; xx <= 1; xx++) {
              if (xx === 0 && yy === 0) continue;
              const nx = x + xx;
              const ny = y + yy;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              if (ink[ny * width + nx]) neighbors++;
            }
          }

          if (neighbors > 0 || gray[p] < 120) {
            cleaned[p] = 1;
          }
        }
      }

      const finalInk = applyLineWeight(cleaned, width, height, profile.expandIterations || 0);

      for (let i = 0, p = 0; i < dst.length; i += 4, p++) {
        const color = finalInk[p] ? 0 : 255;
        dst[i] = color;
        dst[i + 1] = color;
        dst[i + 2] = color;
        dst[i + 3] = 255;
      }

      ctx.putImageData(output, 0, 0);
      return {
        width,
        height,
        imageData: output
      };
    }

    function getInkBounds(imageData, width, height) {
      const data = imageData.data;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (data[i] < 20 && data[i + 1] < 20 && data[i + 2] < 20) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        return { x: 0, y: 0, width, height };
      }

      const pad = Math.round(Math.max(width, height) * 0.025);
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(width - 1, maxX + pad);
      maxY = Math.min(height - 1, maxY + pad);

      return {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      };
    }

    // Constructs the transparent colored PNG canvas
    function makeTransparentLineCanvas(lineArt, inkColor) {
      const bounds = getInkBounds(lineArt.imageData, lineArt.width, lineArt.height);
      const crop = document.createElement("canvas");
      const cropCtx = crop.getContext("2d", { willReadFrequently: true });
      const transparent = cropCtx.createImageData(bounds.width, bounds.height);
      const src = lineArt.imageData.data;
      const dst = transparent.data;
      const color = INK_COLORS[inkColor] || INK_COLORS.black;

      crop.width = bounds.width;
      crop.height = bounds.height;

      for (let y = 0; y < bounds.height; y++) {
        for (let x = 0; x < bounds.width; x++) {
          const srcX = bounds.x + x;
          const srcY = bounds.y + y;
          const srcI = (srcY * lineArt.width + srcX) * 4;
          const dstI = (y * bounds.width + x) * 4;
          const isInk = src[srcI] < 20 && src[srcI + 1] < 20 && src[srcI + 2] < 20;

          if (isInk) {
            dst[dstI] = color[0];
            dst[dstI + 1] = color[1];
            dst[dstI + 2] = color[2];
            dst[dstI + 3] = 255;
          } else {
            dst[dstI + 3] = 0;
          }
        }
      }

      cropCtx.putImageData(transparent, 0, 0);
      return crop;
    }

    function getLogoRasterStats(data) {
      let saturatedPixels = 0;
      let lowChromaPixels = 0;
      let darkPixels = 0;
      let lightPixels = 0;
      let midPixels = 0;
      let visiblePixels = 0;

      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 20) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const luma = grayAt(data, i);
        const chroma = max - min;

        visiblePixels++;
        if (chroma <= 45) lowChromaPixels++;
        if (luma < 130 && chroma <= 70) darkPixels++;
        if (luma > 205 && chroma <= 45) lightPixels++;
        if (luma >= 130 && luma <= 205 && chroma <= 70) midPixels++;
        if (chroma > 70 && max > 120) {
          saturatedPixels++;
        }
      }

      if (!visiblePixels) {
        return {
          saturatedRatio: 0,
          lowChromaRatio: 0,
          darkRatio: 0,
          lightRatio: 0,
          midRatio: 0
        };
      }

      return {
        saturatedRatio: saturatedPixels / visiblePixels,
        lowChromaRatio: lowChromaPixels / visiblePixels,
        darkRatio: darkPixels / visiblePixels,
        lightRatio: lightPixels / visiblePixels,
        midRatio: midPixels / visiblePixels
      };
    }

    function shouldUseInvertedLogoExtraction(data) {
      const stats = getLogoRasterStats(data);

      return stats.lowChromaRatio > 0.86 &&
        stats.darkRatio > 0.36 &&
        stats.lightRatio > 0.18 &&
        stats.midRatio < 0.32;
    }

    function shouldUseLogoExtraction(data) {
      const stats = getLogoRasterStats(data);
      const isColorLogo = stats.saturatedRatio > 0.08;
      const isMonochromeLogo = stats.lowChromaRatio > 0.88 &&
        stats.lightRatio > 0.28 &&
        stats.darkRatio > 0.015 &&
        stats.darkRatio < 0.62 &&
        stats.midRatio < 0.42;

      return isColorLogo || isMonochromeLogo;
    }

    function isLightLogoInk(data, index, profile = {}) {
      const alpha = data[index + 3];
      if (alpha < 35) return false;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = grayAt(data, index);

      return luma > (profile.lightMin || 155) && max - min < 70;
    }

    function getBorderConnectedLightPixels(data, width, height, profile = {}) {
      const total = width * height;
      const visited = new Uint8Array(total);
      const queue = new Int32Array(total);
      let head = 0;
      let tail = 0;

      function enqueue(x, y) {
        if (x < 0 || x >= width || y < 0 || y >= height) return;
        const p = y * width + x;
        if (visited[p]) return;
        if (!isLightLogoInk(data, p * 4, profile)) return;
        visited[p] = 1;
        queue[tail++] = p;
      }

      for (let x = 0; x < width; x++) {
        enqueue(x, 0);
        enqueue(x, height - 1);
      }

      for (let y = 1; y < height - 1; y++) {
        enqueue(0, y);
        enqueue(width - 1, y);
      }

      while (head < tail) {
        const p = queue[head++];
        const x = p % width;
        const y = Math.floor(p / width);

        enqueue(x + 1, y);
        enqueue(x - 1, y);
        enqueue(x, y + 1);
        enqueue(x, y - 1);
      }

      return visited;
    }

    function hasMappedNeighbor(map, width, height, x, y, radius) {
      const x1 = Math.max(0, x - radius);
      const y1 = Math.max(0, y - radius);
      const x2 = Math.min(width - 1, x + radius);
      const y2 = Math.min(height - 1, y + radius);

      for (let yy = y1; yy <= y2; yy++) {
        for (let xx = x1; xx <= x2; xx++) {
          if (map[yy * width + xx]) return true;
        }
      }

      return false;
    }

    function applyLineWeight(source, width, height, expandIterations) {
      let current = source;
      const iterations = Math.max(0, Math.min(3, Number(expandIterations) || 0));

      for (let iteration = 0; iteration < iterations; iteration++) {
        const next = new Uint8Array(width * height);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const p = y * width + x;
            if (current[p] || hasMappedNeighbor(current, width, height, x, y, 1)) {
              next[p] = 1;
            }
          }
        }

        current = next;
      }

      return current;
    }

    function isDarkLogoInk(data, index, profile = {}) {
      const alpha = data[index + 3];
      if (alpha < 35) return false;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = grayAt(data, index);

      return max < (profile.darkMax || 110) || (luma < 180 && max - min < 60);
    }

    Object.assign(window, {
      triggerFileSelect,
      processSourceImage,
      navigateToStep,
      updateCropPreview,
      setSourceInputMode,
      setSize,
      syncCartProperties,
      updateSvgLayout,
      toggleRadiusControl,
      proceedToMockups,
      restartWorkflow
    });

    // Initialize UI state
    attachShopifyCartBridge();
    setTimeout(attachShopifyCartBridge, 800);
    setTimeout(attachShopifyCartBridge, 2000);
    try { setSize(selectedSize); } catch (e) { /* ignore if DOM not ready */ }
    restoreLastGenerationSession().catch((error) => {
      console.warn("Previous generation restore skipped:", error);
    });
  
})();
