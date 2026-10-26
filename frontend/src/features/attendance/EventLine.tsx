import { AttEvent } from '../../api/types';
import PhotoThumb from '../../components/PhotoThumb';
import { Badge } from '../../components/ui';
import { MODE_LABEL, fmtTime } from '../../utils/format';

export default function EventLine({ ev, title }: { ev: AttEvent; title: string }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <PhotoThumb eventId={ev.id} label={`${title} photo`} />
      <div>
        <div><strong>{title}</strong> at {fmtTime(ev.occurred_at)} · {MODE_LABEL[ev.mode]}</div>
        {ev.distance_m !== null && (
          <div className="small muted">{Math.round(ev.distance_m)} m from {ev.office_name} (limit {ev.radius_m} m)</div>
        )}
        {ev.review_status === 'FLAGGED' && <Badge tone="warn">Needs review: {ev.flag_reasons.join(', ').toLowerCase().replace(/_/g, ' ')}</Badge>}
        {ev.remark && <div className="small muted">“{ev.remark}”</div>}
      </div>
    </div>
  );
}
