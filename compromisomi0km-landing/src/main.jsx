import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, BadgeCheck, Car, Clock, CreditCard, FileCheck, Menu, MessageCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import './styles.css';

const WHATSAPP = '5491141667220';

const waLink = (message) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;

const brands = [
  {
    name: 'Volkswagen',
    models: 'Tera y Amarok',
    copy: 'SUV urbana o pick-up, con propuestas comerciales disponibles.',
    accent: 'brand-vw',
    message: 'Hola, quiero consultar por Volkswagen en Grupo Sur Automotores. Me interesa recibir opciones de financiación y disponibilidad.'
  },
  {
    name: 'Peugeot',
    models: '208 y 2008',
    copy: 'Diseño, tecnología y opciones de financiación para tu próximo 0km.',
    accent: 'brand-peugeot',
    message: 'Hola, quiero consultar por Peugeot en Grupo Sur Automotores. Me interesa recibir opciones de financiación y disponibilidad.'
  },
  {
    name: 'Fiat',
    models: 'Cronos y Titano',
    copy: 'Autos y pick-ups con financiación y disponibilidad comercial vigente.',
    accent: 'brand-fiat',
    message: 'Hola, quiero consultar por Fiat en Grupo Sur Automotores. Me interesa recibir opciones de financiación y disponibilidad.'
  }
];

const models = [
  { brand: 'Volkswagen', name: 'Tera', type: 'SUV urbana', message: 'Hola, quiero recibir información sobre Volkswagen Tera en Grupo Sur Automotores.' },
  { brand: 'Volkswagen', name: 'Amarok', type: 'Pick-up', message: 'Hola, quiero recibir información sobre Volkswagen Amarok en Grupo Sur Automotores.' },
  { brand: 'Peugeot', name: '208', type: 'Hatchback', message: 'Hola, quiero recibir información sobre Peugeot 208 en Grupo Sur Automotores.' },
  { brand: 'Peugeot', name: '2008', type: 'SUV', message: 'Hola, quiero recibir información sobre Peugeot 2008 en Grupo Sur Automotores.' },
  { brand: 'Fiat', name: 'Cronos', type: 'Sedán', message: 'Hola, quiero recibir información sobre Fiat Cronos en Grupo Sur Automotores.' },
  { brand: 'Fiat', name: 'Titano', type: 'Pick-up', message: 'Hola, quiero recibir información sobre Fiat Titano en Grupo Sur Automotores.' }
];

const benefits = [
  { icon: CreditCard, title: 'Financiación en pesos', text: 'Opciones comerciales según marca, modelo y perfil del cliente.' },
  { icon: Clock, title: 'Entrega pactada', text: 'Condiciones de retiro según disponibilidad y propuesta vigente.' },
  { icon: BadgeCheck, title: 'Clientes bancarizados', text: 'Beneficios especiales sujetos a evaluación y campaña activa.' },
  { icon: Car, title: 'Usado en parte de pago', text: 'Podés consultar opciones entregando tu vehículo actual.' },
  { icon: ShieldCheck, title: 'Documentación contractual', text: 'Operaciones respaldadas con condiciones claras y documentación correspondiente.' },
  { icon: MessageCircle, title: 'Asesoramiento personalizado', text: 'Un asesor te acompaña desde la consulta hasta la operación.' }
];

function Header() {
  const [open, setOpen] = useState(false);
  const nav = ['Modelos', 'Beneficios', 'Cómo funciona', 'Contacto'];
  return (
    <header className="header">
      <div className="container nav-wrap">
        <a href="#inicio" className="logo" aria-label="Grupo Sur Automotores">
          <span className="logo-mark">GS</span>
          <span>
            <strong>Grupo Sur</strong>
            <small>Automotores</small>
          </span>
        </a>
        <nav className="desktop-nav">
          {nav.map((item) => <a key={item} href={`#${item.toLowerCase().replace('ó', 'o').replace(' ', '-')}`}>{item}</a>)}
        </nav>
        <a className="btn btn-small" href={waLink('Hola, quiero recibir una propuesta personalizada para acceder a un 0km con Grupo Sur Automotores.')} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={24} /></button>
      </div>
      {open && (
        <div className="mobile-panel">
          <button className="close-btn" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={24} /></button>
          {nav.map((item) => <a onClick={() => setOpen(false)} key={item} href={`#${item.toLowerCase().replace('ó', 'o').replace(' ', '-')}`}>{item}</a>)}
          <a className="btn" href={waLink('Hola, quiero recibir una propuesta personalizada para acceder a un 0km con Grupo Sur Automotores.')} target="_blank" rel="noreferrer">Consultar por WhatsApp</a>
        </div>
      )}
    </header>
  );
}

function LeadForm({ compact = false }) {
  const [form, setForm] = useState({ nombre: '', telefono: '', marca: '', modelo: '', anticipo: '', horario: '' });
  const message = useMemo(() => {
    return `Hola, quiero recibir una propuesta personalizada en Grupo Sur Automotores.%0A%0ANombre: ${form.nombre || '-'}%0AWhatsApp: ${form.telefono || '-'}%0AMarca: ${form.marca || '-'}%0AModelo: ${form.modelo || '-'}%0AAnticipo o usado: ${form.anticipo || '-'}%0AHorario de contacto: ${form.horario || '-'}`;
  }, [form]);
  const href = `https://wa.me/${WHATSAPP}?text=${message}`;

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  return (
    <form className={`lead-form ${compact ? 'compact' : ''}`} onSubmit={(e) => { e.preventDefault(); window.open(href, '_blank'); }}>
      {!compact && <h3>Recibí tu propuesta</h3>}
      <div className="form-grid">
        <label>Nombre<input name="nombre" value={form.nombre} onChange={update} placeholder="Tu nombre" required /></label>
        <label>WhatsApp<input name="telefono" value={form.telefono} onChange={update} placeholder="Ej: 11 5555 5555" required /></label>
        <label>Marca<select name="marca" value={form.marca} onChange={update} required><option value="">Elegir marca</option><option>Volkswagen</option><option>Peugeot</option><option>Fiat</option></select></label>
        <label>Modelo<select name="modelo" value={form.modelo} onChange={update}><option value="">Elegir modelo</option>{models.map((m) => <option key={`${m.brand}-${m.name}`}>{m.brand} {m.name}</option>)}</select></label>
        {!compact && <label>Anticipo o usado<input name="anticipo" value={form.anticipo} onChange={update} placeholder="Ej: anticipo / usado / ambos" /></label>}
        {!compact && <label>Horario de contacto<input name="horario" value={form.horario} onChange={update} placeholder="Ej: hoy por la tarde" /></label>}
      </div>
      <button className="btn btn-wide" type="submit">Quiero mi propuesta <ArrowRight size={18} /></button>
      <p className="form-note">Al enviar, se abrirá WhatsApp con tus datos cargados.</p>
    </form>
  );
}

function Hero() {
  return (
    <section id="inicio" className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={16} /> Volkswagen · Peugeot · Fiat</span>
          <h1>Tu próximo 0km empieza con un compromiso.</h1>
          <p>Recibí una propuesta personalizada para acceder a tu 0km con opciones de financiación, entrega pactada y beneficios comerciales vigentes.</p>
          <div className="hero-actions">
            <a className="btn" href={waLink('Hola, quiero recibir una propuesta personalizada para acceder a un 0km con Grupo Sur Automotores.')} target="_blank" rel="noreferrer">Consultar por WhatsApp <ArrowRight size={18} /></a>
            <a className="btn btn-ghost" href="#modelos">Ver modelos</a>
          </div>
          <div className="trust-row">
            <span>Financiación en pesos</span><span>Entrega pactada</span><span>Asesor comercial</span>
          </div>
        </div>
        <div className="hero-card">
          <LeadForm compact />
          <div className="hero-car" aria-hidden="true">
            <div className="car-line"></div>
            <div className="wheel left"></div>
            <div className="wheel right"></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Brands() {
  return (
    <section className="section brand-section">
      <div className="container">
        <div className="section-head">
          <span className="kicker">Elegí marca</span>
          <h2>Una landing simple para llegar rápido a la consulta.</h2>
        </div>
        <div className="brand-grid">
          {brands.map((brand) => (
            <article className={`brand-card ${brand.accent}`} key={brand.name}>
              <span className="brand-pill">{brand.name}</span>
              <h3>{brand.models}</h3>
              <p>{brand.copy}</p>
              <a href={waLink(brand.message)} target="_blank" rel="noreferrer">Consultar {brand.name} <ArrowRight size={16} /></a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Models() {
  return (
    <section id="modelos" className="section models-section">
      <div className="container">
        <div className="section-head centered">
          <span className="kicker">Modelos destacados</span>
          <h2>Consultá anticipo, cuota y disponibilidad.</h2>
          <p>La propuesta se arma según modelo, campaña vigente y perfil del cliente.</p>
        </div>
        <div className="models-grid">
          {models.map((m) => (
            <article className="model-card" key={`${m.brand}-${m.name}`}>
              <div className="model-top">
                <span>{m.brand}</span>
                <small>{m.type}</small>
              </div>
              <div className="model-visual"><Car size={46} /></div>
              <h3>{m.name}</h3>
              <p>Recibí información sobre financiación, entrega pactada y beneficios disponibles.</p>
              <a className="model-link" href={waLink(m.message)} target="_blank" rel="noreferrer">Quiero info de este modelo</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section id="beneficios" className="section benefits-section">
      <div className="container">
        <div className="section-head">
          <span className="kicker">Beneficios</span>
          <h2>¿Por qué consultar en Grupo Sur Automotores?</h2>
        </div>
        <div className="benefits-grid">
          {benefits.map(({ icon: Icon, title, text }) => (
            <article className="benefit" key={title}>
              <Icon size={24} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Process() {
  const steps = [
    ['1', 'Elegís marca y modelo', 'Seleccionás Volkswagen, Peugeot o Fiat.'],
    ['2', 'Dejás tu WhatsApp', 'Un asesor recibe tu consulta con los datos básicos.'],
    ['3', 'Recibís una propuesta', 'Te informan anticipo, cuota, disponibilidad y beneficios vigentes.'],
    ['4', 'Avanzás con documentación', 'Se formalizan las condiciones comerciales correspondientes.']
  ];
  return (
    <section id="como-funciona" className="section process-section">
      <div className="container process-wrap">
        <div className="section-head">
          <span className="kicker">Cómo funciona</span>
          <h2>Un proceso claro, directo y acompañado por un asesor.</h2>
        </div>
        <div className="steps">
          {steps.map(([num, title, text]) => (
            <article className="step" key={num}>
              <span>{num}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contacto" className="section contact-section">
      <div className="container contact-grid">
        <div>
          <span className="kicker">Contacto</span>
          <h2>Dejá tu WhatsApp y recibí una propuesta personalizada.</h2>
          <p>La landing está pensada para que el cliente consulte rápido, sin vueltas, y llegue al equipo comercial con una intención clara.</p>
          <div className="contact-box">
            <FileCheck size={22} />
            <span>Condiciones sujetas a aprobación, disponibilidad, actualización de precios y documentación correspondiente.</span>
          </div>
        </div>
        <LeadForm />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <strong>Grupo Sur Automotores</strong>
          <p>Volkswagen · Peugeot · Fiat</p>
        </div>
        <p>Grupo Sur Automotores brinda asesoramiento comercial para la adquisición de vehículos 0km mediante propuestas comerciales disponibles. Las condiciones están sujetas a aprobación, disponibilidad, actualización de precios y documentación correspondiente. Las imágenes son ilustrativas.</p>
      </div>
    </footer>
  );
}

function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Brands />
        <Models />
        <Benefits />
        <Process />
        <Contact />
      </main>
      <Footer />
      <a className="floating-wa" href={waLink('Hola, quiero recibir una propuesta personalizada para acceder a un 0km con Grupo Sur Automotores.')} target="_blank" rel="noreferrer" aria-label="WhatsApp Grupo Sur Automotores"><MessageCircle size={25} /></a>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
