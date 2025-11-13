(function(){
  // ------- Utils EUR/PTC -------
  function esToNumber(s){
    if (s == null) return 0;
    if (typeof s === "number") return s;
    s = String(s).replace(/\s/g,"").replace("€","").replace(/\./g,"").replace(",",".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  function numberToEs(n, opts){ return new Intl.NumberFormat("es-ES", opts||{style:"currency",currency:"EUR"}).format(n); }
  function pctToEs(n){ return new Intl.NumberFormat("es-ES",{style:"percent",maximumFractionDigits:2}).format(n); }

  // ------- Estado -------
  const KEY_DATA = "mis_cuentas_fase1_data";
  const KEY_CUENTAS = "mis_cuentas_fase1_cuentas";
  const KEY_UID = "mis_cuentas_uid";
  const KEY_HIDDEN_COLS = "mis_cuentas_hidden_cols_by_name"; // guardamos NOMBRES
  const DEFAULT_CUENTAS = [
    "Principal","Myinvestor","Revolut Main","Revolut remunerada",
    "Revolut inversión","Revolut Bitcoin","Kraken","Wallet Bitcoin"
  ];

  // UID local (sin auth)
  function getOrCreateUid(){
    let id = localStorage.getItem(KEY_UID);
    if(!id){
      id = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY_UID, id);
    }
    return id;
  }

  const state = {
    uid: getOrCreateUid(),
    cuentas: JSON.parse(localStorage.getItem(KEY_CUENTAS)) || DEFAULT_CUENTAS,
    registros: JSON.parse(localStorage.getItem(KEY_DATA)) || [],
    editingIndex: -1
  };

  // columnas ocultas por NOMBRE (persistentes)
  let hiddenCols = new Set(JSON.parse(localStorage.getItem(KEY_HIDDEN_COLS) || "[]"));
  function saveHiddenCols(){ localStorage.setItem(KEY_HIDDEN_COLS, JSON.stringify([...hiddenCols])); }

  // ------- DOM -------
  const $fecha = document.getElementById("fecha");
  const $wrapper = document.getElementById("cuentas-wrapper");
  const $total = document.getElementById("total");
  const $var = document.getElementById("variacion");
  const $varpct = document.getElementById("varpct");
  const $tabla = document.getElementById("tabla-historial");
  const $status = document.getElementById("status");
  function setStatus(txt){ $status.textContent = txt||""; }

  const $btnGuardar = document.getElementById("btn-guardar");
  const $actionsPanels = document.querySelectorAll(".panel .actions");
  let $btnCancelarEdicion = null;

  document.getElementById("btn-guardar").addEventListener("click", onGuardar);
  document.getElementById("btn-limpiar").addEventListener("click", () => { state.editingIndex=-1; setGuardarLabel(); renderInputs({}); });
  const $btnExportar = document.getElementById("btn-exportar");
  if($btnExportar) $btnExportar.addEventListener("click", onExportar);
  const $btnImportar = document.getElementById("btn-importar");
  if($btnImportar) $btnImportar.addEventListener("click", onImportar);
  document.getElementById("btn-reset").addEventListener("click", borrarTodo);
  document.getElementById("btn-add-cuenta").addEventListener("click", addCuenta);

  // ------- Render inputs -------
  function renderInputs(valores){
    $wrapper.innerHTML = "";
    state.cuentas.forEach(c => {
      const row = document.createElement("div"); row.className="item";
      const label = document.createElement("label"); label.textContent=c;
      const input = document.createElement("input");
      input.type="text"; input.inputMode="decimal"; input.placeholder="0,00 €"; input.autocomplete="off";
      input.style.fontSize = "16px"; // anti-zoom iOS
      input.value = valores && (valores[c]!==undefined) ? valores[c] : "";
      input.addEventListener("input", calcularTotal);
      row.append(label,input); $wrapper.append(row);
    });
    calcularTotal();
  }
  function setInputsFromSaldos(saldos){
    const rows = $wrapper.querySelectorAll(".item");
    rows.forEach(row=>{
      const name = row.querySelector("label").textContent;
      const inp = row.querySelector("input");
      const val = saldos[name]||0;
      inp.value = numberToEs(val);
    });
    calcularTotal();
  }
  function leerInputs(){
    const saldos = {};
    [].slice.call($wrapper.querySelectorAll(".item")).forEach(row=>{
      const cta = row.querySelector("label").textContent;
      const val = row.querySelector("input").value;
      saldos[cta] = esToNumber(val);
    });
    return saldos;
  }

  // ------- Cálculo -------
  function calcularTotal(){
    const saldos = leerInputs();
    const total = Object.values(saldos).reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);
    const prev = state.registros.length ? state.registros[state.registros.length-1].total : 0;
    const variacion = total - prev;
    const varpct = prev !== 0 ? (variacion/prev) : 0;
    $total.textContent = numberToEs(total);
    $var.textContent = numberToEs(variacion);
    $varpct.textContent = pctToEs(varpct);
    return {total, variacion, varpct};
  }

  function recalcVariaciones(){
    state.registros.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
    for(let i=0;i<state.registros.length;i++){
      const prev = i>0 ? state.registros[i-1].total : 0;
      const t = state.registros[i].total;
      state.registros[i].variacion = t - prev;
      state.registros[i].varpct = prev!==0 ? (t-prev)/prev : 0;
    }
  }

  function setGuardarLabel(){
    $btnGuardar.textContent = state.editingIndex>=0 ? "Actualizar registro" : "Guardar registro";
    if(state.editingIndex>=0){
      if(!$btnCancelarEdicion){
        $btnCancelarEdicion = document.createElement("button");
        $btnCancelarEdicion.id = "btn-cancelar-edicion";
        $btnCancelarEdicion.textContent = "Cancelar edición";
        $btnCancelarEdicion.addEventListener("click", ()=>{
          state.editingIndex = -1;
          setGuardarLabel();
          renderInputs({});
        });
        if($actionsPanels[0]) $actionsPanels[0].appendChild($btnCancelarEdicion);
      }
      $btnCancelarEdicion.style.display = "";
    }else if($btnCancelarEdicion){
      $btnCancelarEdicion.style.display = "none";
    }
  }

  // ------- Guardar local + nube (sin auth) -------
  async function onGuardar(){
    const fecha = $fecha.value;
    if(!fecha) return alert("Pon una fecha.");
    const { total, variacion, varpct } = calcularTotal();
    const saldos = leerInputs();

    if(state.editingIndex>=0){
      state.registros[state.editingIndex] = { fecha, saldos, total, variacion, varpct };
      recalcVariaciones();
      state.editingIndex = -1;
      setGuardarLabel();
    }else{
      state.registros.push({ fecha, saldos, total, variacion, varpct });
      recalcVariaciones();
    }

    persistLocal();
    renderTabla();

    try{
      setStatus("Guardando…");
      const ref = firebase.database().ref(`/users/${state.uid}/finanzas/fase1`);
      await ref.set({
        cuentas: state.cuentas,
        registros: state.registros,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      setStatus("✔ Guardado");
      setTimeout(()=>setStatus(""),1200);
    }catch(e){
      console.error(e);
      setStatus("✖ Error guardando (revisa reglas RTDB)");
    }
  }

  // ------- Helpers tabla (ocultar/mostrar columnas) -------
  function setColVisibilityByName(tableEl, cols, colName, visible){
    const idx = cols.indexOf(colName);
    if(idx<0) return;
    // body
    tableEl.querySelectorAll("tbody tr").forEach(tr=>{
      const cell = tr.children[idx];
      if(cell) cell.style.display = visible ? "" : "none";
    });
    // header: mantenemos visible para poder reactivar (+), solo bajamos opacidad
    const th = tableEl.querySelector("thead tr").children[idx];
    if(th){
      th.classList.toggle("col-hidden", !visible);
      const btn = th.querySelector(".col-toggle");
      if(btn){
        btn.textContent = visible ? "−" : "+";
        btn.title = visible ? `Ocultar ${colName}` : `Mostrar ${colName}`;
      }
    }
  }
  function makeToggleBtn(colName, isHidden){
    const btn = document.createElement("button");
    btn.className = "col-toggle";
    btn.type = "button";
    btn.textContent = isHidden ? "+" : "−";
    btn.title = isHidden ? `Mostrar ${colName}` : `Ocultar ${colName}`;
    btn.addEventListener("click", () => {
      const table = $tabla.querySelector("table");
      const cols = currentColsCache;
      const nowHidden = !hiddenCols.has(colName);
      if(nowHidden) hiddenCols.add(colName); else hiddenCols.delete(colName);
      saveHiddenCols();
      setColVisibilityByName(table, cols, colName, !nowHidden);
    });
    return btn;
  }

  let currentColsCache = [];

  // ------- Tabla (editar/borrar + ocultar columnas) -------
  function renderTabla(){
    const cuentas = state.cuentas;
    const cols = ["Fecha", ...cuentas, "TOTAL","Variación","%Var"]; // sin Acciones
    currentColsCache = cols.slice();

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");

    cols.forEach((c, idx)=>{
      const th=document.createElement("th");
      th.className = "col-header";
      if(idx===0) th.classList.add("sticky-col");
      // título + botón (para que el +/− SIEMPRE sea visible)
      const title = document.createElement("span");
      title.className = "col-title";
      title.textContent = c;
      th.append(title);
      if(idx>0){
        const toggle = makeToggleBtn(c, hiddenCols.has(c));
        th.append(toggle);
      }
      trh.append(th);
    });
    // Columna Acciones (no ocultable)
    const thAct = document.createElement("th");
    thAct.textContent = "Acciones";
    trh.append(thAct);

    thead.append(trh);

    const tbody = document.createElement("tbody");
    state.registros.forEach((r, idxRow)=>{
      const tr=document.createElement("tr");
      // Fecha (sticky)
      const tdF=document.createElement("td");
      tdF.className = "sticky-col";
      tdF.textContent=r.fecha; tr.append(tdF);
      // Cuentas
      cuentas.forEach(c=>{
        const td=document.createElement("td");
        td.textContent = numberToEs(r.saldos[c]||0);
        tr.append(td);
      });
      // Totales
      const tdT=document.createElement("td"); tdT.textContent=numberToEs(r.total); tr.append(tdT);
      const tdV=document.createElement("td"); tdV.textContent=numberToEs(r.variacion); tr.append(tdV);
      const tdP=document.createElement("td"); tdP.textContent=pctToEs(r.varpct); tr.append(tdP);

      // Acciones
      const tdA=document.createElement("td");
      tdA.className = "actions-cell";
      const btnE = document.createElement("button");
      btnE.type="button"; btnE.className="row-btn"; btnE.textContent="✎"; btnE.title="Editar";
      btnE.addEventListener("click", ()=>{
        state.editingIndex = idxRow;
        setGuardarLabel();
        $fecha.value = r.fecha;
        renderInputs({});
        setInputsFromSaldos(r.saldos);
      });
      const btnD = document.createElement("button");
      btnD.type="button"; btnD.className="row-btn"; btnD.textContent="🗑"; btnD.title="Borrar";
      btnD.addEventListener("click", ()=>{
        if(!confirm(`Borrar el registro de ${r.fecha}?`)) return;
        state.registros.splice(idxRow,1);
        recalcVariaciones();
        persistLocal();
        renderTabla();
        firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
          cuentas: state.cuentas, registros: state.registros, updatedAt: firebase.database.ServerValue.TIMESTAMP
        }).catch(console.error);
      });
      tdA.append(btnE, btnD);
      tr.append(tdA);

      tbody.append(tr);
    });

    table.append(thead, tbody);
    $tabla.innerHTML = "";
    $tabla.append(table);

    // ancho mínimo para que no se colapse (140px por col aprox + 120 acciones)
    table.style.minWidth = (cols.length * 140 + 120) + "px";

    // aplica visibilidad guardada
    hiddenCols.forEach(name => setColVisibilityByName(table, cols, name, false));
  }

  // ------- Persistencia local -------
  function persistLocal(){
    localStorage.setItem(KEY_DATA, JSON.stringify(state.registros));
    localStorage.setItem(KEY_CUENTAS, JSON.stringify(state.cuentas));
  }

  // ------- CSV -------
  function registrosToCSV(){
    const cuentas = state.cuentas;
    const headers = ["Fecha", ...cuentas, "TOTAL","Variación","%Var"];
    const rows = [headers.join(",")];
    state.registros.forEach(r=>{
      const vals = cuentas.map(c => (r.saldos[c]||0).toFixed(2));
      const total = r.total.toFixed(2);
      const vari = r.variacion.toFixed(2);
      const varp = (r.varpct*100).toFixed(2)+"%";
      rows.push([r.fecha, ...vals, total, vari, varp].join(","));
    });
    return rows.join("\n");
  }
  function download(filename, text){
    const blob = new Blob([text],{type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function onExportar(){ download("mis_cuentas_fase1.csv", registrosToCSV()); }

  async function onImportar(){
    const file = document.getElementById("file-csv").files[0];
    if(!file){ alert("Selecciona un CSV."); return; }
    const txt = await file.text();
    const lines = txt.trim().split(/\r?\n/);
    const headers = lines[0].split(",");
    const fechaIdx = headers.indexOf("Fecha");
    const cuentas = headers.filter(h => !["Fecha","TOTAL","Variación","%Var"].includes(h));
    if (cuentas.length){
      state.cuentas = cuentas;
      persistLocal();
    }
    const registros = [];
    for(let i=1;i<lines.length;i++){
      const cols = lines[i].split(",");
      if(!cols[fechaIdx]) continue;
      const fecha = cols[fechaIdx];
      const saldos = {};
      state.cuentas.forEach(c=>{
        const colIdx = headers.indexOf(c);
        saldos[c] = esToNumber(cols[colIdx]);
      });
      const total = Object.values(saldos).reduce((a,b)=>a+b,0);
      registros.push({fecha, saldos, total, variacion:0, varpct:0});
    }
    state.registros = registros;
    recalcVariaciones();
    persistLocal();
    renderInputs({});
    renderTabla();
    try{
      setStatus("Sincronizando…");
      await firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
        cuentas: state.cuentas, registros: state.registros, updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      setStatus("✔ Sincronizado");
      setTimeout(()=>setStatus(""),1200);
    }catch(e){ console.error(e); setStatus("✖ Error sync"); }
  }

  function borrarTodo(){
    if(!confirm("Borrar todos los datos?")) return;
    state.registros = [];
    persistLocal();
    renderTabla();
    firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
      cuentas: state.cuentas, registros: [], updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).catch(console.error);
  }

  function addCuenta(){
    const nombre = prompt("Nombre de la cuenta:");
    if(!nombre) return;
    if(state.cuentas.indexOf(nombre)>=0){ alert("Ya existe."); return; }
    state.cuentas.push(nombre);
    persistLocal();
    renderInputs({});
    renderTabla();
    firebase.database().ref(`/users/${state.uid}/finanzas/fase1/cuentas`).set(state.cuentas).catch(console.error);
  }

  // ------- Listener remoto (opcional) -------
  function attachCloudListeners(){
    const base = firebase.database().ref(`/users/${state.uid}/finanzas/fase1`);
    base.on("value", snap=>{
      const v = snap.val(); if(!v) return;
      if (Array.isArray(v.cuentas) && v.cuentas.length) state.cuentas = v.cuentas;
      if (Array.isArray(v.registros)) state.registros = v.registros;
      persistLocal();
      renderInputs({});
      renderTabla();
      setStatus("↻ Actualizado desde la nube");
      setTimeout(()=>setStatus(""),1000);
    });
  }

  // ------- Init -------
  (function init(){
    const today = new Date(); const y=today.getFullYear(); const m=String(today.getMonth()+1).padStart(2,"0"); const d=String(today.getDate()).padStart(2,"0");
    document.getElementById("fecha").value = `${y}-${m}-${d}`;
    renderInputs({});
    renderTabla();
    attachCloudListeners(); // sin auth
    setGuardarLabel();
  })();
})();