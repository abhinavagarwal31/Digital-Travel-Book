import type { Photo } from '@tb/shared';
import { formatDayHeading } from '../lib/dates.ts';
import { groupByDay, photoImageUrl } from '../lib/photos.ts';

const FLAG_LABELS: Record<string, string> = {
  no_time: 'No date',
  outside_trip: 'Outside trip dates',
  tz_assumed: 'Time zone assumed',
  gps_outlier: 'Check location',
};

export function PhotoGrid({ photos, startDate }: { photos: Photo[]; startDate: string }) {
  const groups = groupByDay(photos);
  if (groups.length === 0) return null;

  return (
    <div className="stack" style={{ gap: '2rem' }}>
      {groups.map((group) => (
        <section key={group.dayDate ?? 'none'} className="photo-day">
          <header>
            <h3>
              {group.dayDate ? formatDayHeading(group.dayDate, startDate) : 'Not in a day yet'}
            </h3>
            <span className="muted">
              {group.photos.length} {group.photos.length === 1 ? 'photo' : 'photos'}
            </span>
          </header>
          {group.dayDate === null && (
            <p className="hint">
              These photos have no usable date, or a date far outside the trip. You will be able to
              place them in a day yourself.
            </p>
          )}
          <ul className="photo-grid">
            {group.photos.map((photo) => (
              <li key={photo.id}>
                <figure className="thumb">
                  <img
                    src={photoImageUrl(photo.id, 'thumb')}
                    alt={photo.caption || photo.originalFilename}
                    loading="lazy"
                  />
                  <figcaption>
                    {photo.localDateTime && <span>{photo.localDateTime.slice(11, 16)}</span>}
                    {photo.gps && <span title="Has location">📍</span>}
                    {photo.flags
                      .filter((flag) => flag !== 'tz_assumed')
                      .map((flag) => (
                        <span key={flag} className="badge">
                          {FLAG_LABELS[flag] ?? flag}
                        </span>
                      ))}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
