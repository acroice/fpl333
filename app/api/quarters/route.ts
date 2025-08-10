import { NextResponse } from 'next/server';
export const revalidate = 0;

// GW start days (Damian)
const gwDays = [15,22,29,13,20,27,4,18,25,1,8,22,29,3,6,13,20,27,30,3,7,17,24,31,7,11,21,28,4,14,21,11,18,25,2,9,17,24];

function buildDates(){
  const months = [7,7,7,8,8,8,9,9,9,10,10,10,10,11,11,11,11,11,11,0,0,0,0,0,1,1,1,1,2,2,2,3,3,3,4,4,4,4];
  const years  = [2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2025,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026];
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
    { id: 'Q1', fromGW: 1, toGW: 6 },
    { id: 'Q2', fromGW: 7, toGW: 13 },
    { id: 'Q3', fromGW: 14, toGW: 19 },
    { id: 'Q4', fromGW: 20, toGW: 26 },
    { id: 'Q5', fromGW: 27, toGW: 32 },
    { id: 'Q6', fromGW: 33, toGW: 38 }
  ];

  const now = new Date();
  const seasonEnd = new Date(Date.UTC(2026, 4, 24)); // 24.05.2026

  const quarters = ranges.map(r => {
    const from = starts[r.fromGW-1];
    const to =
      r.id === 'Q6'
        ? seasonEnd // twardo 24.05.2026
        : new Date(starts[r.toGW].getTime() - 24*3600*1000); // „-1 dzień” do kolejnego startu
    const status = now < from ? 'wkrótce' : (now > to ? 'zakończona' : 'trwa');
    return {
      id: r.id,
      gw_from: r.fromGW,
      gw_to: r.toGW,
      games: r.toGW - r.fromGW + 1,
      from: fmt(from),
      to: fmt(to),
      status,
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
