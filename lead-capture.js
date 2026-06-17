(() => {
  'use strict';

  const config = Object.assign({
    LEAD_WEBHOOK_URL: '',
    WHATSAPP_FALLBACK_NUMBER: ''
  }, window.LEAD_CAPTURE_CONFIG || {});
  const META_PIXEL_ID = '1203270370917813';

  const pathModels = {
    '/volkswagen/amarok': ['Volkswagen', 'Amarok'],
    '/volkswagen/tera': ['Volkswagen', 'Tera'],
    '/volkswagen/taos': ['Volkswagen', 'Taos'],
    '/volkswagen/nivus': ['Volkswagen', 'Nivus'],
    '/volkswagen/tcross': ['Volkswagen', 'T-Cross'],
    '/peugeot/partner': ['Peugeot', 'Partner'],
    '/peugeot/208': ['Peugeot', '208'],
    '/peugeot/2008': ['Peugeot', '2008'],
    '/fiat/cronos': ['Fiat', 'Cronos'],
    '/fiat/titano': ['Fiat', 'Titano'],
    '/fiat/mobi': ['Fiat', 'Mobi']
  };

  const normalizePath = (value) => value
    .replace(/\/index\.html$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  const currentPath = normalizePath(window.location.pathname);
  const matchedPath = Object.keys(pathModels).find((path) => currentPath.endsWith(path));
  const pageData = matchedPath ? pathModels[matchedPath] : null;
  const firstTaggedCta = document.querySelector('[data-brand][data-model]');
  const brand = document.body.dataset.brand || firstTaggedCta?.dataset.brand || pageData?.[0] || '';
  const model = document.body.dataset.model || firstTaggedCta?.dataset.model || pageData?.[1] || document.querySelector('h1')?.textContent.trim() || '';

  if (!brand || !model) return;

  const contentName = `${brand} ${model}`;
  const contentId = contentName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const vehicleContent = {
    content_name: contentName,
    content_category: brand,
    content_type: 'vehicle',
    content_ids: [contentId]
  };

  let modal;
  let previousFocus;
  let leadContext = 'landing_cta';

  const track = (eventName, params, custom = false, options) => {
    if (typeof window.fbq !== 'function') return;
    const command = custom ? 'trackCustom' : 'track';
    if (options) {
      window.fbq(command, eventName, params, options);
    } else {
      window.fbq(command, eventName, params);
    }
  };

  const createLeadEventId = () => `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const initializeMetaPixel = () => {
    if (window.__MODEL_META_PIXEL_INITIALIZED__) return;
    window.__MODEL_META_PIXEL_INITIALIZED__ = true;

    if (typeof window.fbq !== 'function') {
      !function(f,b,e,v,n,t,s) {
        if (f.fbq) return;
        n = f.fbq = function() {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = '2.0';
        n.queue = [];
        t = b.createElement(e);
        t.async = true;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    }

    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
    window.fbq('track', 'ViewContent', vehicleContent);
  };

  const getUtm = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
      utm_medium: params.get('utm_medium') || ''
    };
  };

  const invalidNames = new Set([
    'john doe',
    'jane doe',
    'test',
    'prueba',
    'nn',
    'n/n',
    'asdf',
    'qwerty',
    'nombre',
    'sin nombre'
  ]);
  const nameValidationMessage = 'Ingresá tu nombre real para poder contactarte.';
  const phoneValidationMessage = 'Ingresá un WhatsApp válido para enviarte la propuesta.';

  const normalizeText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

  const isSequentialPhone = (digits) => {
    if (digits.length < 8) return false;
    return '01234567890123456789'.includes(digits)
      || '98765432109876543210'.includes(digits);
  };

  const validateLeadFields = (form, status) => {
    const nameInput = form.elements.name;
    const phoneInput = form.elements.phone;
    const normalizedName = normalizeText(nameInput.value);
    const rawPhone = String(phoneInput.value || '').trim();
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const fallbackDigits = String(config.WHATSAPP_FALLBACK_NUMBER || '').replace(/\D/g, '');

    nameInput.setCustomValidity('');
    phoneInput.setCustomValidity('');

    if (normalizedName.length < 2 || invalidNames.has(normalizedName)) {
      nameInput.setCustomValidity(nameValidationMessage);
      status.textContent = nameValidationMessage;
      nameInput.focus();
      nameInput.reportValidity();
      return false;
    }

    const hasReasonableCharacters = /^\+?[\d\s().-]+$/.test(rawPhone);
    const isRepeatedDigit = /^(\d)\1+$/.test(phoneDigits);
    const isKnownTestNumber = phoneDigits === '1123456789';
    const matchesFallback = Boolean(fallbackDigits) && phoneDigits === fallbackDigits;

    if (
      !hasReasonableCharacters
      || phoneDigits.length < 8
      || phoneDigits.length > 15
      || isRepeatedDigit
      || isSequentialPhone(phoneDigits)
      || isKnownTestNumber
      || matchesFallback
    ) {
      phoneInput.setCustomValidity(phoneValidationMessage);
      status.textContent = phoneValidationMessage;
      phoneInput.focus();
      phoneInput.reportValidity();
      return false;
    }

    return true;
  };

  const getModalMarkup = () => `
    <div class="lead-modal" hidden>
      <div class="lead-modal__backdrop" data-lead-close></div>
      <section class="lead-modal__panel" role="dialog" aria-modal="true" aria-labelledby="leadModalTitle">
        <button class="lead-modal__close" type="button" aria-label="Cerrar" data-lead-close>&times;</button>
        <div class="lead-modal__form-view">
          <p class="lead-modal__eyebrow">${brand} ${model}</p>
          <h2 id="leadModalTitle">Solicitá una propuesta</h2>
          <p class="lead-modal__intro">Dejanos tus datos y un asesor comercial se pondrá en contacto para informarte condiciones y disponibilidad.</p>
          <form class="lead-form" novalidate>
            <label>Nombre<input name="name" type="text" autocomplete="name" required /></label>
            <label>WhatsApp<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required /></label>
            <fieldset>
              <legend>Forma de compra</legend>
              <label class="lead-form__choice"><input name="purchaseMethod" type="radio" value="anticipo" required /> Anticipo</label>
              <label class="lead-form__choice"><input name="purchaseMethod" type="radio" value="usado_en_parte_de_pago" /> Usado en parte de pago</label>
              <label class="lead-form__choice"><input name="purchaseMethod" type="radio" value="quiero_asesoramiento" /> Quiero asesoramiento</label>
            </fieldset>
            <button class="lead-form__submit" type="submit">Quiero que me contacten</button>
            <p class="lead-form__status" role="status" aria-live="polite"></p>
          </form>
        </div>
        <div class="lead-modal__success" hidden>
          <p class="lead-modal__eyebrow">Consulta recibida</p>
          <h2>Gracias por contactarnos</h2>
          <p>Registramos tu solicitud por ${brand} ${model}. Un asesor comercial se comunicará con vos.</p>
          <a class="lead-modal__whatsapp" data-lead-whatsapp target="_blank" rel="noopener">Escribir también por WhatsApp</a>
        </div>
      </section>
    </div>`;

  const ensureModal = () => {
    if (modal) return modal;
    document.body.insertAdjacentHTML('beforeend', getModalMarkup());
    modal = document.querySelector('.lead-modal');
    modal.querySelectorAll('[data-lead-close]').forEach((element) => element.addEventListener('click', closeModal));
    const form = modal.querySelector('.lead-form');
    form.addEventListener('submit', submitLead);
    form.querySelectorAll('input[name="name"], input[name="phone"]').forEach((input) => {
      input.addEventListener('input', () => {
        input.setCustomValidity('');
        form.querySelector('.lead-form__status').textContent = '';
      });
    });
    modal.querySelector('[data-lead-whatsapp]').addEventListener('click', () => {
      track('WhatsAppClick', {
        ...vehicleContent,
        source: 'post_lead_whatsapp'
      }, true);
    });
    return modal;
  };

  function openModal(source) {
    leadContext = source || 'landing_cta';
    const element = ensureModal();
    previousFocus = document.activeElement;
    element.hidden = false;
    document.body.classList.add('lead-modal-open');
    element.querySelector('.lead-modal__form-view').hidden = false;
    element.querySelector('.lead-modal__success').hidden = true;
    element.querySelector('.lead-form__status').textContent = '';
    element.querySelector('input[name="name"]').focus();
    track('Contact', {
      ...vehicleContent,
      source: 'lead_modal_open'
    });
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('lead-modal-open');
    previousFocus?.focus?.();
  }

  async function submitLead(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('.lead-form__status');
    const button = form.querySelector('.lead-form__submit');
    if (!validateLeadFields(form, status) || !form.reportValidity()) return;

    const data = new FormData(form);
    const timestamp = new Date().toISOString();
    const lead = {
      name: String(data.get('name') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      brand,
      model,
      purchaseIntent: String(data.get('purchaseMethod') || ''),
      source: leadContext,
      url: window.location.href,
      ...getUtm(),
      userAgent: window.navigator.userAgent,
      date: timestamp,
      fecha: timestamp
    };

    button.disabled = true;
    button.textContent = 'Enviando...';
    status.textContent = '';

    let webhookConfirmed = false;

    try {
      if (config.LEAD_WEBHOOK_URL) {
        const response = await fetch(config.LEAD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(lead)
        });

        let result;
        try {
          result = await response.json();
        } catch (parseError) {
          throw new Error(`El servidor respondió con un formato inválido (${response.status})`);
        }

        if (!response.ok || result?.ok !== true) {
          const detail = result?.error || result?.message || `HTTP ${response.status}`;
          throw new Error(`El servidor no confirmó el lead: ${detail}`);
        }
        webhookConfirmed = true;
      } else {
        console.info('[Lead capture] LEAD_WEBHOOK_URL vacío. Lead registrado localmente:', lead);
      }

      if (webhookConfirmed) {
        const leadEventId = createLeadEventId();
        track('Lead', {
          ...vehicleContent,
          lead_source: 'google_sheets_form'
        }, false, {
          eventID: leadEventId
        });
      }
      modal.querySelector('.lead-modal__form-view').hidden = true;
      modal.querySelector('.lead-modal__success').hidden = false;

      const whatsapp = modal.querySelector('[data-lead-whatsapp]');
      if (config.WHATSAPP_FALLBACK_NUMBER) {
        const message = `Hola, ya envié mis datos. Quiero consultar por ${brand} ${model}.`;
        whatsapp.href = `https://wa.me/${config.WHATSAPP_FALLBACK_NUMBER}?text=${encodeURIComponent(message)}`;
        whatsapp.hidden = false;
      } else {
        whatsapp.hidden = true;
      }
      form.reset();
    } catch (error) {
      console.error('[Lead capture] No se pudo guardar el lead:', { error, lead });
      status.textContent = 'No pudimos guardar tu consulta. Revisá tu conexión e intentá nuevamente.';
    } finally {
      button.disabled = false;
      button.textContent = 'Quiero que me contacten';
    }
  }

  const replaceInlineForms = () => {
    document.querySelectorAll('.partner-mini-form').forEach((form) => {
      form.classList.add('is-lead-capture-replaced');
      form.innerHTML = '<button class="partner-btn primary lead-inline-trigger" type="button">Quiero que me contacten</button>';
      form.querySelector('button').addEventListener('click', () => openModal('final_section'));
    });
  };

  const updateCtaLabel = (link) => {
    if (link.classList.contains('partner-wa')) link.textContent = 'Quiero que me contacten';
    if (link.classList.contains('ghost')) link.textContent = 'Consultar condiciones vigentes';
    if (link.classList.contains('primary') && link.closest('.partner-hero')) link.textContent = 'Solicitar propuesta';
    if (link.closest('.partner-offer-card')) link.textContent = 'Solicitar propuesta';
    if (link.classList.contains('whatsapp-float')) {
      const label = link.querySelector('span:last-child');
      if (label) label.textContent = 'Consultar condiciones vigentes';
    }
  };

  const createFloatingWhatsAppButton = () => {
    if (!config.WHATSAPP_FALLBACK_NUMBER || window.__MODEL_WHATSAPP_FLOAT_INITIALIZED__) return;
    window.__MODEL_WHATSAPP_FLOAT_INITIALIZED__ = true;

    const message = `Hola, quiero consultar por ${brand} ${model}. ¿Me pasan una propuesta?`;
    const button = document.createElement('a');
    button.className = 'model-whatsapp-float';
    button.href = `https://wa.me/${config.WHATSAPP_FALLBACK_NUMBER}?text=${encodeURIComponent(message)}`;
    button.target = '_blank';
    button.rel = 'noopener';
    button.setAttribute('aria-label', `Consultar por WhatsApp sobre ${brand} ${model}`);
    button.innerHTML = `
      <svg class="model-whatsapp-float__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20.5 11.8a8.4 8.4 0 0 1-12.4 7.4L4 20.5l1.3-4a8.4 8.4 0 1 1 15.2-4.7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9 8.2c.2-.5.4-.5.8-.5h.3c.2 0 .4.1.5.4l.8 1.8c.1.3 0 .5-.2.7l-.6.7c-.2.2-.1.4 0 .6.5.9 1.2 1.6 2.1 2.1.2.1.4.2.6 0l.8-1c.2-.2.4-.3.7-.2l1.8.9c.3.1.4.3.4.5 0 .4-.2 1.2-.6 1.6-.4.5-1.2.8-2 .8-1.1 0-2.5-.5-4.2-2-2-1.7-3.1-3.9-3-5.1 0-.5.2-1 .5-1.3.2-.2.3-.3.4-.3Z" fill="currentColor"/>
      </svg>
      <span class="model-whatsapp-float__label">WhatsApp</span>`;
    button.addEventListener('click', () => {
      track('WhatsAppClick', {
        ...vehicleContent,
        source: 'floating_whatsapp_button'
      }, true);
    });
    document.body.appendChild(button);
  };

  const prepareCtas = () => {
    document.querySelectorAll("a[href*='wa.me'], a[href*='api.whatsapp.com'], a[href='#solicitar-propuesta']").forEach((link) => {
      link.dataset.leadOriginalLabel = link.textContent.trim();
      link.href = '#solicitar-propuesta';
      link.removeAttribute('target');
      link.removeAttribute('rel');
      updateCtaLabel(link);
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const source = link.classList.contains('partner-wa') ? 'header_cta'
          : link.closest('.partner-hero') ? 'hero_cta'
          : link.closest('.partner-intro') ? 'quick_spec_cta'
          : link.closest('.partner-offer-card') ? 'offer_card_cta'
          : link.classList.contains('whatsapp-float') ? 'floating_cta'
          : 'landing_cta';
        openModal(source);
      });
    });
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
  });

  initializeMetaPixel();
  prepareCtas();
  replaceInlineForms();
  createFloatingWhatsAppButton();
})();
