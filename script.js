const whatsappNumber = '5491141667220';

const modelsByBrand = {
  Volkswagen: ['Amarok', 'Taos', 'Nivus', 'T-Cross', 'Tera', 'Virtus', 'Polo'],
  Peugeot: ['208', '2008', 'Partner', 'Expert'],
  Fiat: ['Cronos', 'Titano', 'Argo', 'Pulse', 'Fastback', 'Strada', 'Fiorino', 'Mobi', 'Toro']
};

const modelCards = [
  { brand:'Volkswagen', model:'Tera', img:'assets/vw-tera.webp' },
  { brand:'Volkswagen', model:'Virtus', img:'assets/vw-virtus.webp' },
  { brand:'Volkswagen', model:'Nivus', img:'assets/vw-nivus.webp' },
  { brand:'Volkswagen', model:'T-Cross', img:'assets/vw-tcross.webp' },
  { brand:'Volkswagen', model:'Taos', img:'assets/vw-taos.webp' },
  { brand:'Volkswagen', model:'Amarok', img:'assets/vw-amarok.webp' },
  { brand:'Peugeot', model:'208', img:'assets/peugeot-208.webp' },
  { brand:'Peugeot', model:'2008', img:'assets/peugeot-2008.webp' },
  { brand:'Peugeot', model:'Partner', img:'assets/peugeot-partner.webp' },
  { brand:'Peugeot', model:'Expert', img:'assets/peugeot-expert.webp' },
  { brand:'Fiat', model:'Titano', img:'assets/fiat-titano.webp' },
  { brand:'Fiat', model:'Cronos', img:'assets/fiat-cronos.webp' },
  { brand:'Fiat', model:'Pulse', img:'assets/fiat-pulse.webp' },
  { brand:'Fiat', model:'Mobi', img:'assets/fiat-mobi.webp' },
  { brand:'Fiat', model:'Argo', img:'assets/fiat-argo.webp' },
  { brand:'Fiat', model:'Fastback', img:'assets/fiat-fastback.webp' },
  { brand:'Fiat', model:'Fiorino', img:'assets/fiat-fiorino.webp' },
  { brand:'Fiat', model:'Strada', img:'assets/fiat-strada.webp' },
  { brand:'Fiat', model:'Toro', img:'assets/fiat-toro.webp' }
];

const brandSelect = document.getElementById('brandSelect');
const modelSelect = document.getElementById('modelSelect');

function waLink(message){
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

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
  const purchaseIdea = document.getElementById('purchaseIdea').value;
  const message = `Hola, soy ${name}. Quiero recibir una propuesta personalizada de Grupo Sur Automotores. Mi WhatsApp es ${phone}. Me interesa ${brand} ${model}. ${purchaseIdea}.`;
  window.open(waLink(message), '_blank');
});

const dots = Array.from(document.querySelectorAll('.dot'));
const slides = Array.from(document.querySelectorAll('.slide'));
let slideIndex = 0;
let sliderTimer;
function setSlide(index){
  slideIndex = index;
  slides.forEach((slide,i)=>slide.classList.toggle('active', i === index));
  dots.forEach((dot,i)=>dot.classList.toggle('active', i === index));
}
function startSlider(){
  clearInterval(sliderTimer);
  sliderTimer = setInterval(()=> setSlide((slideIndex + 1) % slides.length), 6000);
}
dots.forEach((dot,i)=> dot.addEventListener('click', ()=> { setSlide(i); startSlider(); }));
startSlider();

const brandCards = Array.from(document.querySelectorAll('.brand-card'));
brandCards.forEach(card => {
  card.addEventListener('click', () => {
    const brand = card.dataset.filter;
    brandCards.forEach(c => c.classList.toggle('is-active', c === card));
    brandSelect.value = brand;
    fillModels();
    setModelFilter(brand);
    document.getElementById('modelos').scrollIntoView({behavior:'smooth', block:'start'});
  });
});

const gallery = document.getElementById('modelGallery');
gallery.innerHTML = modelCards.map((item, index) => {
  const message = `Hola, quiero recibir información sobre ${item.brand} ${item.model} en Grupo Sur Automotores. Quisiera consultar anticipo, cuota y disponibilidad.`;
  return `<a class="vehicle-card" data-brand="${item.brand}" target="_blank" rel="noopener" href="${waLink(message)}">
    <img src="${item.img}" alt="${item.brand} ${item.model} - Grupo Sur Automotores" loading="${index < 3 ? 'eager' : 'lazy'}" />
    <div class="card-action"><strong>${item.brand} ${item.model}</strong><span>Consultar este modelo</span></div>
  </a>`;
}).join('');

const modelTabs = Array.from(document.querySelectorAll('.model-tab'));
function setModelFilter(filter){
  modelTabs.forEach(tab => tab.classList.toggle('is-active', tab.dataset.modelFilter === filter || (filter === 'all' && tab.dataset.modelFilter === 'all')));
  document.querySelectorAll('.vehicle-card').forEach(card => {
    card.classList.toggle('is-hidden', filter !== 'all' && card.dataset.brand !== filter);
  });
}
modelTabs.forEach(tab => tab.addEventListener('click', () => setModelFilter(tab.dataset.modelFilter)));
setModelFilter('all');



// Meta Pixel event tracking for WhatsApp clicks
function trackWhatsAppClick(model = "", brand = "") {
  if (typeof fbq === "function") {
    fbq("track", "Contact", {
      content_name: model || "WhatsApp",
      content_category: brand || "General"
    });
    fbq("trackCustom", "WhatsAppClick", {
      model: model || "General",
      brand: brand || "General"
    });
  }
}

document.addEventListener("click", function (event) {
  const link = event.target.closest("a[href*='wa.me'], a[href*='whatsapp']");
  if (!link) return;

  const card = link.closest("[data-brand], .vehicle-card, .model-card");
  const brand = card?.dataset?.brand || link.dataset.brand || "";
  const model = card?.dataset?.model || link.dataset.model || link.textContent.trim() || "";

  trackWhatsAppClick(model, brand);
});
