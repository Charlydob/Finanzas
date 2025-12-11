(function(){
  // ------- Utils -------
  function esToNumber(s){
    if (s == null) return 0;
    if (typeof s === "number") return s;
    s = String(s).replace(/\s/g,"").replace("€","").replace(/\./g,"").replace(",",".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function numberToEs(n, opts){
    return new Intl.NumberFormat("es-ES", opts||{style:"currency",currency:"EUR"}).format(n);
  }

  function pctToEs(n){
    return new Intl.NumberFormat("es-ES",{style:"percent",maximumFractionDigits:2}).format(n);
  }

  function ymd(d){
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),da=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }

  // ------- Estado -------
  const KEY_DATA   = "mis_cuentas_fase1_data";
  const KEY_CUENTAS= "mis_cuentas_fase1_cuentas";
  const KEY_UID    = "mis_cuentas_uid";
  const KEY_HIDDEN = "mis_cuentas_hidden_cols_by_name";
const KEY_OBJETIVOS = "mis_cuentas_fase1_objetivos";

  const DEFAULT_CUENTAS = [
    "Principal","Myinvestor","Revolut Main","Revolut remunerada",
    "Revolut inversión","Revolut Bitcoin","Kraken","Wallet Bitcoin"
  ];


  function getUid(){
    return localStorage.getItem(KEY_UID) || null;
  }

const state = {
  uid      : getUid(),
  cuentas  : JSON.parse(localStorage.getItem(KEY_CUENTAS)) || DEFAULT_CUENTAS,
  registros: JSON.parse(localStorage.getItem(KEY_DATA)) || [],
  objetivos: JSON.parse(localStorage.getItem(KEY_OBJETIVOS) || "null") || {},
  editingIndex: -1,
  cuentaSeleccionada: null
};

// --- Snapshot global para otros módulos (objetivos.js, finanzas.js) ---
if (typeof window !== "undefined") {
  window.getFinanzasSnapshot = function () {
    try {
      const cuentas   = Array.isArray(state.cuentas)   ? state.cuentas.slice()   : [];
      const registros = Array.isArray(state.registros) ? state.registros.slice() : [];
      return { cuentas, registros };
    } catch (e) {
      console.error("[APP] getFinanzasSnapshot ERROR", e);
      return { cuentas: [], registros: [] };
    }
  };
}




  let hiddenCols = new Set(JSON.parse(localStorage.getItem(KEY_HIDDEN) || "[]"));
  let cloudRef   = null;
function saveHidden(){ 
  localStorage.setItem(KEY_HIDDEN, JSON.stringify([...hiddenCols])); 
}

  // ------- DOM -------
  const $fecha        = document.getElementById("fecha");
  const $wrapper      = document.getElementById("cuentas-wrapper");
  const $total        = document.getElementById("total");
  const $var          = document.getElementById("variacion");
  const $varpct       = document.getElementById("varpct");
  const $tabla        = document.getElementById("tabla-historial");
  const $restore      = document.getElementById("col-restore");
  const $status       = document.getElementById("status");
  const $dashboard    = document.getElementById("dashboard");
  const $totalActual  = document.getElementById("total-actual");


  // login simple
  const $loginOverlay  = document.getElementById("login-overlay");
  const $loginInput    = document.getElementById("login-id");
  const $loginBtn      = document.getElementById("login-btn");
  const $loginClearBtn = document.getElementById("login-clear");

  // modales
  const $modal              = document.getElementById("modal");
  const $btnAbrirModal      = document.getElementById("btn-abrir-modal");
  const $btnCerrarModal     = document.getElementById("btn-cerrar-modal");
  const $modalBackdrop      = document.getElementById("modal-close");

  const $modalHistorial           = document.getElementById("modal-historial");
  const $btnHistorial             = document.getElementById("btn-historial");
  const $btnCerrarModalHistorial  = document.getElementById("btn-cerrar-modal-historial");
  const $modalHistorialBackdrop   = document.getElementById("modal-historial-close");

  const $modalCuenta         = document.getElementById("modal-cuenta");
  const $modalCuentaDialog   = document.querySelector("#modal-cuenta .modal__dialog");
  const $modalCuentaTitle    = document.getElementById("modal-cuenta-title");
  const $modalCuentaBackdrop = document.getElementById("modal-cuenta-close");
  const $btnCerrarModalCuenta= document.getElementById("btn-cerrar-modal-cuenta");
  const $cuentaChart         = document.getElementById("cuenta-chart");
  const $cuentaHistBody      = document.getElementById("cuenta-historial-body");
  const $cuentaTooltip       = document.getElementById("cuenta-tooltip");

  const $varTotal      = document.getElementById("var-total");
  const $comparar      = document.getElementById("comparar");
  const $varComparada  = document.getElementById("var-comparada");
  const $body          = document.body;
  // cabecera estilo Revolut
  const $totalVariacionMini = document.getElementById("total-variacion-mini");
  const $totalSparkline     = document.getElementById("total-sparkline");

  const $btnDelCuenta        = document.getElementById("btn-del-cuenta");
  const $btnActualizarCuenta = document.getElementById("btn-actualizar-cuenta");

  // Modal actualización individual
  const $modalIndiv          = document.getElementById("modal-individual");
  const $modalIndivBackdrop  = document.getElementById("modal-individual-backdrop");
  const $indivTitle          = document.getElementById("indiv-title");
  const $indivFecha          = document.getElementById("indiv-fecha");
  const $indivCantidad       = document.getElementById("indiv-cantidad");
  const $indivBtnGuardar     = document.getElementById("indiv-guardar");
  const $indivBtnCancelar    = document.getElementById("indiv-cancelar");
  const $indivBtnClose       = document.getElementById("indiv-close");

  function setStatus(txt){ if ($status) $status.textContent = txt || ""; }

  document.getElementById("btn-guardar").addEventListener("click", onGuardar);
  document.getElementById("btn-limpiar").addEventListener("click", () => {
    state.editingIndex = -1;
    setGuardarLabel();
    renderInputs({});
  });

  const $btnExportar = document.getElementById("btn-exportar");
  if ($btnExportar) $btnExportar.addEventListener("click", onExportar);

  const $btnImportar = document.getElementById("btn-importar");
  if ($btnImportar) $btnImportar.addEventListener("click", onImportar);

  document.getElementById("btn-reset").addEventListener("click", borrarTodo);
  document.getElementById("btn-add-cuenta").addEventListener("click", addCuenta);
  if ($btnDelCuenta) $btnDelCuenta.addEventListener("click", deleteCuenta);

  if ($btnAbrirModal) $btnAbrirModal.addEventListener("click", openModal);
  if ($btnCerrarModal) $btnCerrarModal.addEventListener("click", closeModal);
  if ($modalBackdrop)  $modalBackdrop.addEventListener("click", closeModal);

if ($btnHistorial)            $btnHistorial.addEventListener("click", openHistorialModal);
if ($btnCerrarModalHistorial) $btnCerrarModalHistorial.addEventListener("click", closeHistorialModal);
if ($modalHistorialBackdrop)  $modalHistorialBackdrop.addEventListener("click", closeHistorialModal);

  if ($btnCerrarModalCuenta) $btnCerrarModalCuenta.addEventListener("click", closeCuentaModal);
  if ($modalCuentaBackdrop)  $modalCuentaBackdrop.addEventListener("click", closeCuentaModal);

  if ($comparar) $comparar.addEventListener("change", updateComparativa);
  if ($btnActualizarCuenta) $btnActualizarCuenta.addEventListener("click", onActualizarCuentaIndividual);

  if ($modalIndivBackdrop)  $modalIndivBackdrop.addEventListener("click", closeIndivModal);
  if ($indivBtnCancelar)    $indivBtnCancelar.addEventListener("click", closeIndivModal);
  if ($indivBtnClose)       $indivBtnClose.addEventListener("click", closeIndivModal);

  if ($indivBtnGuardar){
    $indivBtnGuardar.addEventListener("click", () => {
      const cta = state.cuentaSeleccionada;
      if (!cta){
        closeIndivModal();
        return;
      }

      const fechaStr = $indivFecha ? $indivFecha.value : "";
      if (!fechaStr){
        alert("Pon una fecha.");
        return;
      }

      const raw = $indivCantidad ? $indivCantidad.value.trim() : "";
      if (!raw){
        alert("Pon una cantidad.");
        return;
      }

      const valorNum = esToNumber(raw);
      if (!Number.isFinite(valorNum)){
        alert("Cantidad inválida.");
        return;
      }

      upsertRegistroCuenta(cta, fechaStr, valorNum);
      closeIndivModal();
      buildCuentaDetalle(cta);
    });
  }

  // ------- Login simple por UID -------
  function applyUid(newUid){
    state.uid = newUid;
    if (!newUid){
      localStorage.removeItem(KEY_UID);
    } else {
      localStorage.setItem(KEY_UID, newUid);
    }

    if (window.firebase){
      attachCloudListeners();
    }
    renderTabla();
    renderDashboard();

    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function"){
      try{
        window.dispatchEvent(new CustomEvent("finanzas-login",{ detail:{ uid:newUid } }));
      }catch(e){
        console.error(e);
      }
    }
  }

  function showLogin(){
    if ($loginOverlay){
      $loginOverlay.setAttribute("aria-hidden","false");
      if ($loginInput){
        setTimeout(()=> $loginInput.focus(), 0);
      }
    }
  }

  function hideLogin(){
    if ($loginOverlay){
      $loginOverlay.setAttribute("aria-hidden","true");
    }
  }

  if ($loginBtn){
    $loginBtn.addEventListener("click", () => {
      const id = ($loginInput && $loginInput.value || "").trim();
      if (!id){
        alert("Introduce un identificador (por ejemplo tu email).");
        return;
      }
      applyUid(id);
      hideLogin();
    });
  }

  if ($loginInput){
    $loginInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter"){
        ev.preventDefault();
        if ($loginBtn) $loginBtn.click();
      }
    });
  }

  if ($loginClearBtn){
    $loginClearBtn.addEventListener("click", () => {
      localStorage.removeItem(KEY_UID);
      state.uid = null;
      if (window.firebase){
        try{
          location.reload();
        }catch(e){
          console.error(e);
          showLogin();
        }
      } else {
        showLogin();
      }
    });
  }

  function openModal(){
    if ($modal) $modal.setAttribute("aria-hidden","false");
  }

  function closeModal(){
    if ($modal) $modal.setAttribute("aria-hidden","true");
    state.editingIndex = -1;
    setGuardarLabel();
  }

  function openHistorialModal(){
    if ($modalHistorial) $modalHistorial.setAttribute("aria-hidden","false");
  }

  function closeHistorialModal(){
    if ($modalHistorial) $modalHistorial.setAttribute("aria-hidden", "true");
  }

  function openCuentaModal(nombreCuenta){
    if (!$modalCuenta) return;
    state.cuentaSeleccionada = nombreCuenta;
    if ($modalCuentaTitle) $modalCuentaTitle.textContent = nombreCuenta;
    buildCuentaDetalle(nombreCuenta);
    $modalCuenta.setAttribute("aria-hidden", "false");
  }

  function closeCuentaModal(){
    if ($modalCuenta) $modalCuenta.setAttribute("aria-hidden", "true");
    state.cuentaSeleccionada = null;
    document.querySelectorAll(".row-menu.open").forEach(m => m.classList.remove("open"));
  }

  function openIndivModal(defaultFecha, defaultValor){
    if (!$modalIndiv) return;

    if ($indivFecha) {
      $indivFecha.value = defaultFecha || ymd(new Date());
    }
    if ($indivCantidad) {
      $indivCantidad.value = defaultValor != null && Number.isFinite(defaultValor)
        ? numberToEs(defaultValor)
        : "";
    }
    if ($indivTitle && state.cuentaSeleccionada) {
      $indivTitle.textContent = `Actualizar ${state.cuentaSeleccionada}`;
    }

    $modalIndiv.setAttribute("aria-hidden", "false");
  }

  function closeIndivModal(){
    if ($modalIndiv) $modalIndiv.setAttribute("aria-hidden", "true");
  }

  function renderInputs(valores){
    $wrapper.innerHTML = "";
    state.cuentas.forEach(c => {
      const row = document.createElement("div");
      row.className = "item";

      const label = document.createElement("label");
      label.textContent = c;

      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.placeholder = "0,00 €";
      input.autocomplete = "off";
      input.style.fontSize = "16px";

      input.value = valores && (valores[c] !== undefined) ? valores[c] : "";

      input.addEventListener("focus", () => {
        if (input.value) input.select();
      });

      input.addEventListener("blur", () => {
        const raw = input.value.trim();
        if (raw === "") {
          input.value = "";
          return;
        }
        input.value = numberToEs(esToNumber(raw));
      });

      row.append(label, input);
      $wrapper.append(row);
    });
  }

  function setInputsFromSaldos(s){
    $wrapper.querySelectorAll(".item").forEach(row => {
      const name = row.querySelector("label").textContent;
      const inp  = row.querySelector("input");
      const val  = s[name] || 0;
      inp.value = numberToEs(val);
    });
    calcularTotal();
  }

  function leerInputs(){
    const saldos = {};

    let baseSaldos = {};
    if (state.editingIndex >= 0 && state.registros[state.editingIndex]){
      baseSaldos = state.registros[state.editingIndex].saldos || {};
    } else if (state.registros.length){
      baseSaldos = state.registros[state.registros.length - 1].saldos || {};
    }

    [].slice.call($wrapper.querySelectorAll(".item")).forEach(row => {
      const name  = row.querySelector("label").textContent;
      const input = row.querySelector("input");
      const raw   = input.value.trim();

      if (raw === ""){
        const prev = baseSaldos[name];
        saldos[name] = Number.isFinite(prev) ? prev : 0;
      } else {
        saldos[name] = esToNumber(raw);
      }
    });

    return saldos;
  }

  // ------- Cálculo -------
  function calcularTotal(){
    const saldos = leerInputs();
    const total  = Object.values(saldos).reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);
    const prev   = state.registros.length ? state.registros[state.registros.length-1].total : 0;
    const variacion = total - prev;
    const varpct    = prev !== 0 ? (variacion/prev) : 0;

    $total.textContent  = numberToEs(total);
    $var.textContent    = numberToEs(variacion);
    $varpct.textContent = pctToEs(varpct);

    return {total,variacion,varpct};
  }

function recalcVariaciones(){
  if (!state.registros.length) return;

  // Siempre ordenados por fecha
  state.registros.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

  const cuentas    = state.cuentas;
  const lastSaldos = {};  // último saldo conocido por cuenta
  let prevTotal    = 0;   // total del registro anterior

  state.registros.forEach(r => {
    if (!r.saldos) r.saldos = {};

    let total = 0;

    cuentas.forEach(cta => {
      const saldoExp = r.saldos[cta];

      // Si en ESTE registro hay valor explícito, actualizamos último saldo
      if (Number.isFinite(saldoExp)) {
        lastSaldos[cta] = saldoExp;
      }

      // Para sumar usamos SIEMPRE el último saldo conocido
      const vUsado = Number.isFinite(lastSaldos[cta]) ? lastSaldos[cta] : 0;
      total += vUsado;
    });

    r.total     = total;
    r.variacion = total - prevTotal;
    r.varpct    = prevTotal !== 0 ? (total - prevTotal) / prevTotal : 0;

    prevTotal = total;
  });
}




  function setGuardarLabel(){
    const $btnGuardar = document.getElementById("btn-guardar");
    $btnGuardar.textContent = state.editingIndex>=0 ? "Actualizar" : "Guardar";
  }

  // ------- Guardar global -------
  async function onGuardar(){
    const fecha = $fecha.value;
    if (!fecha) return alert("Pon una fecha.");
    const {total,variacion,varpct} = calcularTotal();
    const saldos = leerInputs();

    if (state.editingIndex>=0){
      state.registros[state.editingIndex] = {fecha,saldos,total,variacion,varpct};
      recalcVariaciones();
      state.editingIndex = -1;
      setGuardarLabel();
    } else {
      state.registros.push({fecha,saldos,total,variacion,varpct});
      recalcVariaciones();
    }

    persistLocal();
    renderTabla();
    renderDashboard();
    closeModal();

    try{
      if (window.firebase && state.uid){
        setStatus("Guardando…");
        await firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
          cuentas: state.cuentas,
          registros: state.registros,
          objetivos: state.objetivos,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });

        setStatus("✔ Guardado"); setTimeout(()=>setStatus(""),1200);
      }
    }catch(e){
      console.error(e);
      setStatus("✖ Error guardando");
    }
  }

  // ------- Tabla + ocultar columnas -------
  let currentColsCache = [];
  let modoSparkline = "total"; // "total" | "periodo"


  function renderRestoreBar(cols){
    $restore.innerHTML="";
    hiddenCols.forEach(name=>{
      if(name==="Fecha") return;
      const chip=document.createElement("button");
      chip.className="col-chip";
      chip.textContent=`+ ${name}`;
      chip.addEventListener("click", ()=>{
        hiddenCols.delete(name); saveHidden();
        const table = $tabla.querySelector("table");
        setColVisibilityByName(table, cols, name, true);
        renderRestoreBar(cols);
      });
      $restore.append(chip);
    });
  }

  function setColVisibilityByName(tableEl, cols, name, visible){
    const idx = cols.indexOf(name);
    if (idx < 0) return;

    const th = tableEl.querySelector("thead tr").children[idx];
    if (th) th.style.display = visible ? "" : "none";

    tableEl.querySelectorAll("tbody tr").forEach(tr=>{
      const cell = tr.children[idx];
      if (cell) cell.style.display = visible ? "" : "none";
    });
  }

  function makeToggleBtn(colName, isHidden){
    const btn=document.createElement("button");
    btn.className="col-toggle"; btn.type="button";
    btn.textContent=isHidden?"+":"−";
    btn.title=isHidden?`Mostrar ${colName}`:`Ocultar ${colName}`;
    btn.addEventListener("click",()=>{
      const table=$tabla.querySelector("table");
      const cols=currentColsCache;
      const nowHidden=!hiddenCols.has(colName);
      if(nowHidden) hiddenCols.add(colName); else hiddenCols.delete(colName);
      saveHidden();
      setColVisibilityByName(table, cols, colName, !nowHidden);
      renderRestoreBar(cols);
    });
    return btn;
  }

  function renderTabla(){
  const cuentas = state.cuentas;
  const cols    = ["Fecha", ...cuentas, "TOTAL", "Variación", "%Var"];
  currentColsCache = cols.slice();

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh   = document.createElement("tr");

  // Cabecera
  cols.forEach((c,idx)=>{
    const th = document.createElement("th");
    th.className = "col-header";
    if (idx === 0) th.classList.add("sticky-col");

    const title = document.createElement("span");
    title.className = "col-title";
    title.textContent = c;
    th.append(title);

    if (idx > 0){
      th.append(makeToggleBtn(c, hiddenCols.has(c)));
    }

    trh.append(th);
  });
  const thAct = document.createElement("th");
  thAct.textContent = "";
  trh.append(thAct);
  thead.append(trh);

  const tbody = document.createElement("tbody");

  // arrastre de saldos para pintar la tabla
  const lastSaldosRow = {};

  state.registros.forEach((r,i)=>{
    const tr = document.createElement("tr");

    // Fecha
    const tdF = document.createElement("td");
    tdF.className = "sticky-col";
    tdF.textContent = r.fecha;
    tr.append(tdF);

    // Columnas por cuenta con arrastre visual
    cuentas.forEach(cta=>{
      const td = document.createElement("td");
      const saldoExp = r.saldos && r.saldos[cta];

      if (Number.isFinite(saldoExp)){
        lastSaldosRow[cta] = saldoExp;
      }

      const vUsado = Number.isFinite(lastSaldosRow[cta]) ? lastSaldosRow[cta] : 0;
      td.textContent = numberToEs(vUsado);
      tr.append(td);
    });

    // Totales y variaciones (ya calculados en recalcVariaciones)
    const tdT = document.createElement("td");
    tdT.textContent = numberToEs(r.total || 0);
    tr.append(tdT);

    const tdV = document.createElement("td");
    tdV.textContent = numberToEs(r.variacion || 0);
    tr.append(tdV);

    const tdP = document.createElement("td");
    tdP.textContent = pctToEs(r.varpct || 0);
    tr.append(tdP);

    // Acciones
    const tdA = document.createElement("td");
    tdA.className = "actions-cell";

    const btnE = document.createElement("button");
    btnE.type = "button";
    btnE.className = "row-btn";
    btnE.textContent = "✎";
    btnE.title = "Editar";
    btnE.addEventListener("click",()=>{
      state.editingIndex = i;
      setGuardarLabel();
      $fecha.value = r.fecha;
      renderInputs({});
      setInputsFromSaldos(r.saldos || {});
      openModal();
    });

    const btnD = document.createElement("button");
    btnD.type = "button";
    btnD.className = "row-btn";
    btnD.textContent = "🗑";
    btnD.title = "Borrar";
    btnD.addEventListener("click", async ()=>{
      if (!confirm(`Borrar el registro de ${r.fecha}?`)) return;
      state.registros.splice(i, 1);
      recalcVariaciones();
      persistLocal();
      renderTabla();
      renderDashboard();
      try{
        if (window.firebase && state.uid){
        await firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
          cuentas: state.cuentas,
          registros: state.registros,
          objetivos: state.objetivos,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });

        }
      }catch(e){
        console.error(e);
      }
    });

    tdA.append(btnE, btnD);
    tr.append(tdA);
    tbody.append(tr);
  });

  table.append(thead, tbody);
  $tabla.innerHTML = "";
  $tabla.append(table);
  table.style.minWidth = (cols.length * 140 + 120) + "px";

  hiddenCols.forEach(name => setColVisibilityByName(table, cols, name, false));
  renderRestoreBar(cols);
}
  // ------- Dashboard -------
  function startOfWeek(d){
    const dt=new Date(d);
    const day=(dt.getDay()+6)%7;
    dt.setDate(dt.getDate()-day);
    dt.setHours(0,0,0,0);
    return dt;
  }

  function startOfMonth(d){
    const dt=new Date(d.getFullYear(), d.getMonth(), 1);
    dt.setHours(0,0,0,0);
    return dt;
  }

  function startOfYear(d){
    const dt=new Date(d.getFullYear(), 0, 1);
    dt.setHours(0,0,0,0);
    return dt;
  }

  function getPeriodoStart(periodo, refDate){
    if(periodo==="semana") return startOfWeek(refDate);
    if(periodo==="anio")   return startOfYear(refDate);
    return startOfMonth(refDate);
  }

  function getSortedRegistros(){
    return [...state.registros].sort((a,b)=> new Date(a.fecha)-new Date(b.fecha));
  }
function getSaldoCuentaEnFecha(cta, regs, targetDate){
  let val = null;
  for (let i = 0; i < regs.length; i++){
    const r = regs[i];
    const d = new Date(r.fecha);
    if (d > targetDate) break;
    if (r.saldos && Number.isFinite(r.saldos[cta])){
      val = r.saldos[cta];
    }
  }
  return Number.isFinite(val) ? val : 0;
}

function computeDeltaByAccount(periodo){
  if (!state.registros.length) return {};

  const regs     = getSortedRegistros();
  const lastReg  = regs[regs.length - 1];
  const lastDate = new Date(lastReg.fecha);

  const periodStart = getPeriodoStart(periodo, lastDate);

  let firstInPeriod = null;
  for (const r of regs){
    const d = new Date(r.fecha);
    if (d >= periodStart && d <= lastDate){
      firstInPeriod = r;
      break;
    }
  }

  if (!firstInPeriod) return {};

  const baseDate = new Date(firstInPeriod.fecha);

  const deltas = {};
  state.cuentas.forEach(cta => {
    const nowVal  = getSaldoCuentaEnFecha(cta, regs, lastDate);
    const baseVal = getSaldoCuentaEnFecha(cta, regs, baseDate);
    const diff    = nowVal - baseVal;
    const pct     = baseVal !== 0 ? (diff / baseVal) : 0;
    deltas[cta]   = { baseVal, nowVal, diff, pct };
  });

  return deltas;
}




   function renderDashboard(){
    if ($totalActual){
      const lastTotal = state.registros.length
        ? state.registros[state.registros.length - 1].total
        : 0;
      $totalActual.textContent = numberToEs(lastTotal);
    }

    $dashboard.innerHTML = "";
    if (!state.registros.length){
      $dashboard.innerHTML = '<div class="muted">Sin datos. Pulsa “Actualizar”.</div>';
      updateComparativa();

      if ($totalVariacionMini){
        $totalVariacionMini.textContent = "0,00 € · 0,00 %";
        $totalVariacionMini.className = "total-variacion-mini";
      }
      if ($totalSparkline){
        const ctx = $totalSparkline.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, $totalSparkline.width, $totalSparkline.height);
      }

      return;
    }

    const periodoSel = (document.getElementById("periodo")?.value) || "mes";
    const deltas = computeDeltaByAccount(periodoSel);

updateTotalVariation(deltas, modoSparkline === "total" ? "total" : periodoSel);

    state.cuentas.forEach(cta => {
      const info = deltas[cta] || { nowVal: 0, diff: 0, pct: 0 };
      const { nowVal, diff, pct } = info;

      const card = document.createElement("div");
      card.className = "card-mini " + (diff >= 0 ? "pos" : "neg");

      const h = document.createElement("h4");
      h.textContent = cta;
      card.append(h);

      const badge = document.createElement("div");
      badge.className = "delta-badge " + (diff >= 0 ? "ok" : "bad");

      const scope = document.createElement("div");
      scope.textContent =
        (periodoSel === "semana" ? "Semana" :
         periodoSel === "anio"   ? "Año"    : "Mes");

      const pctEl = document.createElement("div");
      pctEl.className = "pct";
      pctEl.textContent = pctToEs(pct);

      const eurEl = document.createElement("div");
      eurEl.textContent = numberToEs(diff);

      badge.append(scope, pctEl, eurEl);
      card.append(badge);

      const nowEl = document.createElement("div");
      nowEl.className = "now";
      nowEl.textContent = numberToEs(nowVal);
      card.append(nowEl);

      card.addEventListener("click", () => openCuentaModal(cta));

      $dashboard.append(card);
    });

    updateComparativa();
  }

function drawTotalSparkline(periodoSel) {
  if (!$totalSparkline || !state.registros.length) return;

  const canvas = $totalSparkline;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const regs     = getSortedRegistros();
  const lastReg  = regs.at(-1);
  const lastDate = new Date(lastReg.fecha);
let start;

if (periodoSel === "total") {
  // primer registro real
  start = new Date(regs[0].fecha);
} else {
  // lógica normal
  start = getPeriodoStart(periodoSel, lastDate);
}

  const serie = regs
    .map(r => ({ fecha: new Date(r.fecha), total: r.total }))
    .filter(r => r.fecha >= start && r.fecha <= lastDate);

  if (!serie.length) return;

  const xs = serie.map(p => p.fecha.getTime());
  const ys = serie.map(p => p.total);

  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  if (minX === maxX) maxX += 86400000;

  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minY === maxY) {
    const d = Math.max(1, Math.abs(minY));
    minY -= d * 0.5;
    maxY += d * 0.5;
  }

  const padX = 10;
  const padY = 10;

  const xScale = t =>
    padX + ((t - minX) / (maxX - minX)) * (w - 2 * padX);

  const yScale = v =>
    h - padY - ((v - minY) / (maxY - minY)) * (h - 2 * padY);

  const pts = xs.map((t, i) => ({
    x: xScale(t),
    y: yScale(ys[i]),
    fecha: serie[i].fecha,
    total: serie[i].total
  }));

  // color según tendencia
  const diff = ys.at(-1) - ys[0];
  const lineColor = diff >= 0 ? "#35c759" : "#ff453a";

  // ---- SUAVIZADO (curva cardinal) ----
  function curve(ctx, points, tension = 0.25) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? i : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  // ---- DIBUJAR ----
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = lineColor;
  curve(ctx, pts, 0.18); // suavizado suave
  ctx.stroke();
  ctx.restore();

  // ---- INTERACCIÓN: mostrar punto + tooltip ----
  const tooltip = document.getElementById("cuenta-tooltip") || (() => {
    const t = document.createElement("div");
    t.id = "cuenta-tooltip";
    t.style.position = "fixed";
    t.style.fontSize = "11px";
    t.style.padding = "4px 6px";
    t.style.borderRadius = "6px";
    t.style.background = "rgba(0,0,0,0.6)";
    t.style.color = "#fff";
    t.style.pointerEvents = "none";
    t.style.zIndex = 10000;
    t.style.display = "none";
    document.body.appendChild(t);
    return t;
  })();

  function nearestPoint(x) {
    let best = null;
    let bestDist = Infinity;
    for (const p of pts) {
      const d = Math.abs(p.x - x);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }

  function showTooltip(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = ev.touches ? ev.touches[0].clientX - rect.left : ev.offsetX;

    const p = nearestPoint(x);
    if (!p) return;

    tooltip.style.display = "block";
    tooltip.textContent = `${numberToEs(p.total)} · ${p.fecha.toLocaleDateString()}`;
    tooltip.style.left = (p.x + rect.left + 8) + "px";
    tooltip.style.top = (p.y + rect.top - 20) + "px";

    // highlight del punto
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = lineColor;
    curve(ctx, pts, 0.18);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  function hideTooltip() {
    tooltip.style.display = "none";
    drawTotalSparkline(periodoSel); // redibuja normal
  }

  canvas.onmousemove = showTooltip;
  canvas.ontouchmove = showTooltip;
  canvas.onmouseleave = hideTooltip;
  canvas.ontouchend = hideTooltip;
}



   function updateTotalVariation(deltas, periodoSel){
    if (!$varTotal) return;

    let totalDiff = 0;
    let totalNow  = 0;

    state.cuentas.forEach(cta => {
      const info = deltas[cta];
      if (!info) return;
      totalDiff += info.diff;
      totalNow  += info.nowVal;
    });

    const baseTotal = totalNow - totalDiff;
    const pct = baseTotal !== 0 ? (totalDiff / baseTotal) : 0;
    const scopeLabel =
      (periodoSel === "semana" ? "Semana" :
       periodoSel === "anio"   ? "Año"    : "Mes");

    $varTotal.textContent = `${scopeLabel}: ${numberToEs(totalDiff)} (${pctToEs(pct)})`;

    let cls = "var-total";
    if (totalDiff > 0)      cls += " pos";
    else if (totalDiff < 0) cls += " neg";
    $varTotal.className = cls;

if ($totalVariacionMini){
  updateVariacionGlobalMini();
}


aplicarTrendGlobal();

    drawTotalSparkline(periodoSel);
  }
function updateVariacionGlobalMini() {
  if (!$totalVariacionMini) return;

  const regs = getSortedRegistros();
  if (!regs.length) return;

  const primero = regs[0];
  const ultimo  = regs.at(-1);

  const vIni = primero.total;
  const vFin = ultimo.total;

  const diff = vFin - vIni;
  const pct  = vIni === 0 ? 0 : diff / vIni;

  $totalVariacionMini.textContent =
    `${numberToEs(diff)} · ${pctToEs(pct)}`;

  let cls = "total-variacion-mini";
  if (diff > 0)      cls += " pos";
  else if (diff < 0) cls += " neg";
  $totalVariacionMini.className = cls;
}

function aplicarTrendGlobal() {
  const regs = getSortedRegistros();
  if (!regs.length) return;

  const primero = regs[0];
  const ultimo  = regs.at(-1);

  const diff = ultimo.total - primero.total;

  $body.classList.remove("trend-pos","trend-neg","trend-neutral");

  if (diff > 0)      $body.classList.add("trend-pos");
  else if (diff < 0) $body.classList.add("trend-neg");
  else               $body.classList.add("trend-neutral");
}

  function computeTotalDiffBetween(startInclusive, endExclusive){
    const regs = getSortedRegistros();
    let first = null, last = null;

    for (const r of regs){
      const d = new Date(r.fecha);
      if (d >= startInclusive && d < endExclusive){
        if (!first) first = r;
        last = r;
      }
    }

    if (!first || !last){
      return { hasData:false, diff:0, first:null, last:null };
    }

    const diff = last.total - first.total;
    return { hasData:true, diff, first, last };
  }

  function updateComparativa(){
    if (!$varComparada || !state.registros.length) return;

    const regs = getSortedRegistros();
    const lastReg = regs[regs.length-1];
    const lastDate = new Date(lastReg.fecha);

    const scope = ($comparar && $comparar.value) || "mes";

    let labelPrefix, actual, previo;

    if (scope === "semana"){
      const startCur = startOfWeek(lastDate);
      const endCur   = new Date(startCur); endCur.setDate(endCur.getDate()+7);

      const startPrev= new Date(startCur); startPrev.setDate(startPrev.getDate()-7);
      const endPrev  = startCur;

      actual = computeTotalDiffBetween(startCur, endCur);
      previo = computeTotalDiffBetween(startPrev, endPrev);
      labelPrefix = "Semana";
    } else {
      const y = lastDate.getFullYear();
      const m = lastDate.getMonth();

      const startCur = new Date(y, m,   1);
      const endCur   = new Date(y, m+1, 1);

      const startPrev= new Date(y, m-1, 1);
      const endPrev  = new Date(y, m,   1);

      actual = computeTotalDiffBetween(startCur, endCur);
      previo = computeTotalDiffBetween(startPrev, endPrev);
      labelPrefix = "Mes";
    }

    if (!actual.hasData){
      $varComparada.textContent = `${labelPrefix}: sin datos suficientes`;
      $varComparada.className = "var-comparada";
      return;
    }

    const diffAct  = actual.diff;
    const baseAct  = actual.first.total;
    const pctAct   = baseAct !== 0 ? (diffAct / baseAct) : 0;

    let text = `${labelPrefix} actual: ${numberToEs(diffAct)} (${pctToEs(pctAct)})`;

    if (previo.hasData){
      const diffPrev = previo.diff;
      const basePrev = previo.first.total;
      const pctPrev  = basePrev !== 0 ? (diffPrev / basePrev) : 0;
      text += ` · Anterior: ${numberToEs(diffPrev)} (${pctToEs(pctPrev)})`;
    } else {
      text += " · ";
    }

    let cls = "var-comparada";
    if (diffAct > 0)      cls += " pos";
    else if (diffAct < 0) cls += " neg";

    $varComparada.textContent = text;
    $varComparada.className   = cls;
  }

  function buildCuentaDetalle(nombreCuenta){
    if (!$cuentaHistBody || !$cuentaChart) return;

    document.querySelectorAll(".row-menu").forEach(el => el.remove());

const regsOrdenados = state.registros
  .map((r, idx) => ({ ...r, _idx: idx }))
  .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));


    const puntos = [];

    regsOrdenados.forEach(r => {
      if (!r.saldos) return;
      const v = r.saldos[nombreCuenta];
      if (!Number.isFinite(v)) return;
      puntos.push({ fecha: r.fecha, valor: v, _idx: r._idx });
    });

    const ctx = $cuentaChart.getContext("2d");
    ctx.clearRect(0, 0, $cuentaChart.width, $cuentaChart.height);

    $cuentaHistBody.innerHTML = "";
    if (!puntos.length){
      if ($cuentaTooltip) $cuentaTooltip.textContent = "Sin movimientos para esta cuenta.";
      return;
    }

    let prevVal = null;
    let lastDiff = 0;

    puntos.forEach(p => {
      let diffStr = "—";
      let pctStr  = "—";
      let diff    = 0;
      let pct     = 0;

      if (prevVal !== null){
        diff = p.valor - prevVal;
        diffStr = numberToEs(diff);
        if (prevVal !== 0){
          pct = diff / prevVal;
          pctStr = pctToEs(pct);
        } else {
          pctStr = "—";
        }
        lastDiff = diff;
      }

      const reg = state.registros[p._idx];

      const tr = document.createElement("tr");

      const tdFecha = document.createElement("td");
      tdFecha.textContent = p.fecha;

      const tdValor = document.createElement("td");
      tdValor.textContent = numberToEs(p.valor);

      const tdDiffEur = document.createElement("td");
      tdDiffEur.textContent = diffStr;

      const tdDiffPct = document.createElement("td");
      tdDiffPct.textContent = pctStr;

      if (diff < 0){
        tdDiffEur.classList.add("neg");
        tdDiffPct.classList.add("neg");
      } else if (diff > 0){
        tdDiffEur.classList.add("pos");
        tdDiffPct.classList.add("pos");
      }

      const tdAcc = document.createElement("td");
      tdAcc.className = "actions-cell";

      const dotsBtn = document.createElement("button");
      dotsBtn.type = "button";
      dotsBtn.className = "dots-btn";
      dotsBtn.textContent = "⋮";
      dotsBtn.title = "Acciones";

      const menu = document.createElement("div");
      menu.className = "row-menu";

      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.textContent = "Editar";

      btnEdit.addEventListener("click", () => {
        if (!reg) return;
        const actual = (reg.saldos && Number.isFinite(reg.saldos[nombreCuenta]))
          ? reg.saldos[nombreCuenta]
          : 0;

        const nuevoStr = prompt(
          `Nuevo valor para "${nombreCuenta}" el ${reg.fecha}:`,
          numberToEs(actual)
        );
        if (nuevoStr == null) return;

        const nuevoNum = esToNumber(nuevoStr);
        if (!Number.isFinite(nuevoNum)) return;

        if (!reg.saldos) reg.saldos = {};
        reg.saldos[nombreCuenta] = nuevoNum;

        reg.total = Object.values(reg.saldos).reduce(
          (a,b)=> a + (Number.isFinite(b)?b:0), 0
        );

        state.registros[p._idx] = reg;
        recalcVariaciones();
        persistLocal();
        renderTabla();
        renderDashboard();

        if (window.firebase && state.uid){
          firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
            cuentas: state.cuentas,
            registros: state.registros,
              objetivos : state.objetivos,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
          }).catch(console.error);
        }

        buildCuentaDetalle(nombreCuenta);
      });

      const btnDelete = document.createElement("button");
      btnDelete.type = "button";
      btnDelete.textContent = "Eliminar";

      btnDelete.addEventListener("click", () => {
        if (!reg) return;
        if (!confirm(`Borrar el registro de ${reg.fecha}?`)) return;
        state.registros.splice(p._idx, 1);
        recalcVariaciones();
        persistLocal();
        renderTabla();
        renderDashboard();
        if (window.firebase && state.uid){
          firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
            cuentas: state.cuentas,
            registros: state.registros,
              objetivos : state.objetivos,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
          }).catch(console.error);
        }
        buildCuentaDetalle(nombreCuenta);
      });

      menu.append(btnEdit, btnDelete);
      document.body.append(menu);

      dotsBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        document.querySelectorAll(".row-menu.open").forEach(m => {
          if (m !== menu) m.classList.remove("open");
        });

        const isOpen = menu.classList.contains("open");
        if (isOpen){
          menu.classList.remove("open");
          return;
        }

        const rect = dotsBtn.getBoundingClientRect();
        const menuWidth = 140;
        const top  = rect.bottom + 6;
        const left = Math.max(8, rect.right - menuWidth);

        menu.style.top  = `${top}px`;
        menu.style.left = `${left}px`;
        menu.classList.add("open");

        const closeMenu = (ev) => {
          if (!menu.contains(ev.target) && ev.target !== dotsBtn){
            menu.classList.remove("open");
            document.removeEventListener("click", closeMenu);
          }
        };
        document.addEventListener("click", closeMenu);
      });

      tdAcc.append(dotsBtn);
      tr.append(tdFecha, tdValor, tdDiffEur, tdDiffPct, tdAcc);
      $cuentaHistBody.append(tr);

      prevVal = p.valor;
    });

    if ($modalCuentaDialog){
      $modalCuentaDialog.classList.remove("pos","neg");
      if (lastDiff > 0)      $modalCuentaDialog.classList.add("pos");
      else if (lastDiff < 0) $modalCuentaDialog.classList.add("neg");
    }

    drawCuentaChart($cuentaChart, puntos);
  }

  function drawCuentaChart(canvas, puntos){
    if (!canvas || !puntos.length) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const padding = 20;

    ctx.clearRect(0,0,w,h);

    const xsTime = puntos.map(p => new Date(p.fecha).getTime());
    const ysVal  = puntos.map(p => p.valor);

    let minX = Math.min(...xsTime);
    let maxX = Math.max(...xsTime);
    if (minX === maxX) maxX = minX + 24*60*60*1000;

    const minY = 0;
    let maxY = Math.max(...ysVal);
    if (!isFinite(maxY) || maxY <= 0) maxY = 1;

    const xScale = t => padding + ((t - minX) / (maxX - minX)) * (w - 2*padding);
    const yScale = v => h - padding - ((v - minY) / (maxY - minY)) * (h - 2*padding);

    const points = puntos.map(p => {
      const t = new Date(p.fecha).getTime();
      return { t, valor: p.valor, x: xScale(t), y: yScale(p.valor) };
    });

    canvas._chartData = { points, minX, maxX, minY, maxY, padding, w, h };
    canvas._puntos = puntos.slice();

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding/2);
    ctx.lineTo(padding, h - padding);
    ctx.lineTo(w - padding/2, h - padding);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "#67d5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (points.length === 1){
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[0].x, points[0].y);
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++){
        const p0 = i > 0 ? points[i-1] : points[i];
        const p1 = points[i];
        const p2 = points[i+1];
        const p3 = i+2 < points.length ? points[i+2] : p2;

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    for (let i = 0; i < points.length; i++){
      let color = "#cccccc";
      if (i > 0){
        const diff = points[i].valor - points[i-1].valor;
        if (diff > 0)      color = "#35c759";
        else if (diff < 0) color = "#ff453a";
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, 3, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    if (typeof canvas._hoverT === "number"){
      const hoverT = canvas._hoverT;
      const tooltipEl = document.getElementById("cuenta-tooltip");

      const {minX,maxX} = canvas._chartData;

      const tClamped = Math.max(minX, Math.min(maxX, hoverT));

      let v   = points[0].valor;
      let dir = 0;
      let yVal= points[0].y;

      if (tClamped <= points[0].t){
        v = points[0].valor;
        yVal = points[0].y;
        dir = 0;
      } else if (tClamped >= points[points.length-1].t){
        const a = points[points.length-2];
        const b = points[points.length-1];
        v = b.valor;
        yVal = b.y;
        dir = b.valor - a.valor;
      } else {
        for (let i = 0; i < points.length-1; i++){
          const a = points[i];
          const b = points[i+1];
          if (tClamped >= a.t && tClamped <= b.t){
            const ratio = (tClamped - a.t) / (b.t - a.t);
            v    = a.valor + (b.valor - a.valor) * ratio;
            yVal = yScale(v);
            dir  = b.valor - a.valor;
            break;
          }
        }
      }

      const xCursor = xScale(tClamped);

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.setLineDash([4,3]);
      ctx.beginPath();
      ctx.moveTo(xCursor, padding/2);
      ctx.lineTo(xCursor, h - padding);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = dir >= 0 ? "#35c759" : "#ff453a";
      ctx.beginPath();
      ctx.arc(xCursor, yVal, 4, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      if (tooltipEl){
        const date = new Date(tClamped);
        const iso = !isNaN(date) ? date.toISOString().slice(0,10) : "";
        tooltipEl.textContent = iso ? `${iso} · ${numberToEs(v)}` : numberToEs(v);
      }
    }
  }

  const $periodo = document.getElementById("periodo");
  if($periodo){
$periodo.addEventListener("change", () => {
  modoSparkline = "periodo";
  renderDashboard();
});  }

  // ------- Persistencia -------
function persistLocal(){
  localStorage.setItem(KEY_DATA,    JSON.stringify(state.registros));
  localStorage.setItem(KEY_CUENTAS, JSON.stringify(state.cuentas));
  localStorage.setItem(KEY_OBJETIVOS, JSON.stringify(state.objetivos));

  // avisamos al calendario (y otros) de que hay datos nuevos
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent("finanzas-data-updated"));
    } catch (e) {
      console.error(e);
    }
  }
}



  // ------- CSV -------
  function registrosToCSV(){
    const cuentas=state.cuentas;
    const headers=["Fecha",...cuentas,"TOTAL","Variación","%Var"];
    const rows=[headers.join(",")];

    state.registros.forEach(r=>{
      const vals=cuentas.map(c=>(r.saldos[c]||0).toFixed(2));
      rows.push([
        r.fecha,
        ...vals,
        r.total.toFixed(2),
        r.variacion.toFixed(2),
        (r.varpct*100).toFixed(2)+"%"
      ].join(","));
    });

    return rows.join("\n");
  }

  function download(filename,text){
    const blob=new Blob([text],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onExportar(){
    download("mis_cuentas_fase1.csv",registrosToCSV());
  }

  async function onImportar(){
    const file=document.getElementById("file-csv").files[0];
    if(!file){ alert("Selecciona un CSV."); return; }

    const txt=await file.text();
    const lines=txt.trim().split(/\r?\n/);
    const headers=lines[0].split(",");
    const fechaIdx=headers.indexOf("Fecha");
    const cuentas=headers.filter(h=>!["Fecha","TOTAL","Variación","%Var"].includes(h));

    if(cuentas.length){
      state.cuentas=cuentas;
      persistLocal();
    }

    const registros=[];
    for(let i=1;i<lines.length;i++){
      const cols=lines[i].split(",");
      if(!cols[fechaIdx]) continue;
      const fecha=cols[fechaIdx];
      const saldos={};
      state.cuentas.forEach(c=>{
        const colIdx=headers.indexOf(c);
        saldos[c]=esToNumber(cols[colIdx]);
      });
      const total=Object.values(saldos).reduce((a,b)=>a+b,0);
      registros.push({fecha,saldos,total,variacion:0,varpct:0});
    }

    state.registros=registros;
    recalcVariaciones();
    persistLocal();
    renderInputs({});
    renderTabla();
    renderDashboard();

    try{
      if (window.firebase && state.uid){
        setStatus("Sincronizando…");
        await firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
          cuentas: state.cuentas,
          registros: state.registros,
            objetivos : state.objetivos,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        setStatus("✔ Sincronizado"); setTimeout(()=>setStatus(""),1200);
      }
    }catch(e){
      console.error(e);
      setStatus("✖ Error sync");
    }
  }

  function borrarTodo(){
    if(!confirm("Borrar todos los datos?")) return;
    state.registros=[];
    persistLocal();
    renderTabla();
    renderDashboard();
    if (window.firebase && state.uid){
      firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
        cuentas: state.cuentas, registros: [],   objetivos : state.objetivos,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(console.error);
    }
  }

  function addCuenta(){
    const nombre=prompt("Nombre de la cuenta:");
    if(!nombre) return;
    if(state.cuentas.indexOf(nombre)>=0){
      alert("Ya existe.");
      return;
    }
    state.cuentas.push(nombre);
    persistLocal();
    renderInputs({});
    renderTabla();
    renderDashboard();
    if (window.firebase && state.uid){
      firebase.database().ref(`/users/${state.uid}/finanzas/fase1/cuentas`).set(state.cuentas).catch(console.error);
    }
  }

  function deleteCuenta(){
    if (!state.cuentas.length){
      alert("No hay cuentas para eliminar.");
      return;
    }

    let msg = "Elige la cuenta a borrar:\n\n";
    state.cuentas.forEach((c,i)=>{
      msg += `${i+1}. ${c}\n`;
    });
    msg += "\nIntroduce el número de cuenta:";

    const resp = prompt(msg,"");
    if (resp === null) return;
    const idx = parseInt(resp,10) - 1;
    if (Number.isNaN(idx) || idx<0 || idx>=state.cuentas.length){
      alert("Número no válido.");
      return;
    }

    const nombre = state.cuentas[idx];
    if (!confirm(`¿Seguro que quieres eliminar la cuenta "${nombre}" de todos los registros?`)) return;

    state.cuentas.splice(idx,1);
    hiddenCols.delete(nombre);
    saveHidden();

    state.registros.forEach(r=>{
      if (r.saldos && Object.prototype.hasOwnProperty.call(r.saldos, nombre)){
        delete r.saldos[nombre];
      }
      r.total = Object.values(r.saldos || {}).reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);
    });

    recalcVariaciones();
    persistLocal();
    renderInputs({});
    renderTabla();
    renderDashboard();

    if (state.cuentaSeleccionada === nombre){
      closeCuentaModal();
    }

    if (window.firebase && state.uid){
      firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
        cuentas: state.cuentas,
        registros: state.registros,
          objetivos : state.objetivos,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(console.error);
    }
  }

  // ------- Actualizar sólo una cuenta (desde modal detalle) -------
  function onActualizarCuentaIndividual(){
    const cta = state.cuentaSeleccionada;
    if (!cta){
      alert("Ninguna cuenta seleccionada.");
      return;
    }

    const regs = getSortedRegistros();
    let last = null;
    for (let i = regs.length - 1; i >= 0; i--){
      const r = regs[i];
      if (r.saldos && Number.isFinite(r.saldos[cta])){
        last = r;
        break;
      }
    }

const defaultFecha = ymd(new Date());

    const defaultValor = last ? last.saldos[cta] : 0;

    openIndivModal(defaultFecha, defaultValor);
  }

  function upsertRegistroCuenta(nombreCuenta, fechaStr, valorNum){
    let idx = state.registros.findIndex(r => r.fecha === fechaStr);

if (idx >= 0) {
  // --------- La fecha ya existe → solo tocar UNA cuenta ---------
  const r = state.registros[idx];
  if (!r.saldos) r.saldos = {};

  r.saldos[nombreCuenta] = valorNum;

  r.total = Object.values(r.saldos)
    .reduce((a,b)=> a + (Number.isFinite(b)?b:0), 0);

} else {
  // --------- Fecha nueva → solo la cuenta editada ---------
  const saldos = {};
  saldos[nombreCuenta] = valorNum;

  const total = valorNum;

  state.registros.push({
    fecha: fechaStr,
    saldos,
    total,
    variacion: 0,
    varpct: 0
  });
}


    recalcVariaciones();
    persistLocal();
    renderTabla();
    renderDashboard();

    if (window.firebase && state.uid){
      firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
        cuentas: state.cuentas,
        registros: state.registros,
          objetivos : state.objetivos,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }).catch(console.error);
    }
  }

  // ------- Cloud listener (opcional) -------
function attachCloudListeners(){
  if (!window.firebase || !state.uid) return;

  if (cloudRef){
    try{
      cloudRef.off();
    }catch(e){
      console.error(e);
    }
  }

  cloudRef = firebase.database().ref(`/users/${state.uid}/finanzas/fase1`);
  cloudRef.on("value", snap => {
    const v = snap.val();
    if (!v) return;

    if (Array.isArray(v.cuentas) && v.cuentas.length){
      state.cuentas = v.cuentas;
    }
    if (Array.isArray(v.registros)){
      state.registros = v.registros;
    }
    if (v.objetivos && typeof v.objetivos === "object"){
      state.objetivos = v.objetivos;
    }


    recalcVariaciones();

    persistLocal();

renderInputs({});
renderTabla();
renderDashboard();

// si existe finanzas.js, que repinte
if (typeof window !== "undefined" && typeof window.renderGastosPanel === "function"){
  window.renderGastosPanel();
}


    setStatus("↻ Actualizado");

    setTimeout(() => setStatus(""), 1000);
  });
}


  // interacción tipo Revolut en la gráfica de cuenta
  if ($cuentaChart){
    let draggingCuenta = false;

    function updateCuentaHover(evt){
      const data = $cuentaChart._chartData;
      if (!data) return;
      const rect = $cuentaChart.getBoundingClientRect();
      const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
      const x = clientX - rect.left;

      const { minX, maxX, padding, w } = data;
      const usableWidth = w - 2*padding;
      if (usableWidth <= 0) return;

      const clampedX = Math.max(padding, Math.min(w - padding, x));
      const ratio = (clampedX - padding) / usableWidth;
      const t = minX + ratio * (maxX - minX);

      $cuentaChart._hoverT = t;
      drawCuentaChart($cuentaChart, $cuentaChart._puntos || []);
    }

    $cuentaChart.addEventListener("pointerdown", evt => {
      draggingCuenta = true;
      updateCuentaHover(evt);
    });

    $cuentaChart.addEventListener("pointermove", evt => {
      if (!draggingCuenta) return;
      updateCuentaHover(evt);
    });

    window.addEventListener("pointerup", () => {
      draggingCuenta = false;
    });

    $cuentaChart.addEventListener("pointerleave", () => {
      draggingCuenta = false;
    });
  }
// ------- Tabs Cuentas / Objetivos / Gastos -------
const $tabButtons = document.querySelectorAll(".tabs .tab");
const $tabPanels  = document.querySelectorAll(".tab-panel");

function activarTab(name){
  // Paneles: sólo uno visible SIEMPRE
  $tabPanels.forEach(sec => {
    if (!sec.id) return;
    const key = sec.id.replace("tab-","");
    const isActive = key === name;

    sec.hidden = !isActive;
    sec.style.display = isActive ? "" : "none";
    sec.classList.toggle("is-active", isActive);
  });

  // Botones
  $tabButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });

  // Redibujar gastos al entrar
if (name === "gastos" &&
    typeof window !== "undefined" &&
    typeof window.renderGastosPanel === "function"){
  window.renderGastosPanel();
}

}

$tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.tab;
    if (!name) return;
    activarTab(name);
  });
});

// Tab por defecto
activarTab("cuentas");

  // ------- Init -------
(function init(){
  const today=new Date();
  if ($fecha) $fecha.value=ymd(today);


  recalcVariaciones();
  renderInputs({});
  renderTabla();
  renderDashboard();

  // --- NUEVO ---
  drawTotalSparkline("total");
  setGuardarLabel();

  const storedUid = getUid();
  if (storedUid){
    applyUid(storedUid);
    hideLogin();
  } else {
    showLogin();
  }
})();
// ======== EXPORTS GLOBALES PARA OTROS JS ========
// ======== EXPORTS GLOBALES PARA OTROS JS ========
window.FIN_GLOBAL = {
  getCuentas() {
    return Array.isArray(state.cuentas) ? [...state.cuentas] : [];
  },

  getRegistros() {
    return Array.isArray(state.registros)
      ? JSON.parse(JSON.stringify(state.registros))
      : [];
  },

  getLastRegistro() {
    if (!state.registros.length) return null;
    return JSON.parse(
      JSON.stringify(state.registros[state.registros.length - 1])
    );
  },

  // Último saldo conocido por cuenta (escaneando todos los registros)
  getSaldosActuales() {
    const regs = Array.isArray(state.registros) ? state.registros : [];
    if (!regs.length) return {};

    const cuentas = Array.isArray(state.cuentas) ? state.cuentas : [];
    const ordered = [...regs].sort((a, b) => {
      const da = new Date(a.fecha);
      const db = new Date(b.fecha);
      return da - db;
    });

    const lastSaldos = {};
    cuentas.forEach((cta) => {
      lastSaldos[cta] = undefined;
    });

    ordered.forEach((r) => {
      if (!r || !r.saldos) return;
      cuentas.forEach((cta) => {
        const v = r.saldos[cta];
        if (Number.isFinite(v)) {
          lastSaldos[cta] = v;
        }
      });
    });

    const out = {};
    cuentas.forEach((cta) => {
      const v = lastSaldos[cta];
      if (Number.isFinite(v)) out[cta] = v;
    });

    return out;
  }
};

console.log("[GLOBAL] FIN_GLOBAL listo");

})();