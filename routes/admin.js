// CESGLOW-main/routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verificarCitasProximas } = require('../services/notificaciones');

// 1. LISTAR TODOS LOS SERVICIOS
router.get('/servicios', (req, res) => {
  db.all('SELECT * FROM servicios ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener servicios.' });
    res.json(rows || []);
  });
});

// 2. AGREGAR NUEVO SERVICIO (BILINGÜE: ESPAÑOL & INGLÉS)
router.post('/servicios', (req, res) => {
  const {
    nombre_es,
    nombre_en,
    descripcion_es,
    descripcion_en,
    precio,
    duracion,
    categoria,
    imagen,
    activo
  } = req.body;

  if (!nombre_es || !nombre_en) {
    return res.status(400).json({
      error: 'Se requiere el nombre del servicio tanto en español (nombre_es) como en inglés (nombre_en).'
    });
  }

  if (!precio || isNaN(precio) || Number(precio) <= 0) {
    return res.status(400).json({ error: 'El precio debe ser un número válido mayor a 0.' });
  }

  const query = `
    INSERT INTO servicios (
      nombre,
      nombre_es,
      nombre_en,
      descripcion,
      descripcion_es,
      descripcion_en,
      precio,
      duracion,
      categoria,
      imagen,
      activo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const duracionVal = duracion || 60;
  const categoriaVal = categoria || 'facial';
  const imagenVal = imagen || '/images/serv_fac1.jpg';
  const activoVal = activo !== undefined ? (activo ? 1 : 0) : 1;

  db.run(
    query,
    [
      nombre_es,
      nombre_es,
      nombre_en,
      descripcion_es || '',
      descripcion_es || '',
      descripcion_en || '',
      Number(precio),
      Number(duracionVal),
      categoriaVal,
      imagenVal,
      activoVal
    ],
    function (err) {
      if (err) {
        console.error('Error al insertar nuevo servicio:', err);
        return res.status(500).json({ error: 'Error en la base de datos al guardar el servicio.' });
      }

      res.status(201).json({
        mensaje: 'Servicio agregado exitosamente con nombres en español e inglés.',
        servicioId: this.lastID
      });
    }
  );
});

// 3. EDITAR SERVICIO EXISTENTE (BILINGÜE)
router.put('/servicios/:id', (req, res) => {
  const servicioId = req.params.id;
  const {
    nombre_es,
    nombre_en,
    descripcion_es,
    descripcion_en,
    precio,
    duracion,
    categoria,
    imagen,
    activo
  } = req.body;

  const query = `
    UPDATE servicios
    SET nombre = ?,
        nombre_es = ?,
        nombre_en = ?,
        descripcion = ?,
        descripcion_es = ?,
        descripcion_en = ?,
        precio = ?,
        duracion = ?,
        categoria = ?,
        imagen = ?,
        activo = ?
    WHERE id = ?
  `;

  db.run(
    query,
    [
      nombre_es,
      nombre_es,
      nombre_en,
      descripcion_es || '',
      descripcion_es || '',
      descripcion_en || '',
      Number(precio),
      Number(duracion || 60),
      categoria || 'facial',
      imagen || '/images/serv_fac1.jpg',
      activo !== undefined ? (activo ? 1 : 0) : 1,
      servicioId
    ],
    function (err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar servicio.' });
      res.json({ mensaje: 'Servicio actualizado correctamente.' });
    }
  );
});

// 4. ELIMINAR SERVICIO
router.delete('/servicios/:id', (req, res) => {
  const servicioId = req.params.id;
  db.run('DELETE FROM servicios WHERE id = ?', [servicioId], function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar servicio.' });
    res.json({ mensaje: 'Servicio eliminado correctamente.' });
  });
});

// 5. RUTA MANUAL PARA DISPARAR VERIFICACIÓN DE CITAS 24H Y 12H
router.post('/verificar-alertas-pendientes', async (req, res) => {
  try {
    await verificarCitasProximas();
    res.json({ mensaje: 'Verificación de citas pendientes a 24h y 12h completada con éxito.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar citas próximas.' });
  }
});

module.exports = router;