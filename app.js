(function(){
  // ------- Utils -------
  function esToNumber(s){
    if (s == null) return 0;
    if (typeof s === "number") return s;
    s = String(s).replace(/\s/g,"").replace("€","").replace(/\./g,"").replace(",",".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  function numberToEs(n, opts){ return new Intl.NumberFormat("es-ES", opts||{style:"currency",currency:"EUR"}).format(n); }
  function pctToEs(n){ return new Intl.NumberFormat("es-ES",{style:"percent",maximumFractionDigits:2}).format(n); }
  function ymd(d){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),da=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${da}`; }

  // ------- Estado -------
  const KEY_DATA="mis_cuentas_fase1_data", KEY_CUENTAS="mis_cuentas_fase1_cuentas", KEY_UID="mis_cuentas_uid", KEY_HIDDEN="mis_cuentas_hidden_cols_by_name";
  const DEFAULT_CUENTAS=["Principal","Myinvestor","Revolut Main","Revolut remunerada","Revolut inversión","Revolut Bitcoin","Kraken","Wallet Bitcoin"];
  function getOrCreateUid(){ let id=localStorage.getItem(KEY_UID); if(!id){ id="u_"+Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem(KEY_UID,id);} return id; }

  const state={
    uid:getOrCreateUid(),
    cuentas: JSON.parse(localStorage.getItem(KEY_CUENTAS)) || DEFAULT_CUENTAS,
    registros: JSON.parse(localStorage.getItem(KEY_DATA)) || [],
    editingIndex:-1
  };
  let hiddenCols = new Set(JSON.parse(localStorage.getItem(KEY_HIDDEN) || "[]"));
  function saveHidden(){ localStorage.setItem(KEY_HIDDEN, JSON.stringify([...hiddenCols])); }

  // ------- DOM -------
  const $fecha = document.getElementById("fecha");
  const $wrapper = document.getElementById("cuentas-wrapper");
  const $total = document.getElementById("total");
  const $var = document.getElementById("variacion");
  const $varpct = document.getElementById("varpct");
  const $tabla = document.getElementById("tabla-historial");
  const $restore = document.getElementById("col-restore");
  const $status = document.getElementById("status");
  const $dashboard = document.getElementById("dashboard");

  // modales
  const $modal = document.getElementById("modal");
  const $btnAbrirModal = document.getElementById("btn-abrir-modal");
  const $btnCerrarModal = document.getElementById("btn-cerrar-modal");
  const $modalBackdrop = document.getElementById("modal-close");

  const $modalHistorial = document.getElementById("modal-historial");
  const $btnHistorial = document.getElementById("btn-historial");
  const $btnCerrarModalHistorial = document.getElementById("btn-cerrar-modal-historial");
  const $modalHistorialBackdrop = document.getElementById("modal-historial-close");

  const $modalCuenta = document.getElementById("modal-cuenta");
  const $modalCuentaDialog = document.querySelector("#modal-cuenta .modal__dialog");
  const $modalCuentaTitle = document.getElementById("modal-cuenta-title");
  const $modalCuentaBackdrop = document.getElementById("modal-cuenta-close");
  const $btnCerrarModalCuenta = document.getElementById("btn-cerrar-modal-cuenta");
  const $cuentaChart = document.getElementById("cuenta-chart");
  const $cuentaHistBody = document.getElementById("cuenta-historial-body");

  const $varTotal = document.getElementById("var-total");
  const $body = document.body;

  function setStatus(txt){ $status.textContent = txt || ""; }

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

  $btnAbrirModal.addEventListener("click", openModal);
  $btnCerrarModal.addEventListener("click", closeModal);
  $modalBackdrop.addEventListener("click", closeModal);

  if ($btnHistorial) $btnHistorial.addEventListener("click", openHistorialModal);
  if ($btnCerrarModalHistorial) $btnCerrarModalHistorial.addEventListener("click", closeHistorialModal);
  if ($modalHistorialBackdrop) $modalHistorialBackdrop.addEventListener("click", closeHistorialModal);

  if ($btnCerrarModalCuenta) $btnCerrarModalCuenta.addEventListener("click", closeCuentaModal);
  if ($modalCuentaBackdrop) $modalCuentaBackdrop.addEventListener("click", closeCuentaModal);

  // ------- Modales -------
  function openModal(){
    $modal.setAttribute("aria-hidden", "false");
  }
  function closeModal(){
    $modal.setAttribute("aria-hidden", "true");
    state.editingIndex = -1;
    setGuardarLabel();
  }

  function openHistorialModal(){
    if ($modalHistorial) $modalHistorial.setAttribute("aria-hidden", "false");
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
  }

  function renderInputs(valores){
    $wrapper.innerHTML="";
    state.cuentas.forEach(c=>{
      const row=document.createElement("div"); row.className="item";
      const label=document.createElement("label"); label.textContent=c;
      const input=document.createElement("input");
      input.type="text"; input.inputMode="decimal"; input.placeholder="0,00 €"; input.autocomplete="off"; input.style.fontSize="16px";
      input.value = valores && (valores[c]!==undefined) ? valores[c] : "";
      input.addEventListener("blur", ()=>{ input.value = numberToEs(esToNumber(input.value)); });
      row.append(label,input);
      $wrapper.append(row);
    });
  }

  function setInputsFromSaldos(s){
    $wrapper.querySelectorAll(".item").forEach(row=>{
      const name=row.querySelector("label").textContent;
      const inp=row.querySelector("input");
      const val=s[name]||0;
      inp.value=numberToEs(val);
    });
    calcularTotal();
  }
  function leerInputs(){
    const saldos={};
    [].slice.call($wrapper.querySelectorAll(".item")).forEach(row=>{
      const name=row.querySelector("label").textContent;
      const val=row.querySelector("input").value;
      saldos[name]=esToNumber(val);
    });
    return saldos;
  }

  // ------- Cálculo -------
  function calcularTotal(){
    const saldos=leerInputs();
    const total=Object.values(saldos).reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);
    const prev=state.registros.length? state.registros[state.registros.length-1].total : 0;
    const variacion=total-prev;
    const varpct= prev!==0 ? (variacion/prev) : 0;
    $total.textContent=numberToEs(total);
    $var.textContent=numberToEs(variacion);
    $varpct.textContent=pctToEs(varpct);
    return {total,variacion,varpct};
  }
  function recalcVariaciones(){
    state.registros.sort((a,b)=> new Date(a.fecha)-new Date(b.fecha));
    for(let i=0;i<state.registros.length;i++){
      const prev=i>0?state.registros[i-1].total:0;
      const t=state.registros[i].total;
      state.registros[i].variacion=t-prev;
      state.registros[i].varpct= prev!==0 ? (t-prev)/prev : 0;
    }
  }
  function setGuardarLabel(){
    const $btnGuardar=document.getElementById("btn-guardar");
    $btnGuardar.textContent = state.editingIndex>=0 ? "Actualizar" : "Guardar";
  }

  // ------- Guardar -------
  async function onGuardar(){
    const fecha=$fecha.value;
    if(!fecha) return alert("Pon una fecha.");
    const {total,variacion,varpct}=calcularTotal();
    const saldos=leerInputs();

    if(state.editingIndex>=0){
      state.registros[state.editingIndex]={fecha,saldos,total,variacion,varpct};
      recalcVariaciones();
      state.editingIndex=-1;
      setGuardarLabel();
    }else{
      state.registros.push({fecha,saldos,total,variacion,varpct});
      recalcVariaciones();
    }
    persistLocal();
    renderTabla();
    renderDashboard();
    closeModal();

    try{
      setStatus("Guardando…");
      await firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
        cuentas: state.cuentas, registros: state.registros, updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      setStatus("✔ Guardado"); setTimeout(()=>setStatus(""),1200);
    }catch(e){ console.error(e); setStatus("✖ Error guardando"); }
  }

  // ------- Tabla + ocultar columnas (header también) -------
  let currentColsCache=[];
  function renderRestoreBar(cols){
    $restore.innerHTML="";
    hiddenCols.forEach(name=>{
      if(name==="Fecha") return; // no restaurar aquí la fecha
      const chip=document.createElement("button");
      chip.className="col-chip";
      chip.textContent=`+ ${name}`;
      chip.addEventListener("click", ()=>{
        hiddenCols.delete(name); saveHidden();
        const table=$tabla.querySelector("table");
        setColVisibilityByName(table, cols, name, true);
        renderRestoreBar(cols);
      });
      $restore.append(chip);
    });
  }
function setColVisibilityByName(tableEl, cols, name, visible){
  const idx = cols.indexOf(name);
  if (idx < 0) return;

  // Cabecera
  const th = tableEl.querySelector("thead tr").children[idx];
  if (th) th.style.display = visible ? "" : "none";

  // Cuerpo
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
    const cuentas=state.cuentas;
    const cols=["Fecha",...cuentas,"TOTAL","Variación","%Var"];
    currentColsCache=cols.slice();

    const table=document.createElement("table");
    const thead=document.createElement("thead");
    const trh=document.createElement("tr");

    cols.forEach((c,idx)=>{
      const th=document.createElement("th");
      th.className="col-header";
      if(idx===0) th.classList.add("sticky-col");
      const title=document.createElement("span"); title.className="col-title"; title.textContent=c; th.append(title);
      if(idx>0){ th.append(makeToggleBtn(c, hiddenCols.has(c))); }
      trh.append(th);
    });
    const thAct=document.createElement("th"); thAct.textContent=""; trh.append(thAct);
    thead.append(trh);

    const tbody=document.createElement("tbody");
    state.registros.forEach((r,i)=>{
      const tr=document.createElement("tr");
      const tdF=document.createElement("td"); tdF.className="sticky-col"; tdF.textContent=r.fecha; tr.append(tdF);
      cuentas.forEach(c=>{ const td=document.createElement("td"); td.textContent=numberToEs(r.saldos[c]||0); tr.append(td); });
      const tdT=document.createElement("td"); tdT.textContent=numberToEs(r.total); tr.append(tdT);
      const tdV=document.createElement("td"); tdV.textContent=numberToEs(r.variacion); tr.append(tdV);
      const tdP=document.createElement("td"); tdP.textContent=pctToEs(r.varpct); tr.append(tdP);
      const tdA=document.createElement("td"); tdA.className="actions-cell";
      const btnE=document.createElement("button"); btnE.type="button"; btnE.className="row-btn"; btnE.textContent="✎"; btnE.title="Editar";
      btnE.addEventListener("click",()=>{
        state.editingIndex=i; setGuardarLabel();
        $fecha.value=r.fecha; renderInputs({}); setInputsFromSaldos(r.saldos); openModal();
      });
      const btnD=document.createElement("button"); btnD.type="button"; btnD.className="row-btn"; btnD.textContent="🗑"; btnD.title="Borrar";
      btnD.addEventListener("click",()=>{
        if(!confirm(`Borrar el registro de ${r.fecha}?`)) return;
        state.registros.splice(i,1); recalcVariaciones(); persistLocal(); renderTabla(); renderDashboard();
        firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
          cuentas: state.cuentas, registros: state.registros, updatedAt: firebase.database.ServerValue.TIMESTAMP
        }).catch(console.error);
      });
      tdA.append(btnE,btnD); tr.append(tdA);
      tbody.append(tr);
    });

    table.append(thead,tbody);
    $tabla.innerHTML=""; $tabla.append(table);
    table.style.minWidth=(cols.length*140+120)+"px";

    // aplica ocultas y barra de restauración
    hiddenCols.forEach(name=> setColVisibilityByName(table, cols, name, false));
    renderRestoreBar(cols);
  }

  // ------- Dashboard -------

  // Helpers de periodo
  function startOfWeek(d){ // ISO: lunes
    const dt=new Date(d); const day=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-day); dt.setHours(0,0,0,0); return dt;
  }
  function startOfMonth(d){ const dt=new Date(d.getFullYear(), d.getMonth(), 1); dt.setHours(0,0,0,0); return dt; }
  function startOfYear(d){ const dt=new Date(d.getFullYear(), 0, 1); dt.setHours(0,0,0,0); return dt; }

  function getPeriodoStart(periodo, refDate){
    if(periodo==="semana") return startOfWeek(refDate);
    if(periodo==="anio")   return startOfYear(refDate);
    return startOfMonth(refDate); // mes por defecto
  }

  // primer registro >= inicioPeriodo (fallback: primer registro existente)
  function firstRecordFrom(dateStart){
    const records = [...state.registros];
    for(const r of records){
      if(new Date(r.fecha) >= dateStart) return r;
    }
    return records[0] || null;
  }

  // Calcula variación por cuenta contra el primer registro del periodo
  function computeDeltaByAccount(periodo){
    if(!state.registros.length) return {};
    const last = state.registros[state.registros.length-1];
    const start = getPeriodoStart(periodo, new Date(last.fecha));
    const base = firstRecordFrom(start) || last;

    const deltas = {};
    state.cuentas.forEach(cta=>{
      const nowVal  = (last.saldos[cta]||0);
      const baseVal = (base.saldos[cta]||0);
      const diff    = nowVal - baseVal;
      const pct     = baseVal !== 0 ? (diff/baseVal) : 0;
      deltas[cta] = { nowVal, diff, pct };
    });
    return deltas;
  }

  // Render tarjetas
  function renderDashboard(){
    $dashboard.innerHTML="";
    if(!state.registros.length){
      $dashboard.innerHTML = '<div class="muted">Sin datos. Pulsa “Actualizar”.</div>';
      if ($varTotal) {
        $varTotal.textContent = "Mes: 0,00 € (0,00%)";
        $varTotal.className = "var-total";
      }
      if ($body) {
        $body.classList.remove("trend-pos","trend-neg","trend-neutral");
        $body.classList.add("trend-neutral");
      }
      return;
    }

    const periodoSel = (document.getElementById("periodo")?.value) || "mes";
    const deltas = computeDeltaByAccount(periodoSel);

    // actualizar resumen variación total y fondo
    updateTotalVariation(deltas, periodoSel);

    // Tarjeta por cuenta
    state.cuentas.forEach(cta=>{
      const { nowVal, diff, pct } = deltas[cta] || { nowVal:0, diff:0, pct:0 };
      const card = document.createElement("div");
      card.className = "card-mini " + (diff>=0 ? "pos" : "neg");

      const h = document.createElement("h4");
      h.textContent = cta;
      card.append(h);

      const badge = document.createElement("div");
      badge.className = "delta-badge " + (diff>=0 ? "ok" : "bad");
      const scope = document.createElement("div");
      scope.textContent = (periodoSel==="semana"?"Semana": periodoSel==="anio"?"Año":"Mes");
      const pctEl = document.createElement("div");
      pctEl.className="pct";
      pctEl.textContent = pctToEs(pct);
      const eurEl = document.createElement("div");
      eurEl.textContent = numberToEs(diff);
      badge.append(scope, pctEl, eurEl);
      card.append(badge);

      const nowEl = document.createElement("div");
      nowEl.className = "now";
      nowEl.textContent = numberToEs(nowVal);
      card.append(nowEl);

      // abrir detalle de esa cuenta al click
      card.addEventListener("click", ()=> openCuentaModal(cta));

      $dashboard.append(card);
    });
  }

  function updateTotalVariation(deltas, periodoSel){
    if (!$varTotal) return;

    let totalDiff = 0;
    let totalNow = 0;

    state.cuentas.forEach(cta=>{
      const info = deltas[cta];
      if (!info) return;
      totalDiff += info.diff;
      totalNow += info.nowVal;
    });

    const baseTotal = totalNow - totalDiff;
    const pct = baseTotal !== 0 ? (totalDiff / baseTotal) : 0;
    const scopeLabel = (periodoSel==="semana"?"Semana": periodoSel==="anio"?"Año":"Mes");

    $varTotal.textContent = `${scopeLabel}: ${numberToEs(totalDiff)} (${pctToEs(pct)})`;

    let cls = "var-total";
    if (totalDiff > 0) cls += " pos";
    else if (totalDiff < 0) cls += " neg";
    $varTotal.className = cls;

    if ($body){
      $body.classList.remove("trend-pos","trend-neg","trend-neutral");
      if (totalDiff > 0) $body.classList.add("trend-pos");
      else if (totalDiff < 0) $body.classList.add("trend-neg");
      else $body.classList.add("trend-neutral");
    }
  }

  function buildCuentaDetalle(nombreCuenta){
    if (!$cuentaHistBody || !$cuentaChart) return;

    const regsOrdenados = state.registros.slice().sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
    const puntos = [];

    regsOrdenados.forEach(r=>{
      if (!r.saldos) return;
      const v = r.saldos[nombreCuenta];
      if (!Number.isFinite(v)) return;
      puntos.push({ fecha: r.fecha, valor: v });
    });

    const ctx = $cuentaChart.getContext("2d");
    ctx.clearRect(0,0,$cuentaChart.width,$cuentaChart.height);

    $cuentaHistBody.innerHTML = "";
    if (!puntos.length){
      return;
    }

    let prevVal = null;
    let lastDiff = 0;

    puntos.forEach(p=>{
      let diffStr = "—";
      let pctStr = "—";
      let diff = 0;
      let pct = 0;

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

      tr.append(tdFecha, tdValor, tdDiffEur, tdDiffPct);
      $cuentaHistBody.append(tr);

      prevVal = p.valor;
    });

    if ($modalCuentaDialog){
      $modalCuentaDialog.classList.remove("pos","neg");
      if (lastDiff > 0) $modalCuentaDialog.classList.add("pos");
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

    const xs = puntos.map(p => new Date(p.fecha).getTime());
    const ys = puntos.map(p => p.valor);

    let minX = Math.min(...xs);
    let maxX = Math.max(...xs);
    if (minX === maxX) maxX = minX + 24*60*60*1000;

    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);
    if (minY === maxY){
      const delta = Math.abs(minY || 1);
      minY -= delta * 0.1;
      maxY += delta * 0.1;
    }

    const xScale = t => padding + ((t - minX) / (maxX - minX)) * (w - 2*padding);
    const yScale = v => h - padding - ((v - minY) / (maxY - minY)) * (h - 2*padding);

    // ejes
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding/2);
    ctx.lineTo(padding, h - padding);
    ctx.lineTo(w - padding/2, h - padding);
    ctx.stroke();
    ctx.restore();

    // línea
    ctx.save();
    ctx.strokeStyle = "#67d5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    puntos.forEach((p,i)=>{
      const x = xScale(new Date(p.fecha).getTime());
      const y = yScale(p.valor);
      if (i === 0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.restore();

    // puntos
    ctx.save();
    ctx.fillStyle = "#ffffff";
    puntos.forEach(p=>{
      const x = xScale(new Date(p.fecha).getTime());
      const y = yScale(p.valor);
      ctx.beginPath();
      ctx.arc(x,y,3,0,Math.PI*2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Listener de periodo
  const $periodo = document.getElementById("periodo");
  if($periodo){
    $periodo.addEventListener("change", renderDashboard);
  }


  // ------- Persistencia -------
  function persistLocal(){
    localStorage.setItem(KEY_DATA, JSON.stringify(state.registros));
    localStorage.setItem(KEY_CUENTAS, JSON.stringify(state.cuentas));
  }

  // ------- CSV -------
  function registrosToCSV(){
    const cuentas=state.cuentas;
    const headers=["Fecha",...cuentas,"TOTAL","Variación","%Var"];
    const rows=[headers.join(",")];
    state.registros.forEach(r=>{
      const vals=cuentas.map(c=>(r.saldos[c]||0).toFixed(2));
      rows.push([r.fecha,...vals,r.total.toFixed(2),r.variacion.toFixed(2),(r.varpct*100).toFixed(2)+"%"].join(","));
    });
    return rows.join("\n");
  }
  function download(filename,text){ const blob=new Blob([text],{type:"text/csv;charset=utf-8"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
  function onExportar(){ download("mis_cuentas_fase1.csv",registrosToCSV()); }

  async function onImportar(){
    const file=document.getElementById("file-csv").files[0];
    if(!file){ alert("Selecciona un CSV."); return; }
    const txt=await file.text(); const lines=txt.trim().split(/\r?\n/);
    const headers=lines[0].split(","); const fechaIdx=headers.indexOf("Fecha");
    const cuentas=headers.filter(h=>!["Fecha","TOTAL","Variación","%Var"].includes(h));
    if(cuentas.length){ state.cuentas=cuentas; persistLocal(); }
    const registros=[];
    for(let i=1;i<lines.length;i++){
      const cols=lines[i].split(","); if(!cols[fechaIdx]) continue;
      const fecha=cols[fechaIdx]; const saldos={};
      state.cuentas.forEach(c=>{ const colIdx=headers.indexOf(c); saldos[c]=esToNumber(cols[colIdx]); });
      const total=Object.values(saldos).reduce((a,b)=>a+b,0);
      registros.push({fecha,saldos,total,variacion:0,varpct:0});
    }
    state.registros=registros; recalcVariaciones(); persistLocal(); renderInputs({}); renderTabla(); renderDashboard();
    try{
      setStatus("Sincronizando…");
      await firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
        cuentas: state.cuentas, registros: state.registros, updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      setStatus("✔ Sincronizado"); setTimeout(()=>setStatus(""),1200);
    }catch(e){ console.error(e); setStatus("✖ Error sync"); }
  }

  function borrarTodo(){
    if(!confirm("Borrar todos los datos?")) return;
    state.registros=[]; persistLocal(); renderTabla(); renderDashboard();
    firebase.database().ref(`/users/${state.uid}/finanzas/fase1`).set({
      cuentas: state.cuentas, registros: [], updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).catch(console.error);
  }

  function addCuenta(){
    const nombre=prompt("Nombre de la cuenta:"); if(!nombre) return;
    if(state.cuentas.indexOf(nombre)>=0){ alert("Ya existe."); return; }
    state.cuentas.push(nombre); persistLocal(); renderInputs({}); renderTabla(); renderDashboard();
    firebase.database().ref(`/users/${state.uid}/finanzas/fase1/cuentas`).set(state.cuentas).catch(console.error);
  }

  // ------- Cloud listener (opcional) -------
  function attachCloudListeners(){
    const base=firebase.database().ref(`/users/${state.uid}/finanzas/fase1`);
    base.on("value",snap=>{
      const v=snap.val(); if(!v) return;
      if(Array.isArray(v.cuentas)&&v.cuentas.length) state.cuentas=v.cuentas;
      if(Array.isArray(v.registros)) state.registros=v.registros;
      persistLocal(); renderInputs({}); renderTabla(); renderDashboard(); setStatus("↻ Actualizado");
      setTimeout(()=>setStatus(""),1000);
    });
  }

  // ------- Init -------
  (function init(){
    const today=new Date(); $fecha.value=ymd(today);
    renderInputs({}); renderTabla(); renderDashboard(); attachCloudListeners(); setGuardarLabel();
  })();
})();
