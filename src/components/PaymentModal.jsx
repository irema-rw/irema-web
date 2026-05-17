/**
 * PaymentModal.jsx
 *
 * Full in-app payment flow for Irema Business subscriptions.
 *
 * Steps:
 *   method        → choose MTN MoMo or Visa/Mastercard
 *   momo-details  → enter phone number
 *   card-details  → enter card details (manual review flow)
 *   momo-waiting  → polls checkMoMoPaymentStatus every 5 s
 *   card-pending  → brief spinner then submitted screen
 *   success       → subscription activated
 *   failed        → error with retry option
 *
 * Props:
 *   plan      { id, name, price }  — the plan being purchased
 *   company   { id, companyName, … }
 *   onSuccess ()  — called after successful payment (parent refreshes sub status)
 *   onClose   ()  — called when modal should close
 */

import React, { useState, useEffect, useRef } from 'react';
import { functions, httpsCallable, db, collection, addDoc, serverTimestamp } from '../firebase/config';
import './PaymentModal.css';

// ── Step indicator ─────────────────────────────────────────────────────────
function StepBar({ current, withPlanPick }) {
  const labels = withPlanPick
    ? ['Plan', 'Method', 'Details', 'Confirm']
    : ['Method', 'Details', 'Confirm'];

  let idx;
  if (withPlanPick) {
    idx = current === 'plan-pick' ? 0
        : current === 'method'   ? 1
        : ['momo-details','card-details'].includes(current) ? 2
        : 3;
  } else {
    idx = current === 'method' ? 0
        : ['momo-details','card-details'].includes(current) ? 1
        : 2;
  }

  return (
    <div className="pm-stepbar">
      {labels.map((label, i) => (
        <React.Fragment key={label}>
          <div className={`pm-step-node ${i < idx ? 'done' : i === idx ? 'active' : ''}`}>
            {i < idx
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              : <span>{i + 1}</span>
            }
          </div>
          <div className={`pm-step-label ${i === idx ? 'active' : ''}`}>{label}</div>
          {i < labels.length - 1 && (
            <div className={`pm-step-line ${i < idx ? 'done' : ''}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Plan summary row ───────────────────────────────────────────────────────
function PlanSummary({ plan }) {
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + 1);
  const formatted = nextDate.toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="pm-plan-summary">
      <div className="pm-plan-summary-row">
        <span>{plan.name} Plan</span>
        <span>{plan.price.toLocaleString()} RWF</span>
      </div>
      <div className="pm-plan-summary-row pm-plan-summary-sub">
        <span>Billed monthly · Next billing</span>
        <span>{formatted}</span>
      </div>
      <div className="pm-plan-summary-divider" />
      <div className="pm-plan-summary-row pm-plan-summary-total">
        <span>Total today</span>
        <span>{plan.price.toLocaleString()} RWF</span>
      </div>
    </div>
  );
}

// ── Card number formatter ──────────────────────────────────────────────────
function formatCardNumber(raw) {
  return raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}
function formatExpiry(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits;
}

// ── Paid plans shown in the picker ────────────────────────────────────────
const DEFAULT_PLANS = [
  { id: 'professional', name: 'Professional', price: 25000,
    features: ['Unlimited responses', 'Advanced analytics', 'Priority support', 'Verified badge', 'QR codes'] },
  { id: 'enterprise',   name: 'Enterprise',   price: 75000,
    features: ['Up to 5 listings', 'AI sentiment analysis', 'Dedicated manager', 'API access', 'SLA support'] },
];

// ── Step bar maps plan-pick as step 0 ─────────────────────────────────────
const STEP_LABELS_WITH_PICK  = ['Plan', 'Method', 'Details', 'Confirm'];
const STEP_LABELS_NO_PICK    = ['Method', 'Details', 'Confirm'];

// ── Main component ─────────────────────────────────────────────────────────
export default function PaymentModal({ plan: initialPlan, availablePlans, company, onSuccess, onClose }) {
  // If no plan was pre-selected, start at plan-pick step
  const hasPlanProp = initialPlan != null;
  const [selectedPlan, setSelectedPlan] = useState(initialPlan);
  const [step, setStep] = useState(hasPlanProp ? 'method' : 'plan-pick');
  const [method, setMethod] = useState(null); // 'momo' | 'card'

  // Convenience: the active plan (might be picked mid-flow)
  const plan = selectedPlan;
  const plans = (availablePlans && availablePlans.length > 0) ? availablePlans : DEFAULT_PLANS;

  // MoMo state
  const [momoPhone, setMomoPhone]   = useState('');
  const [momoPhoneErr, setMomoPhoneErr] = useState('');
  const [referenceId, setReferenceId]   = useState('');
  const [paymentDocId, setPaymentDocId] = useState('');
  const [initiating, setInitiating]     = useState(false);
  const [pollCount, setPollCount]       = useState(0);
  const [txId, setTxId]                 = useState('');

  // Card state
  const [cardName, setCardName]     = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv]       = useState('');
  const [cardErr, setCardErr]       = useState('');
  const [cardDocId, setCardDocId]   = useState('');

  // Error/failed state
  const [failReason, setFailReason] = useState('');

  const pollRef = useRef(null);
  const timeoutRef = useRef(null);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  // ── MoMo polling ────────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'momo-waiting') return;

    const checkStatus = httpsCallable(functions, 'checkMoMoPaymentStatus');

    const poll = async () => {
      try {
        const res = await checkStatus({ referenceId, paymentDocId, planId: plan.id, companyId: company.id });
        const { status } = res.data;
        if (status === 'SUCCESSFUL') {
          clearInterval(pollRef.current);
          clearTimeout(timeoutRef.current);
          setTxId(res.data.financialTransactionId || '');
          setStep('success');
          onSuccess?.();
        } else if (status === 'FAILED') {
          clearInterval(pollRef.current);
          clearTimeout(timeoutRef.current);
          setFailReason('The MoMo request was declined. Please check your balance and try again.');
          setStep('failed');
        }
        // PENDING → keep polling
      } catch {
        // Network glitch — keep polling silently
      }
      setPollCount(c => c + 1);
    };

    poll(); // immediate first check
    pollRef.current = setInterval(poll, 5000);

    // 2-minute hard timeout
    timeoutRef.current = setTimeout(() => {
      clearInterval(pollRef.current);
      setFailReason('Payment request timed out. Open your MTN MoMo app and check for a pending request, or try again.');
      setStep('failed');
    }, 120_000);

    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [step]); // eslint-disable-line

  // ── MoMo: validate & initiate ───────────────────────────────────────────
  async function handleMomoSubmit() {
    const digits = momoPhone.replace(/\D/g, '');
    if (digits.length < 9) {
      setMomoPhoneErr('Enter a valid MTN MoMo number (e.g. 0788 123 456)');
      return;
    }
    setMomoPhoneErr('');
    setInitiating(true);
    try {
      const initiate = httpsCallable(functions, 'initiateMoMoPayment');
      const res = await initiate({
        phoneNumber:  momoPhone,
        amount:       plan.price,
        planId:       plan.id,
        companyId:    company.id,
        businessName: company.companyName || company.name || '',
      });
      setReferenceId(res.data.referenceId);
      setPaymentDocId(res.data.paymentDocId);
      setStep('momo-waiting');
    } catch (err) {
      setMomoPhoneErr(err.message || 'Failed to initiate MoMo payment. Please try again.');
    }
    setInitiating(false);
  }

  // ── Card: validate & submit (manual review flow) ─────────────────────────
  async function handleCardSubmit() {
    if (!cardName.trim())                       { setCardErr('Cardholder name is required.');   return; }
    if (cardNumber.replace(/\s/g,'').length < 16) { setCardErr('Enter a valid 16-digit card number.'); return; }
    if (cardExpiry.length < 5)                  { setCardErr('Enter a valid expiry date (MM/YY).'); return; }
    if (cardCvv.length < 3)                     { setCardErr('Enter a valid CVV.');              return; }
    setCardErr('');
    setStep('card-pending');

    try {
      // Store a pending payment record. Admin confirms & activates manually.
      const ref = await addDoc(collection(db, 'payments'), {
        companyId:    company.id,
        planId:       plan.id,
        amount:       plan.price,
        currency:     'RWF',
        status:       'pending',
        method:       'card',
        businessName: company.companyName || company.name || '',
        cardLast4:    cardNumber.replace(/\s/g, '').slice(-4),
        createdAt:    serverTimestamp(),
      });
      setCardDocId(ref.id);
    } catch {
      // Non-fatal — payment still shows as submitted
    }

    // Brief processing delay then show "submitted" success
    setTimeout(() => setStep('success-card'), 2000);
  }

  // ── Phone input handler ─────────────────────────────────────────────────
  function handlePhoneInput(e) {
    // Allow digits, spaces, dashes only; cap at 13 chars display
    const val = e.target.value.replace(/[^\d\s\-]/g, '').slice(0, 13);
    setMomoPhone(val);
    if (momoPhoneErr) setMomoPhoneErr('');
  }

  // ── Formatted display for MoMo phone in waiting screen ──────────────────
  const displayPhone = momoPhone.trim() || '—';

  // ── Close guard: don't let them close mid-payment ───────────────────────
  function handleOverlayClick(e) {
    if (e.target !== e.currentTarget) return;
    if (['momo-waiting', 'card-pending'].includes(step)) return; // locked
    onClose();
  }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="pm-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="pm-modal">

        {/* ── Header ── */}
        <div className="pm-header">
          <div className="pm-header-left">
            <svg width="22" height="22" viewBox="0 0 60 60" fill="none">
              <rect width="60" height="60" rx="14" fill="url(#pmLogoGrad)"/>
              <defs>
                <linearGradient id="pmLogoGrad" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#1f6b52"/><stop offset="100%" stopColor="#164d3b"/>
                </linearGradient>
              </defs>
              <polygon points="30,8 34.5,21.5 49,21.5 37.5,30 41.5,43.5 30,35 18.5,43.5 22.5,30 11,21.5 25.5,21.5" fill="#E8B800"/>
            </svg>
            <div>
              {plan
                ? <><div className="pm-header-title">Activate {plan.name} Plan</div>
                    <div className="pm-header-sub">{plan.price.toLocaleString()} RWF / month</div></>
                : <><div className="pm-header-title">Subscribe to Irema</div>
                    <div className="pm-header-sub">Choose a plan to get started</div></>
              }
            </div>
          </div>
          {!['momo-waiting', 'card-pending'].includes(step) && (
            <button className="pm-close-btn" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* ── Step bar ── */}
        {!['success', 'success-card', 'failed'].includes(step) && (
          <div className="pm-stepbar-wrap">
            <StepBar current={step} withPlanPick={!hasPlanProp} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP: pick a plan (shown when opened without a pre-selected plan)
        ════════════════════════════════════════════════════════════════ */}
        {step === 'plan-pick' && (
          <div className="pm-body">
            <p className="pm-body-label">Select the plan you want to activate</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {plans.map(p => (
                <button
                  key={p.id}
                  className={`pm-plan-card ${selectedPlan?.id === p.id ? 'selected' : ''}`}
                  onClick={() => setSelectedPlan(p)}
                >
                  <div className="pm-plan-card-top">
                    <div>
                      <div className="pm-plan-card-name">{p.name}</div>
                      <div className="pm-plan-card-price">{p.price.toLocaleString()} <span>RWF / month</span></div>
                    </div>
                    {selectedPlan?.id === p.id && (
                      <div className="pm-method-check">✓</div>
                    )}
                  </div>
                  {p.features && (
                    <ul className="pm-plan-card-features">
                      {p.features.slice(0, 4).map(f => (
                        <li key={f}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              ))}
            </div>
            <div className="pm-footer">
              <button className="pm-btn pm-btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="pm-btn pm-btn-primary"
                disabled={!selectedPlan}
                onClick={() => setStep('method')}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP: choose method
        ════════════════════════════════════════════════════════════════ */}
        {step === 'method' && (
          <div className="pm-body">
            <p className="pm-body-label">Choose how you'd like to pay</p>
            <div className="pm-method-grid">
              {/* MTN MoMo */}
              <button
                className={`pm-method-card ${method === 'momo' ? 'selected' : ''}`}
                onClick={() => setMethod('momo')}
              >
                <div className="pm-method-icon pm-method-icon-momo">
                  <svg width="28" height="28" viewBox="0 0 60 60" fill="none">
                    <rect width="60" height="60" rx="16" fill="#FFCC00"/>
                    <circle cx="30" cy="30" r="10" fill="#333"/>
                    <circle cx="30" cy="30" r="5"  fill="#FFCC00"/>
                  </svg>
                </div>
                <div className="pm-method-name">MTN MoMo</div>
                <div className="pm-method-sub">Mobile Money</div>
                {method === 'momo' && <div className="pm-method-check">✓</div>}
              </button>

              {/* Visa / Mastercard */}
              <button
                className={`pm-method-card ${method === 'card' ? 'selected' : ''}`}
                onClick={() => setMethod('card')}
              >
                <div className="pm-method-icon pm-method-icon-card">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1f6b52" strokeWidth="1.5">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                </div>
                <div className="pm-method-name">Visa / Mastercard</div>
                <div className="pm-method-sub">Debit or Credit Card</div>
                {method === 'card' && <div className="pm-method-check">✓</div>}
              </button>
            </div>

            <div className="pm-footer">
              <button className="pm-btn pm-btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="pm-btn pm-btn-primary"
                disabled={!method}
                onClick={() => setStep(method === 'momo' ? 'momo-details' : 'card-details')}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP: MoMo details
        ════════════════════════════════════════════════════════════════ */}
        {step === 'momo-details' && (
          <div className="pm-body">
            <label className="pm-field-label">MTN MoMo Number</label>
            <input
              className={`pm-input ${momoPhoneErr ? 'pm-input-error' : ''}`}
              type="tel"
              placeholder="078 812 3456"
              value={momoPhone}
              onChange={handlePhoneInput}
              autoFocus
            />
            {momoPhoneErr
              ? <div className="pm-field-error">{momoPhoneErr}</div>
              : <div className="pm-field-hint">You'll receive a USSD prompt on your phone to approve</div>
            }

            <PlanSummary plan={plan} />

            <div className="pm-footer">
              <button className="pm-btn pm-btn-ghost" onClick={() => setStep('method')}>← Back</button>
              <button
                className="pm-btn pm-btn-primary"
                onClick={handleMomoSubmit}
                disabled={initiating}
              >
                {initiating
                  ? <><span className="pm-spinner" /> Sending request…</>
                  : `Confirm with MoMo · ${plan.price.toLocaleString()} RWF`
                }
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP: Card details
        ════════════════════════════════════════════════════════════════ */}
        {step === 'card-details' && (
          <div className="pm-body">
            <label className="pm-field-label">Cardholder Name</label>
            <input
              className="pm-input"
              placeholder="Full name on card"
              value={cardName}
              onChange={e => setCardName(e.target.value)}
              autoFocus
            />

            <label className="pm-field-label" style={{ marginTop: 14 }}>Card Number</label>
            <div className="pm-card-number-wrap">
              <input
                className="pm-input"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                maxLength={19}
                inputMode="numeric"
              />
              <div className="pm-card-brands">
                <svg width="30" height="20" viewBox="0 0 30 20" fill="none">
                  <rect width="30" height="20" rx="3" fill="#1A1F71"/>
                  <text x="4" y="14" fill="white" fontSize="9" fontWeight="bold" fontFamily="Arial">VISA</text>
                </svg>
                <svg width="30" height="20" viewBox="0 0 50 32" fill="none">
                  <circle cx="20" cy="16" r="13" fill="#EB001B"/>
                  <circle cx="30" cy="16" r="13" fill="#F79E1B"/>
                  <path d="M25 6.8A13 13 0 0 1 30 16a13 13 0 0 1-5 9.2A13 13 0 0 1 20 16a13 13 0 0 1 5-9.2z" fill="#FF5F00"/>
                </svg>
              </div>
            </div>

            <div className="pm-card-row">
              <div style={{ flex: 1 }}>
                <label className="pm-field-label">Expiry Date</label>
                <input
                  className="pm-input"
                  placeholder="MM/YY"
                  value={cardExpiry}
                  onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                  maxLength={5}
                  inputMode="numeric"
                />
              </div>
              <div style={{ width: 110 }}>
                <label className="pm-field-label">CVV</label>
                <input
                  className="pm-input"
                  placeholder="123"
                  value={cardCvv}
                  onChange={e => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  inputMode="numeric"
                />
              </div>
            </div>

            {cardErr && <div className="pm-field-error" style={{ marginTop: 8 }}>{cardErr}</div>}

            <PlanSummary plan={plan} />

            <div className="pm-card-notice">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Card payments are reviewed and activated by our team within 24 hours.
            </div>

            <div className="pm-footer">
              <button className="pm-btn pm-btn-ghost" onClick={() => setStep('method')}>← Back</button>
              <button className="pm-btn pm-btn-primary" onClick={handleCardSubmit}>
                Pay {plan.price.toLocaleString()} RWF
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP: MoMo waiting / polling
        ════════════════════════════════════════════════════════════════ */}
        {step === 'momo-waiting' && (
          <div className="pm-body pm-body-center">
            <div className="pm-momo-pulse-wrap">
              <div className="pm-momo-pulse-ring pm-momo-ring-3" />
              <div className="pm-momo-pulse-ring pm-momo-ring-2" />
              <div className="pm-momo-pulse-ring pm-momo-ring-1" />
              <div className="pm-momo-icon-circle">
                <svg width="28" height="28" viewBox="0 0 60 60" fill="none">
                  <rect width="60" height="60" rx="16" fill="#FFCC00"/>
                  <circle cx="30" cy="30" r="10" fill="#333"/>
                  <circle cx="30" cy="30" r="5"  fill="#FFCC00"/>
                </svg>
              </div>
            </div>

            <h2 className="pm-waiting-title">Waiting for MoMo Approval</h2>
            <p className="pm-waiting-sub">
              A request of <strong>{plan.price.toLocaleString()} RWF</strong> was sent to
            </p>
            <div className="pm-waiting-phone">{displayPhone}</div>
            <p className="pm-waiting-hint">
              Open your MTN MoMo app or dial <strong>*182*7#</strong> to approve
            </p>

            <div className="pm-dots">
              <span /><span /><span />
            </div>
            <div className="pm-checking-text">
              Checking automatically every 5 seconds… ({pollCount} checks)
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP: Card processing spinner
        ════════════════════════════════════════════════════════════════ */}
        {step === 'card-pending' && (
          <div className="pm-body pm-body-center">
            <div className="pm-processing-spinner" />
            <h2 className="pm-waiting-title" style={{ marginTop: 24 }}>Processing Payment…</h2>
            <p className="pm-waiting-sub">Please wait while we submit your request.</p>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP: Success (MoMo)
        ════════════════════════════════════════════════════════════════ */}
        {step === 'success' && (
          <div className="pm-body pm-body-center">
            <div className="pm-success-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <h2 className="pm-success-title">Subscription Activated!</h2>
            <p className="pm-success-sub">Your {plan.name} plan is now live.</p>

            {txId && (
              <div className="pm-reference">
                Reference: <strong>#{txId.slice(0, 16).toUpperCase()}</strong>
              </div>
            )}

            <div className="pm-success-summary">
              <div className="pm-success-row">
                <span>Plan</span><span>{plan.name}</span>
              </div>
              <div className="pm-success-row">
                <span>Amount paid</span><span>{plan.price.toLocaleString()} RWF</span>
              </div>
              <div className="pm-success-row">
                <span>Payment method</span><span>MTN MoMo</span>
              </div>
            </div>

            <button className="pm-btn pm-btn-primary pm-btn-full" onClick={onClose}>
              Go to Dashboard
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP: Success (Card — manual review)
        ════════════════════════════════════════════════════════════════ */}
        {step === 'success-card' && (
          <div className="pm-body pm-body-center">
            <div className="pm-success-icon pm-success-icon-amber">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <h2 className="pm-success-title">Payment Submitted!</h2>
            <p className="pm-success-sub">
              Your payment request has been received. Our team will verify and activate
              your <strong>{plan.name}</strong> plan within <strong>24 hours</strong>.
            </p>

            {cardDocId && (
              <div className="pm-reference">
                Reference: <strong>#{cardDocId.slice(0, 12).toUpperCase()}</strong>
              </div>
            )}

            <div className="pm-success-summary">
              <div className="pm-success-row">
                <span>Plan</span><span>{plan.name}</span>
              </div>
              <div className="pm-success-row">
                <span>Amount</span><span>{plan.price.toLocaleString()} RWF</span>
              </div>
              <div className="pm-success-row">
                <span>Card ending</span><span>•••• {cardNumber.replace(/\s/g, '').slice(-4)}</span>
              </div>
            </div>

            <button className="pm-btn pm-btn-primary pm-btn-full" onClick={onClose}>
              Back to Dashboard
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            STEP: Failed
        ════════════════════════════════════════════════════════════════ */}
        {step === 'failed' && (
          <div className="pm-body pm-body-center">
            <div className="pm-failed-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </div>

            <h2 className="pm-failed-title">Payment Failed</h2>
            <p className="pm-failed-sub">{failReason || 'Something went wrong. Please try again.'}</p>

            <div className="pm-footer pm-footer-center">
              <button className="pm-btn pm-btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="pm-btn pm-btn-primary"
                onClick={() => {
                  setStep(hasPlanProp ? 'momo-details' : 'plan-pick');
                  setFailReason('');
                  setPollCount(0);
                  setReferenceId('');
                  setPaymentDocId('');
                  if (!hasPlanProp) setSelectedPlan(null);
                }}
              >
                Try Again
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
