import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db, collection, getDocs, query, limit } from '../firebase/config';

// Maximum companies fetched in a single search — prevents full-collection scans.
// Upgrade to Algolia/Typesense when the catalogue exceeds this threshold.
const SEARCH_FETCH_LIMIT = 500;
import CompanyCard from '../components/CompanyCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { getCategoryLabel } from '../utils/helpers';
import { isArchivedRecord } from '../utils/adminModeration';
import './SearchResults.css';

const CATEGORIES = ['restaurant','bank','hotel','healthcare','education','electronics','supermarket','telecom','travel','fitness','real_estate','pharmacy','clothing','other'];

export default function SearchResults() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');
  const [ratingFilter, setRatingFilter] = useState('');
  const [sortBy, setSortBy] = useState('rating');

  const searchQ = searchParams.get('q') || '';

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [searchQ, categoryFilter]);
  useEffect(() => { loadResults(); }, [searchQ, categoryFilter, ratingFilter, sortBy]);
  useEffect(() => {
    function handleBusinessArchiveChanged(e) {
      if (e.detail?.status === 'archived') {
        setCompanies(prev => prev.filter(c => c.id !== e.detail.companyId));
      } else {
        loadResults();
      }
    }
    window.addEventListener('irema:businessArchiveChanged', handleBusinessArchiveChanged);
    return () => window.removeEventListener('irema:businessArchiveChanged', handleBusinessArchiveChanged);
  }, [searchQ, categoryFilter, ratingFilter, sortBy]);

  async function loadResults() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'companies'), limit(SEARCH_FETCH_LIMIT)));
      let results = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(c => !isArchivedRecord(c));
      // Search filter — match only on name and category to avoid false positives
      if (searchQ.trim()) {
        const q = searchQ.toLowerCase().trim();
        results = results.filter(c => {
          const name = (c.companyName || c.name || '').toLowerCase();
          const cat  = (c.category || '').toLowerCase();
          const city = (c.city || c.district || '').toLowerCase();
          if (q.length < 2) return name.startsWith(q);
          // Require the query to match the name or category; city/tags are secondary
          return name.startsWith(q) || cat.startsWith(q) || city.startsWith(q);
        });
        // Sort exact name matches first
        results.sort((a, b) => {
          const an = (a.companyName || a.name || '').toLowerCase();
          const bn = (b.companyName || b.name || '').toLowerCase();
          return (an.startsWith(q) ? 0 : 1) - (bn.startsWith(q) ? 0 : 1);
        });
      }
      // Category filter
      if (categoryFilter) {
        results = results.filter(c => c.category === categoryFilter || c.category === categoryFilter.replace('_','-'));
      }
      // Rating filter
      if (ratingFilter) {
        const min = parseFloat(ratingFilter);
        results = results.filter(c => (c.averageRating || 0) >= min);
      }
      // Sort
      results.sort((a, b) => {
        if (sortBy === 'rating') return (b.averageRating || 0) - (a.averageRating || 0);
        if (sortBy === 'reviews') return (b.totalReviews || 0) - (a.totalReviews || 0);
        if (sortBy === 'name') return (a.companyName || a.name || '').localeCompare(b.companyName || b.name || '');
        return 0;
      });
      setCompanies(results);
    } catch(e) {
      console.error('SearchResults fetch failed:', e);
      setCompanies([]);
    }
    setLoading(false);
  }

  const clearFilters = () => { setCategoryFilter(''); setRatingFilter(''); };

  return (
    <div className="search-results-page">
      <div className="container">
        <div className="sr-header">
          <h1 className="sr-title">
            {searchQ
              ? <>{t('search.results_for')} "<span className="sr-query">{searchQ}</span>"</>
              : t('search.all_companies')}
          </h1>
          <span className="sr-count">{companies.length} {t('search.companies_count')}</span>
        </div>

        <div className="sr-layout">
          {/* Sidebar filters */}
          <aside className="sr-sidebar">
            <div className="sr-filter-group">
              <label className="sr-filter-label">{t('common.filter')} {t('search.by_category')}</label>
              <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="">{t('search.all_companies')}</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{getCategoryLabel(c, t)}</option>)}
              </select>
            </div>
            <div className="sr-filter-group">
              <label className="sr-filter-label">{t('search.min_rating')}</label>
              <select className="input" value={ratingFilter} onChange={e => setRatingFilter(e.target.value)}>
                <option value="">{t('search.any_rating')}</option>
                <option value="4">4+ {t('search.stars_plus')}</option>
                <option value="3">3+ {t('search.stars_plus')}</option>
                <option value="2">2+ {t('search.stars_plus')}</option>
              </select>
            </div>
            <div className="sr-filter-group">
              <label className="sr-filter-label">{t('common.sort')}</label>
              <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="rating">{t('search.highest_rated')}</option>
                <option value="reviews">{t('search.most_reviewed')}</option>
                <option value="name">{t('search.name_az')}</option>
              </select>
            </div>
            {(categoryFilter || ratingFilter) && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                {t('search.clear_filters')}
              </button>
            )}
          </aside>

          {/* Results */}
          <div className="sr-results">
            {loading ? <LoadingSpinner /> : companies.length === 0
              ? <div className="sr-empty"><p>😕 {t('common.no_results')}</p></div>
              : <div className="grid-auto">{companies.map(c => <CompanyCard key={c.id} company={c} />)}</div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
