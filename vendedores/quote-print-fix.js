(function () {
  "use strict";

  if (window.__grupoSurQuotePrintFixInstalled) return;
  window.__grupoSurQuotePrintFixInstalled = true;

  var supabaseClient = window.grupoSurSupabaseClient;
  var nativePrint = window.print.bind(window);
  var printInFlight = null;

  function printContainer() {
    var container = document.getElementById("minutePrint");
    return container && container.querySelector(".commercial-quote-sheet") ? container : null;
  }

  function quoteCode(container) {
    var node = container && container.querySelector(".minute-identifiers strong");
    return node ? node.textContent.trim() : "";
  }

  function installmentsCell(container) {
    return Array.from(container.querySelectorAll(".minute-data-grid > div")).find(function (cell) {
      var label = cell.querySelector("span");
      return label && label.textContent.trim().toLowerCase() === "cantidad de cuotas";
    }) || null;
  }

  function missingInstallments(container) {
    var cell = installmentsCell(container);
    var value = cell && cell.querySelector("strong");
    return Boolean(value && (!value.textContent.trim() || value.textContent.trim() === "—"));
  }

  async function hydrateInstallments(container) {
    if (!supabaseClient || !missingInstallments(container)) return;
    var code = quoteCode(container);
    if (!code) return;

    var result = await supabaseClient
      .from("sales_quotes")
      .select("term_months")
      .eq("quote_code", code)
      .maybeSingle();

    if (result.error || !result.data || !result.data.term_months) return;
    var cell = installmentsCell(container);
    var value = cell && cell.querySelector("strong");
    if (value) value.textContent = String(result.data.term_months);
  }

  function imageReady(image) {
    return image.complete && image.naturalWidth > 0;
  }

  function waitForImage(image) {
    if (imageReady(image)) return Promise.resolve();
    return new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        image.removeEventListener("load", finish);
        image.removeEventListener("error", finish);
        resolve();
      }
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
      window.setTimeout(finish, 4000);
    });
  }

  function waitForImages(container) {
    return Promise.all(Array.from(container.querySelectorAll("img")).map(waitForImage));
  }

  function nextPaint() {
    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  function preparePrintState(container) {
    container.setAttribute("aria-hidden", "false");
    document.body.classList.add("printing-minute");
    void container.offsetHeight;
  }

  function cleanupPrintState(container) {
    document.body.classList.remove("printing-minute");
    container.setAttribute("aria-hidden", "true");
  }

  window.print = function () {
    var container = printContainer();
    if (!container) return nativePrint();
    if (printInFlight) return;

    var images = Array.from(container.querySelectorAll("img"));
    var needsAsyncWork = missingInstallments(container) || images.some(function (image) { return !imageReady(image); });

    if (!needsAsyncWork) {
      preparePrintState(container);
      try {
        return nativePrint();
      } finally {
        cleanupPrintState(container);
      }
    }

    printInFlight = Promise.resolve()
      .then(function () { return hydrateInstallments(container); })
      .then(function () { return waitForImages(container); })
      .then(nextPaint)
      .then(function () {
        preparePrintState(container);
        nativePrint();
      })
      .finally(function () {
        cleanupPrintState(container);
        printInFlight = null;
      });
  };
}());
