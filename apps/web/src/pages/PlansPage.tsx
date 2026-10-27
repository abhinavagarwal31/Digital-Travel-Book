import { MAX_PHOTOS_PER_BOOK, PLAN_IDS, PLANS, photoLimit } from '@tb/shared';
import { Link } from 'react-router';
import { useAccount } from '../lib/account.ts';
import { useCurrentUser } from '../lib/auth.ts';

/**
 * What each plan includes. Pro is described so people know what is coming;
 * nothing can be bought yet, and the page says so plainly.
 */
export function PlansPage() {
  const me = useCurrentUser();
  const signedIn = Boolean(me.data);
  // One page for visitors and members alike, so nothing jumps while the session loads.
  const account = useAccount({ enabled: signedIn });
  const current = account.data?.plan ?? null;
  return (
    <section className="stack plans-page" style={{ gap: '2rem' }}>
      <header className="stack" style={{ gap: '0.4rem', textAlign: 'center' }}>
        <p className="eyebrow">Plans</p>
        <h1>Every trip deserves a book</h1>
        <p className="muted">
          Making and reading books is free. Pro will add more room and styles made just for you.
        </p>
      </header>

      <div className="plan-grid">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const isCurrent = current === id;
          return (
            <article
              key={id}
              className={`card plan-card${plan.available ? '' : ' upcoming'}${isCurrent ? ' current' : ''}`}
              aria-labelledby={`plan-${id}`}
            >
              <div className="plan-head">
                <h2 id={`plan-${id}`}>{plan.name}</h2>
                {isCurrent && <span className="plan-badge">Your plan</span>}
                {!plan.available && <span className="plan-badge soon">Coming soon</span>}
              </div>
              <p className="plan-price">{plan.priceLabel}</p>
              <p className="muted">Up to {photoLimit(id)} photos in each book</p>
              <ul className="plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {plan.available ? (
                isCurrent ? (
                  <Link to="/" className="button ghost">
                    Go to my books
                  </Link>
                ) : (
                  !signedIn &&
                  !me.isPending && (
                    <Link to="/register" className="button">
                      Start for free
                    </Link>
                  )
                )
              ) : (
                <button type="button" className="button ghost" disabled>
                  Not available yet
                </button>
              )}
            </article>
          );
        })}
      </div>

      <section className="card stack faq" aria-labelledby="faq-heading" style={{ gap: '0.9rem' }}>
        <h2 id="faq-heading">Good to know</h2>
        <details>
          <summary>Can I pay for Pro now?</summary>
          <p className="muted">
            Not yet. There is no payment of any kind in the app today, and nothing is ever charged.
            Pro is listed so you can see what is planned.
          </p>
        </details>
        <details>
          <summary>What happens when a book is full?</summary>
          <p className="muted">
            It stays exactly as it is: you can read it, edit it and change its style. It just takes
            no new photos. Start another book for the next leg of the trip, or remove photos you no
            longer want.
          </p>
        </details>
        <details>
          <summary>Why is Pro {MAX_PHOTOS_PER_BOOK} photos and not more?</summary>
          <p className="muted">
            Every book, on any plan, holds at most {MAX_PHOTOS_PER_BOOK} photos for now, so it opens
            quickly and turns smoothly. Pro will rise further as larger books are supported.
          </p>
        </details>
      </section>
    </section>
  );
}
