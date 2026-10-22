"use strict";

const STORAGE_KEY = "morrowCafeState";
const DEFAULT_MENUS = [
  { id: "americano", name: "아메리카노", description: "깊고 깔끔한 풍미의 시그니처 블렌드", price: 3500, stock: 10, bg: "#e7d8c4", color: "#69432f", top: "#3e2c22", label: "classic" },
  { id: "cafe-latte", name: "카페라떼", description: "에스프레소와 부드러운 우유의 조화", price: 4000, stock: 10, bg: "#e9d8c5", color: "#c1a080", top: "#875f42", label: "milk" },
  { id: "vanilla-latte", name: "바닐라라떼", description: "은은한 바닐라 향을 더한 달콤한 라떼", price: 4500, stock: 10, bg: "#efe2ca", color: "#d0b28c", top: "#906845", label: "vanilla" },
  { id: "caramel-macchiato", name: "카라멜마끼아또", description: "진한 에스프레소에 카라멜을 더해", price: 4800, stock: 10, bg: "#ead8c2", color: "#c09261", top: "#805535", label: "caramel" },
  { id: "chocolate-latte", name: "초콜릿라떼", description: "진한 초콜릿과 우유가 만난 달콤함", price: 4500, stock: 10, bg: "#e7d6cb", color: "#8a5741", top: "#513326", label: "cocoa" }
];
const OPTIONS = {
  shot: { label: "샷 추가", price: 500 },
  syrup: { label: "시럽 추가", price: 0 }
};

const $ = (selector, root = document) => root.querySelector(selector);
const menuGrid = $("#menu-grid");
const cartItems = $("#cart-items");
const ordersList = $("#orders-list");
const inventoryList = $("#inventory-list");
const successDialog = $("#success-dialog");
let state = loadState();
let checkoutInProgress = false;

function isValidState(value) {
  return value && Array.isArray(value.menus) && Array.isArray(value.orders) && Array.isArray(value.cart);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return { menus: structuredClone(DEFAULT_MENUS), orders: [], cart: [] };
    }
    const parsed = JSON.parse(saved);
    if (!isValidState(parsed)) throw new Error("저장된 데이터 형식이 올바르지 않습니다.");
    const menuMap = new Map(parsed.menus.filter(menu => menu && typeof menu.id === "string").map(menu => [menu.id, menu]));
    const menus = DEFAULT_MENUS.map(defaultMenu => {
      const stored = menuMap.get(defaultMenu.id);
      const stock = Number(stored?.stock);
      return { ...defaultMenu, stock: Number.isInteger(stock) && stock >= 0 ? stock : defaultMenu.stock };
    });
    const validMenuIds = new Set(menus.map(menu => menu.id));
    const orders = parsed.orders.filter(order =>
      order && typeof order.id === "string" && Number.isFinite(order.total) && order.total >= 0 &&
      Number.isFinite(order.createdAt) && Array.isArray(order.items) &&
      order.items.every(item => item && validMenuIds.has(item.menuId) && typeof item.name === "string" &&
        Array.isArray(item.options) && item.options.every(option => typeof option === "string") &&
        Number.isInteger(item.quantity) && item.quantity > 0 && Number.isFinite(item.unitPrice) && item.unitPrice >= 0) &&
      ["주문 접수", "제조 완료"].includes(order.status)
    );
    const cart = parsed.cart.filter(item =>
      item && validMenuIds.has(item.menuId) && Number.isInteger(item.quantity) && item.quantity > 0 &&
      typeof item.shot === "boolean" && typeof item.syrup === "boolean"
    );
    return { menus, orders, cart };
  } catch (error) {
    console.error("저장된 카페 데이터를 불러오지 못했습니다.", error);
    setTimeout(() => showToast("저장 데이터에 문제가 있어 기본 데이터로 시작합니다."), 0);
    return { menus: structuredClone(DEFAULT_MENUS), orders: [], cart: [] };
  }
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error("카페 데이터를 저장하지 못했습니다.", error);
    showToast("데이터를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.");
    return false;
  }
}

function formatPrice(amount) {
  return `${Number(amount).toLocaleString("ko-KR")}원`;
}

function menuFor(menuId) {
  return state.menus.find(menu => menu.id === menuId);
}

function itemUnitPrice(item) {
  const menu = menuFor(item.menuId);
  return (menu?.price ?? 0) + (item.shot ? OPTIONS.shot.price : 0) + (item.syrup ? OPTIONS.syrup.price : 0);
}

function cartTotal() {
  return state.cart.reduce((total, item) => total + itemUnitPrice(item) * item.quantity, 0);
}

function cartQuantityFor(menuId) {
  return state.cart.filter(item => item.menuId === menuId).reduce((total, item) => total + item.quantity, 0);
}

function renderMenu() {
  menuGrid.innerHTML = state.menus.map(menu => {
    const soldOut = menu.stock === 0;
    return `
      <article class="menu-card" data-menu-card="${menu.id}">
        <div class="drink-art" style="--drink-bg:${menu.bg};--drink-color:${menu.color};--drink-top:${menu.top}">
          <div class="drink-cup" aria-hidden="true"></div><span class="drink-label">${menu.label}</span>
        </div>
        <div class="menu-card-body">
          <div class="menu-card-title"><h3>${menu.name}</h3><strong>${formatPrice(menu.price)}</strong></div>
          <p class="menu-description">${menu.description}</p>
          <div class="menu-options">
            <label class="option-row"><span class="option-control"><input type="checkbox" data-option="shot" ${soldOut ? "disabled" : ""} />${OPTIONS.shot.label}</span><span class="option-price">+${formatPrice(OPTIONS.shot.price)}</span></label>
            <label class="option-row"><span class="option-control"><input type="checkbox" data-option="syrup" ${soldOut ? "disabled" : ""} />${OPTIONS.syrup.label}</span><span class="option-price">무료</span></label>
          </div>
          <div class="menu-card-footer">
            <span class="stock-label ${soldOut ? "sold-out" : ""}">${soldOut ? "품절" : `재고 <strong>${menu.stock}</strong>개`}</span>
            <div class="buy-control">
              <div class="quantity-control">
                <button type="button" data-quantity-change="-1" aria-label="${menu.name} 수량 감소" ${soldOut ? "disabled" : ""}>−</button>
                <input type="number" min="1" max="${menu.stock}" value="1" data-menu-quantity aria-label="${menu.name} 수량" ${soldOut ? "disabled" : ""} />
                <button type="button" data-quantity-change="1" aria-label="${menu.name} 수량 증가" ${soldOut ? "disabled" : ""}>+</button>
              </div>
              <button type="button" class="add-button" data-add-menu="${menu.id}" ${soldOut ? "disabled" : ""}>${soldOut ? "품절" : "담기 +"}</button>
            </div>
          </div>
        </div>
      </article>`;
  }).join("");
}

function renderCart() {
  const count = state.cart.reduce((total, item) => total + item.quantity, 0);
  $("#cart-count").textContent = count;
  $("#cart-count-summary").textContent = count;
  $("#subtotal").textContent = formatPrice(cartTotal());
  $("#cart-total").textContent = formatPrice(cartTotal());
  $("#checkout-button").disabled = state.cart.length === 0 || checkoutInProgress;
  if (state.cart.length === 0) {
    cartItems.innerHTML = `<div class="empty-cart"><span class="empty-cart-mark">m.</span><strong>장바구니가 비어 있어요</strong><span>마음에 드는 음료를 담아보세요.</span></div>`;
    return;
  }
  cartItems.innerHTML = state.cart.map((item, index) => {
    const menu = menuFor(item.menuId);
    const optionLabels = [item.shot && OPTIONS.shot.label, item.syrup && OPTIONS.syrup.label].filter(Boolean);
    return `<article class="cart-row">
      <div class="cart-thumb" style="--drink-color:${menu.color};--drink-top:${menu.top}" aria-hidden="true"><div class="drink-cup"></div></div>
      <div class="cart-item-details"><div class="cart-item-name">${menu.name}</div><div class="cart-item-options">${optionLabels.length ? optionLabels.join(" · ") : "기본"} · ${formatPrice(itemUnitPrice(item))}</div></div>
      <div class="quantity-control">
        <button type="button" data-cart-change="-1" data-cart-index="${index}" aria-label="수량 감소">−</button>
        <input type="number" value="${item.quantity}" aria-label="장바구니 수량" readonly />
        <button type="button" data-cart-change="1" data-cart-index="${index}" aria-label="수량 증가">+</button>
      </div>
      <strong class="cart-row-price">${formatPrice(itemUnitPrice(item) * item.quantity)}</strong>
      <button type="button" class="remove-item" data-remove-item="${index}" aria-label="항목 삭제">×</button>
    </article>`;
  }).join("");
}

function renderAdmin() {
  const pending = state.orders.filter(order => order.status === "주문 접수").length;
  const completed = state.orders.filter(order => order.status === "제조 완료").length;
  const soldOut = state.menus.filter(menu => menu.stock === 0).length;
  $("#stats-grid").innerHTML = [
    ["전체 주문", state.orders.length, "건"],
    ["주문 접수", pending, "건"],
    ["제조 완료", completed, "건"],
    ["품절 메뉴", soldOut, "개"]
  ].map(([label, value, unit]) => `<article class="stat-card"><span class="stat-label"><i class="stat-indicator"></i>${label}</span><strong class="stat-value">${value}<small>${unit}</small></strong></article>`).join("");

  const ordered = [...state.orders].sort((a, b) => b.createdAt - a.createdAt);
  $("#order-list-count").textContent = `총 ${ordered.length}건`;
  ordersList.innerHTML = ordered.length ? ordered.map(order => `
    <article class="order-card">
      <div class="order-number">#${escapeHtml(order.id)}<time class="order-time">${new Date(order.createdAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}</time></div>
      <div class="order-items-summary">${order.items.map(item => `${escapeHtml(item.name)}${item.options.length ? ` <span>(${item.options.map(escapeHtml).join(", ")})</span>` : ""} <span>× ${item.quantity}</span>`).join("<br />")}</div>
      <strong class="order-price">${formatPrice(order.total)}</strong>
      <div class="order-status"><span class="status-badge ${order.status === "제조 완료" ? "complete" : ""}">${order.status}</span>${order.status === "주문 접수" ? `<button type="button" class="complete-button" data-complete-order="${escapeHtml(order.id)}">제조 완료</button>` : ""}</div>
    </article>`).join("") : `<div class="empty-state"><strong>아직 접수된 주문이 없어요</strong><span>새 주문이 들어오면 여기에 표시됩니다.</span></div>`;

  inventoryList.innerHTML = state.menus.map(menu => `
    <form class="inventory-row" data-stock-form="${menu.id}">
      <div><div class="inventory-name">${menu.name}</div><div class="inventory-price">${formatPrice(menu.price)}</div></div>
      <span class="inventory-stock">현재 <strong>${menu.stock}</strong>개</span>
      <span class="inventory-state ${menu.stock === 0 ? "sold-out" : ""}">${menu.stock === 0 ? "품절" : "판매 중"}</span>
      <div class="stock-edit"><input type="number" min="0" step="1" value="${menu.stock}" aria-label="${menu.name} 재고 수량" /><button type="submit">저장</button></div>
    </form>`).join("");
}

function renderAll() {
  renderMenu();
  renderCart();
  renderAdmin();
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  $("#toast-region").append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function updateState(nextState, successMessage) {
  const previous = state;
  state = nextState;
  if (!persistState()) {
    state = previous;
    renderAll();
    return false;
  }
  renderAll();
  if (successMessage) showToast(successMessage);
  return true;
}

function changeView(view) {
  const isAdmin = view === "admin";
  $("#shop-view").hidden = isAdmin;
  $("#admin-view").hidden = !isAdmin;
  $(".header-title").textContent = isAdmin ? "관리자" : "주문하기";
  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.viewLink === view && !button.hasAttribute("data-scroll-cart"));
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view-link]");
  if (viewButton) {
    event.preventDefault();
    changeView(viewButton.dataset.viewLink);
    if (viewButton.hasAttribute("data-scroll-cart")) {
      window.setTimeout(() => $("#cart-section").scrollIntoView({ behavior: "smooth" }), 50);
    }
    return;
  }

  const quantityButton = event.target.closest("[data-quantity-change]");
  if (quantityButton) {
    const input = quantityButton.closest(".buy-control").querySelector("[data-menu-quantity]");
    const max = Number(input.max);
    input.value = Math.min(max, Math.max(1, Number(input.value || 1) + Number(quantityButton.dataset.quantityChange)));
    return;
  }

  const addButton = event.target.closest("[data-add-menu]");
  if (addButton) {
    const card = addButton.closest(".menu-card");
    const menu = menuFor(addButton.dataset.addMenu);
    const quantityInput = $("[data-menu-quantity]", card);
    const quantity = Number(quantityInput.value);
    if (!Number.isInteger(quantity) || quantity < 1) {
      showToast("수량은 1개 이상 입력해 주세요.");
      quantityInput.value = 1;
      return;
    }
    if (!menu || menu.stock === 0 || cartQuantityFor(menu.id) + quantity > menu.stock) {
      showToast(`재고가 부족합니다. ${menu?.name ?? "메뉴"} 재고를 확인해 주세요.`);
      return;
    }
    const shot = $('[data-option="shot"]', card).checked;
    const syrup = $('[data-option="syrup"]', card).checked;
    const nextCart = [...state.cart];
    const matching = nextCart.find(item => item.menuId === menu.id && item.shot === shot && item.syrup === syrup);
    if (matching) matching.quantity += quantity;
    else nextCart.push({ menuId: menu.id, shot, syrup, quantity });
    if (updateState({ ...state, cart: nextCart }, `${menu.name}을(를) 장바구니에 담았습니다.`)) {
      window.scrollTo({ top: window.scrollY, behavior: "smooth" });
    }
    return;
  }

  const cartChange = event.target.closest("[data-cart-change]");
  if (cartChange) {
    const index = Number(cartChange.dataset.cartIndex);
    const item = state.cart[index];
    const menu = item && menuFor(item.menuId);
    if (!item || !menu) return;
    const delta = Number(cartChange.dataset.cartChange);
    const total = cartQuantityFor(item.menuId);
    if (delta > 0 && total + 1 > menu.stock) {
      showToast("현재 재고보다 많은 수량은 담을 수 없습니다.");
      return;
    }
    const nextCart = state.cart.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: entry.quantity + delta } : entry);
    const adjustedCart = nextCart.filter(entry => entry.quantity > 0);
    updateState({ ...state, cart: adjustedCart });
    return;
  }

  const removeButton = event.target.closest("[data-remove-item]");
  if (removeButton) {
    const index = Number(removeButton.dataset.removeItem);
    updateState({ ...state, cart: state.cart.filter((_, entryIndex) => entryIndex !== index) });
    return;
  }

  const completeButton = event.target.closest("[data-complete-order]");
  if (completeButton) {
    const order = state.orders.find(item => item.id === completeButton.dataset.completeOrder);
    if (!order || order.status !== "주문 접수") return;
    const nextOrders = state.orders.map(item => item.id === order.id ? { ...item, status: "제조 완료" } : item);
    updateState({ ...state, orders: nextOrders }, `${order.id} 주문을 제조 완료로 변경했습니다.`);
    return;
  }
});

menuGrid.addEventListener("change", event => {
  if (!event.target.matches("[data-menu-quantity]")) return;
  const menu = menuFor(event.target.closest("[data-menu-card]").dataset.menuCard);
  const value = Number(event.target.value);
  event.target.value = Number.isInteger(value) ? Math.min(menu.stock, Math.max(1, value)) : 1;
});

inventoryList.addEventListener("submit", event => {
  const form = event.target.closest("[data-stock-form]");
  if (!form) return;
  event.preventDefault();
  const input = $('input[type="number"]', form);
  const stock = Number(input.value);
  if (!Number.isInteger(stock) || stock < 0) {
    showToast("재고는 0 이상의 정수로 입력해 주세요.");
    input.value = menuFor(form.dataset.stockForm)?.stock ?? 0;
    return;
  }
  const menu = menuFor(form.dataset.stockForm);
  if (!menu) return;
  const nextMenus = state.menus.map(item => item.id === menu.id ? { ...item, stock } : item);
  updateState({ ...state, menus: nextMenus }, `${menu.name} 재고를 ${stock}개로 변경했습니다.`);
});

$("#checkout-button").addEventListener("click", () => {
  if (checkoutInProgress || state.cart.length === 0) return;
  checkoutInProgress = true;
  renderCart();
  try {
    const required = new Map();
    for (const item of state.cart) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || !menuFor(item.menuId)) {
        throw new Error("장바구니 항목을 확인할 수 없습니다.");
      }
      required.set(item.menuId, (required.get(item.menuId) ?? 0) + item.quantity);
    }
    for (const [menuId, quantity] of required) {
      const menu = menuFor(menuId);
      if (!menu || menu.stock < quantity) throw new Error(`${menu?.name ?? "메뉴"} 재고가 부족합니다.`);
    }

    const now = Date.now();
    const orderNumber = `MR${String(now).slice(-8)}${String(Math.floor(Math.random() * 90) + 10)}`;
    const orderItems = state.cart.map(item => {
      const menu = menuFor(item.menuId);
      const options = [item.shot && OPTIONS.shot.label, item.syrup && OPTIONS.syrup.label].filter(Boolean);
      return { menuId: item.menuId, name: menu.name, options, quantity: item.quantity, unitPrice: itemUnitPrice(item) };
    });
    const order = {
      id: orderNumber,
      createdAt: now,
      items: orderItems,
      total: orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      status: "주문 접수"
    };
    const menus = state.menus.map(menu => ({ ...menu, stock: menu.stock - (required.get(menu.id) ?? 0) }));
    const previousState = state;
    state = { menus, orders: [order, ...state.orders], cart: [] };
    if (!persistState()) {
      state = previousState;
      renderAll();
      return;
    }
    renderAll();
    $("#completed-order-number").textContent = orderNumber;
    successDialog.showModal();
  } catch (error) {
    console.error("주문을 처리하지 못했습니다.", error);
    showToast(error instanceof Error ? error.message : "주문 처리 중 오류가 발생했습니다.");
  } finally {
    checkoutInProgress = false;
    renderCart();
  }
});

function closeSuccessDialog() {
  if (successDialog.open) successDialog.close();
}
$(".dialog-close").addEventListener("click", closeSuccessDialog);
$(".dialog-done").addEventListener("click", closeSuccessDialog);
successDialog.addEventListener("click", event => {
  if (event.target === successDialog) closeSuccessDialog();
});

window.addEventListener("storage", event => {
  if (event.key !== STORAGE_KEY || event.newValue === null) return;
  try {
    const externalState = JSON.parse(event.newValue);
    if (!isValidState(externalState)) throw new Error("다른 탭의 저장 데이터 형식이 올바르지 않습니다.");
    state = loadState();
    renderAll();
  } catch (error) {
    console.error("다른 탭의 변경 사항을 반영하지 못했습니다.", error);
    showToast("다른 탭의 데이터 변경을 반영하지 못했습니다.");
  }
});

renderAll();
