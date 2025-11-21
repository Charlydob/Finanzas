(function(){
  // ---- Claves y utils locales ----
  const KEY_UID    = "mis_cuentas_uid";
  const KEY_DATA   = "mis_cuentas_fase1_data";
  const KEY_GASTOS = "mis_cuentas_fase1_gastos";

  const DEFAULT_GASTOS = {
    ingresosMensuales: 0,
    ingresosFijos   : [],
    gastosFijos     : [],
    historial       : []
  };

  function esToNumberLocal(s){
    if (s == null) return 0;
    if (typeof s === "number") return s;
    s = String(s).replace(/\s/g,"").replace("€","").replace(/\./g,"").replace(",", ".");

    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function numberToEsLocal(n, opts){
    return new Intl.NumberFormat("es-ES", opts||{style:"currency",currency:"EUR"}).format(n);
  }

  function pctToEsLocal(n){
    return new Intl.NumberFormat("es-ES",{style:"percent",maximumFractionDigits:2}).format(n);
  }

  // ---- Estado local ----
  let uid      = localStorage.getItem(KEY_UID) || null;
  let gastos   = null;
  let registrosCtas = [];

  function loadLocalGastos(){
    try{
      const raw = localStorage.getItem(KEY_GASTOS);
      gastos = raw ? (JSON.parse(raw) || null) : null;
    }catch(e){
      console.error("[GASTOS] loadLocalGastos ERROR", e);
      gastos = null;
    }
    if (!gastos || typeof gastos !== "object"){
      gastos = JSON.parse(JSON.stringify(DEFAULT_GASTOS));
    }
  }

  function saveLocalGastos(){
    try{
      localStorage.setItem(KEY_GASTOS, JSON.stringify(gastos || DEFAULT_GASTOS));
    }catch(e){
      console.error("[GASTOS] saveLocalGastos ERROR", e);
    }
  }

  function ensureGastosState(){
    if (!gastos || typeof gastos !== "object"){
      gastos = JSON.parse(JSON.stringify(DEFAULT_GASTOS));
    }
    if (!Array.isArray(gastos.gastosFijos))   gastos.gastosFijos   = [];
    if (!Array.isArray(gastos.ingresosFijos)) gastos.ingresosFijos = [];
    if (!Array.isArray(gastos.historial))     gastos.historial     = [];
    if (typeof gastos.ingresosMensuales !== "number"){
      gastos.ingresosMensuales = esToNumberLocal(gastos.ingresosMensuales);
    }
    if (!Number.isFinite(gastos.ingresosMensuales)){
      gastos.ingresosMensuales = 0;
    }
  }

  function loadRegistrosLocal(){
    try{
      const raw = localStorage.getItem(KEY_DATA);
      registrosCtas = raw ? (JSON.parse(raw) || []) : [];
    }catch(e){
      console.error("[GASTOS] loadRegistrosLocal ERROR", e);
      registrosCtas = [];
    }
  }

  function getSortedRegistrosLocal(){
    const regs = Array.isArray(registrosCtas) ? registrosCtas.slice() : [];
    regs.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
    return regs;
  }

  // ---- DOM pestaña Finanzas/Gastos ----
  const $gBalanceFinal       = document.getElementById("g-balance-final");
  const $gBalanceDetalle     = document.getElementById("g-balance-detalle");
  const $gBarIngresos        = document.getElementById("g-bar-ingresos");
  const $gBarGastos          = document.getElementById("g-bar-gastos");
  const $gLabelIngresos      = document.getElementById("g-label-ingresos");
  const $gLabelGastos        = document.getElementById("g-label-gastos");
  const $gSemiCanvas         = document.getElementById("g-semicircle");
  const $gSemiIngresos       = document.getElementById("g-semi-ingresos");
  const $gSemiGastos         = document.getElementById("g-semi-gastos");
  const $gSemiResto          = document.getElementById("g-semi-resto");
  const $gInputIngresos      = document.getElementById("g-input-ingresos");
  const $gBtnIngresosGuardar = document.getElementById("g-btn-ingresos-guardar");
  const $gKpiComprometido    = document.getElementById("g-kpi-comprometido");
  const $gKpiEsencial        = document.getElementById("g-kpi-esencial");
  const $gBtnNuevoGasto      = document.getElementById("g-btn-nuevo-gasto");
  const $gBtnCerrarMes       = document.getElementById("g-btn-cerrar-mes");
  const $gCategoriasChips    = document.getElementById("g-categorias-chips");
  const $gastosListBody      = document.getElementById("gastos-list-body");
  const $gHistorialList      = document.getElementById("g-historial-list");

  if (!$gBalanceFinal){
    // La página no tiene pestaña Finanzas, no hacemos nada.
    return;
  }

  // ---- Lógica de cálculo ----
  function computeGastoVariableMesActual(){
    loadRegistrosLocal();
    if (!registrosCtas.length) return { claveMes:null, gastoVariable:0 };

    const regs = getSortedRegistrosLocal();
    const lastReg = regs[regs.length - 1];
    const lastDate = new Date(lastReg.fecha);
    if (!lastDate || isNaN(lastDate.getTime())){
      return { claveMes:null, gastoVariable:0 };
    }

    const mesKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth()+1).padStart(2,"0")}`;

    let firstRegMes = null;
    let lastRegMes  = null;

    for (const r of regs){
      const d = new Date(r.fecha);
      if (!d || isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (key === mesKey){
        if (!firstRegMes) firstRegMes = r;
        lastRegMes = r;
      }
    }

    if (!firstRegMes || !lastRegMes){
      return { claveMes:mesKey, gastoVariable:0 };
    }

    const baseTotal = Number.isFinite(firstRegMes.total) ? firstRegMes.total : 0;
    const lastTotal = Number.isFinite(lastRegMes.total) ? lastRegMes.total : 0;
    const diffTotal = lastTotal - baseTotal;
    const gastoVar  = diffTotal < 0 ? -diffTotal : 0;

    return { claveMes:mesKey, gastoVariable:gastoVar };
  }

  function computeGastosMetrics(){
    ensureGastosState();
    const g = gastos;

    // ingresos desde lista de ingresos fijos; si no hay, usar ingresosMensuales
    let ingresos = 0;
    let ingresosFijosTotal = 0;

    if (Array.isArray(g.ingresosFijos) && g.ingresosFijos.length){
      g.ingresosFijos.forEach(item => {
        ingresosFijosTotal += esToNumberLocal(item.importe);
      });
      ingresos = ingresosFijosTotal;
    } else {
      ingresos = Number.isFinite(g.ingresosMensuales)
        ? g.ingresosMensuales
        : esToNumberLocal(g.ingresosMensuales);
    }

    let gastosFijos    = 0;
    let esenciales     = 0;
    let prescindibles  = 0;

    if (Array.isArray(g.gastosFijos)){
      g.gastosFijos.forEach(item => {
        const imp = esToNumberLocal(item.importe);
        gastosFijos += imp;
        if (item.esencial){
          esenciales += imp;
        } else {
          prescindibles += imp;
        }
      });
    }

    const { claveMes, gastoVariable } = computeGastoVariableMesActual();
    const gastosTotales = gastosFijos + gastoVariable;
    const saldoFinal    = ingresos - gastosTotales;

    const pctComprometido = ingresos > 0 ? (gastosFijos / ingresos) : 0;
    const totalEsencial   = esenciales + prescindibles;
    const pctEsencial     = totalEsencial > 0 ? (esenciales / totalEsencial) : 0;

    return {
      claveMes,
      ingresos,
      gastosFijos,
      gastoVariable,
      gastosTotales,
      saldoFinal,
      pctComprometido,
      pctEsencial
    };
  }

  function drawGastosSemicircle(ingresos, gastosTotales){
    if (!$gSemiCanvas) return;
    const canvas = $gSemiCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const radius = Math.min(w, h * 2) / 2 - 6;
    const cy = h - 4;

    ctx.lineCap = "round";
    ctx.lineWidth = 6;

    // pista base gris
    ctx.strokeStyle = "rgba(30,41,59,0.7)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 0, false);
    ctx.stroke();

    // nada
    if (ingresos <= 0 && gastosTotales <= 0){
      return;
    }

    // solo gastos, sin ingresos -> todo rojo
    if (ingresos <= 0 && gastosTotales > 0){
      ctx.strokeStyle = "rgba(248,113,113,0.95)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.PI, 0, false);
      ctx.stroke();
      return;
    }

    // ingresos > 0
    let ratio = gastosTotales / ingresos;
    if (!Number.isFinite(ratio)) ratio = 0;
    ratio = Math.max(0, ratio);

    // si gasta >= 100% -> todo rojo
    if (ratio >= 1){
      ctx.strokeStyle = "rgba(248,113,113,0.95)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, Math.PI, 0, false);
      ctx.stroke();
      return;
    }

    // parte verde (lo que queda), parte roja (lo gastado)
    const greenShare = 1 - ratio;
    const redShare   = ratio;

    const greenAngle = Math.PI * greenShare;
    const redAngle   = Math.PI * redShare;

    // verde desde la izquierda hacia donde termina el verde
    ctx.strokeStyle = "rgba(34,197,94,0.95)";
    ctx.beginPath();
ctx.arc(cx, cy, radius, Math.PI, Math.PI + greenAngle, false);
    ctx.stroke();

    // rojo desde el fin del verde hasta la derecha
    ctx.strokeStyle = "rgba(248,113,113,0.95)";
    ctx.beginPath();
ctx.arc(cx, cy, radius, Math.PI + greenAngle, 0, false);
    ctx.stroke();
  }

  // ---- Ingresos fijos (lista) ----
  function handleIngresoMenu(idx){
    ensureGastosState();
    if (!Array.isArray(gastos.ingresosFijos)) gastos.ingresosFijos = [];
    const item = gastos.ingresosFijos[idx];
    if (!item) return;

    const action = window.prompt("Escribe 1 para editar o 2 para eliminar este ingreso", "1");
    if (action === "2"){
      if (!window.confirm("¿Eliminar este ingreso fijo?")) return;
      gastos.ingresosFijos.splice(idx,1);
      saveLocalGastos();
      syncGastosToCloud();
      renderGastosPanel();
      return;
    }
    if (action !== "1") return;

    const nombre = window.prompt("Nombre del ingreso", item.nombre || "") || item.nombre;
    const importeStr = window.prompt("Importe mensual (€)", String(item.importe || "")) || item.importe;

    item.nombre  = nombre;
    item.importe = esToNumberLocal(importeStr);

    saveLocalGastos();
    syncGastosToCloud();
    renderGastosPanel();
  }

  function renderIngresosList(){
    if (!$gCategoriasChips) return;
    ensureGastosState();

    const items = Array.isArray(gastos.ingresosFijos) ? gastos.ingresosFijos : [];

    $gCategoriasChips.innerHTML = "";

    if (!items.length){
      const span = document.createElement("span");
      span.className = "muted";
      span.textContent = "Aún no has añadido ingresos fijos.";
      $gCategoriasChips.appendChild(span);
      return;
    }

    items.forEach((item, idx) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ingreso-chip";
      chip.textContent = `${item.nombre || ("Ingreso " + (idx+1))} · ${numberToEsLocal(esToNumberLocal(item.importe))}`;
      chip.addEventListener("click", () => {
        handleIngresoMenu(idx);
      });
      $gCategoriasChips.appendChild(chip);
    });
  }

  // ---- Render principal ----
  function renderGastosList(){
    if (!$gastosListBody) return;
    ensureGastosState();
    const items = Array.isArray(gastos.gastosFijos) ? gastos.gastosFijos : [];

    if (!items.length){
      $gastosListBody.classList.add("muted");
      $gastosListBody.textContent = "Aún no has añadido ningún gasto fijo.";
      return;
    }

    $gastosListBody.classList.remove("muted");
    $gastosListBody.innerHTML = "";

    items.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "gasto-item";

      const main = document.createElement("div");
      main.className = "gasto-main";

      const titleLine = document.createElement("div");
      titleLine.className = "gasto-title-line";

      const nameSpan = document.createElement("span");
      nameSpan.className = "gasto-nombre";
      nameSpan.textContent = item.nombre || `Gasto ${idx+1}`;
      titleLine.appendChild(nameSpan);

      if (item.categoria){
        const cat = document.createElement("span");
        cat.className = "gasto-categoria";
        cat.textContent = item.categoria;
        titleLine.appendChild(cat);
      }

      if (item.esencial){
        const tag = document.createElement("span");
        tag.className = "gasto-esencial";
        tag.textContent = "Esencial";
        titleLine.appendChild(tag);
      }

      main.appendChild(titleLine);
      row.appendChild(main);

      const importeSpan = document.createElement("div");
      importeSpan.className = "gasto-importe";
      importeSpan.textContent = numberToEsLocal(esToNumberLocal(item.importe));
      row.appendChild(importeSpan);

      const menuBtn = document.createElement("button");
      menuBtn.className = "gasto-menu-btn";
      menuBtn.type = "button";
      menuBtn.textContent = "⋯";
      menuBtn.addEventListener("click", () => {
        handleGastoMenu(idx);
      });
      row.appendChild(menuBtn);

      $gastosListBody.appendChild(row);
    });
  }

  function handleGastoMenu(idx){
    ensureGastosState();
    const item = gastos.gastosFijos[idx];
    if (!item) return;

    const action = window.prompt("Escribe 1 para editar o 2 para eliminar", "1");
    if (action === "2"){
      if (!window.confirm("¿Eliminar este gasto fijo?")) return;
      gastos.gastosFijos.splice(idx,1);
      saveLocalGastos();
      renderGastosPanel();
      syncGastosToCloud();
      return;
    }
    if (action !== "1") return;

    const nombre = window.prompt("Nombre del gasto", item.nombre || "") || item.nombre;
    const importeStr = window.prompt("Importe mensual (€)", String(item.importe || "")) || item.importe;
    const categoria = window.prompt("Categoría (ej: piso, comida…)", item.categoria || "") || item.categoria;
    const esencialStr = window.prompt("¿Es esencial? (s/n)", item.esencial ? "s" : "n");
    const esencial = String(esencialStr || "").toLowerCase().startsWith("s");

    item.nombre     = nombre;
    item.importe    = esToNumberLocal(importeStr);
    item.categoria  = categoria;
    item.esencial   = esencial;

    saveLocalGastos();
    renderGastosPanel();
    syncGastosToCloud();
  }

  function renderGastosHistorial(){
    if (!$gHistorialList) return;
    ensureGastosState();
    const hist = Array.isArray(gastos.historial) ? [...gastos.historial] : [];

    if (!hist.length){
      $gHistorialList.classList.add("muted");
      $gHistorialList.textContent = "Sin datos todavía.";
      return;
    }

    $gHistorialList.classList.remove("muted");
    $gHistorialList.innerHTML = "";

    hist.sort((a,b) => String(a.mes || "").localeCompare(String(b.mes || "")));

    let bestIdx = -1;
    let worstIdx = -1;
    let bestSaldo = -Infinity;
    let worstSaldo = Infinity;

    hist.forEach((row, idx) => {
      const saldo = Number(row.saldoFinal) || 0;
      if (saldo > bestSaldo){
        bestSaldo = saldo;
        bestIdx = idx;
      }
      if (saldo < worstSaldo){
        worstSaldo = saldo;
        worstIdx = idx;
      }
    });

    hist.forEach((row, idx) => {
      const el = document.createElement("div");
      const positivo = (row.saldoFinal || 0) >= 0;
      el.className = "g-hist-item " + (positivo ? "g-hist-item--positivo" : "g-hist-item--negativo");

      const main = document.createElement("div");
      main.className = "g-hist-main";

      const topLine = document.createElement("div");
      topLine.className = "g-hist-mes";
      topLine.textContent = row.mes || "";

      if (idx === bestIdx){
        const badge = document.createElement("span");
        badge.className = "g-hist-badge";
        badge.textContent = "🥇 Mejor mes";
        topLine.appendChild(badge);
      } else if (idx === worstIdx){
        const badge = document.createElement("span");
        badge.className = "g-hist-badge";
        badge.textContent = "💀 Peor mes";
        topLine.appendChild(badge);
      }

      main.appendChild(topLine);

      const detalle = document.createElement("div");
      detalle.className = "g-hist-detalle";
      const pctAhorro = Number(row.pctAhorro) || 0;
      detalle.textContent =
        `Ing: ${numberToEsLocal(row.ingresos || 0)} · Gastos: ${numberToEsLocal(row.gastosTotales || 0)} · Ahorro: ${pctToEsLocal(pctAhorro)}`;
      main.appendChild(detalle);

      const saldoEl = document.createElement("div");
      saldoEl.className = "g-hist-saldo";
      saldoEl.textContent = numberToEsLocal(row.saldoFinal || 0);

      el.appendChild(main);
      el.appendChild(saldoEl);

      $gHistorialList.appendChild(el);
    });
  }

  function renderGastosPanel(){
    ensureGastosState();

    const m = computeGastosMetrics();
    const {
      ingresos,
      gastosFijos,
      gastoVariable,
      gastosTotales,
      saldoFinal,
      pctComprometido,
      pctEsencial
    } = m;

    if ($gInputIngresos){
      $gInputIngresos.value = ingresos > 0 ? numberToEsLocal(ingresos) : "";
    }

    $gBalanceFinal.textContent = numberToEsLocal(saldoFinal);
    $gBalanceFinal.classList.toggle("g-balance-final--negativo", saldoFinal < 0);
    $gBalanceFinal.classList.toggle("g-balance-final--positivo", saldoFinal > 0);

    if ($gBalanceDetalle){
      $gBalanceDetalle.textContent =
        `Ing: ${numberToEsLocal(ingresos)} · Gastos fijos: ${numberToEsLocal(gastosFijos)} · Gasto variable: ${numberToEsLocal(gastoVariable)}`;
    }

    if ($gLabelIngresos) $gLabelIngresos.textContent = numberToEsLocal(ingresos);
    if ($gLabelGastos)   $gLabelGastos.textContent   = numberToEsLocal(gastosFijos);

    if ($gBarIngresos && $gBarGastos){
      const maxVal = Math.max(ingresos, gastosFijos, 0);
      const wIng = maxVal > 0 && ingresos > 0 ? Math.max(8, ingresos/maxVal * 100) : 0;
      const wGas = maxVal > 0 && gastosFijos > 0 ? Math.max(8, gastosFijos/maxVal * 100) : 0;
      $gBarIngresos.style.width = wIng + "%";
      $gBarGastos.style.width   = wGas + "%";
    }

    if ($gSemiIngresos) $gSemiIngresos.textContent = numberToEsLocal(ingresos);
    if ($gSemiGastos)   $gSemiGastos.textContent   = numberToEsLocal(gastosTotales);
    if ($gSemiResto){
      $gSemiResto.textContent = numberToEsLocal(saldoFinal);
      const parent = $gSemiResto.parentElement;
      if (parent){
        if (saldoFinal < 0) parent.classList.add("negativo");
        else parent.classList.remove("negativo");
      }
    }

    drawGastosSemicircle(ingresos, gastosTotales);

    if ($gKpiComprometido){
      const pct = pctComprometido || 0;
      $gKpiComprometido.textContent =
        `${pctToEsLocal(pct)} de tus ingresos está comprometido en gastos fijos.`;
    }

    if ($gKpiEsencial){
      const pctE = pctEsencial || 0;
      const pctP = 1 - pctE;
      $gKpiEsencial.textContent =
        `Esencial: ${pctToEsLocal(pctE)} · Prescindible: ${pctToEsLocal(pctP)}.`;
    }

    renderIngresosList();
    renderGastosList();
    renderGastosHistorial();
  }

  // ---- Cloud sólo de gastos ----
  let cloudRef = null;

  function syncGastosToCloud(){
    if (!window.firebase || !uid) return;
    try{
      firebase
        .database()
        .ref(`/users/${uid}/finanzas/fase1/gastos`)
        .set(gastos)
        .catch(console.error);
    }catch(e){
      console.error("[GASTOS] syncGastosToCloud ERROR", e);
    }
  }

  function attachGastosCloud(){
    if (!window.firebase || !uid) return;

    if (cloudRef){
      try{ cloudRef.off(); }catch(e){ console.error(e); }
    }

    const path = `/users/${uid}/finanzas/fase1/gastos`;
    cloudRef = firebase.database().ref(path);

    cloudRef.on("value", snap => {
      const v = snap.val();
      if (!v || typeof v !== "object") return;

      gastos = {
        ...JSON.parse(JSON.stringify(DEFAULT_GASTOS)),
        ...v
      };

      saveLocalGastos();
      renderGastosPanel();
    });
  }

  // ---- Handlers de UI ----
  function onGuardarIngresosMensuales(){
    ensureGastosState();

    const nombre = window.prompt("Nombre del ingreso fijo (ej: nómina, extra…)", "");
    if (!nombre) return;

    const importeStr = window.prompt("Importe mensual (€)", "0");
    const importe = esToNumberLocal(importeStr);
    if (!importe) return;

    if (!Array.isArray(gastos.ingresosFijos)){
      gastos.ingresosFijos = [];
    }

    gastos.ingresosFijos.push({
      id     : Date.now(),
      nombre : nombre,
      importe: importe
    });

    // pasamos a usar solo la lista de ingresos
    gastos.ingresosMensuales = 0;

    if ($gInputIngresos){
      $gInputIngresos.value = "";
    }

    saveLocalGastos();
    syncGastosToCloud();
    renderGastosPanel();
  }

  function onNuevoGastoFijo(){
    ensureGastosState();

    const nombre = window.prompt("Nombre del gasto fijo (ej: alquiler, luz…)", "");
    if (!nombre) return;
    const importeStr = window.prompt("Importe mensual (€)", "0");
    const importe = esToNumberLocal(importeStr);
    if (!importe) return;

    const categoria = window.prompt("Categoría (comida, piso, capricho…)", "");
    const esencialStr = window.prompt("¿Es esencial? (s/n)", "s");
    const esencial = String(esencialStr || "").toLowerCase().startsWith("s");

    gastos.gastosFijos.push({
      id: Date.now(),
      nombre,
      importe,
      categoria,
      esencial
    });

    saveLocalGastos();
    syncGastosToCloud();
    renderGastosPanel();
  }

  function onRegistrarMesGastos(){
    ensureGastosState();
    const m = computeGastosMetrics();
    const {
      claveMes,
      ingresos,
      gastosFijos,
      gastoVariable,
      gastosTotales,
      saldoFinal
    } = m;

    if (!claveMes){
      alert("No hay suficientes registros para este mes.");
      return;
    }

    const ok = window.confirm(`Registrar el mes ${claveMes} con saldo final ${numberToEsLocal(saldoFinal)}?`);
    if (!ok) return;

    const pctAhorro = ingresos > 0 ? (saldoFinal / ingresos) : 0;

    if (!Array.isArray(gastos.historial)){
      gastos.historial = [];
    }

    const idx = gastos.historial.findIndex(row => row.mes === claveMes);
    const row = { mes:claveMes, ingresos, gastosFijos, gastoVariable, gastosTotales, saldoFinal, pctAhorro };

    if (idx >= 0){
      gastos.historial[idx] = row;
    } else {
      gastos.historial.push(row);
    }

    saveLocalGastos();
    syncGastosToCloud();
    renderGastosPanel();
  }

  // ---- Init ----
  function initFinanzas(){
    loadLocalGastos();
    ensureGastosState();
    loadRegistrosLocal();
    renderGastosPanel();

    if ($gBtnIngresosGuardar){
      $gBtnIngresosGuardar.addEventListener("click", onGuardarIngresosMensuales);
    }
    if ($gInputIngresos){
      $gInputIngresos.addEventListener("change", onGuardarIngresosMensuales);
    }
    if ($gBtnNuevoGasto){
      $gBtnNuevoGasto.addEventListener("click", onNuevoGastoFijo);
    }
    if ($gBtnCerrarMes){
      $gBtnCerrarMes.addEventListener("click", onRegistrarMesGastos);
    }

    if (uid && window.firebase){
      attachGastosCloud();
    }

    // escuchar login de app.js
    if (typeof window !== "undefined" && typeof window.addEventListener === "function"){
      window.addEventListener("finanzas-login", (ev) => {
        uid = ev.detail && ev.detail.uid ? ev.detail.uid : null;
        if (uid && window.firebase){
          attachGastosCloud();
        }
      });
    }

    // exponer para que app.js pueda llamar al cambiar de pestaña
    if (typeof window !== "undefined"){
      window.renderGastosPanel = renderGastosPanel;
    }
  }

  initFinanzas();
})();
