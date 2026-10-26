import { useEffect, useState } from 'react';
import { AttEvent } from '../../api/types';
import PhotoThumb from '../../components/PhotoThumb';
import { Badge } from '../../components/ui';
import {
  IconCircleCheck, IconHouse, IconLocationDot, IconMapPin, IconTriangleExclamation,
} from '../../components/icons';
import { AddressInfo, geocodeAddress } from '../../utils/geo';
import { MODE_LABEL, fmtTime } from '../../utils/format';

/** Shown only for OUTSIDE_WORK: reverse-geocode via Geoapify and display the address. */
function OutsideAddressBlock({ lat, lng }: { lat: number; lng: number }) {
  const [addr, setAddr] = useState<AddressInfo | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    geocodeAddress(lat, lng).then((a) => {
      if (!cancelled) setAddr(a);
    });
    return () => { cancelled = true; };
  }, [lat, lng]);

  if (addr === 'loading') {
    return (
      <div className="address-block" style={{ marginTop: 6 }}>
        <div className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconLocationDot size={12} /> Resolving location…
        </div>
      </div>
    );
  }

  if (!addr) {
    // API key not set or geocoding failed — show raw coordinates as fallback
    return (
      <div className="address-block" style={{ marginTop: 6 }}>
        <div className="small" style={{ fontWeight: 600, marginBottom: 3, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconMapPin size={12} /> Work Location
        </div>
        <div className="small muted">{lat.toFixed(6)}, {lng.toFixed(6)}</div>
      </div>
    );
  }

  const rows: { label: string; value: string | null }[] = [
    { label: 'Street',   value: addr.street },
    { label: 'Area',     value: addr.area },
    { label: 'City',     value: addr.city },
    { label: 'District', value: addr.district },
    { label: 'State',    value: addr.state },
    { label: 'PIN',      value: addr.postalCode },
    { label: 'Country',  value: addr.country },
  ].filter((r) => r.value);

  return (
    <div className="address-block" style={{ marginTop: 6 }}>
      <div className="small" style={{ fontWeight: 600, marginBottom: 3, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <IconMapPin size={12} /> Work Location
      </div>
      <div className="address-grid">
        {rows.map(({ label, value }) => (
          <div key={label} className="address-row">
            <span className="address-label">{label}</span>
            <span className="address-value">{value}</span>
          </div>
        ))}
      </div>
      {addr.formattedAddress && (
        <div className="small muted" style={{ marginTop: 5, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
          {addr.formattedAddress}
        </div>
      )}
    </div>
  );
}

/** Shown only for OFFICE: geofence result — matched office + distance. */
function OfficeLocationBlock({ ev }: { ev: AttEvent }) {
  if (ev.distance_m === null || !ev.office_name) return null;
  const withinRadius = ev.distance_m <= (ev.radius_m ?? Infinity);
  return (
    <div className="address-block" style={{ marginTop: 6 }}>
      <div className="small" style={{ fontWeight: 600, marginBottom: 3, color: withinRadius ? 'var(--ok)' : 'var(--warn)', display: 'flex', alignItems: 'center', gap: 5 }}>
        {withinRadius
          ? <><IconCircleCheck size={13} /> Office Location Matched</>
          : <><IconTriangleExclamation size={13} /> Outside Office Radius</>
        }
      </div>
      <div className="address-grid">
        <span className="address-label">Office</span>
        <span className="address-value">{ev.office_name}</span>
        <span className="address-label">Distance</span>
        <span className="address-value">{Math.round(ev.distance_m)} m</span>
        <span className="address-label">Limit</span>
        <span className="address-value">{ev.radius_m} m</span>
      </div>
    </div>
  );
}

export default function EventLine({ ev, title }: { ev: AttEvent; title: string }) {
  return (
    <div className="event-line">
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <PhotoThumb eventId={ev.id} label={`${title} photo`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div><strong>{title}</strong> at {fmtTime(ev.occurred_at)} · {MODE_LABEL[ev.mode]}</div>

          {ev.review_status === 'FLAGGED' && (
            <Badge tone="warn">
              Needs review: {ev.flag_reasons.join(', ').toLowerCase().replace(/_/g, ' ')}
            </Badge>
          )}
          {ev.remark && <div className="small muted">"{ev.remark}"</div>}

          {/* OFFICE: show geofence result */}
          {ev.mode === 'OFFICE' && <OfficeLocationBlock ev={ev} />}

          {/* OUTSIDE_WORK: reverse-geocode and show employee's actual location */}
          {ev.mode === 'OUTSIDE_WORK' && ev.latitude !== null && ev.longitude !== null && (
            <OutsideAddressBlock lat={ev.latitude!} lng={ev.longitude!} />
          )}

          {/* WFH: location not applicable */}
          {ev.mode === 'WFH' && (
            <div className="small muted" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              <IconHouse size={12} /> Working from home — location not tracked
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
