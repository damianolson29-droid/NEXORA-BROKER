
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // ========================================
  // NEXORA — AUTHENTICATION + DASHBOARD
  // Demo/live dashboard interface.
  // No real cryptocurrency is sent.
  // ========================================

  const byId = id => document.getElementById(id);
  const api = window.Nexora;

  const authScreen = byId("authScreen");
  const appShell = byId("appShell");
  const mobileNav = document.querySelector(".mobile-nav");
  const signupPanel = byId("signupPanel");
  const loginPanel = byId("loginPanel");
  const signupForm = byId("signupForm");
  const loginForm = byId("loginForm");
  const signupMessage = byId("signupMessage");
  const loginMessage = byId("loginMessage");

  const PRICES = { BTC: 68000, ETH: 3200, USDT: 1, USD: 1 };

  const DEFAULT_ASSETS = [
    { symbol: "BTC", name: "Bitcoin", icon: "₿", className: "btc" },
    { symbol: "ETH", name: "Ethereum", icon: "◆", className: "eth" },
    { symbol: "USDT", name: "Tether", icon: "₮", className: "usdt" },
    { symbol: "USD", name: "US Dollar", icon: "$", className: "usd" }
  ];

  // QR image paths. These files should be beside index.html.
  const DEPOSIT_ASSETS = {
    BTC: {
      name: "Bitcoin",
      symbol: "BTC",
      icon: "₿",
      className: "btc",
      image: "BTC.JPG",
      network: "Bitcoin network — verify before use"
    },
    ETH: {
      name: "Ethereum",
      symbol: "ETH",
      icon: "◆",
      className: "eth",
      image: "ETH.JPG",
      network: "Network not verified"
    },
    USDT: {
      name: "Tether",
      symbol: "USDT",
      icon: "₮",
      className: "usdt",
      image: "USDT.JPG",
      network: "Network not verified"
    }
  };

  let assets = DEFAULT_ASSETS.map(a => ({ ...a, balance: 0 }));
  let transactions = [];
  let selectedAsset = "BTC";
  let selectedDepositAsset = null;
  let depositAddresses = new Map();
  let busy = false;
  let accountReady = false;

  if (!api?.client) {
    console.error("NEXORA Supabase client is unavailable.");
    return;
  }

  // ========================================
  // DISPLAY HELPERS
  // ========================================

  function formatMoney(value) {
    const n = Number(value);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number.isFinite(n) ? n : 0);
  }

  function formatQuantity(value, symbol) {
    const n = Number(value);
    const decimals = ["USD", "USDT"].includes(symbol) ? 2 : 8;

    return `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: decimals
    }).format(Number.isFinite(n) ? n : 0)} ${symbol}`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  function showNotice(message, type = "info") {
    const notice = byId("notice");
    const noticeText = byId("noticeText");

    if (!notice || !noticeText) {
      console.log(message);
      return;
    }

    noticeText.textContent = message;
    notice.classList.remove("hidden", "success", "error");

    if (type === "success") notice.classList.add("success");
    if (type === "error") notice.classList.add("error");
  }

  function hideNotice() {
    byId("notice")?.classList.add("hidden");
  }

  byId("closeNotice")?.addEventListener("click", hideNotice);

  function getAsset(symbol) {
    return assets.find(a => a.symbol === symbol);
  }

  function portfolioValue() {
    return assets.reduce(
      (sum, a) => sum + a.balance * PRICES[a.symbol],
      0
    );
  }

  // ========================================
  // LOGIN / SIGNUP
  // ========================================

  function showSignup() {
    signupPanel?.classList.remove("hidden");
    loginPanel?.classList.add("hidden");

    if (signupMessage) signupMessage.textContent = "";
    if (loginMessage) loginMessage.textContent = "";
  }

  function showLogin() {
    loginPanel?.classList.remove("hidden");
    signupPanel?.classList.add("hidden");

    if (signupMessage) signupMessage.textContent = "";
    if (loginMessage) loginMessage.textContent = "";
  }

  function showDashboard(user) {
    authScreen?.classList.add("hidden");
    appShell?.classList.remove("hidden");
    mobileNav?.classList.remove("hidden");

    const name =
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "User";

    const profileName = document.querySelector(".profile-name");
    const welcomeTitle = byId("welcomeTitle");
    const avatar = document.querySelector(".avatar");

    if (profileName) profileName.textContent = name;
    if (welcomeTitle) welcomeTitle.textContent = `Welcome, ${name}`;
    if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
  }

  byId("showLogin")?.addEventListener("click", showLogin);
  byId("showSignup")?.addEventListener("click", showSignup);

  signupForm?.addEventListener("submit", async event => {
    event.preventDefault();

    if (signupMessage) signupMessage.textContent = "";

    const name = byId("signupName")?.value.trim();
    const email = byId("signupEmail")?.value.trim();
    const password = byId("signupPassword")?.value;
    const confirmPassword = byId("confirmPassword")?.value;

    if (!name || !email || !password) {
      if (signupMessage) {
        signupMessage.textContent = "Complete all required fields.";
      }
      return;
    }

    if (password !== confirmPassword) {
      if (signupMessage) {
        signupMessage.textContent = "Passwords do not match.";
      }
      return;
    }

    const button = signupForm.querySelector('[type="submit"]');
    if (button) button.disabled = true;

    try {
      const { data, error } = await api.client.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      });

      if (error) throw error;

      if (data.session && data.user) {
        showDashboard(data.user);
        await refreshAccount();
      } else {
        showLogin();

        if (loginMessage) {
          loginMessage.textContent =
            "Account created. Log in with your email and password.";
        }
      }
    } catch (error) {
      if (signupMessage) signupMessage.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });

  loginForm?.addEventListener("submit", async event => {
    event.preventDefault();

    if (loginMessage) loginMessage.textContent = "";

    const email = byId("loginEmail")?.value.trim();
    const password = byId("loginPassword")?.value;
    const button = loginForm.querySelector('[type="submit"]');

    if (button) button.disabled = true;

    try {
      const { data, error } =
        await api.client.auth.signInWithPassword({ email, password });

      if (error) throw error;
      if (!data.user) throw new Error("Login returned no user.");

      showDashboard(data.user);
      await refreshAccount();
    } catch (error) {
      if (loginMessage) loginMessage.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.addEventListener("click", async event => {
    if (!event.target.closest("#logoutButton")) return;

    const { error } = await api.client.auth.signOut();

    if (error) {
      alert("Could not log out: " + error.message);
      return;
    }

    accountReady = false;
    assets = DEFAULT_ASSETS.map(a => ({ ...a, balance: 0 }));
    transactions = [];
    depositAddresses.clear();
    selectedDepositAsset = null;

    renderAll();

    appShell?.classList.add("hidden");
    mobileNav?.classList.add("hidden");
    authScreen?.classList.remove("hidden");

    showLogin();
  });

  // ========================================
  // LOAD BALANCES FROM SUPABASE
  // ========================================

  async function refreshAccount() {
    if (busy) return false;

    busy = true;
    accountReady = false;

    try {
      const { data, error } = await api.client.auth.getSession();
      if (error) throw error;

      const user = data.session?.user;

      if (!user || user.is_anonymous) {
        throw new Error("Please log in to your NEXORA account.");
      }

      const [balanceResult, transactionResult] = await Promise.all([
        api.getBalances(),
        api.getTransactions()
      ]);

      const balanceRows = Array.isArray(balanceResult)
        ? balanceResult
        : balanceResult?.data || [];

      const transactionRows = Array.isArray(transactionResult)
        ? transactionResult
        : transactionResult?.data || [];

      console.log("NEXORA logged-in UID:", user.id);
      console.log("NEXORA balance rows:", balanceRows.length);

      const mapped = DEFAULT_ASSETS.map(defaultAsset => {
        const row = balanceRows.find(
          r => r.asset === defaultAsset.symbol
        );

        if (!row) {
          throw new Error(
            `Supabase has no ${defaultAsset.symbol} balance row for this user.`
          );
        }

        const balance = Number(row.balance);

        if (!Number.isFinite(balance) || balance < 0) {
          throw new Error(
            `Invalid ${defaultAsset.symbol} balance in Supabase.`
          );
        }

        return { ...defaultAsset, balance };
      });

      assets = mapped;

      transactions = transactionRows.map(row => {
  const isFunding =   row.type === "account_funded" ||   row.type === "Account Funded";

  return {
    type: isFunding ? "account_funded" : "live withdrawal",
    asset: String(row.asset || "Unknown"),
    amount: isFunding
      ? Math.abs(Number(row.amount) || 0)
      : -Math.abs(Number(row.amount) || 0),
    status: String(row.status || "Pending"),
    date: row.created_at
      ? new Date(row.created_at).toLocaleString()
      : "Date unavailable"
  };
});

      accountReady = true;
      renderAll();
      hideNotice();

      return true;
    } catch (error) {
      console.error("NEXORA account load error:", error);

      assets = DEFAULT_ASSETS.map(a => ({ ...a, balance: 0 }));
      transactions = [];

      renderAll();

      showNotice(
        `${error.message} Displayed balances are zero until Supabase is verified.`,
        "error"
      );

      return false;
    } finally {
      busy = false;
    }
  }

  // ========================================
  // DASHBOARD RENDERING
  // ========================================

  function renderAll() {
    if (byId("totalBalance")) {
      byId("totalBalance").textContent =
        formatMoney(portfolioValue());
    }

    if (byId("assetCount")) {
      byId("assetCount").textContent =
        String(assets.filter(a => a.balance > 0).length);
    }

    if (byId("transactionCount")) {
      byId("transactionCount").textContent =
        String(transactions.length);
    }

    renderAssets(byId("assetSearch")?.value || "");
    renderTransactions("recentTransactions", transactions.slice(0, 5));
    renderTransactions("allTransactions", transactions);
    updateWithdrawAsset();
  }

  function renderAssets(searchTerm = "") {
    const container = byId("assetList");
    if (!container) return;

    const term = searchTerm.trim().toLowerCase();

    const filtered = assets.filter(a =>
      a.symbol.toLowerCase().includes(term) ||
      a.name.toLowerCase().includes(term)
    );

    if (!filtered.length) {
      container.innerHTML =
        '<p class="empty-state">No matching assets.</p>';
      return;
    }

    container.innerHTML = filtered.map(a => `
      <button type="button"
        class="asset-row ${selectedAsset === a.symbol ? "selected" : ""}"
        data-asset="${a.symbol}">
        <span class="asset-name">
          <span class="coin-icon ${a.className}">${a.icon}</span>
          <span>
            <strong>${a.symbol}</strong>
            <small>${a.name}</small>
          </span>
        </span>
        <span class="asset-balance">
          ${formatQuantity(a.balance, a.symbol)}
        </span>
        <span class="asset-price">
          ${formatMoney(PRICES[a.symbol])}
        </span>
        <span class="asset-value">
          ${formatMoney(a.balance * PRICES[a.symbol])}
        </span>
      </button>
    `).join("");

    container.querySelectorAll("[data-asset]").forEach(button => {
      button.addEventListener("click", () => {
        selectedAsset = button.dataset.asset;
        renderAll();
      });
    });
  }

  byId("assetSearch")?.addEventListener("input", event => {
    renderAssets(event.target.value);
  });

  function renderTransactions(containerId, list) {
  const container = byId(containerId);
  if (!container) return;

  if (!list.length) {
    container.innerHTML =
      '<p class="empty-state">No transactions recorded.</p>';
    return;
  }

  container.innerHTML = list.map(item => {
    const isFunding = item.type === "account_funded";
    const title = isFunding ? "Account Funded" : "Withdrawal";
    const sign = isFunding ? "+" : "−";
    const amountClass = isFunding ? "positive" : "negative";
    const icon = isFunding ? "↓" : "↑";
    const date = item.date || (
  item.created_at
    ? new Date(item.created_at).toLocaleString()
    : "Date unavailable"
);

    return `
      <article class="transaction-row">
        <span class="transaction-icon ${isFunding ? "fund" : "withdraw"}">
          ${icon}
        </span>
        <div class="transaction-description">
          <strong>${title}</strong>
          <small>${escapeHTML(date)}</small>
          <small>${escapeHTML(item.asset)}</small>
        </div>
        <div class="transaction-amount">
          <strong class="${amountClass}">
            ${sign}${formatQuantity(item.amount, item.asset)}
          </strong>
          <small class="transaction-status">
            ${escapeHTML(item.status)}
          </small>
        </div>
      </article>
    `;
  }).join("");
}

  // ========================================
  // CHART
  // ========================================

  function drawPortfolioChart() {
    const line = byId("chartLine");
    const area = byId("chartArea");
    const grid = byId("chartGrid");

    if (!line || !area || !grid) return;

    // Illustrative values only — not real market data.
    const values = [
      82, 79, 81, 76, 78, 70, 73, 65, 58, 51,
      48, 50, 46, 49, 47, 48, 45, 43, 47, 45,
      49, 51, 50, 53, 55, 52, 56, 54, 59, 57,
      62, 58, 64, 60, 67, 63, 69, 65, 71, 66,
      61, 64, 59, 62, 57, 60, 55, 58, 53, 57,
      51, 56, 61, 58, 66, 63, 72, 68, 80, 74,
      87, 83, 94, 98
    ];

    const width = 700;
    const height = 180;
    const paddingTop = 12;
    const paddingBottom = 15;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((value, index) => ({
      x: (index / (values.length - 1)) * width,
      y: height - paddingBottom -
        ((value - min) / range) *
        (height - paddingTop - paddingBottom)
    }));

    const linePath = points
      .map((point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      )
      .join(" ");

    line.setAttribute("d", linePath);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "#20d99a");
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");

    const areaPath =
      `${linePath} L ${width} ${height} L 0 ${height} Z`;

    area.setAttribute("d", areaPath);
    area.setAttribute("fill", "url(#chartGradient)");

    grid.innerHTML = [20, 65, 110, 155]
      .map(y => `
        <line
          x1="0"
          y1="${y}"
          x2="${width}"
          y2="${y}"
          stroke="rgba(255,255,255,0.09)"
          stroke-dasharray="3 6"
        ></line>
      `)
      .join("");
  }

  // ========================================
  // WITHDRAWAL REQUEST
  // ========================================

  function updateWithdrawAsset() {
    const select = byId("withdrawAsset");

    if (select) select.value = selectedAsset;

    const asset = getAsset(selectedAsset);

    if (byId("availableBalance")) {
      byId("availableBalance").textContent = asset
        ? formatQuantity(asset.balance, asset.symbol)
        : "Unavailable";
    }

    updateEstimatedValue();
  }

  function updateEstimatedValue() {
    const amount = Number(byId("withdrawAmount")?.value);
    const value =
      Number.isFinite(amount) && amount > 0 ? amount : 0;

    if (byId("estimatedValue")) {
      byId("estimatedValue").textContent =
        formatMoney(value * PRICES[selectedAsset]);
    }
  }

  byId("withdrawAsset")?.addEventListener("change", event => {
    if (!Object.hasOwn(PRICES, event.target.value)) return;

    selectedAsset = event.target.value;
    renderAll();
  });

  byId("withdrawAmount")?.addEventListener(
    "input",
    updateEstimatedValue
  );

  
byId("withdrawForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!accountReady) {
    showNotice(
      "Your balance is being verified. Please try again shortly.",
      "error"
    );
    return;
  }

  const amount = Number(byId("withdrawAmount")?.value);
  const destination = byId("destination")?.value.trim();
  const asset = getAsset(selectedAsset);

  if (!Number.isFinite(amount) || amount <= 0) {
    showNotice("Enter an amount greater than zero.", "error");
    return;
  }

  if (!asset || amount > asset.balance) {
    showNotice("Insufficient live balance.", "error");
    return;
  }

  if (!destination || destination.length < 6) {
    showNotice(
      "Enter a destination of at least 6 characters.",
      "error"
    );
    return;
  }

  const form = byId("withdrawForm");
  const button = form.querySelector('[type="submit"]');

  if (busy) return;

  if (button) button.disabled = true;
  busy = true;

  try {
    const withdrawalId = await api.requestWithdrawal({
      asset: selectedAsset,
      amount,
      destination
    });

    const { data: withdrawal, error } = await api.client
      .from("nexora_withdrawals")
      .select("id, asset, amount, status, created_at")
      .eq("id", withdrawalId)
      .single();

    if (error) throw error;

    showReceipt({
      reference: withdrawal.id,
      type: "Withdrawal",
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      date: withdrawal.created_at,
      status: withdrawal.status
    });

    byId("withdrawAmount").value = "";
    byId("destination").value = "";

    showNotice(
      "Withdrawal request recorded. No cryptocurrency was sent.",
      "success"
    );

    await refreshAccount();

  } catch (error) {
    console.error("NEXORA withdrawal error:", error);

    showNotice(
      error.message || "Withdrawal request failed.",
      "error"
    );
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
});


  // ========================================
  // DEPOSIT ADDRESSES — SUPABASE
  // ========================================

  async function loadDepositAddresses() {
    const message = byId("depositMessage");

    if (message) {
      message.textContent = "Loading deposit addresses...";
    }

    try {
      const { data, error } = await api.client
        .from("nexora_deposit_addresses")
        .select("asset, wallet_address")
        .in("asset", ["BTC", "ETH", "USDT"]);

      if (error) throw error;

      depositAddresses = new Map(
        (data || []).map(item => [
          String(item.asset).toUpperCase(),
          String(item.wallet_address || "").trim()
        ])
      );

      updateDepositDetails();

      if (message) {
        message.textContent = selectedDepositAsset
          ? ""
          : "Choose a cryptocurrency to view its deposit details.";
      }
    } catch (error) {
 console.error("Deposit address loading failed:", error);

      depositAddresses.clear();

      updateDepositDetails();

      if (message) {
        message.textContent =
          "Could not load deposit addresses from Supabase.";
      }
    }
  }

  // ========================================
  // DEPOSIT SCREEN CONTROLS
  // ========================================

  function showDepositAssetList() {
    selectedDepositAsset = null;

    byId("depositAssetScreen")?.classList.remove("hidden");
    byId("depositDetailsScreen")?.classList.add("hidden");
  }

  function showDepositDetails(symbol) {
    const config = DEPOSIT_ASSETS[symbol];

    if (!config) return;

    selectedDepositAsset = symbol;

    byId("depositAssetScreen")?.classList.add("hidden");
    byId("depositDetailsScreen")?.classList.remove("hidden");

    const icon = byId("selectedDepositIcon");

    if (icon) {
      icon.textContent = config.icon;
      icon.className = `deposit-coin-icon ${config.className}`;
    }

    if (byId("selectedDepositName")) {
      byId("selectedDepositName").textContent = config.name;
    }

    if (byId("selectedDepositSymbol")) {
      byId("selectedDepositSymbol").textContent = config.symbol;
    }

    if (byId("depositQrTitle")) {
      byId("depositQrTitle").textContent =
        `${config.symbol} Deposit QR Code`;
    }

    const qrImage = byId("depositQrImage");

    if (qrImage) {
      qrImage.src = config.image;
      qrImage.alt = `${config.symbol} deposit QR code`;
    }

    const networkSelect = byId("depositNetwork");

    if (networkSelect) {
      networkSelect.replaceChildren();

      const option = document.createElement("option");
      option.value = "";
      option.textContent = config.network;
      networkSelect.appendChild(option);
      networkSelect.disabled = true;
    }

    if (byId("depositNetworkWarning")) {
      byId("depositNetworkWarning").textContent =
        "Confirm the exact network for this QR code and address before any transfer.";
    }

    updateDepositDetails();
  }

  function updateDepositDetails() {
    const addressElement = byId("selectedDepositAddress");
    const message = byId("depositMessage");

    if (!addressElement) return;

    if (!selectedDepositAsset) {
      addressElement.textContent = "Address not configured yet.";
      return;
    }

    const address = depositAddresses.get(selectedDepositAsset);

    if (address) {
      addressElement.textContent = address;

      if (message) message.textContent = "";
    } else {
      addressElement.textContent = "Address not available yet.";

      if (message) {
        message.textContent =
          `No ${selectedDepositAsset} address was found in Supabase.`;
      }
    }
  }

  document.querySelectorAll("[data-deposit-asset]").forEach(button => {
    button.addEventListener("click", () => {
      const symbol = button.dataset.depositAsset;
      showDepositDetails(symbol);
    });
  });

  byId("backToCrypto")?.addEventListener("click", () => {
    showDepositAssetList();
  });
   byId("copySelectedDepositAddress")?.addEventListener(
    "click",
    async () => {
      const address = byId("selectedDepositAddress")
        ?.textContent.trim();

      if (
        !address ||
        address === "Address not available yet." ||
        address === "Address not configured yet."
      ) {
        showNotice("There is no deposit address to copy.", "error");
        return;
      }

      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error("Clipboard access is unavailable.");
        }

        await navigator.clipboard.writeText(address);

        showNotice("Deposit address copied.", "success");
      } catch (error) {
        console.error("Copy address failed:", error);

        showNotice(
          "Could not copy automatically. Select and copy the address manually.",
          "error"
        );
      }
    }
  );
    // ========================================
  // NAVIGATION
  // ========================================

  const pageIds = {
    Dashboard: "dashboardPage",
    Deposit: "depositPage",
    Withdraw: "withdrawPage",
    Exchange: "exchangePage",
    Transactions: "transactionsPage",
    Profile: "profilePage"
  };

  async function navigateTo(page) {
    if (!pageIds[page]) return;

    document.querySelectorAll(".page").forEach(section => {
      section.classList.add("hidden");
    });

    byId(pageIds[page])?.classList.remove("hidden");

    if (byId("pageTitle")) {
      byId("pageTitle").textContent = page;
    }

    document.querySelectorAll("[data-page]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

    byId("sidebar")?.classList.remove("open");

    hideNotice();

    if (page === "Withdraw") {
      updateWithdrawAsset();
    }

    if (page === "Deposit") {
      showDepositAssetList();
      await loadDepositAddresses();
    }

    if (page === "Transactions") {
      renderTransactions("allTransactions", transactions);
    }
  }

  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();

      const page = button.dataset.page;
      navigateTo(page);

      if (page === "Exchange") {
        showNotice("Exchange is disabled in this version.", "info");
      }

      if (page === "Profile") {
        showNotice(
          "Profile management is not enabled yet.",
          "info"
        );
      }
    });
  });

  byId("menuButton")?.addEventListener("click", () => {
    byId("sidebar")?.classList.toggle("open");
  });

  // ========================================
  // STARTUP / SESSION RESTORE
  // ========================================

  async function startDashboard(user) {
    showDashboard(user);
    drawPortfolioChart();
    await navigateTo("Dashboard");
    await refreshAccount();
  }

  async function restoreSession() {
    try {
      const { data, error } = await api.client.auth.getSession();

      if (error) throw error;

      const user = data.session?.user;

      if (user && !user.is_anonymous) {
        await startDashboard(user);
      } else {
        appShell?.classList.add("hidden");
        mobileNav?.classList.add("hidden");
        authScreen?.classList.remove("hidden");

        showSignup();
      }
    } catch (error) {
      console.error("NEXORA session restore error:", error);

      appShell?.classList.add("hidden");
      mobileNav?.classList.add("hidden");
      authScreen?.classList.remove("hidden");

      showSignup();

      showNotice(
        error.message || "Could not restore session.",
        "error"
      );
    }
  }

  restoreSession();

  function showReceipt({
  reference,
  type,
  asset,
  amount,
  date,
  status = "pending"
}) {
  document.getElementById("receiptReference").textContent =
    reference;

  document.getElementById("receiptType").textContent = type;
  document.getElementById("receiptAsset").textContent = asset;
  document.getElementById("receiptAmount").textContent =
    `${amount} ${asset}`;

  document.getElementById("receiptDate").textContent =
    new Date(date).toLocaleString();

  const statusElement =
    document.getElementById("receiptStatus");

  statusElement.textContent = status.toUpperCase();

  document.getElementById("receiptSection").hidden = false;
}

document.getElementById("closeReceipt").addEventListener(
  "click",
  () => {
    document.getElementById("receiptSection").hidden = true;
  }
);
});
  