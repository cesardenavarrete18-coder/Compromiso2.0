const phone = '5491141667220';
const baseMsg = 'Hola, quiero recibir una propuesta personalizada para acceder a un 0km con Grupo Sur Automotores.';
const wa = (msg) => `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
['headerWhatsapp','heroWhatsapp','floatingWhatsapp'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.href = wa(baseMsg);
});
document.querySelectorAll('[data-msg]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    window.open(wa(el.dataset.msg), '_blank');
  });
});
function formToWhatsApp(form) {
  const data = new FormData(form);
  const nombre = data.get('nombre') || '';
  const telefono = data.get('telefono') || '';
  const marca = data.get('marca') || '';
  const modelo = data.get('modelo') || '';
  const comentario = data.get('comentario') || '';
  const msg = `Hola, quiero recibir una propuesta personalizada de Grupo Sur Automotores.%0A%0ANombre: ${nombre}%0AWhatsApp: ${telefono}%0AMarca: ${marca}%0AModelo: ${modelo}${comentario ? `%0AComentario: ${comentario}` : ''}`;
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}
['quickForm','contactForm'].forEach(id => {
  const form = document.getElementById(id);
  if (form) form.addEventListener('submit', e => { e.preventDefault(); formToWhatsApp(form); });
});
