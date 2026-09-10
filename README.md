# Sistema de Inscripción de Grupos — Marketing Internacional ADMI-203

Aplicación web para la declaración de grupos de trabajo semestrales y selección de productos de estudio con control estricto de cupos en tiempo real y panel de administración docente.

---

## 🚀 Inicio Rápido

### 1. Iniciar el Servidor Local
Abre una terminal en esta carpeta y ejecuta:

```bash
node server.js
```

El servidor quedará activo en:
- **Formulario de Alumnos:** [http://localhost:3000/](http://localhost:3000/)
- **Panel Docente:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

---

## 🌐 ¿Cómo generar un Link Público para los Alumnos?

Para que tus alumnos puedan ingresar desde sus teléfonos o computadores desde cualquier lugar, puedes usar cualquiera de estas opciones:

### Opción A: Link Inmediato con Cloudflare Tunnel (Recomendado y Gratis)
En una segunda ventana de tu terminal, ejecuta:
```bash
cloudflared tunnel --url http://localhost:3000
```
Te entregará al instante un enlace seguro HTTPS tipo `https://xxxx.trycloudflare.com` que puedes enviar por WhatsApp o correo a tus alumnos.

### Opción B: Link Inmediato con LocalTunnel (Sin instalar nada)
```bash
npx localtunnel --port 3000
```

### Opción C: Conexión en la misma red Wi-Fi
Si estás en la misma sala o red Wi-Fi que tus alumnos, puedes compartir tu dirección IP local:
`http://TU-IP-LOCAL:3000`

---

## 🔑 Panel Docente (Administrador)

- **Dirección:** `/admin.html`
- **Contraseña oficial:** `piayanitalidas`
- **Funcionalidades:**
  - Visualización del orden exacto de llegada (fecha y hora en horario de Chile).
  - Listado completo de integrantes (5 o 6 alumnos por grupo).
  - Producto y código SACh asignado, o nombre del emprendimiento previo si seleccionaron *Producto semestre pasado*.
  - **Eliminar inscripción:** Permite dar de baja un grupo con confirmación. Al eliminarlo, el cupo correspondiente se restablece automáticamente y se actualiza en vivo para todos los alumnos que tengan el link abierto.
  - **Exportar a Excel (CSV):** Descarga un archivo compatible directamente con Excel y Google Sheets con todos los datos ordenados.

---

## 📋 Reglas del Sistema

1. **Integrantes:** Obligatorio mínimo 5 y máximo 6 alumnos. Si no se llenan al menos 5 casillas, no se permite el envío.
2. **Cupos por Producto:** Cada producto dispone de exactamente 2 cupos.
3. **Manejo de Concurrencia:** Si dos grupos envían al mismo tiempo cuando queda 1 cupo, el servidor evalúa atómicamente la solicitud. Al que llegue un instante después se le notifica con el mensaje: *"producto sin cupos disponibles"* y se le actualiza el stock sin borrar los nombres de su grupo.
4. **Sincronización en Vivo:** Usa *Server-Sent Events* (SSE). Cualquier inscripción o eliminación actualiza el stock en pantalla en milisegundos sin necesidad de refrescar la página.

---

## 🧪 Pruebas Automatizadas

Para validar todo el sistema, ejecuta:
```bash
node test/test-suite.js
```
