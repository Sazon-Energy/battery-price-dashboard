// "Suggest class" on the battery classes page. Each click fetches the
// suggestion panel for that one battery from /classes/suggestion and inserts
// it as a row beneath the battery. Only one panel is open at a time.
(function () {
  "use strict";

  var COLUMN_COUNT = 4;
  var openPanelRow = null;
  var openToggleButton = null;

  function buildMessageRow(message) {
    var row = document.createElement("tr");
    row.className = "suggestion-row";
    var cell = document.createElement("td");
    cell.colSpan = COLUMN_COUNT;
    var panel = document.createElement("div");
    panel.className = "suggestion-panel";
    var text = document.createElement("p");
    text.className = "suggestion-empty";
    text.textContent = message;
    panel.appendChild(text);
    cell.appendChild(panel);
    row.appendChild(cell);
    return row;
  }

  function buildRowFromHtml(html) {
    var holder = document.createElement("tbody");
    holder.innerHTML = html.trim();
    return holder.querySelector("tr.suggestion-row");
  }

  function closeOpenPanel() {
    if (openPanelRow) {
      openPanelRow.remove();
    }
    if (openToggleButton) {
      openToggleButton.textContent = "Suggest class";
      openToggleButton.setAttribute("aria-expanded", "false");
      openToggleButton.disabled = false;
    }
    openPanelRow = null;
    openToggleButton = null;
  }

  function replaceOpenPanel(newRow) {
    openPanelRow.replaceWith(newRow);
    openPanelRow = newRow;
  }

  function openPanel(toggleButton) {
    var batteryRow = toggleButton.closest("tr");
    openToggleButton = toggleButton;
    openPanelRow = buildMessageRow("Finding a suggestion…");
    batteryRow.after(openPanelRow);
    toggleButton.textContent = "Hide";
    toggleButton.setAttribute("aria-expanded", "true");
    toggleButton.disabled = true;

    var requestedPanelRow = openPanelRow;
    fetch(toggleButton.dataset.suggestionUrl, { credentials: "same-origin" })
      .then(function (response) {
        // An expired session redirects to the login page.
        if (response.redirected && response.url.indexOf("/login") !== -1) {
          throw new Error("Your session has expired. Reload the page and log in again.");
        }
        return response.text().then(function (body) {
          if (!response.ok) {
            throw new Error(body || "Could not load a suggestion.");
          }
          return body;
        });
      })
      .then(function (html) {
        // Ignore the response if this panel was closed while it loaded.
        if (openPanelRow !== requestedPanelRow) {
          return;
        }
        replaceOpenPanel(buildRowFromHtml(html) || buildMessageRow("Could not load a suggestion."));
      })
      .catch(function (error) {
        if (openPanelRow === requestedPanelRow) {
          replaceOpenPanel(buildMessageRow(error.message));
        }
      })
      .then(function () {
        toggleButton.disabled = false;
      });
  }

  // The class chooser: one view per option (the new-class inputs, or an
  // existing class's values). Leaving "New class" discards its edits by
  // restoring the suggested values the panel was rendered with.
  function showClassChoice(select) {
    var form = select.form;
    var views = form.querySelectorAll(".class-choice-view");
    for (var viewNumber = 0; viewNumber < views.length; viewNumber++) {
      var view = views[viewNumber];
      var isSelected = view.dataset.choice === select.value;
      if (!isSelected && view.dataset.choice === "new") {
        var inputs = view.querySelectorAll("input");
        for (var inputNumber = 0; inputNumber < inputs.length; inputNumber++) {
          inputs[inputNumber].value = inputs[inputNumber].defaultValue;
        }
      }
      view.hidden = !isSelected;
    }
  }

  document.addEventListener("change", function (event) {
    if (event.target.matches && event.target.matches(".class-choice-form select[name=class_choice]")) {
      showClassChoice(event.target);
    }
  });

  // Apply / Add and Apply: submitted in the background so validation errors
  // come back inside the panel (with the entered values kept). On success the
  // server sets a flash message and names the page to reload.
  function reloadAt(url) {
    var target = new URL(url, window.location.href);
    if (target.pathname === window.location.pathname && target.search === window.location.search) {
      // Only the #anchor differs, which would not reload on its own.
      window.history.replaceState(null, "", target.href);
      window.location.reload();
    } else {
      window.location.assign(target.href);
    }
  }

  function submitClassChoiceForm(form, submitButton) {
    submitButton.disabled = true;
    var submittedPanelRow = form.closest("tr.suggestion-row");

    fetch(form.action, { method: "POST", body: new FormData(form), credentials: "same-origin" })
      .then(function (response) {
        if (response.redirected && response.url.indexOf("/login") !== -1) {
          throw new Error("Your session has expired. Reload the page and log in again.");
        }
        var contentType = response.headers.get("Content-Type") || "";
        if (response.ok && contentType.indexOf("application/json") !== -1) {
          return response.json().then(function (result) {
            reloadAt(result.redirect_url);
          });
        }
        return response.text().then(function (body) {
          var panelRow = buildRowFromHtml(body);
          if (!panelRow) {
            throw new Error(body || "Could not add the class.");
          }
          if (openPanelRow === submittedPanelRow) {
            replaceOpenPanel(panelRow);
          }
        });
      })
      .catch(function (error) {
        submitButton.disabled = false;
        var message = form.querySelector(".add-class-errors");
        if (!message) {
          message = document.createElement("ul");
          message.className = "add-class-errors";
          message.setAttribute("role", "alert");
          form.querySelector(".class-choice").after(message);
        }
        message.innerHTML = "";
        var item = document.createElement("li");
        item.textContent = error.message;
        message.appendChild(item);
      });
  }

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (form.classList && form.classList.contains("class-choice-form")) {
      event.preventDefault();
      var submitButton = event.submitter || form.querySelector(".class-choice-view:not([hidden]) button[type=submit]");
      submitClassChoiceForm(form, submitButton);
    }
  });

  var toggleButtons = document.querySelectorAll(".suggestion-toggle");
  for (var buttonNumber = 0; buttonNumber < toggleButtons.length; buttonNumber++) {
    toggleButtons[buttonNumber].addEventListener("click", function () {
      var wasOpen = openToggleButton === this;
      closeOpenPanel();
      if (!wasOpen) {
        openPanel(this);
      }
    });
  }
})();
