# Activar notificaciones push (CESGLOW)

El código ya está listo; solo faltan 3 pasos en el servidor (Railway):

1. Instalar la dependencia nueva (ya está en package.json):
       npm install
   (Railway lo hace solo al desplegar.)

2. Generar las claves VAPID (una sola vez) en tu computador:
       npm run vapid
   Te da una "Public Key" y una "Private Key".

3. En Railway → Variables, crea:
       VAPID_PUBLIC_KEY  = (la Public Key)
       VAPID_PRIVATE_KEY = (la Private Key)
       VAPID_SUBJECT     = mailto:tucorreo@ejemplo.com
       TZ_NEGOCIO        = America/Bogota   (o la zona donde atiendes las citas)
   Reinicia el servicio. En los logs debe salir: "Notificaciones activas: campanita, push ...".

Luego, en cada dispositivo (cliente y admin):
- Inicia sesión → aparece el cuadro "¿Quieres recibir avisos...?" → toca Activar → Permitir.
- Si lo cerraste: campanita → "Activar avisos en este dispositivo".
- Requiere HTTPS. En iPhone: Compartir → "Añadir a pantalla de inicio".
- Si usas Cloudflare, purga la caché de /sw.js y /js/notificaciones.js tras publicar.
