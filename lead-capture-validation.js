(() => {
  'use strict';

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
  const nameMessage = 'Ingresá tu nombre real para poder contactarte.';
  const phoneMessage = 'Ingresá un WhatsApp válido para enviarte la propuesta.';

  const normalizeText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

  const isSequentialNumber = (digits) => {
    if (digits.length < 8) return false;
    return '01234567890123456789'.includes(digits)
      || '98765432109876543210'.includes(digits);
  };

  const invalidate = (input, status, message) => {
    input.setCustomValidity(message);
    status.textContent = message;
    input.focus();
    input.reportValidity();
  };

  const validateForm = (form) => {
    const nameInput = form.elements.name;
    const phoneInput = form.elements.phone;
    const status = form.querySelector('.lead-form__status');

    if (!nameInput || !phoneInput || !status) return true;

    nameInput.setCustomValidity('');
    phoneInput.setCustomValidity('');
    status.textContent = '';

    const normalizedName = normalizeText(nameInput.value);
    if (normalizedName.length < 2 || invalidNames.has(normalizedName)) {
      invalidate(nameInput, status, nameMessage);
      return false;
    }

    const rawPhone = String(phoneInput.value || '').trim();
    const digits = rawPhone.replace(/\D/g, '');
    const fallbackDigits = String(
      window.LEAD_CAPTURE_CONFIG?.WHATSAPP_FALLBACK_NUMBER || ''
    ).replace(/\D/g, '');
    const hasReasonableCharacters = /^\+?[\d\s().-]+$/.test(rawPhone);
    const isRepeatedDigit = /^(\d)\1+$/.test(digits);
    const isKnownTestNumber = digits === '1123456789';
    const matchesFallback = Boolean(fallbackDigits) && digits === fallbackDigits;

    if (
      !hasReasonableCharacters
      || digits.length < 8
      || digits.length > 15
      || isRepeatedDigit
      || isSequentialNumber(digits)
      || isKnownTestNumber
      || matchesFallback
    ) {
      invalidate(phoneInput, status, phoneMessage);
      return false;
    }

    return true;
  };

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('.lead-form')) return;
    if (validateForm(form)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.matches('.lead-form input[name="name"], .lead-form input[name="phone"]')) return;

    input.setCustomValidity('');
    const status = input.closest('.lead-form')?.querySelector('.lead-form__status');
    if (status) status.textContent = '';
  });
})();
