/**
 * ============================================================================
 * CAPA 3: ENCAPSULAMIENTO DE BASE DE DATOS Y CONCURRENCIA ACID (MOO)
 * ============================================================================
 * Implementa:
 * 1. [PILAR MOO: ENCAPSULAMIENTO] Ningún HTML consulta Firestore directamente.
 * 2. [CONCURRENCIA ACID: runTransaction] Control de stock seguro frente a compras concurrentes.
 * 3. [AUDITORÍA APPEND-ONLY] Historial de estados inmutable y bitácora de stock.
 * 4. [PATRÓN STATE] Integración estricta con puedeTransicionar().
 * 5. [PRECIOS CONGELADOS] Datos embebidos inmutables al momento del pedido.
 */

// ── 1. GESTIÓN DE PRODUCTOS / PLATOS DEL MENÚ ───────────────────────────────

/**
 * [ENCAPSULAMIENTO] Obtiene la lista de platos con filtros opcionales.
 */
async function listarProductos(categoriaId = null, soloDisponibles = true) {
  try {
    let ref = db.collection("productos");
    if (soloDisponibles) {
      ref = ref.where("activo", "==", true);
    }
    if (categoriaId) {
      ref = ref.where("categoria_id", "==", categoriaId);
    }
    const snapshot = await ref.get();
    const productos = [];
    snapshot.forEach(doc => {
      productos.push({ id: doc.id, ...doc.data() });
    });
    return productos;
  } catch (error) {
    console.error("Error al listar productos:", error);
    mostrarToast("Error al cargar los platillos del menú", "error");
    return [];
  }
}

/**
 * Obtiene un producto por su identificador único.
 */
async function obtenerProducto(id) {
  try {
    const doc = await db.collection("productos").doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  } catch (error) {
    console.error("Error al obtener producto:", error);
    return null;
  }
}

/**
 * Crea un nuevo plato en el catálogo (Solo Administradores).
 */
async function crearProducto(datos) {
  try {
    const nuevo = {
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion ? datos.descripcion.trim() : "",
      precio: parseFloat(datos.precio) || 0,
      categoria_id: datos.categoria_id,
      categoria_nombre: datos.categoria_nombre || "General",
      stock_actual: parseInt(datos.stock_actual, 10) || 0,
      tiempo_preparacion: parseInt(datos.tiempo_preparacion, 10) || 15, // en minutos
      imagen_url: datos.imagen_url || null,
      activo: true,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db.collection("productos").add(nuevo);
    return { id: docRef.id, ...nuevo };
  } catch (error) {
    console.error("Error al crear producto:", error);
    throw error;
  }
}

/**
 * Actualiza los datos de un plato existente.
 */
async function actualizarProducto(id, datos) {
  try {
    datos.updated_at = firebase.firestore.FieldValue.serverTimestamp();
    await db.collection("productos").doc(id).update(datos);
    return true;
  } catch (error) {
    console.error("Error al actualizar producto:", error);
    throw error;
  }
}

/**
 * Desactiva un plato (Soft Delete para mantener integridad referencial).
 */
async function eliminarProducto(id) {
  try {
    await db.collection("productos").doc(id).update({
      activo: false,
      deleted_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Error al desactivar producto:", error);
    throw error;
  }
}

// ── 2. CONCURRENCIA ACID: CONTROL DE STOCK CON runTransaction ───────────────

/**
 * [CONCURRENCIA ATÓMICA]
 * Evita la sobreventa cuando múltiples comensales ordenan el último plato al mismo tiempo.
 * Garantiza lectura y escritura atómica en Firestore.
 */
async function descontarStock(productoId, cantidad, motivo = "Venta por Pedido", usuarioId = "") {
  await db.runTransaction(async (transaction) => {
    const prodRef = db.collection("productos").doc(productoId);
    const prodDoc = await transaction.get(prodRef);

    if (!prodDoc.exists) {
      throw new Error(`El producto con ID ${productoId} no existe.`);
    }

    const stockActual = prodDoc.data().stock_actual || 0;
    if (stockActual < cantidad) {
      throw new Error(`Stock insuficiente para "${prodDoc.data().nombre}". Disponibles: ${stockActual}, Solicitados: ${cantidad}`);
    }

    // Actualización atómica del stock dentro del candado de la transacción
    transaction.update(prodRef, { 
      stock_actual: stockActual - cantidad,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  // [AUDITORÍA APPEND-ONLY]
  // Registra el movimiento en la bitácora inmutable
  await db.collection("movimientos_stock").add({
    producto_id: productoId,
    tipo: "salida",
    cantidad: cantidad,
    motivo: motivo,
    usuario_id: usuarioId,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * [AUDITORÍA Y DEVOLUCIÓN] Restaura el stock en caso de cancelación de pedido.
 */
async function devolverStock(productoId, cantidad, motivo = "Cancelación de Pedido", usuarioId = "") {
  await db.runTransaction(async (transaction) => {
    const prodRef = db.collection("productos").doc(productoId);
    const prodDoc = await transaction.get(prodRef);
    if (prodDoc.exists) {
      const stockActual = prodDoc.data().stock_actual || 0;
      transaction.update(prodRef, {
        stock_actual: stockActual + cantidad,
        updated_at: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  });

  await db.collection("movimientos_stock").add({
    producto_id: productoId,
    tipo: "entrada",
    cantidad: cantidad,
    motivo: motivo,
    usuario_id: usuarioId,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ── 3. GESTIÓN Y CICLO DE VIDA DE PEDIDOS (COMANDAS) ─────────────────────────

/**
 * Crea un nuevo pedido en el restaurante.
 * [DECISIÓN DE DISEÑO: PRECIOS CONGELADOS & DETALLES EMBEBIDOS]
 */
async function crearPedido(datosPedido) {
  try {
    // 1. Descontar stock atómicamente para cada ítem
    for (const item of datosPedido.detalles) {
      await descontarStock(item.producto_id, item.cantidad, "Nuevo Pedido", datosPedido.cliente_id);
    }

    // 2. Estructura del documento de Pedido completo
    const pedidoCompleto = {
      cliente_id: datosPedido.cliente_id,
      cliente_nombre: datosPedido.cliente_nombre,
      cliente_email: datosPedido.cliente_email || "",
      cliente_telefono: datosPedido.cliente_telefono || "",
      tipo_servicio: datosPedido.tipo_servicio || "comedor", // "comedor" (mesa) | "delivery" | "retiro"
      mesa_o_direccion: datosPedido.mesa_o_direccion || "Mesa General",
      forma_pago: datosPedido.forma_pago, // "efectivo" | "transferencia" | "tarjeta"
      comprobante_url: datosPedido.comprobante_url || null,
      notas_especiales: datosPedido.notas_especiales || "",
      
      // Montos económicos
      subtotal: parseFloat(datosPedido.subtotal) || 0,
      tarifa_envio: parseFloat(datosPedido.tarifa_envio) || 0,
      iva_monto: parseFloat(datosPedido.iva_monto) || 0,
      total: parseFloat(datosPedido.total) || 0,

      // Datos de Facturación Electrónica asociada
      factura_datos: datosPedido.factura_datos || {
        tipo: "Consumidor Final",
        identificacion: "9999999999999",
        razon_social: "CONSUMIDOR FINAL"
      },

      // [PATRÓN STATE]: Estado inicial
      estado: "pendiente",
      repartidor_o_mesero_id: null,
      tiempo_estimado: null,

      // [PRECIOS CONGELADOS]: Detalles embebidos en el documento
      detalles: datosPedido.detalles.map(item => ({
        producto_id: item.producto_id,
        nombre_producto: item.nombre_producto,
        cantidad: parseInt(item.cantidad, 10),
        precio_unitario: parseFloat(item.precio_unitario),
        subtotal: parseFloat((item.cantidad * item.precio_unitario).toFixed(2))
      })),

      // [AUDITORÍA APPEND-ONLY]: Historial inmutable
      historial: [
        {
          estado_nuevo: "pendiente",
          fecha: new Date().toISOString(),
          nota: "Pedido emitido por el cliente",
          usuario_id: datosPedido.cliente_id
        }
      ],
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection("pedidos").add(pedidoCompleto);
    return { id: docRef.id, ...pedidoCompleto };
  } catch (error) {
    console.error("Error al crear el pedido:", error);
    throw error;
  }
}

/**
 * [PATRÓN STATE EN ACCIÓN]
 * Cambia el estado del pedido validando rigurosamente que la transición sea permitida.
 */
async function cambiarEstadoPedido(pedidoId, pedidoActual, nuevoEstado, usuarioId, nota = "") {
  // Validar con la máquina de estados definida en auth.js
  if (!puedeTransicionar(pedidoActual.estado, nuevoEstado)) {
    throw new Error(`Transición inválida: No se permite cambiar de "${pedidoActual.estado}" a "${nuevoEstado}".`);
  }

  // Si se cancela el pedido, se devuelve automáticamente el stock reservado
  if (nuevoEstado === "cancelado") {
    for (const item of (pedidoActual.detalles || [])) {
      await devolverStock(item.producto_id, item.cantidad, `Cancelación Pedido #${pedidoId.slice(0, 6)}`, usuarioId);
    }
  }

  // Entrada append-only para el historial
  const nuevaEntradaHistorial = {
    estado_nuevo: nuevoEstado,
    fecha: new Date().toISOString(),
    nota: nota || `Cambio de estado a ${nuevoEstado}`,
    usuario_id: usuarioId
  };

  await db.collection("pedidos").doc(pedidoId).update({
    estado: nuevoEstado,
    historial: firebase.firestore.FieldValue.arrayUnion(nuevaEntradaHistorial),
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  });

  return true;
}

/**
 * Asigna un mesero o repartidor a la comanda.
 */
async function asignarPersonalPedido(pedidoId, personalId, personalNombre) {
  try {
    await db.collection("pedidos").doc(pedidoId).update({
      repartidor_o_mesero_id: personalId,
      repartidor_o_mesero_nombre: personalNombre,
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Error al asignar personal:", error);
    throw error;
  }
}

/**
 * Notifica el tiempo estimado de entrega/servicio (5, 10, 15, 30 min).
 */
async function actualizarTiempoEstimado(pedidoId, minutos) {
  try {
    await db.collection("pedidos").doc(pedidoId).update({
      tiempo_estimado: parseInt(minutos, 10),
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Error al actualizar tiempo estimado:", error);
    throw error;
  }
}

/**
 * Obtiene los pedidos del cliente autenticado en tiempo real o histórico.
 */
async function listarPedidosUsuario(usuarioId) {
  try {
    const snap = await db.collection("pedidos")
      .where("cliente_id", "==", usuarioId)
      .get();
    const pedidos = [];
    snap.forEach(doc => pedidos.push({ id: doc.id, ...doc.data() }));
    // Ordenar descendente por fecha
    return pedidos.sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));
  } catch (error) {
    console.error("Error al listar pedidos del usuario:", error);
    return [];
  }
}

/**
 * Obtiene todos los pedidos para el Panel Admin o Cocina.
 */
async function listarTodosLosPedidos(filtroEstado = null) {
  try {
    let ref = db.collection("pedidos");
    if (filtroEstado && filtroEstado !== "todos") {
      ref = ref.where("estado", "==", filtroEstado);
    }
    const snap = await ref.get();
    const pedidos = [];
    snap.forEach(doc => pedidos.push({ id: doc.id, ...doc.data() }));
    return pedidos.sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));
  } catch (error) {
    console.error("Error al obtener todos los pedidos:", error);
    return [];
  }
}

/**
 * Obtiene un pedido específico por ID.
 */
async function obtenerPedido(pedidoId) {
  try {
    const doc = await db.collection("pedidos").doc(pedidoId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  } catch (error) {
    console.error("Error al obtener pedido:", error);
    return null;
  }
}

// ── 4. CATEGORÍAS & MESAS DEL RESTAURANTE ───────────────────────────────────

async function listarCategorias() {
  try {
    const snap = await db.collection("categorias").where("activo", "==", true).get();
    const categorias = [];
    snap.forEach(doc => categorias.push({ id: doc.id, ...doc.data() }));
    return categorias;
  } catch (error) {
    console.error("Error al listar categorías:", error);
    return [];
  }
}

async function crearCategoria(nombre, icono = "bi-tag") {
  try {
    const docRef = await db.collection("categorias").add({
      nombre: nombre.trim(),
      icono: icono,
      activo: true,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, nombre, icono };
  } catch (error) {
    console.error("Error al crear categoría:", error);
    throw error;
  }
}

// ── 5. SUBIDA DE ARCHIVOS (CLOUDINARY / FIREBASE STORAGE) ────────────────────

/**
 * Sube una imagen a la nube evitando colisiones de nombres con timestamp único.
 * Soporta Cloudinary de manera nativa para evitar requerir el plan Blaze de Firebase.
 * @param {File} archivo 
 * @param {string} carpeta 
 * @returns {Promise<string>} URL pública de la imagen
 */
async function subirImagen(archivo, carpeta = "restaurante") {
  if (!archivo) return null;

  // Intentar primero con Cloudinary si está configurado
  if (typeof CLOUDINARY_CONFIG !== "undefined" && CLOUDINARY_CONFIG.cloudName && CLOUDINARY_CONFIG.uploadPreset) {
    try {
      const formData = new FormData();
      formData.append("file", archivo);
      formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
      formData.append("folder", carpeta);

      const resp = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`, {
        method: "POST",
        body: formData
      });

      if (resp.ok) {
        const data = await resp.json();
        return data.secure_url;
      }
    } catch (err) {
      console.warn("Fallo subida con Cloudinary, intentando Firebase Storage:", err);
    }
  }

  // Fallback con Firebase Storage (generando nombre único con timestamp)
  const nombreUnico = `${carpeta}/${Date.now()}_${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "")}`;
  const ref = storage.ref(nombreUnico);
  await ref.put(archivo);
  return await ref.getDownloadURL();
}
