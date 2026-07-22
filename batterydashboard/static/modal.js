// Price-history modal for the dashboard. Fetches /api/price-history and renders
// a table. This is the only JavaScript in the app.
(function () {
  "use strict";

  var modal = document.getElementById("price-history-modal");
  if (!modal) {
    return;
  }

  var title = document.getElementById("modal-title");
  var body = document.getElementById("modal-body");

  function openModal() {
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
    body.innerHTML = "";
  }

  function escapeHtml(value) {
    var holder = document.createElement("div");
    holder.textContent = value === null || value === undefined ? "" : String(value);
    return holder.innerHTML;
  }

  function loadHistory(batteryId, batteryName) {
    title.textContent = "Price History: " + batteryName;
    body.innerHTML = '<div class="modal-loading">Loading price history…</div>';
    openModal();

    fetch("/api/price-history?batteryId=" + encodeURIComponent(batteryId))
      .then(function (response) {
        return response.json().then(function (result) {
          if (!response.ok) {
            throw new Error(result.error || "Failed to fetch price history");
          }
          return result;
        });
      })
      .then(function (result) {
        var history = result.history || [];
        if (history.length === 0) {
          body.innerHTML =
            '<div class="modal-empty">No price history available for this battery yet.</div>';
          return;
        }

        var rows = "";
        for (var i = 0; i < history.length; i++) {
          var entry = history[i];
          var when = new Date(entry.scraped_at);
          rows +=
            "<tr><td>" +
            escapeHtml(when.toLocaleString()) +
            '</td><td class="num">$' +
            escapeHtml(entry.price) +
            "</td></tr>";
        }

        body.innerHTML =
          '<p class="modal-note">Showing last ' +
          history.length +
          " price updates</p>" +
          '<div class="table-scroll"><table><thead><tr><th>Date</th><th class="num">Price</th></tr></thead><tbody>' +
          rows +
          "</tbody></table></div>";
      })
      .catch(function (error) {
        body.innerHTML = '<div class="modal-empty">' + escapeHtml(error.message) + "</div>";
      });
  }

  var historyButtons = document.querySelectorAll(".btn-history");
  for (var i = 0; i < historyButtons.length; i++) {
    historyButtons[i].addEventListener("click", function () {
      loadHistory(this.dataset.batteryId, this.dataset.batteryName);
    });
  }

  var closeButtons = document.querySelectorAll("[data-close-modal]");
  for (var j = 0; j < closeButtons.length; j++) {
    closeButtons[j].addEventListener("click", closeModal);
  }

  modal.addEventListener("click", function (event) {
    if (event.target === modal) {
      closeModal();
    }
  });
})();
