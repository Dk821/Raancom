import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Modal } from './ui';

/** Loads a protected image with the auth header (an <img src> could not send it). */
export function useProtectedImage(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!path) return;
    let revoked = false;
    let made: string | null = null;
    api.blob(path).then((b) => {
      if (revoked) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    }).catch(() => setFailed(true));
    return () => {
      revoked = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path]);
  return { url, failed };
}

export default function PhotoThumb({ eventId, label }: { eventId: number; label?: string }) {
  const { url, failed } = useProtectedImage(`/attendance/events/${eventId}/photo`);
  const [open, setOpen] = useState(false);
  if (failed) return <span className="muted small">Photo unavailable</span>;
  if (!url) return <span className="spinner" aria-label="Loading photo" />;
  return (
    <>
      <img className="photo-thumb" src={url} alt={label ?? 'Attendance photo'} onClick={() => setOpen(true)} />
      {open && (
        <Modal title={label ?? 'Attendance photo'} onClose={() => setOpen(false)}>
          <img className="photo-full" src={url} alt={label ?? 'Attendance photo'} />
        </Modal>
      )}
    </>
  );
}
