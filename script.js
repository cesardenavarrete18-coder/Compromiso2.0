const whatsappNumber = '5491141667220';
const modelsByBrand = {
  Volkswagen: ['Amarok', 'Taos', 'Nivus', 'T-Cross', 'Tera', 'Virtus', 'Polo'],
  Fiat: ['Cronos', 'Titano', 'Argo', 'Pulse', 'Fastback', 'Strada', 'Fiorino', 'Mobi'],
  Peugeot: ['208', '2008', 'Partner', 'Expert']
};
const featured = [
  { brand:'Volkswagen', model:'Tera', text:'SUV Volkswagen con propuesta personalizada según disponibilidad.' },
  { brand:'Volkswagen', model:'Amarok', text:'Pick-up Volkswagen con opciones comerciales para consultar.' },
  { brand:'Peugeot', model:'208', text:'Consultá anticipo, cuota y condiciones vigentes.' },
  { brand:'Peugeot', model:'2008', text:'SUV Peugeot con asesoramiento comercial personalizado.' },
  { brand:'Fiat', model:'Cronos', text:'Financiación y disponibilidad sobre una de las opciones más buscadas.' },
  { brand:'Fiat', model:'Titano', text:'Pick-up Fiat con alternativas comerciales vigentes.' }
];
const brandSelect = document.getElementById('brandSelect');
const modelSelect = document.getElementById('modelSelect');
function fillModels(){
  const brand = brandSelect.value;
  modelSelect.innerHTML = '';
  modelsByBrand[brand].forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  });
}
brandSelect.addEventListener('change', fillModels);
fillModels();

document.getElementById('leadForm').addEventListener('submit', (event)=>{
  event.preventDefault();
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const brand = brandSelect.value;
  const model = modelSelect.value;
  const message = `Hola, soy ${name}. Quiero recibir una propuesta personalizada de Grupo Sur Automotores. Mi WhatsApp es ${phone}. Me interesa ${brand} ${model}.`;
  window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank');
});

const dots = Array.from(document.querySelectorAll('.dot'));
const slides = Array.from(document.querySelectorAll('.slide'));
let slideIndex = 0;
function setSlide(index){
  slideIndex = index;
  slides.forEach((slide,i)=>slide.classList.toggle('active', i === index));
  dots.forEach((dot,i)=>dot.classList.toggle('active', i === index));
}
dots.forEach((dot,i)=> dot.addEventListener('click', ()=> setSlide(i)));
setInterval(()=> setSlide((slideIndex + 1) % slides.length), 5500);

const brandCards = Array.from(document.querySelectorAll('.brand-card'));
const zones = Array.from(document.querySelectorAll('.brand-zone'));
brandCards.forEach(card => {
  card.addEventListener('click', () => {
    const brand = card.dataset.filter;
    brandCards.forEach(c => c.classList.toggle('is-active', c === card));
    zones.forEach(zone => zone.classList.toggle('is-visible', zone.dataset.zone === brand));
    brandSelect.value = brand;
    fillModels();
    document.querySelector(`[data-zone="${brand}"]`).scrollIntoView({behavior:'smooth', block:'center'});
  });
});

function miniModelHTML(brand, model){
  const text = encodeURIComponent(`Hola, quiero recibir información sobre ${brand} ${model} en Grupo Sur Automotores.`);
  return `<article class="mini-model"><div class="mini-car"></div><strong>${model}</strong><a target="_blank" rel="noopener" href="https://wa.me/${whatsappNumber}?text=${text}">Consultar modelo</a></article>`;
}
document.getElementById('vwMini').innerHTML = modelsByBrand.Volkswagen.map(m=>miniModelHTML('Volkswagen',m)).join('');
document.getElementById('fiatMini').innerHTML = modelsByBrand.Fiat.map(m=>miniModelHTML('Fiat',m)).join('');
document.getElementById('peugeotMini').innerHTML = modelsByBrand.Peugeot.map(m=>miniModelHTML('Peugeot',m)).join('');

function featuredHTML(item){
  const css = item.brand === 'Volkswagen' ? 'vw-card' : item.brand === 'Fiat' ? 'fiat-card' : 'peugeot-card';
  const text = encodeURIComponent(`Hola, quiero recibir información sobre ${item.brand} ${item.model} en Grupo Sur Automotores.`);
  return `<article class="model-card ${css}"><div><div class="car-art" data-name="${item.model}"></div><h3>${item.brand} ${item.model}</h3><p>${item.text}</p></div><a class="btn secondary" target="_blank" rel="noopener" href="https://wa.me/${whatsappNumber}?text=${text}">Quiero info de este modelo</a></article>`;
}
document.getElementById('featuredModels').innerHTML = featured.map(featuredHTML).join('');
