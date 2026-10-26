import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from './ui';

interface Props {
  onChange: (photo: Blob | null) => void;
}

const MAX_W = 1024;

/** Live camera capture (getUserMedia) with a file-input fallback for browsers/devices that block it.
 *  Camera access needs HTTPS (or localhost). */
export default function CameraCapture({ onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }, []);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot); }, [shot]);

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Live camera is not available here (it needs HTTPS). Use "Take photo" below instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setLive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setError('Camera permission was denied or no camera was found. Allow camera access in the browser, or use "Take photo".');
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_W / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) return;
      setShot(URL.createObjectURL(b));
      onChange(b);
      stop();
    }, 'image/jpeg', 0.82);
  };

  const fromFile = (f: File | undefined) => {
    if (!f) return;
    setShot(URL.createObjectURL(f));
    onChange(f);
    stop();
  };

  const retake = () => {
    setShot(null);
    onChange(null);
    start();
  };

  return (
    <div className="stack">
      {error && <Alert tone="warn">{error}</Alert>}
      <div className="camera" aria-live="polite">
        {live && <video ref={videoRef} playsInline muted aria-label="Camera preview" />}
        {shot && <img className="shot" src={shot} alt="Captured photo" />}
        {!live && !shot && (
          <div className="center" style={{ color: '#9fb0bd', height: '100%' }}>No photo yet</div>
        )}
      </div>
      <div className="row">
        {!live && !shot && <Button onClick={start}>Open camera</Button>}
        {live && <Button variant="primary" onClick={capture}>Capture</Button>}
        {live && <Button variant="ghost" onClick={stop}>Cancel</Button>}
        {shot && <Button onClick={retake}>Retake</Button>}
        <label className="btn" style={{ cursor: 'pointer' }}>
          Take photo
          <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => fromFile(e.target.files?.[0])} />
        </label>
      </div>
    </div>
  );
}
