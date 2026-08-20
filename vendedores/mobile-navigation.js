(function () {
  "use strict";

  var menu = document.getElementById("mobileCrmMenu");
  var label = document.getElementById("mobileCrmMenuLabel");
  var desktopProposal = document.getElementById("proposeLeadButton");
  var mobileProposal = document.getElementById("mobileProposeLeadButton");
  if (!menu || !label) return;

  var labels = {
    agenda: "Mi agenda",
    pipeline: "Embudo comercial",
    ranking: "Ranking",
    quotes: "Presupuestos",
    sales: "Mis ventas",
    recalls: "Rellamados",
    home: "Nueva gestión",
    history: "Actividad reciente"
  };

  menu.addEventListener("click", function (event) {
    var item = event.target.closest("button");
    if (!item) return;
    if (item === mobileProposal) {
      menu.open = false;
      if (desktopProposal) desktopProposal.click();
      return;
    }
    var view = item.dataset.crmView || item.dataset.action;
    if (labels[view]) label.textContent = labels[view];
    menu.open = false;
  });

  document.addEventListener("click", function (event) {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") menu.open = false;
  });
}());
