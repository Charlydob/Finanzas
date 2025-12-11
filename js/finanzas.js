(function(){
  // ---- Claves y utils locales ----
const KEY_UID    = "mis_cuentas_uid";
const KEY_DATA   = "mis_cuentas_fase1_data";
const KEY_GASTOS = "mis_cuentas_fase1_gastos";
const KEY_CUENTAS = "mis_cuentas_fase1_cuentas";
const KEY_ORIGEN  = "mis_cuentas_fase1_origen_cuentas";


  const DEFAULT_GASTOS = {
    ingresosMensuales: 0,
    ingresosFijos   : [],
    gastosFijos     : [],
    historial       : []
  };

 function esToNumberLocal(s){
  if (s == null) return 0;
  if (typeof s === "number") return s;

  let str = String(s)
    .trim()
    .replace(/\s/g, "")
    .replace(/€/g, "");

  if (!str) return 0;

  const hasComma = str.indexOf(",") !== -1;
  const hasDot   = str.indexOf(".") !== -1;

  if (hasComma && hasDot){
    // Caso tipo "1.234,56" o "1,234.56": el último símbolo es el decimal
    const lastComma = str.lastIndexOf(",");
    const lastDot   = str.lastIndexOf(".");
    const dec = lastComma > lastDot ? "," : ".";
    const other = dec === "," ? "." : ",";
    const reOther = new RegExp("\\" + other, "g");
    str = str.replace(reOther, "").replace(dec, ".");
  } else if (hasComma){
    // Estilo español simple: "123,45"
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (hasDot){
    // Estilo "123.45" (input number del navegador)
    const parts = str.split(".");
    if (parts.length > 2){
      // "1.234.56" → "1234.56"
      const frac = parts.pop();
      str = parts.join("") + "." + frac;
    }
    // si solo hay un punto, lo dejamos como decimal: "123.45"
  }

  const n = parseFloat(str);
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
let cuentasCache = [];
function getCuentaId(cta){
  if (!cta) return "";
  if (typeof cta === "string") return cta;
  return cta.id || cta.key || cta.nombre || cta.codigo || "";
}

function getCuentaNombre(cta){
  if (!cta) return "";
  if (typeof cta === "string") return cta;
  return cta.nombre || cta.alias || getCuentaId(cta);
}

function loadCuentasFromLocal(){
  // 1º: intentar usar snapshot de app.js
  if (typeof window !== "undefined" && typeof window.getFinanzasSnapshot === "function") {
    try {
      const snap = window.getFinanzasSnapshot();
      cuentasCache = Array.isArray(snap.cuentas) ? snap.cuentas.slice() : [];
      console.log("[GASTOS] loadCuentasFromLocal -> FIN_SNAPSHOT", cuentasCache.length);
      return;
    } catch (e) {
      console.error("[GASTOS] loadCuentasFromLocal FIN_SNAPSHOT ERROR", e);
    }
  }

  // Fallback: localStorage
  try{
    const raw = localStorage.getItem(KEY_CUENTAS);
    const parsed = raw ? JSON.parse(raw) : [];

    if (Array.isArray(parsed)){
      cuentasCache = parsed;
    } else if (parsed && Array.isArray(parsed.cuentas)){
      // por si estuviera guardado como {cuentas:[...]}
      cuentasCache = parsed.cuentas;
    } else {
      cuentasCache = [];
    }
  }catch(e){
    console.error("[GASTOS] loadCuentasFromLocal ERROR", e);
    cuentasCache = [];
  }
}



// cargar selección
function loadOrigenCuentas() {
  try {
    const raw = localStorage.getItem(KEY_ORIGEN_FINANZAS);
    const val = raw ? (JSON.parse(raw) || []) : [];
    return Array.isArray(val) ? val : [];
  } catch (e) {
    console.error("[GASTOS] loadOrigenCuentas ERROR", e);
    return [];
  }
}

// guardar selección
function saveOrigenCuentas(ids) {
  try {
    if (ids && ids.length) {
      localStorage.setItem(KEY_ORIGEN_FINANZAS, JSON.stringify(ids));
    } else {
      localStorage.removeItem(KEY_ORIGEN_FINANZAS);
    }
  } catch (e) {
    console.error("[GASTOS] saveOrigenCuentas ERROR", e);
  }
}

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
  if (!Array.isArray(gastos.gastosFijos))    gastos.gastosFijos    = [];
  if (!Array.isArray(gastos.ingresosFijos))  gastos.ingresosFijos  = [];
  if (!Array.isArray(gastos.historial))      gastos.historial      = [];
  if (!Array.isArray(gastos.inversionesFijas)) gastos.inversionesFijas = [];

  if (typeof gastos.ingresosMensuales !== "number"){
    gastos.ingresosMensuales = esToNumberLocal(gastos.ingresosMensuales);
  }
  if (!Number.isFinite(gastos.ingresosMensuales)){
    gastos.ingresosMensuales = 0;
  }

  if (typeof gastos.inversionMensual !== "number"){
    gastos.inversionMensual = esToNumberLocal(gastos.inversionMensual);
  }
  if (!Number.isFinite(gastos.inversionMensual)){
    gastos.inversionMensual = 0;
  }

  console.log("〽️ [INV] ensureGastosState ->", {
    inversionMensual: gastos.inversionMensual,
    inversionesFijas: gastos.inversionesFijas
  });
}



  function loadRegistrosLocal(){
    // 1º: intentar usar snapshot de app.js
    if (typeof window !== "undefined" && typeof window.getFinanzasSnapshot === "function") {
      try {
        const snap = window.getFinanzasSnapshot();
        registrosCtas = Array.isArray(snap.registros) ? snap.registros.slice() : [];
        console.log("[GASTOS] loadRegistrosLocal -> FIN_SNAPSHOT", registrosCtas.length);
        return;
      } catch (e) {
        console.error("[GASTOS] loadRegistrosLocal FIN_SNAPSHOT ERROR", e);
      }
    }

    // Fallback: localStorage
    try{
      const raw = localStorage.getItem(KEY_DATA);
      registrosCtas = raw ? (JSON.parse(raw) || []) : [];
    }catch(e){
      console.error("[GASTOS] loadRegistrosLocal ERROR", e);
      registrosCtas = [];
    }
  }



function getSortedRegistrosLocal(){
  return [...registrosCtas].sort((a,b)=>
    new Date(a.fecha) - new Date(b.fecha)
  );
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
  const $gSemiInversion      = document.getElementById("g-semi-inversion");
  const $gInputIngresos      = document.getElementById("g-input-ingresos");
  const $gInputInversion     = document.getElementById("g-input-inversion");

  const $gBtnIngresosGuardar = document.getElementById("g-btn-ingresos-guardar");
  const $gBtnInversionGuardar = document.getElementById("g-btn-inversion-guardar");
const $inversionPanel       = document.querySelector(".gastos-inversion");

  const $gKpiComprometido    = document.getElementById("g-kpi-comprometido");
  const $gKpiEsencial        = document.getElementById("g-kpi-esencial");
  const $gBtnNuevoGasto      = document.getElementById("g-btn-nuevo-gasto");
  const $gBtnCerrarMes       = document.getElementById("g-btn-cerrar-mes");
  const $gCategoriasChips    = document.getElementById("g-categorias-chips");
  const $gastosListBody      = document.getElementById("gastos-list-body");
  const $gHistorialList      = document.getElementById("g-historial-list");
  const $ingresosListBody     = document.getElementById("ingresos-list-body");
  const $btnOrigenGastoVar   = document.getElementById("g-btn-origen-cuentas");
const $lblOrigenGastoVar   = document.getElementById("g-origen-cuentas-label");


  if (!$gBalanceFinal){
    // La página no tiene pestaña Finanzas, no hacemos nada.
    return;
  }
function getTotalForRegByOrigen(reg, origenIds){
  console.log("[GASTOS] getTotalForRegByOrigen() called", {
    origenIds,
    regRaw: reg
  });

  if (!reg){
    console.log("[GASTOS] getTotalForRegByOrigen -> reg = null, devuelvo 0");
    return 0;
  }

  const useAll = !Array.isArray(origenIds) || !origenIds.length;

  if (useAll){
    const t = reg.total;
    const val = Number.isFinite(t) ? t : esToNumberLocal(t);
    console.log("[GASTOS] getTotalForRegByOrigen -> useAll, usando reg.total", {
      total: reg.total,
      val
    });
    return val;
  }

  let sum = 0;
  let hit = false;

  // caso 1: objeto de saldos por id
  if (reg.saldos && typeof reg.saldos === "object"){
    console.log("[GASTOS] getTotalForRegByOrigen -> usando reg.saldos", reg.saldos);
    origenIds.forEach(id => {
      if (!Object.prototype.hasOwnProperty.call(reg.saldos, id)) return;
      const raw = reg.saldos[id];
      const v = esToNumberLocal(raw);
      console.log("[GASTOS]   saldo por cuenta en saldos", { id, raw, v });
      if (!Number.isFinite(v)) return;
      sum += v;
      hit = true;
    });
  }
  // caso 2: array de cuentas
  else if (Array.isArray(reg.cuentas)){
    console.log("[GASTOS] getTotalForRegByOrigen -> usando reg.cuentas", reg.cuentas);
    reg.cuentas.forEach(cta => {
      const id = cta.id || cta.key || cta.nombre;
      const raw = cta.saldo ?? cta.total ?? cta.valor;
      console.log("[GASTOS]   cuenta en reg.cuentas", { cta, id, raw });

      if (!id || !origenIds.includes(id)) return;
      const v = esToNumberLocal(raw);
      console.log("[GASTOS]   cuenta seleccionada", { id, raw, v });
      if (!Number.isFinite(v)) return;
      sum += v;
      hit = true;
    });
  }else{
    console.log("[GASTOS] getTotalForRegByOrigen -> reg sin saldos ni cuentas, fallback total", reg);
  }

  if (!hit){
    const t = reg.total;
    const val = Number.isFinite(t) ? t : esToNumberLocal(t);
    console.log("[GASTOS] getTotalForRegByOrigen -> !hit, fallback total", {
      total: reg.total,
      val
    });
    return val;
  }

  console.log("[GASTOS] getTotalForRegByOrigen -> sum final", { sum });
  return sum;
}



  // ---- Lógica de cálculo ----
// Usa SIEMPRE el primer y último registro REAL del mes actual
// para las cuentas seleccionadas como "origen de gasto variable"
// Usa el primer y último dato del MES de CADA cuenta seleccionada
// y luego suma por cuentas para obtener el gasto variable.
function computeGastoVariableMesActual(){
  console.log("========== [GASTOS] computeGastoVariableMesActual() ==========");
  loadRegistrosLocal();

  const origenIds = (typeof loadOrigenCuentas === "function")
    ? loadOrigenCuentas()
    : [];

  console.log("[GASTOS] registrosCtas (raw):", registrosCtas);
  console.log("[GASTOS] origenIds seleccionadas:", origenIds);

  if (!Array.isArray(registrosCtas) || !registrosCtas.length){
    console.log("[GASTOS] No hay registrosCtas, gastoVariable = 0");
    return {
      claveMes      : null,
      gastoVariable : 0
    };
  }

  // 1) Ordenamos por fecha
  const regs = getSortedRegistrosLocal();
  console.log("[GASTOS] regs ordenados:", regs);

  const lastReg  = regs[regs.length - 1];
  const lastDate = new Date(lastReg.fecha);

  if (!lastDate || isNaN(lastDate.getTime())){
    console.log("[GASTOS] lastDate inválida, gastoVariable = 0");
    return {
      claveMes      : null,
      gastoVariable : 0
    };
  }

  const year   = lastDate.getFullYear();
  const month  = lastDate.getMonth() + 1;
  const mesKey = `${year}-${String(month).padStart(2,"0")}`;

  console.log("[GASTOS] mesKey actual =", mesKey, "(mes", month, "año", year, ")");

  // 2) Filtramos solo registros de ese mes
  const regsMes = regs.filter(r => {
    const d = new Date(r.fecha);
    if (!d || isNaN(d.getTime())) return false;
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    return k === mesKey;
  });

  console.log("[GASTOS] regsMes detectados para este mes:", regsMes);

  if (!regsMes.length){
    console.log("[GASTOS] No hay registros para este mes, gastoVariable = 0");
    return {
      claveMes      : mesKey,
      gastoVariable : 0
    };
  }

  // --- CASO SIN ORIGEN SELECCIONADO: se comporta como antes (usa total del registro) ---
  if (!Array.isArray(origenIds) || !origenIds.length){
    const firstRegMes = regsMes[0];
    const lastRegMes  = regsMes[regsMes.length - 1];

    console.log("[GASTOS] === RESUMEN REGS MES (GLOBAL) ===");
    console.log("→ Primer registro del mes:", firstRegMes.fecha, firstRegMes.saldos);
    console.log("→ Último registro del mes :", lastRegMes.fecha , lastRegMes.saldos);

    const baseTotal = getTotalForRegByOrigen(firstRegMes, []);
    const lastTotal = getTotalForRegByOrigen(lastRegMes , []);

    const diff = baseTotal - lastTotal;       // lo que "ha bajado"
    const gastoVar = diff > 0 ? diff : 0;     // si ha subido, gasto = 0

    console.log("[GASTOS] === RESULTADO FINAL (GLOBAL) ===");
    console.log("Mes:          ", mesKey);
    console.log("Saldo inicial:", baseTotal);
    console.log("Saldo final  :", lastTotal);
    console.log("Diff (ini-fin)", diff);
    console.log("Gasto var    :", gastoVar);

    return {
      claveMes      : mesKey,
      gastoVariable : gastoVar
    };
  }

  // --- CASO CON ORIGEN SELECCIONADO: primer y último dato del mes POR CUENTA ---
  const firstVals = {};
  const lastVals  = {};
  const hasFirst  = {};

  regsMes.forEach(reg => {
    const saldos = (reg && reg.saldos && typeof reg.saldos === "object")
      ? reg.saldos
      : null;
    if (!saldos) return;

    origenIds.forEach(id => {
      if (!Object.prototype.hasOwnProperty.call(saldos, id)) return;

      const raw = saldos[id];
      const v   = esToNumberLocal(raw);
      if (!Number.isFinite(v)) return;

      if (!hasFirst[id]){
        firstVals[id] = v;   // primer dato del mes para esa cuenta
        hasFirst[id]  = true;
      }
      // este se machaca y se queda SIEMPRE con el último visto en el mes
      lastVals[id] = v;
    });
  });

  console.log("[GASTOS] firstVals por cuenta:", firstVals);
  console.log("[GASTOS] lastVals  por cuenta:", lastVals);

  let baseTotal = 0;
  let lastTotal = 0;

  origenIds.forEach(id => {
    if (!hasFirst[id]) return; // esta cuenta no tiene datos en el mes

    const ini = Number(firstVals[id]) || 0;
    const fin = Number(
      Object.prototype.hasOwnProperty.call(lastVals, id)
        ? lastVals[id]
        : firstVals[id] // por si sólo hay un dato en todo el mes
    ) || 0;

    baseTotal += ini;
    lastTotal += fin;
  });

  const diff = baseTotal - lastTotal;       // lo que "ha bajado"
  const gastoVar = diff > 0 ? diff : 0;     // si ha subido, gasto = 0

  console.log("[GASTOS]🛑🛑 === RESULTADO FINAL (POR CUENTA) ===");
  console.log("Mes:          ", mesKey);
  console.log("Saldo inicial:", baseTotal);
  console.log("Saldo final  :", lastTotal);
  console.log("Diff (ini-fin)", diff);
  console.log("Gasto var    :", gastoVar);

  return {
    claveMes      : mesKey,
    gastoVariable : gastoVar
  };
}

function computeGastosMetrics(){
  ensureGastosState();
  const g = gastos;

  console.log("----- [GASTOS] computeGastosMetrics INICIO -----");
  console.log("[GASTOS] estado bruto de gastos:", JSON.stringify(g));

  // ingresos: lista de ingresos fijos o ingresosMensuales
  let ingresos = 0;
  let ingresosFijosTotal = 0;

  if (Array.isArray(g.ingresosFijos) && g.ingresosFijos.length){
    g.ingresosFijos.forEach(item => {
      const imp = esToNumberLocal(item.importe);
      ingresosFijosTotal += imp;
      console.log("[GASTOS] ingreso fijo item:", item, "importe num:", imp);
    });
    ingresos = ingresosFijosTotal;
  } else {
    ingresos = Number.isFinite(g.ingresosMensuales)
      ? g.ingresosMensuales
      : esToNumberLocal(g.ingresosMensuales);
  }

  console.log("[GASTOS] ingresos calculados:", {
    ingresos,
    ingresosFijosTotal,
    ingresosMensualesRaw: g.ingresosMensuales
  });

  // gastos fijos
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
      console.log("[GASTOS] gasto fijo item:", item, "importe num:", imp);
    });
  }

  console.log("[GASTOS] resumen gastos fijos:", {
    gastosFijos,
    esenciales,
    prescindibles
  });

  // gasto variable desde cuentas
  const gVarInfo = computeGastoVariableMesActual();
  console.log("[GASTOS] datos de gastoVariable desde computeGastoVariableMesActual:", gVarInfo);

  const claveMes = gVarInfo && gVarInfo.claveMes || null;
  const gVarRaw  = gVarInfo && gVarInfo.gastoVariable;
  const gastoVariable = Number.isFinite(gVarRaw) ? gVarRaw : 0;

  // 🔹 inversión: suma de inversionesFijas; si no hay, usamos inversionMensual
  let inversionTotal = 0;
  if (Array.isArray(g.inversionesFijas) && g.inversionesFijas.length){
    g.inversionesFijas.forEach(inv => {
      const imp = esToNumberLocal(inv.importe);
      inversionTotal += imp;
    });
  } else {
    inversionTotal = esToNumberLocal(g.inversionMensual);
  }

  if (!Number.isFinite(inversionTotal)) inversionTotal = 0;

  console.log("〽️ [INV] computeGastosMetrics -> inversionTotal:", inversionTotal, {
    inversionesFijas: g.inversionesFijas,
    inversionMensualRaw: g.inversionMensual
  });

  const gastosTotales = gastosFijos + gastoVariable + inversionTotal;
  const saldoFinal    = ingresos - gastosTotales;

  const pctComprometido = ingresos > 0 ? (gastosFijos / ingresos) : 0;
  const totalEsencial   = esenciales + prescindibles;
  const pctEsencial     = totalEsencial > 0 ? (esenciales / totalEsencial) : 0;

  const result = {
    claveMes,
    ingresos,
    gastosFijos,
    gastoVariable,
    inversion: inversionTotal,
    gastosTotales,
    saldoFinal,
    pctComprometido,
    pctEsencial
  };

  console.log("[GASTOS] RESUMEN FINAL:", result);
  console.log("----- [GASTOS] computeGastosMetrics FIN -----");

  return result;
}




function drawGastosSemicircle(ingresos, gastosSinInversion, inversion){
  if (!$gSemiCanvas) return;
  const canvas = $gSemiCanvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ingresos          = esToNumberLocal(ingresos);
  gastosSinInversion= esToNumberLocal(gastosSinInversion);
  inversion         = esToNumberLocal(inversion);

  const gastoReal = Math.max(0, gastosSinInversion);
  const invReal   = Math.max(0, inversion);
  const totalOut  = gastoReal + invReal;

  console.log("〽️ [INV] drawGastosSemicircle ->", {
    ingresos,
    gastoReal,
    invReal,
    totalOut
  });

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
  if (ingresos <= 0 && totalOut <= 0){
    return;
  }

  // sin ingresos pero con salidas -> todo semicírculo ocupado
  if (ingresos <= 0 && totalOut > 0){
    const remAngle = Math.PI;
    const invShare   = totalOut > 0 ? (invReal   / totalOut) : 0;
    const gastoShare = totalOut > 0 ? (gastoReal / totalOut) : 0;

    let start = Math.PI;

    const invAngle = remAngle * invShare;
    const gasAngle = remAngle * gastoShare;

    if (invAngle > 0){
      ctx.strokeStyle = "rgba(168,85,247,0.95)"; // violeta inversión
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, start + invAngle, false);
      ctx.stroke();
      start += invAngle;
    }

    if (gasAngle > 0){
      ctx.strokeStyle = "rgba(248,113,113,0.95)"; // rojo gastos
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, start + gasAngle, false);
      ctx.stroke();
    }
    return;
  }

  // ingresos > 0
  let ratioOut = totalOut / ingresos;
  if (!Number.isFinite(ratioOut)) ratioOut = 0;
  ratioOut = Math.max(0, ratioOut);

  let greenShare, invShare, gastoShare;

  if (ratioOut >= 1){
    // no queda verde, todo ocupado por inversión + gastos
    greenShare = 0;
    const sum = totalOut || 1;
    invShare   = invReal   / sum;
    gastoShare = gastoReal / sum;
  } else {
    greenShare = 1 - ratioOut;
    const outInside = ratioOut || 1;
    const invRel   = (invReal   / ingresos) / outInside;
    const gasRel   = (gastoReal / ingresos) / outInside;
    invShare   = invRel;
    gastoShare = gasRel;
  }

  const greenAngle = Math.PI * greenShare;
  const outAngle   = Math.PI - greenAngle;

  let start = Math.PI;

  // verde (lo que queda)
  if (greenAngle > 0){
    ctx.strokeStyle = "rgba(34,197,94,0.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + greenAngle, false);
    ctx.stroke();
    start += greenAngle;
  }

  // segmento de inversión (violeta)
  const invAngle = outAngle * invShare;
  if (invAngle > 0){
    ctx.strokeStyle = "rgba(168,85,247,0.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + invAngle, false);
    ctx.stroke();
    start += invAngle;
  }

  // segmento de gastos (rojo)
  const gasAngle = outAngle * gastoShare;
  if (gasAngle > 0){
    ctx.strokeStyle = "rgba(248,113,113,0.95)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + gasAngle, false);
    ctx.stroke();
  }
}



function updateOrigenLabel(){
  if (!$lblOrigenGastoVar) return;
  const origenIds = loadOrigenCuentas();
  if (!origenIds.length){
    $lblOrigenGastoVar.textContent = "Todas las cuentas";
    return;
  }

  const names = [];
  origenIds.forEach(id => {
    const cta = cuentasCache.find(c => getCuentaId(c) === id);
    if (cta){
      names.push(getCuentaNombre(cta));
    }
  });

  if (!names.length){
    $lblOrigenGastoVar.textContent = "Cuentas personalizadas";
  }else if (names.length <= 2){
    $lblOrigenGastoVar.textContent = names.join(", ");
  }else{
    $lblOrigenGastoVar.textContent = `${names[0]}, ${names[1]} (+${names.length-2})`;
  }
}


function onSelectOrigenCuentas(){
  loadCuentasFromLocal();
  const origenIds = loadOrigenCuentas();

  const { overlay, modal } = createModalBase("Cuentas para gasto variable");

  const list = document.createElement("div");
  list.className = "g-modal-list";

  if (!cuentasCache.length){
    const p = document.createElement("p");
    p.textContent = "No hay cuentas guardadas.";
    list.appendChild(p);
  }else{
    cuentasCache.forEach(cta => {
      const id   = getCuentaId(cta);
      const name = getCuentaNombre(cta);

      const row = document.createElement("label");
      row.className = "g-modal-row";

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.value = id;
      if (!origenIds.length || origenIds.includes(id)){
        chk.checked = true;
      }

      const span = document.createElement("span");
      span.textContent = name || id || "Cuenta";

      row.appendChild(chk);
      row.appendChild(span);
      list.appendChild(row);
    });
  }

  const actions = document.createElement("div");
  actions.className = "g-modal-actions";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "g-modal-btn g-modal-btn--ghost";
  btnCancel.textContent = "Cancelar";
  btnCancel.addEventListener("click", () => {
    closeModal(overlay);
  });

  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.className = "g-modal-btn g-modal-btn--primary";
  btnSave.textContent = "Guardar";
  btnSave.addEventListener("click", () => {
    const checks = list.querySelectorAll("input[type=checkbox]");
    const ids = [];
    checks.forEach(chk => {
      if (chk.checked) ids.push(chk.value);
    });
    saveOrigenCuentas(ids);
    updateOrigenLabel();
    renderGastosPanel();
    closeModal(overlay);
  });

  actions.appendChild(btnCancel);
  actions.appendChild(btnSave);

  modal.appendChild(list);
  modal.appendChild(actions);
}

  // ---- Modales simples para ingresos/gastos ----
  function createModalBase(title){
    const overlay = document.createElement("div");
    overlay.className = "g-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "g-modal";

    const h2 = document.createElement("h2");
    h2.textContent = title;
    modal.appendChild(h2);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    return { overlay, modal };
  }

  function closeModal(overlay){
    if (overlay && overlay.parentNode){
      overlay.parentNode.removeChild(overlay);
    }
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
  if (!$ingresosListBody) return;
  ensureGastosState();

  const items = Array.isArray(gastos.ingresosFijos) ? gastos.ingresosFijos : [];

  if (!items.length){
    $ingresosListBody.classList.add("muted");
    $ingresosListBody.textContent = "Aún no has añadido ingresos fijos.";
    return;
  }

  $ingresosListBody.classList.remove("muted");
  $ingresosListBody.innerHTML = "";

  items.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "gasto-item ingreso-item"; // mismo estilo que gastos

    const main = document.createElement("div");
    main.className = "gasto-main";

    const titleLine = document.createElement("div");
    titleLine.className = "gasto-title-line";

    const nameSpan = document.createElement("span");
    nameSpan.className = "gasto-nombre";
    nameSpan.textContent = item.nombre || `Ingreso ${idx+1}`;
    titleLine.appendChild(nameSpan);

    main.appendChild(titleLine);
    row.appendChild(main);

    const importeSpan = document.createElement("div");
    importeSpan.className = "gasto-importe";
    importeSpan.textContent = numberToEsLocal(esToNumberLocal(item.importe));
    row.appendChild(importeSpan);

    const menuBtn = document.createElement("button");
    menuBtn.className = "gasto-menu-btn";
    menuBtn.type = "button";
    menuBtn.textContent = "🖌️";
    menuBtn.addEventListener("click", () => {
      handleIngresoMenu(idx);
    });
    row.appendChild(menuBtn);

    $ingresosListBody.appendChild(row);
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
      menuBtn.textContent = "🖌️";
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
  console.log("〽️ [INV] renderGastosPanel metrics:", m);

  const {
    ingresos,
    gastosFijos,
    gastoVariable,
    inversion = 0,
    gastosTotales,
    saldoFinal,
    pctComprometido,
    pctEsencial
  } = m;

  if ($gInputIngresos){
    $gInputIngresos.value = ingresos > 0 ? numberToEsLocal(ingresos) : "";
  }
  if ($gInputInversion){
    $gInputInversion.value = inversion > 0 ? numberToEsLocal(inversion) : "";
  }

  $gBalanceFinal.textContent = numberToEsLocal(saldoFinal);
  $gBalanceFinal.classList.toggle("g-balance-final--negativo", saldoFinal < 0);
  $gBalanceFinal.classList.toggle("g-balance-final--positivo", saldoFinal > 0);

  if ($gBalanceDetalle){
    $gBalanceDetalle.textContent =
      `Ing: ${numberToEsLocal(ingresos)} · Fijos: ${numberToEsLocal(gastosFijos)} · Var: ${numberToEsLocal(gastoVariable)} · Inv: ${numberToEsLocal(inversion)}`;
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

  if ($gSemiIngresos)  $gSemiIngresos.textContent  = numberToEsLocal(ingresos);
  if ($gSemiGastos)    $gSemiGastos.textContent    = numberToEsLocal(gastosTotales);
  if ($gSemiInversion) $gSemiInversion.textContent = numberToEsLocal(inversion);
  if ($gSemiResto){
    $gSemiResto.textContent = numberToEsLocal(saldoFinal);
    const parent = $gSemiResto.parentElement;
    if (parent){
      if (saldoFinal < 0) parent.classList.add("negativo");
      else parent.classList.remove("negativo");
    }
  }

  // gastos sin inversión = fijos + variable
  drawGastosSemicircle(ingresos, gastosFijos + gastoVariable, inversion);

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
  renderInversionesList();   // 🔹 NUEVO
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

    const { overlay, modal } = createModalBase("Nuevo ingreso fijo");

    const rowNombre = document.createElement("div");
    rowNombre.className = "g-modal-row";
    const labelNombre = document.createElement("label");
    labelNombre.textContent = "Nombre del ingreso";
    const inputNombre = document.createElement("input");
    inputNombre.type = "text";
    inputNombre.placeholder = "Nómina, extra…";
    rowNombre.appendChild(labelNombre);
    rowNombre.appendChild(inputNombre);

    const rowImporte = document.createElement("div");
    rowImporte.className = "g-modal-row";
    const labelImporte = document.createElement("label");
    labelImporte.textContent = "Importe mensual (€)";
    const inputImporte = document.createElement("input");
    inputImporte.type = "number";
    inputImporte.inputMode = "decimal";
    inputImporte.placeholder = "0,00";
    rowImporte.appendChild(labelImporte);
    rowImporte.appendChild(inputImporte);

    const actions = document.createElement("div");
    actions.className = "g-modal-actions";

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "g-modal-btn g-modal-btn--ghost";
    btnCancel.textContent = "Cancelar";
    btnCancel.addEventListener("click", () => {
      closeModal(overlay);
    });


if ($gBtnInversionGuardar){
  $gBtnInversionGuardar.addEventListener("click", onGuardarInversionMensual);
}

    const btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.className = "g-modal-btn g-modal-btn--primary";
    btnSave.textContent = "Guardar";
    btnSave.addEventListener("click", () => {
      const nombre  = inputNombre.value.trim();
      const importe = esToNumberLocal(inputImporte.value);
      if (!nombre || !importe) return;

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
      closeModal(overlay);
    });

    actions.appendChild(btnCancel);
    actions.appendChild(btnSave);

    modal.appendChild(rowNombre);
    modal.appendChild(rowImporte);
    modal.appendChild(actions);

    inputNombre.focus();
  }

function onGuardarInversionMensual(){
  ensureGastosState();

  console.log("〽️ [INV] onGuardarInversionMensual -> abrir modal nueva inversión");

  const { overlay, modal } = createModalBase("Nueva inversión");

  const rowNombre = document.createElement("div");
  rowNombre.className = "g-modal-row";
  const labelNombre = document.createElement("label");
  labelNombre.textContent = "Nombre de la inversión";
  const inputNombre = document.createElement("input");
  inputNombre.type = "text";
  inputNombre.placeholder = "ETF, Bitcoin, fondo, etc.";
  rowNombre.appendChild(labelNombre);
  rowNombre.appendChild(inputNombre);

  const rowImporte = document.createElement("div");
  rowImporte.className = "g-modal-row";
  const labelImporte = document.createElement("label");
  labelImporte.textContent = "Importe mensual (€)";
  const inputImporte = document.createElement("input");
  inputImporte.type = "number";
  inputImporte.inputMode = "decimal";
  inputImporte.placeholder = "0,00";
  rowImporte.appendChild(labelImporte);
  rowImporte.appendChild(inputImporte);

  const actions = document.createElement("div");
  actions.className = "g-modal-actions";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "g-modal-btn g-modal-btn--ghost";
  btnCancel.textContent = "Cancelar";
  btnCancel.addEventListener("click", () => {
    console.log("〽️ [INV] onGuardarInversionMensual -> cancelar");
    closeModal(overlay);
  });

  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.className = "g-modal-btn g-modal-btn--primary";
  btnSave.textContent = "Guardar";
  btnSave.addEventListener("click", () => {
    const nombre  = inputNombre.value.trim();
    const importe = esToNumberLocal(inputImporte.value);
    if (!nombre || !importe){
      console.log("〽️ [INV] onGuardarInversionMensual -> datos inválidos", {
        nombre,
        importeRaw: inputImporte.value
      });
      return;
    }

    if (!Array.isArray(gastos.inversionesFijas)){
      gastos.inversionesFijas = [];
    }

    gastos.inversionesFijas.push({
      id     : Date.now(),
      nombre : nombre,
      importe: importe
    });

    // recalculamos inversionMensual como suma (por compatibilidad)
    let totalInv = 0;
    gastos.inversionesFijas.forEach(inv => {
      totalInv += esToNumberLocal(inv.importe);
    });
    gastos.inversionMensual = totalInv;

    console.log("〽️ [INV] onGuardarInversionMensual -> guardado", {
      nuevo: { nombre, importe },
      inversionMensual: gastos.inversionMensual,
      inversionesFijas: gastos.inversionesFijas
    });

    if ($gInputInversion){
      $gInputInversion.value = numberToEsLocal(gastos.inversionMensual);
    }

    saveLocalGastos();
    syncGastosToCloud();
    renderGastosPanel();
    closeModal(overlay);
  });

  actions.appendChild(btnCancel);
  actions.appendChild(btnSave);

  modal.appendChild(rowNombre);
  modal.appendChild(rowImporte);
  modal.appendChild(actions);

  inputNombre.focus();
}
function renderInversionesList(){
  ensureGastosState();
  if (!$inversionPanel){
    console.log("〽️ [INV] renderInversionesList -> sin panel .gastos-inversion");
    return;
  }

  const items = Array.isArray(gastos.inversionesFijas) ? gastos.inversionesFijas : [];
  console.log("〽️ [INV] renderInversionesList -> items:", items);

  // borrar lista anterior (si existe)
  const oldList = $inversionPanel.querySelector(".inversiones-list-body");
  if (oldList){
    oldList.remove();
  }

  const list = document.createElement("div");
  list.className = "gastos-list-body inversiones-list-body";

  if (!items.length){
    list.classList.add("muted");
    list.textContent = "Aún no has añadido ninguna inversión.";
    $inversionPanel.appendChild(list);
    return;
  }

  items.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "gasto-item inversion-item";

    const main = document.createElement("div");
    main.className = "gasto-main";

    const titleLine = document.createElement("div");
    titleLine.className = "gasto-title-line";

    const nameSpan = document.createElement("span");
    nameSpan.className = "gasto-nombre";
    nameSpan.textContent = item.nombre || `Inversión ${idx+1}`;
    titleLine.appendChild(nameSpan);

    main.appendChild(titleLine);
    row.appendChild(main);

    const importeSpan = document.createElement("div");
    importeSpan.className = "gasto-importe";
    importeSpan.textContent = numberToEsLocal(esToNumberLocal(item.importe));
    row.appendChild(importeSpan);

    const menuBtn = document.createElement("button");
    menuBtn.className = "gasto-menu-btn";
    menuBtn.type = "button";
    menuBtn.textContent = "🖌️";
    menuBtn.addEventListener("click", () => {
      handleInversionMenu(idx);
    });
    row.appendChild(menuBtn);

    list.appendChild(row);
  });

  $inversionPanel.appendChild(list);
}
function handleInversionMenu(idx){
  ensureGastosState();
  const items = Array.isArray(gastos.inversionesFijas) ? gastos.inversionesFijas : [];
  const item = items[idx];
  if (!item){
    console.log("〽️ [INV] handleInversionMenu -> item no encontrado para idx", idx);
    return;
  }

  const action = window.prompt("Escribe 1 para editar o 2 para eliminar esta inversión", "1");
  console.log("〽️ [INV] handleInversionMenu -> acción elegida:", action, "item:", item);

  if (action === "2"){
    if (!window.confirm("¿Eliminar esta inversión fija?")) return;
    gastos.inversionesFijas.splice(idx, 1);

    // recalcular total inversión
    let totalInv = 0;
    gastos.inversionesFijas.forEach(inv => {
      totalInv += esToNumberLocal(inv.importe);
    });
    gastos.inversionMensual = totalInv;

    console.log("〽️ [INV] handleInversionMenu -> eliminada. Nuevo total inversión:", gastos.inversionMensual);

    saveLocalGastos();
    syncGastosToCloud();
    renderGastosPanel();
    return;
  }

  if (action !== "1") return;

  const nombre = window.prompt("Nombre de la inversión", item.nombre || "") || item.nombre;
  const importeStr = window.prompt("Importe mensual (€)", String(item.importe || "")) || item.importe;

  item.nombre  = nombre;
  item.importe = esToNumberLocal(importeStr);

  let totalInv = 0;
  gastos.inversionesFijas.forEach(inv => {
    totalInv += esToNumberLocal(inv.importe);
  });
  gastos.inversionMensual = totalInv;

  console.log("〽️ [INV] handleInversionMenu -> editada", {
    item,
    inversionMensual: gastos.inversionMensual
  });

  saveLocalGastos();
  syncGastosToCloud();
  renderGastosPanel();
}


  function onNuevoGastoFijo(){
    ensureGastosState();

    const { overlay, modal } = createModalBase("Nuevo gasto fijo");

    const rowNombre = document.createElement("div");
    rowNombre.className = "g-modal-row";
    const labelNombre = document.createElement("label");
    labelNombre.textContent = "Nombre del gasto";
    const inputNombre = document.createElement("input");
    inputNombre.type = "text";
    inputNombre.placeholder = "Alquiler, luz…";
    rowNombre.appendChild(labelNombre);
    rowNombre.appendChild(inputNombre);

    const rowImporte = document.createElement("div");
    rowImporte.className = "g-modal-row";
    const labelImporte = document.createElement("label");
    labelImporte.textContent = "Importe mensual (€)";
    const inputImporte = document.createElement("input");
    inputImporte.type = "number";
    inputImporte.inputMode = "decimal";
    inputImporte.placeholder = "0,00";
    rowImporte.appendChild(labelImporte);
    rowImporte.appendChild(inputImporte);

    const rowCategoria = document.createElement("div");
    rowCategoria.className = "g-modal-row";
    const labelCategoria = document.createElement("label");
    labelCategoria.textContent = "Categoría";
    const inputCategoria = document.createElement("input");
    inputCategoria.type = "text";
    inputCategoria.placeholder = "Piso, comida, capricho…";
    rowCategoria.appendChild(labelCategoria);
    rowCategoria.appendChild(inputCategoria);

    const rowEsencial = document.createElement("div");
    rowEsencial.className = "g-modal-row";
    const labelEsencial = document.createElement("label");
    labelEsencial.textContent = "¿Es esencial?";
    const selectEsencial = document.createElement("select");
    const optSi = document.createElement("option");
    optSi.value = "s";
    optSi.textContent = "Sí";
    const optNo = document.createElement("option");
    optNo.value = "n";
    optNo.textContent = "No";
    selectEsencial.appendChild(optSi);
    selectEsencial.appendChild(optNo);
    rowEsencial.appendChild(labelEsencial);
    rowEsencial.appendChild(selectEsencial);

    const actions = document.createElement("div");
    actions.className = "g-modal-actions";

    const btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "g-modal-btn g-modal-btn--ghost";
    btnCancel.textContent = "Cancelar";
    btnCancel.addEventListener("click", () => {
      closeModal(overlay);
    });

    const btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.className = "g-modal-btn g-modal-btn--primary";
    btnSave.textContent = "Guardar";
    btnSave.addEventListener("click", () => {
      const nombre    = inputNombre.value.trim();
      const importe   = esToNumberLocal(inputImporte.value);
      const categoria = inputCategoria.value.trim();
      const esencial  = String(selectEsencial.value || "").toLowerCase() === "s";

      if (!nombre || !importe) return;

      gastos.gastosFijos.push({
        id       : Date.now(),
        nombre   : nombre,
        importe  : importe,
        categoria: categoria,
        esencial : esencial
      });

      saveLocalGastos();
      syncGastosToCloud();
      renderGastosPanel();
      closeModal(overlay);
    });

    actions.appendChild(btnCancel);
    actions.appendChild(btnSave);

    modal.appendChild(rowNombre);
    modal.appendChild(rowImporte);
    modal.appendChild(rowCategoria);
    modal.appendChild(rowEsencial);
    modal.appendChild(actions);

    inputNombre.focus();
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
const KEY_ORIGEN_FINANZAS = "mis_cuentas_fase1_origen_cuentas_finanzas";

  // ---- Init ----
function initFinanzas(){
  loadLocalGastos();
  ensureGastosState();
  loadRegistrosLocal();
  loadCuentasFromLocal();
  updateOrigenLabel();
  renderGastosPanel();

  if ($gBtnIngresosGuardar){
    $gBtnIngresosGuardar.addEventListener("click", onGuardarIngresosMensuales);
  }
  if ($gInputIngresos){
    $gInputIngresos.addEventListener("change", onGuardarIngresosMensuales);
  }

  // 🔹 botón inversión
if ($gBtnInversionGuardar){
  console.log("〽️ [INV] initFinanzas -> listener en g-btn-inversion-guardar");
  $gBtnInversionGuardar.addEventListener("click", onGuardarInversionMensual);
}
  if ($gInputInversion){
    $gInputInversion.addEventListener("change", onGuardarInversionMensual);
  }

  if ($btnOrigenGastoVar){
    $btnOrigenGastoVar.addEventListener("click", onSelectOrigenCuentas);
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