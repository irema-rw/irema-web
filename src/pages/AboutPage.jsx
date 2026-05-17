import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useThemeStore } from '../store/themeStore';
import { db, collection, getDocs } from '../firebase/config';
import { isArchivedRecord } from '../utils/adminModeration';

export default function AboutPage() {
  const { theme } = useThemeStore();
  const [businessCount, setBusinessCount] = useState(null);

  useEffect(() => {
    async function loadBusinessCount() {
      try {
        const snap = await getDocs(collection(db, 'companies'));
        const count = snap.docs.filter(d => !isArchivedRecord(d.data())).length;
        // Format as "X,XXX+" for display
        const formatted = count >= 1000
          ? (count / 1000).toFixed(0) + 'K+'
          : count.toLocaleString() + '+';
        setBusinessCount(formatted);
      } catch (e) {
        console.error('Failed to load business count:', e);
        setBusinessCount('100K+'); // Fallback
      }
    }
    loadBusinessCount();
  }, []);
  return (
    <div data-theme={theme} style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar />
      <div className="container" style={{ maxWidth: 760, padding: '60px 24px 80px' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 8 }}>Our Story</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-1)', marginBottom: 16 }}>About Irema</h1>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.8, fontSize: '1.05rem' }}>
            Irema is Rwanda's first dedicated business review platform, built to help consumers make informed decisions and help businesses build trust through verified customer feedback.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 48 }}>
          {[[businessCount||'Loading','Businesses in Rwanda'],['4 Languages','EN · FR · RW · SW'],['100% Local','Built for East Africa']].map(([num,label])=>(
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand)', marginBottom: 4 }}>{num}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>Our Mission</h2>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 16 }}>
            In Rwanda's rapidly growing economy, consumers deserve access to honest, verified information about the businesses they interact with every day. At the same time, great businesses deserve a platform to showcase their quality and build lasting relationships with their customers.
          </p>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.8 }}>
            Irema bridges this gap by offering a free, trusted, multilingual review platform built specifically for the Rwandan context, with support for MTN MoMo payments, QR code reviews, and content in Kinyarwanda, French, English, and Swahili.
          </p>
        </div>

        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>What "Irema" Means</h2>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.8 }}>
            "Irema" comes from Kinyarwanda, meaning "to trust" or "trustworthy." It reflects our core mission: building a platform where every review is genuine, every business listing is verified, and every user can make decisions with confidence.
          </p>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #1a5c3e, #0f3d2e)', borderRadius: 16, padding: '32px 28px', color: 'white', marginBottom: 40, position: 'sticky', bottom: 0, zIndex: 40, boxShadow: '0 -4px 16px rgba(0,0,0,0.12)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, marginBottom: 12 }}>Get in Touch</h2>
          <p style={{ opacity: 0.85, lineHeight: 1.7, marginBottom: 16 }}>We'd love to hear from you, whether you're a business owner, a consumer, or a potential partner.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="mailto:hello@irema.rw" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '8px 20px', borderRadius: 99, fontSize: '0.88rem', textDecoration: 'none', fontWeight: 600 }}>hello@irema.rw</a>
            <Link to="/contact" style={{ background: 'white', color: '#1a5c3e', padding: '8px 20px', borderRadius: 99, fontSize: '0.88rem', textDecoration: 'none', fontWeight: 700 }}>Contact Us</Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
