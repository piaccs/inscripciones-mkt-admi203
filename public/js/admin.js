let adminPassword = localStorage.getItem('mkt_admin_password') || '';
let allRegistrations = [];
let deleteTargetId = null;

// DOM
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const logoutBtn = document.getElementById('logoutBtn');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const loginError = document.getElementById('loginError');
const registrationsTableBody = document.getElementById('registrationsTableBody');
const statTotalGroups = document.getElementById('statTotalGroups');
const statTotalStudents = document.getElementById('statTotalStudents');
const statExhaustedProducts = document.getElementById('statExhaustedProducts');
const adminStockBar = document.getElementById('adminStockBar');
const deleteModal = document.getElementById('deleteModal');
const filterInput = document.getElementById('filterInput');

document.addEventListener('DOMContentLoaded', () => {
  if (adminPassword) {
    verifyAndDisplay();
  }
});

async function verifyAndDisplay() {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword })
    });

    if (res.ok) {
      showDashboard();
      loadRegistrations();
      loadStockBar();
      setupAdminSSE();
    } else {
      logout();
    }
  } catch (err) {
    console.error(err);
  }
}

window.handleLogin = async function(event) {
  event.preventDefault();
  const pwd = adminPasswordInput.value.trim();
  if (!pwd) return;

  loginError.classList.add('hidden');

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });

    const data = await res.json();
    if (res.ok) {
      adminPassword = pwd;
      localStorage.setItem('mkt_admin_password', pwd);
      showDashboard();
      loadRegistrations();
      loadStockBar();
      setupAdminSSE();
    } else {
      loginError.textContent = data.error || 'Contraseña incorrecta.';
      loginError.classList.remove('hidden');
    }
  } catch (err) {
    loginError.textContent = 'Error de conexión al servidor.';
    loginError.classList.remove('hidden');
  }
};

function showDashboard() {
  loginScreen.classList.add('hidden');
  dashboardScreen.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
}

window.logout = function() {
  adminPassword = '';
  localStorage.removeItem('mkt_admin_password');
  loginScreen.classList.remove('hidden');
  dashboardScreen.classList.add('hidden');
  logoutBtn.classList.add('hidden');
  adminPasswordInput.value = '';
};

// SSE for auto-refreshing admin dashboard when students register
function setupAdminSSE() {
  const eventSource = new EventSource('/api/events');
  eventSource.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.type === 'stock_update') {
        renderStockBar(payload.products);
        loadRegistrations(false);
      }
    } catch (_) {}
  };
}

async function loadStockBar() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    renderStockBar(data.products);
  } catch (_) {}
}

function renderStockBar(products) {
  if (!products) return;
  let exhausted = 0;

  adminStockBar.innerHTML = products.map(p => {
    const isPast = p.id === 'semestre_pasado';
    if (!isPast && p.cupos_disponibles === 0) exhausted++;

    let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    let text = `${p.cupos_disponibles} cupos`;

    if (isPast) {
      badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
      text = 'Disponible';
    } else if (p.cupos_disponibles === 1) {
      badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
      text = '1 cupo';
    } else if (p.cupos_disponibles === 0) {
      badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
      text = 'Agotado (0)';
    }

    return `
      <div class="p-2.5 rounded-xl border ${badgeClass} text-center">
        <div class="font-bold text-[11px] truncate" title="${p.name}">${p.name}</div>
        <div class="text-[10px] font-semibold mt-0.5">${text}</div>
      </div>
    `;
  }).join('');

  statExhaustedProducts.textContent = `${exhausted} / 6`;
}

window.loadRegistrations = async function(showLoading = true) {
  if (showLoading) {
    registrationsTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-slate-400 animate-pulse">
          Actualizando lista de grupos...
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch('/api/admin/registrations', {
      headers: { 'x-admin-password': adminPassword }
    });

    if (!res.ok) {
      if (res.status === 401) logout();
      return;
    }

    const data = await res.json();
    allRegistrations = data.registrations || [];

    updateStats();
    renderTable(allRegistrations);
  } catch (err) {
    console.error(err);
  }
};

function updateStats() {
  statTotalGroups.textContent = allRegistrations.length;
  const totalStudents = allRegistrations.reduce((acc, r) => acc + (r.member_count || r.members.length), 0);
  statTotalStudents.textContent = totalStudents;
}

function renderTable(list) {
  if (list.length === 0) {
    registrationsTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="py-12 text-center text-slate-400 text-sm">
          No hay inscripciones registradas todavía.
        </td>
      </tr>
    `;
    return;
  }

  registrationsTableBody.innerHTML = list.map((r, index) => {
    const orderNumber = index + 1;
    const isPast = r.product_id === 'semestre_pasado';

    const membersBadges = r.members.map((m, mIdx) => `
      <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
        ${mIdx + 1}. ${m}
      </span>
    `).join(' ');

    return `
      <tr class="hover:bg-slate-50/80 transition group">
        <td class="py-3 px-4 text-center font-bold text-slate-900 bg-slate-50/50">
          #${orderNumber}
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="font-semibold text-slate-800 text-xs">${r.created_at_chile}</div>
          <div class="text-[10px] text-slate-400">Hora local Chile</div>
        </td>
        <td class="py-3 px-4">
          <div class="font-bold text-slate-900 text-xs">${r.product_name}</div>
          ${r.product_sach && r.product_sach !== '–' ? `<div class="text-[10px] font-mono text-slate-500">SACh: ${r.product_sach}</div>` : ''}
          ${isPast && r.past_project_name ? `
            <div class="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
              Emprendimiento: ${r.past_project_name}
            </div>
          ` : ''}
        </td>
        <td class="py-3 px-4">
          <div class="flex flex-wrap gap-1.5 max-w-xl">
            ${membersBadges}
          </div>
          <div class="text-[10px] text-slate-400 mt-1">Total: ${r.member_count} integrantes</div>
        </td>
        <td class="py-3 px-4 text-center">
          <button onclick="promptDelete(${r.id})"
            class="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition flex items-center gap-1 mx-auto"
            title="Eliminar inscripción y liberar cupo">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            Eliminar
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.filterRegistrations = function() {
  const query = filterInput.value.toLowerCase().trim();
  if (!query) {
    renderTable(allRegistrations);
    return;
  }

  const filtered = allRegistrations.filter(r => {
    const inProduct = (r.product_name || '').toLowerCase().includes(query);
    const inPast = (r.past_project_name || '').toLowerCase().includes(query);
    const inMembers = r.members.some(m => m.toLowerCase().includes(query));
    return inProduct || inPast || inMembers;
  });

  renderTable(filtered);
};

window.promptDelete = function(id) {
  deleteTargetId = id;
  deleteModal.classList.remove('hidden');
};

window.closeDeleteModal = function() {
  deleteTargetId = null;
  deleteModal.classList.add('hidden');
};

window.executeDelete = async function() {
  if (!deleteTargetId) return;

  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  btn.textContent = 'Eliminando...';

  try {
    const res = await fetch(`/api/admin/registrations/${deleteTargetId}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword }
    });

    if (res.ok) {
      closeDeleteModal();
      loadRegistrations(false);
      loadStockBar();
    } else {
      const data = await res.json();
      alert(data.error || 'Error al eliminar inscripción');
    }
  } catch (err) {
    alert('Error al conectar con el servidor');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sí, Eliminar';
  }
};

window.downloadExcel = function() {
  window.open(`/api/admin/export-csv?password=${encodeURIComponent(adminPassword)}`, '_blank');
};
