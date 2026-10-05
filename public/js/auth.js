let currentUser = null;
let selectedDate = null;
let serviciosDisponibles = [];
let serviciosSeleccionados = new Set();
let ocupadasDia = [];   // [{inicio_min, fin_min}] del día elegido
let ocupadasCargadas = false;
let bookingView = null;      // 'login' | 'form' | 'done' (para re-dibujar al cambiar idioma)
let refreshCalendar = null;
let resenasCache = null;

const BACKEND_URL = 'https://bsc-beauty-skin-care-production.up.railway.app';

const loginModal = document.getElementById('loginModal');
const loginOverlay = document.getElementById('loginOverlay');
const loginClose = document.getElementById('loginClose');
const navAuth = document.getElementById('navAuth');
const userPanel = document.getElementById('userPanel');
const panelClose = document.getElementById('panelClose');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authTabs = document.querySelectorAll('.auth-tab');
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');
const logoutBtn = document.getElementById('logoutBtn');

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    initEventListeners();
    initCalendar();
    initNavbar();
    cargarServicios();
    cargarResenas();
    iniciarTiempoReal();
    const formResena = document.getElementById('formResena');
    if (formResena) formResena.addEventListener('submit', enviarResena);
});

async function cargarServicios() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/citas/servicios`);
        serviciosDisponibles = await response.json();
    } catch (error) {
        console.error('Error cargando servicios:', error);
    }
}

async function checkAuthStatus() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await response.json();
        if (data.authenticated && data.user) {
            currentUser = data.user;
        } else {
            currentUser = null;
        }
        updateAuthUI();
    } catch (error) {
        currentUser = null;
        updateAuthUI();
    }
}

function getToken() { return localStorage.getItem('beautyToken'); }
function setToken(token) { localStorage.setItem('beautyToken', token); }
function removeToken() { localStorage.removeItem('beautyToken'); }

function updateAuthUI() {
    if (navAuth) {
        if (currentUser) {
            const initials = currentUser.nombre.charAt(0).toUpperCase();
            navAuth.innerHTML = `
                <button class="user-menu-btn" id="userMenuBtn">
                    <div class="user-avatar-small">${initials}</div>
                    <span class="user-name-display">${currentUser.nombre}</span>
                </button>
            `;
            document.getElementById('userMenuBtn').addEventListener('click', toggleUserPanel);
        } else {
            navAuth.innerHTML = `
                <button class="auth-btn auth-btn-login" onclick="openLoginModal()" aria-label="${t('Iniciar Sesión')}"><span class="auth-btn-icon">👤</span><span class="auth-btn-text">${t('Iniciar Sesión')}</span></button>
                <button class="auth-btn auth-btn-register" onclick="openLoginModal('register')">${t('Registrarse')}</button>
            `;
        }
    }
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    if (userName) userName.textContent = currentUser ? `${currentUser.nombre} ${currentUser.apellido || ''}` : t('Usuario');
    if (userEmail) userEmail.textContent = currentUser ? currentUser.email : 'email@example.com';
    actualizarMenuMovil();
    actualizarVistasPorSesion();
}

// En celular, el menú de hamburguesa también incluye las opciones de cuenta
function actualizarMenuMovil() {
    if (!navMenu) return;
    navMenu.querySelectorAll('.nav-menu-auth').forEach(li => li.remove());
    const items = currentUser
        ? [['citas', t('Mis Citas')], ['logout', t('Cerrar Sesión')]]
        : [['login', t('Iniciar Sesión')], ['register', t('Registrarse')]];
    items.forEach(([accion, texto]) => {
        const li = document.createElement('li');
        li.className = 'nav-menu-auth';
        li.innerHTML = `<a href="#" class="nav-link" onclick="menuMovilAccion('${accion}', event)"></a>`;
        li.firstChild.textContent = texto;
        navMenu.appendChild(li);
    });
}

function menuMovilAccion(accion, e) {
    e.preventDefault();
    if (navMenu) navMenu.classList.remove('active');
    if (accion === 'login' || accion === 'register') openLoginModal(accion);
    else if (accion === 'citas') mostrarMisCitas(e);
    else if (accion === 'logout') handleLogout(e);
}

function initEventListeners() {
    if (loginClose) loginClose.addEventListener('click', closeLoginModal);
    if (loginOverlay) loginOverlay.addEventListener('click', closeLoginModal);
    authTabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    if (panelClose) panelClose.addEventListener('click', closeUserPanel);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    const dashboardLink = document.getElementById('dashboardLink');
    if (dashboardLink) dashboardLink.addEventListener('click', mostrarMisCitas);
    const citasClose = document.getElementById('citasClose');
    if (citasClose) citasClose.addEventListener('click', () => {
        document.getElementById('citasModal').classList.remove('active');
        document.body.style.overflow = '';
    });
    const citasOverlay = document.getElementById('citasOverlay');
    if (citasOverlay) citasOverlay.addEventListener('click', () => {
        document.getElementById('citasModal').classList.remove('active');
        document.body.style.overflow = '';
    });
    if (navToggle) navToggle.addEventListener('click', () => navMenu.classList.toggle('active'));
}

// Al iniciar / cerrar sesión, las vistas abiertas se actualizan solas (sin recargar)
function actualizarVistasPorSesion() {
    if (selectedDate) {
        if (currentUser && bookingView === 'login') mostrarFormularioCita(selectedDate);
        else if (!currentUser && bookingView === 'form') mostrarPromptLogin(selectedDate);
    }
    const modalResena = document.getElementById('resenaModal');
    if (modalResena && modalResena.style.display === 'flex') abrirModalResena();
}

function openLoginModal(tab) {
    if (loginModal) { loginModal.classList.add('active'); document.body.style.overflow = 'hidden'; }
    if (tab === 'login' || tab === 'register') switchTab(tab);
}
function closeLoginModal() {
    if (loginModal) { loginModal.classList.remove('active'); document.body.style.overflow = ''; clearErrors(); clearForms(); }
}

function switchTab(tab) {
    authTabs.forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    if (tab === 'login') { loginForm.classList.remove('hidden'); registerForm.classList.add('hidden'); }
    else { loginForm.classList.add('hidden'); registerForm.classList.remove('hidden'); }
    clearErrors();
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    clearErrors();
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
            setToken(data.token);
            currentUser = data.user;
            closeLoginModal();
            updateAuthUI();
            showNotification(t('¡Bienvenido de nuevo, {0}!', currentUser.nombre), 'success');
        } else {
            errorDiv.textContent = t(data.error || 'Error al iniciar sesión');
            errorDiv.classList.add('show');
        }
    } catch (error) {
        errorDiv.textContent = t('Error de conexión. Por favor, inténtalo de nuevo.');
        errorDiv.classList.add('show');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const nombre = document.getElementById('regName').value;
    const apellido = document.getElementById('regLastname').value;
    const telefono = document.getElementById('regPhone').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const errorDiv = document.getElementById('registerError');
    clearErrors();
    if (password !== confirmPassword) { errorDiv.textContent = t('Las contraseñas no coinciden'); errorDiv.classList.add('show'); return; }
    if (password.length < 6) { errorDiv.textContent = t('La contraseña debe tener al menos 6 caracteres'); errorDiv.classList.add('show'); return; }
    try {
        const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, apellido, telefono, email, password, confirmPassword })
        });
        const data = await response.json();
        if (response.ok) {
            setToken(data.token);
            currentUser = data.user;
            closeLoginModal();
            updateAuthUI();
            showNotification(t('¡Cuenta creada exitosamente! Bienvenido a BSC.'), 'success');
        } else {
            errorDiv.textContent = t(data.error || 'Error al registrar usuario');
            errorDiv.classList.add('show');
        }
    } catch (error) {
        errorDiv.textContent = t('Error de conexión. Por favor, inténtalo de nuevo.');
        errorDiv.classList.add('show');
    }
}

async function handleLogout(e) {
    e.preventDefault();
    try { await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST' }); } catch (e) {}
    removeToken();
    currentUser = null;
    closeUserPanel();
    updateAuthUI();
    showNotification(t('Sesión cerrada correctamente'), 'info');
}

// ── AGENDAR CITA ──────────────────────────────────────────
async function agendarCita(e) {
    e.preventDefault();
    const ids_servicio = Array.from(serviciosSeleccionados);
    const hora = document.getElementById('selectHora').value;
    const notas = document.getElementById('notasCita').value;
    const fecha = fechaISO(selectedDate);
    const fecha_cita = `${fecha}T${hora}:00`;
    const errorDiv = document.getElementById('errorCita');
    errorDiv.style.display = 'none';
    if (ids_servicio.length === 0) {
        errorDiv.textContent = t('Selecciona al menos un servicio');
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/citas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ ids_servicio, fecha_cita, notas })
        });
        const data = await response.json();
        if (response.ok) {
            showNotification(t('¡Cita agendada exitosamente! Te esperamos.'), 'success');
            bookingView = 'done';
            document.getElementById('selectedDate').innerHTML = `
                <div style="text-align:center; padding: 20px;">
                    <div style="font-size: 48px;">✅</div>
                    <h4 style="color: #10b981; margin: 10px 0;">${t('¡Cita Confirmada!')}</h4>
                    <p>${t('Tu cita fue agendada para el')} <strong>${fecha_cita.replace('T', ' ' + t('a las') + ' ')}</strong></p>
                    <button onclick="reiniciarReserva()" class="btn btn-primary" style="margin-top:15px;">${t('Agendar otra cita')}</button>
                </div>
            `;
        } else {
            errorDiv.textContent = t(data.error || 'Error al agendar la cita');
            errorDiv.style.display = 'block';
            if (selectedDate) cargarOcupadas(selectedDate);   // el horario pudo ocuparse: refrescar
        }
    } catch (error) {
        errorDiv.textContent = t('Error de conexión. Intenta de nuevo.');
        errorDiv.style.display = 'block';
    }
}

function mostrarFormularioCita(date) {
    bookingView = 'form';
    serviciosSeleccionados = new Set();
    ocupadasDia = [];
    ocupadasCargadas = false;
    const dateDisplay = document.getElementById('selectedDate');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const fechaFormateada = date.toLocaleDateString(getLocale(), options);

    // Agrupar servicios por categoría
    const categorias = {};
    serviciosDisponibles.forEach(s => {
        const cat = s.categoria || t('General');
        if (!categorias[cat]) categorias[cat] = [];
        categorias[cat].push(s);
    });

    const listaCategorias = Object.entries(categorias).map(([cat, servicios]) => `
        <div style="margin-bottom:15px;">
            <p style="font-weight:600; color:#D8B4A0; font-family:'Playfair Display',serif; margin-bottom:8px; font-size:15px;">${t(cat)}</p>
            ${servicios.map(s => `
                <div onclick="seleccionarServicio(${s.id_servicio}, this)"
                     data-id="${s.id_servicio}"
                     style="display:flex; justify-content:space-between; align-items:center;
                            padding:10px 12px; margin-bottom:6px; border-radius:8px;
                            border:1px solid #eee; cursor:pointer; transition:all 0.2s;
                            background:white;">
                    <span style="font-size:14px;">${t(s.nombre)}${s.descripcion ? '<br><small style=color:#999>' + t(s.descripcion) + '</small>' : ''}</span>
                    <span style="font-weight:600; color:#D8B4A0; font-size:14px; white-space:nowrap; margin-left:10px;">
                        $${s.precio_max ? s.precio + ' - $' + s.precio_max : s.precio}
                    </span>
                </div>
            `).join('')}
        </div>
    `).join('');

    dateDisplay.innerHTML = `
        <p style="margin-bottom:12px;"><strong>${t('Fecha:')}</strong> ${fechaFormateada}</p>
        <form id="formCita">
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:10px; font-weight:500;">${t('Selecciona uno o más servicios:')}</label>
                <div style="max-height:280px; overflow-y:auto; border:1px solid #eee; border-radius:8px; padding:10px; background:#faf9f7;">
                    ${listaCategorias}
                </div>
                <p id="resumenServicios" style="margin-top:8px; font-size:13px; color:#888;"></p>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block; margin-bottom:5px; font-weight:500;">${t('Hora')}</label>
                <select id="selectHora" required style="width:100%; padding:8px; border-radius:6px; border:1px solid #ddd;">
                </select>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block; margin-bottom:5px; font-weight:500;">${t('Notas (opcional)')}</label>
                <textarea id="notasCita" placeholder="${t('Ej: tengo piel sensible...')}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ddd; resize:vertical; min-height:60px;"></textarea>
            </div>
            <div id="errorCita" style="display:none; color:red; margin-bottom:10px; font-size:14px;"></div>
            <button type="submit" class="btn btn-primary" style="width:100%;">${t('Confirmar Cita')}</button>
        </form>
    `;

    document.getElementById('formCita').addEventListener('submit', agendarCita);
    actualizarHoras();
    cargarOcupadas(date);
}

const HORAS_CITA = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30',
                    '13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];

function fechaISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function aMinutos(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}
function duracionSeleccionada() {
    let total = 0;
    serviciosSeleccionados.forEach(id => {
        const s = serviciosDisponibles.find(x => String(x.id_servicio) === String(id));
        total += (s && s.duracion_minutos) || 60;
    });
    return total;
}

// Selección múltiple: clic para marcar / desmarcar
function seleccionarServicio(id, el) {
    if (serviciosSeleccionados.has(id)) {
        serviciosSeleccionados.delete(id);
        el.style.background = 'white';
        el.style.borderColor = '#eee';
    } else {
        serviciosSeleccionados.add(id);
        el.style.background = '#fff5f0';
        el.style.borderColor = '#D8B4A0';
    }
    const n = serviciosSeleccionados.size;
    const resumen = document.getElementById('resumenServicios');
    if (resumen) resumen.textContent = n ? t('Servicios: {0} · Duración total: {1} min', n, duracionSeleccionada()) : '';
    actualizarHoras();
}

// Dibuja las horas; las ocupadas salen en gris, deshabilitadas y con "(ocupado)"
function actualizarHoras() {
    const sel = document.getElementById('selectHora');
    if (!sel) return;
    const duracion = duracionSeleccionada() || 30;
    const previa = sel.value;
    sel.innerHTML = HORAS_CITA.map(h => {
        const ini = aMinutos(h), fin = ini + duracion;
        const ocupado = ocupadasDia.some(o => ini < o.fin_min && fin > o.inicio_min);
        return ocupado
            ? `<option value="${h}" disabled style="color:#aaa; background:#eee;">${h} (${t('ocupado')})</option>`
            : `<option value="${h}">${h}</option>`;
    }).join('');
    const libres = Array.from(sel.options).filter(o => !o.disabled);
    sel.value = libres.some(o => o.value === previa) ? previa : (libres[0] ? libres[0].value : '');
    return !!previa && sel.value !== previa;   // true si la hora elegida dejó de estar libre
}

function reiniciarReserva() {
    if (selectedDate) mostrarFormularioCita(selectedDate);
}

// ── TIEMPO REAL ───────────────────────────────────────────
function refrescarOcupadas() {
    if (bookingView === 'form' && selectedDate) cargarOcupadas(selectedDate);
}

function iniciarTiempoReal() {
    // 1) El servidor avisa al instante cuando alguien agenda o cancela
    if (window.EventSource) {
        const eventos = new EventSource(`${BACKEND_URL}/api/citas/eventos`);
        eventos.addEventListener('citas', (ev) => {
            try {
                const { fecha } = JSON.parse(ev.data);
                if (bookingView === 'form' && selectedDate && fechaISO(selectedDate) === fecha) cargarOcupadas(selectedDate);
            } catch (e) {}
        });
        eventos.onopen = refrescarOcupadas;   // al reconectar, se sincroniza
    }
    // 2) Respaldo: revisa cada 20 s y al volver a la pestaña
    setInterval(() => { if (!document.hidden) refrescarOcupadas(); }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescarOcupadas(); });
    // 3) Si inicias o cierras sesión en otra pestaña, esta se actualiza sola
    window.addEventListener('storage', (e) => { if (e.key === 'beautyToken') checkAuthStatus(); });
}

async function cargarOcupadas(date) {
    try {
        const r = await fetch(`${BACKEND_URL}/api/citas/ocupadas?fecha=${fechaISO(date)}`);
        if (!r.ok) return;
        const data = await r.json();
        if (!selectedDate || fechaISO(selectedDate) !== fechaISO(date)) return;
        const eraActualizacion = ocupadasCargadas;
        ocupadasDia = data.map(o => ({ inicio_min: aMinutos(o.inicio), fin_min: aMinutos(o.fin) }));
        ocupadasCargadas = true;
        const cambio = actualizarHoras();
        if (cambio && eraActualizacion) showNotification(t('El horario que tenías seleccionado se acaba de ocupar. Elige otro.'), 'info');
    } catch (e) { /* si falla, se muestran todas las horas */ }
}
// ──────────────────────────────────────────────────────────

function toggleUserPanel() {
    if (userPanel) {
        userPanel.classList.toggle('active');
        const overlay = document.getElementById('userPanelOverlay');
        if (overlay) overlay.classList.toggle('active');
    }
}
function closeUserPanel() {
    if (userPanel) {
        userPanel.classList.remove('active');
        const overlay = document.getElementById('userPanelOverlay');
        if (overlay) overlay.classList.remove('active');
    }
}

// Mis Citas
async function mostrarMisCitas(e) {
    e.preventDefault();
    closeUserPanel();
    const modal = document.getElementById('citasModal');
    const listaCitas = document.getElementById('listaCitas');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    listaCitas.innerHTML = '<p style="text-align:center;">' + t('Cargando citas...') + '</p>';

    try {
        const response = await fetch(`${BACKEND_URL}/api/citas/mis-citas`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const citas = await response.json();

        if (citas.length === 0) {
            listaCitas.innerHTML = '<p style="text-align:center; color:#888;">' + t('No tienes citas agendadas aún.') + '</p>';
            return;
        }

        listaCitas.innerHTML = citas.map(c => {
            const fecha = new Date(c.fecha_cita).toLocaleString(getLocale(), {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const colorEstado = {pendiente: '#f59e0b', confirmada: '#10b981', completada: '#6366f1', cancelada: '#ef4444'};
            return `
                <div style="border:1px solid #eee; border-radius:8px; padding:15px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <strong>${t(c.servicio_nombre)}</strong>
                        <span style="background:${colorEstado[c.estado] || '#888'}; color:white; padding:3px 10px; border-radius:20px; font-size:12px;">${t(c.estado)}</span>
                    </div>
                    <p style="margin:4px 0; font-size:14px; color:#555;">📅 ${fecha}</p>
                    <p style="margin:4px 0; font-size:14px; color:#555;">⏱ ${c.duracion_minutos} ${t('min')}</p>
                    ${c.notas ? `<p style="margin:4px 0; font-size:14px; color:#555;">📝 ${c.notas}</p>` : ''}
                    ${c.estado === 'pendiente' ? `<button onclick="cancelarCita(${c.id_cita}, this)" style="margin-top:8px; padding:5px 12px; background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">${t('Cancelar cita')}</button>` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        listaCitas.innerHTML = '<p style="text-align:center; color:red;">' + t('Error al cargar las citas.') + '</p>';
    }
}

async function cancelarCita(id, btn) {
    btn.disabled = true;
    btn.textContent = t('Cancelando...');
    try {
        const response = await fetch(`${BACKEND_URL}/api/citas/${id}/cancelar`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.ok) {
            showNotification(t('Cita cancelada correctamente'), 'info');
            btn.closest('div[style]').querySelector('span[style*="background"]').textContent = t('cancelada');
            btn.remove();
        }
    } catch (error) {
        btn.disabled = false;
        btn.textContent = t('Cancelar cita');
    }
}

function clearErrors() {
    document.querySelectorAll('.auth-error').forEach(el => { el.classList.remove('show'); el.textContent = ''; });
    document.querySelectorAll('.auth-success').forEach(el => { el.classList.remove('show'); el.textContent = ''; });
}
function clearForms() {
    if (loginForm) loginForm.reset();
    if (registerForm) registerForm.reset();
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed; top: 100px; right: 20px; padding: 15px 25px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 3000; animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => { notification.style.animation = 'slideOut 0.3s ease'; setTimeout(() => notification.remove(), 300); }, 3000);
}

function initCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const currentMonthEl = document.getElementById('currentMonth');
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');
    if (!calendarGrid) return;

    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    function renderCalendar() {
        const headers = calendarGrid.querySelectorAll('.calendar-day-header');
        calendarGrid.innerHTML = '';
        headers.forEach(h => calendarGrid.appendChild(h));
        currentMonthEl.textContent = `${t(months[currentMonth])} ${currentYear}`;
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const today = new Date();
        for (let i = 0; i < firstDay; i++) {
            const e = document.createElement('div'); e.className = 'calendar-day disabled'; calendarGrid.appendChild(e);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = day;
            const dayDate = new Date(currentYear, currentMonth, day);
            if (dayDate.toDateString() === today.toDateString()) dayEl.classList.add('today');
            if (dayDate < today.setHours(0,0,0,0)) {
                dayEl.classList.add('disabled');
            } else {
                dayEl.addEventListener('click', () => selectDate(day, dayDate));
            }
            if (selectedDate && dayDate.toDateString() === selectedDate.toDateString()) dayEl.classList.add('selected');
            calendarGrid.appendChild(dayEl);
        }
    }

    function selectDate(day, date) {
        selectedDate = date;
        renderCalendar();
        if (currentUser) {
            mostrarFormularioCita(date);
        } else {
            mostrarPromptLogin(date);
        }
    }

    prevBtn.addEventListener('click', () => { currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; } renderCalendar(); });
    nextBtn.addEventListener('click', () => { currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(); });
    renderCalendar();
    refreshCalendar = renderCalendar;
}

function mostrarPromptLogin(date) {
    bookingView = 'login';
    const dateDisplay = document.getElementById('selectedDate');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateDisplay.innerHTML = `
        <p>${t('Fecha seleccionada:')}</p>
        <div class="date-display">${date.toLocaleDateString(getLocale(), options)}</div>
        <p style="margin-top: 15px; font-size: 14px;">${t('Por favor inicia sesión para agendar tu cita')}</p>
        <button onclick="openLoginModal()" class="btn btn-primary" style="margin-top: 10px;">${t('Iniciar Sesión')}</button>
    `;
}

function initNavbar() {
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        navbar.style.background = window.scrollY > 50 ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.95)';
        navbar.style.boxShadow = window.scrollY > 50 ? '0 4px 20px rgba(0,0,0,0.1)' : '0 4px 20px rgba(0,0,0,0.08)';
    });
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); navMenu.classList.remove('active'); }
        });
    });
}


// ── RESEÑAS ───────────────────────────────────────────────
async function cargarResenas() {
    const lista = document.getElementById('listaResenas');
    if (!lista) return;
    try {
        const response = await fetch(`${BACKEND_URL}/api/resenas`);
        resenasCache = await response.json();
        renderResenas();
    } catch (error) {
        lista.innerHTML = '<p style="text-align:center; color:#888; grid-column:1/-1;">' + t('No se pudieron cargar las reseñas.') + '</p>';
    }
}

function renderResenas() {
    const lista = document.getElementById('listaResenas');
    const resenas = resenasCache;
    if (!lista || !resenas) return;
    {
        if (resenas.length === 0) {
            lista.innerHTML = '<p style="text-align:center; color:#888; grid-column:1/-1;">' + t('Sé la primera en dejar una reseña ⭐') + '</p>';
            return;
        }
        lista.innerHTML = resenas.map(r => {
            const estrellas = '★'.repeat(r.calificacion) + '☆'.repeat(5 - r.calificacion);
            const fecha = new Date(r.fecha_creacion).toLocaleDateString(getLocale(), { year: 'numeric', month: 'long', day: 'numeric' });
            return `
                <div style="background:white; border-radius:12px; padding:25px; box-shadow:0 2px 15px rgba(0,0,0,0.07);">
                    <div style="color:#f59e0b; font-size:20px; margin-bottom:10px;">${estrellas}</div>
                    <p style="color:#444; font-style:italic; margin-bottom:15px;">"${r.comentario}"</p>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:36px; height:36px; background:#D8B4A0; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">
                            ${r.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p style="font-weight:600; margin:0;">${r.nombre} ${r.apellido || ''}</p>
                            <p style="font-size:12px; color:#888; margin:0;">${fecha}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function abrirModalResena() {
    const modal = document.getElementById('resenaModal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (currentUser) {
        document.getElementById('formResena').style.display = 'block';
        document.getElementById('resenaLoginMsg').style.display = 'none';
        initStars();
    } else {
        document.getElementById('formResena').style.display = 'none';
        document.getElementById('resenaLoginMsg').style.display = 'block';
    }
}

function cerrarModalResena() {
    document.getElementById('resenaModal').style.display = 'none';
    document.body.style.overflow = '';
}

function initStars() {
    const stars = document.querySelectorAll('.star');
    stars.forEach(star => {
        star.addEventListener('mouseover', () => {
            const val = parseInt(star.dataset.val);
            stars.forEach(s => s.textContent = parseInt(s.dataset.val) <= val ? '★' : '☆');
        });
        star.addEventListener('click', () => {
            document.getElementById('calificacionInput').value = star.dataset.val;
        });
    });
    document.getElementById('starSelector').addEventListener('mouseleave', () => {
        const selected = parseInt(document.getElementById('calificacionInput').value);
        stars.forEach(s => s.textContent = parseInt(s.dataset.val) <= selected ? '★' : '☆');
    });
}

async function enviarResena(e) {
    e.preventDefault();
    const calificacion = parseInt(document.getElementById('calificacionInput').value);
    const comentario = document.getElementById('comentarioResena').value;
    const errorDiv = document.getElementById('errorResena');
    errorDiv.style.display = 'none';

    if (!calificacion || calificacion < 1) {
        errorDiv.textContent = t('Por favor selecciona una calificación con estrellas');
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/resenas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ calificacion, comentario })
        });
        const data = await response.json();
        if (response.ok) {
            cerrarModalResena();
            showNotification(t('¡Reseña enviada! Será publicada pronto. Gracias 🙏'), 'success');
        } else {
            errorDiv.textContent = t(data.error || 'Error al enviar la reseña');
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = t('Error de conexión. Intenta de nuevo.');
        errorDiv.style.display = 'block';
    }
}
// ──────────────────────────────────────────────────────────

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
`;
document.head.appendChild(style);

// ── CAMBIO DE IDIOMA ──────────────────────────────────────
// i18n.js avisa con este evento cuando el visitante cambia de idioma
document.addEventListener('bsc:languagechange', () => {
    updateAuthUI();
    if (refreshCalendar) refreshCalendar();
    renderResenas();
    if (selectedDate && bookingView === 'form') mostrarFormularioCita(selectedDate);
    else if (selectedDate && bookingView === 'login') mostrarPromptLogin(selectedDate);
});
