(function () {
  const KEY_OBJETIVOS = "mis_cuentas_fase1_objetivos";
  const KEY_UID       = "mis_cuentas_uid";
  const KEY_DATA      = "mis_cuentas_fase1_data";
  const KEY_CUENTAS   = "mis_cuentas_fase1_cuentas";
  const KEY_ORIGEN    = "mis_cuentas_fase1_origen_cuentas";

  function getUid() {
    return localStorage.getItem(KEY_UID) || null;
  }

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

  function numberToEsLocal(n, opts) {
    return new Intl.NumberFormat(
      "es-ES",
      opts || { style: "currency", currency: "EUR" }
    ).format(n);
  }

  function pctToEsLocal(n) {
    return new Intl.NumberFormat("es-ES", {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(n);
  }

  function ymdLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  // ---- Estado local ----
  let objetivos      = [];
  let editingId      = null;
  let cuentasOrigen  = [];
  let registrosCtas  = [];
  let selectedOrigen = [];
  let objetivosRef   = null;

  // ---- DOM ----
  const $tabObjetivos    = document.getElementById("tab-objetivos");
  const $panelObjetivos  = document.getElementById("panel-objetivos");
  const $btnNuevoObjetivo= document.getElementById("btn-nuevo-objetivo");
  const $listaObjetivos  = document.getElementById("objetivos-lista");
  const $resumenObjetivos= document.getElementById("objetivos-resumen");

  const $modalObj             = document.getElementById("modal-objetivo");
  const $modalObjDialog       = $modalObj ? $modalObj.querySelector(".modal__dialog") : null;
  const $modalObjClose        = document.getElementById("modal-objetivo-close");
  const $btnCerrarModalObj    = document.getElementById("btn-cerrar-modal-objetivo");
  const $btnGuardarObjetivo   = document.getElementById("btn-guardar-objetivo");
  const $btnBorrarObjetivo    = document.getElementById("btn-borrar-objetivo");

  const $objNombre       = document.getElementById("obj-nombre");
  const $objObjetivo     = document.getElementById("obj-objetivo");
  const $objFecha        = document.getElementById("obj-fecha");
  const $objColor        = document.getElementById("obj-color");
  const $objOrigenMulti  = document.getElementById("obj-origen");
  const $objPrioridad    = document.getElementById("obj-prioridad");

  const $totalObjetivos      = document.getElementById("objetivos-total");
  const $totalObjetivosRest  = document.getElementById("objetivos-restante");
  const $totalObjetivosPct   = document.getElementById("objetivos-pct");
  const $ringTotalObjetivos  = document.getElementById("ring-objetivos-total");

  if ($tabObjetivos && $panelObjetivos) {
    $tabObjetivos.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) =>
        b.classList.remove("active")
      );
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.setAttribute("aria-hidden", "true"));

      $tabObjetivos.classList.add("active");
      $panelObjetivos.setAttribute("aria-hidden", "false");
    });
  }

  if ($btnNuevoObjetivo) {
    $btnNuevoObjetivo.addEventListener("click", () => {
      openModalObjetivo(null);
    });
  }

  if ($modalObjClose) $modalObjClose.addEventListener("click", closeModalObjetivo);
  if ($btnCerrarModalObj) $btnCerrarModalObj.addEventListener("click", closeModalObjetivo);
  if ($modalObj) {
    const backdrop = document.getElementById("modal-objetivo-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeModalObjetivo);
  }

  if ($btnGuardarObjetivo) {
    $btnGuardarObjetivo.addEventListener("click", onGuardarObjetivo);
  }

  if ($btnBorrarObjetivo) {
    $btnBorrarObjetivo.addEventListener("click", onBorrarObjetivo);
  }

  function loadLocalObjetivos() {
    try {
      const raw = localStorage.getItem(KEY_OBJETIVOS);
      if (!raw) {
        objetivos = [];
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) objetivos = parsed;
      else objetivos = [];
    } catch (e) {
      console.error(e);
      objetivos = [];
    }
  }

  function saveLocalObjetivos() {
    localStorage.setItem(KEY_OBJETIVOS, JSON.stringify(objetivos));
  }

  function loadCuentasLocal() {
    try {
      const cuentas = JSON.parse(localStorage.getItem(KEY_CUENTAS)) || [];
      cuentasOrigen = cuentas;
    } catch (e) {
      console.error(e);
      cuentasOrigen = [];
    }

    try {
      const regs = JSON.parse(localStorage.getItem(KEY_DATA)) || [];
      registrosCtas = regs;
    } catch (e) {
      console.error(e);
      registrosCtas = [];
    }

    renderOrigenMultiSelect();
  }

  function loadSelectedOrigen() {
    try {
      const raw = localStorage.getItem(KEY_ORIGEN);
      if (!raw) {
        selectedOrigen = [...cuentasOrigen];
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) selectedOrigen = parsed;
      else selectedOrigen = [...cuentasOrigen];
    } catch (e) {
      console.error(e);
      selectedOrigen = [...cuentasOrigen];
    }
  }

  function saveSelectedOrigen() {
    localStorage.setItem(KEY_ORIGEN, JSON.stringify(selectedOrigen));
  }

  function renderOrigenMultiSelect() {
    if (!$objOrigenMulti) return;
    $objOrigenMulti.innerHTML = "";

    cuentasOrigen.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      if (!selectedOrigen.length || selectedOrigen.includes(c)) {
        opt.selected = true;
      }
      $objOrigenMulti.append(opt);
    });

    $objOrigenMulti.addEventListener("change", () => {
      const vals = Array.from($objOrigenMulti.selectedOptions).map((o) => o.value);
      selectedOrigen = vals;
      if (!selectedOrigen.length) {
        selectedOrigen = [...cuentasOrigen];
      }
      saveSelectedOrigen();
      renderObjetivos();
    });
  }

  function getTotalDisponible() {
    if (!registrosCtas.length) return 0;
    const last = [...registrosCtas].sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha)
    )[registrosCtas.length - 1];

    if (!last || !last.saldos) return 0;

    let total = 0;
    const origenSet = new Set(selectedOrigen.length ? selectedOrigen : cuentasOrigen);

    Object.keys(last.saldos).forEach((cta) => {
      if (origenSet.has(cta)) {
        const v = last.saldos[cta];
        if (Number.isFinite(v)) total += v;
      }
    });

    return total;
  }

  function getDiasRestantes(fecha) {
    if (!fecha) return Infinity;
    const hoy = new Date();
    const objetivo = new Date(fecha);
    const diffMs = objetivo.getTime() - hoy.getTime();
    return diffMs <= 0 ? 1 : Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  function getTotalRestanteYPeso() {
    const hoy = new Date();
    let totalRestante = 0;

    const data = objetivos.map((g) => {
      const objetivo = Number.isFinite(g.objetivo) ? g.objetivo : 0;
      const aportado = Number.isFinite(g.aportado) ? g.aportado : 0;
      const restante = Math.max(0, objetivo - aportado);
      const dias = getDiasRestantes(g.fecha);

      let pesoTiempo = 1;
      if (dias <= 1) pesoTiempo = 5;
      else if (dias <= 7) pesoTiempo = 3;
      else if (dias <= 30) pesoTiempo = 2;
      else pesoTiempo = 1;

      const prioridad =
        typeof g.prioridad === "number" && g.prioridad > 0
          ? g.prioridad
          : 1;

      const peso = restante * pesoTiempo * prioridad;

      totalRestante += restante;

      return {
        id: g.id,
        restante,
        dias,
        peso,
      };
    });

    return { totalRestante, data };
  }

  function repartirAutomatico() {
    const totalDisponible = getTotalDisponible();
    if (totalDisponible <= 0 || !objetivos.length) {
      objetivos.forEach((g) => {
        g.sugerido = 0;
      });
      saveLocalObjetivos();
      renderObjetivos();
      return;
    }

    const { totalRestante, data } = getTotalRestanteYPeso();
    if (totalRestante <= 0) {
      objetivos.forEach((g) => (g.sugerido = 0));
      saveLocalObjetivos();
      renderObjetivos();
      return;
    }

    const sumaPesos = data.reduce((acc, d) => acc + d.peso, 0);
    if (sumaPesos <= 0) {
      const porObjetivo = totalDisponible / data.length;
      objetivos.forEach((g) => {
        g.sugerido = porObjetivo;
      });
      saveLocalObjetivos();
      renderObjetivos();
      return;
    }

    let restanteDisponible = totalDisponible;

    const objById = new Map();
    objetivos.forEach((g) => {
      objById.set(g.id, g);
      g.sugerido = 0;
    });

    const ordenados = [...data].sort((a, b) => a.dias - b.dias);

    ordenados.forEach((info) => {
      if (restanteDisponible <= 0) return;

      const g = objById.get(info.id);
      if (!g) return;

      const objetivo = Number.isFinite(g.objetivo) ? g.objetivo : 0;
      const aportado = Number.isFinite(g.aportado) ? g.aportado : 0;
      const pendiente = Math.max(0, objetivo - aportado);
      if (pendiente <= 0) {
        g.sugerido = 0;
        return;
      }

      const proporcion = info.peso / sumaPesos;
      let asignado = totalDisponible * proporcion;

      if (asignado > pendiente) asignado = pendiente;
      if (asignado > restanteDisponible) asignado = restanteDisponible;

      g.sugerido = asignado;
      restanteDisponible -= asignado;
    });

    saveLocalObjetivos();
    renderObjetivos();
  }

  function openModalObjetivo(goal) {
    if (!$modalObj) return;

    if (!goal) {
      editingId = null;
      if ($objNombre) $objNombre.value = "";
      if ($objObjetivo) $objObjetivo.value = "";
      if ($objFecha) $objFecha.value = "";
      if ($objColor) $objColor.value = "#67d5ff";
      if ($objPrioridad) $objPrioridad.value = "1";
      if ($objOrigenMulti) {
        Array.from($objOrigenMulti.options).forEach((opt) => {
          opt.selected = selectedOrigen.includes(opt.value);
        });
      }
      if ($btnBorrarObjetivo) $btnBorrarObjetivo.style.display = "none";
    } else {
      editingId = goal.id;
      if ($objNombre) $objNombre.value = goal.nombre || "";
      if ($objObjetivo)
        $objObjetivo.value =
          goal.objetivo != null ? String(goal.objetivo) : "";
      if ($objFecha) $objFecha.value = goal.fecha || "";
      if ($objColor) $objColor.value = goal.color || "#67d5ff";
      if ($objPrioridad)
        $objPrioridad.value =
          goal.prioridad != null ? String(goal.prioridad) : "1";

      if ($objOrigenMulti && Array.isArray(goal.origen) && goal.origen.length) {
        Array.from($objOrigenMulti.options).forEach((opt) => {
          opt.selected = goal.origen.includes(opt.value);
        });
      } else if ($objOrigenMulti) {
        Array.from($objOrigenMulti.options).forEach((opt) => {
          opt.selected = selectedOrigen.includes(opt.value);
        });
      }

      if ($btnBorrarObjetivo) $btnBorrarObjetivo.style.display = "inline-flex";
    }

    $modalObj.setAttribute("aria-hidden", "false");
  }

  function closeModalObjetivo() {
    if ($modalObj) $modalObj.setAttribute("aria-hidden", "true");
    editingId = null;
  }

  function onGuardarObjetivo() {
    if (!$objNombre || !$objObjetivo) return;

    const nombre = $objNombre.value.trim();
    const objStr = $objObjetivo.value.trim();
    const fecha  = $objFecha ? $objFecha.value : "";
    const color  = $objColor ? $objColor.value : "#67d5ff";
    const prioridad = $objPrioridad ? esToNumberLocal($objPrioridad.value) : 1;

    if (!nombre) {
      alert("Pon un nombre para el objetivo.");
      return;
    }

    const objetivoNum = esToNumberLocal(objStr);
    if (!Number.isFinite(objetivoNum) || objetivoNum <= 0) {
      alert("Objetivo inválido.");
      return;
    }

    let origenSel = selectedOrigen.slice();
    if ($objOrigenMulti) {
      const vals = Array.from($objOrigenMulti.selectedOptions).map(
        (o) => o.value
      );
      if (vals.length) origenSel = vals;
    }

    if (!origenSel.length) origenSel = [...cuentasOrigen];

    if (editingId) {
      const idx = objetivos.findIndex((g) => g.id === editingId);
      if (idx >= 0) {
        objetivos[idx].nombre   = nombre;
        objetivos[idx].objetivo = objetivoNum;
        objetivos[idx].fecha    = fecha || null;
        objetivos[idx].color    = color;
        objetivos[idx].origen   = origenSel;
        objetivos[idx].prioridad= prioridad > 0 ? prioridad : 1;
      }
    } else {
      const nuevo = {
        id: "obj_" + Math.random().toString(36).slice(2) + Date.now().toString(36),
        nombre,
        objetivo: objetivoNum,
        aportado: 0,
        sugerido: 0,
        fecha: fecha || null,
        color,
        origen: origenSel,
        prioridad: prioridad > 0 ? prioridad : 1,
      };
      objetivos.push(nuevo);
    }

    saveLocalObjetivos();
    repartirAutomatico();
    closeModalObjetivo();
  }

  function onBorrarObjetivo() {
    if (!editingId) return;
    if (!confirm("¿Eliminar este objetivo?")) return;
    objetivos = objetivos.filter((g) => g.id !== editingId);
    saveLocalObjetivos();
    repartirAutomatico();
    closeModalObjetivo();
  }

  function renderObjetivos() {
    if (!$listaObjetivos) return;
    $listaObjetivos.innerHTML = "";

    renderResumenTotal();

    if (!objetivos.length) {
      $listaObjetivos.innerHTML =
        '<div class="muted">Sin objetivos todavía. Pulsa “Nuevo objetivo”.</div>';
      return;
    }

    const totalDisponible = getTotalDisponible();

    objetivos.forEach((g) => {
      const objetivo = Number.isFinite(g.objetivo) ? g.objetivo : 0;
      const aportado = Number.isFinite(g.aportado) ? g.aportado : 0;
      const sugerido = Number.isFinite(g.sugerido) ? g.sugerido : 0;

      const restante = Math.max(0, objetivo - aportado);
      const pct = objetivo > 0 ? aportado / objetivo : 0;

      const dias = getDiasRestantes(g.fecha);
      const hoy = new Date();
      const fechaObj = g.fecha ? new Date(g.fecha) : null;
      const vencido = fechaObj && fechaObj < hoy;

      const card = document.createElement("article");
      card.className = "objetivo-card";

      if (vencido && restante > 0) {
        card.classList.add("objetivo-vencido");
      }

      const header = document.createElement("div");
      header.className = "objetivo-header";

      const title = document.createElement("h3");
      title.textContent = g.nombre || "Objetivo sin nombre";

      const badgeFecha = document.createElement("div");
      badgeFecha.className = "objetivo-fecha";

      if (g.fecha) {
        badgeFecha.textContent = `${g.fecha} · ${
          dias <= 0 ? "hoy" : `faltan ${dias} día(s)`
        }`;
      } else {
        badgeFecha.textContent = "Sin fecha límite";
      }

      header.append(title, badgeFecha);

      const ringWrap = document.createElement("div");
      ringWrap.className = "objetivo-ring-wrap";

      const ring = document.createElement("div");
      ring.className = "progress-ring";
      ring.style.setProperty("--ring-color", g.color || "#67d5ff");

      const pctShow = Math.max(0, Math.min(1, pct));
      ring.style.setProperty("--ring-progress", String(pctShow));

      const ringInner = document.createElement("div");
      ringInner.className = "progress-ring__inner";
      ringInner.textContent = pctToEsLocal(pctShow);

      ring.append(ringInner);
      ringWrap.append(ring);

      const body = document.createElement("div");
      body.className = "objetivo-body";

      const rowObjetivo = document.createElement("div");
      rowObjetivo.className = "objetivo-row";
      rowObjetivo.innerHTML =
        `<span>Objetivo</span><span>${numberToEsLocal(objetivo)}</span>`;

      const rowAportado = document.createElement("div");
      rowAportado.className = "objetivo-row";
      rowAportado.innerHTML =
        `<span>Aportado</span><span>${numberToEsLocal(aportado)}</span>`;

      const rowRestante = document.createElement("div");
      rowRestante.className = "objetivo-row";
      rowRestante.innerHTML =
        `<span>Restante</span><span>${numberToEsLocal(restante)}</span>`;

      const rowSugerido = document.createElement("div");
      rowSugerido.className = "objetivo-row sugerido-row";

      const lblSug = document.createElement("span");
      lblSug.textContent = "Asignado ahora";

      const contSug = document.createElement("span");
      const inpSug = document.createElement("input");
      inpSug.type = "text";
      inpSug.inputMode = "decimal";
      inpSug.value = sugerido ? numberToEsLocal(sugerido) : "";
      inpSug.placeholder = "0,00 €";
      inpSug.autocomplete = "off";

      inpSug.addEventListener("focus", () => {
        if (inpSug.value) inpSug.select();
      });

      inpSug.addEventListener("blur", () => {
        const raw = inpSug.value.trim();
        if (!raw) {
          objetivos = objetivos.map((o) =>
            o.id === g.id ? { ...o, sugerido: 0 } : o
          );
          saveLocalObjetivos();
          renderObjetivos();
          return;
        }
        const val = esToNumberLocal(raw);
        const restoDisp = getTotalDisponible();
        let ajustado = val;
        if (ajustado < 0) ajustado = 0;
        if (ajustado > restoDisp) ajustado = restoDisp;

        objetivos = objetivos.map((o) =>
          o.id === g.id ? { ...o, sugerido: ajustado } : o
        );
        saveLocalObjetivos();
        renderObjetivos();
      });

      contSug.append(inpSug);
      rowSugerido.append(lblSug, contSug);

      const rowOrigen = document.createElement("div");
      rowOrigen.className = "objetivo-row origen-row";
      const origenTexto = (g.origen && g.origen.length
        ? g.origen
        : selectedOrigen
      ).join(", ");
      rowOrigen.innerHTML = `<span>Desde</span><span>${origenTexto || "Todas"}</span>`;

      const rowPrioridad = document.createElement("div");
      rowPrioridad.className = "objetivo-row prioridad-row";
      rowPrioridad.innerHTML =
        `<span>Prioridad</span><span>${g.prioridad || 1}</span>`;

      body.append(
        rowObjetivo,
        rowAportado,
        rowRestante,
        rowSugerido,
        rowOrigen,
        rowPrioridad
      );

      const footer = document.createElement("div");
      footer.className = "objetivo-footer";

      const infoDisp = document.createElement("div");
      infoDisp.className = "objetivo-disponible";
      infoDisp.textContent = `Fondos disponibles: ${numberToEsLocal(
        totalDisponible
      )}`;

      footer.append(infoDisp);

      const main = document.createElement("div");
      main.className = "objetivo-main";
      main.append(header, ringWrap, body, footer);

      const menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "dots-btn";
      menuBtn.textContent = "⋮";
      menuBtn.title = "Editar objetivo";

      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openModalObjetivo(g);
      });

      card.addEventListener("click", (e) => {
        if (e.target === menuBtn) return;
        openModalObjetivo(goal);
      });

      card.append(main, menuBtn);
      $listaObjetivos.append(card);
    });
  }

  function renderResumenTotal() {
    if (!$resumenObjetivos) return;

    const totalObjetivo = objetivos.reduce(
      (acc, g) => acc + (Number.isFinite(g.objetivo) ? g.objetivo : 0),
      0
    );
    const totalAportado = objetivos.reduce(
      (acc, g) => acc + (Number.isFinite(g.aportado) ? g.aportado : 0),
      0
    );

    const restante = Math.max(0, totalObjetivo - totalAportado);
    const pct = totalObjetivo > 0 ? totalAportado / totalObjetivo : 0;

    if ($totalObjetivos)
      $totalObjetivos.textContent = numberToEsLocal(totalObjetivo);
    if ($totalObjetivosRest)
      $totalObjetivosRest.textContent = numberToEsLocal(restante);
    if ($totalObjetivosPct)
      $totalObjetivosPct.textContent = pctToEsLocal(pct);

    if ($ringTotalObjetivos) {
      const pctClamp = Math.max(0, Math.min(1, pct));
      $ringTotalObjetivos.style.setProperty(
        "--ring-progress",
        String(pctClamp)
      );
    }
  }

  function syncCloud() {
    const uid = getUid();
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
    const uid = getUid();
    if (!window.firebase || !uid) return;

    if (objetivosRef){
      try{
        objetivosRef.off();
      }catch(e){
        console.error(e);
      }
    }

    objetivosRef = firebase
      .database()
      .ref(`/users/${uid}/finanzas/objetivos`);
    objetivosRef.on("value", (snap) => {
      const v = snap.val();
      if (!v || !Array.isArray(v.objetivos)) return;
      objetivos = v.objetivos;
      saveLocalObjetivos();
      renderObjetivos();
    });
  }

  // ---- Init ----
  (function init() {
    loadLocalObjetivos();
    loadCuentasLocal();
    loadSelectedOrigen();
    renderObjetivos();
    attachCloud();
  })();

  if (typeof window !== "undefined"){
    window.addEventListener("finanzas-login", function(){
      attachCloud();
    });
  }
})();
