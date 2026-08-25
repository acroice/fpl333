'use client';
import React from 'react';
import type { Quarter, QuarterTopRow, QuarterHitsRow } from '../lib/types';
import { rankBadge } from '../components/shared';

function quarterStatusKey(status: Quarter['status']) {
  return status === 'trwa' ? 'active' : status === 'zakończona' ? 'done' : 'upcoming';
}

type Props = {
  quarters: Quarter[];
  sideError: string | null;
  entryIndex: Record<number, { manager: string; team: string }>;
  winnersByQuarter: Record<string, { entry: number; points: number }[]>;
  quarterTop: Record<string, QuarterTopRow[]>;
  quarterHitsTop: Record<string, QuarterHitsRow[]>;
  showHits: boolean;
  setShowHits: (updater: (v: boolean) => boolean) => void;
};

// Sekcja "Ćwiartki" — przeniesiona 1:1 z dawnego page.tsx (pasek sezonu, kafelki Q1–Q4,
// Top3/minusowe pkt), logika bez zmian. Jedyny dodatek: kompaktowy pasek zwycięzców na górze.
export default function QuartersSection({
  quarters, sideError, entryIndex, winnersByQuarter, quarterTop, quarterHitsTop, showHits, setShowHits,
}: Props) {
  return (
    <section className="card">
      <div
        className="headline"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', rowGap: '8px', columnGap: '12px' }}
      >
        <div>🏆 Ćwiartki</div>
        <button
          onClick={() => setShowHits(v => !v)}
          title="Pokaż ranking minusowych punktów (transfery ponad darmowy limit) w rozwiniętej ćwiartce"
          className={`toggle-btn${showHits ? ' is-active' : ''}`}
        >
          <span className="dot" />
          Minusowe pkt
        </button>
      </div>

      {/* pasek zwycięzców — szybki podgląd Q1|Q2|Q3|Q4 winner, "—" dla niezakończonych */}
      <div className="qwinnersrow">
        {quarters.map(q => {
          const winners = winnersByQuarter[q.id] || [];
          const isDone = q.status === 'zakończona' && winners.length > 0;
          const label = isDone
            ? winners.map(w => entryIndex[w.entry]?.manager ?? '—').join(', ')
            : '—';
          return (
            <div key={q.id} className="qwinner">
              <span className="qwinner-id">{q.id}</span>
              {isDone ? (
                <span className="qwinner-name">🏆 {label} · {winners[0].points} pkt</span>
              ) : (
                <span className="qwinner-name qwinner-name--pending">{label}</span>
              )}
            </div>
          );
        })}
      </div>

      {sideError ? (
        <div className="small" style={{ color: '#ff9b9b' }}>{sideError}</div>
      ) : (
        <>
          {/* pasek sezonu: 4 segmenty proporcjonalne do liczby kolejek w ćwiartce (10/9/9/10),
              z paskiem postępu wewnątrz tej, która aktualnie trwa — jednym spojrzeniem widać,
              gdzie w sezonie jesteśmy. Czysto informacyjny (bez klikania — kafelki niżej i tak
              zawsze pokazują swoje Top3, więc nie ma czego "otwierać"). */}
          <div className="seasonbar" role="img" aria-label="Postęp sezonu wg ćwiartek">
            {quarters.map(q => {
              const key = quarterStatusKey(q.status);
              return (
                <div
                  key={q.id}
                  className={`seasonbar-seg seasonbar-seg--${key}`}
                  style={{ flexGrow: q.games }}
                  title={`${q.id} • GW${q.gw_from}–${q.gw_to} • ${q.status}`}
                >
                  {key === 'active' && (
                    <span className="seasonbar-fill" style={{ width: `${q.progress ?? 0}%` }} />
                  )}
                  <span className="seasonbar-label">{q.id}</span>
                </div>
              );
            })}
          </div>

          <div className="quartersgrid">
            {quarters.map((q) => {
              const winners = winnersByQuarter[q.id] || [];
              const winnerLabel =
                q.status === 'zakończona' && winners.length
                  ? winners.map(w => {
                      const who = entryIndex[w.entry];
                      const pts = w.points || 0;
                      return `${who?.manager ?? '—'} (${who?.team ?? '—'}) – ${pts} pkt`;
                    }).join(', ')
                  : '';

              const statusClass =
                q.status === 'trwa' ? 'qactive' :
                q.status === 'zakończona' ? 'qdone' : '';
              const statusKey = quarterStatusKey(q.status);

              const isLocked = q.status === 'wkrótce';
              const topRows = quarterTop[q.id] || [];
              const hitsRows = showHits ? (quarterHitsTop[q.id] || []) : [];
              // wartość lidera każdej listy (obie są już posortowane malejąco z API) — używana
              // do subtelnego "X pkt do lidera" przy pozostałych wierszach zamiast paska postępu
              const maxTopPts = topRows[0]?.points ?? 0;
              const maxHitPts = hitsRows[0]?.hits ?? 0;

              return (
                <div
                  key={q.id}
                  className={`card qcard ${statusClass}`}
                  style={{ opacity: isLocked ? 0.85 : 1 }}
                >
                  <div className="qtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="qcard-id">{q.id}</span>
                      <span className="pill">GW {q.gw_from}–{q.gw_to}</span>
                    </div>
                    <span className={`qstatuspill qstatuspill--${statusKey}`}>
                      <span className="qstatusdot" />
                      {q.status}
                    </span>
                  </div>

                  <div className="small" style={{ marginTop: 6 }}>
                    {q.games} kolejek • {q.from} → {q.to}
                  </div>
                  <div className="small">{q.note}</div>

                  {/* Pasek postępu trwającej ćwiartki — realny % upływu czasu z API */}
                  {q.status === 'trwa' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <div className="qprogress" style={{ flex: 1 }}>
                        <div className="qprogress-fill" style={{ width: `${q.progress ?? 0}%` }} />
                      </div>
                      <span className="small" style={{ flexShrink: 0 }}>{q.progress ?? 0}%</span>
                    </div>
                  )}

                  {winnerLabel && (
                    <div className="small" style={{ marginTop: 8 }}>
                      🏆 <strong style={{ color: 'var(--text)' }}>Zwycięzca:</strong> {winnerLabel}
                    </div>
                  )}

                  <div
                    className="small"
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: '1px solid #1c2430',
                      lineHeight: 1.4
                    }}
                  >
                    {isLocked ? (
                      <div>Ćwiartka jeszcze się nie zaczęła — brak wyników</div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>
                          Top 3 {q.id}
                        </div>
                        {topRows.length === 0 ? (
                          <div>Brak danych</div>
                        ) : (
                          topRows.map((row, i) => (
                            <div key={row.entry} className="rankbar">
                              <div className="rankbar-top">
                                <span className="rankbar-rank">{rankBadge(i)}</span>
                                <span className="rankbar-name">
                                  {row.player_name} <span className="small">({row.entry_name})</span>
                                </span>
                                <span className="rankbar-pts">{row.points}</span>
                              </div>
                              {i > 0 && (
                                <div className="rankbar-gap">-{maxTopPts - row.points} pkt do lidera</div>
                              )}
                            </div>
                          ))
                        )}

                        {showHits && (
                          <>
                            <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 6 }}>
                              ⚡ Minusowe pkt {q.id}
                            </div>
                            {hitsRows.length === 0 ? (
                              <div>Nikt nie miał minusowych punktów w tej ćwiartce</div>
                            ) : (
                              hitsRows.map((row, i) => (
                                <div key={row.entry} className="rankbar">
                                  <div className="rankbar-top">
                                    <span className="rankbar-rank">{i + 1}.</span>
                                    <span className="rankbar-name">
                                      {row.player_name} <span className="small">({row.entry_name})</span>
                                    </span>
                                    <span className="rankbar-pts" style={{ color: '#ff9b9b' }}>-{row.hits}</span>
                                  </div>
                                  {i > 0 && (
                                    <div className="rankbar-gap">-{maxHitPts - row.hits} pkt mniej niż lider</div>
                                  )}
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
