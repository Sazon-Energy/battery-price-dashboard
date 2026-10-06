// Highlights the row or card of the battery link most recently clicked, so
// after closing the product page it is easy to see where you left off.
// Links opt in with `data-highlight-key`; one highlight per page, not kept
// across page loads.
(function () {
  "use strict";

  var HIGHLIGHT_CLASS = "last-clicked";

  function handleLinkActivation(event) {
    var link = event.target.closest ? event.target.closest("a[data-highlight-key]") : null;
    if (!link) {
      return;
    }
    var previous = document.querySelectorAll("." + HIGHLIGHT_CLASS);
    for (var previousNumber = 0; previousNumber < previous.length; previousNumber++) {
      previous[previousNumber].classList.remove(HIGHLIGHT_CLASS);
    }
    var container = link.closest("tr, .card");
    if (container) {
      container.classList.add(HIGHLIGHT_CLASS);
    }
  }

  // "auxclick" covers middle-click, which also opens the link in a new tab.
  document.addEventListener("click", handleLinkActivation);
  document.addEventListener("auxclick", handleLinkActivation);
})();
