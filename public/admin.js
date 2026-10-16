// CESGLOW-main/public/admin.js
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  cargarCitas();
  cargarServicios();
  cargarHistorialNotificaciones();
});

// 1. MANEJO DE PESTAÑAS
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(btn.dataset.tab);
      if (targetTab) targetTab.classList.add('active');
    });
  });
}

// 2. GESTIÓN DE SERVICIOS BILINGÜES
function abrirModalNuevoServicio() {
  document.getElementById('modal-servicio-titulo').textContent = 'Agregar Nuevo Servicio (Bilingüe)';
  document.getElementById('servicio-id').value = '';
  document.getElementById('servicio-nombre-es').value = '';
  document.getElementById('servicio-nombre-en').value = '';
  document.getElementById('servicio-desc-es').value = '';
  document.getElementById('servicio-desc-en').value = '';
  document.getElementById('servicio-categoria').value = 'facial';
  document.getElementById('servicio-precio').value = '65';
  document.getElementById('servicio-duracion').value = '60';
  document.getElementById('servicio-imagen').value = '/images/serv_fac1.jpg';
  document.getElementById('servicio-activo').checked = true;

  document.getElementById('modal-servicio').style.display = 'flex';
}

function cerrarModalServicio() {
  document.getElementById('modal-servicio').style.display = 'none';
}

async function guardarServicio(e) {
  e.preventDefault();

  const id = document.getElementById('servicio-id').value;
  const nombre_es = document.getElementById('servicio-nombre-es').value.trim();
  const nombre_en = document.getElementById('servicio-nombre-en').value.trim();
  const descripcion_es = document.getElementById('servicio-desc-es').value.trim();
  const descripcion_en = document.getElementById('servicio-desc-en').value.trim();
  const categoria = document.getElementById('servicio-categoria').value;
  const precio = parseFloat(document.getElementById('servicio-precio').value);
  const duracion = parseInt(document.getElementById('servicio-duracion').value, 10);
  const imagen = document.getElementById('servicio-imagen').value.trim() || '/images/serv_fac1.jpg';
  const activo = document.getElementById('servicio-activo').checked;

  if (!nombre_es || !nombre_en) {
    alert('Por favor introduce el nombre del servicio tanto en Español como en Inglés.');
    return;
  }

  const payload = {
    nombre_es,
    nombre_en,
    descripcion_es,
    descripcion_en,
    categoria,
    precio,
    duracion,
    imagen,
    activo
  };

  try {
    const url = id ? `/api/admin/servicios/${id}` : '/api/admin/servicios';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Error al guardar el servicio');
    }

    alert('¡Servicio guardado exitosamente con nombres en español e inglés!');
    cerrarModalServicio();
    cargarServicios();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function cargarServicios() {
  const container = document.getElementById('admin-servicios-container');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/servicios');
    if (!res.ok) throw new Error('Error al cargar servicios');
    const servicios = await res.json();

    if (!servicios || servicios.length === 0) {
      container.innerHTML = '<p style="color:#718096; padding: 20px;">No hay servicios registrados aún. Haz clic en "+ Agregar Nuevo Servicio".</p>';
      return;
    }

    container.innerHTML = servicios
      .map(
        (s) => `
        <div class="servicio-card-admin">
          <img src="${s.imagen || '/images/serv_fac1.jpg'}" alt="${s.nombre}" class="servicio-img">
          <div class="servicio-body">
            <div>
              <span class="badge ${s.activo ? 'badge-success' : 'badge-danger'}">
                ${s.activo ? 'Activo' : 'Inactivo'}
              </span>
              <h4 style="margin-top:6px;">${s.nombre_es || s.nombre}</h4>
              <p class="service-en-name">🇺🇸 ${s.nombre_en || 'Sin nombre en inglés'}</p>
              <p class="desc" style="margin-top:4px;">${s.descripcion_es || s.descripcion || ''}</p>
            </div>
            <div>
              <div class="servicio-meta">
                <span><strong>Precio:</strong> $${s.precio}</span>
                <span><strong>Duración:</strong> ${s.duracion} min</span>
              </div>
              <div class="acciones-servicio">
                <button class="btn btn-sm btn-outline" style="color:#1e293b; border-color:#cbd5e1;" onclick="editarServicio(${JSON.stringify(s).replace(/"/g, '&quot;')})">Editar</button>
                <button class="btn btn-sm btn-danger" onclick="eliminarServicio(${s.id})">Eliminar</button>
              </div>
            </div>
          </div>
        </div>
      `
      )
      .join('');
  } catch (error) {
    container.innerHTML = '<p style="color:#e11d48;">No se pudieron cargar los servicios.</p>';
  }
}

function editarServicio(s) {
  document.getElementById('modal-servicio-titulo').textContent = 'Editar Servicio';
  document.getElementById('servicio-id').value = s.id;
  document.getElementById('servicio-nombre-es').value = s.nombre_es || s.nombre || '';
  document.getElementById('servicio-nombre-en').value = s.nombre_en || '';
  document.getElementById('servicio-desc-es').value = s.descripcion_es || s.descripcion || '';
  document.getElementById('servicio-desc-en').value = s.descripcion_en || '';
  document.getElementById('servicio-categoria').value = s.categoria || 'facial';
  document.getElementById('servicio-precio').value = s.precio || 60;
  document.getElementById('servicio-duracion').value = s.duracion || 60;
  document.getElementById('servicio-imagen').value = s.imagen || '/images/serv_fac1.jpg';
  document.getElementById('servicio-activo').checked = s.activo == 1;

  document.getElementById('modal-servicio').style.display = 'flex';
}

async function eliminarServicio(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar este servicio?')) return;
  try {
    const res = await fetch(`/api/admin/servicios/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    cargarServicios();
  } catch (err) {
    alert(err.message);
  }
}

// 3. GESTIÓN DE CITAS Y NOTIFICACIONES
async function cargarCitas() {
  const tbody = document.getElementById('citas-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/citas');
    if (!res.ok) throw new Error('Error al obtener citas');
    const citas = await res.json();

    if (!citas || citas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color:#718096;">No hay citas registradas.</td></tr>';
      return;
    }

    tbody.innerHTML = citas
      .map(
        (c) => `
        <tr>
          <td><strong>#${c.id}</strong></td>
          <td>
            <strong>${c.cliente_nombre || c.nombre_cliente || 'Cliente'}</strong><br>
            <small style="color:#64748b;">${c.telefono_cliente || ''}</small>
          </td>
          <td>${c.servicio_nombre || 'Tratamiento'}</td>
          <td><strong>${c.fecha}</strong> @ ${c.hora}</td>
          <td>
            <span class="badge status-${c.estado}">${c.estado.toUpperCase()}</span>
          </td>
          <td>
            <div style="display:flex; gap:6px;">
              ${
                c.estado === 'pendiente'
                  ? `<button class="btn btn-sm btn-success" onclick="confirmarCita(${c.id})">Confirmar</button>`
                  : ''
              }
              ${
                c.estado !== 'cancelada'
                  ? `
                <button class="btn btn-sm btn-outline" style="color:#0284c7; border-color:#bae6fd;" onclick="reagendarCitaPrompt(${c.id}, '${c.fecha}', '${c.hora}')">Reagendar</button>
                <button class="btn btn-sm btn-danger" onclick="cancelarCitaPrompt(${c.id})">Cancelar</button>
              `
                  : ''
              }
            </div>
          </td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:#e11d48; text-align:center;">Error al cargar citas.</td></tr>';
  }
}

async function confirmarCita(id) {
  try {
    const res = await fetch(`/api/citas/${id}/confirmar`, { method: 'PUT' });
    if (!res.ok) throw new Error('Error al confirmar');
    alert('¡Cita confirmada! Se envió la notificación correspondiente al cliente.');
    cargarCitas();
    cargarHistorialNotificaciones();
  } catch (err) {
    alert(err.message);
  }
}

async function cancelarCitaPrompt(id) {
  const motivo = prompt('Motivo de cancelación (opcional):', 'Cancelado por administración');
  if (motivo === null) return;

  try {
    const res = await fetch(`/api/citas/${id}/cancelar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo, cancelado_por: 'admin' })
    });
    if (!res.ok) throw new Error('Error al cancelar');
    alert('Cita cancelada. Alertas enviadas al cliente y admin.');
    cargarCitas();
    cargarHistorialNotificaciones();
  } catch (err) {
    alert(err.message);
  }
}

async function reagendarCitaPrompt(id, fechaActual, horaActual) {
  const nuevaFecha = prompt('Introduce la nueva fecha (AAAA-MM-DD):', fechaActual);
  if (!nuevaFecha) return;
  const nuevaHora = prompt('Introduce el nuevo horario (HH:MM):', horaActual);
  if (!nuevaHora) return;

  try {
    const res = await fetch(`/api/citas/${id}/reagendar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nueva_fecha: nuevaFecha, nueva_hora: nuevaHora })
    });
    if (!res.ok) throw new Error('Error al reagendar');
    alert('Cita reagendada. Alertas enviadas al cliente y admin.');
    cargarCitas();
    cargarHistorialNotificaciones();
  } catch (err) {
    alert(err.message);
  }
}

// 4. VERIFICACIÓN MANUAL DE ALERTAS 24H Y 12H
async function verificarAlertasServidor() {
  try {
    const res = await fetch('/api/admin/verificar-alertas-pendientes', { method: 'POST' });
    const data = await res.json();
    alert(data.mensaje || 'Verificación de citas 24h y 12h completada.');
    cargarHistorialNotificaciones();
  } catch (err) {
    alert('Error al verificar alertas: ' + err.message);
  }
}

function probarAlertaExterna() {
  if (typeof mostrarNotificacionNavegador === 'function') {
    mostrarNotificacionNavegador(
      '⏰ [PRUEBA 24H] Recordatorio CESGLOW',
      'Tienes una cita pendiente en menos de 24 horas. ¡Esta alerta llega fuera de la pestaña!'
    );
  } else {
    alert('Activa primero las notificaciones web con el botón arriba.');
  }
}

// 5. CARGAR HISTORIAL DE NOTIFICACIONES
async function cargarHistorialNotificaciones() {
  const cont = document.getElementById('historial-notificaciones');
  if (!cont) return;

  try {
    const res = await fetch('/api/notificaciones');
    if (!res.ok) return;
    const notificaciones = await res.json();

    if (!notificaciones || notificaciones.length === 0) {
      cont.innerHTML = '<p style="color:#718096; padding: 20px;">No hay notificaciones registradas.</p>';
      return;
    }

    cont.innerHTML = notificaciones
      .map(
        (n) => `
        <div class="notif-item ${n.leida ? 'leida' : 'no-leida'}">
          <div class="notif-meta">
            <span class="badge" style="background:#e0e7ff; color:#3730a3;">${n.tipo.toUpperCase()}</span>
            <span class="badge" style="background:#fce7f3; color:#9d174d;">${n.rol.toUpperCase()}</span>
            <span style="color:#64748b;">${n.fecha_creacion || ''}</span>
          </div>
          <h5 style="font-size:14px; font-weight:700; color:#0f172a;">${n.titulo}</h5>
          <p style="font-size:13px; color:#334155; margin-top:2px;">${n.mensaje}</p>
        </div>
      `
      )
      .join('');
  } catch (e) {
    cont.innerHTML = '<p style="color:#718096;">No se pudo cargar el historial.</p>';
  }
}