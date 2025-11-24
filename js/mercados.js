// js/mercados.js
(() => {
  "use strict";

  const STORAGE_KEY = "finanzas_mercados_watchlist";

  const COINGECKO_MAP = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    ADA: "cardano",
    BNB: "binancecoin",
    XRP: "ripple",
    DOGE: "dogecoin",
    AVAX: "avalanche-2"
  };

  function parseEs(raw) {
    if (!raw) return 0;
    const s = String(raw)
      .replace(/[€\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function numberToEs(n, decimals = 2) {
    return Number(n || 0).toLocaleString("es-ES", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  async function fetchCryptoPrice(symbol) {
    const key = symbol.trim().toUpperCase();
    const id = COINGECKO_MAP[key];
    if (!id) {
      throw new Error("Cripto no soportada en el conversor.");
    }

    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=" +
      encodeURIComponent(id) +
      "&vs_currencies=eur";

    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al obtener precio (HTTP).");

    const data = await res.json();
    const price = data[id]?.eur;
    if (typeof price !== "number") {
      throw new Error("No se ha encontrado precio en EUR.");
    }

    return { price, id, symbol: key };
  }

  async function fetchAssetPrice(tipo, symbol, precioManual) {
    if (tipo === "crypto") {
      return fetchCryptoPrice(symbol);
    }

    // Acciones / ETF / fondos: sin API pública segura desde front,
    // se usa el precio manual que introduzcas.
    if (precioManual && !Number.isNaN(precioManual) && precioManual > 0) {
      return {
        price: precioManual,
        id: symbol,
        symbol: symbol.trim().toUpperCase()
      };
    }

    throw new Error(
      "Para acciones/ETF introduce el precio actual en €/u (campo de precio)."
    );
  }

  function loadWatchlist() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("[MERCADOS] Error cargando watchlist", e);
      return [];
    }
  }

  function saveWatchlist(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error("[MERCADOS] Error guardando watchlist", e);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const $tipo = document.getElementById("merc-tipo");
    const $simbolo = document.getElementById("merc-simbolo");
    const $cantidad = document.getElementById("merc-cantidad");
    const $precioManual = document.getElementById("merc-precio-manual");
    const $btnCalcular = document.getElementById("merc-btn-calcular");
    const $btnGuardar = document.getElementById("merc-btn-guardar");
    const $btnRefrescar = document.getElementById("merc-btn-refrescar");
    const $resultado = document.getElementById("merc-resultado");
    const $lista = document.getElementById("mercados-list-body");

    if (
      !$tipo ||
      !$simbolo ||
      !$cantidad ||
      !$btnCalcular ||
      !$btnGuardar ||
      !$btnRefrescar ||
      !$resultado ||
      !$lista
    ) {
      return;
    }

    let watchlist = loadWatchlist();
    let lastCalc = null;

    function renderList() {
      if (!watchlist.length) {
        $lista.classList.add("muted");
        $lista.textContent = "No has guardado ningún activo todavía.";
        return;
      }

      $lista.classList.remove("muted");
      $lista.innerHTML = "";

      watchlist.forEach((item) => {
        const row = document.createElement("div");
        row.className = "merc-item";

        const tipoLabel = item.tipo === "crypto" ? "Cripto" : "Acción/ETF";

        const unidades =
          item.lastPrice && item.lastPrice > 0
            ? item.amount / item.lastPrice
            : null;

        row.innerHTML = `
          <div class="merc-item-main">
            <div class="merc-item-title">${item.symbol} · ${tipoLabel}</div>
            <div class="merc-item-meta">
              Invertido: <span>${numberToEs(item.amount)} €</span>
              · Precio: <span>${
                item.lastPrice
                  ? numberToEs(item.lastPrice) + " €/u"
                  : "—"
              }</span>
            </div>
          </div>
          <div class="merc-item-right">
            <div class="merc-item-value">${
              unidades ? unidades.toFixed(6) + " u" : "—"
            }</div>
            <button class="merc-item-delete" aria-label="Eliminar">×</button>
          </div>
        `;

        const btnDel = row.querySelector(".merc-item-delete");
        btnDel.addEventListener("click", () => {
          watchlist = watchlist.filter((w) => w.id !== item.id);
          saveWatchlist(watchlist);
          renderList();
        });

        $lista.appendChild(row);
      });
    }

    $btnCalcular.addEventListener("click", async () => {
      const tipo = $tipo.value;
      const symbol = $simbolo.value.trim();
      const amount = parseEs($cantidad.value);
      const precioManualVal = parseEs($precioManual.value);

      if (!symbol) {
        $resultado.textContent = "Pon un símbolo / ticker.";
        return;
      }
      if (!amount || amount <= 0) {
        $resultado.textContent = "Pon una cantidad en € válida.";
        return;
      }

      $resultado.textContent = "Buscando precio...";
      try {
        const { price } = await fetchAssetPrice(
          tipo,
          symbol,
          tipo === "crypto" ? null : precioManualVal
        );
        const units = amount / price;
        const labelTipo = tipo === "crypto" ? "cripto" : "activo";

        $resultado.textContent =
          `${numberToEs(amount)} € ⇒ ` +
          `${units.toFixed(6)} ${symbol.toUpperCase()} ` +
          `(precio aprox. ${numberToEs(price)} €/u, ${labelTipo})`;

        lastCalc = {
          tipo,
          symbol: symbol.trim().toUpperCase(),
          amount,
          price
        };
      } catch (err) {
        console.error("[MERCADOS] Error cálculo", err);
        $resultado.textContent =
          err && err.message
            ? err.message
            : "No se ha podido obtener el precio.";
        lastCalc = null;
      }
    });

    $btnGuardar.addEventListener("click", () => {
      if (!lastCalc) {
        $resultado.textContent = "Primero calcula con un precio válido.";
        return;
      }
      watchlist.push({
        id: Date.now(),
        tipo: lastCalc.tipo,
        symbol: lastCalc.symbol,
        amount: lastCalc.amount,
        lastPrice: lastCalc.price
      });
      saveWatchlist(watchlist);
      renderList();
    });

    $btnRefrescar.addEventListener("click", async () => {
      if (!watchlist.length) return;

      $btnRefrescar.disabled = true;
      $btnRefrescar.textContent = "Actualizando...";

      try {
        for (const item of watchlist) {
          if (item.tipo === "crypto") {
            try {
              const { price } = await fetchCryptoPrice(item.symbol);
              item.lastPrice = price;
            } catch (e) {
              console.error(
                "[MERCADOS] Error actualizando",
                item.symbol,
                e
              );
            }
          }
        }
        saveWatchlist(watchlist);
        renderList();
      } finally {
        $btnRefrescar.disabled = false;
        $btnRefrescar.textContent = "Actualizar todos";
      }
    });

    renderList();
  });
})();
