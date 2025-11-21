// finanzas.js
// Ajusta estos IDs a tu HTML real:
const ID_BTN_ADD_GASTO_VAR   = "btn-add-gasto-variable";
const ID_BTN_ADD_INGRESO     = "btn-add-ingreso";
const ID_MODAL_GASTO_VAR     = "modal-gasto-variable";
const ID_MODAL_INGRESO       = "modal-ingreso";
const ID_FORM_GASTO_VAR      = "form-gasto-variable";
const ID_FORM_INGRESO        = "form-ingreso";
const ID_LIST_GASTOS_VAR     = "lista-gastos-variables";
const ID_LIST_INGRESOS       = "lista-ingresos";
const ID_DONUT               = "finanzas-donut";
const ID_TOTAL_INGRESOS_TXT  = "finanzas-total-ingresos";
const ID_TOTAL_GASTOS_TXT    = "finanzas-total-gastos";
const ID_TOTAL_SALDO_TXT     = "finanzas-total-saldo";
const ID_SELECTOR_CUENTAS    = "finanzas-cuentas-variables";

(function(){
  const STORAGE_KEY = "mis_cuentas_finanzas_v1";

  let state = {
    ingresos: [],          // { id, nombre, cantidad }
    gastosVariables: [],   // { id, nombre, cantidad, cuentaId|null }
    cuentasVariables: []   // [idCuenta,...] usadas para sumatorio de gastos variables
  };

  // --------- Utils ---------
  function uuid(){
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function esToNumber(v){
    if (typeof v === "number") return v;
    if (v == null) return 0;
    v = String(v).replace(/\s/g,"").replace("€","").replace(/\./g,"").replace(",",".");
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  function numberToEs(n){
    const opts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return n.toLocaleString("es-ES", opts);
  }

  function $(id){
    return document.getElementById(id);
  }

  // --------- Storage ---------
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object"){
        state = Object.assign(state, parsed);
      }
    } catch(e){
      console.error("FINANZAS loadState error", e);
    }
  }

  function saveState(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e){
      console.error("FINANZAS saveState error", e);
    }
  }

  // --------- Selector de cuentas para gastos variables ---------
  function getCuentasFromGlobal(){
    // si tu app expone las cuentas en algún global, engánchalo aquí:
    // intenta varias opciones para minimizar cambios en app.js
    if (window.misCuentasState && Array.isArray(window.misCuentasState.cuentas)){
      return window.misCuentasState.cuentas;
    }
    if (window.appState && Array.isArray(window.appState.cuentas)){
      return window.appState.cuentas;
    }
    if (Array.isArray(window.cuentas)){
      return window.cuentas;
    }
    return [];
  }

  function renderSelectorCuentas(){
    const cont = $(ID_SELECTOR_CUENTAS);
    if (!cont) return;

    const cuentas = getCuentasFromGlobal();
    cont.innerHTML = "";

    if (!cuentas.length){
      const span = document.createElement("span");
      span.className = "finanzas-cuentas-empty";
      span.textContent = "Sin cuentas cargadas";
      cont.appendChild(span);
      return;
    }

    cuentas.forEach(cta => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "finanzas-chip-cuenta";
      btn.dataset.idCuenta = cta.id || cta.uid || cta.nombre;

      const name = cta.alias || cta.nombreCorto || cta.nombre || "Cuenta";
      btn.textContent = name;

      if (state.cuentasVariables.includes(btn.dataset.idCuenta)){
        btn.classList.add("is-active");
      }

      btn.addEventListener("click", () => {
        toggleCuentaVariable(btn.dataset.idCuenta);
        btn.classList.toggle("is-active");
        saveState();
        renderResumen();
      });

      cont.appendChild(btn);
    });

    // botón para seleccionar todas
    const btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "finanzas-chip-cuenta finanzas-chip-todas";
    btnAll.textContent = "Todas";
    btnAll.addEventListener("click", () => {
      const cuentasIds = getCuentasFromGlobal().map(c => c.id || c.uid || c.nombre);
      state.cuentasVariables = cuentasIds.slice();
      saveState();
      renderSelectorCuentas();
      renderResumen();
    });
    cont.appendChild(btnAll);
  }

  function toggleCuentaVariable(idCuenta){
    const idx = state.cuentasVariables.indexOf(idCuenta);
    if (idx === -1){
      state.cuentasVariables.push(idCuenta);
    } else {
      state.cuentasVariables.splice(idx, 1);
    }
  }

  // --------- CRUD Ingresos / Gastos variables ---------
  function addIngreso(nombre, cantidad){
    state.ingresos.push({
      id: uuid(),
      nombre: nombre || "Ingreso",
      cantidad: esToNumber(cantidad)
    });
    saveState();
    renderListIngresos();
    renderResumen();
  }

  function addGastoVariable(nombre, cantidad, cuentaId){
    state.gastosVariables.push({
      id: uuid(),
      nombre: nombre || "Gasto",
      cantidad: esToNumber(cantidad),
      cuentaId: cuentaId || null
    });
    saveState();
    renderListGastos();
    renderResumen();
  }

  function deleteIngreso(id){
    state.ingresos = state.ingresos.filter(r => r.id !== id);
    saveState();
    renderListIngresos();
    renderResumen();
  }

  function deleteGasto(id){
    state.gastosVariables = state.gastosVariables.filter(r => r.id !== id);
    saveState();
    renderListGastos();
    renderResumen();
  }

  function renderListIngresos(){
    const list = $(ID_LIST_INGRESOS);
    if (!list) return;
    list.innerHTML = "";

    if (!state.ingresos.length){
      const li = document.createElement("li");
      li.className = "finanzas-empty";
      li.textContent = "Sin ingresos";
      list.appendChild(li);
      return;
    }

    state.ingresos.forEach(item => {
      const li = document.createElement("li");
      li.className = "finanzas-item";

      const left = document.createElement("div");
      left.className = "finanzas-item-main";
      left.textContent = item.nombre;

      const right = document.createElement("div");
      right.className = "finanzas-item-amount";
      right.textContent = numberToEs(item.cantidad) + " €";

      const del = document.createElement("button");
      del.type = "button";
      del.className = "finanzas-item-delete";
      del.textContent = "×";
      del.addEventListener("click", () => deleteIngreso(item.id));

      li.appendChild(left);
      li.appendChild(right);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function renderListGastos(){
    const list = $(ID_LIST_GASTOS_VAR);
    if (!list) return;
    list.innerHTML = "";

    if (!state.gastosVariables.length){
      const li = document.createElement("li");
      li.className = "finanzas-empty";
      li.textContent = "Sin gastos variables";
      list.appendChild(li);
      return;
    }

    state.gastosVariables.forEach(item => {
      const li = document.createElement("li");
      li.className = "finanzas-item";

      const left = document.createElement("div");
      left.className = "finanzas-item-main";
      left.textContent = item.nombre;

      const meta = document.createElement("small");
      meta.className = "finanzas-item-meta";
      if (item.cuentaId){
        meta.textContent = "Cuenta: " + item.cuentaId;
        left.appendChild(meta);
      }

      const right = document.createElement("div");
      right.className = "finanzas-item-amount";
      right.textContent = numberToEs(item.cantidad) + " €";

      const del = document.createElement("button");
      del.type = "button";
      del.className = "finanzas-item-delete";
      del.textContent = "×";
      del.addEventListener("click", () => deleteGasto(item.id));

      li.appendChild(left);
      li.appendChild(right);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  // --------- Resumen + donut ---------
  function getTotales(){
    const totalIngresos = state.ingresos.reduce((acc, r) => acc + (r.cantidad || 0), 0);

    // si hay cuentas seleccionadas, filtramos por cuentaId; si no, todos
    const cuentasFiltradas = state.cuentasVariables.length
      ? state.cuentasVariables
      : null;

    const totalGastos = state.gastosVariables.reduce((acc, r) => {
      if (cuentasFiltradas && r.cuentaId && !cuentasFiltradas.includes(r.cuentaId)){
        return acc;
      }
      return acc + (r.cantidad || 0);
    }, 0);

    return {
      ingresos: totalIngresos,
      gastos: totalGastos,
      saldo: totalIngresos - totalGastos
    };
  }

  function renderResumen(){
    const { ingresos, gastos, saldo } = getTotales();

    if ($(ID_TOTAL_INGRESOS_TXT)){
      $(ID_TOTAL_INGRESOS_TXT).textContent = numberToEs(ingresos) + " €";
    }
    if ($(ID_TOTAL_GASTOS_TXT)){
      $(ID_TOTAL_GASTOS_TXT).textContent = numberToEs(gastos) + " €";
    }
    if ($(ID_TOTAL_SALDO_TXT)){
      $(ID_TOTAL_SALDO_TXT).textContent = numberToEs(saldo) + " €";
    }

    renderDonut(ingresos, gastos);
  }

  function renderDonut(ingresos, gastos){
    const donut = $(ID_DONUT);
    if (!donut) return;

    let background;

    if (ingresos <= 0 && gastos > 0){
      // todo rojo
      background = "conic-gradient(var(--finanzas-rojo, #f44336) 0 100%)";
    } else if (ingresos <= 0 && gastos <= 0){
      // gris (nada)
      background = "conic-gradient(var(--finanzas-gris, #444) 0 100%)";
    } else {
      const pctGasto = Math.min(100, Math.max(0, Math.round((gastos / ingresos) * 100)));
      // desde arriba (0deg) en rojo lo gastado, resto azul/verde como sobrante
      background = `
        conic-gradient(
          var(--finanzas-rojo, #f44336) 0 ${pctGasto}%,
          var(--finanzas-verde, #42a5f5) ${pctGasto}% 100%
        )
      `;
      donut.dataset.pctGasto = pctGasto;
    }

    donut.style.background = background;
  }

  // --------- Modales (ingresos/gastos) ---------
  function openModal(modal){
    if (!modal) return;
    modal.classList.add("is-open");
  }

  function closeModal(modal){
    if (!modal) return;
    modal.classList.remove("is-open");
  }

  function initModales(){
    const btnGasto = $(ID_BTN_ADD_GASTO_VAR);
    const btnIngreso = $(ID_BTN_ADD_INGRESO);
    const modalGasto = $(ID_MODAL_GASTO_VAR);
    const modalIngreso = $(ID_MODAL_INGRESO);
    const formGasto = $(ID_FORM_GASTO_VAR);
    const formIngreso = $(ID_FORM_INGRESO);

    if (btnGasto && modalGasto){
      btnGasto.addEventListener("click", () => openModal(modalGasto));
    }
    if (btnIngreso && modalIngreso){
      btnIngreso.addEventListener("click", () => openModal(modalIngreso));
    }

    // cierres genéricos: elementos con data-close="modal"
    document.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches("[data-close='modal']")){
        const m = target.closest(".modal");
        if (m) closeModal(m);
      }
    });

    if (formGasto){
      formGasto.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(formGasto);
        const nombre = fd.get("nombre") || fd.get("concepto") || "";
        const cantidad = fd.get("cantidad") || fd.get("importe") || "0";
        const cuentaId = fd.get("cuentaId") || fd.get("cuenta") || "";
        addGastoVariable(String(nombre).trim(), cantidad, cuentaId ? String(cuentaId) : null);
        formGasto.reset();
        closeModal(modalGasto);
      });
    }

    if (formIngreso){
      formIngreso.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const fd = new FormData(formIngreso);
        const nombre = fd.get("nombre") || fd.get("concepto") || "";
        const cantidad = fd.get("cantidad") || fd.get("importe") || "0";
        addIngreso(String(nombre).trim(), cantidad);
        formIngreso.reset();
        closeModal(modalIngreso);
      });
    }
  }

  // --------- Init ---------
  function init(){
    loadState();
    renderSelectorCuentas();
    renderListIngresos();
    renderListGastos();
    renderResumen();
    initModales();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
