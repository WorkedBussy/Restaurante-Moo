/**
 * ============================================================================
 * CAPA 2: AUTENTICACIÓN, CONTROL DE ROLES Y PATRONES DE DISEÑO (MOO)
 * ============================================================================
 * Implementa:
 * 1. [PILAR MOO: POLIMORFISMO] en la función protegerPagina()
 * 2. [PATRÓN DE DISEÑO: STATE] en la máquina de estados de pedidos
 * 3. [PILAR MOO: HERENCIA DE ROLES] (cliente, administrador, mesero/repartidor)
 * 4. [SEGURIDAD] Atajo invisible Ctrl+Shift+A para el panel de administración
 */

// ── 1. PATRÓN STATE: MÁQUINA DE ESTADOS FINITOS DE UN PEDIDO ───────────────
/**
 * [PATRÓN STATE]
 * Evita condicionales desordenados dispersos en el código. Define estrictamente
 * qué transiciones de estado son válidas en el ciclo de vida de una comanda.
 */
const TRANSICIONES_VALIDAS = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["en_preparacion", "cancelado"],
  en_preparacion: ["listo_para_servir", "en_camino", "cancelado"],
  listo_para_servir: ["entregado"],
  en_camino: ["entregado"],
  entregado: [], // Estado terminal (inmutable)
  cancelado: []  // Estado terminal (inmutable)
};

/**
 * Valida si un cambio de estado está permitido por las reglas del negocio.
 * @param {string} estadoActual 
 * @param {string} nuevoEstado 
 * @returns {boolean}
 */
function puedeTransicionar(estadoActual, nuevoEstado) {
  const permitidos = TRANSICIONES_VALIDAS[estadoActual] || [];
  return permitidos.includes(nuevoEstado);
}

// ── 2. POLIMORFISMO: PROTECCIÓN Y DISPATCH DE PÁGINAS ───────────────────────
/**
 * [PILAR MOO: POLIMORFISMO]
 * La misma función protegerPagina() produce comportamientos distintos según el rol
 * del usuario y ejecuta polimórficamente la función iniciarPagina() de cada vista.
 * @param {Array<string>} rolesPermitidos - Lista de roles con permiso (ej. ['administrador'])
 */
function protegerPagina(rolesPermitidos = []) {
  auth.onAuthStateChanged(async (user) => {
    // Si la ruta requiere roles y no hay usuario autenticado -> Redirige al login
    if (!user) {
      if (rolesPermitidos.length > 0) {
        window.location.href = "/login.html";
        return;
      }
      // Si la página es pública y tiene iniciarPagina()
      if (typeof iniciarPagina === "function") {
        iniciarPagina(null);
      }
      return;
    }

    try {
      // Obtener datos del perfil y rol desde Firestore
      const userDoc = await db.collection("usuarios").doc(user.uid).get();
      const datosUsuario = userDoc.exists ? userDoc.data() : { rol: "cliente" };

      // Si la página restringe roles específicos
      if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(datosUsuario.rol)) {
        mostrarToast("No tienes permisos para acceder a esta sección.", "warning");
        setTimeout(() => {
          window.location.href = datosUsuario.rol === "administrador" 
            ? "/admin/dashboard.html" 
            : "/catalogo.html";
        }, 1200);
        return;
      }

      // Actualizar información en el Navbar si existe
      actualizarNavbarUsuario(user, datosUsuario);

      // [POLIMORFISMO EN ACCIÓN]
      // Cada página define su propio método iniciarPagina() con su comportamiento específico
      if (typeof iniciarPagina === "function") {
        iniciarPagina(datosUsuario, user);
      }
    } catch (error) {
      console.error("Error al verificar perfil de usuario:", error);
    }
  });
}

// ── 3. SEGURIDAD: ATAJO INVISIBLE Ctrl+Shift+A ─────────────────────────────
/**
 * No existe ningún botón en la interfaz pública que revele el panel de administración.
 * Solo administradores autenticados que conozcan el atajo pueden acceder.
 */
document.addEventListener("keydown", async (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      mostrarToast("Inicia sesión como administrador para acceder", "info");
      return;
    }

    try {
      const doc = await db.collection("usuarios").doc(user.uid).get();
      if (doc.exists && doc.data().rol === "administrador") {
        mostrarToast("Acceso de Administrador concedido...", "success");
        setTimeout(() => {
          window.location.href = "/admin/dashboard.html";
        }, 600);
      } else {
        mostrarToast("Acceso denegado: Se requiere rol de Administrador", "error");
      }
    } catch (err) {
      console.error("Error validando rol de administrador:", err);
    }
  }
});

// ── 4. OPERACIONES DE AUTENTICACIÓN ─────────────────────────────────────────

/**
 * Inicia sesión con correo y contraseña.
 */
async function iniciarSesion(email, password) {
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const doc = await db.collection("usuarios").doc(cred.user.uid).get();
    const rol = doc.exists ? doc.data().rol : "cliente";
    mostrarToast("¡Bienvenido de nuevo!", "success");
    return { user: cred.user, rol };
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    let msg = "Error al iniciar sesión";
    if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
      msg = "Credenciales incorrectas.";
    } else if (error.code === "auth/invalid-email") {
      msg = "Formato de correo no válido.";
    }
    mostrarToast(msg, "error");
    throw error;
  }
}

/**
 * Registra un nuevo usuario cliente en Firebase Auth y crea su documento en Firestore.
 */
async function registrarUsuario(nombre, email, password, telefono = "", identificacion = "") {
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    
    // [PILAR MOO: HERENCIA DE USUARIO]
    // Estructura base que comparten todos los roles con especialización por 'rol'
    const nuevoUsuario = {
      uid: cred.user.uid,
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      telefono: telefono.trim(),
      identificacion: identificacion.trim(), // Cédula o RUC para facturación
      rol: "cliente", // Por defecto siempre es cliente
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      activo: true
    };

    await db.collection("usuarios").doc(cred.user.uid).set(nuevoUsuario);
    mostrarToast("Cuenta creada exitosamente", "success");
    return nuevoUsuario;
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    let msg = "Error al crear la cuenta.";
    if (error.code === "auth/email-already-in-use") {
      msg = "Este correo electrónico ya está registrado.";
    } else if (error.code === "auth/weak-password") {
      msg = "La contraseña debe tener al menos 6 caracteres.";
    }
    mostrarToast(msg, "error");
    throw error;
  }
}

/**
 * Cierra la sesión activa y redirige al inicio.
 */
async function cerrarSesion() {
  try {
    await auth.signOut();
    localStorage.removeItem("carrito_restaurante");
    mostrarToast("Sesión cerrada", "info");
    setTimeout(() => {
      window.location.href = "/login.html";
    }, 500);
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
}

// ── 5. UTILIDADES DE INTERFAZ Y NOTIFICACIONES TOAST ────────────────────────
function mostrarToast(mensaje, tipo = "info") {
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    toastContainer.className = "toast-container position-fixed bottom-0 end-0 p-3";
    toastContainer.style.zIndex = "9999";
    document.body.appendChild(toastContainer);
  }

  const bgClasses = {
    success: "bg-success text-white",
    error: "bg-danger text-white",
    warning: "bg-warning text-dark",
    info: "bg-dark text-white"
  };

  const id = "toast_" + Date.now();
  const toastHtml = `
    <div id="${id}" class="toast align-items-center ${bgClasses[tipo] || bgClasses.info} border-0 shadow" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body fw-medium">${mensaje}</div>
        <button type="button" class="btn-close ${tipo === 'warning' ? '' : 'btn-close-white'} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;
  toastContainer.insertAdjacentHTML("beforeend", toastHtml);
  const element = document.getElementById(id);
  if (window.bootstrap && bootstrap.Toast) {
    const bsToast = new bootstrap.Toast(element, { delay: 3500 });
    bsToast.show();
    element.addEventListener("hidden.bs.toast", () => element.remove());
  } else {
    element.style.display = "block";
    setTimeout(() => element.remove(), 3500);
  }
}

function actualizarNavbarUsuario(user, datosUsuario) {
  const userSlot = document.getElementById("navbar-usuario-slot");
  if (!userSlot) return;

  const esAdmin = datosUsuario && datosUsuario.rol === "administrador";
  const esPersonal = datosUsuario && (datosUsuario.rol === "mesero" || datosUsuario.rol === "repartidor");

  userSlot.innerHTML = `
    <div class="dropdown">
      <button class="btn btn-outline-light dropdown-toggle d-flex align-items-center gap-2" type="button" data-bs-toggle="dropdown">
        <i class="bi bi-person-circle"></i>
        <span>${datosUsuario.nombre || user.email}</span>
        <span class="badge ${esAdmin ? 'bg-danger' : esPersonal ? 'bg-warning text-dark' : 'bg-primary'} text-capitalize">${datosUsuario.rol || 'cliente'}</span>
      </button>
      <ul class="dropdown-menu dropdown-menu-end shadow">
        <li><a class="dropdown-item" href="/mis-pedidos.html"><i class="bi bi-receipt me-2"></i>Mis Pedidos & Facturas</a></li>
        ${esAdmin ? '<li><a class="dropdown-item text-danger fw-bold" href="/admin/dashboard.html"><i class="bi bi-speedometer2 me-2"></i>Panel Administrador</a></li>' : ''}
        ${esPersonal ? '<li><a class="dropdown-item text-warning fw-bold" href="/repartidor/entregas.html"><i class="bi bi-bicycle me-2"></i>Mis Entregas</a></li>' : ''}
        <li><hr class="dropdown-divider"></li>
        <li><button class="dropdown-item text-danger" onclick="cerrarSesion()"><i class="bi bi-box-arrow-right me-2"></i>Cerrar Sesión</button></li>
      </ul>
    </div>
  `;
}
