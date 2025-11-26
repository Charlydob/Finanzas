// js/youtube.js
(function () {
  const STORAGE_KEY = "finanzas_youtube_v2";
    const YT_DB_ROOT = "finanzas_youtube";

  let ytRef = null;
  let ytUid = null;
  let ytFirebaseReady = false;

  // ---------- Utils ----------
  function parseEuro(str) {
    if (!str) return NaN;
    str = String(str).trim();
    str = str.replace(/[€\s]/g, "");
    str = str.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(str);
    return isNaN(n) ? NaN : n;
  }

  function formatEuro(n) {
    const val = Number.isFinite(n) ? n : 0;
    return val.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €";
  }

  function formatEuroShort(n) {
    const val = Number.isFinite(n) ? n : 0;
    return val.toLocaleString("es-ES", {
      maximumFractionDigits: 0,
    });
  }

  function getCurrentMonthKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function formatMonthLabel(key) {
    const parts = key.split("-");
    if (parts.length !== 2) return key;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = new Date(y, m, 1);
    return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  }

  function genId() {
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  // ---------- Data ----------


  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return {};
      // migración por si había el modelo antiguo {ingreso, comida, videos}
      for (const [mes, v] of Object.entries(obj)) {
        if (!v || typeof v !== "object") {
          obj[mes] = { ingresos: [], comidas: [], videos: 0 };
          continue;
        }
        if (!Array.isArray(v.ingresos)) {
          const total = Number(v.ingreso) || 0;
          v.ingresos = total
            ? [{ id: genId(), cantidad: total, ts: Date.now() }]
            : [];
        }
        if (!Array.isArray(v.comidas)) {
          const total = Number(v.comida) || 0;
          v.comidas = total
            ? [{ id: genId(), cantidad: total, ts: Date.now() }]
            : [];
        }
        if (typeof v.videos !== "number") v.videos = 0;
        delete v.ingreso;
        delete v.comida;
      }
      return obj;
    } catch (e) {
      console.warn("[YT] error al leer localStorage", e);
      return {};
    }
  }

  function saveDataLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[YT] error al guardar localStorage", e);
    }
  }

  function saveData() {
    // si hay Firebase, guardamos allí y luego en local
    if (ytRef && ytFirebaseReady && typeof firebase !== "undefined") {
      ytRef.set(data, (err) => {
        if (err) {
          console.warn("[YT] error al guardar en Firebase", err);
        } else {
          saveDataLocal();
        }
      });
    } else {
      // solo local (offline / sin login)
      saveDataLocal();
    }
  }



  function ensureMonth(key) {
    if (!data[key]) {
      data[key] = { ingresos: [], comidas: [], videos: 0 };
    } else {
      if (!Array.isArray(data[key].ingresos)) data[key].ingresos = [];
      if (!Array.isArray(data[key].comidas)) data[key].comidas = [];
      if (typeof data[key].videos !== "number") data[key].videos = 0;
    }
  }
  function getMonthList() {
    return Object.keys(data).sort();
  }

  function getUidSafe() {
    try {
      if (typeof getUidFromLogin === "function") {
        const uid = getUidFromLogin();
        if (uid) return uid;
      }
    } catch (e) {
      console.warn("[YT] getUidFromLogin error", e);
    }
    return null;
  }

  function initFirebaseSync() {
    if (ytRef || typeof firebase === "undefined" || !firebase.database) {
      return;
    }
    const uid = getUidSafe();
    if (!uid) {
      console.warn("[YT] UID no disponible aún para YouTube");
      return;
    }

    ytUid = uid;
    ytRef = firebase.database().ref(`${YT_DB_ROOT}/${uid}`);
    ytFirebaseReady = true;

    ytRef.on("value", (snap) => {
      const val = snap.val();
      if (val && typeof val === "object") {
        data = val;
      } else if (!val && data && Object.keys(data).length) {
        // Firebase vacío pero hay datos locales → subimos locales
        ytRef.set(data, (err) => {
          if (err) console.warn("[YT] error al subir datos locales a Firebase", err);
        });
        return; // esperamos siguiente 'value'
      } else {
        data = {};
      }
      saveDataLocal();
      ensureMonth(currentMonth);
      render();
    });
  }

  let data = loadData();
  let currentMonth = getCurrentMonthKey();

  function getTotalsForMonth(key) {
    ensureMonth(key);
    const v = data[key];
    const totalIngreso = v.ingresos.reduce(
      (sum, r) => sum + (Number(r.cantidad) || 0),
      0
    );
    const totalComida = v.comidas.reduce(
      (sum, r) => sum + (Number(r.cantidad) || 0),
      0
    );
    const videos = Number(v.videos) || 0;
    return { ingreso: totalIngreso, comida: totalComida, videos };
  }

  function setCurrentMonth(key) {
    if (!key) key = getCurrentMonthKey();
    currentMonth = key;
    ensureMonth(currentMonth);
    const mesInput = document.getElementById("yt-mes");
    if (mesInput && mesInput.value !== key) {
      mesInput.value = key;
    }
    render();
  }

  // ---------- Render ----------
  function render() {
    const tab = document.getElementById("tab-youtube");
    if (!tab) return;

    ensureMonth(currentMonth);
    const totals = getTotalsForMonth(currentMonth);
    const ingreso = totals.ingreso;
    const comida = totals.comida;
    const videos = totals.videos;
    const resto = ingreso - comida;

    const elIngreso = document.getElementById("yt-ingreso");
    const elComida = document.getElementById("yt-comida");
    const elResto = document.getElementById("yt-resto");
    const elVideos = document.getElementById("yt-videos-label");
    const elMesLabel = document.getElementById("yt-mes-label");
    const elRing = document.getElementById("yt-ring");
    const elRingText = document.getElementById("yt-ring-text");
    const elRestLine = tab.querySelector(".yt-summary-rest");

    if (elIngreso) elIngreso.textContent = formatEuro(ingreso);
    if (elComida) elComida.textContent = formatEuro(comida);
    if (elResto) elResto.textContent = formatEuro(resto);
    if (elVideos) elVideos.textContent = String(videos);
    if (elMesLabel) elMesLabel.textContent = formatMonthLabel(currentMonth);

    if (elRestLine) {
      elRestLine.classList.toggle("neg", resto < 0);
    }

    if (elRing && elRingText) {
      let pct = 0;
      if (ingreso > 0) {
        const ratio = Math.min(comida / ingreso, 1);
        pct = ratio * 360;
        elRingText.textContent = Math.round(ratio * 100) + "%";
      } else {
        elRingText.textContent = "0%";
      }
      elRing.style.setProperty("--pct", pct + "deg");
    }

    renderRegistrosMes();
    drawMoneyChart();
    drawVideosChart();
  }

  // ---------- Lista de registros ----------
  function renderRegistrosMes() {
    const list = document.getElementById("yt-list");
    if (!list) return;
    list.innerHTML = "";
    ensureMonth(currentMonth);
    const v = data[currentMonth];

    const items = [];

    v.ingresos.forEach((r) => {
      items.push({
        ...r,
        tipo: "ingreso",
        etiqueta: "YouTube",
      });
    });

    v.comidas.forEach((r) => {
      items.push({
        ...r,
        tipo: "comida",
        etiqueta: "Comida",
      });
    });

    // ordenar por fecha (ts) asc
    items.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    if (!items.length) {
      const li = document.createElement("li");
      li.className = "yt-item yt-item-empty";
      li.textContent = "Sin registros este mes.";
      list.appendChild(li);
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "yt-item";
      li.dataset.id = item.id;
      li.dataset.tipo = item.tipo;

      const left = document.createElement("div");
      left.className = "yt-item-left";

      const badge = document.createElement("span");
      badge.className =
        "yt-item-badge " +
        (item.tipo === "ingreso" ? "yt-item-badge-ingreso" : "yt-item-badge-comida");
      badge.textContent = item.etiqueta;

      const amount = document.createElement("span");
      amount.className = "yt-item-amount";
      amount.textContent = formatEuro(item.cantidad);

      left.appendChild(badge);
      left.appendChild(amount);

      const right = document.createElement("div");
      right.className = "yt-item-right";

      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.className = "yt-item-btn";
      btnEdit.textContent = "✎";
      btnEdit.title = "Editar";

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "yt-item-btn yt-item-btn-del";
      btnDel.textContent = "✕";
      btnDel.title = "Eliminar";

      btnEdit.addEventListener("click", () => {
        const nuevo = prompt(
          "Nuevo valor para este registro (€):",
          formatEuro(item.cantidad)
        );
        if (!nuevo && nuevo !== "") return;
        const val = parseEuro(nuevo);
        if (isNaN(val) || val === 0) return;

        ensureMonth(currentMonth);
        const arr =
          item.tipo === "ingreso" ? data[currentMonth].ingresos : data[currentMonth].comidas;
        const idx = arr.findIndex((r) => r.id === item.id);
        if (idx >= 0) {
          arr[idx].cantidad = val;
          saveData();
          render();
        }
      });

      btnDel.addEventListener("click", () => {
        if (!confirm("¿Eliminar este registro?")) return;
        ensureMonth(currentMonth);
        const arr =
          item.tipo === "ingreso" ? data[currentMonth].ingresos : data[currentMonth].comidas;
        const idx = arr.findIndex((r) => r.id === item.id);
        if (idx >= 0) {
          arr.splice(idx, 1);
          saveData();
          render();
        }
      });

      right.appendChild(btnEdit);
      right.appendChild(btnDel);

      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    });
  }

  // ---------- Gráfico dinero (dos líneas) ----------
  function drawMoneyChart() {
    const canvas = document.getElementById("yt-chart-money");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const months = getMonthList();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!months.length) return;

    const W = canvas.width;
    const H = canvas.height;
    const paddingLeft = 32;
    const paddingRight = 16;
    const paddingTop = 16;
    const paddingBottom = 30;

    const plotW = W - paddingLeft - paddingRight;
    const plotH = H - paddingTop - paddingBottom;

    const valsIngreso = months.map((m) => getTotalsForMonth(m).ingreso);
    const valsComida = months.map((m) => getTotalsForMonth(m).comida);
    let maxVal = Math.max(...valsIngreso, ...valsComida, 1);
    if (maxVal <= 0) maxVal = 1;

    // fondo
    ctx.fillStyle = "rgba(15,23,42,1)";
    ctx.fillRect(0, 0, W, H);

    // ejes
    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop);
    ctx.lineTo(paddingLeft, H - paddingBottom);
    ctx.lineTo(W - paddingRight, H - paddingBottom);
    ctx.stroke();

    const count = months.length;
    const stepX = count > 1 ? plotW / (count - 1) : 0;

    // función para dibujar una línea
    function drawLine(vals, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      months.forEach((m, i) => {
        const val = vals[i] || 0;
        const x = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
        const y = paddingTop + (plotH - (val / maxVal) * plotH);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // puntos + etiquetas
      ctx.fillStyle = color;
      ctx.font = "10px Poppins, system-ui";
      months.forEach((m, i) => {
        const val = vals[i] || 0;
        const x = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
        const y = paddingTop + (plotH - (val / maxVal) * plotH);
        // punto
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        // valor
        const label = formatEuroShort(val);
        ctx.fillText(label, x - ctx.measureText(label).width / 2, y - 6);
      });
    }

    // ingresos (verde) + comida (rojo)
    drawLine(valsIngreso, "#22c55e");
    drawLine(valsComida, "#f97373");

    // etiquetas de mes
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px Poppins, system-ui";
    months.forEach((m, i) => {
      const x = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
      const [y, mm] = m.split("-");
      const label = mm + "/" + String(y).slice(2);
      ctx.fillText(label, x - 12, H - 10);
    });
  }

  // ---------- Gráfico vídeos (barras simples) ----------
  function drawVideosChart() {
    const canvas = document.getElementById("yt-chart-videos");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const months = getMonthList();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!months.length) return;

    const W = canvas.width;
    const H = canvas.height;
    const paddingLeft = 32;
    const paddingRight = 18;
    const paddingTop = 16;
    const paddingBottom = 30;

    const plotW = W - paddingLeft - paddingRight;
    const plotH = H - paddingTop - paddingBottom;

    const valsVideos = months.map((m) => getTotalsForMonth(m).videos);
    let maxVal = Math.max(...valsVideos, 1);
    if (maxVal <= 0) maxVal = 1;

    ctx.fillStyle = "rgba(15,23,42,1)";
    ctx.fillRect(0, 0, W, H);

    // ejes
    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop);
    ctx.lineTo(paddingLeft, H - paddingBottom);
    ctx.lineTo(W - paddingRight, H - paddingBottom);
    ctx.stroke();

    const count = months.length;
    const barWidth = plotW / Math.max(count * 1.4, 1);
    const stepX = count > 1 ? plotW / (count - 1) : 0;

    ctx.fillStyle = "#6366f1";
    ctx.font = "10px Poppins, system-ui";

    months.forEach((m, i) => {
      const val = valsVideos[i] || 0;
      const xCenter = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
      const h = (val / maxVal) * plotH;
      const x = xCenter - barWidth / 2;
      const y = paddingTop + (plotH - h);
      ctx.fillRect(x, y, barWidth, h);

      const label = String(val);
      ctx.fillText(label, xCenter - ctx.measureText(label).width / 2, y - 4);
    });

    ctx.fillStyle = "#9ca3af";
    months.forEach((m, i) => {
      const x = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
      const [y, mm] = m.split("-");
      const label = mm + "/" + String(y).slice(2);
      ctx.fillText(label, x - 12, H - 10);
    });
  }

  // ---------- Tabs de gráfico ----------
  function setupChartTabs() {
    const tabs = document.querySelectorAll(".yt-chart-tab");
    const moneyCanvas = document.getElementById("yt-chart-money");
    const videosCanvas = document.getElementById("yt-chart-videos");
    if (!tabs.length || !moneyCanvas || !videosCanvas) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        const target = tab.dataset.ytChart;
        if (target === "money") {
          moneyCanvas.style.display = "block";
          videosCanvas.style.display = "none";
        } else {
          moneyCanvas.style.display = "none";
          videosCanvas.style.display = "block";
        }
      });
    });
  }

  // ---------- Init ----------
  function init() {
    console.log("[YT] youtube.js init");

    const tab = document.getElementById("tab-youtube");
    if (!tab) return;

    ensureMonth(currentMonth);

    const mesInput = document.getElementById("yt-mes");
    const btnIngreso = document.getElementById("yt-btn-add-ingreso");
    const btnComida = document.getElementById("yt-btn-add-comida");
    const btnVideos = document.getElementById("yt-btn-set-videos");
    const inputIngreso = document.getElementById("yt-input-ingreso");
    const inputComida = document.getElementById("yt-input-comida");
    const inputVideos = document.getElementById("yt-input-videos");

    if (mesInput) {
      mesInput.value = currentMonth;
      mesInput.addEventListener("change", () => {
        const val = mesInput.value || getCurrentMonthKey();
        setCurrentMonth(val);
        saveData();
      });
    }

    if (btnIngreso && inputIngreso) {
      btnIngreso.addEventListener("click", () => {
        const val = parseEuro(inputIngreso.value);
        if (!isNaN(val) && val !== 0) {
          ensureMonth(currentMonth);
          data[currentMonth].ingresos.push({
            id: genId(),
            cantidad: val,
            ts: Date.now(),
          });
          saveData();
          inputIngreso.value = "";
          render();
        }
      });
    }

    if (btnComida && inputComida) {
      btnComida.addEventListener("click", () => {
        const val = parseEuro(inputComida.value);
        if (!isNaN(val) && val !== 0) {
          ensureMonth(currentMonth);
          data[currentMonth].comidas.push({
            id: genId(),
            cantidad: val,
            ts: Date.now(),
          });
          saveData();
          inputComida.value = "";
          render();
        }
      });
    }

    if (btnVideos && inputVideos) {
      btnVideos.addEventListener("click", () => {
        const val = parseInt(inputVideos.value, 10);
        if (!isNaN(val) && val >= 0) {
          ensureMonth(currentMonth);
          data[currentMonth].videos = val;
          saveData();
            initFirebaseSync();
          render();
        }
      });
    }

    const tabBtn = document.querySelector(".tab-youtube");
    if (tabBtn) {
      tabBtn.addEventListener("click", () => {
        render();
      });
    }

    setupChartTabs();
      initFirebaseSync();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
