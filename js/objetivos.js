(function () {
const KEY_OBJETIVOS = "mis_cuentas_fase1_objetivos";
const KEY_UID       = "mis_cuentas_uid";
const KEY_DATA      = "mis_cuentas_fase1_data";
const KEY_CUENTAS   = "mis_cuentas_fase1_cuentas";
const KEY_ORIGEN    = "mis_cuentas_fase1_origen_cuentas";

function getUidFromLogin() {
  const uid = localStorage.getItem(KEY_UID) || null;
  console.log("[OBJ] getUidFromLogin ->", uid);
  return uid;
}

let uid = getUidFromLogin();
let cloudRef = null;

console.log("[OBJ] script objetivos.js cargado, uid inicial =", uid);

// Cuando cambias de usuario en el login, actualizamos uid y el listener
window.addEventListener("finanzas-login", (ev) => {
  const detail = ev && ev.detail ? ev.detail : {};
  const newUid = detail.uid || getUidFromLogin();
  console.log("[OBJ] evento finanzas-login recibido", { oldUid: uid, newUid });
  uid = newUid;
  attachCloud();
});

  // ---- Helpers numéricos locales ----
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

  function daysToTarget(fechaStr) {
    if (!fechaStr) return null;
    const target = new Date(fechaStr + "T00:00:00");
    if (isNaN(target)) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  function formatTimeLeft(fechaStr) {
    const days = daysToTarget(fechaStr);
    if (days == null) return "";
    if (days > 0) return `Quedan ${days} día${days !== 1 ? "s" : ""}`;
    if (days === 0) return "Hoy es la fecha objetivo";
    const past = Math.abs(days);
    return `Se pasó hace ${past} día${past !== 1 ? "s" : ""}`;
  }

  // ---- Estado ----
  let objetivos      = [];
  let editingId      = null;
  let cuentasOrigen  = [];
  let registrosCtas  = [];
  let selectedOrigen = [];

  // ---- DOM ----
  const $tabButtons      = document.querySelectorAll(".tabs .tab");
  const $panelCuentas    = document.getElementById("tab-cuentas");
  const $panelObjetivos  = document.getElementById("tab-objetivos");

  const $list        = document.getElementById("objetivos-list");
  const $btnNuevo    = document.getElementById("btn-nuevo-objetivo");

  const $sumObjetivo = document.getElementById("obj-total-objetivo");
  const $sumProgreso = document.getElementById("obj-total-progreso");
  const $sumOrigen   = document.getElementById("obj-origen-resumen");
  const $sumCapital  = document.getElementById("obj-capital-disponible");

  const $globalCircle = document.getElementById("obj-global-circle");
  const $globalPct    = document.getElementById("obj-global-pct");

  // modal objetivo
  const $modalObj         = document.getElementById("modal-objetivo");
  const $modalObjBackdrop = document.getElementById("modal-objetivo-backdrop");
  const $btnCerrarObj     = document.getElementById("btn-cerrar-modal-objetivo");
  const $tituloModal      = document.getElementById("modal-objetivo-title");
  const $nombre           = document.getElementById("obj-nombre");
  const $cantidad         = document.getElementById("obj-cantidad");
  const $ahorrado         = document.getElementById("obj-ahorrado");
  const $fecha            = document.getElementById("obj-fecha");
  const $color            = document.getElementById("obj-color");
  const $btnGuardarObj    = document.getElementById("btn-guardar-objetivo");

  // modal origen cuentas
  const $btnOrigen           = document.getElementById("btn-origen-cuentas");
  const $modalOrigen         = document.getElementById("modal-origen");
  const $modalOrigenBackdrop = document.getElementById("modal-origen-backdrop");
  const $origenList          = document.getElementById("origen-cuentas-list");
  const $btnGuardarOrigen    = document.getElementById("btn-guardar-origen");
  const $btnCerrarOrigen     = document.getElementById("btn-cerrar-modal-origen");

  if (
    !$panelCuentas ||
    !$panelObjetivos ||
    !$list ||
    !$btnNuevo ||
    !$modalObj
  ) {
    return;
  }

  // ---- Tabs Cuentas / Objetivos ----
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
        // al entrar en Objetivos, siempre recalculamos reparto y UI
        renderObjetivos();
      }
    });
  });

  // ---- LocalStorage / Firebase ----
  // ---- LocalStorage / Firebase ----
  function loadLocalObjetivos() {
    try {
      const raw = localStorage.getItem(KEY_OBJETIVOS);
      objetivos = raw ? JSON.parse(raw) || [] : [];
      console.log("[OBJ] loadLocalObjetivos ->", objetivos.length, "objetivos");
    } catch (e) {
      console.error("[OBJ] loadLocalObjetivos ERROR", e);
      objetivos = [];
    }
  }

  function saveLocalObjetivos() {
    console.log("[OBJ] saveLocalObjetivos ->", objetivos.length, "objetivos");
    localStorage.setItem(KEY_OBJETIVOS, JSON.stringify(objetivos));
  }

  function loadCuentasLocal() {
    try {
      const rawC = localStorage.getItem(KEY_CUENTAS);
      cuentasOrigen = rawC ? JSON.parse(rawC) || [] : [];
    } catch (e) {
      console.error("[OBJ] loadCuentasLocal cuentas ERROR", e);
      cuentasOrigen = [];
    }
    try {
      const rawD = localStorage.getItem(KEY_DATA);
      registrosCtas = rawD ? JSON.parse(rawD) || [] : [];
    } catch (e) {
      console.error("[OBJ] loadCuentasLocal registros ERROR", e);
      registrosCtas = [];
    }
    console.log("[OBJ] loadCuentasLocal ->", {
      cuentasOrigen: cuentasOrigen.length,
      registrosCtas: registrosCtas.length
    });
  }

// cargar selección
function loadSelectedOrigen() {
  try {
    const raw = localStorage.getItem(KEY_ORIGEN_OBJETIVOS);
    selectedOrigen = raw ? JSON.parse(raw) || [] : [];
  } catch (e) {
    console.error("[OBJ] loadSelectedOrigen ERROR", e);
    selectedOrigen = [];
  }
  console.log("[OBJ] loadSelectedOrigen ->", selectedOrigen);
}

// guardar selección
function saveSelectedOrigen() {
  console.log("[OBJ] saveSelectedOrigen ->", selectedOrigen);
  localStorage.setItem(KEY_ORIGEN_OBJETIVOS, JSON.stringify(selectedOrigen));
}

  function syncCloud() {
    if (!window.firebase || !uid) {
      console.log("[OBJ] syncCloud: abort (no firebase o sin uid)", {
        hasFirebase: !!window.firebase,
        uid
      });
      return;
    }
    console.log("[OBJ] syncCloud: escribiendo", objetivos.length, "objetivos para uid", uid);
    firebase
      .database()
      .ref(`/users/${uid}/finanzas/objetivos`)
      .set({
        objetivos,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
      })
      .then(() => {
        console.log("[OBJ] syncCloud: OK");
      })
      .catch((err) => {
        console.error("[OBJ] syncCloud ERROR", err);
      });
  }

  function attachCloud() {
    if (!window.firebase || !uid) {
      console.log("[OBJ] attachCloud: abort (no firebase o sin uid)", {
        hasFirebase: !!window.firebase,
        uid
      });
      return;
    }

    // Si ya había un listener de otro usuario, lo quitamos
    if (cloudRef) {
      try {
        console.log("[OBJ] attachCloud: quitando listener anterior");
        cloudRef.off();
      } catch (e) {
        console.error("[OBJ] attachCloud off() ERROR", e);
      }
    }

    const path = `/users/${uid}/finanzas/objetivos`;
    cloudRef = firebase.database().ref(path);
    console.log("[OBJ] attachCloud: escuchando en", path);

    cloudRef.on("value", (snap) => {
      const v = snap.val();
      const len = v && Array.isArray(v.objetivos) ? v.objetivos.length : null;
      console.log("[OBJ] attachCloud:value", {
        exists: !!v,
        hasArray: !!(v && Array.isArray(v.objetivos)),
        len,
        uid
      });

      if (!v || !Array.isArray(v.objetivos)) return;

      objetivos = v.objetivos || [];
      saveLocalObjetivos();
      renderObjetivos();
    });
  }



  // ---- capital disponible desde cuentas ----
  function getLastRegistroCuentas() {
    if (!registrosCtas.length) return null;
    let last = registrosCtas[0];
    for (let i = 1; i < registrosCtas.length; i++) {
      const r = registrosCtas[i];
      if (new Date(r.fecha) > new Date(last.fecha)) last = r;
    }
    return last;
  }

  function computeCapitalDisponible() {
    // siempre recarga local para ser dinámico
    loadCuentasLocal();

    const last = getLastRegistroCuentas();
    if (!last || !last.saldos) {
      return { capital: 0, activeNames: [] };
    }

    const active =
      selectedOrigen && selectedOrigen.length
        ? selectedOrigen.filter((n) => cuentasOrigen.includes(n))
        : cuentasOrigen.slice();

    let capital = 0;
    active.forEach((name) => {
      const v = last.saldos[name];
      if (Number.isFinite(v)) capital += v;
    });

    return { capital, activeNames: active };
  }

  function getTotalsObjetivos() {
    let totalObjetivo = 0;
    let totalAhorrado = 0;
    objetivos.forEach((g) => {
      totalObjetivo += g.objetivo || 0;
      totalAhorrado += g.ahorrado || 0;
    });
    return { totalObjetivo, totalAhorrado };
  }

  // ---- Modal objetivo ----
  function openModalObjetivo(goal) {
    editingId = goal ? goal.id : null;
    if ($tituloModal)
      $tituloModal.textContent = goal ? "Editar objetivo" : "Nuevo objetivo";

    $nombre.value   = goal?.nombre   || "";
    $cantidad.value = goal && goal.objetivo ? numberToEsLocal(goal.objetivo) : "";
    $ahorrado.value = goal && goal.ahorrado ? numberToEsLocal(goal.ahorrado) : "";
    $fecha.value    = goal?.fecha    || "";
    $color.value    = goal?.color    || "#7cc0ff";

    $modalObj.setAttribute("aria-hidden", "false");
  }

  function closeModalObjetivo() {
    $modalObj.setAttribute("aria-hidden", "true");
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
  if ($btnCerrarObj) $btnCerrarObj.addEventListener("click", closeModalObjetivo);
  if ($modalObjBackdrop)
    $modalObjBackdrop.addEventListener("click", closeModalObjetivo);

  if ($btnGuardarObj) {
    $btnGuardarObj.addEventListener("click", () => {
      console.log("[OBJ] click Guardar objetivo, editingId =", editingId);

      const nombre = ($nombre.value || "").trim();
      if (!nombre) {
        alert("Pon un nombre para el objetivo.");
        console.warn("[OBJ] Guardar objetivo: sin nombre, cancelado");
        return;
      }

      const objetivoNum = esToNumberLocal(($cantidad.value || "").trim());
      const ahorradoNum = esToNumberLocal(($ahorrado.value || "").trim());
      const fechaStr    = $fecha.value || "";
      const colorStr    = $color.value || "#7cc0ff";

      console.log("[OBJ] datos introducidos objetivo =", {
        nombre,
        objetivoNum,
        ahorradoNum,
        fechaStr,
        colorStr,
      });

      try {
        if (editingId) {
          const g = objetivos.find((o) => o.id === editingId);
          console.log("[OBJ] editando objetivo existente:", g ? g.id : "NO ENCONTRADO");
          if (g) {
            g.nombre   = nombre;
            g.objetivo = objetivoNum;
            g.ahorrado = ahorradoNum;
            g.fecha    = fechaStr;
            g.color    = colorStr;
          }
        } else {
          const id =
            "g_" +
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 7);
          const nuevo = {
            id,
            nombre,
            objetivo: objetivoNum,
            ahorrado: ahorradoNum,
            fecha: fechaStr,
            color: colorStr,
          };
          objetivos.push(nuevo);
          console.log("[OBJ] nuevo objetivo añadido:", nuevo);
        }

        console.log("[OBJ] total objetivos tras guardar =", objetivos.length);

        saveLocalObjetivos();
        syncCloud();
        renderObjetivos();
        closeModalObjetivo();
      } catch (e) {
        console.error("[OBJ] ERROR guardando objetivo", e);
        alert("Ha ocurrido un error guardando el objetivo (mira la consola).");
      }
    });
  }


  // ---- Modal selección cuentas origen ----
function openModalOrigen() {
  if (!$modalOrigen || !$origenList) return;

  // siempre refrescar cuentas reales
  loadCuentasLocal();

  // borrar selecciones inválidas
  selectedOrigen = (selectedOrigen || []).filter(c => cuentasOrigen.includes(c));
  saveSelectedOrigen();

  $origenList.innerHTML = "";

  cuentasOrigen.forEach((c) => {
    const id = "origen-" + c.replace(/\s+/g, "-");

    const row = document.createElement("label");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.id = id;
    chk.value = c;

    // si no hay selección → todas marcadas
    chk.checked =
      selectedOrigen.length === 0 || selectedOrigen.includes(c);

    const span = document.createElement("span");
    span.textContent = c;

    row.append(chk, span);
    $origenList.append(row);
  });

  $modalOrigen.setAttribute("aria-hidden", "false");
}


  function closeModalOrigen() {
    if ($modalOrigen)
      $modalOrigen.setAttribute("aria-hidden", "true");
  }

  if ($btnOrigen) $btnOrigen.addEventListener("click", openModalOrigen);
  if ($btnCerrarOrigen)
    $btnCerrarOrigen.addEventListener("click", closeModalOrigen);
  if ($modalOrigenBackdrop)
    $modalOrigenBackdrop.addEventListener("click", closeModalOrigen);

  if ($btnGuardarOrigen) {
    $btnGuardarOrigen.addEventListener("click", () => {
      if (!$origenList) return;
      const checks = $origenList.querySelectorAll("input[type='checkbox']");
      const sel = [];
      checks.forEach((chk) => {
        if (chk.checked) sel.push(chk.value);
      });
selectedOrigen = sel.length ? sel : [];
      saveSelectedOrigen();
      renderObjetivos(); // recalcula con las nuevas cuentas origen
      closeModalOrigen();
    });
  }

  // ---- Reparto automático dinámico con prioridad temporal ----
  // Recalcula SIEMPRE desde cero 'ahorrado' en función de:
  // - objetivos (cantidad)
  // - fecha (urgencia)
  // - capital disponible actual en cuentas origen
  // Devuelve true si ha modificado algo.
  function applyRepartoAutomatico() {
    const { capital } = computeCapitalDisponible();
    console.log("[OBJ] applyRepartoAutomatico: capital disponible =", capital, "objetivos =", objetivos.length);

    // si no hay capital, ponemos todo a 0
    if (capital <= 0) {
      let changedZero = false;
      objetivos.forEach((g) => {
        if (g.ahorrado && Math.abs(g.ahorrado) > 0.005) {
          g.ahorrado = 0;
          changedZero = true;
        }
      });
      console.log("[OBJ] applyRepartoAutomatico: sin capital, changedZero =", changedZero);
      return changedZero;
    }

    const remaining = [];
    const alloc = {};
    const K = 2.5;

    objetivos.forEach((g) => {
      alloc[g.id] = 0;
      const objetivo = g.objetivo || 0;
      if (objetivo <= 0) return;

      let d = daysToTarget(g.fecha);
      if (d == null) d = 3650;
      if (d < 0) d = 0;

      remaining.push({
        id: g.id,
        days: d,
        pending: objetivo,
      });
    });

    console.log("[OBJ] applyRepartoAutomatico: objetivos candidatos =", remaining.length);

    let capitalLeft = capital;
    let iter = 0;

    while (capitalLeft > 1e-6 && remaining.length) {
      iter++;
      let totalW = 0;
      const weights = [];

      for (const r of remaining) {
        const effDays = r.days + 1;
        const w = r.pending / Math.pow(effDays, K);
        weights.push(w);
        totalW += w;
      }

      if (totalW <= 0) {
        console.log("[OBJ] applyRepartoAutomatico: totalW <= 0, break");
        break;
      }

      const newRemaining = [];

      for (let i = 0; i < remaining.length; i++) {
        const r = remaining[i];
        const w = weights[i];

        if (w <= 0) {
          newRemaining.push(r);
          continue;
        }

        const desired = capitalLeft * (w / totalW);
        const give = Math.min(desired, r.pending, capitalLeft);

        if (give > 1e-6) {
          alloc[r.id] += give;
          capitalLeft -= give;
        }

        const newPending = r.pending - give;
        if (newPending > 1e-6) {
          newRemaining.push({
            id: r.id,
            days: r.days,
            pending: newPending,
          });
        }
      }

      remaining.length = 0;
      Array.prototype.push.apply(remaining, newRemaining);

      if (iter > 20) {
        console.warn("[OBJ] applyRepartoAutomatico: demasiadas iteraciones, cortando");
        break;
      }
    }

    let changed = false;
    objetivos.forEach((g) => {
      const nuevo = alloc[g.id] || 0;
      if (!g.ahorrado || Math.abs(g.ahorrado - nuevo) > 0.005) {
        changed = true;
        g.ahorrado = nuevo;
      }
    });

    console.log("[OBJ] applyRepartoAutomatico: finished, changed =", changed);
    return changed;
  }


  // ---- Render de tarjetas de objetivos ----
  function renderObjetivos() {
    console.log("[OBJ] renderObjetivos: inicio, objetivos =", objetivos.length, "uid =", uid);
    if (!$list) {
      console.warn("[OBJ] renderObjetivos: sin $list, abort");
      return;
    }

    const changed = applyRepartoAutomatico();
    console.log("[OBJ] renderObjetivos: applyRepartoAutomatico changed =", changed);

    if (changed) {
      saveLocalObjetivos();
      syncCloud();
    }

    document.querySelectorAll(".goal-menu").forEach((el) => el.remove());
    $list.innerHTML = "";

    const { totalObjetivo, totalAhorrado } = getTotalsObjetivos();
    const pctGlobal =
      totalObjetivo > 0
        ? Math.max(0, Math.min(1, totalAhorrado / totalObjetivo))
        : 0;

    console.log("[OBJ] renderObjetivos: totales =", {
      totalObjetivo,
      totalAhorrado,
      pctGlobal,
    });

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

    if ($globalCircle) {
      $globalCircle.style.setProperty("--pct", pctGlobal * 360 + "deg");
    }
    if ($globalPct) {
      $globalPct.textContent = Math.round(pctGlobal * 100) + "%";
    }

    const { capital, activeNames } = computeCapitalDisponible();
    console.log("[OBJ] renderObjetivos: capitalDisponible =", {
      capital,
      activeNames,
    });

    if ($sumCapital) {
      $sumCapital.textContent =
        "Disponible: " + numberToEsLocal(capital);
    }
    if ($sumOrigen) {
      if (!activeNames.length) {
        $sumOrigen.textContent = "Origen: sin datos";
      } else if (
        activeNames.length === cuentasOrigen.length ||
        !selectedOrigen.length
      ) {
        $sumOrigen.textContent = "Origen: todas";
      } else {
        $sumOrigen.textContent = "Origen: " + activeNames.join(", ");
      }
    }

    if (!objetivos.length) {
      console.log("[OBJ] renderObjetivos: sin objetivos, mostrando vacío");
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
        console.log("[OBJ] menú Editar objetivo", goal.id);
        openModalObjetivo(goal);
        menu.classList.remove("open");
      });

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.textContent = "Eliminar";
      btnDel.addEventListener("click", () => {
        console.log("[OBJ] menú Eliminar objetivo", goal.id);
        if (
          !confirm(`¿Eliminar el objetivo “${goal.nombre || "sin nombre"}”?`)
        )
          return;
        objetivos = objetivos.filter((o) => o.id !== goal.id);
        saveLocalObjetivos();
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

      card.addEventListener("click", (e) => {
        if (e.target === menuBtn) return;
        console.log("[OBJ] click tarjeta objetivo", goal.id);
        openModalObjetivo(goal);
      });

      card.append(main, menuBtn);
      $list.append(card);
    });

    console.log("[OBJ] renderObjetivos: fin");
  }


  // ---- Init ----
  // ---- Init ----
  (function init() {
    console.log("[OBJ] init() start, uid =", uid);
    loadLocalObjetivos();
    loadCuentasLocal();
    loadSelectedOrigen();
    console.log("[OBJ] init() después de load:", {
      objetivos: objetivos.length,
      cuentasOrigen: cuentasOrigen.length,
      registrosCtas: registrosCtas.length,
      selectedOrigen,
    });

    renderObjetivos();
    attachCloud();
    console.log("[OBJ] init() done");
  })();
})();
const KEY_ORIGEN_OBJETIVOS = "mis_cuentas_fase1_origen_cuentas_objetivos";
