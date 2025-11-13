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
    registros: JSON.parse(localStorage.getItem(KEY_DATA)) || []
  };

  // ------- DOM -------
  const $fecha = document.getElementById("fecha");
  const $wrapper = document.getElementById("cuentas-wrapper");
  const $total = document.getElementById("total");
  const $var = document.getElementById("variacion");
  const $varpct = document.getElementById("varpct");
  const $tabla = document.getElementById("tabla-historial");
  const $status = document.getElementById("status");
  function setStatus(txt){ $status.textContent = txt||""; }

  document.getElementById("btn-guardar").addEventListener("click", onGuardar);
  document.getElementById("btn-limpiar").addEventListener("click", () => renderInputs({}));
  document.getElementById("btn-reset").addEventListener("click", borrarTodo);
  document.getElementById("btn-add-cuenta").addEventListener("click", addCuenta);

  // ------- Render inputs -------
  function renderInputs(valores){
    $wrapper.innerHTML = "";
    state.cuentas.forEach(c => {
      const row = document.createElement("div"); row.className="item";
      const label = document.createElement("label"); label.textContent=c;
      const input = document.createElement("input");
      input.type="text";
      input.inputMode="decimal";
      input.placeholder="0,00 €";
      input.autocomplete="off";
      input.style.fontSize = "16px"; // anti-zoom iOS reforzado
      input.value = valores && (valores[c]!==undefined) ? valores[c] : "";
      input.addEventListener("input", calcularTotal);
      row.append(label,input); $wrapper.append(row);
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

  // ------- Guardar local + nube (sin auth) -------
  async function onGuardar(){
    const fecha = $fecha.value;
    if(!fecha) return alert("Pon una fecha.");
    const { total, variacion, varpct } = calcularTotal();
    const saldos = leerInputs();

    state.registros.push({ fecha, saldos, total, variacion, varpct });
    state.registros.sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));
    for(let i=0;i<state.registros.length;i++){
      const prev = i>0 ? state.registros[i-1].total : 0;
      const t = state.registros[i].total;
      state.registros[i].variacion = t - prev;
      state.registros[i].varpct = prev!==0 ? (t-prev)/prev : 0;
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

  // ------- Tabla -------
  function renderTabla(){
    const cuentas = state.cuentas;
    const cols = ["Fecha", ...cuentas, "TOTAL","Variación","%Var"];
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    cols.forEach(c=>{ const th=document.createElement("th"); th.textContent=c; trh.append(th); });
    thead.append(trh);
    const tbody = document.createElement("tbody");
    state.registros.forEach(r=>{
      const tr=document.createElement("tr");
      const tdF=document.createElement("td"); tdF.textContent=r.fecha; tr.append(tdF);
      cuentas.forEach(c=>{
        const td=document.createElement("td");
        td.textContent = numberToEs(r.saldos[c]||0);
        tr.append(td);
      });
      const tdT=document.createElement("td"); tdT.textContent=numberToEs(r.total); tr.append(tdT);
      const tdV=document.createElement("td"); tdV.textContent=numberToEs(r.variacion); tr.append(tdV);
      const tdP=document.createElement("td"); tdP.textContent=pctToEs(r.varpct); tr.append(tdP);
      tbody.append(tr);
    });
    table.append(thead, tbody);
    $tabla.innerHTML = "";
    $tabla.append(table);
  }

  // ------- Persistencia local -------
  function persistLocal(){
    localStorage.setItem(KEY_DATA, JSON.stringify(state.registros));
    localStorage.setItem(KEY_CUENTAS, JSON.stringify(state.cuentas));
  }

  // ------- Borrar / Añadir cuenta -------
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
  })();
})();