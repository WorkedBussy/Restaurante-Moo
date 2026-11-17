# 🍽️ Sistema Web de Gestión de Restaurante & Facturación Electrónica

Plataforma web integral orientada a la venta y administración de restaurantes. Incluye gestión de pedidos en tiempo real, catálogo de platos con control de stock, facturación electrónica y paneles diferenciados por rol (Cliente, Administrador, Repartidor/Mesero).

Proyecto desarrollado con base en la guía técnica de **Modelado Orientado a Objetos (MOO)** y arquitectura en la nube con **Firebase**.

---

## 🎯 Cumplimiento de la Rúbrica (Objetivo: 10/10)

| Criterio | Peso | Enfoque en este proyecto |
| :--- | :---: | :--- |
| **Defensa** | **30%** | Dominio total de la arquitectura de 3 capas, código limpio, justificación de patrones y manejo de concurrencia. |
| **Diseño Orientado a Objetos** | **25%** | Herencia de roles, Patrón **State** (estados de pedidos), Patrón **Strategy** (formas de pago y facturación), **Polimorfismo** en protección de rutas y renderizado, encapsulamiento en `db.js`. |
| **Modelo de Datos** | **25%** | Base de datos NoSQL Firestore: colecciones estructuradas, pedidos embebidos con precios congelados, historial append-only y transacciones atómicas (`runTransaction`). |
| **Funcionamiento** | **20%** | Flujo completo sin fallos: Registro -> Menú -> Pedido con mesa/delivery -> Pago / Facturación -> Cocina -> Despacho. |
| **Puntos Extras** | **Extra** | Tarea original adaptada a negocio real (Restaurante comercializable), facturación electrónica con desglose de impuestos y diseño UI/UX premium. |

---

## 🛠️ Herramientas y Stack Tecnológico

1. **Lenguajes & Frontend**: HTML5 Semántico, CSS3 Moderno (Responsive), JavaScript Moderno (ES6+ POO).
2. **Backend & Base de Datos**: Google Firebase (Authentication, Cloud Firestore, Firebase Hosting).
3. **Multimedia**: Cloudinary / Firebase Storage para fotos de platos y comprobantes.
4. **Facturación**: Módulo de facturación electrónica con desglose de impuestos y generación de comprobantes PDF.
5. **Control de Versiones**: Git & GitHub.
6. **Entorno**: Visual Studio Code, Node.js (LTS), Firebase CLI.

---

## 📂 Estructura del Proyecto

```text
├── public/
│   ├── css/
│   │   └── style.css            # Estilos visuales globales y tema del restaurante
│   ├── js/
│   │   ├── firebase-config.js   # Credenciales de conexión
│   │   ├── auth.js              # Manejo de sesiones, roles y atajo Ctrl+Shift+A
│   │   ├── db.js                # Encapsulamiento de operaciones Firestore
│   │   ├── facturacion.js       # Lógica de cálculo de impuestos y emisión de factura
│   │   ├── admin/               # Lógica del panel administrativo
│   │   └── repartidor/          # Lógica de pedidos y entregas
│   ├── admin/
│   │   ├── dashboard.html       # Métricas de ventas y pedidos activos
│   │   ├── pedidos.html         # Gestión de comandas y estados
│   │   ├── productos.html       # Menú, platos y stock
│   │   ├── categorias.html      # Entradas, platos fuertes, bebidas, postres
│   │   └── usuarios.html        # Gestión de personal (meseros, repartidores)
│   ├── index.html               # Página de inicio / Menú público
│   ├── login.html               # Autenticación de usuarios
│   ├── registro.html            # Registro de nuevos clientes
│   ├── catalogo.html            # Menú interactivo
│   ├── carrito.html             # Resumen del pedido
│   ├── checkout.html            # Confirmación de mesa/delivery y facturación
│   └── mis-pedidos.html         # Seguimiento en tiempo real y descarga de facturas
├── firebase.json                # Configuración de Firebase Hosting y reglas
├── firestore.rules              # Reglas de seguridad NoSQL
└── .gitignore                   # Archivos ignorados por Git
```

---

## 👥 Guía para Colaboradores (Git & GitHub)

1. Clonar el repositorio:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   ```
2. Crear una rama para tu tarea:
   ```bash
   git checkout -b feature/nombre-de-la-tarea
   ```
3. Guardar cambios y subir:
   ```bash
   git add .
   git commit -m "Descripción clara del cambio"
   git push origin feature/nombre-de-la-tarea
   ```
4. Crear un Pull Request en GitHub para revisión del equipo.
