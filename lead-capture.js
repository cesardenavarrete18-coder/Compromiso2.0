(() => {
  'use strict';

  const config = Object.assign({
    LEAD_WEBHOOK_URL: '',
    WHATSAPP_FALLBACK_NUMBER: ''
  }, window.LEAD_CAPTURE_CONFIG || {});

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

  let modal;
  let previousFocus;
  let leadContext = 'landing_cta';

  const track = (eventName, params, custom = false) => {
    if (typeof window.fbq === 'function') window.fbq(custom ? 'trackCustom' : 'track', eventName, params);
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
            <label class="lead-form__consent">
              <input name="consent" type="checkbox" required />
              <span>Acepto ser contactado por un asesor comercial para recibir información sobre vehículos, financiación, disponibilidad, cuotas y condiciones vigentes.</span>
            </label>
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
    modal.querySelector('.lead-form').addEventListener('submit', submitLead);
    modal.querySelector('[data-lead-whatsapp]').addEventListener('click', () => {
      track('WhatsAppClick', { content_name: model, content_category: brand }, true);
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
    track('Contact', { content_name: model, content_category: brand, source: leadContext });
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
    if (!form.reportValidity()) return;

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
      } else {
        console.info('[Lead capture] LEAD_WEBHOOK_URL vacío. Lead registrado localmente:', lead);
      }

      track('Lead', { content_name: model, content_category: brand });
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

  prepareCtas();
  replaceInlineForms();
})();