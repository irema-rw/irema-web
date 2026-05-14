import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './QRScanPage.css';

export default function QRScanPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [cameraStarted, setCameraStarted] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [noBarcodeDetector, setNoBarcodeDetector] = useState(false);

  // Auto-start camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    setError(''); setResult('');

    if (!('BarcodeDetector' in window)) {
      setNoBarcodeDetector(true);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      // videoRef is always in the DOM — no conditional check needed
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraStarted(true);
      scanningRef.current = true;
      scanFrame();
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setError('Camera permission denied. Please allow camera access in your browser settings and reload.');
      } else {
        setError('Could not start camera: ' + e.message);
      }
    }
  }

  function stopCamera() {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraStarted(false);
  }

  async function scanFrame() {
    if (!scanningRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      if ('BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(canvas);
          if (barcodes.length > 0) {
            handleQRResult(barcodes[0].rawValue);
            return;
          }
        } catch {}
      }
    }
    if (scanningRef.current) requestAnimationFrame(scanFrame);
  }

  function handleQRResult(url) {
    stopCamera();
    setResult(url);
    try {
      const parsed = new URL(url);
      if (parsed.hostname === window.location.hostname) {
        navigate(parsed.pathname + parsed.search);
        return;
      }
    } catch {}
  }

  return (
    <div className="qrscan-page">
      <div className="container container-sm">
        <div className="qrscan-header">
          <h1>📷 {t('home.scan_qr')}</h1>
          <p>{t('home.scan_qr_subtitle')}</p>
        </div>

        <div className="qrscan-card card">
          {/* video + canvas are always in the DOM so refs are available before cameraStarted is set */}
          <div className="qrscan-viewport" style={{ display: cameraStarted ? 'block' : 'none' }}>
            <video ref={videoRef} className="qrscan-video" playsInline muted />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="qrscan-overlay">
              <div className="qrscan-frame">
                <div className="qrf-corner tl" /><div className="qrf-corner tr" />
                <div className="qrf-corner bl" /><div className="qrf-corner br" />
              </div>
              <p className="qrscan-hint">Align QR code within the frame</p>
            </div>
            <button className="btn btn-ghost btn-sm qrscan-stop" onClick={stopCamera}>
              Stop Camera
            </button>
          </div>

          {permissionDenied && (
            <div className="qrscan-start">
              <div className="qrscan-icon">🔒</div>
              <h3>Camera Access Required</h3>
              <p>Please allow camera access in your browser settings, then reload this page.</p>
              <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
                Reload & Try Again
              </button>
              {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}
            </div>
          )}

          {!cameraStarted && !result && !permissionDenied && (
            <div className="qrscan-start">
              <div className="qrscan-icon">📷</div>
              <h3>Starting camera…</h3>
              <p>Allow camera access when prompted.</p>
              {error && (
                <>
                  <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>
                  <button className="btn btn-primary btn-lg" style={{ marginTop: 12 }} onClick={startCamera}>
                    Try Again
                  </button>
                </>
              )}
            </div>
          )}

          {noBarcodeDetector && cameraStarted && (
            <div className="alert alert-error" style={{ margin: '12px 16px 0' }}>
              ⚠️ QR scanning is not supported in this browser. Please use Chrome or Edge for full functionality.
            </div>
          )}

          {result && !cameraStarted && (
            <div className="qrscan-result">
              <div className="alert alert-success">✅ QR Code detected!</div>
              <p>Redirecting to: <strong>{result}</strong></p>
              <button className="btn btn-primary" onClick={() => {
                try { navigate(new URL(result).pathname); } catch { window.open(result, '_blank'); }
              }}>Open</button>
              <button className="btn btn-outline" style={{ marginLeft: 8 }} onClick={startCamera}>Scan Another</button>
            </div>
          )}
        </div>

        <div className="qrscan-instructions">
          <h3>How it works</h3>
          <div className="qrscan-steps">
            <div className="qrscan-step">
              <div className="step-num">1</div>
              <div><strong>Find a QR Code</strong><p>Look for the Irema QR code at restaurants, hotels, or any registered business.</p></div>
            </div>
            <div className="qrscan-step">
              <div className="step-num">2</div>
              <div><strong>Point & Scan</strong><p>The camera starts automatically — just point it at the QR code.</p></div>
            </div>
            <div className="qrscan-step">
              <div className="step-num">3</div>
              <div><strong>Rate instantly</strong><p>You'll land directly on the business page to leave your review.</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
