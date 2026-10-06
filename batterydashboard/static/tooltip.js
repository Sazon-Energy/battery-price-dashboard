// Hover/focus tooltips. A trigger either carries plain text in a
// `data-tooltip` attribute, or wraps a hidden `.tooltip-content` element whose
// markup is shown. The tooltip is a single fixed-position element appended to
// <body>, so it is never clipped by scrolling table containers.
(function () {
  "use strict";

  var TRIGGER_SELECTOR = "[data-tooltip], .tooltip-trigger";
  var VIEWPORT_MARGIN = 8;
  var TRIGGER_GAP = 6;

  var tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.id = "tooltip";
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  var activeTrigger = null;

  function fillTooltip(trigger) {
    var richContent = trigger.querySelector(".tooltip-content");
    if (richContent) {
      tooltip.innerHTML = richContent.innerHTML;
    } else {
      tooltip.textContent = trigger.getAttribute("data-tooltip");
    }
  }

  function positionTooltip(trigger) {
    var triggerBounds = trigger.getBoundingClientRect();
    var tooltipBounds = tooltip.getBoundingClientRect();

    // Prefer below the trigger; flip above when there is no room.
    var top = triggerBounds.bottom + TRIGGER_GAP;
    if (top + tooltipBounds.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = triggerBounds.top - TRIGGER_GAP - tooltipBounds.height;
    }
    top = Math.max(VIEWPORT_MARGIN, top);

    var left = triggerBounds.left + triggerBounds.width / 2 - tooltipBounds.width / 2;
    var maximumLeft = window.innerWidth - VIEWPORT_MARGIN - tooltipBounds.width;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, maximumLeft));

    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
  }

  function showTooltip(trigger) {
    activeTrigger = trigger;
    fillTooltip(trigger);
    tooltip.hidden = false;
    positionTooltip(trigger);
    trigger.setAttribute("aria-describedby", tooltip.id);
  }

  function hideTooltip() {
    if (activeTrigger) {
      activeTrigger.removeAttribute("aria-describedby");
    }
    activeTrigger = null;
    tooltip.hidden = true;
  }

  function findTrigger(event) {
    return event.target.closest ? event.target.closest(TRIGGER_SELECTOR) : null;
  }

  document.addEventListener("mouseover", function (event) {
    var trigger = findTrigger(event);
    if (trigger && trigger !== activeTrigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener("mouseout", function (event) {
    var trigger = findTrigger(event);
    if (trigger && trigger === activeTrigger && !trigger.contains(event.relatedTarget)) {
      hideTooltip();
    }
  });

  document.addEventListener("focusin", function (event) {
    var trigger = findTrigger(event);
    if (trigger) {
      showTooltip(trigger);
    }
  });

  document.addEventListener("focusout", hideTooltip);
  document.addEventListener("click", hideTooltip);
  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      hideTooltip();
    }
  });
})();
