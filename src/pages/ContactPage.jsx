import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useThemeStore } from '../store/themeStore';
import { sanitizeText, sanitizeEmail } from '../utils/sanitize';

export default function ContactPage() {
  const { theme } = useThemeStore();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState({});

  function validateForm() {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!form.subject.trim()) newErrors.subject = 'Subject is required';
    if (!form.message.trim()) newErrors.message = 'Message is required';
    if (form.message.trim().length < 10) newErrors.message = 'Message must be at least 10 characters';
    return newErrors;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    // Sanitize form data before sending
    const sanitizedName = sanitizeText(form.name);
    const sanitizedEmail = sanitizeEmail(form.email);
    const sanitizedSubject = sanitizeText(form.subject);
    const sanitizedMessage = sanitizeText(form.message);

    window.location.href = `mailto:hello@irema.rw?subject=${encodeURIComponent(sanitizedSubject)}&body=${encodeURIComponent(`Name: ${sanitizedName}\nEmail: ${sanitizedEmail}\n\n${sanitizedMessage}`)}`;
    setSent(true);
  }

  function handleFieldChange(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) {
      setErrors(e => ({ ...e, [field]: '' }));
    }
  }

  const inputStyle = { width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: '0.92rem', color: 'var(--text-1)', background: 'var(--bg)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 14 };

  return (
    <div data-theme={theme} style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar />
      <div className="container" style={{ maxWidth: 700, padding: '100px 24px 80px' }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 8 }}>Get in Touch</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>Contact Us</h1>
          <p style={{ color: 'var(--text-3)' }}>We're here to help. Reach out and we'll respond within 24 hours.</p>
        </div>


        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '32px 28px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 20 }}>Send a Message</h2>
          {sent ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
              <h3 style={{ color: 'var(--brand)', marginBottom: 8 }}>Message Ready!</h3>
              <p style={{ color: 'var(--text-3)', fontSize: '0.88rem' }}>Your email client should open. If not, please try again.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div>
                  <label htmlFor="name-input" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>Name *</label>
                  <input
                    id="name-input"
                    aria-label="Your name"
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? 'name-error' : undefined}
                    style={{...inputStyle, borderColor: errors.name ? '#c00' : 'var(--border)' }}
                    placeholder="Your name"
                    value={form.name}
                    onChange={e => handleFieldChange('name', e.target.value)}
                  />
                  {errors.name && <p id="name-error" style={{ color: '#c00', fontSize: '0.8rem', margin: '-10px 0 4px 0' }}>{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="email-input" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>Email *</label>
                  <input
                    id="email-input"
                    aria-label="Your email address"
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    style={{...inputStyle, borderColor: errors.email ? '#c00' : 'var(--border)' }}
                    type="email"
                    placeholder="Your email"
                    value={form.email}
                    onChange={e => handleFieldChange('email', e.target.value)}
                  />
                  {errors.email && <p id="email-error" style={{ color: '#c00', fontSize: '0.8rem', margin: '-10px 0 4px 0' }}>{errors.email}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="subject-input" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>Subject *</label>
                <input
                  id="subject-input"
                  aria-label="Message subject"
                  aria-invalid={!!errors.subject}
                  aria-describedby={errors.subject ? 'subject-error' : undefined}
                  style={{...inputStyle, borderColor: errors.subject ? '#c00' : 'var(--border)' }}
                  placeholder="Subject"
                  value={form.subject}
                  onChange={e => handleFieldChange('subject', e.target.value)}
                />
                {errors.subject && <p id="subject-error" style={{ color: '#c00', fontSize: '0.8rem', margin: '-10px 0 4px 0' }}>{errors.subject}</p>}
              </div>
              <div>
                <label htmlFor="message-input" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>Message *</label>
                <textarea
                  id="message-input"
                  aria-label="Message content"
                  aria-invalid={!!errors.message}
                  aria-describedby={errors.message ? 'message-error' : undefined}
                  style={{...inputStyle, resize: 'vertical', marginBottom: 20, borderColor: errors.message ? '#c00' : 'var(--border)' }}
                  rows={5}
                  placeholder="How can we help you?"
                  value={form.message}
                  onChange={e => handleFieldChange('message', e.target.value)}
                />
                {errors.message && <p id="message-error" style={{ color: '#c00', fontSize: '0.8rem', margin: '-16px 0 4px 0' }}>{errors.message}</p>}
              </div>
              <button type="submit" style={{ background: 'var(--brand)', color: 'white', border: 'none', borderRadius: 10, padding: '12px 28px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', width: '100%', transition: 'all 0.2s ease' }}>
                Send Message
              </button>
            </form>
          )}
        </div>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-4)', fontSize: '0.85rem' }}>📍 Kibagabaga, Kigali, Rwanda &nbsp;·&nbsp; Mon–Fri 8am–6pm CAT</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
