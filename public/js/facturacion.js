/**
 * ============================================================================
 * CAPA 4: FACTURACIÓN ELECTRÓNICA & PATRÓN STRATEGY DE PAGO (PUNTOS EXTRAS)
 * ============================================================================
 * Implementa:
 * 1. [PATRÓN DE DISEÑO: STRATEGY] Algoritmos desacoplados según el método de pago
 * 2. [FACTURACIÓN ELECTRÓNICA] Generación de comprobante digital con cálculo de IVA
 *    (tarifa 15% vigente), desglose de impuestos, clave de acceso SRI y PDF descargable.
 */

// ── 1. PATRÓN STRATEGY: FORMAS DE PAGO ──────────────────────────────────────

/**
 * Interfaz Conceptual / Clase Base de la Estrategia de Pago
 */
class EstrategiaPago {
  /**
   * Procesa la forma de pago específica.
   * @param {Object} datosPago 
   * @returns {Promise<{exito: boolean, comprobante_url: string|null, mensaje: string}>}
   */
  async procesar(datosPago) {
    throw new Error("El método procesar() debe ser implementado por la estrategia concreta.");
  }
}

/**
 * [STRATEGY CONCRETA 1]: Pago en Efectivo (Contra entrega o en caja)
 */
class PagoEfectivoStrategy extends EstrategiaPago {
  async procesar(datosPago) {
    return {
      exito: true,
      forma_pago: "efectivo",
      comprobante_url: null,
      mensaje: "Pedido registrado para pago en efectivo al recibir o en mesa."
    };
  }
}

/**
 * [STRATEGY CONCRETA 2]: Pago por Transferencia Bancaria (Requiere Voucher)
 */
class PagoTransferenciaStrategy extends EstrategiaPago {
  async procesar(datosPago) {
    if (!datosPago.archivoComprobante) {
      throw new Error("Debe adjuntar el comprobante o captura de la transferencia bancaria.");
    }
    // Subir imagen a la nube
    const url = await subirImagen(datosPago.archivoComprobante, "comprobantes_pago");
    return {
      exito: true,
      forma_pago: "transferencia",
      comprobante_url: url,
      mensaje: "Comprobante de transferencia recibido. En verificación por caja."
    };
  }
}

/**
 * [STRATEGY CONCRETA 3]: Pago con Tarjeta de Débito / Crédito / En línea
 */
class PagoTarjetaStrategy extends EstrategiaPago {
  async procesar(datosPago) {
    // Simula validación y tokenización de tarjeta
    const refTransaccion = "TXN-" + Math.floor(100000 + Math.random() * 900000);
    return {
      exito: true,
      forma_pago: "tarjeta",
      comprobante_url: null,
      referencia_transaccion: refTransaccion,
      mensaje: `Pago con tarjeta aprobado exitosamente. Ref: ${refTransaccion}`
    };
  }
}

/**
 * [CONTEXTO DEL PATRÓN STRATEGY]
 * Permite cambiar de estrategia en tiempo de ejecución sin modificar el checkout.
 */
class ProcesadorPagoContext {
  constructor(estrategia) {
    this.estrategia = estrategia;
  }

  setEstrategia(estrategia) {
    this.estrategia = estrategia;
  }

  async ejecutarPago(datosPago) {
    if (!this.estrategia) {
      throw new Error("No se ha definido una estrategia de pago.");
    }
    return await this.estrategia.procesar(datosPago);
  }
}

// ── 2. MÓDULO DE FACTURACIÓN ELECTRÓNICA SRI / COMERCIAL ───────────────────

const ModuloFacturacion = {
  /**
   * Calcula el desglose tributario con base en la tarifa del restaurante.
   */
  calcularMontos(items, tarifaEnvio = 0, aplicarPropina = false) {
    let subtotalSinImpuestos = 0;
    items.forEach(item => {
      subtotalSinImpuestos += item.precio_unitario * item.cantidad;
    });

    const porcentajeIva = (typeof RESTAURANTE_INFO !== "undefined" && RESTAURANTE_INFO.ivaPorcentaje) ? RESTAURANTE_INFO.ivaPorcentaje : 0.15;
    const iva = subtotalSinImpuestos * porcentajeIva;
    const propinaServicio = aplicarPropina ? (subtotalSinImpuestos * 0.10) : 0;
    const total = subtotalSinImpuestos + iva + tarifaEnvio + propinaServicio;

    return {
      subtotal: parseFloat(subtotalSinImpuestos.toFixed(2)),
      tarifaEnvio: parseFloat(tarifaEnvio.toFixed(2)),
      porcentajeIva: porcentajeIva * 100,
      iva: parseFloat(iva.toFixed(2)),
      propinaServicio: parseFloat(propinaServicio.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };
  },

  /**
   * Genera un número de autorización / clave de acceso simulada de 49 dígitos (Estándar SRI Ecuador)
   */
  generarClaveAcceso(ruc, fecha = new Date()) {
    const dia = String(fecha.getDate()).padStart(2, "0");
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const anio = fecha.getFullYear();
    const fechaStr = `${dia}${mes}${anio}`;
    const tipoComprobante = "01"; // 01 = Factura
    const rucEmisor = ruc.padEnd(13, "0").slice(0, 13);
    const tipoAmbiente = "1"; // 1 = Pruebas / 2 = Producción
    const serie = "001001";
    const secuencial = String(Math.floor(100000000 + Math.random() * 900000000)).slice(0, 9);
    const codigoNumerico = "12345678";
    const tipoEmision = "1";

    const base = `${fechaStr}${tipoComprobante}${rucEmisor}${tipoAmbiente}${serie}${secuencial}${codigoNumerico}${tipoEmision}`;
    // Dígito verificador módulo 11
    let suma = 0;
    let factor = 2;
    for (let i = base.length - 1; i >= 0; i--) {
      suma += parseInt(base[i], 10) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    const digitoVerificador = 11 - (suma % 11);
    const dv = (digitoVerificador === 11) ? 0 : (digitoVerificador === 10) ? 1 : digitoVerificador;

    return `${base}${dv}`;
  },

  /**
   * Genera y abre para descarga o impresión el comprobante digital de Factura.
   */
  imprimirFacturaHTML(pedido) {
    const info = (typeof RESTAURANTE_INFO !== "undefined") ? RESTAURANTE_INFO : {
      nombre: "Sabor & Fuego - Restaurante Gourmet",
      ruc: "1391784920001",
      direccion: "Av. Flavio Reyes y Calle 24, Manta",
      telefono: "+593 99 123 4567"
    };

    const claveAcceso = this.generarClaveAcceso(info.ruc, new Date(pedido.created_at?.toDate?.() || Date.now()));
    const numFactura = `001-001-${String(pedido.id || "000001").slice(-9).padStart(9, "0")}`;

    const itemsRows = (pedido.detalles || []).map(item => `
      <tr>
        <td style="text-align:center; padding: 6px; border-bottom: 1px solid #ddd;">${item.cantidad}</td>
        <td style="padding: 6px; border-bottom: 1px solid #ddd;">${item.nombre_producto}</td>
        <td style="text-align:right; padding: 6px; border-bottom: 1px solid #ddd;">$${item.precio_unitario.toFixed(2)}</td>
        <td style="text-align:right; padding: 6px; border-bottom: 1px solid #ddd;">$${item.subtotal.toFixed(2)}</td>
      </tr>
    `).join("");

    const facturaVentana = window.open("", "_blank", "width=850,height=900");
    facturaVentana.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Factura Electrónica #${numFactura}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #222; }
          .header-box { display: flex; justify-content: space-between; border-bottom: 2px solid #e63946; padding-bottom: 15px; }
          .title { color: #e63946; font-size: 22px; font-weight: bold; margin: 0; }
          .datos-empresa, .datos-cliente { font-size: 13px; line-height: 1.5; }
          .factura-box { border: 1px solid #ccc; border-radius: 8px; padding: 12px; background: #fafafa; font-size: 12px; }
          .clave-box { font-family: monospace; font-size: 11px; word-break: break-all; background: #eee; padding: 6px; border-radius: 4px; margin-top: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
          th { background: #1d3557; color: white; padding: 8px; text-align: left; }
          .totales-table { width: 300px; margin-left: auto; margin-top: 15px; font-size: 13px; }
          .btn-print { background: #e63946; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; margin-bottom: 20px; }
          @media print { .no-print { display: none; } body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="text-align: right;">
          <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
        </div>

        <div class="header-box">
          <div class="datos-empresa">
            <h2 class="title">${info.nombre}</h2>
            <p><strong>R.U.C.:</strong> ${info.ruc}<br>
            <strong>Dirección Matriz:</strong> ${info.direccion}<br>
            <strong>Teléfono:</strong> ${info.telefono}<br>
            <strong>Obligado a llevar contabilidad:</strong> SÍ</p>
          </div>
          <div class="factura-box" style="width: 320px;">
            <p><strong>FACTURA ELECTRÓNICA</strong><br>
            <strong>No.:</strong> ${numFactura}<br>
            <strong>Fecha de Emisión:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}<br>
            <strong>Estado SRI:</strong> <span style="color:green; font-weight:bold;">AUTORIZADO</span></p>
            <div><strong>CLAVE DE ACCESO:</strong></div>
            <div class="clave-box">${claveAcceso}</div>
          </div>
        </div>

        <div style="margin-top: 20px; border: 1px solid #ddd; padding: 12px; border-radius: 6px;" class="datos-cliente">
          <table style="margin: 0;">
            <tr>
              <td><strong>Razón Social / Nombres:</strong> ${pedido.factura_datos?.razon_social || pedido.cliente_nombre}</td>
              <td><strong>Identificación:</strong> ${pedido.factura_datos?.identificacion || '9999999999999'}</td>
            </tr>
            <tr>
              <td><strong>Servicio / Ubicación:</strong> ${pedido.tipo_servicio.toUpperCase()} - ${pedido.mesa_o_direccion}</td>
              <td><strong>Forma de Pago:</strong> ${pedido.forma_pago.toUpperCase()}</td>
            </tr>
          </table>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 10%; text-align:center;">Cant.</th>
              <th style="width: 50%;">Descripción / Platillo</th>
              <th style="width: 20%; text-align:right;">Precio Unit.</th>
              <th style="width: 20%; text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <table class="totales-table">
          <tr>
            <td style="padding: 4px;"><strong>SUBTOTAL:</strong></td>
            <td style="text-align:right; padding: 4px;">$${pedido.subtotal.toFixed(2)}</td>
          </tr>
          ${pedido.tarifa_envio > 0 ? `
          <tr>
            <td style="padding: 4px;"><strong>TARIFA SERVICIO/ENVÍO:</strong></td>
            <td style="text-align:right; padding: 4px;">$${pedido.tarifa_envio.toFixed(2)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 4px;"><strong>I.V.A. (15%):</strong></td>
            <td style="text-align:right; padding: 4px;">$${pedido.iva_monto.toFixed(2)}</td>
          </tr>
          <tr style="border-top: 2px solid #222; font-size: 15px;">
            <td style="padding: 6px;"><strong>TOTAL A PAGAR:</strong></td>
            <td style="text-align:right; padding: 6px; font-weight:bold; color:#e63946;">$${pedido.total.toFixed(2)}</td>
          </tr>
        </table>

        <div style="margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 15px; font-size: 11px; text-align: center; color: #666;">
          Documento emitido según los estándares de comprobantes electrónicos del Servicio de Rentas Internas (SRI).<br>
          ¡Gracias por su preferencia en ${info.nombre}!
        </div>
      </body>
      </html>
    `);
    facturaVentana.document.close();
  }
};
