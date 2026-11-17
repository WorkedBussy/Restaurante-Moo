/**
 * ============================================================================
 * CAPA 1: CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE Y SERVICIOS EN LA NUBE
 * ============================================================================
 * Este archivo se carga SIEMPRE primero en todas las páginas HTML.
 * Provee la conexión centralizada a Firebase (Auth, Firestore, Storage)
 * y la integración con Cloudinary (almacenamiento gratuito de imágenes).
 */

// ── 1. CREDENCIALES DE TU PROYECTO FIREBASE ────────────────────────────────
// Copia estos datos desde: Firebase Console -> Configuración del proyecto -> Tus apps (Web </>)
const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "restaurante-moo.firebaseapp.com",
  projectId: "restaurante-moo",
  storageBucket: "restaurante-moo.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};

// ── 2. INICIALIZAR FIREBASE (Garantizar Singleton) ──────────────────────────
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// ── 3. EXPOSICIÓN DE CLIENTES GLOBALES ─────────────────────────────────────
// Disponibles globalmente para todas las capas posteriores (auth.js, db.js, vistas)
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ── 4. CONFIGURACIÓN DE CLOUDINARY (ALTERNATIVA GRATIS SIN TARJETA) ─────────
// Resuelve la limitación de plan Blaze en proyectos nuevos de Firebase Storage
const CLOUDINARY_CONFIG = {
  cloudName: "dks8d7xqa", // Reemplazar con tu Cloud Name de Cloudinary (o usar el default)
  uploadPreset: "restaurante_preset" // Preset unsigned para subidas desde el navegador
};

// ── 5. CONSTANTES GLOBALES DE NEGOCIO DEL RESTAURANTE ──────────────────────
const RESTAURANTE_INFO = {
  nombre: "Sabor & Fuego - Restaurante Gourmet",
  ruc: "1391784920001",
  direccion: "Av. Flavio Reyes y Calle 24, Manta - Ecuador",
  telefono: "+593 99 123 4567",
  email: "contacto@saboryfuego.com",
  ivaPorcentaje: 0.15, // Tarifa vigente Ecuador (15%)
  costoEnvioBase: 2.00
};
