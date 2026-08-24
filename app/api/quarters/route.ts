import { NextResponse } from 'next/server';
export const revalidate = 0;

// GW start days — sezon 2026/27 (deadline_time z /api/bootstrap-static/)
const gwDays = [21,28,4,12,18,10,17,23,31,7,21,28,2,5,12,19,26,30,2,6,16,23,30,6,10,20,27,3,13,20,10,17,24,1,8,15,23,30];

function buildDates(){
  const months = [7,7,8,8,8,9,9,9,9,10,10,10,11,11,11,11,11,11,0,0,0,0,0,1,1,1,1,2,2,2,3,3,3,4,4,4,4,4];
  const years  = [2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027,2027];
  const starts: Date[] = [];
  for (let i=0;i<38;i++){
    starts.push(new Date(Date.UTC(years[i], months[i], gwDays[i])));
  }
  return starts;
}

function fmt(d: Date){
  const dd = d.getUTCDate().toString().padStart(2,'0');
  const mm = (d.getUTCMonth()+1).toString().padStart(2,'0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export async function GET(){
  const starts = buildDates();

  const ranges = [
    { id: 'Q1', fromGW: 1, toGW: 10 },
    { id: 'Q2', fromGW: 11, toGW: 19 },
    { id: 'Q3', fromGW: 20, toGW: 28 },
    { id: 'Q4', fromGW: 29, toGW: 38 }
  ];

  const now = new Date();
  const seasonEnd = new Date(Date.UTC(2027, 4, 30)); // 30.05.2027 (start GW38)

  const quarters = ranges.map(r => {
    const from = starts[r.fromGW-1];
    const to =
      r.id === 'Q4'
        ? seasonEnd // twardo 30.05.2027
        : new Date(starts[r.toGW].getTime() - 24*3600*1000); // „-1 dzień” do kolejnego startu
    const status = now < from ? 'wkrótce' : (now > to ? 'zakończona' : 'trwa');

    // procent upływu czasu ćwiartki (0–100) — używany do paska postępu na froncie
    const progress =
      status === 'zakończona' ? 100 :
      status === 'wkrótce' ? 0 :
      Math.min(100, Math.max(0, Math.round(((now.getTime() - from.getTime()) / (to.getTime() - from.getTime())) * 100)));

    return {
      id: r.id,
      gw_from: r.fromGW,
      gw_to: r.toGW,
      games: r.toGW - r.fromGW + 1,
      from: fmt(from),
      to: fmt(to),
      status,
      progress,
      note:
        status === 'wkrótce' ? `Koniec ćwiartki ${r.id} za ${Math.max(0, Math.ceil((to.getTime()-now.getTime())/86400000))} dni`
        : status === 'trwa' ? `Trwa ćwiartka ${r.id}`
        : `Ćwiartka zakończona – wyniki gotowe`,
      // aktywna ćwiartka
      is_current:
        (now < starts[0]) ? r.id === 'Q1' // pre‑season → Q1
        : (now >= (starts[r.fromGW-1]) && now <= to)
    };
  });

  // Id obecnej ćwiartki (pre‑season → Q1)
  const current = quarters.find(q => q.is_current) ?? quarters[0];

  return NextResponse.json({ quarters, current: current?.id });
}
