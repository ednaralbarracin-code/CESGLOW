/* i18n.js - Selector de idioma (Español / English)
   El texto en español de la página es la "clave"; este diccionario da su versión en inglés.
   Para añadir un texto nuevo, agrega una línea "español": "english" (JSON válido, sin coma final). */
(function () {
  'use strict';

  var STORAGE_KEY = 'bscLang';
  var EVENT_NAME = 'bsc:languagechange';
  var lang = 'es';

  var EN = {
    "Teléfono (WhatsApp)": "Phone (WhatsApp)",
    "Ej: +1 714 555 1234": "E.g. +1 714 555 1234",
    "Ingresa un número de WhatsApp válido, con código de país": "Enter a valid WhatsApp number, including country code",
    "Todos los campos marcados son obligatorios.": "All required fields must be filled in.",
    "Ingresa un número de WhatsApp válido, con código de país.": "Enter a valid WhatsApp number, including country code.",
    "El horario que tenías seleccionado se acaba de ocupar. Elige otro.": "The time you had selected has just been booked. Please choose another.",
    "Selecciona uno o más servicios:": "Select one or more services:",
    "ocupado": "booked",
    "Selecciona al menos un servicio": "Please select at least one service",
    "Servicios: {0} · Duración total: {1} min": "Services: {0} · Total duration: {1} min",
    "Ya hay una cita agendada en ese horario": "There is already an appointment at that time",
    "Ese horario ya no está disponible. Elige otro.": "That time is no longer available. Please choose another.",
    "Servicio y fecha son obligatorios": "Service and date are required",
    "Servicio no válido": "Invalid service",
    "Fecha inválida": "Invalid date",
    "Limpieza facial básica": "Basic facial cleansing",
    "Limpieza facial profunda": "Deep facial cleansing",
    "Luxury facial": "Luxury facial",
    "Tratamiento de acné": "Acne treatment",
    "Tratamiento de manchas": "Dark spot treatment",
    "Rejuvenecimiento": "Rejuvenation",
    "Peelling Químico": "Chemical peel",
    "Depilación": "Waxing",
    "Precio según área": "Price depends on area",
    "Reductores": "Body contouring",
    "Celulitis": "Cellulite treatment",
    "Posoperatorio": "Post-surgery care",
    "Tonificación": "Body toning",
    "Peelling de algas natural": "Natural seaweed peel",
    "CESGLOW | Cuidado Profesional de la Piel": "CESGLOW | Professional Skin Care",
    "Clic aquí para ver imágenes": "Click here to see images",
    "En CESGLOW creemos que la belleza comienza con el autocuidado y el autorespeto. Somos un equipo de profesionales apasionados por la estética facial y corporal, comprometidos con proporcionar experiencias transformadoras que combinan bienestar, ciencia y elegancia.": "At CESGLOW we believe beauty begins with self-care and self-respect. We are a team of professionals passionate about facial and body aesthetics, committed to providing transformative experiences that combine wellness, science and elegance.",
    "Lun - Sáb: 9:00 AM - 5:00 PM": "Mon - Sat: 9:00 AM - 5:00 PM",
    "© 2024 CESGLOW. Todos los derechos reservados.": "© 2024 CESGLOW. All rights reserved.",
    "Beauty & Skin Care - BSC | Cuidado Profesional de la Piel": "Beauty & Skin Care - BSC | Professional Skin Care",
    "Inicio": "Home",
    "Servicios": "Services",
    "Nosotros": "About Us",
    "Trabajos": "Our Work",
    "Reservas": "Booking",
    "Contacto": "Contact",
    "Una Experiencia de Servicio Completa": "A Complete Service Experience",
    "Descubre una experiencia única de cuidado de la piel diseñada para realzar tu belleza natural y hacerte sentir radiante.": "Discover a unique skin care experience designed to enhance your natural beauty and make you feel radiant.",
    "Reservar Cita": "Book an Appointment",
    "Ver Servicios": "View Services",
    "Nuestros Servicios": "Our Services",
    "Descubre nuestros tratamientos especializados diseñados para cuidar y rejuvenecer tu piel.": "Discover our specialized treatments designed to care for and rejuvenate your skin.",
    "Tratamientos Corporales": "Body Treatments",
    "Tratamientos corporales avanzados que esculpen, tonifican y rejuvenecen tu cuerpo utilizando las técnicas más innovadoras del mercado estético.": "Advanced body treatments that sculpt, tone and rejuvenate your body using the most innovative techniques in the aesthetic market.",
    "Tratamientos Faciales": "Facial Treatments",
    "Faciales personalizados que hidratan, nutren y restauran la luminosidad natural de tu rostro. Adaptados a tus necesidades específicas de piel.": "Customized facials that hydrate, nourish and restore your face's natural glow. Tailored to your specific skin needs.",
    "Mascarillas Faciales": "Facial Masks",
    "Mascarillas faciales especializadas con ingredientes premium que proporcionan beneficios intensivos para diferentes tipos y preocupaciones de la piel.": "Specialized facial masks with premium ingredients that deliver intensive benefits for different skin types and concerns.",
    "Resultados Visibles": "Visible Results",
    "Productos Naturales": "Natural Products",
    "Atención Personalizada": "Personalized Care",
    "Sobre Nosotros": "About Us",
    "En Beauty & Skin Care creemos que la belleza comienza con el autocuidado y el autorespeto. Somos un equipo de profesionales apasionados por la estética facial y corporal, comprometidos con proporcionar experiencias transformadoras que combinan bienestar, ciencia y elegancia.": "At Beauty & Skin Care we believe beauty begins with self-care and self-respect. We are a team of professionals passionate about facial and body aesthetics, committed to providing transformative experiences that combine wellness, science and elegance.",
    "Cada tratamiento que ofrecemos está diseñado pensando en ti, utilizando las últimas técnicas, productos de alta calidad y un enfoque personalizado que resalta tu belleza natural y aumenta tu confianza.": "Every treatment we offer is designed with you in mind, using the latest techniques, high-quality products and a personalized approach that highlights your natural beauty and boosts your confidence.",
    "Nuestra Misión:": "Our Mission:",
    "Inspirar confianza, armonía y empoderamiento a través del arte del cuidado estético.": "To inspire confidence, harmony and empowerment through the art of aesthetic care.",
    "Nuestra Visión:": "Our Vision:",
    "Convertirnos en tu espacio de referencia para renovar tu cuerpo, mente y piel con resultados visibles y experiencias memorables.": "To become your go-to space for renewing your body, mind and skin with visible results and memorable experiences.",
    "Tu Espacio de Belleza": "Your Beauty Space",
    "Nuestro Trabajo": "Our Work",
    "Descubre algunos de nuestros tratamientos y resultados.": "Discover some of our treatments and results.",
    "Tratamiento Facial": "Facial Treatment",
    "Cuidado de la Piel": "Skin Care",
    "Cuidado Profesional": "Professional Care",
    "Relajación": "Relaxation",
    "Experiencia Única": "Unique Experience",
    "Tratamiento Corporal": "Body Treatment",
    "Resultados Excepcionales": "Exceptional Results",
    "Cuidado de Belleza": "Beauty Care",
    "Confianza y Belleza": "Confidence and Beauty",
    "Depilación con cera": "Wax Hair Removal",
    "Tratamientos de acné": "Acne Treatments",
    "Piel más suave y estética": "Softer, more aesthetic skin",
    "¿Por Qué Elegirnos?": "Why Choose Us?",
    "Compromiso con la excelencia y tu satisfacción.": "Commitment to excellence and your satisfaction.",
    "Tecnología de Punta": "Cutting-Edge Technology",
    "Utilizamos el equipo más avanzado y técnicas innovadoras del mercado estético.": "We use the most advanced equipment and innovative techniques in the aesthetic market.",
    "Expertos Calificados": "Qualified Experts",
    "Nuestro equipo de profesionales altamente capacitados personaliza cada tratamiento.": "Our team of highly trained professionals personalizes every treatment.",
    "Comprometidos a entregar resultados duraderos que realzan tu belleza natural.": "Committed to delivering lasting results that enhance your natural beauty.",
    "Atmósfera Relajante": "Relaxing Atmosphere",
    "Un espacio profesional diseñado para tu comodidad y relajación total.": "A professional space designed for your comfort and total relaxation.",
    "Reserva Tu Cita": "Book Your Appointment",
    "Selecciona la fecha y hora que prefieras para tu tratamiento.": "Choose the date and time you prefer for your treatment.",
    "Dom": "Sun", "Lun": "Mon", "Mar": "Tue", "Mié": "Wed", "Jue": "Thu", "Vie": "Fri", "Sáb": "Sat",
    "Selecciona una fecha": "Select a date",
    "🕐 Horario de Atención": "🕐 Business Hours",
    "Lun - Mié: 9:00 AM - 6:00 PM": "Mon - Wed: 9:00 AM - 6:00 PM",
    "Jue - Vie: 9:00 AM - 5:00 PM": "Thu - Fri: 9:00 AM - 5:00 PM",
    "Sábados: 11:00 AM - 5:00 PM": "Saturdays: 11:00 AM - 5:00 PM",
    "Domingos: Cerrado": "Sundays: Closed",
    "Contáctanos": "Contact Us",
    "Estamos aquí para ayudarte a programar tu próxima sesión de cuidado de la piel.": "We're here to help you schedule your next skin care session.",
    "Teléfono": "Phone",
    "Correo Electrónico": "Email",
    "Nuestra Ubicación": "Our Location",
    "Reservar Tu Cita": "Book Your Appointment",
    "Síguenos en Redes Sociales": "Follow Us on Social Media",
    "© 2024 Beauty & Skin Care - BSC. Todos los derechos reservados.": "© 2024 Beauty & Skin Care - BSC. All rights reserved.",
    "Creado por MiniMax Agent": "Created by MiniMax Agent",
    "Iniciar Sesión": "Log In",
    "Registrarse": "Sign Up",
    "Bienvenido de Nuevo": "Welcome Back",
    "Ingresa tus credenciales para acceder a tu cuenta": "Enter your credentials to access your account",
    "Contraseña": "Password",
    "Recordarme": "Remember me",
    "¿Olvidaste tu contraseña?": "Forgot your password?",
    "Crear Cuenta": "Create Account",
    "Regístrate para disfrutar de nuestros servicios": "Sign up to enjoy our services",
    "Nombre": "First Name",
    "Apellido": "Last Name",
    "Teléfono (opcional)": "Phone (optional)",
    "Confirmar Contraseña": "Confirm Password",
    "Acepto los": "I accept the",
    "términos y condiciones": "terms and conditions",
    "tu@email.com": "you@email.com",
    "Tu nombre": "Your first name",
    "Tu apellido": "Your last name",
    "Tu número de teléfono": "Your phone number",
    "Mínimo 6 caracteres": "Minimum 6 characters",
    "Repite tu contraseña": "Repeat your password",
    "Lo que dicen nuestras clientas": "What Our Clients Say",
    "Experiencias reales de personas que confían en nosotros": "Real experiences from people who trust us",
    "Cargando reseñas...": "Loading reviews...",
    "Reseñar en Google": "Review us on Google",
    "⭐ Dejar reseña en el sitio": "⭐ Leave a review on our site",
    "✍️ Deja tu reseña": "✍️ Leave your review",
    "Debes iniciar sesión para dejar una reseña.": "You must log in to leave a review.",
    "¿Cómo calificarías tu experiencia?": "How would you rate your experience?",
    "Tu comentario": "Your comment",
    "Cuéntanos tu experiencia...": "Tell us about your experience...",
    "Enviar Reseña": "Submit Review",
    "Usuario": "User",
    "Mis Citas": "My Appointments",
    "📋 Mis Citas": "📋 My Appointments",
    "Cerrar Sesión": "Log Out",
    "Enero": "January", "Febrero": "February", "Marzo": "March", "Abril": "April", "Mayo": "May", "Junio": "June",
    "Julio": "July", "Agosto": "August", "Septiembre": "September", "Octubre": "October", "Noviembre": "November", "Diciembre": "December",
    "pendiente": "pending", "confirmada": "confirmed", "completada": "completed", "cancelada": "cancelled",
    "¡Bienvenido de nuevo, {0}!": "Welcome back, {0}!",
    "Error al iniciar sesión": "Login error",
    "Error de conexión. Por favor, inténtalo de nuevo.": "Connection error. Please try again.",
    "Las contraseñas no coinciden": "Passwords do not match",
    "La contraseña debe tener al menos 6 caracteres": "Password must be at least 6 characters long",
    "¡Cuenta creada exitosamente! Bienvenido a CESGLOW.": "Account created successfully! Welcome to CESGLOW.",
    "Error al registrar usuario": "Error creating account",
    "Sesión cerrada correctamente": "Logged out successfully",
    "¡Cita agendada exitosamente! Te esperamos.": "Appointment booked successfully! We look forward to seeing you.",
    "¡Cita Confirmada!": "Appointment Confirmed!",
    "Tu cita fue agendada para el": "Your appointment was booked for",
    "a las": "at",
    "Agendar otra cita": "Book another appointment",
    "Error al agendar la cita": "Error booking the appointment",
    "Error de conexión. Intenta de nuevo.": "Connection error. Please try again.",
    "General": "General",
    "Fecha:": "Date:",
    "Selecciona un servicio:": "Select a service:",
    "Hora": "Time",
    "Notas (opcional)": "Notes (optional)",
    "Ej: tengo piel sensible...": "E.g. I have sensitive skin...",
    "Confirmar Cita": "Confirm Appointment",
    "Cargando citas...": "Loading appointments...",
    "No tienes citas agendadas aún.": "You have no booked appointments yet.",
    "min": "min",
    "Cancelar cita": "Cancel appointment",
    "Cancelando...": "Cancelling...",
    "Cita cancelada correctamente": "Appointment cancelled successfully",
    "Error al cargar las citas.": "Error loading appointments.",
    "Fecha seleccionada:": "Selected date:",
    "Por favor inicia sesión para agendar tu cita": "Please log in to book your appointment",
    "Sé la primera en dejar una reseña ⭐": "Be the first to leave a review ⭐",
    "No se pudieron cargar las reseñas.": "Could not load reviews.",
    "Por favor selecciona una calificación con estrellas": "Please select a star rating",
    "¡Reseña enviada! Será publicada pronto. Gracias 🙏": "Review submitted! It will be published soon. Thank you 🙏",
    "Error al enviar la reseña": "Error submitting the review",
    "Cita agendada": "Appointment booked",
    "Serás redirigido a WhatsApp para confirmar tu medio de pago y tu abono de 50 dólares.": "You will be redirected to WhatsApp to confirm your payment method and your $50 deposit.",
    "Redirigiendo en {0}...": "Redirecting in {0}...",
    "Ir a WhatsApp ahora": "Go to WhatsApp now",
    "Cancelar": "Cancel",
    "Cancelación con menos de 24 horas": "Cancellation with less than 24 hours notice",
    "Según nuestros términos y condiciones, al cancelar la cita con menos de 24 horas de anticipación se perderá su abono de 50 dólares.": "According to our terms and conditions, if you cancel your appointment with less than 24 hours notice, you will lose your $50 deposit.",
    "Cancelar de todos modos": "Cancel anyway",
    "Mantener mi cita": "Keep my appointment",
    "Cita cancelada": "Appointment cancelled",
    "Comuníquese por WhatsApp para solicitar el reembolso de su abono.": "Please contact us on WhatsApp to request a refund of your deposit.",
    "Ir a WhatsApp": "Go to WhatsApp",
    "Cerrar": "Close",
    "Borrar cuenta": "Delete account",
    "y la": "and the",
    "política de tratamiento de datos": "data processing policy",
    "Términos y condiciones": "Terms and conditions",
    "Política de tratamiento de datos": "Data processing policy",
    "¡Reseña enviada! Gracias 🙏": "Review submitted! Thank you 🙏",
    "Tu cuenta no está activa. Inicia sesión con una cuenta válida.": "Your account is not active. Please log in with a valid account.",
    "Tu sesión expiró. Inicia sesión de nuevo.": "Your session expired. Please log in again.",
    "Ya dejaste una reseña:": "You already left a review:",
    "Borrar mi reseña": "Delete my review",
    "Borrar reseña": "Delete review",
    "¿Seguro que quieres borrar tu reseña? Esta acción no se puede deshacer.": "Are you sure you want to delete your review? This action cannot be undone.",
    "Sí, borrar": "Yes, delete",
    "Tu reseña fue eliminada": "Your review was deleted",
    "No tienes una reseña para borrar": "You don't have a review to delete",
    "Error al borrar la reseña": "Error deleting the review"
  };

  // Normaliza espacios y el selector de emoji para que las claves coincidan siempre
  function norm(s) { return String(s).replace(/\uFE0F/g, '').replace(/\s+/g, ' ').trim(); }

  var DICT = {};
  Object.keys(EN).forEach(function (k) { DICT[norm(k)] = EN[k]; });

  /* t('texto en español', arg0, arg1...) -> texto en el idioma activo.
     Úsala en JavaScript para textos que se generan dinámicamente. */
  window.t = function (text) {
    var out = (lang === 'en' && DICT[norm(text)]) ? DICT[norm(text)] : text;
    for (var i = 1; i < arguments.length; i++) out = out.split('{' + (i - 1) + '}').join(arguments[i]);
    return out;
  };
  window.getLang = function () { return lang; };
  window.getLocale = function () { return lang === 'en' ? 'en-US' : 'es-ES'; };

  var originals = new WeakMap();
  var titleEs = '';

  function translateTextNode(node) {
    var orig = originals.has(node) ? originals.get(node) : node.nodeValue;
    var translated = DICT[norm(orig)];
    if (!translated) return;
    originals.set(node, orig);
    node.nodeValue = lang === 'en'
      ? orig.match(/^\s*/)[0] + translated + orig.match(/\s*$/)[0]
      : orig;
  }

  function applyStatic() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('.lang-overlay, .lang-switcher')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(translateTextNode);

    ['placeholder', 'alt'].forEach(function (attr) {
      document.querySelectorAll('[' + attr + ']').forEach(function (el) {
        var store = 'orig' + attr;
        if (el.dataset[store] === undefined) el.dataset[store] = el.getAttribute(attr);
        var tr = DICT[norm(el.dataset[store])];
        el.setAttribute(attr, (lang === 'en' && tr) ? tr : el.dataset[store]);
      });
    });
  }

  function setLanguage(newLang, notify) {
    lang = newLang;
    document.documentElement.lang = newLang;
    document.title = (newLang === 'en' && DICT[norm(titleEs)]) ? DICT[norm(titleEs)] : titleEs;
    applyStatic();
    document.querySelectorAll('.lang-switch-btn').forEach(function (b) {
      var on = b.dataset.lang === newLang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (notify) document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { lang: newLang } }));
  }

  function showOverlay() {
    document.documentElement.classList.remove('lang-chosen');
    document.body.style.overflow = 'hidden';
    var first = document.querySelector('.lang-overlay .lang-btn');
    if (first) first.focus();
  }

  function hideOverlay() {
    document.documentElement.classList.add('lang-chosen');
    document.body.style.overflow = '';
  }

  function choose(newLang) {
    try { localStorage.setItem(STORAGE_KEY, newLang); } catch (e) {}
    setLanguage(newLang, true);
    hideOverlay();
  }

  document.addEventListener('DOMContentLoaded', function () {
    titleEs = document.title;
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () { choose(btn.dataset.lang); });
    });
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved === 'es' || saved === 'en') {
      setLanguage(saved, false);
      hideOverlay();
    } else {
      setLanguage('es', false);
      showOverlay();
    }
  });
})();
