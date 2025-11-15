(function () {
  const KEY_OBJETIVOS = "mis_cuentas_fase1_objetivos";
  const KEY_UID = "mis_cuentas_uid";

  function getOrCreateUid() {
    let id = localStorage.getItem(KEY_UID);
    if (!id) {
      id = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY_UID, id);
    }
    return id;
  }
  const uid = getOrCreateUid();

  // ---- Helpers numéricos locales (mismo formato que en cuentas) ----
  function esToNumberLocal(s) {
    if (s == null) return 0;
    if (typeof s === "number") return s;
    s = String(s)
      .replace(/\s/g, "")
      .replace("€", "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function numberToEsLocal(n) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(n || 0);
  }
    function pctToEsLocal(n) {
    return new Intl.NumberFormat("es-ES", {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(n || 0);
  }


  function formatTimeLeft(fechaStr) {
    if (!fechaStr) return "";
    const target = new Date(fechaStr + "T00:00:00");
    if (isNaN(target)) return "";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = target - today;
    const days = Math.round(diffMs / 86400000);

    if (days > 0) return `Quedan ${days} día${days !== 1 ? "s" : ""}`;
    if (days === 0) return "Hoy es la fecha objetivo";
    const past = Math.abs(days);
    return `Se pasó hace ${past} día${past !== 1 ? "s" : ""}`;
  }

  // ---- Estado ----
  let objetivos = [];
  let editingId = null;

  // ---- DOM ----
  const $tabButtons = document.querySelectorAll(".tabs .tab");
  const $panelCuentas = document.getElementById("tab-cuentas");
  const $panelObjetivos = document.getElementById("tab-objetivos");
    const $sumObjetivo = document.getElementById("obj-total-objetivo");
  const $sumProgreso = document.getElementById("obj-total-progreso");


  const $list = document.getElementById("objetivos-list");
  const $btnNuevo = document.getElementById("btn-nuevo-objetivo");

  const $modal = document.getElementById("modal-objetivo");
  const $modalBackdrop = document.getElementById("modal-objetivo-backdrop");
  const $btnCerrar = document.getElementById("btn-cerrar-modal-objetivo");
  const $tituloModal = document.getElementById("modal-objetivo-title");
  const $nombre = document.getElementById("obj-nombre");
  const $cantidad = document.getElementById("obj-cantidad");
  const $ahorrado = document.getElementById("obj-ahorrado");
  const $fecha = document.getElementById("obj-fecha");
  const $color = document.getElementById("obj-color");
  const $btnGuardar = document.getElementById("btn-guardar-objetivo");

  if (!$panelCuentas || !$panelObjetivos || !$list || !$btnNuevo || !$modal) {
    // Si no existe algo, no inicializamos (por si se carga en otra página).
    return;
  }

  // ---- Tabs: Cuentas / Objetivos ----
  $tabButtons.forEach((btn) => {
    const tab = btn.dataset.tab || "cuentas";
    btn.addEventListener("click", () => {
      $tabButtons.forEach((b) => b.classList.toggle("active", b === btn));

      if (tab === "cuentas") {
        $panelCuentas.hidden = false;
        $panelObjetivos.hidden = true;
      } else {
        $panelCuentas.hidden = true;
        $panelObjetivos.hidden = false;
      }
    });
  });

  // ---- LocalStorage / Firebase ----
  function loadLocal() {
    try {
      const raw = localStorage.getItem(KEY_OBJETIVOS);
      objetivos = raw ? JSON.parse(raw) || [] : [];
    } catch (e) {
      objetivos = [];
    }
  }

  function saveLocal() {
    localStorage.setItem(KEY_OBJETIVOS, JSON.stringify(objetivos));
  }

  function syncCloud() {
    if (!window.firebase || !uid) return;
    firebase
      .database()
      .ref(`/users/${uid}/finanzas/objetivos`)
      .set({
        objetivos,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      })
      .catch(console.error);
  }

  function attachCloud() {
    if (!window.firebase || !uid) return;
    const ref = firebase
      .database()
      .ref(`/users/${uid}/finanzas/objetivos`);
    ref.on("value", (snap) => {
      const v = snap.val();
      if (!v || !Array.isArray(v.objetivos)) return;
      objetivos = v.objetivos;
      saveLocal();
      renderObjetivos();
    });
  }

  // ---- Modal objetivo ----
  function openModalObjetivo(goal) {
    editingId = goal ? goal.id : null;
    if ($tituloModal)
      $tituloModal.textContent = goal ? "Editar objetivo" : "Nuevo objetivo";

    $nombre.value = goal?.nombre || "";
    $cantidad.value =
      goal && goal.objetivo ? numberToEsLocal(goal.objetivo) : "";
    $ahorrado.value =
      goal && goal.ahorrado ? numberToEsLocal(goal.ahorrado) : "";
    $fecha.value = goal?.fecha || "";
    $color.value = goal?.color || "#7cc0ff";

    $modal.setAttribute("aria-hidden", "false");
  }

  function closeModalObjetivo() {
    $modal.setAttribute("aria-hidden", "true");
  }

  function setupMoneyInput(inp) {
    if (!inp) return;
    inp.addEventListener("focus", () => {
      if (inp.value) inp.select();
    });
    inp.addEventListener("blur", () => {
      const raw = inp.value.trim();
      if (!raw) {
        inp.value = "";
        return;
      }
      const num = esToNumberLocal(raw);
      inp.value = numberToEsLocal(num);
    });
  }

  setupMoneyInput($cantidad);
  setupMoneyInput($ahorrado);

  if ($btnNuevo) {
    $btnNuevo.addEventListener("click", () => openModalObjetivo(null));
  }
  if ($btnCerrar) $btnCerrar.addEventListener("click", closeModalObjetivo);
  if ($modalBackdrop)
    $modalBackdrop.addEventListener("click", closeModalObjetivo);

  if ($btnGuardar) {
    $btnGuardar.addEventListener("click", () => {
      const nombre = ($nombre.value || "").trim();
      if (!nombre) {
        alert("Pon un nombre para el objetivo.");
        return;
      }

      const objetivoNum = esToNumberLocal($cantidad.value.trim());
      const ahorradoNum = esToNumberLocal($ahorrado.value.trim());
      const fechaStr = $fecha.value || "";
      const colorStr = $color.value || "#7cc0ff";

      if (editingId) {
        const g = objetivos.find((o) => o.id === editingId);
        if (g) {
          g.nombre = nombre;
          g.objetivo = objetivoNum;
          g.ahorrado = ahorradoNum;
          g.fecha = fechaStr;
          g.color = colorStr;
        }
      } else {
        const id =
          "g_" +
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 7);
        objetivos.push({
          id,
          nombre,
          objetivo: objetivoNum,
          ahorrado: ahorradoNum,
          fecha: fechaStr,
          color: colorStr,
        });
      }

      saveLocal();
      syncCloud();
      renderObjetivos();
      closeModalObjetivo();
    });
  }

  // ---- Render de tarjetas de objetivos ----
  function renderObjetivos() {
    if (!$list) return;

    // limpiar menús viejos
    document.querySelectorAll(".goal-menu").forEach((el) => el.remove());
    $list.innerHTML = "";

    // ------- resumen global -------
    let totalObjetivo = 0;
    let totalAhorrado = 0;

    objetivos.forEach((g) => {
      totalObjetivo += g.objetivo || 0;
      totalAhorrado += g.ahorrado || 0;
    });

    const pctGlobal =
      totalObjetivo > 0 ? Math.max(0, Math.min(1, totalAhorrado / totalObjetivo)) : 0;

    if ($sumObjetivo) {
      $sumObjetivo.textContent =
        "Objetivo total: " + numberToEsLocal(totalObjetivo);
    }
    if ($sumProgreso) {
      $sumProgreso.textContent =
        "Ahorrado: " +
        numberToEsLocal(totalAhorrado) +
        " (" +
        pctToEsLocal(pctGlobal) +
        ")";
    }

    // ------- lista de objetivos -------
    if (!objetivos.length) {
      const empty = document.createElement("div");
      empty.className = "muted objetivos-empty";
      empty.textContent = 'Sin objetivos. Pulsa "Nuevo objetivo".';
      $list.append(empty);
      return;
    }

    objetivos.forEach((goal) => {
      const card = document.createElement("article");
      card.className = "objetivo-card";
      card.dataset.id = goal.id;

      const main = document.createElement("div");
      main.className = "objetivo-main";

      // círculo
      const circle = document.createElement("div");
      circle.className = "objetivo-circle";
      const objetivoNum = goal.objetivo || 0;
      const ahorradoNum = goal.ahorrado || 0;
      const pct =
        objetivoNum > 0
          ? Math.max(0, Math.min(1, ahorradoNum / objetivoNum))
          : 0;
      const pctDisplay = Math.round(pct * 100);

      circle.style.setProperty("--color", goal.color || "#7cc0ff");
      circle.style.setProperty("--pct", pct * 360 + "deg");

      const inner = document.createElement("div");
      inner.className = "objetivo-circle-inner";
      inner.textContent = pctDisplay + "%";
      circle.append(inner);

      // info
      const info = document.createElement("div");
      info.className = "objetivo-info";

      const nombreEl = document.createElement("div");
      nombreEl.className = "objetivo-nombre";
      nombreEl.textContent = goal.nombre || "Sin nombre";

      const amounts = document.createElement("div");
      amounts.className = "objetivo-amounts";

      const ahorEl = document.createElement("span");
      ahorEl.className = "obj-ahorrado";
      ahorEl.textContent = numberToEsLocal(ahorradoNum);

      const objEl = document.createElement("span");
      objEl.className = "obj-target";
      objEl.textContent = " / " + numberToEsLocal(objetivoNum);

      amounts.append(ahorEl, objEl);
      info.append(nombreEl, amounts);

      const fechaTxt = formatTimeLeft(goal.fecha);
      if (fechaTxt) {
        const fEl = document.createElement("div");
        fEl.className = "objetivo-fecha";
        fEl.textContent = fechaTxt;
        info.append(fEl);
      }

      main.append(circle, info);

      // menú (3 puntitos)
      const menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "objetivo-menu-btn";
      menuBtn.textContent = "⋮";

      const menu = document.createElement("div");
      menu.className = "goal-menu";

      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.textContent = "Editar";
      btnEdit.addEventListener("click", () => {
        openModalObjetivo(goal);
        menu.classList.remove("open");
      });

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.textContent = "Eliminar";
      btnDel.addEventListener("click", () => {
        if (
          !confirm(`¿Eliminar el objetivo “${goal.nombre || "sin nombre"}”?`)
        )
          return;
        objetivos = objetivos.filter((o) => o.id !== goal.id);
        saveLocal();
        syncCloud();
        renderObjetivos();
      });

      menu.append(btnEdit, btnDel);
      document.body.append(menu);

      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        document.querySelectorAll(".goal-menu.open").forEach((m) => {
          if (m !== menu) m.classList.remove("open");
        });

        const opened = menu.classList.contains("open");
        if (opened) {
          menu.classList.remove("open");
          return;
        }

        const rect = menuBtn.getBoundingClientRect();
        const menuWidth = 150;
        const top = rect.bottom + 6;
        const left = Math.max(8, rect.right - menuWidth);

        menu.style.top = top + "px";
        menu.style.left = left + "px";
        menu.classList.add("open");

        const closeMenu = (ev) => {
          if (!menu.contains(ev.target) && ev.target !== menuBtn) {
            menu.classList.remove("open");
            document.removeEventListener("click", closeMenu);
          }
        };
        document.addEventListener("click", closeMenu);
      });

      // click en la tarjeta = editar rápido
      card.addEventListener("click", (e) => {
        if (e.target === menuBtn) return;
        openModalObjetivo(goal);
      });

      card.append(main, menuBtn);
      $list.append(card);
    });
  }


  // ---- Init ----
  (function init() {
    loadLocal();
    renderObjetivos();
    attachCloud();
  })();
})();
