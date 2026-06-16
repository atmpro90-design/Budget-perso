/* =====================================================
   BUDGET PERSONNEL — app.js
   Zéro dépendance hors Chart.js (CDN)
   Toutes les données stockées dans localStorage
   ===================================================== */

'use strict';

// ─── CONSTANTES ───────────────────────────────────────
const STORAGE_KEY = 'budgetApp';

const CATEGORIES = [
  { key: 'Logement',       icon: '🏠' },
  { key: 'Alimentation',   icon: '🛒' },
  { key: 'Transport',      icon: '🚗' },
  { key: 'Santé',          icon: '💊' },
  { key: 'Loisirs',        icon: '🎮' },
  { key: 'Abonnements',    icon: '📱' },
  { key: 'Épargne placée', icon: '🏦' },
  { key: 'Divers',         icon: '📦' },
];

const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
];

// ─── ÉTAT GLOBAL ──────────────────────────────────────
let state = {
  currentMonthKey: getTodayKey(),   // mois affiché dans l'onglet "Mois"
  dashboardChart: null,
  editingVarId: null,               // null = création, sinon id à modifier
};

// ─── LOCALSTORAGE ─────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    return JSON.parse(raw);
  } catch {
    return defaultData();
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    showToast('Erreur de sauvegarde — stockage plein ?', 'error');
  }
}

function defaultData() {
  return {
    settings: {
      annualSavingsGoal: 0,
      currency: '€',
    },
    months: {},
  };
}

// ─── UTILITAIRES DATE ──────────────────────────────────
function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getYearFromKey(key) { return parseInt(key.split('-')[0], 10); }
function getMonthFromKey(key) { return parseInt(key.split('-')[1], 10) - 1; } // 0-based

function formatMonthKey(key) {
  const m = getMonthFromKey(key);
  const y = getYearFromKey(key);
  return `${MONTH_NAMES[m]} ${y}`;
}

function buildKey(year, month) {
  // month = 0-based JS month
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function prevMonthKey(key) {
  let y = getYearFromKey(key);
  let m = getMonthFromKey(key); // 0-based
  if (m === 0) { y--; m = 11; } else { m--; }
  return buildKey(y, m);
}

function nextMonthKey(key) {
  let y = getYearFromKey(key);
  let m = getMonthFromKey(key); // 0-based
  if (m === 11) { y++; m = 0; } else { m++; }
  return buildKey(y, m);
}

// ─── STRUCTURE PAR DÉFAUT D'UN MOIS ───────────────────
function defaultMonthData() {
  const expenses = {};
  CATEGORIES.forEach(c => {
    expenses[c.key] = { planned: 0, actual: 0 };
  });
  return {
    revenues: {
      fixedSalary: 0,
      variables: [],
    },
    expenses,
  };
}

function ensureMonth(data, key) {
  if (!data.months[key]) {
    data.months[key] = defaultMonthData();
  }
  // S'assurer que toutes les catégories existent (robustesse)
  CATEGORIES.forEach(c => {
    if (!data.months[key].expenses[c.key]) {
      data.months[key].expenses[c.key] = { planned: 0, actual: 0 };
    }
  });
  return data.months[key];
}

// ─── CALCULS ───────────────────────────────────────────
function calcTotalRevenues(monthData) {
  const vars = (monthData.revenues.variables || [])
    .reduce((s, v) => s + (parseFloat(v.amount) || 0), 0);
  return (parseFloat(monthData.revenues.fixedSalary) || 0) + vars;
}

function calcTotalPlanned(monthData) {
  return CATEGORIES.reduce((s, c) => {
    return s + (parseFloat(monthData.expenses[c.key]?.planned) || 0);
  }, 0);
}

function calcTotalActual(monthData) {
  return CATEGORIES.reduce((s, c) => {
    return s + (parseFloat(monthData.expenses[c.key]?.actual) || 0);
  }, 0);
}

function calcSavingsActual(monthData) {
  return parseFloat(monthData.expenses['Épargne placée']?.actual) || 0;
}

function fmt(n, currency = '€') {
  return `${formatNum(n)} ${currency}`;
}

function formatNum(n) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

// ─── TOAST ─────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, 3000);
}

// ─── NAVIGATION PAR ONGLETS ────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  // Désactiver tous
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

  // Activer la cible
  document.querySelector(`.nav-btn[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(tabId).classList.add('active');

  // Rendre le contenu correspondant
  const year = getYearFromKey(state.currentMonthKey);
  if (tabId === 'tab-dashboard') renderDashboard();
  if (tabId === 'tab-month')     renderMonth();
  if (tabId === 'tab-history')   renderHistory(year);
  if (tabId === 'tab-savings')   renderSavings(year);
}

// ═══════════════════════════════════════════════════════
// TAB 1 — TABLEAU DE BORD
// ═══════════════════════════════════════════════════════
function renderDashboard() {
  const data = loadData();
  const year = getYearFromKey(state.currentMonthKey);
  const cur  = data.settings.currency || '€';

  document.getElementById('dashboardYear').textContent = year;

  // Agréger les 12 mois de l'année
  let totalRev = 0, totalExp = 0, totalSav = 0;
  const labels   = [];
  const planned  = [];
  const actual   = [];

  for (let m = 0; m < 12; m++) {
    const key = buildKey(year, m);
    const md  = data.months[key];
    labels.push(MONTH_NAMES[m].substring(0, 3));

    if (!md) {
      planned.push(0);
      actual.push(0);
      continue;
    }

    const rev = calcTotalRevenues(md);
    const exp = calcTotalActual(md);
    const pln = calcTotalPlanned(md);
    const sav = calcSavingsActual(md);

    totalRev += rev;
    totalExp += exp;
    totalSav += sav;

    planned.push(pln);
    actual.push(exp);
  }

  const balance     = totalRev - totalExp;
  const savingsRate = totalRev > 0 ? (totalSav / totalRev) * 100 : 0;

  // KPI
  const elRev  = document.getElementById('kpiRevenues');
  const elExp  = document.getElementById('kpiExpenses');
  const elBal  = document.getElementById('kpiBalance');
  const elRate = document.getElementById('kpiSavingsRate');

  elRev.textContent  = fmt(totalRev, cur);
  elExp.textContent  = fmt(totalExp, cur);
  elBal.textContent  = fmt(balance, cur);
  elRate.textContent = `${formatNum(savingsRate)} %`;

  elBal.className  = `kpi-value ${balance >= 0 ? 'positive' : 'negative'}`;
  elRate.className = `kpi-value ${savingsRate >= 10 ? 'positive' : 'neutral'}`;

  // Chart
  const ctx = document.getElementById('chartDashboard').getContext('2d');
  if (state.dashboardChart) state.dashboardChart.destroy();

  state.dashboardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Prévisionnel',
          data: planned,
          backgroundColor: 'rgba(44,82,130,.25)',
          borderColor: 'rgba(44,82,130,.8)',
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: 'Réel',
          data: actual,
          backgroundColor: 'rgba(34,160,107,.3)',
          borderColor: 'rgba(34,160,107,.9)',
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { font: { size: 11 }, color: '#1A2B4A', boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatNum(ctx.parsed.y)} ${cur}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#6B7A99' },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(222,229,239,.6)' },
          ticks: {
            font: { size: 10 },
            color: '#6B7A99',
            callback: v => formatNum(v),
          },
        },
      },
    },
  });

  // Badge header
  document.getElementById('currentMonthLabel').textContent =
    formatMonthKey(getTodayKey());
}

// ═══════════════════════════════════════════════════════
// TAB 2 — MOIS EN COURS
// ═══════════════════════════════════════════════════════
function renderMonth() {
  const data = loadData();
  ensureMonth(data, state.currentMonthKey);
  const md  = data.months[state.currentMonthKey];
  const cur = data.settings.currency || '€';

  // Titre navigation
  document.getElementById('monthNavTitle').textContent =
    formatMonthKey(state.currentMonthKey);

  // Salaire
  document.getElementById('inputSalary').value =
    md.revenues.fixedSalary || '';

  // Revenus variables
  renderVariableList(md.revenues.variables, cur);

  // Lignes de dépenses
  renderExpenseRows(md, cur);

  // Totaux
  updateMonthTotals(md, cur);
}

function renderVariableList(variables, cur) {
  const container = document.getElementById('variableRevenuesList');
  container.innerHTML = '';

  if (!variables || variables.length === 0) {
    container.innerHTML = '<p style="font-size:.82rem;color:var(--gray-text);padding:6px 0;">Aucun revenu variable ce mois.</p>';
    return;
  }

  variables.forEach(v => {
    const div = document.createElement('div');
    div.className = 'variable-item';
    div.innerHTML = `
      <div class="variable-item-info">
        <span class="variable-item-label">${escHtml(v.label)}</span>
        <span class="variable-item-amount">${fmt(v.amount, cur)}</span>
      </div>
      <button class="btn-delete" data-id="${v.id}" title="Supprimer">✕</button>
    `;
    div.querySelector('.btn-delete').addEventListener('click', () => {
      deleteVariable(v.id);
    });
    container.appendChild(div);
  });
}

function renderExpenseRows(md, cur) {
  const container = document.getElementById('expenseRows');
  container.innerHTML = '';

  CATEGORIES.forEach(cat => {
    const exp = md.expenses[cat.key] || { planned: 0, actual: 0 };
    const planned = parseFloat(exp.planned) || 0;
    const actual  = parseFloat(exp.actual)  || 0;
    const ecart   = planned - actual;

    const row = document.createElement('div');
    row.className = 'expense-row';

    // Badge écart
    let ecartClass = 'ecart-neutral', ecartTxt = '—';
    if (planned > 0 || actual > 0) {
      ecartClass = ecart >= 0 ? 'ecart-ok' : 'ecart-bad';
      ecartTxt   = (ecart >= 0 ? '+' : '') + formatNum(ecart);
    }

    row.innerHTML = `
      <div class="expense-cat-name">
        <span class="expense-cat-icon">${cat.icon}</span>
        <span>${cat.key}</span>
      </div>
      <input
        type="number" min="0" step="0.01"
        class="input-amount"
        data-cat="${cat.key}" data-field="planned"
        value="${planned || ''}" placeholder="0"
      />
      <input
        type="number" min="0" step="0.01"
        class="input-amount"
        data-cat="${cat.key}" data-field="actual"
        value="${actual || ''}" placeholder="0"
      />
      <span class="ecart-badge ${ecartClass}" data-cat="${cat.key}-ecart">${ecartTxt}</span>
    `;

    // Mise à jour en temps réel à la saisie
    row.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => onExpenseInput(input, cur));
    });

    container.appendChild(row);
  });
}

function onExpenseInput(input, cur) {
  const data = loadData();
  ensureMonth(data, state.currentMonthKey);
  const md  = data.months[state.currentMonthKey];
  const cat   = input.dataset.cat;
  const field = input.dataset.field;
  const val   = parseFloat(input.value) || 0;

  md.expenses[cat][field] = val;

  // Recalcul écart en live
  const e       = md.expenses[cat];
  const planned = parseFloat(e.planned) || 0;
  const actual  = parseFloat(e.actual)  || 0;
  const ecart   = planned - actual;
  const badge   = document.querySelector(`[data-cat="${cat}-ecart"]`);
  if (badge) {
    if (planned > 0 || actual > 0) {
      badge.textContent  = (ecart >= 0 ? '+' : '') + formatNum(ecart);
      badge.className    = `ecart-badge ${ecart >= 0 ? 'ecart-ok' : 'ecart-bad'}`;
    } else {
      badge.textContent = '—';
      badge.className   = 'ecart-badge ecart-neutral';
    }
  }

  updateMonthTotals(md, cur);
}

function updateMonthTotals(md, cur) {
  // Lire les valeurs actuelles des inputs (pas encore sauvegardés)
  const salaryInput = document.getElementById('inputSalary');
  const fixedSalary = parseFloat(salaryInput?.value) || 0;

  // Variables depuis le DOM du state courant
  const data = loadData();
  const liveVars = data.months[state.currentMonthKey]?.revenues?.variables || [];
  const varsTotal = liveVars.reduce((s, v) => s + (parseFloat(v.amount) || 0), 0);

  // Totaux dépenses depuis les inputs
  let totalPlanned = 0, totalActual = 0;
  document.querySelectorAll('#expenseRows .expense-row').forEach(row => {
    const pInput = row.querySelector('[data-field="planned"]');
    const aInput = row.querySelector('[data-field="actual"]');
    totalPlanned += parseFloat(pInput?.value) || 0;
    totalActual  += parseFloat(aInput?.value) || 0;
  });

  const totalRevenues = fixedSalary + varsTotal;
  const balance       = totalRevenues - totalActual;

  document.getElementById('totalRevenues').textContent = fmt(totalRevenues, cur);
  document.getElementById('totalExpenses').textContent = fmt(totalActual, cur);

  const balEl = document.getElementById('monthBalance');
  balEl.textContent = fmt(balance, cur);
  balEl.className   = `total-value ${balance >= 0 ? 'positive' : 'negative'}`;
}

function saveMonth() {
  const data = loadData();
  ensureMonth(data, state.currentMonthKey);
  const md = data.months[state.currentMonthKey];

  // Salaire
  md.revenues.fixedSalary = parseFloat(document.getElementById('inputSalary').value) || 0;

  // Dépenses depuis les inputs
  document.querySelectorAll('#expenseRows .expense-row').forEach(row => {
    const pInput = row.querySelector('[data-field="planned"]');
    const aInput = row.querySelector('[data-field="actual"]');
    if (pInput && aInput) {
      const cat = pInput.dataset.cat;
      md.expenses[cat].planned = parseFloat(pInput.value) || 0;
      md.expenses[cat].actual  = parseFloat(aInput.value) || 0;
    }
  });

  saveData(data);
  showToast(`✓ ${formatMonthKey(state.currentMonthKey)} sauvegardé`, 'success');
}

// ─── Revenus variables ─────────────────────────────────
function openVariableModal() {
  state.editingVarId = null;
  document.getElementById('modalVarLabel').value  = '';
  document.getElementById('modalVarAmount').value = '';
  document.getElementById('modalVariable').classList.remove('hidden');
  document.getElementById('modalVarLabel').focus();
}

function closeVariableModal() {
  document.getElementById('modalVariable').classList.add('hidden');
}

function confirmVariable() {
  const label  = document.getElementById('modalVarLabel').value.trim();
  const amount = parseFloat(document.getElementById('modalVarAmount').value) || 0;

  if (!label) {
    showToast('Veuillez saisir un libellé', 'error');
    document.getElementById('modalVarLabel').focus();
    return;
  }
  if (amount <= 0) {
    showToast('Veuillez saisir un montant > 0', 'error');
    document.getElementById('modalVarAmount').focus();
    return;
  }

  const data = loadData();
  ensureMonth(data, state.currentMonthKey);
  const md = data.months[state.currentMonthKey];

  const newVar = {
    id:     `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label,
    amount,
  };
  md.revenues.variables.push(newVar);

  saveData(data);
  closeVariableModal();

  const cur = data.settings.currency || '€';
  renderVariableList(md.revenues.variables, cur);
  updateMonthTotals(md, cur);
  showToast(`✓ Revenu "${label}" ajouté`, 'success');
}

function deleteVariable(id) {
  const data = loadData();
  ensureMonth(data, state.currentMonthKey);
  const md = data.months[state.currentMonthKey];

  md.revenues.variables = md.revenues.variables.filter(v => v.id !== id);

  saveData(data);

  const cur = data.settings.currency || '€';
  renderVariableList(md.revenues.variables, cur);
  updateMonthTotals(md, cur);
  showToast('Revenu supprimé', 'success');
}

// ═══════════════════════════════════════════════════════
// TAB 3 — HISTORIQUE ANNUEL
// ═══════════════════════════════════════════════════════
function renderHistory(year) {
  const data = loadData();
  const cur  = data.settings.currency || '€';

  // Peupler le sélecteur d'années
  populateYearFilter('filterYear', year, data);

  const body = document.getElementById('historyTableBody');
  const foot = document.getElementById('historyTableFoot');
  body.innerHTML = '';
  foot.innerHTML = '';

  let totRev = 0, totExp = 0, totBal = 0, totSav = 0;

  for (let m = 0; m < 12; m++) {
    const key = buildKey(year, m);
    const md  = data.months[key];

    const rev = md ? calcTotalRevenues(md) : 0;
    const exp = md ? calcTotalActual(md)   : 0;
    const bal = rev - exp;
    const sav = md ? calcSavingsActual(md) : 0;

    totRev += rev;
    totExp += exp;
    totBal += bal;
    totSav += sav;

    const isEmpty = !md;
    const tr = document.createElement('tr');
    if (isEmpty) tr.style.opacity = '.45';

    tr.innerHTML = `
      <td>${MONTH_NAMES[m]}</td>
      <td class="${rev > 0 ? 'positive' : ''}">${fmt(rev, cur)}</td>
      <td class="${exp > 0 ? 'negative' : ''}">${fmt(exp, cur)}</td>
      <td class="${bal >= 0 ? 'positive' : 'negative'}">${fmt(bal, cur)}</td>
      <td class="${sav > 0 ? 'positive' : ''}">${fmt(sav, cur)}</td>
    `;
    body.appendChild(tr);
  }

  // Pied de tableau — totaux
  foot.innerHTML = `
    <tr>
      <td><strong>Total</strong></td>
      <td class="${totRev > 0 ? 'positive' : ''}">${fmt(totRev, cur)}</td>
      <td class="${totExp > 0 ? 'negative' : ''}">${fmt(totExp, cur)}</td>
      <td class="${totBal >= 0 ? 'positive' : 'negative'}">${fmt(totBal, cur)}</td>
      <td class="${totSav > 0 ? 'positive' : ''}">${fmt(totSav, cur)}</td>
    </tr>
  `;
}

// ═══════════════════════════════════════════════════════
// TAB 4 — ÉPARGNE
// ═══════════════════════════════════════════════════════
function renderSavings(year) {
  const data = loadData();
  const cur  = data.settings.currency || '€';
  const goal = parseFloat(data.settings.annualSavingsGoal) || 0;

  document.getElementById('savingsYear').textContent = year;
  document.getElementById('inputSavingsGoal').value  = goal || '';
  document.getElementById('savingsGoalDisplay').textContent = fmt(goal, cur);
  document.getElementById('progressGoalLabel').textContent  = `Objectif : ${fmt(goal, cur)}`;

  // Cumuler l'épargne placée mois par mois
  let cumulated    = 0;
  let monthsWithData = 0;
  const tableBody  = document.getElementById('savingsTableBody');
  tableBody.innerHTML = '';

  for (let m = 0; m < 12; m++) {
    const key = buildKey(year, m);
    const md  = data.months[key];
    const sav = md ? calcSavingsActual(md) : 0;
    if (sav > 0) monthsWithData++;
    cumulated += sav;

    const tr = document.createElement('tr');
    if (!md) tr.style.opacity = '.4';
    tr.innerHTML = `
      <td>${MONTH_NAMES[m]}</td>
      <td class="${sav > 0 ? 'positive' : ''}">${fmt(sav, cur)}</td>
      <td class="${cumulated > 0 ? 'positive' : ''}">${fmt(cumulated, cur)}</td>
    `;
    tableBody.appendChild(tr);
  }

  // Projection : si on a des données, extrapoler sur 12 mois
  let projection = 0;
  if (monthsWithData > 0) {
    projection = (cumulated / monthsWithData) * 12;
  }

  const remaining = Math.max(0, goal - cumulated);
  const pct       = goal > 0 ? Math.min((cumulated / goal) * 100, 100) : 0;

  document.getElementById('savingsCumulated').textContent  = fmt(cumulated, cur);
  document.getElementById('savingsProjection').textContent = fmt(projection, cur);
  document.getElementById('savingsRemaining').textContent  = fmt(remaining, cur);
  document.getElementById('progressPercent').textContent   = `${formatNum(pct)} %`;

  const fill = document.getElementById('progressBarFill');
  fill.style.width = `${pct}%`;
  fill.classList.toggle('over-goal', cumulated >= goal && goal > 0);

  // Couleur
  const projEl = document.getElementById('savingsProjection');
  projEl.className = `kpi-value ${projection >= goal ? 'positive' : 'neutral'}`;
  const remEl = document.getElementById('savingsRemaining');
  remEl.className  = `kpi-value ${remaining <= 0 ? 'positive' : 'negative'}`;
}

function saveGoal() {
  const data = loadData();
  const val  = parseFloat(document.getElementById('inputSavingsGoal').value) || 0;
  data.settings.annualSavingsGoal = val;
  saveData(data);
  const year = getYearFromKey(state.currentMonthKey);
  renderSavings(year);
  showToast(`✓ Objectif enregistré : ${fmt(val, data.settings.currency || '€')}`, 'success');
}

// ─── Sélecteur d'année ─────────────────────────────────
function populateYearFilter(selectId, selectedYear, data) {
  const sel = document.getElementById(selectId);
  const currentYear = new Date().getFullYear();

  // Collecter toutes les années présentes dans les données
  const years = new Set([currentYear]);
  Object.keys(data.months).forEach(k => years.add(getYearFromKey(k)));

  // Trier décroissant
  const sorted = [...years].sort((a, b) => b - a);

  // Ne regénérer que si nécessaire
  const current = [...sel.options].map(o => parseInt(o.value, 10));
  const same    = sorted.length === current.length && sorted.every((y, i) => y === current[i]);
  if (same && sel.value == selectedYear) return;

  sel.innerHTML = '';
  sorted.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === selectedYear) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ─── Export JSON ───────────────────────────────────────
function exportJSON() {
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `budget_${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✓ Export JSON téléchargé', 'success');
}

// ─── Sécurité : échapper le HTML ──────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════════════════
function init() {
  // Navigation
  initNav();

  // Month nav (flèches)
  document.getElementById('btnPrevMonth').addEventListener('click', () => {
    state.currentMonthKey = prevMonthKey(state.currentMonthKey);
    renderMonth();
  });
  document.getElementById('btnNextMonth').addEventListener('click', () => {
    state.currentMonthKey = nextMonthKey(state.currentMonthKey);
    renderMonth();
  });

  // Salaire — mise à jour totaux en live
  document.getElementById('inputSalary').addEventListener('input', () => {
    const data = loadData();
    const cur  = data.settings.currency || '€';
    const md   = data.months[state.currentMonthKey] || defaultMonthData();
    updateMonthTotals(md, cur);
  });

  // Sauvegarde mois
  document.getElementById('btnSaveMonth').addEventListener('click', saveMonth);

  // Export
  document.getElementById('btnExport').addEventListener('click', exportJSON);

  // Revenus variables — modal
  document.getElementById('btnAddVariable').addEventListener('click', openVariableModal);
  document.getElementById('modalVarCancel').addEventListener('click', closeVariableModal);
  document.getElementById('modalVarConfirm').addEventListener('click', confirmVariable);
  document.getElementById('modalVariable').addEventListener('click', e => {
    if (e.target === document.getElementById('modalVariable')) closeVariableModal();
  });

  // Entrée clavier dans la modal
  document.getElementById('modalVarAmount').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmVariable();
  });

  // Objectif épargne
  document.getElementById('btnSaveGoal').addEventListener('click', saveGoal);

  // Filtre historique
  document.getElementById('filterYear').addEventListener('change', e => {
    renderHistory(parseInt(e.target.value, 10));
  });

  // Rendu initial : onglet dashboard
  renderDashboard();
  // Pré-charger le mois pour le badge header
  document.getElementById('currentMonthLabel').textContent =
    formatMonthKey(getTodayKey());
}

// Lancer après le chargement du DOM
document.addEventListener('DOMContentLoaded', init);
