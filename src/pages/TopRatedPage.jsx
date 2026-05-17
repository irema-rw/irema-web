import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db, collection, query, orderBy, limit, getDocs, doc, updateDoc } from '../firebase/config';
import CompanyCard from '../components/CompanyCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { getCategoryLabel } from '../utils/helpers';
import { useThemeStore } from '../store/themeStore';
import { isArchivedRecord } from '../utils/adminModeration';

const CATS = ['','restaurant','bank','hotel','healthcare','education','electronics','supermarket','telecom'];

export default function TopRatedPage() {
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [compSnap, revSnap] = await Promise.all([
        getDocs(collection(db, 'companies')),
        getDocs(collection(db, 'reviews')),
      ]);

      const reviewStats = {};
      revSnap.forEach(d => {
        const r = d.data();
        if (!reviewStats[r.companyId]) reviewStats[r.companyId] = { total: 0, sum: 0 };
        reviewStats[r.companyId].total += 1;
        reviewStats[r.companyId].sum += (r.rating || 0);
      });

      const companies = compSnap.docs.map(d => {
        const data = d.data();
        const stats = reviewStats[d.id] || { total: 0, sum: 0 };
        const avgRating = stats.total > 0 ? parseFloat((stats.sum / stats.total).toFixed(2)) : 0;
        return { id: d.id, ...data, averageRating: avgRating, totalReviews: stats.total };
      }).filter(c => !isArchivedRecord(c));

      const sorted = companies.sort((a, b) => (b.averageRating - a.averageRating) || (b.totalReviews - a.totalReviews));
      setCompanies(sorted);

      // Sync stale docs
      sorted.forEach(c => {
        const stored = compSnap.docs.find(d => d.id === c.id)?.data();
        if (stored && (stored.averageRating !== c.averageRating || stored.totalReviews !== c.totalReviews)) {
          updateDoc(doc(db, 'companies', c.id), { averageRating: c.averageRating, totalReviews: c.totalReviews }).catch(() => {});
        }
      });
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  const filtered = activeCategory ? companies.filter(c => c.category === activeCategory) : companies;

  return (
    <div data-theme={theme} style={{ padding: 'var(--sp-10) 0 var(--sp-20)', background: 'var(--bg)', minHeight: '100vh' }}>
      <div className="container">
        {/* Header */}
        <div style={{ marginBottom: 'var(--sp-8)' }} className="animate-up">
          <div className="section-eyebrow"><span className="section-eyebrow-dot" />Rankings</div>
          <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--sp-3)' }}>Top Rated Businesses</h1>
          <p style={{ color: 'var(--text-3)', fontSize: '1rem' }}>
            The highest-rated businesses across Rwanda, ranked by verified customer reviews.
          </p>
        </div>

        {/* Category filter pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--sp-8)' }} className="animate-up-1">
          {CATS.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '7px 16px', borderRadius: 'var(--r-full)', border: '1.5px solid',
                borderColor: activeCategory === cat ? 'var(--brand)' : 'var(--border)',
                background: activeCategory === cat ? 'var(--brand-xlight)' : 'white',
                color: activeCategory === cat ? 'var(--brand-dark)' : 'var(--text-2)',
                fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                transition: 'all 150ms', fontFamily: 'var(--font-body)',
              }}
            >
              {cat === '' ? t('search.all_companies') : getCategoryLabel(cat)}
            </button>
          ))}
        </div>

        {loading ? <LoadingSpinner /> : (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-4)', marginBottom: 'var(--sp-5)' }}>
              {filtered.length} {t('search.companies_count')}
            </p>
            <div className="grid-auto">
              {filtered.map((c, i) => (
                <div key={c.id} className="animate-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <CompanyCard company={c} />
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', color: 'var(--text-4)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔍</div>
                  <p>No businesses in this category yet.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
