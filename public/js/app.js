// State
let products = [];
let selectedProductId = null;

// DOM Elements
const productsGrid = document.getElementById('productsGrid');
const pastProjectContainer = document.getElementById('pastProjectContainer');
const pastProjectInput = document.getElementById('pastProjectInput');
const memberInputs = document.querySelectorAll('.member-input');
const memberCounterBadge = document.getElementById('memberCounterBadge');
const memberCountText = document.getElementById('memberCountText');
const alertBox = document.getElementById('alertBox');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');
const successModal = document.getElementById('successModal');
const connectionStatus = document.getElementById('connectionStatus');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initMemberValidation();
  loadProducts();
  setupSSE();
});

// Member count live listener
function initMemberValidation() {
  memberInputs.forEach(input => {
    input.addEventListener('input', updateMemberCount);
  });
  updateMemberCount();
}

function getValidMembers() {
  const members = [];
  memberInputs.forEach(input => {
    const val = input.value.trim();
    if (val.length > 0) {
      members.push(val);
    }
  });
  return members;
}

function updateMemberCount() {
  const count = getValidMembers().length;
  if (count < 5) {
    memberCounterBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 self-start sm:self-center';
    memberCountText.textContent = `${count} de 5 integrantes mínimos`;
  } else if (count === 5 || count === 6) {
    memberCounterBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 self-start sm:self-center';
    memberCountText.textContent = `✓ ${count} integrantes listos (Válido)`;
  } else {
    memberCounterBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 self-start sm:self-center';
    memberCountText.textContent = `${count} integrantes (Máximo permitido: 6)`;
  }
}

// Fetch products initial fallback
async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Error al consultar productos');
    const data = await res.json();
    products = data.products;
    renderProducts();
  } catch (err) {
    console.error(err);
  }
}

// Server-Sent Events (SSE) Real-Time Sync
function setupSSE() {
  const eventSource = new EventSource('/api/events');

  eventSource.onopen = () => {
    connectionStatus.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700 shadow-xs';
    connectionStatus.innerHTML = `
      <span class="relative flex h-2.5 w-2.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>
      <span>Cupos sincronizados en vivo</span>
    `;
  };

  eventSource.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.type === 'stock_update' && Array.isArray(payload.products)) {
        products = payload.products;
        renderProducts();
      }
    } catch (err) {
      // heartbeats or comments
    }
  };

  eventSource.onerror = () => {
    connectionStatus.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700 shadow-xs';
    connectionStatus.innerHTML = `
      <span class="relative flex h-2.5 w-2.5">
        <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
      </span>
      <span>Reconectando stock en vivo...</span>
    `;
  };
}

// Render Products with Stock Cards
function renderProducts() {
  if (!products || products.length === 0) return;

  // If currently selected product has now 0 cupos, deselect it and warn user
  if (selectedProductId) {
    const current = products.find(p => p.id === selectedProductId);
    if (current && current.cupos_disponibles === 0 && current.max_cupos < 999) {
      selectedProductId = null;
      pastProjectContainer.classList.add('hidden');
      pastProjectInput.removeAttribute('required');
      showAlert('El producto que tenías seleccionado acaba de agotar sus cupos.', 'warning');
    }
  }

  productsGrid.innerHTML = products.map(prod => {
    const isPast = prod.id === 'semestre_pasado';
    const isAvailable = prod.cupos_disponibles > 0 || isPast;
    const isSelected = selectedProductId === prod.id;

    // Cupos Badge Styling
    let badgeHtml = '';
    if (isPast) {
      badgeHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">Cupo disponible</span>`;
    } else if (prod.cupos_disponibles === 2) {
      badgeHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">2 cupos disponibles</span>`;
    } else if (prod.cupos_disponibles === 1) {
      badgeHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">1 cupo disponible</span>`;
    } else {
      badgeHtml = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-600 border border-slate-300">0 cupos disponibles (Agotado)</span>`;
    }

    const cardClasses = isAvailable
      ? isSelected
        ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20 shadow-md cursor-pointer'
        : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs cursor-pointer'
      : 'border-slate-200 bg-slate-100/70 opacity-60 cursor-not-allowed';

    return `
      <div onclick="selectProduct('${prod.id}', ${isAvailable})"
        class="relative p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${cardClasses}">
        <div>
          <div class="flex items-start justify-between gap-2 mb-2">
            <h4 class="font-bold text-slate-900 text-base leading-snug">
              ${prod.name}
            </h4>
            <div class="shrink-0">${badgeHtml}</div>
          </div>

          <div class="space-y-1 text-xs text-slate-600 mt-3 pt-3 border-t border-slate-100">
            ${prod.sach && prod.sach !== '–' ? `<div><strong class="text-slate-700">SACh:</strong> <span class="font-mono text-slate-800 font-semibold">${prod.sach}</span></div>` : ''}
            ${prod.hs6 && prod.hs6 !== '–' ? `<div><strong class="text-slate-700">HS6:</strong> <span class="font-mono text-slate-800">${prod.hs6}</span></div>` : ''}
            ${prod.subproductos && prod.subproductos !== '–' ? `<div class="line-clamp-2"><strong class="text-slate-700">Subproductos:</strong> ${prod.subproductos}</div>` : ''}
          </div>
        </div>

        <div class="mt-4 pt-3 flex items-center justify-between">
          <label class="inline-flex items-center text-xs font-semibold ${isAvailable ? 'text-indigo-600' : 'text-slate-400'}">
            <input type="radio" name="product_selection" value="${prod.id}" 
              ${isSelected ? 'checked' : ''} 
              ${!isAvailable ? 'disabled' : ''} 
              class="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 mr-2 pointer-events-none">
            ${isAvailable ? (isSelected ? 'Seleccionado' : 'Elegir este producto') : 'No disponible'}
          </label>
        </div>
      </div>
    `;
  }).join('');
}

// Select Product
window.selectProduct = function(productId, isAvailable) {
  if (!isAvailable) return;
  selectedProductId = productId;

  if (productId === 'semestre_pasado') {
    pastProjectContainer.classList.remove('hidden');
    pastProjectInput.setAttribute('required', 'required');
    pastProjectInput.focus();
  } else {
    pastProjectContainer.classList.add('hidden');
    pastProjectInput.removeAttribute('required');
  }

  renderProducts();
};

// Show Alert Banner
function showAlert(message, type = 'error') {
  alertBox.classList.remove('hidden', 'bg-rose-50', 'text-rose-800', 'border-rose-200', 'bg-amber-50', 'text-amber-800', 'border-amber-200', 'bg-emerald-50', 'text-emerald-800', 'border-emerald-200');
  
  if (type === 'error') {
    alertBox.classList.add('bg-rose-50', 'text-rose-800', 'border', 'border-rose-200');
  } else if (type === 'warning') {
    alertBox.classList.add('bg-amber-50', 'text-amber-800', 'border', 'border-amber-200');
  } else {
    alertBox.classList.add('bg-emerald-50', 'text-emerald-800', 'border', 'border-emerald-200');
  }

  alertBox.innerHTML = `
    <div class="flex items-center gap-3">
      <svg class="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
      <div>${message}</div>
    </div>
  `;
  alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Form Submit Handler
window.handleSubmit = async function(event) {
  event.preventDefault();

  // 1. Validate members
  const members = getValidMembers();
  if (members.length < 5) {
    showAlert('Error: El formulario exige un <strong>mínimo de 5 integrantes</strong> para poder inscribirse. Por favor completa los nombres faltantes.');
    return;
  }
  if (members.length > 6) {
    showAlert('Error: El máximo permitido es de 6 integrantes.');
    return;
  }

  // 2. Validate product selection
  if (!selectedProductId) {
    showAlert('Por favor selecciona un producto disponible de la lista.');
    return;
  }

  // 3. Validate past semester product
  let pastProjectName = null;
  if (selectedProductId === 'semestre_pasado') {
    pastProjectName = pastProjectInput.value.trim();
    if (!pastProjectName) {
      showAlert('Debes ingresar obligatoriamente el <strong>nombre del emprendimiento</strong> del semestre pasado.');
      pastProjectInput.focus();
      return;
    }
  }

  // Disable button & show spinner
  submitBtn.disabled = true;
  btnText.textContent = 'Verificando cupos y registrando...';
  btnSpinner.classList.remove('hidden');

  try {
    const payload = {
      product_id: selectedProductId,
      past_project_name: pastProjectName,
      members: members
    };

    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      // If race condition: exact message requested
      if (response.status === 409 || (result.error && result.error.toLowerCase().includes('cupo'))) {
        showAlert('<strong>producto sin cupos disponibles</strong>: Otro grupo completó su registro una fracción de segundo antes. Por favor escoge otro producto disponible.');
        // Refresh products list
        loadProducts();
      } else {
        showAlert(result.error || 'Error al procesar la inscripción.');
      }
      return;
    }

    // Success! Show Receipt Modal
    document.getElementById('receiptDate').textContent = result.created_at_chile;
    document.getElementById('receiptProduct').textContent = pastProjectName 
      ? `${result.product_name} (${pastProjectName})`
      : result.product_name;

    const receiptList = document.getElementById('receiptMembers');
    receiptList.innerHTML = result.members.map(m => `<li>${m}</li>`).join('');

    successModal.classList.remove('hidden');
    alertBox.classList.add('hidden');

  } catch (err) {
    showAlert('Hubo un problema de conexión al enviar el formulario. Por favor intenta nuevamente.');
  } finally {
    submitBtn.disabled = false;
    btnText.textContent = 'Confirmar e Inscribir Grupo';
    btnSpinner.classList.add('hidden');
  }
};
