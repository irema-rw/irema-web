import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StarRating from './StarRating';
import { getCategoryLabel, getRatingColor, getRatingLabel } from '../utils/helpers';
import { companyPath } from '../utils/slug';
import { isArchivedRecord } from '../utils/adminModeration';
import './CompanyCard.css';

export default function CompanyCard({ company }) {
  const { t, i18n } = useTranslation();
  if (isArchivedRecord(company)) return null;

  const name = company.companyName || company.name || 'Unknown';
  const rating = company.averageRating || 0;
  const reviews = company.totalReviews || 0;
  const initial = name[0]?.toUpperCase() || '?';

  const scoreLabel = rating > 0 ? getRatingLabel(rating, i18n.language) : null;

  const bannerImg = company.photos?.[0] || null;

  return (
    <Link to={companyPath(company)} className="company-card-link">
      <article className="company-card card card-hover">
        {/* Banner/cover image area */}
        <div className="company-card-banner" style={bannerImg ? { backgroundImage: `url(${bannerImg})` } : {}}>
          {!bannerImg && (
            <div className="company-card-banner-placeholder">
              <div className="company-card-initial">{initial}</div>
            </div>
          )}
          {bannerImg && company.logoUrl && (
            <div className="company-card-logo-badge">
              <img src={company.logoUrl} alt={name} onError={e => e.target.style.display='none'} />
            </div>
          )}
          {bannerImg && !company.logoUrl && (
            <div className="company-card-logo-badge company-card-logo-initial">{initial}</div>
          )}
        </div>

        <div className="company-card-body">
          <div className="company-card-name">
            <span className="company-card-name-text">{name}</span>
            {company.isVerified && <span className="badge badge-verified" aria-label="Verified">✓</span>}
          </div>

          {(company.city || company.district || company.address) && (
            <div className="company-card-location" style={{fontSize:'0.78rem',color:'var(--text-3)',marginBottom:4}}>
              📍 {[company.city, company.district].filter(Boolean).join(', ') || company.address}
            </div>
          )}

          <div className="company-card-meta">
            <span className="category-chip">{getCategoryLabel(company.category, t)}</span>
          </div>

          <div className="company-card-rating">
            <StarRating rating={rating} size={16} />
            {scoreLabel && <span className="company-card-score-label" style={{ color: getRatingColor(rating) }}>{scoreLabel}</span>}
            <span className="company-card-count">
              {rating > 0 ? rating.toFixed(1) : '—'} ({reviews.toLocaleString()})
            </span>
          </div>
        </div>

        <div className="company-card-arrow" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </article>
    </Link>
  );
}
