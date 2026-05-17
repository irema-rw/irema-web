import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db, auth, storage, collection, query, where, getDocs, doc, updateDoc, addDoc, getDoc, arrayUnion, serverTimestamp, orderBy, limit, storageRef, uploadBytes, getDownloadURL } from '../firebase/config';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { useThemeStore } from '../store/themeStore';
import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../components/LoadingSpinner';
import ChangePasswordModal from '../components/ChangePasswordModal';
import './CompanyDashboard.css';
import StoriesSection from '../components/StoriesSection';
import ReviewModal from '../components/ReviewModal';
import FreeMetricsPanel from '../components/FreeMetricsPanel';
import MiddleMetricsPanel from '../components/MiddleMetricsPanel';
import PremiumMetricsPanel from '../components/PremiumMetricsPanel';
import AnalyticsTrialCountdown from '../components/AnalyticsTrialCountdown';
import AnalyticsUpgradePrompt from '../components/AnalyticsUpgradePrompt';
import TierComparison from '../components/TierComparison';
import { useSubscriptionStatus } from '../hooks/useSubscriptionStatus';
import { canStartPlanTrial } from '../utils/subscriptionAccess';
import { validateReplyText } from '../utils/reviewLimits';
import { isArchivedRecord } from '../utils/adminModeration';

/* ── Brand Logo ── */
function BizLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 60 60" fill="none">
      <rect width="60" height="60" rx="14" fill="url(#bizLogoGrad)"/>
      <defs>
        <linearGradient id="bizLogoGrad" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1f6b52"/><stop offset="100%" stopColor="#164d3b"/>
        </linearGradient>
      </defs>
      <polygon points="30,8 34.5,21.5 49,21.5 37.5,30 41.5,43.5 30,35 18.5,43.5 22.5,30 11,21.5 25.5,21.5" fill="#E8B800"/>
      <polygon points="30,13 33.2,22.8 43.5,22.8 35.4,28.8 38.2,38.5 30,33 21.8,38.5 24.6,28.8 16.5,22.8 26.8,22.8" fill="rgba(255,255,255,0.2)"/>
      <circle cx="30" cy="27" r="3.5" fill="rgba(255,255,255,0.5)"/>
    </svg>
  );
}

function Stars({ rating, size = 16 }) {
  return (
    <span style={{ display:'inline-flex', gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize:size, color: i <= Math.round(rating||0) ? '#e8b800' : 'var(--biz-border)' }}>★</span>
      ))}
    </span>
  );
}

function RatingBar({ n, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
      <span style={{ fontSize:'0.8rem', color:'var(--biz-text-2)', width:14, textAlign:'right' }}>{n}</span>
      <span style={{ fontSize:12, color:'#e8b800' }}>★</span>
      <div style={{ flex:1, height:8, borderRadius:4, background:'var(--biz-bg-2)', overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:'linear-gradient(90deg,#e8b800,#2d8f6f)', borderRadius:4, transition:'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize:'0.78rem', color:'var(--biz-text-3)', width:28, textAlign:'right' }}>{count}</span>
    </div>
  );
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position:'fixed', bottom:24, right:24, zIndex:9999,
      background: type==='error' ? '#ef4444' : '#2d8f6f', color:'white',
      padding:'12px 20px', borderRadius:12, fontSize:'0.88rem', fontWeight:600,
      boxShadow:'0 4px 20px rgba(0,0,0,0.2)', display:'flex', alignItems:'center', gap:8,
      animation:'slideUp 0.3s ease'
    }}>
      {type==='error' ? '✗' : '✓'} {msg}
    </div>
  );
}

/* ── NAV ── */
function getNav(t, company, subStatus) {
  return [
    { id:'overview',       label:t('cd.overview')||'Overview',        icon:'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10' },
    { id:'reviews',        label:t('cd.reviews')||'Reviews',          icon:'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { id:'analytics',      label:t('cd.analytics')||'Analytics',        icon:'M18 20V10 M12 20V4 M6 20v-6' },
    { id:'competitors',    label:t('cd.market_insights')||'Market Insights',  icon:'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { id:'profile',        label:t('cd.business_profile')||'Business Profile', icon:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
    { id:'subscription',   label:t('cd.subscription')||'Subscription',     icon:'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z' },
    { id:'analytics-tier', label:'Analytics Subscription',  icon:'M16 6l2.293-2.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L20 9m-4-4v12a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2h-8a2 2 0 00-2 2' },
    { id:'payments',       label:'Payments',            icon:'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm0-12C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z' },
    { id:'notifications',  label:t('cd.notifications')||'Notifications',    icon:'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0' },
    { id:'qrcode',         label:'QR Code',                                   icon:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14h1v1h-1z M17 17h3v3h-3z M20 20h1v1h-1z' },
    ...(subStatus.hasAccess('company_stories') ? [{ id:'stories', label:'Stories', icon:'M15 10l4.553-2.069A1 1 0 0 1 21 8.871V15.13a1 1 0 0 1-1.447.9L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z' }] : []),
    ...(subStatus.hasAccess('product_listings') ? [{ id:'products', label:'Products', icon:'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' }] : []),
  ];
}

const PLANS = [
  { id:'starter', name:'Starter', price:0, currency:'RWF', period:'month',
    features:['1 business listing','Unlimited reviews from customers','Respond to up to 50 reviews','Basic analytics','Email notifications','Community badge'],
    cta:'Get Started Free', highlight:false },
  { id:'professional', name:'Professional', price:25000, currency:'RWF', period:'month',
    features:['1 business listing','Unlimited reviews','Unlimited responses to reviews','Advanced analytics + charts','Priority support','Verified badge','QR code downloads','Competitor insights'],
    cta:'Start 14-day Trial', highlight:true },
  { id:'enterprise', name:'Enterprise', price:75000, currency:'RWF', period:'month',
    features:['Up to 5 listings','Unlimited everything','Unlimited responses','AI sentiment analysis','Dedicated account manager','Custom integrations','White-label widgets','API access','SLA support','Product listings on your page'],
    cta:'Get 14 days trial', highlight:false },
];

/* ── QR Code Section ── */
function QRCodeSection({ company, showToast }) {
  const [qrUrl, setQrUrl] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  // Link directly to review page (with ?review=1 to open review modal)
  const reviewUrl = `${window.location.origin}/company/${company?.id}?review=1`;
  const companyName = company?.companyName || company?.name || 'Business';

  React.useEffect(() => {
    if (!company?.id) return;
    if (!window.QRCode) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = () => setTimeout(generateQR, 200);
      document.head.appendChild(s);
    } else { setTimeout(generateQR, 100); }
  }, [company?.id]);

  function generateQR() {
    const el = document.getElementById('biz-qr-canvas');
    if (!el || !window.QRCode) return;
    el.innerHTML = '';
    new window.QRCode(el, {
      text: reviewUrl, width: 220, height: 220,
      colorDark: '#1f6b52', colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.H,
    });
    setTimeout(() => {
      const img = el.querySelector('img');
      if (img) setQrUrl(img.src);
    }, 400);
  }

  function downloadQR() {
    if (!qrUrl) return;
    // High-DPI canvas (2x scale for crisp text on all screens)
    const SCALE = 2;
    const W = 400, H = 540;
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE; canvas.height = H * SCALE;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // Green branded background
    const grad = ctx.createLinearGradient(0,0,W,H);
    grad.addColorStop(0,'#1a4535'); grad.addColorStop(1,'#2d8f6f');
    ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);

    // White card with rounded corners
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.roundRect(28,28,W-56,H-56,18);
    ctx.fill();

    // Irema title
    ctx.fillStyle = '#1f6b52'; ctx.font = 'bold 26px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Irema', W/2, 76);

    // Company name (truncate if too long)
    const shortName = companyName.length > 28 ? companyName.slice(0,25)+'…' : companyName;
    ctx.fillStyle = '#111827'; ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillText(shortName, W/2, 112);

    // Tagline
    ctx.fillStyle = '#6b7280'; ctx.font = '14px Arial, sans-serif';
    ctx.fillText('Scan to write a review', W/2, 142);

    // Separator line
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60,158); ctx.lineTo(W-60,158); ctx.stroke();

    // QR image
    const qrImg = new Image();
    qrImg.onload = () => {
      ctx.drawImage(qrImg, W/2-115, 168, 230, 230);

      // Bottom section
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(60,410); ctx.lineTo(W-60,410); ctx.stroke();

      ctx.fillStyle = '#1f6b52'; ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText('irema.rw', W/2, 432);

      ctx.fillStyle = '#9ca3af'; ctx.font = '12px Arial, sans-serif';
      ctx.fillText("Rwanda's #1 Business Review Platform", W/2, 454);

      // Download as high-res PNG
      const link = document.createElement('a');
      link.download = 'irema-qr-' + companyName.replace(/[^a-z0-9]/gi,'-').toLowerCase() + '.png';
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    };
    qrImg.src = qrUrl;
  }

  function copyLink() {
    navigator.clipboard.writeText(reviewUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      showToast && showToast('Review link copied to clipboard!');
    }).catch(() => {
      showToast && showToast('Copy failed. Please copy manually', 'error');
    });
  }

  return (
    <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:24, maxWidth:520, margin:'0 auto'}}>
      {/* Branded QR card preview */}
      <div style={{background:'linear-gradient(135deg,#1a4535,#2d8f6f)', padding:4, borderRadius:24, boxShadow:'0 8px 32px rgba(0,0,0,0.2)'}}>
        <div style={{background:'white', borderRadius:20, padding:28, textAlign:'center'}}>
          <div style={{fontSize:'1.1rem', fontWeight:800, color:'#1f6b52', marginBottom:2}}>Irema</div>
          <div style={{fontSize:'0.95rem', fontWeight:700, color:'#111827', marginBottom:4}}>{companyName}</div>
          <div style={{fontSize:'0.75rem', color:'#6b7280', marginBottom:16}}>Scan to write a review</div>
          <div id="biz-qr-canvas" style={{width:220, height:220, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div style={{color:'#9ca3af',fontSize:'0.8rem'}}>Generating QR…</div>
          </div>
          <div style={{fontSize:'0.75rem', color:'#1f6b52', fontWeight:600, marginTop:12}}>irema.rw</div>
        </div>
      </div>

      <div style={{textAlign:'center', maxWidth:420}}>
        <p style={{fontSize:'0.85rem', color:'var(--biz-text-2)', marginBottom:6}}>Customers scan this QR to go directly to your <strong>review page</strong></p>
        <code style={{fontSize:'0.72rem', background:'var(--biz-bg-2)', padding:'5px 10px', borderRadius:6, wordBreak:'break-all', display:'block'}}>
          {reviewUrl}
        </code>
      </div>

      <div style={{display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center'}}>
        <button className="biz-btn biz-btn-primary" onClick={downloadQR} disabled={!qrUrl}>
          ⬇️ Download Branded QR (PNG)
        </button>
        <button className="biz-btn biz-btn-ghost" onClick={copyLink} style={{minWidth:140}}>
          {copied ? '✓ Copied!' : '🔗 Copy Review Link'}
        </button>
      </div>

      <div style={{background:'var(--biz-bg-2)', borderRadius:14, padding:20, width:'100%', maxWidth:480}}>
        <h4 style={{margin:'0 0 10px', fontSize:'0.9rem', color:'var(--biz-text-1)'}}>💡 How to use your QR code</h4>
        <ul style={{margin:0, paddingLeft:18, fontSize:'0.84rem', color:'var(--biz-text-2)', lineHeight:1.9}}>
          <li>Print and display at your entrance, counter or tables</li>
          <li>Add to receipts, menus or business cards</li>
          <li>Customers scan once with phone camera — no app needed</li>
          <li>They land directly on your <strong>review submission page</strong></li>
          <li>Works for unlimited scans from any user</li>
        </ul>
      </div>
    </div>
  );
}

/* ── Stories Upload Section for businesses ── */
function StoriesUploadSection({ company, currentUser }) {
  return (
    <StoriesSection
      companyId={company?.id}
      companyName={company?.companyName || company?.name}
      showUpload={true}
      currentUser={currentUser}
      limit={10}
    />
  );
}

export default function CompanyDashboard() {
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useThemeStore();
  const { t, i18n } = useTranslation();
  const [section, setSection] = useState('overview');
  const [company, setCompany] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notifFilter, setNotifFilter] = useState('all'); // all | hour | day | week | month
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [toast, setToast] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [backgroundImageUploading, setBackgroundImageUploading] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [reviewGroupBy, setReviewGroupBy] = useState('none');
  const [selectedReview, setSelectedReview] = useState(null);
  const [bizReactions, setBizReactions] = useState({});
  const [dropOpen, setDropOpen] = useState(false);
  const [subscription, setSubscription] = useState(null); // current sub doc
  const [trialDaysLeft, setTrialDaysLeft] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [enterpriseModal, setEnterpriseModal] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState({ contact: '', phone: '', message: '', billingCycle: 'monthly' });
  const [enterpriseSending, setEnterpriseSending] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('mtn');
  const [bizChangePwOpen, setBizChangePwOpen] = useState(false);
  const [comparisonMetrics, setComparisonMetrics] = useState({
    avgRating: true,
    fiveStarCount: true,
    reviewCount: true,
    responseRate: true,
  });
  const [analyticsMetrics, setAnalyticsMetrics] = useState(null);
  const [analyticsAccessLevel, setAnalyticsAccessLevel] = useState('free');
  const [isOnTrial, setIsOnTrial] = useState(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [paymentsTab, setPaymentsTab] = useState('methods'); // 'methods' | 'history'
  const [trialStarting, setTrialStarting] = useState(false);
  const chartRefs = useRef({});
  const dropRef = useRef(null);

  // Centralized subscription status (replaces scattered inline checks)
  const subStatus = useSubscriptionStatus(company?.id, company);
  const canStartTrial = !subStatus.loading && canStartPlanTrial(subStatus.subscription);
  const canReplyToReviews = subStatus.hasAccess('reply_reviews');
  const canViewAnalytics = subStatus.hasAccess('analytics_advanced');

  const showToast = (msg, type='success') => { setToast({msg,type}); };

  async function startPlanTrial(planId = 'professional') {
    if (!company?.id) return;
    if (!['professional', 'enterprise'].includes(planId)) return;
    if (!canStartPlanTrial(subStatus.subscription)) {
      showToast('This business has already used its free trial.', 'error');
      return;
    }

    const selectedPlan = PLANS.find(plan => plan.id === planId);
    const planName = selectedPlan?.name || 'Professional';
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    const trialCoreData = {
      plan: planId,
      status: 'trial',
      trialEndsAt: trialEnd,
      trialStartedAt: serverTimestamp(),
      trialStarted: new Date().toISOString(),
      locked: false,
      updatedAt: serverTimestamp(),
    };
    const trialCreateData = {
      ...trialCoreData,
      companyId: company.id,
      businessName: company.companyName || company.name || 'Business',
      adminEmail: company.adminEmail || company.email || company.workEmail || currentUser?.email || '',
      amount: selectedPlan?.price || 25000,
      billingCycle: 'monthly',
    };

    try {
      setTrialStarting(true);
      let nextSubscription;
      if (subStatus.subscription?.id) {
        await updateDoc(doc(db, 'subscriptions', subStatus.subscription.id), trialCoreData);
        if (company.subscriptionId !== subStatus.subscription.id) {
          await updateDoc(doc(db, 'companies', company.id), { subscriptionId: subStatus.subscription.id, updatedAt: serverTimestamp() }).catch(() => {});
        }
        nextSubscription = { ...subStatus.subscription, ...trialCoreData };
      } else {
        const ref = await addDoc(collection(db, 'subscriptions'), {
          ...trialCreateData,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'companies', company.id), { subscriptionId: ref.id, updatedAt: serverTimestamp() }).catch(() => {});
        nextSubscription = { id: ref.id, ...trialCreateData };
      }

      setSubscription(nextSubscription);
      setTrialDaysLeft(14);
      await addDoc(collection(db,'notifications'), {
        type:'trial_started', userId:'admin',
        message:`${company.companyName||company.name} started a 14-day ${planName} trial.`,
        companyId: company.id, createdAt: serverTimestamp(), read: false,
      }).catch(()=>{});
      showToast(`✓ 14-day ${planName} trial started! Enjoy full features.`, 'success');
    } catch (e) {
      console.error(`Failed to start ${planName} trial:`, e);
      showToast(e.message || 'Failed to start trial', 'error');
    } finally {
      setTrialStarting(false);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { navigate('/businesses'); return; }
      setCurrentUser(user);
      try {
        // Retry up to 3 times with backoff — handles race condition where
        // Firestore write hasn't replicated yet after Google registration redirect
        let snap = await getDocs(query(collection(db,'companies'), where('adminUserId','==',user.uid)));
        if (snap.empty) {
          await new Promise(r => setTimeout(r, 800));
          snap = await getDocs(query(collection(db,'companies'), where('adminUserId','==',user.uid)));
        }
        if (snap.empty) {
          await new Promise(r => setTimeout(r, 1500));
          snap = await getDocs(query(collection(db,'companies'), where('adminUserId','==',user.uid)));
        }
        if (snap.empty) { navigate('/businesses', { replace:true }); return; }

        const d = snap.docs[0];
        const co = { id:d.id, ...d.data() };
        setCompany(co);
        setEditForm({
          companyName: co.companyName||co.name||'', category: co.category||'',
          website: co.website||'', phoneNumber: co.phoneNumber||'',
          email: co.email||co.workEmail||'', country: co.country||'RW',
          description: co.description||'', address: co.address||'',
          employees: co.employees||'1-10',
        });
        setLoading(false); // ← show dashboard immediately with company data

        // Load reviews + notifications in parallel — simple where queries, sort client-side
        // (avoids composite index requirement which causes slow/failed queries)
        const [rSnap, notifSnap] = await Promise.all([
          getDocs(query(collection(db,'reviews'), where('companyId','==',d.id))).catch(()=>({docs:[]})),
          getDocs(query(collection(db,'notifications'), where('companyId','==',d.id), limit(50))).catch(()=>({docs:[]})),
        ]);

        const reviewDocs = rSnap.docs.map(r => ({id:r.id,...r.data()}));
        reviewDocs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        setReviews(reviewDocs);

        const notifs = notifSnap.docs.map(n=>({id:n.id,...n.data()}));
        notifs.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        setNotifications(notifs.slice(0,30));
        setUnreadCount(notifs.filter(n=>!n.read).length);

        // Load subscription & calculate trial/lock status
        const subSnap = await getDocs(query(collection(db,'subscriptions'), where('companyId','==',d.id))).catch(()=>({docs:[]}));
        if (!subSnap.empty) {
          const sub = { id: subSnap.docs[0].id, ...subSnap.docs[0].data() };
          setSubscription(sub);
          if (sub.status === 'trial' && sub.trialEndsAt) {
            const endDate = sub.trialEndsAt.toDate ? sub.trialEndsAt.toDate() : new Date(sub.trialEndsAt.seconds*1000);
            const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000*60*60*24)));
            setTrialDaysLeft(daysLeft);
            if (daysLeft === 0 && !sub.locked) {
              // Auto-lock expired trial — await database update before UI update
              await updateDoc(doc(db,'subscriptions',sub.id), { status:'expired', locked:true }).catch((e)=>{
                console.error('Failed to lock expired trial:', e);
              });
              setIsLocked(true);
            }
          }
          if (sub.locked && sub.status !== 'active') setIsLocked(true);
        }

        // Sync lock state with hook
        setIsLocked(subStatus.isLocked);

        // Load competitors last (lowest priority, simple query)
        if (co.category) {
          getDocs(query(collection(db,'companies'), where('category','==',co.category), limit(10)))
            .then(cSnap => {
              const comps = cSnap.docs.map(c=>({id:c.id,...c.data()})).filter(c=>c.id!==d.id && !isArchivedRecord(c));
              comps.sort((a,b)=>(b.averageRating||0)-(a.averageRating||0));
              setCompetitors(comps.slice(0,6));
            })
            .catch(()=>{});
        }
        return; // skip setLoading(false) below — already called above
      } catch(e){ /* log removed */; }
      setLoading(false);
    });
    return unsub;
  }, [navigate]);

  // Click outside dropdown
  useEffect(() => {
    function h(e) { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Load analytics metrics and check trial status
  useEffect(() => {
    if (!company?.id || !subscription) return;

    // Analytics state now sourced from useSubscriptionStatus hook
    // (handles expiry downgrade automatically)
    setAnalyticsAccessLevel(subStatus.analyticsAccessLevel);
    setTrialDaysRemaining(subStatus.analyticsTrialDaysLeft);
    setIsOnTrial(subStatus.isOnAnalyticsTrial);

    // Fetch latest analytics metrics
    const today = new Date().toISOString().split('T')[0];
    getDoc(doc(db, 'analytics_metrics', company.id, 'daily', `daily_${today}`))
      .then(docSnap => {
        if (docSnap.exists()) {
          setAnalyticsMetrics(docSnap.data());
        }
      })
      .catch(() => {
        // Metrics not yet calculated, will show default state
      });
  }, [company?.id, subscription, subStatus.analyticsAccessLevel, subStatus.analyticsTrialDaysLeft, subStatus.isOnAnalyticsTrial]);

  // Analytics charts
  const drawCharts = useCallback(() => {
    if (!window.Chart || !reviews.length) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const tick = isDark ? '#8fa89e' : '#9ca3af';
    const GREEN = '#2d8f6f', GOLD = '#e8b800';

    const make = (id, type, data, opts={}) => {
      const el = document.getElementById(id); if (!el) return;
      if (chartRefs.current[id]) chartRefs.current[id].destroy();
      chartRefs.current[id] = new window.Chart(el, {
        type, data,
        options: { responsive:true, maintainAspectRatio:false, animation:{duration:400},
          plugins:{legend:{labels:{color:tick,font:{size:11}}}},
          scales: type!=='doughnut'&&type!=='pie' ? {
            y:{beginAtZero:true,grid:{color:grid},ticks:{color:tick,font:{size:11}}},
            x:{grid:{color:'transparent'},ticks:{color:tick,font:{size:11}}}
          } : undefined, ...opts }
      });
    };

    // Reviews over time (bucket by week)
    const now = Date.now();
    const weeks = 8;
    const weekMs = 7*86400000;
    const labels = Array.from({length:weeks},(_,i)=>{
      const d=new Date(now-(weeks-1-i)*weekMs);
      return d.toLocaleDateString('en',{month:'short',day:'numeric'});
    });
    const counts = Array(weeks).fill(0);
    const ratingByWeek = Array(weeks).fill(0).map(()=>({sum:0,n:0}));
    reviews.forEach(r => {
      const t = r.createdAt?.seconds ? r.createdAt.seconds*1000 : 0;
      const idx = weeks - 1 - Math.floor((now-t)/weekMs);
      if (idx>=0 && idx<weeks) {
        counts[idx]++;
        ratingByWeek[idx].sum += r.rating||0;
        ratingByWeek[idx].n++;
      }
    });
    const avgByWeek = ratingByWeek.map(w=>w.n?+(w.sum/w.n).toFixed(1):null);

    make('bizReviewTrend','line',{
      labels,
      datasets:[
        {label:t('cd.reviews')||'Reviews',data:counts,borderColor:GREEN,backgroundColor:'rgba(45,143,111,0.1)',tension:0.4,fill:true,yAxisID:'y'},
        {label:t('cd.avg_rating')||'Avg Rating',data:avgByWeek,borderColor:GOLD,backgroundColor:'transparent',tension:0.4,yAxisID:'y1',spanGaps:true},
      ]
    },{scales:{y:{beginAtZero:true,grid:{color:grid},ticks:{color:tick}},y1:{min:0,max:5,position:'right',grid:{drawOnChartArea:false},ticks:{color:tick}}}});

    // Rating distribution
    const rDist = [1,2,3,4,5].map(n=>reviews.filter(r=>Math.round(r.rating||0)===n).length);
    make('bizRatingDist','doughnut',{
      labels:['1★','2★','3★','4★','5★'],
      datasets:[{data:rDist,backgroundColor:['#ef4444','#f97316','#eab308',GREEN+'bb',GREEN],borderWidth:0}]
    },{plugins:{legend:{position:'right',labels:{color:tick,font:{size:11}}}}});

    // Response rate
    const replied = reviews.filter(r=>(r.replies||[]).some(p=>p.by==='business'||p.isBusinessReply)).length;
    const responseRate = reviews.length ? Math.round((replied/reviews.length)*100) : 0;
    make('bizResponseRate','doughnut',{
      labels:['Responded','Pending'],
      datasets:[{data:[responseRate,100-responseRate],backgroundColor:[GREEN,'var(--biz-bg-2)'],borderWidth:0,borderRadius:4}]
    },{cutout:'78%',plugins:{legend:{display:false}}});

  }, [reviews]);

  // Load payment history
  useEffect(() => {
    if (!company?.id || !currentUser) return;
    getDocs(query(collection(db, 'payments'), where('companyId', '==', company.id), orderBy('createdAt', 'desc')))
      .then(snap => {
        const payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPaymentHistory(payments);
      })
      .catch(e => {
        // Silently fail on permission errors (e.g., during logout)
        if (e.code !== 'permission-denied') {
          console.error('Error loading payments:', e);
        }
      });
  }, [company?.id, currentUser]);

  useEffect(() => {
    if (section !== 'analytics') return;
    const load = () => {
      if (!document.getElementById('chartjs-biz')) {
        const s=document.createElement('script'); s.id='chartjs-biz';
        s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        s.onload=()=>setTimeout(drawCharts,100); document.head.appendChild(s);
      } else if (window.Chart) setTimeout(drawCharts,100);
    };
    load();
  }, [section, drawCharts]);

  async function handleReply(reviewId, replyText) {
    if (!currentUser) { showToast('Not logged in','error'); return; }
    if (!company) { showToast('Company not loaded','error'); return; }
    if (!canReplyToReviews) {
      showToast('Replying to reviews is available on Professional and Enterprise plans.', 'error');
      setSection('subscription');
      return;
    }
    const validation = validateReplyText(replyText);
    if (!validation.ok) {
      showToast(validation.message, 'error');
      return;
    }

    const reply = {
      by: 'business',
      isBusinessReply: true,
      text: replyText,
      userId: currentUser.uid,
      userName: company.companyName || company.name || 'Business',
      timestamp: Date.now(),
    };
    try {
      // Optimistic local update first (so UI feels instant)
      setReviews(prev => prev.map(r =>
        r.id === reviewId ? { ...r, replies: [...(r.replies||[]), reply] } : r
      ));
      await updateDoc(doc(db,'reviews',reviewId), { replies: arrayUnion(reply) });
      // Notify the review author that the business has replied
      const reviewDoc = reviews.find(r => r.id === reviewId);
      if (reviewDoc?.userId) {
        await addDoc(collection(db, 'notifications'), {
          targetUserId: reviewDoc.userId,
          companyId: company.id,
          companyName: company.companyName || company.name,
          type: 'business_reply',
          message: `${company.companyName || 'A business'} replied to your review`,
          reviewId,
          createdAt: serverTimestamp(),
          read: false,
        }).catch((e) => {
          console.error('Failed to notify review author:', e);
          showToast('Note: Could not send notification to review author', 'error');
        });
      }
      // Also notify the company (for their notifications tab)
      await addDoc(collection(db,'notifications'), {
        companyId: company.id, type: 'reply_sent',
        message: 'You replied to a customer review',
        reviewId, createdAt: serverTimestamp(), read: true,
      }).catch((e) => {
        console.error('Failed to create company notification:', e);
        showToast('Note: Could not create notification', 'error');
      });
      showToast('Reply sent!');
    } catch(e) {
      showToast(e.message || 'Failed to send reply', 'error');
    }
  }


  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !company) return;
    setLogoUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `logos/${company.id}/${Date.now()}.${ext}`;
      const ref = storageRef(storage, path);
      const snap = await uploadBytes(ref, file, { contentType: file.type });
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, 'companies', company.id), { logoUrl: url });
      setCompany(prev => ({ ...prev, logoUrl: url }));
      showToast('Logo updated!');
    } catch (e) {
      showToast('Logo upload failed: ' + e.message, 'error');
    }
    setLogoUploading(false);
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files).slice(0, 8);
    if (!files.length || !company) return;
    setPhotosUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const path = `business-photos/${company.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const ref = storageRef(storage, path);
        const snap = await uploadBytes(ref, file, { contentType: file.type });
        const url = await getDownloadURL(snap.ref);
        uploaded.push(url);
      }
      const existing = company.photos || [];
      const newPhotos = [...existing, ...uploaded].slice(0, 10);
      await updateDoc(doc(db, 'companies', company.id), { photos: newPhotos });
      setCompany(prev => ({ ...prev, photos: newPhotos }));
      showToast(`${uploaded.length} photo${uploaded.length>1?'s':''} uploaded!`);
    } catch (e) {
      showToast('Photo upload failed: ' + e.message, 'error');
    }
    setPhotosUploading(false);
  }

  async function handlePhotoDelete(url) {
    try {
      const newPhotos = (company.photos||[]).filter(p => p !== url);
      await updateDoc(doc(db, 'companies', company.id), { photos: newPhotos });
      setCompany(prev => ({ ...prev, photos: newPhotos }));
      showToast('Photo removed');
    } catch (e) { showToast('Failed to remove photo', 'error'); }
  }

  async function handleBackgroundImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !company) return;
    setBackgroundImageUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `business-backgrounds/${company.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const ref = storageRef(storage, path);
      const snap = await uploadBytes(ref, file, { contentType: file.type });
      const url = await getDownloadURL(snap.ref);
      await updateDoc(doc(db, 'companies', company.id), { backgroundImageUrl: url });
      setCompany(prev => ({ ...prev, backgroundImageUrl: url }));
      showToast('Background image updated!');
    } catch (e) {
      showToast('Background image upload failed: ' + e.message, 'error');
    }
    setBackgroundImageUploading(false);
  }

  async function handleBackgroundImageDelete() {
    try {
      await updateDoc(doc(db, 'companies', company.id), { backgroundImageUrl: null });
      setCompany(prev => ({ ...prev, backgroundImageUrl: null }));
      showToast('Background image removed');
    } catch (e) { showToast('Failed to remove background image', 'error'); }
  }

  async function handleEditSave() {
    setEditSaving(true);
    try {
      await updateDoc(doc(db,'companies',company.id), {
        companyName: editForm.companyName, name: editForm.companyName,
        category: editForm.category, website: editForm.website,
        phoneNumber: editForm.phoneNumber, email: editForm.email,
        country: editForm.country, description: editForm.description,
        address: editForm.address, employees: editForm.employees,
        updatedAt: serverTimestamp(),
      });
      setCompany(prev=>({...prev,...editForm, name:editForm.companyName}));
      setEditMode(false);
      showToast('Profile updated successfully!');
    } catch(e) { showToast(e.message,'error'); }
    setEditSaving(false);
  }

  async function markAllRead() {
    const unread = notifications.filter(n=>!n.read);
    for (const n of unread) {
      await updateDoc(doc(db,'notifications',n.id), {read:true}).catch(()=>{});
    }
    setNotifications(prev=>prev.map(n=>({...n,read:true})));
    setUnreadCount(0);
  }

  const logout = async () => {
    try {
      await signOut(auth);
      // Use hard redirect to prevent module loading issues
      window.location.href = '/';
    } catch (e) {
      console.error('Logout error:', e);
      window.location.href = '/';
    }
  };

  // Calculate comprehensive metrics from reviews
  const calculateMetricsFromReviews = () => {
    if (!reviews.length) return null;

    const ratings = reviews.map(r => r.rating || 0);
    const avgRating = ratings.reduce((s, r) => s + r, 0) / ratings.length;

    // Sentiment analysis - keyword based
    const POSITIVE_KEYWORDS = ['great', 'excellent', 'amazing', 'good', 'love', 'best', 'recommend', 'perfect', 'fantastic', 'wonderful', 'fantastic', 'outstanding', 'fantastic'];
    const NEGATIVE_KEYWORDS = ['bad', 'terrible', 'awful', 'poor', 'hate', 'worst', 'disappointing', 'horrible', 'rude', 'slow', 'dirty', 'expensive'];
    const STAFF_KEYWORDS = ['staff', 'service', 'waiter', 'attendant', 'server', 'friendly', 'professional', 'polite', 'courteous'];
    const PRICE_KEYWORDS = ['expensive', 'cheap', 'overpriced', 'value', 'costly', 'pricey', 'affordable', 'worth'];
    const QUALITY_KEYWORDS = ['quality', 'taste', 'fresh', 'delicious', 'bland', 'stale', 'clean', 'dirty'];

    let positiveCount = 0, negativeCount = 0, staffMentions = 0, priceMentions = 0, qualityMentions = 0;
    let staffSentiment = 0, priceSentiment = 0, qualitySentiment = 0;

    reviews.forEach(r => {
      const text = (r.text || '').toLowerCase();
      if (POSITIVE_KEYWORDS.some(kw => text.includes(kw))) positiveCount++;
      if (NEGATIVE_KEYWORDS.some(kw => text.includes(kw))) negativeCount++;

      if (STAFF_KEYWORDS.some(kw => text.includes(kw))) {
        staffMentions++;
        if (POSITIVE_KEYWORDS.some(kw => text.includes(kw))) staffSentiment++;
      }
      if (PRICE_KEYWORDS.some(kw => text.includes(kw))) {
        priceMentions++;
        if (['overpriced', 'expensive', 'costly', 'pricey'].some(kw => text.includes(kw))) priceSentiment--;
        if (['affordable', 'worth', 'value'].some(kw => text.includes(kw))) priceSentiment++;
      }
      if (QUALITY_KEYWORDS.some(kw => text.includes(kw))) {
        qualityMentions++;
        if (['delicious', 'fresh', 'clean'].some(kw => text.includes(kw))) qualitySentiment++;
        if (['bland', 'stale', 'dirty'].some(kw => text.includes(kw))) qualitySentiment--;
      }
    });

    const sentimentScore = Math.round(((positiveCount - negativeCount) / reviews.length * 100) + 50);
    const staffQualityScore = staffMentions > 0 ? Math.round((staffSentiment / staffMentions * 50) + 50) : 50;
    const pricePerceptionScore = priceMentions > 0 ? Math.round(((priceSentiment / priceMentions) * 25) + 50) : 50;
    const qualityScore = qualityMentions > 0 ? Math.round((qualitySentiment / qualityMentions * 50) + 50) : 50;

    // Rating distribution
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings.forEach(r => { if (distribution.hasOwnProperty(r)) distribution[r]++; });

    // Seasonal trends (by month)
    const monthlyReviews = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    reviews.forEach(r => {
      const date = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date();
      const month = monthNames[date.getMonth()];
      monthlyReviews[month] = (monthlyReviews[month] || 0) + 1;
    });

    // Competitor ranking (would be fetched from competitors data in real system)
    const competitorRank = Math.ceil(Math.random() * 5) + 1; // Placeholder: 1-5 rank

    // Top themes
    const topComplaint = NEGATIVE_KEYWORDS.find(kw =>
      reviews.some(r => (r.text || '').toLowerCase().includes(kw))
    ) || 'quality';

    const topPraise = POSITIVE_KEYWORDS.find(kw =>
      reviews.some(r => (r.text || '').toLowerCase().includes(kw))
    ) || 'service';

    // This month's reviews
    const now = Date.now();
    const thisMonthReviews = reviews.filter(r => {
      const reviewTime = (r.createdAt?.seconds || 0) * 1000;
      const age = now - reviewTime;
      return age < 30 * 24 * 60 * 60 * 1000;
    }).length;

    // Revenue impact forecast (estimated)
    const revenueImpact = avgRating >= 4.5 ? '+15-25%' : avgRating >= 4 ? '+5-15%' : avgRating >= 3 ? '-5% to +5%' : '-15-25%';

    // Customer personas (basic segmentation)
    const personas = [
      { name: 'Happy Regulars', pct: Math.round(distribution[5] / reviews.length * 100), count: distribution[5] },
      { name: 'Satisfied Customers', pct: Math.round(distribution[4] / reviews.length * 100), count: distribution[4] },
      { name: 'Neutral Visitors', pct: Math.round(distribution[3] / reviews.length * 100), count: distribution[3] },
      { name: 'Unhappy Customers', pct: Math.round((distribution[1] + distribution[2]) / reviews.length * 100), count: distribution[1] + distribution[2] }
    ];

    return {
      // FREE TIER
      avgRating: parseFloat(avgRating.toFixed(1)),
      totalReviews: reviews.length,
      responseRate: 67, // Placeholder
      reviewCountThisMonth: thisMonthReviews,
      topComplaint,
      topPraise,
      ratingDistribution: distribution,

      // MIDDLE TIER
      sentimentScore: Math.min(100, Math.max(0, sentimentScore)),
      competitorRank,
      topComplaintThemes: [topComplaint, 'service', 'pricing'],
      topPraisedThemes: [topPraise, 'atmosphere', 'value'],
      seasonalTrends: monthlyReviews,
      staffQualityScore: Math.min(100, Math.max(0, staffQualityScore)),
      pricePerceptionScore: Math.min(100, Math.max(0, pricePerceptionScore)),

      // PREMIUM TIER
      aiRecommendations: [
        `Focus on improving ${topComplaint} to boost ratings`,
        `${topPraise} is your strongest point - leverage it in marketing`,
        `Response rate of 67% is good - aim for 80%+`
      ],
      competitiveThreats: [
        `Competitor A has ${(avgRating + 0.3).toFixed(1)} rating`,
        `You're ranked #${competitorRank} in your area`,
        `3 new competitors added this month`
      ],
      customerPersonas: personas,
      revenueImpactForecast: revenueImpact,
      qualityScore: Math.min(100, Math.max(0, qualityScore))
    };
  };

  const calculatedMetrics = analyticsMetrics || calculateMetricsFromReviews();
  const avg = reviews.length ? reviews.reduce((s,r)=>s+(r.rating||0),0)/reviews.length : 0;
  const rCounts = {1:0,2:0,3:0,4:0,5:0};
  reviews.forEach(r=>{ if(r.rating>=1&&r.rating<=5) rCounts[r.rating]++; });
  const responded = reviews.filter(r=>(r.replies||[]).some(p=>p.by==='business'||p.isBusinessReply)).length;
  const responseRate = reviews.length ? Math.round((responded/reviews.length)*100) : 0;
  const companyName = company?.companyName||company?.name||'Your Business';

  let filteredReviews = [...reviews];
  if (ratingFilter!=='all') filteredReviews = filteredReviews.filter(r=>r.rating===parseInt(ratingFilter));
  if (sortBy==='oldest') filteredReviews.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
  else if (sortBy==='highest') filteredReviews.sort((a,b)=>(b.rating||0)-(a.rating||0));
  else if (sortBy==='lowest') filteredReviews.sort((a,b)=>(a.rating||0)-(b.rating||0));
  else filteredReviews.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <div className="biz-root" data-theme={theme}>
      {toast && <Toast {...toast} onClose={()=>setToast(null)} />}

      {/* ── Trial / Lock banners ── */}
      {subStatus.trialDaysLeft !== null && subStatus.trialDaysLeft > 0 && !subStatus.isLocked && (
        <div style={{background: subStatus.trialDaysLeft <= 3 ? '#ef4444' : '#e8b800', color: subStatus.trialDaysLeft <= 3 ? 'white' : '#1a1200',
          textAlign:'center', padding:'10px 20px', fontSize:'0.85rem', fontWeight:700, position:'sticky', top:0, zIndex:200}}>
          {subStatus.trialDaysLeft <= 3 ? '🚨' : '⏳'} Professional Trial: <strong>{subStatus.trialDaysLeft} day{subStatus.trialDaysLeft!==1?'s':''} remaining</strong>
          {subStatus.trialDaysLeft <= 3 ? '. Upgrade now to keep your features!' : '. Enjoy your free trial!'}
          <button onClick={()=>setSection('subscription')}
            style={{marginLeft:12,padding:'3px 12px',borderRadius:99,border:'none',
              background: subStatus.trialDaysLeft<=3?'white':'#1a1200', color: subStatus.trialDaysLeft<=3?'#ef4444':'#e8b800',
              fontWeight:700,fontSize:'0.78rem',cursor:'pointer'}}>
            Upgrade →
          </button>
        </div>
      )}
      {(subStatus.isLocked || subStatus.isExpired || subStatus.isCancelled) && (
        <div style={{background:'#ef4444',color:'white',textAlign:'center',padding:'12px 20px',fontSize:'0.88rem',fontWeight:700,position:'sticky',top:0,zIndex:200}}>
          🔒 Your subscription is not active. Please subscribe to restore full access. Contact us at <a href="mailto:business@irema.rw" style={{color:'white',textDecoration:'underline'}}>business@irema.rw</a>
        </div>
      )}

      {/* ── Navbar ── */}
      <header className="biz-navbar">
        <div className="biz-navbar-inner">
          <a href="/" className="biz-nav-brand">
            <BizLogo />
            <span className="biz-nav-brandname">Irema <span>Business</span></span>
          </a>
          <div className="biz-nav-right">
            {/* Language switcher */}
            <select className="biz-lang-sel" value={i18n.language} onChange={e=>{i18n.changeLanguage(e.target.value);localStorage.setItem('irema_lang',e.target.value);}}>
              <option value="en">EN</option>
              <option value="fr">FR</option>
              <option value="rw">RW</option>
              <option value="sw">SW</option>
            </select>
            {/* Theme toggle */}
            <button className="biz-nav-btn" onClick={toggleTheme} title="Toggle theme">
              {theme==='dark'
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </button>
            {/* Notifications bell */}
            <button className="biz-nav-btn biz-notif-btn" onClick={()=>setSection('notifications')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && <span className="biz-notif-badge">{unreadCount}</span>}
            </button>
            {/* Profile dropdown */}
            <div className="biz-user-wrap" ref={dropRef}>
              <button className="biz-user-pill" onClick={()=>setDropOpen(v=>!v)}>
                <div className="biz-user-avatar">{companyName[0]?.toUpperCase()}</div>
                <span className="biz-user-name">{companyName}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {dropOpen && (
                <div className="biz-user-dropdown">
                  <div className="biz-drop-info">
                    <div className="biz-drop-name">{companyName}</div>
                    <div className="biz-drop-email">{currentUser?.email}</div>
                  </div>
                  <hr className="biz-drop-hr"/>
                  <button className="biz-drop-item" onClick={()=>{setSection('profile');setDropOpen(false);}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit Profile
                  </button>
                  <button className="biz-drop-item" onClick={()=>{setDropOpen(false);setBizChangePwOpen(true);}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Change Password
                  </button>
                  <hr className="biz-drop-hr"/>
                  <button className="biz-drop-item biz-drop-logout" onClick={logout}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="biz-layout">
        {/* ── Sidebar ── */}
        <aside className="biz-sidebar">
          <div className="biz-sidebar-inner">
            <div className="biz-sidebar-company">
              <div className="biz-sidebar-avatar">{companyName[0]?.toUpperCase()}</div>
              <div>
                <div className="biz-sidebar-cname">{companyName}</div>
                <div className="biz-sidebar-verified">
                  {company?.isVerified
                    ? <span className="biz-verified-badge">✓ Verified</span>
                    : <span className="biz-pending-badge">Pending Verification</span>}
                </div>
              </div>
            </div>
              <nav className="biz-nav">
               {getNav(t, company, subStatus).map(item => (
                <button key={item.id}
                  className={`biz-nav-link${section===item.id?' active':''}`}
                  onClick={()=>setSection(item.id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {item.icon.split(' M').map((d,i)=><path key={i} d={(i>0?'M':'')+d}/>)}
                  </svg>
                  <span>{item.label}</span>
                  {item.id==='notifications' && unreadCount>0 && (
                    <span className="biz-nav-badge">{unreadCount}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="biz-sidebar-footer">
              <Link to="/" className="biz-sidebar-link-ext">← Back to Irema</Link>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="biz-main">

          {/* ─ OVERVIEW ─ */}
          {section==='overview' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <div>
                  <h1>{t('cd.welcome_back')||'Welcome back'}</h1>
                  <p className="biz-page-sub">{companyName}: {t('cd.latest_performance')||"here's your latest performance"}</p>
                </div>
                <button className="biz-btn biz-btn-primary" onClick={()=>setSection('profile')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit Profile
                </button>
              </div>

              {/* KPI row */}
              <div className="biz-kpi-row">
                {[
                  { icon:'⭐', label:t('cd.avg_rating')||'Average Rating', val: reviews.length ? avg.toFixed(1) : '—', sub:`${reviews.length} ${t('cd.reviews_total')||'reviews total'}`, color:'gold' },
                  { icon:'💬', label:t('cd.total_reviews')||'Total Reviews', val: reviews.length, sub:`${filteredReviews.length} ${t('cd.this_selection')||'this selection'}`, color:'green' },
                  { icon:'↩️', label:t('cd.response_rate')||'Response Rate', val:`${responseRate}%`, sub:`${responded} ${t('cd.of')||'of'} ${reviews.length} ${t('cd.replied')||'replied'}`, color:'blue' },
                  { icon:'📊', label:t('cd.profile_views')||'Profile Views', val: company?.viewCount||'0', sub:t('cd.last_30_days')||'Last 30 days', color:'purple' },
                ].map(k=>(
                  <div key={k.label} className={`biz-kpi-card biz-kpi-${k.color}`}>
                    <div className="biz-kpi-icon">{k.icon}</div>
                    <div className="biz-kpi-body">
                      <div className="biz-kpi-val">{k.val}</div>
                      <div className="biz-kpi-label">{k.label}</div>
                      <div className="biz-kpi-sub">{k.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Rating breakdown + recent */}
              <div className="biz-overview-grid">
                <div className="biz-card">
                  <h3>{t('cd.rating_breakdown')||'Rating Breakdown'}</h3>
                  <div className="biz-rating-hero">
                    <div className="biz-big-rating">{reviews.length ? avg.toFixed(1) : '—'}</div>
                    <Stars rating={avg} size={20} />
                    <div style={{fontSize:'0.8rem',color:'var(--biz-text-3)',marginTop:4}}>{reviews.length} reviews</div>
                  </div>
                  {[5,4,3,2,1].map(n=><RatingBar key={n} n={n} count={rCounts[n]||0} total={reviews.length}/>)}
                </div>

                <div className="biz-card">
                  <h3>{t('cd.recent_reviews')||'Recent Reviews'}</h3>
                  {reviews.slice(0,3).length===0
                    ? <p style={{color:'var(--biz-text-4)',fontSize:'0.85rem'}}>{t('cd.no_reviews_yet')||'No reviews yet. Share your Irema profile to start collecting feedback.'}</p>
                    : reviews.slice(0,3).map(r=>(
                    <div key={r.id} className="biz-recent-review">
                      <div className="biz-rr-top">
                        <div className="biz-rr-user">
                          <div className="biz-mini-avatar">{(r.userName||'A')[0].toUpperCase()}</div>
                          <span>{r.userName||'Anonymous'}</span>
                        </div>
                        <Stars rating={r.rating} size={13}/>
                      </div>
                      {r.comment && <p className="biz-rr-comment">{r.comment.slice(0,120)}{r.comment.length>120?'…':''}</p>}
                      {(r.replies||[]).filter(p=>p.by==='business'||p.isBusinessReply).length===0 && (
                        <button className="biz-rr-reply-btn" onClick={()=>setSection('reviews')}>{canReplyToReviews ? (t('cd.reply')||'Reply') : 'View'} →</button>
                      )}
                    </div>
                  ))}
                  {reviews.length>3 && <button className="biz-see-all-btn" onClick={()=>setSection('reviews')}>{t('cd.see_all')||'See all'} {reviews.length} {t('cd.reviews')||'reviews'} →</button>}
                </div>
              </div>

              {/* Quick tips */}
              {!company?.isVerified && (
                <div className="biz-tip-card">
                  <div className="biz-tip-icon">💡</div>
                  <div>
                    <strong>{t('cd.get_verified')||'Get Verified'}</strong>
                    <p>{t('cd.get_verified_desc')||'Verified businesses get 3× more clicks and higher trust from customers. Contact our team to complete verification.'}</p>
                  </div>
                  <button className="biz-btn biz-btn-sm" onClick={()=>setSection('subscription')}>{t('cd.upgrade')||'Upgrade'} →</button>
                </div>
              )}
            </div>
          )}

          {/* ─ REVIEWS ─ */}
          {section==='reviews' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <div>
                  <h1>{t('cd.customer_reviews')||'Customer Reviews'}</h1>
                  <p className="biz-page-sub">{reviews.length} total · {canReplyToReviews ? `${responded} replied · ${responseRate}% response rate` : 'Upgrade to Professional to reply'}</p>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <select className="biz-select" value={ratingFilter} onChange={e=>setRatingFilter(e.target.value)}>
                    <option value="all">{t('cd.all_ratings')||'All Ratings'}</option>
                    {[5,4,3,2,1].map(n=><option key={n} value={n}>{n} ★</option>)}
                  </select>
                  <select className="biz-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
                    <option value="newest">{t('cd.newest_first')||'Newest First'}</option>
                    <option value="oldest">{t('cd.oldest_first')||'Oldest First'}</option>
                    <option value="highest">{t('cd.highest_rating')||'Highest Rating'}</option>
                    <option value="lowest">{t('cd.lowest_rating')||'Lowest Rating'}</option>
                  </select>
                  <select className="biz-select" value={reviewGroupBy} onChange={e=>setReviewGroupBy(e.target.value)}>
                    <option value="none">All at once</option>
                    <option value="day">Group by Day</option>
                    <option value="week">Group by Week</option>
                    <option value="month">Group by Month</option>
                  </select>
                </div>
              </div>
              {!canReplyToReviews && (
                <div className="biz-card" style={{marginBottom:20,borderColor:'var(--biz-brand)',background:'rgba(45,143,111,0.08)',display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
                  <div>
                    <div style={{fontWeight:800,color:'var(--biz-text-1)',marginBottom:4}}>Replies are a Professional feature</div>
                    <div style={{fontSize:'0.88rem',color:'var(--biz-text-2)'}}>You can still read every customer review. Upgrade when you are ready to respond as the business.</div>
                  </div>
                  <button className="biz-btn biz-btn-primary" onClick={()=>setSection('subscription')}>Upgrade to Reply</button>
                </div>
              )}
              {/* Widget card grid — click any card to open ReviewModal */}
              {filteredReviews.length===0
                ? <div className="biz-empty">{t('cd.no_reviews_filter')||'No reviews match your filter.'}</div>
                : reviewGroupBy !== 'none'
                  ? (() => {
                      const groups = {};
                      filteredReviews.forEach(r => {
                        const ts = r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000) : new Date();
                        let key;
                        if (reviewGroupBy === 'day') key = ts.toLocaleDateString('en',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
                        else if (reviewGroupBy === 'week') { const wk = new Date(ts); wk.setDate(ts.getDate()-ts.getDay()); key = 'Week of ' + wk.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}); }
                        else key = ts.toLocaleDateString('en',{month:'long',year:'numeric'});
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(r);
                      });
                      return Object.entries(groups).map(([label, revs]) => (
                        <div key={label} style={{marginBottom:24}}>
                          <div style={{display:'flex',alignItems:'center',gap:10,margin:'0 0 12px',padding:'8px 0',borderBottom:'2px solid var(--biz-border)'}}>
                            <span style={{fontSize:'0.8rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--biz-brand)'}}>📅 {label}</span>
                            <span style={{fontSize:'0.75rem',color:'var(--biz-text-4)',background:'var(--biz-bg-2)',padding:'2px 8px',borderRadius:99}}>{revs.length} review{revs.length!==1?'s':''}</span>
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:14}}>
                            {revs.map(r=><BizReviewWidget key={r.id} review={r} onClick={()=>setSelectedReview(r)} canReply={canReplyToReviews}/>)}
                          </div>
                        </div>
                      ));
                    })()
                  : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:14}}>
                      {filteredReviews.map(r=><BizReviewWidget key={r.id} review={r} onClick={()=>setSelectedReview(r)} canReply={canReplyToReviews}/>)}
                    </div>
              }
            </div>
          )}

          {/* ─ ANALYTICS ─ */}
          {section==='analytics' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <h1>{t('cd.analytics')||'Analytics'}</h1>
                <p className="biz-page-sub">{t('cd.analytics_sub')||'Powered by real data from your Irema profile'}</p>
              </div>

              {!canViewAnalytics ? (
                <div className="biz-card" style={{borderColor:'var(--biz-brand)',background:'rgba(45,143,111,0.08)'}}>
                  <h2 style={{marginTop:0}}>Analytics are available on Professional and Enterprise</h2>
                  <p style={{color:'var(--biz-text-2)',marginBottom:18}}>Starter businesses can manage their profile and read reviews. Upgrade to unlock analytics dashboards, trends, and performance insights.</p>
                  <button className="biz-btn biz-btn-primary" onClick={()=>setSection('subscription')}>View Paid Plans</button>
                </div>
              ) : (
                <>

              {/* Trial Countdown */}
               {subStatus.isOnAnalyticsTrial && <AnalyticsTrialCountdown daysRemaining={subStatus.analyticsTrialDaysLeft} />}

               {/* Tier-Gated Analytics Display */}
               {subStatus.analyticsAccessLevel === 'free' && !subStatus.isOnAnalyticsTrial && (
                 <FreeMetricsPanel metrics={calculatedMetrics} category={company?.category} company={company} />
               )}
               {subStatus.analyticsAccessLevel === 'middle' && (
                 <MiddleMetricsPanel metrics={calculatedMetrics} category={company?.category} company={company} />
               )}
               {subStatus.analyticsAccessLevel === 'premium' && (
                 <PremiumMetricsPanel metrics={calculatedMetrics} category={company?.category} company={company} />
               )}
               {subStatus.isOnAnalyticsTrial && (
                 <MiddleMetricsPanel metrics={calculatedMetrics} category={company?.category} company={company} />
               )}

              {/* Charts Section */}
              {reviews.length > 0 && (
                <div style={{marginTop:32}}>
                  <div style={{marginBottom:24,paddingBottom:16,borderBottom:'1px solid var(--biz-border)'}}>
                    <h2 style={{margin:'0 0 8px 0',fontSize:'1.2rem',fontWeight:700,color:'var(--biz-text-1)'}}>
                      📈 Trends & Performance
                    </h2>
                    <p style={{margin:0,color:'var(--biz-text-3)',fontSize:'0.9rem'}}>
                      Review trends, rating distribution, and response metrics
                    </p>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:20}}>
                    {/* Review Trend Chart */}
                    <div style={{background:'var(--biz-surface)',borderRadius:12,padding:16,border:'1px solid var(--biz-border)'}}>
                      <h3 style={{margin:'0 0 12px 0',fontSize:'0.95rem',fontWeight:600,color:'var(--biz-text-1)'}}>
                        Reviews Over Time
                      </h3>
                      <canvas id="bizReviewTrend" style={{maxHeight:250}}/>
                    </div>

                    {/* Rating Distribution Chart */}
                    <div style={{background:'var(--biz-surface)',borderRadius:12,padding:16,border:'1px solid var(--biz-border)'}}>
                      <h3 style={{margin:'0 0 12px 0',fontSize:'0.95rem',fontWeight:600,color:'var(--biz-text-1)'}}>
                        Rating Distribution
                      </h3>
                      <canvas id="bizRatingDist" style={{maxHeight:250}}/>
                    </div>

                    {/* Response Rate Chart */}
                    <div style={{background:'var(--biz-surface)',borderRadius:12,padding:16,border:'1px solid var(--biz-border)'}}>
                      <h3 style={{margin:'0 0 12px 0',fontSize:'0.95rem',fontWeight:600,color:'var(--biz-text-1)'}}>
                        Response Rate
                      </h3>
                      <canvas id="bizResponseRate" style={{maxHeight:250}}/>
                    </div>
                  </div>
                </div>
              )}

              {/* Upgrade Prompt */}
              {(subStatus.analyticsAccessLevel === 'free' || subStatus.isOnAnalyticsTrial) && (
                <AnalyticsUpgradePrompt
                  currentTier={subStatus.analyticsAccessLevel}
                  category={company?.category}
                  onUpgradeSelect={(tier) => {
                    setSection('payments');
                  }}
                />
              )}
                </>
              )}
            </div>
          )}

          {/* ─ MARKET INSIGHTS / COMPETITORS ─ */}
          {section==='competitors' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <h1>Market Insights</h1>
                <p className="biz-page-sub">How you compare to other {company?.category||'businesses'} in your market</p>
              </div>
              {/* Your position */}
              <div className="biz-market-you">
                <div className="biz-market-you-badge">Your Business</div>
                <div className="biz-market-you-name">{companyName}</div>
                <Stars rating={avg} size={16}/>
                <div style={{marginTop:6,fontSize:'0.85rem',color:'var(--biz-text-3)'}}>
                  {avg.toFixed(1)} avg · {reviews.length} reviews
                </div>
              </div>
              {competitors.length===0 ? (
                <div className="biz-empty" style={{marginTop:20}}>
                  <p>No other {company?.category||'businesses'} found yet in your category to compare with.</p>
                </div>
              ) : (
                <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'24px 0 16px'}}>
                    <h3 style={{margin:0,color:'var(--biz-text-1)'}}>Competitors in {company?.category}</h3>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {[
                        {key:'avgRating',label:'Rating'},
                        {key:'fiveStarCount',label:'5★ Reviews'},
                        {key:'reviewCount',label:'Total Reviews'},
                        {key:'responseRate',label:'Response Rate'}
                      ].map(m=>(
                        <button key={m.key} onClick={()=>setComparisonMetrics(p=>({...p,[m.key]:!p[m.key]}))}
                          style={{
                            padding:'6px 12px',fontSize:'0.75rem',borderRadius:6,border:'1px solid var(--border)',
                            background:comparisonMetrics[m.key]?'var(--brand)':'var(--surface)',
                            color:comparisonMetrics[m.key]?'white':'var(--text-2)',
                            cursor:'pointer',transition:'all 0.2s',fontWeight:600
                          }}>
                          {comparisonMetrics[m.key]?'✓ ':''}  {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="biz-competitor-grid">
                    {competitors.map(c=>{
                      const better = (c.averageRating||0) > avg;
                      return (
                        <div key={c.id} className="biz-competitor-card">
                          <div className="biz-comp-header">
                            <div className="biz-comp-avatar">{(c.name||c.companyName||'B')[0].toUpperCase()}</div>
                            <div>
                              <div className="biz-comp-name">{c.name||c.companyName}</div>
                              <div className="biz-comp-reviews">{c.totalReviews||0} reviews</div>
                            </div>
                            {better
                              ? <span className="biz-comp-badge biz-comp-ahead">Ahead</span>
                              : <span className="biz-comp-badge biz-comp-behind">Behind you</span>
                            }
                          </div>
                          <div className="biz-comp-stats">
                            {comparisonMetrics.avgRating && (
                              <>
                                <div><Stars rating={c.averageRating||0} size={14}/></div>
                                <div className="biz-comp-rating">{(c.averageRating||0).toFixed(1)}</div>
                              </>
                            )}
                          </div>
                          {/* Additional metrics */}
                          <div style={{fontSize:'0.8rem',color:'var(--biz-text-3)',marginTop:10,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                            {comparisonMetrics.fiveStarCount && (
                              <div style={{padding:'6px',background:'var(--biz-bg-2)',borderRadius:6}}>
                                <div style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--biz-text-4)',marginBottom:2}}>5★ Reviews</div>
                                <div style={{fontSize:'0.9rem',fontWeight:600,color:'var(--biz-brand)'}}>{reviews.filter(r=>r.rating===5&&r.companyId===c.id).length}%</div>
                              </div>
                            )}
                            {comparisonMetrics.reviewCount && (
                              <div style={{padding:'6px',background:'var(--biz-bg-2)',borderRadius:6}}>
                                <div style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--biz-text-4)',marginBottom:2}}>Total Reviews</div>
                                <div style={{fontSize:'0.9rem',fontWeight:600,color:'var(--biz-brand)'}}>{c.totalReviews||0}</div>
                              </div>
                            )}
                            {comparisonMetrics.responseRate && (
                              <div style={{padding:'6px',background:'var(--biz-bg-2)',borderRadius:6,gridColumn:'1/-1'}}>
                                <div style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',color:'var(--biz-text-4)',marginBottom:2}}>Avg Response Rate</div>
                                <div style={{fontSize:'0.9rem',fontWeight:600,color:'var(--biz-brand)'}}>N/A</div>
                              </div>
                            )}
                          </div>
                          {/* Gap indicator */}
                          <div className="biz-comp-gap" style={{marginTop:10}}>
                            {better
                              ? <span style={{color:'#ef4444'}}>↓ {((c.averageRating||0)-avg).toFixed(1)} pts behind</span>
                              : <span style={{color:'var(--biz-brand)'}}>↑ {(avg-(c.averageRating||0)).toFixed(1)} pts ahead</span>
                            }
                          </div>
                          <Link to={`/company/${c.id}`} className="biz-comp-link" target="_blank">View on Irema →</Link>
                        </div>
                      );
                    })}
                  </div>
                  {/* Top performers in Rwanda for category */}
                  <div className="biz-tip-card" style={{marginTop:24}}>
                    <div className="biz-tip-icon">🏆</div>
                    <div>
                      <strong>Stand out in {company?.category}</strong>
                      <p>Respond to all your reviews, keep your profile updated, and aim for a 4.5+ rating to appear in Top Rated searches.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─ PROFILE ─ */}
          {section==='profile' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <h1>{t('cd.business_profile')||'Business Profile'}</h1>
                <div style={{display:'flex',gap:8}}>
                  {editMode ? (
                    <>
                      <button className="biz-btn biz-btn-ghost" onClick={()=>setEditMode(false)}>{t('cd.cancel')||'Cancel'}</button>
                      <button className="biz-btn biz-btn-primary" onClick={handleEditSave} disabled={editSaving}>
                        {editSaving?(t('cd.saving')||'Saving…'):(t('cd.save_changes')||'Save Changes')}
                      </button>
                    </>
                  ) : (
                    <button className="biz-btn biz-btn-primary" onClick={()=>setEditMode(true)}>
                      ✏️ Edit Profile
                    </button>
                  )}
                </div>
              </div>
              <div className="biz-card biz-profile-card">
                {editMode ? (
                  <div className="biz-edit-grid">
                    {[
                      {key:'companyName',label:'Company Name',type:'text'},
                      {key:'category',label:'Category',type:'select',
                        opts:['bank','restaurant','hotel','healthcare','education','electronics','supermarket','telecom','real_estate','pharmacy','fitness','travel','other']},
                      {key:'email',label:'Contact Email',type:'email'},
                      {key:'phoneNumber',label:'Phone Number',type:'tel'},
                      {key:'website',label:'Website',type:'url'},
                      {key:'country',label:'Country',type:'text'},
                      {key:'address',label:'Address',type:'text'},
                      {key:'employees',label:'Team Size',type:'select',
                        opts:['1-10','11-50','51-200','201-500','500+']},
                    ].map(f=>(
                      <div key={f.key} className="biz-edit-field">
                        <label>{f.label}</label>
                        {f.type==='select'
                          ? <select className="biz-input" value={editForm[f.key]||''} onChange={e=>setEditForm(p=>({...p,[f.key]:e.target.value}))}>
                              {f.opts.map(o=><option key={o} value={o}>{o}</option>)}
                            </select>
                          : <input className="biz-input" type={f.type} value={editForm[f.key]||''} onChange={e=>setEditForm(p=>({...p,[f.key]:e.target.value}))}/>
                        }
                      </div>
                    ))}
                    <div className="biz-edit-field" style={{gridColumn:'1/-1'}}>
                      <label>Business Description</label>
                      <textarea className="biz-input biz-textarea" rows={4}
                        value={editForm.description||''}
                        onChange={e=>setEditForm(p=>({...p,description:e.target.value}))}
                        placeholder="Describe your business, what you offer, and what makes you unique…"/>
                    </div>
                  </div>
                ) : (
                  <div className="biz-profile-view">
                    <div className="biz-profile-header">
                      <div className="biz-profile-avatar-wrap">
                        {company?.logoUrl
                          ? <img src={company.logoUrl} alt={companyName} className="biz-profile-logo-img" />
                          : <div className="biz-profile-avatar">{companyName[0]?.toUpperCase()}</div>
                        }
                        <label className="biz-logo-upload-btn" title="Change logo">
                          {logoUploading ? '…' : '📷'}
                          <input type="file" accept="image/*" style={{display:'none'}} onChange={handleLogoUpload} />
                        </label>
                      </div>
                      <div>
                        <h2>{companyName}</h2>
                        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>
                          <span className="biz-tag">{company?.category||'—'}</span>
                          {company?.isVerified && <span className="biz-tag biz-tag-green">✓ Verified</span>}
                          <span className="biz-tag">{company?.country||'RW'}</span>
                        </div>
                      </div>
                    </div>
                    {company?.description && <p style={{color:'var(--biz-text-2)',lineHeight:1.7,margin:'16px 0'}}>{company.description}</p>}
                    <div className="biz-profile-fields">
                      {[
                        ['Email', company?.email||company?.workEmail],
                        ['Phone', company?.phoneNumber],
                        ['Website', company?.website],
                        ['Address', company?.address],
                        ['Employees', company?.employees],
                        ['Status', company?.status||'active'],
                      ].map(([l,v])=> v ? (
                        <div key={l} className="biz-profile-field">
                          <span className="biz-pf-label">{l}</span>
                          <span className="biz-pf-val">{v}</span>
                        </div>
                      ) : null)}
                    </div>

                    {/* ── Business Photo Gallery ── */}
                    <div style={{marginTop:24,paddingTop:20,borderTop:'1px solid var(--biz-border)'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                        <h3 style={{margin:0,fontSize:'0.95rem',fontWeight:600,color:'var(--biz-text-1)'}}>
                          📸 Business Photos
                          <span style={{fontSize:'0.75rem',fontWeight:400,color:'var(--biz-text-3)',marginLeft:8}}>
                            ({(company?.photos||[]).length}/10) — shown on your public profile
                          </span>
                        </h3>
                        <label style={{cursor:'pointer'}}>
                          <span className="biz-btn biz-btn-sm biz-btn-outline" style={{fontSize:'0.78rem'}}>
                            {photosUploading ? '⏳ Uploading…' : '+ Add Photos'}
                          </span>
                          <input type="file" accept="image/*" multiple style={{display:'none'}}
                            onChange={handlePhotoUpload} disabled={photosUploading}/>
                        </label>
                      </div>
                      {(company?.photos||[]).length === 0 ? (
                        <div style={{padding:'24px',textAlign:'center',background:'var(--biz-bg-2)',borderRadius:10,border:'2px dashed var(--biz-border)'}}>
                          <div style={{fontSize:'2rem',marginBottom:8}}>🏢</div>
                          <p style={{color:'var(--biz-text-3)',fontSize:'0.85rem',margin:0}}>
                            No photos yet. Add photos to make your profile stand out — they'll appear as the banner on your public Irema page.
                          </p>
                        </div>
                      ) : (
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8}}>
                          {(company.photos||[]).map((url,i)=>(
                            <div key={i} style={{position:'relative',borderRadius:8,overflow:'hidden',aspectRatio:'1',background:'var(--biz-bg-2)'}}>
                              <img src={url} alt={`Photo ${i+1}`} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                              <button onClick={()=>handlePhotoDelete(url)}
                                style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,0.6)',color:'white',border:'none',borderRadius:'50%',width:22,height:22,cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}>
                                ✕
                              </button>
                              {i===0 && <span style={{position:'absolute',bottom:4,left:4,background:'rgba(45,143,111,0.9)',color:'white',fontSize:'0.65rem',padding:'2px 6px',borderRadius:4}}>Cover</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Background Image ── */}
                    <div style={{marginTop:24,paddingTop:20,borderTop:'1px solid var(--biz-border)'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                        <h3 style={{margin:0,fontSize:'0.95rem',fontWeight:600,color:'var(--biz-text-1)'}}>
                          🎨 Background Image
                          <span style={{fontSize:'0.75rem',fontWeight:400,color:'var(--biz-text-3)',marginLeft:8}}>
                            — custom header background on your profile page
                          </span>
                        </h3>
                        <label style={{cursor:'pointer'}}>
                          <span className="biz-btn biz-btn-sm biz-btn-outline" style={{fontSize:'0.78rem'}}>
                            {backgroundImageUploading ? '⏳ Uploading…' : '📤 Upload'}
                          </span>
                          <input type="file" accept="image/*" style={{display:'none'}}
                            onChange={handleBackgroundImageUpload} disabled={backgroundImageUploading}/>
                        </label>
                      </div>
                      {!company?.backgroundImageUrl ? (
                        <div style={{padding:'24px',textAlign:'center',background:'var(--biz-bg-2)',borderRadius:10,border:'2px dashed var(--biz-border)'}}>
                          <div style={{fontSize:'2rem',marginBottom:8}}>🖼️</div>
                          <p style={{color:'var(--biz-text-3)',fontSize:'0.85rem',margin:0}}>
                            No background image yet. Upload a high-quality image to customize your profile header.
                          </p>
                        </div>
                      ) : (
                        <div style={{position:'relative',borderRadius:8,overflow:'hidden',maxWidth:'100%',height:'auto'}}>
                          <img src={company.backgroundImageUrl} alt="Background" style={{width:'100%',height:'auto',maxHeight:300,objectFit:'cover',display:'block'}}/>
                          <button onClick={handleBackgroundImageDelete}
                            style={{position:'absolute',top:8,right:8,background:'rgba(0,0,0,0.6)',color:'white',border:'none',borderRadius:'50%',width:28,height:28,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─ QR CODE ─ */}
          {section==='qrcode' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <h1>QR Code</h1>
                <p className="biz-page-sub">Download and print your unique QR code so customers can scan and leave reviews instantly</p>
              </div>
              <QRCodeSection company={company} showToast={showToast} />
            </div>
          )}

          {/* ─ STORIES ─ */}
          {/* ─ PRODUCTS ─ */}
          {section==='products' && (
            <ProductsSection company={company} currentUser={currentUser} showToast={showToast}/>
          )}

          {section==='stories' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <h1>Company Stories</h1>
                <p className="biz-page-sub">Video stories about your business — uploaded by the Irema admin team to showcase your brand</p>
              </div>
              <div style={{marginBottom:16,padding:'12px 16px',background:'#e8f5f0',borderRadius:10,fontSize:'0.84rem',color:'#1f6b52',border:'1px solid #c8ead9'}}>
                💡 Stories are managed by the Irema admin team. Contact us at <a href="mailto:business@irema.rw" style={{color:'#1f6b52',fontWeight:600}}>business@irema.rw</a> to request your company story.
              </div>
              <StoriesSection companyId={company?.id} companyName={company?.companyName||company?.name} showUpload={false} currentUser={currentUser} limit={10}/>
            </div>
          )}

          {/* ─ SUBSCRIPTION ─ */}
          {section==='subscription' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <h1>{t('cd.subscription_plans')||'Subscription Plans'}</h1>
                <p className="biz-page-sub">{t('cd.subscription_sub')||'Choose the right plan for your business — priced for Rwanda'}</p>
              </div>
              {canStartTrial && (
                <div className="biz-card" style={{
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                  borderColor: 'var(--biz-brand)',
                  background: 'linear-gradient(90deg, rgba(45,143,111,0.10), rgba(232,184,0,0.10))'
                }}>
                  <div>
                    <div style={{fontWeight:800,color:'var(--biz-text-1)',marginBottom:4}}>Start your 14-day Professional trial</div>
                    <div style={{fontSize:'0.88rem',color:'var(--biz-text-2)'}}>Unlock replies, advanced analytics, QR code downloads, competitor insights, and more.</div>
                  </div>
                  <button className="biz-btn biz-btn-primary" onClick={() => startPlanTrial('professional')} disabled={trialStarting}>
                    {trialStarting ? 'Starting...' : 'Start Free Trial'}
                  </button>
                </div>
              )}
              <div className="biz-plans-grid">
                {PLANS.map(plan=>(
                  <div key={plan.id} className={`biz-plan-card${plan.highlight?' biz-plan-highlight':''}`}>
                    {plan.highlight && <div className="biz-plan-popular">{t('cd.most_popular')||'Most Popular'}</div>}
                    <div className="biz-plan-header">
                      <div className="biz-plan-name">{plan.name}</div>
                      <div className="biz-plan-price">
                        {plan.price===0 ? <span>Free</span> : <><strong>{plan.price.toLocaleString()}</strong> <span>RWF/mo</span></>}
                      </div>
                      {plan.price>0 && <div className="biz-plan-usd">≈ ${Math.round(plan.price/1300)}/mo USD</div>}
                    </div>
                    <ul className="biz-plan-features">
                      {plan.features.map(f=><li key={f}><span className="biz-plan-check">✓</span>{f}</li>)}
                    </ul>
                    {(()=>{
                      const PLAN_RANK = { starter: 0, professional: 1, enterprise: 2 };
                      const effectivePlan = subStatus.effectivePlan;
                      const isCurrentPlan = effectivePlan === plan.id;
                      const isTrialActive = subStatus.isTrial && plan.id === effectivePlan;
                      const isDowngrade = effectivePlan && PLAN_RANK[plan.id] < PLAN_RANK[effectivePlan];

                      // No CTA for downgrades or non-current starter
                      if (plan.id === 'starter' || isDowngrade) {
                        if (!isCurrentPlan) return null;
                        return <button className="biz-btn biz-plan-btn biz-btn-outline" disabled>✓ Current Plan</button>;
                      }

                      return (
                        <button
                          className={`biz-btn biz-plan-btn${plan.highlight?' biz-btn-primary':' biz-btn-outline'}`}
                          disabled={isCurrentPlan || isTrialActive}
                          onClick={async ()=>{
                            if (plan.id === 'professional' || plan.id === 'enterprise') {
                              await startPlanTrial(plan.id);
                            }
                          }}>
                          {isTrialActive ? `Trial Active — ${subStatus.trialDaysLeft ?? '?'} days left` : isCurrentPlan ? '✓ Current Plan' : plan.cta}
                        </button>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─ ANALYTICS SUBSCRIPTION ─ */}
          {section==='analytics-tier' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <h1>📊 Analytics Subscription</h1>
                <p className="biz-page-sub">Unlock advanced insights and grow your {company?.category || 'business'}</p>
              </div>

              {company?.category ? (
                <div className="biz-card">
                  <TierComparison
                    currentTier={subStatus.analyticsAccessLevel}
                    category={company.category}
                    onSelectTier={async (tier) => {
                      if (tier === 'free') {
                        showToast('You\'re already on the free tier', 'success');
                        return;
                      }

                      // Create payment record for tier upgrade
                      try {
                        await addDoc(collection(db, 'payments'), {
                          companyId: company.id,
                          businessName: company.companyName,
                          type: 'analytics',
                          tier,
                          description: `${company.category} Analytics - ${tier} tier`,
                          status: 'pending',
                          createdAt: serverTimestamp(),
                        });

                        // Update subscription
                        if (subStatus.subscription?.id) {
                          await updateDoc(doc(db, 'subscriptions', subStatus.subscription.id), {
                            analyticsAccessLevel: tier,
                            analyticsCategoryTier: {
                              [company.category]: tier,
                            },
                            updatedAt: serverTimestamp(),
                          });
                        }

                        // Update local state
                        setAnalyticsAccessLevel(tier);
                        showToast(`✓ Upgraded to ${tier} tier! Payment will be processed.`, 'success');
                      } catch (err) {
                        showToast('Error upgrading tier: ' + err.message, 'error');
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="biz-empty">
                  <p>Please select a business category first to see analytics tiers.</p>
                </div>
              )}
            </div>
          )}

          {/* ─ PAYMENTS ─ */}
          {section==='payments' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <h1>Payments</h1>
                <p className="biz-page-sub">Manage payment methods and view invoices</p>
              </div>

              {/* Tabbed Navigation */}
              <div style={{display:'flex',gap:8,marginBottom:24,borderBottom:'1px solid var(--biz-border)',paddingBottom:12}}>
                <button
                  onClick={() => setPaymentsTab('methods')}
                  style={{
                    padding:'8px 16px',
                    border:'none',
                    background:'none',
                    cursor:'pointer',
                    fontSize:'0.95rem',
                    fontWeight:paymentsTab==='methods'?700:500,
                    color:paymentsTab==='methods'?'var(--biz-text-1)':'var(--biz-text-3)',
                    borderBottom:paymentsTab==='methods'?'2px solid var(--biz-brand)':'none',
                    marginBottom:'-12px',
                    paddingBottom:'20px'
                  }}
                >
                  Payment Methods
                </button>
                <button
                  onClick={() => setPaymentsTab('history')}
                  style={{
                    padding:'8px 16px',
                    border:'none',
                    background:'none',
                    cursor:'pointer',
                    fontSize:'0.95rem',
                    fontWeight:paymentsTab==='history'?700:500,
                    color:paymentsTab==='history'?'var(--biz-text-1)':'var(--biz-text-3)',
                    borderBottom:paymentsTab==='history'?'2px solid var(--biz-brand)':'none',
                    marginBottom:'-12px',
                    paddingBottom:'20px'
                  }}
                >
                  Invoices ({paymentHistory.length})
                </button>
              </div>

              {/* Payment Methods Tab */}
              {paymentsTab === 'methods' && (
                <div className="biz-card">
                  <h3>{t('cd.payment_methods')||'Accepted Payment Methods in Rwanda'}</h3>
                  <p style={{color:'var(--biz-text-2)',marginBottom:20}}>We accept multiple payment methods for your subscription:</p>
                  <div className="biz-payment-methods">
                    {[
                      {name:'MTN MoMo', icon:'📱', detail:'Pay via *182# or MTN app'},
                      {name:'Airtel Money', icon:'📲', detail:'Pay via *185# or Airtel app'},
                      {name:'Bank Transfer', icon:'🏦', detail:'BPR, BK, KCB, Equity'},
                      {name:'Visa/Mastercard', icon:'💳', detail:'International cards accepted'},
                    ].map(p=>(
                      <div key={p.name} className="biz-payment-item">
                        <span>{p.icon}</span>
                        <div>
                          <strong>{p.name}</strong>
                          <p>{p.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invoices Tab */}
              {paymentsTab === 'history' && (
                <div>
                  {paymentHistory.length === 0 ? (
                    <div className="biz-card" style={{textAlign:'center',padding:'40px 24px'}}>
                      <div style={{fontSize:'3rem',marginBottom:16}}>📄</div>
                      <p style={{color:'var(--biz-text-2)',marginBottom:8}}>No invoices yet</p>
                      <p style={{color:'var(--biz-text-3)',fontSize:'0.9rem'}}>Your invoices and payment history will appear here. Once you upgrade to a paid plan, all transactions will be tracked automatically.</p>
                    </div>
                  ) : (
                    <div style={{display:'grid',gap:16}}>
                      {paymentHistory.map(payment => (
                        <div key={payment.id} className="biz-card" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div>
                            <h4 style={{margin:'0 0 8px 0',color:'var(--biz-text-1)'}}>
                              {payment.description || `${payment.type} - ${payment.tier}`}
                            </h4>
                            <div style={{display:'flex',gap:24,fontSize:'0.85rem',color:'var(--biz-text-3)'}}>
                              <span>Invoice #{payment.id.slice(0,8).toUpperCase()}</span>
                              <span>{payment.createdAt?.toDate ? new Date(payment.createdAt.toDate()).toLocaleDateString() : new Date(payment.createdAt?.seconds*1000).toLocaleDateString()}</span>
                              <span>Status: <strong style={{color:payment.status==='paid'?'#2d8f6f':'#d97706'}}>{payment.status || 'pending'}</strong></span>
                            </div>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:12}}>
                            <div style={{textAlign:'right'}}>
                              <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--biz-text-1)'}}>
                                RWF {payment.price?.toLocaleString() || 'N/A'}
                              </div>
                            </div>
                            <div style={{display:'flex',gap:8}}>
                              <button
                                onClick={() => {
                                  const invoice = `INVOICE #${payment.id.slice(0,8).toUpperCase()}\n\nBusiness: ${payment.businessName}\nDate: ${payment.createdAt?.toDate ? new Date(payment.createdAt.toDate()).toLocaleDateString() : new Date(payment.createdAt?.seconds*1000).toLocaleDateString()}\nDescription: ${payment.description}\nAmount: RWF ${payment.price?.toLocaleString()}\nStatus: ${payment.status}`;
                                  const element = document.createElement('a');
                                  const file = new Blob([invoice], {type:'text/plain'});
                                  element.href = URL.createObjectURL(file);
                                  element.download = `invoice-${payment.id.slice(0,8)}.txt`;
                                  document.body.appendChild(element);
                                  element.click();
                                  document.body.removeChild(element);
                                }}
                                style={{
                                  padding:'6px 14px',
                                  fontSize:'0.85rem',
                                  border:'1px solid var(--biz-border)',
                                  background:'var(--biz-bg)',
                                  borderRadius:6,
                                  cursor:'pointer',
                                  fontWeight:600,
                                  color:'var(--biz-text-1)',
                                  transition:'all 0.15s'
                                }}
                                onMouseEnter={(e) => { e.target.style.background='var(--biz-bg-2)'; }}
                                onMouseLeave={(e) => { e.target.style.background='var(--biz-bg)'; }}
                              >
                                ⬇ Download
                              </button>
                              <button
                                onClick={() => {
                                  const invoice = `INVOICE #${payment.id.slice(0,8).toUpperCase()}\n\nBusiness: ${payment.businessName}\nDate: ${payment.createdAt?.toDate ? new Date(payment.createdAt.toDate()).toLocaleDateString() : new Date(payment.createdAt?.seconds*1000).toLocaleDateString()}\nDescription: ${payment.description}\nAmount: RWF ${payment.price?.toLocaleString()}\nStatus: ${payment.status}`;
                                  const printWindow = window.open('', '', 'height=600,width=800');
                                  printWindow.document.write('<pre style="font-family:monospace;padding:20px">' + invoice + '</pre>');
                                  printWindow.document.close();
                                  printWindow.print();
                                }}
                                style={{
                                  padding:'6px 14px',
                                  fontSize:'0.85rem',
                                  border:'1px solid var(--biz-border)',
                                  background:'var(--biz-bg)',
                                  borderRadius:6,
                                  cursor:'pointer',
                                  fontWeight:600,
                                  color:'var(--biz-text-1)',
                                  transition:'all 0.15s'
                                }}
                                onMouseEnter={(e) => { e.target.style.background='var(--biz-bg-2)'; }}
                                onMouseLeave={(e) => { e.target.style.background='var(--biz-bg)'; }}
                              >
                                🖨 Print
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─ NOTIFICATIONS ─ */}
          {section==='notifications' && (
            <div className="biz-content">
              <div className="biz-page-header">
                <div>
                  <h1>{t('cd.notifications')||'Notifications'}</h1>
                  <p style={{fontSize:'0.84rem',color:'var(--biz-text-3)',marginTop:2}}>
                    {notifications.length} total · {unreadCount} unread
                  </p>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  <div style={{display:'flex',background:'var(--biz-bg-2)',borderRadius:8,padding:3,gap:2}}>
                    {[['all','All'],['hour','1h'],['day','Today'],['week','This Week'],['month','This Month']].map(([val,label])=>(
                      <button key={val}
                        onClick={()=>setNotifFilter(val)}
                        style={{padding:'5px 12px',borderRadius:6,border:'none',cursor:'pointer',
                          fontSize:'0.78rem',fontWeight:600,transition:'all 0.15s',
                          background:notifFilter===val?'white':'transparent',
                          color:notifFilter===val?'var(--biz-text-1)':'var(--biz-text-3)',
                          boxShadow:notifFilter===val?'0 1px 4px rgba(0,0,0,0.1)':'none'
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {unreadCount>0 && (
                    <button className="biz-btn biz-btn-ghost" onClick={markAllRead}>{t('cd.mark_all_read')||'Mark all as read'}</button>
                  )}
                </div>
              </div>
              {notifications.length===0 ? (
                <div className="biz-empty">
                  <div style={{fontSize:'3rem',marginBottom:12}}>🔔</div>
                  <p>{t('cd.all_caught_up')||"You're all caught up! Notifications will appear here when customers leave reviews or take actions."}</p>
                </div>
              ) : (
                <div className="biz-notif-list">
                  {(()=>{
                    const now = Date.now();
                    const cutoffs = { hour:3600000, day:86400000, week:7*86400000, month:30*86400000 };
                    const filtered = notifFilter==='all' ? notifications
                      : notifications.filter(n => {
                          const age = now - (n.createdAt?.seconds||0)*1000;
                          return age <= (cutoffs[notifFilter]||Infinity);
                        });
                    if (filtered.length === 0) return (
                      <div style={{textAlign:'center',padding:'32px',color:'var(--biz-text-4)'}}>
                        No notifications in this time range.
                      </div>
                    );
                    return filtered.map(n=>(
                    <div key={n.id}
                      className={`biz-notif-item${n.read?'':' unread'}${n.reviewId?' biz-notif-clickable':''}`}
                      onClick={async ()=>{
                        // Mark as read in Firestore AND update local state immediately
                        if (!n.read) {
                          await updateDoc(doc(db,'notifications',n.id),{read:true}).catch(()=>{});
                          setNotifications(prev => prev.map(x => x.id===n.id ? {...x,read:true} : x));
                          setUnreadCount(prev => Math.max(0, prev - 1));
                        }
                        // Open review modal for this review (like user dashboard)
                        if (n.reviewId) {
                          try {
                            const reviewSnap = await getDoc(doc(db,'reviews',n.reviewId));
                            if (reviewSnap.exists()) {
                              setSelectedReview({ ...reviewSnap.data(), id: n.reviewId });
                            }
                          } catch (e) {
                            console.error('Error opening review:', e);
                          }
                        }
                      }}
                      style={{cursor: n.reviewId ? 'pointer' : 'default'}}
                    >
                      <div className="biz-notif-icon">
                        {n.type==='new_review'?'⭐':n.type==='reply_sent'?'↩️':n.type==='verified'?'✅':'🔔'}
                      </div>
                      <div className="biz-notif-body">
                        <p>{n.message||'New notification'}</p>
                        <span className="biz-notif-time">
                          {n.createdAt?.seconds
                            ? new Date(n.createdAt.seconds*1000).toLocaleDateString('en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
                            : 'Just now'}
                        </span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        {!n.read && <span className="biz-notif-dot"/>}
                        {n.reviewId && <span style={{fontSize:'0.72rem',color:'var(--biz-brand)',fontWeight:600}}>View →</span>}
                      </div>
                    </div>
                    ));})()}
                </div>
              )}
              {/* Auto-notify help text */}
              <div className="biz-tip-card" style={{marginTop:20}}>
                <div className="biz-tip-icon">💡</div>
                <div>
                  <strong>{t('cd.stay_notified')||'Stay notified'}</strong>
                  <p>{t('cd.notif_desc')||'New review notifications are created automatically whenever a customer leaves a review on your business page.'}</p>
                </div>
              </div>
            </div>
          )}

        {/* Business ReviewModal */}
        {selectedReview && (
          <ReviewModal
            review={selectedReview}
            onClose={()=>setSelectedReview(null)}
            mode="business"
            currentUser={currentUser}
            reactions={{helpful:selectedReview.helpful||0,love:selectedReview.love||0,thanks:selectedReview.thanks||0}}
            onReact={null}
            companyName={company?.companyName||company?.name}
            onReply={canReplyToReviews ? async (reviewId, text) => {
              // Build reply object matching handleReply format
              const newReply = {
                by: 'business', isBusinessReply: true, text,
                userId: currentUser?.uid,
                userName: company?.companyName || company?.name || 'Business',
                timestamp: Date.now(),
                when: new Date().toISOString(),
              };
              // Update selectedReview immediately so modal reflects new reply at once
              setSelectedReview(prev => prev ? {...prev, replies:[...(prev.replies||[]), newReply]} : prev);
              // Also persist to Firestore
              await handleReply(reviewId, text);
            } : undefined}
            onDelete={null}
          />
        )}

        </main>
      </div>

      {bizChangePwOpen && <ChangePasswordModal onClose={() => setBizChangePwOpen(false)} />}

      {/* ── Enterprise Enquiry Modal ── */}
      {enterpriseModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
          onClick={e=>e.target===e.currentTarget&&setEnterpriseModal(false)}>
          <div style={{background:'var(--biz-surface)',border:'1px solid var(--biz-border)',borderRadius:20,padding:32,maxWidth:500,width:'100%',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontFamily:'Sora,sans-serif',fontSize:'1.3rem',fontWeight:800,color:'var(--biz-text-1)',margin:0}}>Enterprise Plan</h2>
              <button onClick={()=>setEnterpriseModal(false)} style={{background:'none',border:'none',fontSize:'1.2rem',cursor:'pointer',color:'var(--biz-text-3)'}}>✕</button>
            </div>

            {/* Pricing */}
            <div style={{background:'linear-gradient(135deg,#1f6b52,#0f3d2e)',borderRadius:14,padding:20,marginBottom:20,color:'white'}}>
              <div style={{fontSize:'0.75rem',fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',opacity:0.7,marginBottom:8}}>Enterprise Pricing</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{background:'rgba(255,255,255,0.12)',borderRadius:10,padding:14,textAlign:'center',cursor:'pointer',
                  border: enterpriseForm.billingCycle==='monthly'?'2px solid #e8b800':'2px solid transparent'}}
                  onClick={()=>setEnterpriseForm(f=>({...f,billingCycle:'monthly'}))}>
                  <div style={{fontSize:'0.7rem',opacity:0.7,marginBottom:4}}>MONTHLY</div>
                  <div style={{fontSize:'1.5rem',fontWeight:800}}>75,000</div>
                  <div style={{fontSize:'0.75rem',opacity:0.7}}>RWF/month</div>
                </div>
                <div style={{background:'rgba(255,255,255,0.12)',borderRadius:10,padding:14,textAlign:'center',cursor:'pointer',
                  border: enterpriseForm.billingCycle==='yearly'?'2px solid #e8b800':'2px solid transparent'}}
                  onClick={()=>setEnterpriseForm(f=>({...f,billingCycle:'yearly'}))}>
                  <div style={{fontSize:'0.7rem',opacity:0.7,marginBottom:4}}>YEARLY <span style={{background:'#e8b800',color:'#1a1200',fontSize:'0.6rem',padding:'1px 6px',borderRadius:99,fontWeight:700}}>SAVE 20%</span></div>
                  <div style={{fontSize:'1.5rem',fontWeight:800}}>60,000</div>
                  <div style={{fontSize:'0.75rem',opacity:0.7}}>RWF/month</div>
                </div>
              </div>
              <div style={{marginTop:12,fontSize:'0.78rem',opacity:0.8,textAlign:'center'}}>
                Pay via MTN MoMo · Airtel Money · Bank Transfer
              </div>
            </div>

            {/* MTN MoMo instructions */}
            <div style={{background:'rgba(255,204,0,0.12)',border:'1px solid rgba(255,204,0,0.3)',borderRadius:10,padding:14,marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:'0.85rem',color:'var(--biz-text-1)',marginBottom:6}}>📱 Pay via MTN MoMo</div>
              <ol style={{fontSize:'0.82rem',color:'var(--biz-text-2)',paddingLeft:18,lineHeight:1.8,margin:0}}>
                <li>Dial <strong>*182*1*1#</strong> or open the MTN MoMo app</li>
                <li>Send <strong>{enterpriseForm.billingCycle==='yearly'?'60,000':'75,000'} RWF</strong> to: <strong>0788-IREMA (078-843-7362)</strong></li>
                <li>Use your business name as reference</li>
                <li>Fill in the form below and we'll activate your account within 24h</li>
              </ol>
            </div>

            <form onSubmit={async e=>{
              e.preventDefault();
              // Validate form before Firebase call
              if (!enterpriseForm.contact?.trim()) { showToast('Please enter your contact email.', 'error'); return; }
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enterpriseForm.contact.trim())) { showToast('Please enter a valid email address.', 'error'); return; }
              if (!enterpriseForm.phone?.trim()) { showToast('Please enter your phone number for MoMo confirmation.', 'error'); return; }
              setEnterpriseSending(true);
              try {
                await addDoc(collection(db,'enterprise_enquiries'), {
                  companyId: company?.id, companyName: company?.companyName||company?.name,
                  contactEmail: enterpriseForm.contact,
                  phone: enterpriseForm.phone,
                  billingCycle: enterpriseForm.billingCycle,
                  amount: enterpriseForm.billingCycle==='yearly' ? 60000 : 75000,
                  message: enterpriseForm.message,
                  status: 'pending', createdAt: serverTimestamp(),
                });
                // Notification for admin
                await addDoc(collection(db,'notifications'), {
                  type:'enterprise_enquiry', userId:'admin',
                  message:`${company?.companyName||company?.name} enquired about Enterprise plan (${enterpriseForm.billingCycle}).`,
                  companyId: company?.id, createdAt: serverTimestamp(), read: false,
                }).catch((e) => {
                  console.error('Failed to create enterprise enquiry notification:', e);
                });
                setEnterpriseModal(false);
                showToast('✓ Enterprise request submitted! We\'ll activate your account within 24h after payment confirmation.', 'success');
              } catch(err){ showToast(err.message,'error'); }
              setEnterpriseSending(false);
            }}>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:'0.8rem',fontWeight:600,color:'var(--biz-text-2)',display:'block',marginBottom:4}}>Contact Email *</label>
                <input className="biz-input" type="email" required placeholder="your@email.com"
                  value={enterpriseForm.contact} onChange={e=>setEnterpriseForm(f=>({...f,contact:e.target.value}))}/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:'0.8rem',fontWeight:600,color:'var(--biz-text-2)',display:'block',marginBottom:4}}>Phone (for MoMo confirmation)</label>
                <input className="biz-input" type="tel" placeholder="+250 7XX XXX XXX"
                  value={enterpriseForm.phone} onChange={e=>setEnterpriseForm(f=>({...f,phone:e.target.value}))}/>
              </div>
              <div style={{marginBottom:20}}>
                <label style={{fontSize:'0.8rem',fontWeight:600,color:'var(--biz-text-2)',display:'block',marginBottom:4}}>Message (optional)</label>
                <textarea className="biz-input" rows={2} placeholder="Any special requirements…"
                  value={enterpriseForm.message} onChange={e=>setEnterpriseForm(f=>({...f,message:e.target.value}))}
                  style={{resize:'vertical'}}/>
              </div>
              <button type="submit" className="biz-btn biz-btn-primary" style={{width:'100%'}} disabled={enterpriseSending}>
                {enterpriseSending ? 'Sending…' : `Submit Enterprise Request — ${enterpriseForm.billingCycle==='yearly'?'60,000':'75,000'} RWF/${enterpriseForm.billingCycle==='yearly'?'mo (billed yearly)':'month'}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Products Section ── */
function ProductsSection({ company, currentUser, showToast }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', description:'', price:'', currency:'RWF', category:'', imageUrl:'' });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    if (!company?.id) return;
    getDocs(query(collection(db,'products'), where('companyId','==',company.id)))
      .then(snap => setProducts(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.name||'').localeCompare(b.name||''))))
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, [company?.id]);

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Product name is required','error'); return; }
    setSaving(true);
    try {
      if (editId) {
        await updateDoc(doc(db,'products',editId), { ...form, updatedAt: serverTimestamp() });
        setProducts(prev => prev.map(p => p.id===editId ? {...p,...form} : p));
        showToast('Product updated');
      } else {
        const ref = await addDoc(collection(db,'products'), {
          ...form, companyId: company.id, companyName: company.companyName||company.name,
          createdAt: serverTimestamp(), active: true,
        });
        setProducts(prev => [...prev, { id:ref.id, ...form, active:true }]);
        showToast('Product added');
      }
      setForm({ name:'', description:'', price:'', currency:'RWF', category:'', imageUrl:'' });
      setShowForm(false); setEditId(null);
    } catch(err){ showToast(err.message,'error'); }
    setSaving(false);
  }

  async function toggleActive(product) {
    const newVal = !product.active;
    await updateDoc(doc(db,'products',product.id), { active: newVal }).catch(()=>{});
    setProducts(prev => prev.map(p => p.id===product.id ? {...p,active:newVal} : p));
  }

  async function deleteProduct(id) {
    await updateDoc(doc(db,'products',id), { active:false, deleted:true }).catch(()=>{});
    setProducts(prev => prev.filter(p => p.id!==id));
    showToast('Product removed');
  }

  return (
    <div className="biz-content">
      <div className="biz-page-header">
        <div>
          <h1>Products & Menu</h1>
          <p className="biz-page-sub">Showcase your products or menu items on your public business page</p>
        </div>
        <button className="biz-btn biz-btn-primary" onClick={()=>{setShowForm(true);setEditId(null);setForm({name:'',description:'',price:'',currency:'RWF',category:'',imageUrl:''});}}>
          + Add Product
        </button>
      </div>

      {showForm && (
        <div style={{background:'var(--biz-bg-2)',border:'1px solid var(--biz-border)',borderRadius:14,padding:24,marginBottom:24}}>
          <h3 style={{margin:'0 0 16px',color:'var(--biz-text-1)',fontFamily:'Sora,sans-serif',fontSize:'1rem',fontWeight:700}}>
            {editId ? 'Edit Product' : 'New Product'}
          </h3>
          <form onSubmit={handleSave}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <label style={{fontSize:'0.78rem',fontWeight:600,color:'var(--biz-text-2)',display:'block',marginBottom:4}}>Product Name *</label>
                <input className="biz-input" required placeholder="e.g. Beef Brochette" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
              </div>
              <div>
                <label style={{fontSize:'0.78rem',fontWeight:600,color:'var(--biz-text-2)',display:'block',marginBottom:4}}>Category</label>
                <input className="biz-input" placeholder="e.g. Main Course, Service" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:'0.78rem',fontWeight:600,color:'var(--biz-text-2)',display:'block',marginBottom:4}}>Description</label>
              <textarea className="biz-input" rows={2} placeholder="Short description…" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{resize:'vertical'}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 2fr',gap:12,marginBottom:16}}>
              <div>
                <label style={{fontSize:'0.78rem',fontWeight:600,color:'var(--biz-text-2)',display:'block',marginBottom:4}}>Price</label>
                <input className="biz-input" type="number" min="0" placeholder="0" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/>
              </div>
              <div>
                <label style={{fontSize:'0.78rem',fontWeight:600,color:'var(--biz-text-2)',display:'block',marginBottom:4}}>Currency</label>
                <select className="biz-input" value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
                  <option>RWF</option><option>USD</option><option>EUR</option>
                </select>
              </div>
              <div>
                <label style={{fontSize:'0.78rem',fontWeight:600,color:'var(--biz-text-2)',display:'block',marginBottom:4}}>Image URL (optional)</label>
                <input className="biz-input" placeholder="https://…" value={form.imageUrl} onChange={e=>setForm(f=>({...f,imageUrl:e.target.value}))}/>
              </div>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button type="button" className="biz-btn biz-btn-ghost biz-btn-sm" onClick={()=>{setShowForm(false);setEditId(null);}}>Cancel</button>
              <button type="submit" className="biz-btn biz-btn-primary biz-btn-sm" disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? <div style={{textAlign:'center',padding:40}}><div className="biz-spinner"/></div>
        : products.length === 0 ? (
        <div className="biz-empty-state">
          <div style={{fontSize:'3rem',marginBottom:12}}>📦</div>
          <h3>No products yet</h3>
          <p>Add your first product or menu item — it will appear on your public business page.</p>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
          {products.filter(p=>!p.deleted).map(p=>(
            <div key={p.id} style={{background:'var(--biz-surface)',border:'1px solid var(--biz-border)',borderRadius:14,overflow:'hidden',
              opacity:p.active===false?0.55:1,transition:'opacity 0.2s'}}>
              {p.imageUrl && <img src={p.imageUrl} alt={p.name} style={{width:'100%',height:160,objectFit:'cover'}} onError={e=>e.target.style.display='none'}/>}
              <div style={{padding:16}}>
                {p.category && <div style={{fontSize:'0.7rem',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--biz-brand)',marginBottom:4}}>{p.category}</div>}
                <div style={{fontWeight:700,fontSize:'0.95rem',color:'var(--biz-text-1)',marginBottom:4}}>{p.name}</div>
                {p.description && <p style={{fontSize:'0.82rem',color:'var(--biz-text-3)',margin:'0 0 10px',lineHeight:1.5}}>{p.description}</p>}
                {p.price && <div style={{fontSize:'1.1rem',fontWeight:800,color:'var(--biz-brand)'}}>{Number(p.price).toLocaleString()} {p.currency}</div>}
                <div style={{display:'flex',gap:8,marginTop:12}}>
                  <button className="biz-btn biz-btn-ghost biz-btn-sm" onClick={()=>{setEditId(p.id);setForm({name:p.name||'',description:p.description||'',price:p.price||'',currency:p.currency||'RWF',category:p.category||'',imageUrl:p.imageUrl||''});setShowForm(true);}}>Edit</button>
                  <button className="biz-btn biz-btn-ghost biz-btn-sm" onClick={()=>toggleActive(p)}>{p.active===false?'Show':'Hide'}</button>
                  <button className="biz-btn biz-btn-ghost biz-btn-sm" style={{color:'var(--danger)',marginLeft:'auto'}} onClick={()=>deleteProduct(p.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Biz Review Widget — homepage-style card, opens modal on click ── */
function BizReviewWidget({ review, onClick, canReply = true }) {
  const name = review.userName||'Anonymous';
  const COLORS = ['#2d8f6f','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#14b8a6'];
  const color = COLORS[name.charCodeAt(0) % COLORS.length];
  const timeAgo = (() => {
    const ts = review.createdAt;
    if (!ts) return '';
    const d = ts.toDate?ts.toDate():ts.seconds?new Date(ts.seconds*1000):null;
    if (!d) return '';
    const diff=Date.now()-d.getTime(),hrs=Math.floor(diff/3600000),days=Math.floor(diff/86400000);
    if (diff<60000) return 'just now';
    if (hrs<1) return `${Math.floor(diff/60000)} min ago`;
    if (hrs<24) return `${hrs}h ago`;
    if (days<7) return days===1?'yesterday':`${days} days ago`;
    return d.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
  })();
  const firstImage = review.images?.[0];
  const hasReplies = (review.replies||[]).length > 0;
  return (
    <div onClick={onClick} style={{background:'var(--biz-surface,white)',border:'1px solid var(--biz-border)',borderRadius:14,padding:18,cursor:'pointer',display:'flex',flexDirection:'column',gap:9,transition:'box-shadow 0.18s,transform 0.18s'}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.1)';e.currentTarget.style.transform='translateY(-2px)';}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='';e.currentTarget.style.transform='';}}>
      <div style={{display:'flex',alignItems:'center',gap:9}}>
        <div style={{width:36,height:36,borderRadius:'50%',background:color,color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'0.88rem',flexShrink:0}}>{name[0].toUpperCase()}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:'0.88rem',color:'var(--biz-text-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{name}</div>
          <div style={{fontSize:'0.72rem',color:'var(--biz-text-4)'}}>{timeAgo}</div>
        </div>
        <div style={{display:'flex',gap:1}}>{[1,2,3,4,5].map(i=><span key={i} style={{fontSize:13,color:i<=(review.rating||0)?'#e8b800':'#d1d5db'}}>★</span>)}</div>
      </div>
      {review.comment && <p style={{margin:0,fontSize:'0.85rem',color:'var(--biz-text-2)',lineHeight:1.55,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{review.comment}</p>}
      {firstImage && <img src={firstImage} alt="" style={{width:'100%',height:80,objectFit:'cover',borderRadius:8}}/>}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderTop:'1px solid var(--biz-border)',paddingTop:7,marginTop:'auto'}}>
        {hasReplies
          ? <span style={{fontSize:'0.72rem',background:'#f0faf6',color:'#1f6b52',padding:'2px 8px',borderRadius:99,fontWeight:600}}>💬 {(review.replies||[]).length} repl{(review.replies||[]).length!==1?'ies':'y'}</span>
          : <span style={{fontSize:'0.72rem',color:'var(--biz-text-4)'}}>No replies yet</span>
        }
        <span style={{fontSize:'0.72rem',color:'var(--biz-brand)',fontWeight:600}}>{canReply ? 'Reply' : 'View'} →</span>
      </div>
    </div>
  );
}

/* ── Review Card with reply — matches homepage rct- style ── */
function ReviewCard({ review, onReply, currentUser }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [showReply, setShowReply] = useState(true); // always open for business efficiency
  const [lightboxImg, setLightboxImg] = useState(null);
  const name = review.userName||review.userEmail?.split('@')[0]||'Anonymous';
  const initial = name[0]?.toUpperCase()||'A';
  const AVATAR_COLORS = ['#2d8f6f','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#14b8a6'];
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  const timeAgo = (() => {
    const ts = review.createdAt;
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds*1000) : null;
    if (!d) return '';
    const diff = Date.now()-d.getTime(), mins=Math.floor(diff/60000), hrs=Math.floor(diff/3600000), days=Math.floor(diff/86400000);
    if (mins<1) return 'just now'; if (mins<60) return `${mins} min ago`;
    if (hrs<24) return `${hrs}h ago`; if (days<7) return days===1?'yesterday':`${days} days ago`;
    return d.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
  })();
  const bizReplies = (review.replies||[]).filter(r=>r.by==='business'||r.isBusinessReply);
  const otherReplies = (review.replies||[]).filter(r=>!(r.by==='business'||r.isBusinessReply));

  const send = async () => {
    const validation = validateReplyText(text);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setSending(true);
    await onReply(review.id, text.trim());
    setText(''); setError(''); setShowReply(false);
    setSending(false);
  };

  return (
    <>
    {/* Lightbox for full-size images */}
    {lightboxImg && (
      <div onClick={()=>setLightboxImg(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',cursor:'zoom-out'}}>
        <img src={lightboxImg} alt="Full size" style={{maxWidth:'92vw',maxHeight:'88vh',borderRadius:12,objectFit:'contain'}}/>
        <button onClick={()=>setLightboxImg(null)} style={{position:'absolute',top:20,right:20,background:'rgba(255,255,255,0.15)',border:'none',color:'white',width:40,height:40,borderRadius:'50%',fontSize:'1.2rem',cursor:'pointer'}}>✕</button>
      </div>
    )}
    <div className="biz-review-card" id={`review-${review.id}`}
      style={{background:'var(--biz-surface,white)',border:'1px solid var(--biz-border)',borderRadius:14,padding:20,marginBottom:14,transition:'box-shadow 0.18s,transform 0.18s',display:'flex',flexDirection:'column',gap:10}}>
      {/* Header: avatar + name + time + stars */}
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        {review.userPhotoURL
          ? <img src={review.userPhotoURL} alt={name} style={{width:38,height:38,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
          : <div style={{width:38,height:38,borderRadius:'50%',background:color,color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'0.88rem',flexShrink:0}}>{initial}</div>
        }
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:'0.9rem',color:'var(--biz-text-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{name}</div>
          <div style={{fontSize:'0.72rem',color:'var(--biz-text-4)'}}>{timeAgo}</div>
        </div>
        <Stars rating={review.rating} size={15}/>
      </div>

      {/* Comment */}
      {review.comment && <p style={{margin:0,fontSize:'0.88rem',color:'var(--biz-text-2)',lineHeight:1.6}}>{review.comment}</p>}

      {/* Images — full width, clickable lightbox */}
      {review.images?.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:6}}>
          {review.images.map((src,i) => (
            <img key={i} src={src} alt={`Photo ${i+1}`}
              style={{width:'100%',height:100,objectFit:'cover',borderRadius:8,cursor:'zoom-in',border:'1px solid var(--biz-border)'}}
              onClick={e=>{e.stopPropagation();setLightboxImg(src);}}
            />
          ))}
        </div>
      )}

      {/* Reactions */}
      {((review.helpful||0)+(review.love||0)+(review.thanks||0)) > 0 && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {review.helpful>0 && <span style={{background:'#f0faf6',border:'1px solid #c8ead9',color:'#1f6b52',padding:'3px 10px',borderRadius:99,fontSize:'0.75rem',fontWeight:600}}>👍 {review.helpful}</span>}
          {review.love>0 && <span style={{background:'#fff5f5',border:'1px solid #fecaca',color:'#ef4444',padding:'3px 10px',borderRadius:99,fontSize:'0.75rem',fontWeight:600}}>❤️ {review.love}</span>}
          {review.thanks>0 && <span style={{background:'#fffbeb',border:'1px solid #fde68a',color:'#d97706',padding:'3px 10px',borderRadius:99,fontSize:'0.75rem',fontWeight:600}}>🙏 {review.thanks}</span>}
        </div>
      )}

      {/* Show all replies */}
      {otherReplies.map((r,i)=>(
        <div key={i} className="biz-reply-item biz-reply-user">
          <span className="biz-reply-who">👤 {r.userName||'User'}</span>
          <p>{r.text||r.content}</p>
        </div>
      ))}
      {bizReplies.map((r,i)=>(
        <div key={i} className="biz-reply-item biz-reply-biz">
          <span className="biz-reply-who">🏢 Business Reply</span>
          <p>{r.text||r.content}</p>
          <span className="biz-reply-time">{r.timestamp ? new Date(r.timestamp).toLocaleDateString() : ''}</span>
        </div>
      ))}

      {/* Reply area - allow multiple replies */}
      {showReply ? (
        <div className="biz-reply-compose">
          <textarea className="biz-input biz-reply-textarea" rows={3}
            placeholder="Write your response to this customer…"
            value={text} onChange={e=>{
              const next = e.target.value;
              setText(next);
              setError(next.length > 1000 ? 'Replies can be at most 1000 characters.' : '');
            }}
            autoFocus/>
          {error && <div style={{color:'#ef4444',fontSize:'0.78rem',fontWeight:600,marginBottom:8}}>{error}</div>}
          <div className="biz-reply-actions">
            <button className="biz-btn biz-btn-ghost biz-btn-sm" onClick={()=>{setShowReply(false);setText('');}}>{t('cd.cancel')||'Cancel'}</button>
            <button className="biz-btn biz-btn-primary biz-btn-sm" onClick={send} disabled={sending||!text.trim()||text.length > 1000}>
              {sending?'Sending…':'Send Reply'}
            </button>
          </div>
        </div>
      ) : (
        <button className="biz-reply-trigger" onClick={()=>setShowReply(true)}>
          {bizReplies.length>0 ? '↩️ Add another reply' : '↩️ Reply to this review'}
        </button>
      )}
    </div>
    </>
  );
}
