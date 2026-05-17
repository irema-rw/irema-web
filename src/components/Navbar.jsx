import ReactDOM from 'react-dom';
import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { auth, signOut, db, collection, query, where, getDocs, updateDoc, doc, getDoc, onSnapshot, orderBy, limit } from '../firebase/config';
import { getInitials } from '../utils/helpers';
import { useModalStore } from '../store/modalStore';
import { useThemeStore } from '../store/themeStore';
import { clearPermissionsCache } from '../hooks/useAdminPermissions';
import { LANGUAGES } from '../constants/languages';
import './Navbar.css';

// ── Logo options A/B/C/D — swap the function body to change logo ──
// Currently active: Option B (deep green bg, solid yellow star with white glow)
function IremaLogoMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="60" height="60" rx="14" fill="url(#navLogoGrad)"/>
      <defs>
        <linearGradient id="navLogoGrad" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1f6b52"/>
          <stop offset="100%" stopColor="#164d3b"/>
        </linearGradient>
      </defs>
      <polygon points="30,8 34.5,21.5 49,21.5 37.5,30 41.5,43.5 30,35 18.5,43.5 22.5,30 11,21.5 25.5,21.5" fill="#E8B800"/>
      <polygon points="30,13 33.2,22.8 43.5,22.8 35.4,28.8 38.2,38.5 30,33 21.8,38.5 24.6,28.8 16.5,22.8 26.8,22.8" fill="rgba(255,255,255,0.2)"/>
      <circle cx="30" cy="27" r="3.5" fill="rgba(255,255,255,0.5)"/>
    </svg>
  );
}

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const { user, userProfile } = useAuthStore();
  const { openModal } = useModalStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQ, setSearchQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsCache = React.useRef(null);

  // Sync navbar search box with URL ?q= param
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlQ = params.get('q') || '';
    setSearchQ(urlQ);
  }, [location.search]);
  // Fetch suggestions from Firestore as user types
  useEffect(() => {
    if (!searchQ.trim() || searchQ.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    const timer = setTimeout(async () => {
      try {
        // Use cached results if available
        if (!suggestionsCache.current) {
          const { getDocs, collection } = await import('firebase/firestore');
          const snap = await getDocs(collection(db, 'companies'));
          suggestionsCache.current = snap.docs.map(d => {
            const data = d.data();
            return { id: d.id, slug: data.slug || null, name: data.companyName || data.name || '', category: data.category || '' };
          });
        }
        const q = searchQ.toLowerCase().trim();
        const matches = suggestionsCache.current
          .filter(c => c.name.toLowerCase().includes(q))
          .slice(0, 5);
        setSuggestions(matches);
        setShowSuggestions(matches.length > 0);
      } catch {}
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQ]);

  const [profileOpen, setProfileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const profileRef = useRef(null);
  const langRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  function handleSearch(e) {
    e.preventDefault();
    if (searchQ.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQ.trim())}`);
      setSearchQ('');
    }
  }

  function changeLang(code) {
    i18n.changeLanguage(code);
    localStorage.setItem('irema_lang', code);
    setLangOpen(false);
  }

  async function handleLogout() {
    try {
      clearPermissionsCache();
      await signOut(auth);
      setProfileOpen(false);
      // Use hard redirect to prevent module loading issues after logout
      window.location.href = '/';
    } catch (e) {
      console.error('Logout error:', e);
      window.location.href = '/';
    }
  }

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];
  const { theme, toggle: toggleTheme } = useThemeStore();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifUnsubscribe, setNotifUnsubscribe] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const notifRef = useRef(null);

  // Live notification count for regular users
  useEffect(() => {
    if (!user || userProfile?.role === 'company_admin') return;
    // Only show unread notifs targeted at this user (as reviewer) or business notifs they own
    const q = query(collection(db,'notifications'), where('targetUserId','==',user.uid), where('read','==',false));
    const unsub = onSnapshot(q, snap => setUnreadNotifs(snap.size), () => {});
    return unsub;
  }, [user, userProfile]);

  // Load notifications with real-time updates when dropdown opens
  function loadNotifs() {
    if (!user) return () => {};
    const q = query(collection(db,'notifications'), where('targetUserId','==',user.uid), orderBy('createdAt','desc'), limit(20));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d=>({id:d.id,...d.data()}));
      setNotifs(data);
      // Mark unread as read
      const unreadDocs = snap.docs.filter(d => !d.data().read);
      if (unreadDocs.length > 0) {
        Promise.all(
          unreadDocs.map(d =>
            updateDoc(doc(db,'notifications',d.id),{read:true}).catch(e=>{
              console.error('Failed to mark notification as read:', e);
            })
          )
        );
        setUnreadNotifs(0);
      }
    }, err => {
      console.error('Failed to load notifications:', err);
    });
    return unsub;
  }

  useEffect(() => {
    function outside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  return (
    <>
    <nav className={`navbar${scrolled ? ' scrolled' : ''}`} role="banner">
      <div className="navbar-inner">
        {/* Logo */}
        <Link to="/" className="navbar-logo" aria-label="Irema home">
          <div className="navbar-logo-icon">
            <IremaLogoMark />
          </div>
          <span className="logo-text">Irema</span>
        </Link>

        {/* Search */}
        <form className="navbar-search" onSubmit={e => { handleSearch(e); setShowSuggestions(false); }} role="search" style={{position:'relative'}}>
          <input
            type="search" value={searchQ}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onChange={e => setSearchQ(e.target.value)}
            placeholder={t('nav.search_placeholder')}
            className="navbar-search-input"
            aria-label="Search companies"
            autoComplete="off"
          />
          <button type="submit" className="navbar-search-btn" aria-label="Search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
          {showSuggestions && suggestions.length > 0 && (
            <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:300,overflow:'hidden'}}>
              {suggestions.map(s => (
                <button key={s.id} type="button"
                  style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'10px 14px',background:'none',border:'none',cursor:'pointer',textAlign:'left',fontSize:'0.88rem',color:'var(--text-1)',transition:'background 0.12s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg-2)'}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}
                  onClick={() => { navigate(s.slug ? `/business/${s.slug}` : `/company/${s.id}`); setSearchQ(''); setShowSuggestions(false); }}>
                  <div style={{width:28,height:28,borderRadius:6,background:'var(--brand-xlight)',color:'var(--brand)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'0.8rem',flexShrink:0}}>
                    {s.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{fontWeight:600}}>{s.name}</div>
                    {s.category && <div style={{fontSize:'0.75rem',color:'var(--text-4)',textTransform:'capitalize'}}>{s.category.replace(/_/g,' ')}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Right cluster */}
        <div className="navbar-right">
          <button className="navbar-link navbar-cta-primary hidden-mobile" onClick={() => openModal('writeReview')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            {t('nav.write_review')}
          </button>

          <Link to="/businesses" className="navbar-link navbar-cta-primary hidden-mobile">
            {t('nav.for_businesses')}
          </Link>

          {/* Theme toggle */}
          <button
            className="navbar-link hidden-mobile navbar-theme-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ padding: '6px', display:'flex', alignItems:'center', color:'var(--text-2)' }}
          >
            {theme === 'dark'
              ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          <div className="lang-switcher" ref={langRef}>
            <button className="lang-btn" onClick={() => setLangOpen(v => !v)} aria-label="Language" aria-expanded={langOpen}>
              {currentLang.label}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {langOpen && (
              <div className="lang-dropdown" role="menu" aria-label="Language options">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    className={`lang-option${i18n.language === lang.code ? ' active' : ''}`}
                    onClick={() => changeLang(lang.code)}
                    role="menuitem"
                  >
                    <span className="lang-code">{lang.label}</span>
                    <span className="lang-name">{lang.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notification bell — regular users only */}
          {user && userProfile?.role !== 'company_admin' && (
            <div className="navbar-notif-wrap" ref={notifRef} style={{position:'relative'}}>
              <button className="navbar-notif-btn" onClick={()=>{
                if (!notifOpen) {
                  setNotifOpen(true);
                  const unsub = loadNotifs();
                  // Return unsubscribe to clean up listener when dropdown closes
                  setNotifUnsubscribe(() => unsub);
                } else {
                  setNotifOpen(false);
                  if (notifUnsubscribe) notifUnsubscribe();
                }
              }} aria-label="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {unreadNotifs > 0 && <span className="navbar-notif-badge">{unreadNotifs > 9 ? '9+' : unreadNotifs}</span>}
              </button>
              {notifOpen && (
                <div className="navbar-notif-dropdown">
                  <div className="navbar-notif-header">
                    <span>{t('nav.notifications') || 'Notifications'}</span>
                    {notifs.length > 0 && (
                      <button style={{fontSize:'0.72rem',color:'var(--brand)',background:'none',border:'none',cursor:'pointer',padding:0,fontWeight:600}}
                        onClick={()=>{setNotifOpen(false);navigate('/dashboard?tab=notifications');}}>
                        {t('nav.see_all') || 'See all'} ({notifs.length})
                      </button>
                    )}
                  </div>
                  {notifs.length === 0 ? (
                    <div className="navbar-notif-empty">{t('nav.no_notifications') || 'No notifications yet'}</div>
                  ) : notifs.map(n => (
                    <div key={n.id} className={`navbar-notif-item${n.read?'':' unread'}`}
                      onClick={async ()=>{
                        setNotifOpen(false);
                        // Mark as read in Firestore + local state immediately
                        if (!n.read) {
                          updateDoc(doc(db,'notifications',n.id),{read:true}).catch(()=>{});
                          setNotifs(prev => prev.map(x => x.id===n.id ? {...x,read:true} : x));
                          setUnreadNotifs(prev => Math.max(0, prev - 1));
                        }
                        if(n.companyId){
                          const isUserNotif = n.userId && n.userId === user?.uid;
                          if(isUserNotif && n.reviewId){
                            navigate(`/dashboard?openReview=${n.reviewId}`);
                          } else if(isUserNotif){
                            navigate('/dashboard');
                          } else {
                            // Resolve to the canonical /business/<slug> URL when
                            // possible so the user never sees the bare company id
                            // (was: navigating to /company/:id and waiting for
                            // CompanyPage to canonicalise).
                            let slug = n.companySlug || null;
                            if (!slug) {
                              try {
                                const snap = await getDoc(doc(db,'companies',n.companyId));
                                slug = snap.exists() ? (snap.data().slug || null) : null;
                              } catch {}
                            }
                            const base = slug ? `/business/${slug}` : `/company/${n.companyId}`;
                            const url = n.reviewId ? `${base}?openReview=${n.reviewId}` : base;
                            navigate(url);
                          }
                        }
                      }}>
                      <div className="navbar-notif-icon">
                        {n.type==='business_reply'?'💬':n.type==='new_review'?'⭐':'🔔'}
                      </div>
                      <div className="navbar-notif-body">
                        <p>{n.message||'New notification'}</p>
                        <span>{n.createdAt?.seconds?new Date(n.createdAt.seconds*1000).toLocaleDateString('en',{month:'short',day:'numeric'}):''}</span>
                      </div>
                      {!n.read && <span style={{width:7,height:7,borderRadius:'50%',background:'var(--brand)',flexShrink:0}}/>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Auth / Profile */}
          {user ? (
            <div className="user-menu-wrap" ref={profileRef}>
              <button
                className="user-btn"
                onClick={() => setProfileOpen(v => !v)}
                aria-label="User menu" aria-expanded={profileOpen}
              >
                {userProfile?.photoURL
                  ? <img src={userProfile.photoURL} alt="avatar" className="user-avatar avatar-img" />
                  : <div className="user-avatar">{getInitials(user.displayName || user.email)}</div>
                }
              </button>
              {profileOpen && (
                <div className="user-dropdown" role="menu">
                  <div className="user-dropdown-header">
                    <div className="user-avatar user-avatar-lg">{getInitials(user.displayName || user.email)}</div>
                    <div>
                      <div className="user-dropdown-name">{user.displayName || 'User'}</div>
                      <div className="user-dropdown-email">{user.email}</div>
                    </div>
                  </div>
                  <div className="user-dropdown-divider" />
                  {/* Desktop-only links — hidden on ≤1024px where the PWA bottom nav handles navigation */}
                  <Link to="/dashboard" className="user-dropdown-item dropdown-desktop-only" onClick={() => setProfileOpen(false)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    {t('nav.my_profile') || 'My Profile'}
                  </Link>
                  <Link to="/dashboard?tab=reviews" className="user-dropdown-item dropdown-desktop-only" onClick={() => setProfileOpen(false)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    {t('nav.my_reviews') || 'My Reviews'}
                  </Link>
                  {userProfile?.role === 'company_admin' && (
                    <>
                      <Link to="/company-dashboard" className="user-dropdown-item dropdown-desktop-only" onClick={() => setProfileOpen(false)}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        {t('nav.business_dashboard') || 'Business Dashboard'}
                      </Link>
                    </>
                  )}
                  <div className="user-dropdown-divider dropdown-desktop-only" />
                  <button className="user-dropdown-item danger" onClick={handleLogout}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="auth-btns">
              <button className="nav-auth-login" onClick={() => openModal('login')}>{t('nav.login')}</button>
              <button className="nav-auth-signup" onClick={() => openModal('signup')}>{t('nav.signup')}</button>
            </div>
          )}

        </div>
      </div>
      {/* Hamburger removed — bottom nav covers all primary routes on mobile */}
    </nav>
    </>
  );
}
