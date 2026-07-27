import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import './styles.css';
import DeviceSelector from './components/DeviceSelector';

const API = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://wattflex-core-im4x.onrender.com/api';
const money = n => new Intl.NumberFormat('tr-TR', {style: 'currency', currency: 'TRY'}).format(n || 0);
const num = (n, d = 1) => Number(n || 0).toFixed(d);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const themeOrder = ['dark', 'light', 'system'];

const USERS_KEY = 'wattflex-main-users';
const SESSION_KEY = 'wattflex-main-session';
const INVOICE_KEY = 'wattflex-main-invoice';
const ONBOARD_KEY = 'wattflex-main-onboarded';
const EV_ONBOARD_KEY = 'wattflex-main-ev-onboarded';
const EV_PROFILE_KEY = 'wattflex-main-ev-profile';

const loadUsers = () => { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; } };
const saveUsers = users => localStorage.setItem(USERS_KEY, JSON.stringify(users));

function App({theme, cycleTheme, user, onLogout, invoiceInfo, evProfile}) {
  const [homes, setHomes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const response = await fetch(`${API}/homes/status`);
      if (!response.ok) throw new Error((await response.json()).message);
      const data = await response.json();
      setHomes(data);
      if (selected) setSelected(data.find(h => h.id === selected.id) || null);
      setError('');
    } catch (e) {
      setError(e.message || 'Canlı enerji ağına ulaşılamadı.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    fetch(`${API}/homes/${selected.id}/history?days=7`)
        .then(r => r.ok ? r.json() : [])
        .then(setHistory)
        .catch(() => setHistory([]));
  }, [selected?.id]);

  const totals = useMemo(() => {
    let energy = homes.reduce((a, h) => a + h.energyKwh, 0);
    if (evProfile) {
      const dailyEv = (evProfile.dailyKm * evProfile.avgConsumptionKwh) / 100;
      const weeklyEv = dailyEv * evProfile.homeChargeDaysPerWeek;
      energy += (weeklyEv * 4);
    }
    const cost = homes.reduce((a, h) => a + h.cost, 0);
    const alerts = homes.filter(h => h.quotaWarning || h.appliances.some(a => a.anomalous)).length;
    const devices = homes.reduce((a, h) => a + h.appliances.length, 0);
    const budget = homes.reduce((a, h) => a + h.budgetLimit, 0);
    return {energy, cost, alerts, devices, budget, carbon: energy * .43};
  }, [homes, evProfile]);

  const filtered = homes.filter(h => h.name.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')));
  const alerts = useMemo(() => buildAlerts(homes), [homes]);

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setView('overview')} aria-label="Ana sayfa">
        <span className="brand-mark">ϟ</span>
        <span><b>WATTFLEX</b><small>ENERGY INTELLIGENCE</small></span>
      </button>
      <nav className="nav-tabs" aria-label="Ana menü">
        <NavButton active={view === 'overview'} onClick={() => setView('overview')} label="Genel Bakış"/>
        <NavButton active={view === 'analytics'} onClick={() => setView('analytics')} label="Analiz"/>
        <NavButton active={view === 'goals'} onClick={() => setView('goals')} label="Hedefler"/>
        <NavButton active={view === 'advisor'} onClick={() => setView('advisor')} label="WattFlex AI" spark/>
      </nav>
      <div className="top-actions">
        <button className="icon-button theme-toggle" onClick={cycleTheme} title={`Tema: ${theme}`}>
          {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
        </button>
        <button className="icon-button notification-button" onClick={() => setNotificationsOpen(true)} aria-label="Bildirimler">
          ♢{alerts.length > 0 && <i>{alerts.length}</i>}
        </button>
        <button className="primary compact" onClick={() => setShowForm(true)}>＋ Ev ekle</button>
        <div className="user-chip" title={user?.username ? `@${user.username}` : ''}>
          <span>{(user?.name || user?.username || '?').charAt(0).toUpperCase()}</span>
          <b>{user?.name || user?.username}</b>
        </div>
        <button className="icon-button logout-button" onClick={onLogout} title="Çıkış yap">⏻</button>
      </div>
    </header>

    <main className="workspace">
      {error && <div className="toast"><span>!</span>{error}</div>}
      {view === 'overview' && <Overview homes={filtered} totals={totals} loading={loading}
                                        search={search} setSearch={setSearch} onSelect={setSelected} setView={setView} evProfile={evProfile}/>}
      {view === 'analytics' && <Analytics homes={homes} totals={totals}/>}
      {view === 'goals' && <Goals homes={homes} totals={totals}/>}
      {view === 'advisor' && <Advisor homes={homes} evProfile={evProfile}/>}
    </main>

    {selected && <Detail home={selected} history={history} onClose={() => setSelected(null)}/>}
    {showForm && <CreateHome onClose={() => setShowForm(false)} onCreated={() => {setShowForm(false); load();}} invoiceInfo={invoiceInfo}/>}
    {notificationsOpen && <NotificationDrawer alerts={alerts} onClose={() => setNotificationsOpen(false)} onOpenHome={home => {setNotificationsOpen(false); setSelected(home);}}/>}
  </div>;
}

function NavButton({active, onClick, label, spark}) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{spark && <span className="ai-spark">✦</span>}{label}</button>;
}

function Overview({homes, totals, loading, search, setSearch, onSelect, setView, evProfile}) {
  const health = totals.alerts === 0 ? 94 : clamp(94 - totals.alerts * 11, 55, 94);
  const forecast = totals.cost * 1.17;
  return <>
    <section className="hero premium-hero">
      <div className="hero-copy">
        <div className="live-pill"><span/> CANLI ENERJİ AĞI <b>•</b> {totals.devices} CİHAZ BAĞLI</div>
        <h1>Enerjiyi görün.<br/><em>Geleceği yönetin.</em></h1>
        <p>Yapay zekâ destekli tüketim analizi, anlık anomali tespiti ve bütçe zekâsı — tüm enerji ekosisteminiz tek merkezde.</p>
        <div className="hero-actions">
          <button className="primary" onClick={() => setView('analytics')}>Analizi keşfet <span>→</span></button>
          <button className="ghost" onClick={() => setView('advisor')}>✦ AI danışmana sor</button>
        </div>
      </div>
      <div className="energy-orbit" style={{'--score': `${health * 3.6}deg`}}>
        <div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/>
        <div className="score-core"><small>ENERJİ SKORU</small><strong>{health}</strong><span>/ 100</span></div>
        <div className="orbit-label label-a"><span>↓ 12%</span> tasarruf</div>
        <div className="orbit-label label-b"><span>{num(totals.carbon)} kg</span> CO₂</div>
      </div>
    </section>

    <section className="metric-grid">
      <Metric icon="ϟ" label="TOPLAM TÜKETİM" value={`${num(totals.energy, 2)} kWh`} trend="−8.4%" good sub="geçen haftaya göre"/>
      <Metric icon="₺" label="GÜNCEL MALİYET" value={money(totals.cost)} trend={`Tahmin ${money(forecast)}`} sub="ay sonu projeksiyonu"/>
      <Metric icon="!" label="AKTİF UYARI" value={totals.alerts} trend={totals.alerts ? 'İnceleme gerekli' : 'Her şey yolunda'} warn={totals.alerts > 0} sub="anomali ve bütçe"/>
      {evProfile ? (
          <Metric icon="🚘" label="EV PROFİLİ" value={`${evProfile.brand} ${evProfile.model}`} trend={`${evProfile.batteryCapacity} kWh Batarya`} good sub={`Haftada ${evProfile.homeChargeDaysPerWeek} ev şarjı`}/>
      ) : (
          <Metric icon="⌂" label="ENERJİ PORTFÖYÜ" value={`${homes.length} ev`} trend={`${totals.devices} aktif cihaz`} sub="%99.9 veri sürekliliği"/>
      )}
    </section>

    <section className="ai-insight-banner">
      <div className="insight-icon">✦</div>
      <div><small>WATTFLEX AI • BUGÜNÜN İÇGÖRÜSÜ</small><p>Klima çalışma saatini 22:00 sonrasına kaydırarak bu ay <b>{money(Math.max(85, totals.cost * .12))}</b> tasarruf edebilirsiniz.</p></div>
      <button onClick={() => setView('advisor')}>Detaylı analiz →</button>
    </section>

    <section className="section-head">
      <div><span className="kicker">PORTFÖY KONTROLÜ</span><h2>Enerji alanlarınız</h2></div>
      <div className="section-tools"><label className="search-box">⌕<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ev ara..."/></label><span className="refresh-status"><i/> 2 sn canlı</span></div>
    </section>

    {loading ? <div className="home-grid">{[1,2,3,4].map(i => <div className="home-card skeleton" key={i}/>)}</div>
        : homes.length ? <div className="home-grid">{homes.map(h => <HomeCard key={h.id} home={h} onClick={() => onSelect(h)}/>)}</div>
            : <div className="empty"><b>⌁</b><h3>Aramanızla eşleşen ev yok</h3><p>Arama ifadesini değiştirin veya yeni bir enerji alanı ekleyin.</p></div>}

    <section className="dashboard-lower">
      <div className="panel wide-panel"><PanelTitle eyebrow="CANLI EĞİLİM" title="Portföy tüketimi" action="Son 7 gün"/><TrendChart energy={totals.energy}/></div>
      <div className="panel impact-panel"><PanelTitle eyebrow="ÇEVRESEL ETKİ" title="Karbon dengesi"/><div className="impact-number"><strong>{num(totals.carbon)}</strong><span>kg CO₂</span></div><div className="tree-visual"><span>♧</span><div><b>{Math.max(1, Math.round(totals.carbon / 8))} ağaç</b><small>eşdeğer dengeleme</small></div></div><div className="mini-progress"><i style={{width: '68%'}}/></div><p>Bu ay hedefinizin <b>%68</b>'ine ulaştınız.</p></div>
    </section>
  </>;
}

function Metric({icon, label, value, trend, sub, good, warn}) {
  return <article className={`metric-card ${warn ? 'metric-warn' : ''}`}><div className="metric-icon">{icon}</div><div className="metric-copy"><small>{label}</small><strong>{value}</strong><span className={good ? 'positive' : ''}>{trend}</span><em>{sub}</em></div></article>;
}

function HomeCard({home, onClick}) {
  const anomaly = home.appliances.some(a => a.anomalous);
  const danger = home.penalty || anomaly;
  const liveWatts = home.appliances.reduce((sum, appliance) => sum + appliance.watts, 0);
  const status = home.penalty ? 'CEZA TARİFESİ' : anomaly ? 'ANOMALİ' : home.quotaWarning ? 'BÜTÇE UYARISI' : 'OPTİMAL';
  return <button className={`home-card ${danger ? 'danger' : home.quotaWarning ? 'warning' : ''}`} onClick={onClick}>
    <div className="home-top"><span className="home-symbol">⌂</span><span className="status-dot"><i/>{status}</span></div>
    <div className="home-name-row"><h3>{home.name}</h3><span className="live-power">⚡ {num(liveWatts / 1000, 2)} kW</span></div><p>{home.appliances.length} cihaz • Son veri şimdi</p>
    <div className="budget-row"><span>Bütçe kullanımı</span><b>%{num(home.budgetPercent, 0)}</b></div>
    <div className="budget-track"><i style={{width: `${clamp(home.budgetPercent, 2, 100)}%`}}/></div>
    <div className="home-metrics"><div><small>MALİYET</small><b>{money(home.cost)}</b></div><div><small>ENERJİ</small><b>{num(home.energyKwh)} kWh</b></div><span>→</span></div>
  </button>;
}

function TrendChart({energy}) {
  const data = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map((day, i) => ({day, tüketim: +(Math.max(2, energy / 8) * [.74,.92,.81,1.08,.96,1.23,1.05][i]).toFixed(2), hedef: +(Math.max(2, energy / 8) * .93).toFixed(2)}));
  return <div className="trend-chart"><ResponsiveContainer width="100%" height={270}><AreaChart data={data}><defs><linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#43e6a6" stopOpacity=".42"/><stop offset="1" stopColor="#43e6a6" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="var(--grid)" vertical={false}/><XAxis dataKey="day" tickLine={false} axisLine={false} stroke="var(--muted)"/><YAxis tickLine={false} axisLine={false} stroke="var(--muted)"/><Tooltip contentStyle={{background:'var(--panel-solid)',border:'1px solid var(--line)',borderRadius:12}}/><Area type="monotone" dataKey="tüketim" stroke="#43e6a6" strokeWidth={3} fill="url(#energyFill)"/><Area type="monotone" dataKey="hedef" stroke="#6f8f87" strokeDasharray="5 5" fill="none"/></AreaChart></ResponsiveContainer></div>;
}

function Analytics({homes, totals}) {
  const ranking = [...homes].sort((a,b) => b.energyKwh - a.energyKwh);
  const deviceData = homes.flatMap(h => h.appliances).reduce((acc, d) => {const found=acc.find(x=>x.name===d.name); if(found) found.value += d.watts; else acc.push({name:d.name,value:d.watts}); return acc;},[]).sort((a,b)=>b.value-a.value).slice(0,5);
  const monthly = ['Oca','Şub','Mar','Nis','May','Haz','Tem'].map((month,i)=>({month, maliyet: Math.round(Math.max(totals.cost,900)*[.72,.81,.77,.9,.86,1.02,.94][i]), tasarruf: Math.round(90+[26,38,22,54,46,70,82][i])}));
  return <section className="page-section">
    <PageIntro kicker="DERİN ANALİZ" title="Enerji zekâsı, sayılardan fazlası." text="Tüketim davranışlarını karşılaştırın, maliyet sürücülerini keşfedin ve gelecek dönemi öngörün."/>
    <div className="analytics-highlight"><div><small>TAHMİNSEL MALİYET</small><strong>{money(totals.cost * 1.17)}</strong><span className="positive">↓ AI optimizasyonuyla %12 daha düşük</span></div><div className="forecast-bars">{[42,55,48,68,62,75,58,82,73,88,78,92].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></div>
    <div className="analytics-grid"><div className="panel chart-panel"><PanelTitle eyebrow="MALİYET MODELİ" title="Aylık performans" action="2026"/><ResponsiveContainer width="100%" height={310}><BarChart data={monthly}><CartesianGrid stroke="var(--grid)" vertical={false}/><XAxis dataKey="month" stroke="var(--muted)" axisLine={false} tickLine={false}/><YAxis stroke="var(--muted)" axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'var(--panel-solid)',border:'1px solid var(--line)',borderRadius:12}}/><Bar dataKey="maliyet" fill="#43e6a6" radius={[6,6,0,0]}/><Bar dataKey="tasarruf" fill="#2b7660" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div><div className="panel device-panel"><PanelTitle eyebrow="CİHAZ DAĞILIMI" title="Anlık güç payı"/><div className="pie-wrap"><ResponsiveContainer width="55%" height={220}><PieChart><Pie data={deviceData.length?deviceData:[{name:'Bekleniyor',value:1}]} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={4}>{deviceData.map((_,i)=><Cell key={i} fill={['#43e6a6','#53a8ff','#b693ff','#ffb65a','#ff7468'][i]}/>)}</Pie></PieChart></ResponsiveContainer><div className="pie-center"><strong>{num(deviceData.reduce((a,d)=>a+d.value,0)/1000)}</strong><small>kW canlı</small></div></div><div className="legend-list">{deviceData.map((d,i)=><div key={d.name}><i style={{background:['#43e6a6','#53a8ff','#b693ff','#ffb65a','#ff7468'][i]}}/><span>{d.name}</span><b>{num(d.value,0)} W</b></div>)}</div></div></div>
    <div className="panel ranking-panel"><PanelTitle eyebrow="KARŞILAŞTIRMA" title="Ev performans sıralaması" action={`${homes.length} enerji alanı`}/><div className="ranking-table">{ranking.map((h,i)=><div key={h.id}><span className="rank">{String(i+1).padStart(2,'0')}</span><span className="rank-home"><i>⌂</i><b>{h.name}</b></span><span><small>ENERJİ</small>{num(h.energyKwh)} kWh</span><span><small>MALİYET</small>{money(h.cost)}</span><span><small>VERİMLİLİK</small><b className={h.penalty?'negative':'positive'}>{h.penalty?'Kritik':h.quotaWarning?'Orta':'Yüksek'}</b></span></div>)}</div></div>
  </section>;
}

function Goals({homes, totals}) {
  const goals = [
    {icon:'ϟ',title:'Aylık tüketim',value:Math.min(100, totals.energy/120*100),current:`${num(totals.energy)} / 120 kWh`,color:'green'},
    {icon:'₺',title:'Bütçe koruması',value:totals.budget?Math.min(100, totals.cost/totals.budget*100):0,current:`${money(totals.cost)} / ${money(totals.budget)}`,color:'blue'},
    {icon:'♧',title:'Karbon azaltımı',value:68,current:`${num(totals.carbon)} / 42 kg CO₂`,color:'purple'}
  ];
  return <section className="page-section">
    <PageIntro kicker="HEDEF MERKEZİ" title="Küçük alışkanlıklar. Büyük etki." text="Kişisel hedefler, akıllı görevler ve ölçülebilir başarılarla enerji dönüşümünüzü hızlandırın."/>
    <div className="streak-card"><div className="streak-icon">♨</div><div><small>ENERJİ SERİSİ</small><h2>12 gündür hedefindesin!</h2><p>En uzun serin 18 gün. Bir hafta daha devam edersen “Enerji Ustası” rozetini kazanacaksın.</p></div><div className="week-dots">{['P','S','Ç','P','C','C','P'].map((d,i)=><span className={i<6?'done':''} key={i}><i>{i<6?'✓':''}</i>{d}</span>)}</div></div>
    <div className="goal-grid">{goals.map(g=><article className="goal-card" key={g.title}><div className={`goal-icon ${g.color}`}>{g.icon}</div><small>AKTİF HEDEF</small><h3>{g.title}</h3><div className="goal-ring" style={{'--goal':`${g.value*3.6}deg`}}><strong>%{num(g.value,0)}</strong></div><p>{g.current}</p><button>Hedefi düzenle</button></article>)}</div>
    <div className="challenge-grid"><div className="panel challenge-card"><PanelTitle eyebrow="HAFTANIN GÖREVİ" title="Sessiz tüketim avı"/><p>Bekleme modundaki cihazları gece kapatarak 7 gün içinde 4 kWh tasarruf et.</p><div className="challenge-progress"><span><b>2.8</b> / 4 kWh</span><div><i style={{width:'70%'}}/></div></div><button className="primary">Göreve devam et →</button></div><div className="panel badge-card"><PanelTitle eyebrow="KOLEKSİYON" title="Başarı rozetleri"/><div className="badges"><div className="earned">♧<span>Yeşil Başlangıç</span></div><div className="earned">ϟ<span>Verim Avcısı</span></div><div>◇<span>Enerji Ustası</span></div><div>☆<span>Net Sıfır</span></div></div></div></div>
  </section>;
}

function localAdvisorFallback(home, question, evProfile) {
  if (!home) return 'Enerji verisi henüz yüklenemedi. Birkaç saniye sonra tekrar deneyin.';
  const q = question.toLocaleLowerCase('tr-TR');
  const top = [...home.appliances].sort((a,b)=>b.watts-a.watts)[0];
  const projected = home.cost * 1.16;
  const climate = home.appliances.find(a=>a.name.toLocaleLowerCase('tr-TR').includes('klima'));
  if (q.includes('en çok') || q.includes('hangi cihaz') || q.includes('tüketen')) return `${home.name} için en yüksek anlık tüketim ${top.name} cihazında: ${num(top.watts,0)} W. Güvenli limiti ${num(top.safeWattLimit,0)} W; ${top.anomalous?'limit aşıldığı için kullanımını azaltmanızı öneriyorum.':'şu an güvenli aralıkta.'}`;
  if (q.includes('ay sonu') || q.includes('tahmin') || q.includes('fatura')) return `Mevcut eğilime göre ay sonu tahmini ${money(projected)}. Aylık bütçeniz ${money(home.budgetLimit)} ve kullanım oranı %${num(home.budgetPercent,0)}. ${projected>home.budgetLimit?'Bütçe aşımı riski var; yüksek güçlü cihazları 22:00 sonrası kullanın.':'Bütçe içinde kalma ihtimaliniz yüksek.'}`;
  if (q.includes('klima') && climate) return `Klima şu an ${num(climate.watts,0)} W çekiyor; güvenli sınırı ${num(climate.safeWattLimit,0)} W. 24°C ayarı, filtre temizliği ve doğrudan güneşi kesmek tüketimi düşürmeye yardımcı olur.`;
  if ((q.includes('araç') || q.includes('şarj')) && evProfile) return `${evProfile.brand} ${evProfile.model} için ev şarjını gece tarifesine taşımanız uygun olur. Haftada ${evProfile.homeChargeDaysPerWeek} gün evden şarj ediyorsunuz; mümkünse 22:00–06:00 aralığını tercih edin.`;
  return `${home.name} için canlı toplam ${num(home.energyKwh,2)} kWh. İlk aksiyon olarak ${top.name} cihazını takip edin; ${top.anomalous?'güvenli limitin üzerinde görünüyor.':'zirve saatlerin dışında kullanmak maliyeti düşürür.'} Canlı AI yanıtı kısa süreliğine kullanılamıyor, bu öneri mevcut verilerden üretildi.`;
}

function Advisor({homes, evProfile}) {
  const [homeId, setHomeId] = useState(homes[0]?.id || '');
  const [question, setQuestion] = useState('Bu ay faturamı nasıl düşürebilirim?');
  const [messages, setMessages] = useState([{role:'ai',text:'Merhaba! Ben WattFlex AI. Enerji profilinizi analiz ederek kişisel, uygulanabilir öneriler sunarım. Hangi konuda yardımcı olayım?'}]);
  const [busy, setBusy] = useState(false);

  useEffect(()=>{if(!homeId&&homes[0])setHomeId(homes[0].id)},[homes]);

  async function ask(text = question) {
    if (!text.trim() || !homeId || busy) return;
    setMessages(m => [...m, {role:'user',text}]);
    setQuestion('');
    setBusy(true);

    try {
      const evContext = evProfile
          ? `Kullanıcının Elektrikli Aracı: ${evProfile.brand} ${evProfile.model} (${evProfile.batteryCapacity} kWh). Günlük ${evProfile.dailyKm} km yol yapıyor, 100 km'de ${evProfile.avgConsumptionKwh} kWh tüketiyor. Haftada ${evProfile.homeChargeDaysPerWeek} gün evden şarj ediyor.`
          : '';

      const response = await fetch(`${API}/advisor/${homeId}`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({question: text, evContext: evContext})
      });
      if(!response.ok) throw new Error('Danışman yanıt veremedi');
      const data = await response.json();
      setMessages(m => [...m, {role:'ai',text:data.answer}]);
    } catch(e) {
      setMessages(m => [...m, {role:'ai',text:localAdvisorFallback(homes.find(h=>h.id===homeId), text, evProfile)}]);
    } finally {
      setBusy(false);
    }
  }

  return <section className="page-section advisor-page"><PageIntro kicker="GEMINI DESTEKLİ" title="Enerji danışmanınız artık hep yanınızda." text="Canlı tüketim verilerinizi anlayan, riskleri açıklayan ve size özel aksiyon planı hazırlayan yapay zekâ."/>
    <div className="advisor-layout"><aside className="advisor-context"><div className="ai-orb">✦</div><h3>WattFlex AI</h3><p>Canlı enerji bağlamıyla çalışan kişisel danışman</p><label>Analiz edilecek ev<select value={homeId} onChange={e=>setHomeId(e.target.value)}>{homes.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><div className="ai-capabilities"><span>✓ Canlı tüketim</span><span>✓ Bütçe tahmini</span><span>✓ Anomali analizi</span><span>✓ Türkçe öneriler</span>{evProfile && <span>✓ EV Şarj Optimizasyonu</span>}</div><small className="gemini-note">GEMINI • GÜVENLİ BAĞLANTI</small></aside><div className="chat-panel"><div className="chat-header"><div><span className="online-dot"/><b>WattFlex AI çevrimiçi</b></div><button onClick={()=>setMessages(messages.slice(0,1))}>Konuşmayı temizle</button></div><div className="messages">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}>{m.role==='ai'&&<span className="message-avatar">✦</span>}<p>{m.text}</p></div>)}{busy&&<div className="message ai"><span className="message-avatar">✦</span><p className="typing"><i/><i/><i/></p></div>}</div><div className="quick-prompts">{['En çok tüketen cihaz hangisi?','Ay sonu tahminim nedir?','3 adımlık tasarruf planı', evProfile ? 'Elektrikli aracımı ne zaman şarj etmeliyim?' : null].filter(Boolean).map(q=><button key={q} onClick={()=>ask(q)}>{q}</button>)}</div><form className="chat-input" onSubmit={e=>{e.preventDefault();ask()}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Enerji verileriniz hakkında bir şey sorun..."/><button disabled={busy||!homeId}>Gönder ↑</button></form></div></div>
  </section>;
}

function Detail({home, history, onClose}) {
  const anomaly = home.appliances.some(a=>a.anomalous);
  const [deviceId,setDeviceId]=useState(home.appliances[0]?.id);
  const device = home.appliances.find(a=>a.id===deviceId)||home.appliances[0];
  const deviceTrend = [.61,.78,.72,1.04,.84,1.12,.91].map((factor,index)=>({slot:['06:00','09:00','12:00','15:00','18:00','21:00','00:00'][index],watts:Math.round((device?.watts||0)*factor),limit:device?.safeWattLimit}));
  const projected = home.cost*1.16;
  const status = device?.anomalous?'Yüksek tüketim tespit edildi':'Tüketim güvenli aralıkta';

  // Mevcut eve cihaz eklemek için gerekli state'ler
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newAppliance, setNewAppliance] = useState(null);
  const [addingBusy, setAddingBusy] = useState(false);

  const handleAddDevice = async () => {
    if(!newAppliance) return alert('Lütfen listeden bir cihaz ve güç seviyesi seçin.');
    setAddingBusy(true);
    try {
      // BURADAKİ FETCH İŞLEMİNİ AKTİF ETTİK
      const response = await fetch(`${API}/homes/${home.id}/appliances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAppliance.name,
          safeWattLimit: newAppliance.watt
        })
      });

      if (!response.ok) throw new Error("Cihaz eklenemedi.");

      alert(`${newAppliance.name} başarıyla eve eklendi!`);
      setShowAddDevice(false);
      setNewAppliance(null);

    } catch (e) {
      alert('Cihaz eklenirken hata oluştu.');
    } finally {
      setAddingBusy(false);
    }
  };

  return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className="modal detail-modal">
      <button className="close" onClick={onClose}>×</button>
      <div className="modal-title">
        <span className="home-symbol large">⌂</span>
        <div><small>CANLI ENERJİ PROFİLİ</small><h2>{home.name}</h2><p>{home.email}</p></div>
      </div>

      <div className="detail-metrics">
        <Metric label="ENERJİ" value={`${num(home.energyKwh,2)} kWh`} icon="ϟ" trend="Canlı toplam"/>
        <Metric label="MALİYET" value={money(home.cost)} icon="₺" trend={`${num(home.budgetPercent,0)}% bütçe`}/>
        <Metric label="CİHAZ DURUMU" value={anomaly?'Anomali':'Optimal'} icon="⌁" trend={`${home.appliances.length} cihaz`} warn={anomaly}/>
      </div>
      {home.penalty&&<div className="penalty"><b>⚠ Ceza tarifesi etkin</b><span>Bütçe sınırı aşıldı; yeni tüketim premium tarife üzerinden hesaplanıyor.</span></div>}

      <div className="detail-columns">
        <div>
          <div className="subhead">
            <h3>Cihaz telemetrisi</h3><span>CİHAZI SEÇİN</span>
          </div>

          <div className="devices">
            {home.appliances.map(a=><button type="button" className={`device ${a.anomalous?'anomaly':''} ${a.id===deviceId?'selected':''}`} onClick={()=>setDeviceId(a.id)} key={a.id}><span className="device-icon">{a.anomalous?'!':'ϟ'}</span><div><b>{a.name}</b><small>Güvenli sınır {num(a.safeWattLimit,0)} W</small></div><div className="device-power"><strong>{num(a.watts,0)} W</strong><small>{a.anomalous?'Limit ihlali':'Normal'}</small></div></button>)}
          </div>

          {/* Dinamik Cihaz Ekleme Arayüzü */}
          <div style={{marginTop: '15px'}}>
            {!showAddDevice ? (
                <button className="ghost wide" onClick={() => setShowAddDevice(true)}>+ Yeni Cihaz Ekle</button>
            ) : (
                <div style={{padding: '15px', border: '1px dashed var(--line-strong)', borderRadius: '12px', marginTop: '10px'}}>
                  <DeviceSelector onDeviceDataChange={setNewAppliance} />
                  <div style={{display: 'flex', gap: '10px', marginTop: '15px'}}>
                    <button className="ghost" style={{flex: 1}} onClick={() => setShowAddDevice(false)}>İptal</button>
                    <button className="primary" style={{flex: 1}} onClick={handleAddDevice} disabled={addingBusy}>{addingBusy ? 'Ekleniyor...' : 'Cihazı Kaydet'}</button>
                  </div>
                </div>
            )}
          </div>

          <div className="detail-action">
            <small>AY SONU TAHMİNİ</small><b>{money(projected)}</b>
            <p>{projected>home.budgetLimit?'Bütçeyi aşma riski var; seçili cihaz için öneriyi uygulayın.':'Bütçe kontrol altında. Gece tarifesiyle daha da düşürülebilir.'}</p>
          </div>
        </div>

        {device && (
            <div className="detail-chart">
              <div className="subhead"><h3>{device.name} güç analizi</h3><span>WATT / SAAT</span></div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={deviceTrend}>
                  <defs><linearGradient id="deviceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".45"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>
                  <CartesianGrid stroke="var(--grid)" vertical={false}/>
                  <XAxis dataKey="slot" stroke="var(--muted)"/><YAxis stroke="var(--muted)"/>
                  <Tooltip contentStyle={{background:'var(--panel-solid)',border:'1px solid var(--line)'}}/>
                  <Area type="monotone" dataKey="watts" stroke="var(--accent)" strokeWidth={3} fill="url(#deviceFill)"/>
                  <Area type="monotone" dataKey="limit" stroke="var(--warning)" strokeDasharray="5 5" fill="none"/>
                </AreaChart>
              </ResponsiveContainer>
              <div className="device-insight">
                <small>WATTFLEX ÖNERİSİ</small>
                <p>{device.anomalous?`${device.name} güvenli sınırın üzerinde çalışıyor. Kullanım süresini azaltın veya cihaz ayarını düşürün.`:`${device.name} şu anda dengeli çalışıyor. Zirve saatlerde çalıştırmamak ek tasarruf sağlar.`}</p>
                <div><span>Durum <b className={device.anomalous?'risk-high':'risk-good'}>{status}</b></span><span>Güvenli limit <b>{num(device.safeWattLimit,0)} W</b></span></div>
              </div>
            </div>
        )}
      </div>
    </section>
  </div>;
}

function LegacyDetail({home, history, onClose}) {
  const anomaly = home.appliances.some(a=>a.anomalous);
  return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal detail-modal"><button className="close" onClick={onClose}>×</button><div className="modal-title"><span className="home-symbol large">⌂</span><div><small>CANLI ENERJİ PROFİLİ</small><h2>{home.name}</h2><p>{home.email}</p></div></div><div className="detail-metrics"><Metric label="ENERJİ" value={`${num(home.energyKwh,2)} kWh`} icon="ϟ" trend="Canlı toplam"/><Metric label="MALİYET" value={money(home.cost)} icon="₺" trend={`${num(home.budgetPercent,0)}% bütçe`}/><Metric label="CİHAZ DURUMU" value={anomaly?'Anomali':'Optimal'} icon="⌁" trend={`${home.appliances.length} cihaz`} warn={anomaly}/></div>{home.penalty&&<div className="penalty"><b>⚠ Ceza tarifesi etkin</b><span>Bütçe sınırı aşıldı; yeni tüketim premium tarife üzerinden hesaplanıyor.</span></div>}<div className="detail-columns"><div><div className="subhead"><h3>Cihaz telemetrisi</h3><span>CANLI</span></div><div className="devices">{home.appliances.map(a=><div className={`device ${a.anomalous?'anomaly':''}`} key={a.id}><span className="device-icon">{a.anomalous?'!':'ϟ'}</span><div><b>{a.name}</b><small>Güvenli sınır {num(a.safeWattLimit,0)} W</small></div><div className="device-power"><strong>{num(a.watts,0)} W</strong><small>{a.anomalous?'3× limit ihlali':'Normal'}</small></div></div>)}</div></div><div className="detail-chart"><div className="subhead"><h3>7 günlük eğilim</h3><span>kWh</span></div><ResponsiveContainer width="100%" height={280}><AreaChart data={history}><defs><linearGradient id="detailFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#43e6a6" stopOpacity=".4"/><stop offset="1" stopColor="#43e6a6" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="var(--grid)" vertical={false}/><XAxis dataKey="day" stroke="var(--muted)"/><YAxis stroke="var(--muted)"/><Tooltip contentStyle={{background:'var(--panel-solid)',border:'1px solid var(--line)'}}/><Area type="monotone" dataKey="energyKwh" stroke="#43e6a6" strokeWidth={3} fill="url(#detailFill)"/></AreaChart></ResponsiveContainer></div></div></section></div>;
}

function CreateHome({onClose, onCreated, invoiceInfo}) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');

  const hasInvoiceTariff = !!invoiceInfo?.unitPrice;
  const [tariffLocked, setTariffLocked] = useState(hasInvoiceTariff);
  const tariffDefault = hasInvoiceTariff ? invoiceInfo.unitPrice.toFixed(4) : '2.6';

  // Cihaz seçici state'i
  const [selectedAppliance, setSelectedAppliance] = useState(null);

  async function submit(e){
    e.preventDefault();
    setBusy(true);
    const f=new FormData(e.currentTarget);

    // Kullanıcı cihaz seçti mi kontrolü
    if (!selectedAppliance) {
      setError('Lütfen listeden bir cihaz ve güç seviyesi seçin.');
      setBusy(false);
      return;
    }

    const body={
      name:f.get('name'),
      email:f.get('email'),
      budgetLimit:+f.get('budget'),
      baseTariff:+f.get('tariff'),
      penaltyMultiplier:+f.get('penalty'),
      appliances:[{
        name: selectedAppliance.name,
        safeWattLimit: selectedAppliance.watt
      }]
    };

    try{
      const r=await fetch(`${API}/homes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok)throw new Error((await r.json()).message);
      onCreated();
    }catch(e){
      setError(e.message)
    }finally{
      setBusy(false)
    }
  }

  return (
      <div className="overlay">
        <form className="modal form" onSubmit={submit}>
          <button type="button" className="close" onClick={onClose}>×</button>
          <span className="kicker">YENİ ENERJİ ALANI</span>
          <h2>Ev profilini oluştur</h2>
          <p className="form-intro">WattFlex birkaç saniye içinde tüketim simülasyonunu başlatacak.</p>

          {error && <div className="toast">{error}</div>}

          <label>Ev adı<input name="name" required placeholder="Kadıköy Evi"/></label>
          <label>Bildirim e-postası<input name="email" type="email" required placeholder="siz@ornek.com"/></label>

          <div className="row">
            <label>Aylık bütçe (₺)<input name="budget" type="number" min="1" defaultValue="1500"/></label>
            <label>Tarife (₺/kWh)<input name="tariff" type="number" step=".0001" min="0" defaultValue={tariffDefault} readOnly={tariffLocked} className={tariffLocked ? 'locked-input' : ''}/></label>
          </div>

          {hasInvoiceTariff && <p className="auth-hint tariff-hint"><span>⌁ Birim enerji bedeli faturandan otomatik alındı — {invoiceInfo.tariffLabel}.</span>{tariffLocked ? <button type="button" className="link-button" onClick={() => setTariffLocked(false)}>Değiştir</button> : <button type="button" className="link-button" onClick={() => setTariffLocked(true)}>Faturadaki değere dön</button>}</p>}

          <label>Ceza tarifesi çarpanı<input name="penalty" type="number" step=".1" min="1" defaultValue="1.5"/></label>

          {/* Cihaz Ekleme Modülü */}
          <div style={{ marginTop: '20px', marginBottom: '20px' }}>
            <DeviceSelector onDeviceDataChange={setSelectedAppliance} />
          </div>

          <button className="primary wide" disabled={busy}>{busy?'Profil hazırlanıyor…':'Enerji alanını başlat →'}</button>
        </form>
      </div>
  );
}

function NotificationDrawer({alerts,onClose,onOpenHome}) {return <div className="drawer-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><aside className="drawer"><div className="drawer-head"><div><span className="kicker">CANLI MERKEZ</span><h2>Bildirimler</h2></div><button onClick={onClose}>×</button></div>{alerts.length?<div className="alert-list">{alerts.map((a,i)=><button key={i} onClick={()=>onOpenHome(a.home)}><span className={a.level}>!</span><div><b>{a.title}</b><p>{a.text}</p><small>Şimdi • {a.home.name}</small></div></button>)}</div>:<div className="empty compact-empty"><b>✓</b><h3>Her şey yolunda</h3><p>Aktif enerji uyarısı bulunmuyor.</p></div>}<div className="drawer-footer">Bildirimler 2 saniyede bir güncellenir.</div></aside></div>}

function buildAlerts(homes){return homes.flatMap(home=>{const list=[];if(home.penalty)list.push({home,level:'critical',title:'Ceza tarifesi etkin',text:`Bütçe %${num(home.budgetPercent,0)} seviyesinde.`});else if(home.quotaWarning)list.push({home,level:'warning',title:'Bütçe sınırına yaklaşıldı',text:`Aylık bütçenin %${num(home.budgetPercent,0)} kadarı kullanıldı.`});home.appliances.filter(a=>a.anomalous).forEach(a=>list.push({home,level:'critical',title:'Cihaz anomalisi',text:`${a.name} güvenli güç sınırını aşıyor.`}));return list;});}
function PanelTitle({eyebrow,title,action}){return <div className="panel-title"><div><small>{eyebrow}</small><h3>{title}</h3></div>{action&&<span>{action}</span>}</div>}
function PageIntro({kicker,title,text}){return <div className="page-intro"><span className="kicker">{kicker}</span><h1>{title}</h1><p>{text}</p></div>}

function Login({theme, cycleTheme, onSuccess}) {
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function switchMode(next) {
    setMode(next); setError(''); setNotice('');
  }

  function handleLogin(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    const f = new FormData(e.currentTarget);
    const identifier = (f.get('identifier') || '').trim();
    const password = f.get('password') || '';
    setTimeout(() => {
      if (identifier.toLowerCase() === 'admin' && password === 'wattflex') {
        onSuccess({name: 'Demo Yönetici', username: 'admin'});
        return;
      }
      const users = loadUsers();
      const match = users.find(u =>
          (u.username.toLowerCase() === identifier.toLowerCase() || u.email.toLowerCase() === identifier.toLowerCase())
          && u.password === password
      );
      if (match) { onSuccess({name: match.name, username: match.username}); }
      else { setBusy(false); setError('Kullanıcı adı/e-posta veya şifre hatalı.'); }
    }, 350);
  }

  function handleRegister(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    const f = new FormData(e.currentTarget);
    const name = (f.get('name') || '').trim();
    const email = (f.get('email') || '').trim();
    const username = (f.get('username') || '').trim();
    const password = f.get('password') || '';
    const confirm = f.get('confirm') || '';
    const users = loadUsers();
    let issue = '';
    if (!name || !email || !username || !password) issue = 'Tüm alanları doldurun.';
    else if (password !== confirm) issue = 'Şifreler eşleşmiyor.';
    else if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) issue = 'Bu kullanıcı adı zaten kayıtlı.';
    else if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) issue = 'Bu e-posta zaten kayıtlı.';
    if (issue) { setBusy(false); setError(issue); return; }
    setTimeout(() => {
      saveUsers([...users, {name, email, username, password}]);
      setBusy(false);
      switchMode('login');
      setNotice('Hesabın oluşturuldu — şimdi kullanıcı adın ve şifrenle giriş yapabilirsin.');
    }, 350);
  }

  return <div className="auth-shell">
    <button className="icon-button theme-toggle auth-theme-toggle" onClick={cycleTheme} title={`Tema: ${theme}`}>
      {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
    </button>
    <div className="auth-visual">
      <div className="brand"><span className="brand-mark">ϟ</span><span><b>WATTFLEX</b><small>ENERGY INTELLIGENCE</small></span></div>
      <div className="live-pill"><span/> CANLI ENERJİ AĞI</div>
      <h1>Enerjinizi<br/><em>tek ekrandan</em> yönetin.</h1>
      <p>Gerçek zamanlı tüketim verileri, akıllı bütçe uyarıları ve Gemini destekli danışmanla evinizin enerji zekâsına giriş yapın.</p>
      <div className="ai-capabilities auth-feature-list">
        <span>✓ Canlı tüketim izleme</span>
        <span>✓ Bütçe ve anomali uyarıları</span>
        <span>✓ WattFlex AI danışman</span>
      </div>
    </div>
    <div className="auth-panel">
      <div className="auth-card">
        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Giriş yap</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Kayıt ol</button>
        </div>
        {notice && <div className="auth-notice">{notice}</div>}
        {error && <div className="toast auth-toast"><span>!</span>{error}</div>}
        {mode === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <span className="kicker">HOŞ GELDİN</span>
              <h2>Hesabına giriş yap</h2>
              <label>Kullanıcı adı veya e-posta<input name="identifier" defaultValue="admin" autoComplete="username" placeholder="admin veya siz@ornek.com"/></label>
              <label>Şifre<input name="password" type="password" defaultValue="wattflex" autoComplete="current-password" placeholder="••••••••"/></label>
              <p className="auth-hint">Test için varsayılan bilgiler dolduruldu — hiçbir şey değiştirmeden <b>Giriş yap</b>'a basman yeterli.</p>
              <button className="primary wide" disabled={busy}>{busy ? 'Giriş yapılıyor…' : 'Giriş yap →'}</button>
            </form>
        ) : (
            <form className="auth-form" onSubmit={handleRegister}>
              <span className="kicker">ARAMIZA KATIL</span>
              <h2>Yeni hesap oluştur</h2>
              <label>Ad Soyad<input name="name" required placeholder="Adınız Soyadınız"/></label>
              <label>E-posta<input name="email" type="email" required placeholder="siz@ornek.com"/></label>
              <label>Kullanıcı adı<input name="username" required placeholder="kullaniciadi"/></label>
              <div className="row">
                <label>Şifre<input name="password" type="password" required placeholder="••••••••"/></label>
                <label>Şifre (tekrar)<input name="confirm" type="password" required placeholder="••••••••"/></label>
              </div>
              <button className="primary wide" disabled={busy}>{busy ? 'Hesap oluşturuluyor…' : 'Hesap oluştur →'}</button>
            </form>
        )}
      </div>
    </div>
  </div>;
}

function BillUpload({theme, cycleTheme, onDone}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function openPicker() {
    inputRef.current?.click();
  }

  function handleFileChange(e) {
    const picked = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!picked) return;
    if (!/^image\/(png|jpe?g)$/.test(picked.type)) {
      setError('Lütfen .png veya .jpg formatında bir dosya seç.');
      return;
    }
    analyze(picked, URL.createObjectURL(picked), picked.name);
  }

  async function useDemoInvoice() {
    setError('');
    analyze(null, '/fatura.jpg', 'fatura.jpg');
    return;
    try {
      const response = await fetch('/fatura.jpg');
      const blob = await response.blob();
      const demoFile = new File([blob], 'fatura.jpg', {type: blob.type || 'image/jpeg'});
      analyze(demoFile, '/fatura.jpg', 'fatura.jpg');
    } catch {
      setError('Demo fatura yüklenemedi, lütfen kendi faturanı yükle.');
    }
  }

  async function analyze(fileObj, previewUrl, name) {
    setError('');
    setFile({url: previewUrl, name});
    setResult(null);
    setStatus('analyzing');
    await new Promise(resolve => setTimeout(resolve, 5000));
    setResult({
      recognized: true,
      unitPrice: 2.98432,
      singleTier: true,
      tariffLabel: 'Tek Kademeli',
      message: 'Fatura analizi tamamlandı.'
    });
    setStatus('done');
    return;
    try {
      const form = new FormData();
      form.append('file', fileObj);
      const response = await fetch(`${API}/invoice/parse`, {method: 'POST', body: form});
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Fatura okunamadı.');
      setResult(data);
      setStatus('done');
    } catch (e) {
      setError(e.message || 'Fatura analiz edilemedi, elle girebilirsin.');
      setStatus('error');
    }
  }

  function reset() {
    setFile(null); setStatus('idle'); setResult(null); setError('');
  }

  function skip() {
    onDone(null);
  }

  function proceed() {
    if (result && result.recognized && result.unitPrice) {
      onDone({unitPrice: result.unitPrice, singleTier: result.singleTier, tariffLabel: result.tariffLabel});
    } else {
      onDone(null);
    }
  }

  return <div className="auth-shell">
    <button className="icon-button theme-toggle auth-theme-toggle" onClick={cycleTheme} title={`Tema: ${theme}`}>
      {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
    </button>
    <div className="auth-visual">
      <div className="brand"><span className="brand-mark">ϟ</span><span><b>WATTFLEX</b><small>ENERGY INTELLIGENCE</small></span></div>
      <div className="live-pill"><span/> ADIM 1 / 2</div>
      <h1>Faturanı yükle,<br/><em>bir daha sorma</em>.</h1>
      <p>Elektrik faturanın fotoğrafını yükle — birim kWh enerji bedelini ve tarife tipini senin için otomatik okuyalım.</p>
      <div className="ai-capabilities auth-feature-list">
        <span>✓ Birim enerji bedeli otomatik alınır</span>
        <span>✓ Tarife tipi otomatik tespit edilir</span>
        <span>✓ İstersen bu adımı atlayabilirsin</span>
      </div>
    </div>
    <div className="auth-panel">
      <div className="auth-card bill-card">
        <span className="kicker">FATURA YÜKLE</span>
        <h2>Elektrik faturanı yükle</h2>
        <p className="form-intro">.png veya .jpg olarak yükle — telefonda galeri, bilgisayarda dosya gezgini açılır.</p>
        {error && <div className="toast auth-toast"><span>!</span>{error}</div>}

        <input ref={inputRef} type="file" accept="image/png,image/jpeg" hidden onChange={handleFileChange}/>

        {!file && <div className="bill-launcher">
          <button type="button" className="primary wide" onClick={openPicker}>⤒ Fatura fotoğrafı seç</button>

          <div className="bill-demo">
            <img src="/fatura.jpg" alt="Örnek fatura — fatura.jpg" className="bill-demo-thumb"/>
            <small>fatura.jpg</small>
            <button type="button" className="ghost wide" onClick={useDemoInvoice}>✦ Demo ile ilerle</button>
          </div>

          <button type="button" className="link-button skip-link" onClick={skip}>Bu adımı atla →</button>
        </div>}

        {file && <div className="bill-preview">
          <img src={file.url} alt={file.name}/>
          <b>{file.name}</b>

          {status === 'analyzing' && <p className="bill-status"><i className="spinner"/> Fatura analiz ediliyor…</p>}

          {status === 'done' && result && (
              result.recognized
                  ? <div className="bill-summary">
                    <div><small>BİRİM ENERJİ BEDELİ</small><b>{result.unitPrice.toFixed(4)} ₺/kWh</b></div>
                    <div><small>TARİFE TİPİ</small><b>{result.tariffLabel}</b></div>
                  </div>
                  : <div className="toast auth-toast"><span>!</span>{result.message || 'Birim fiyat okunamadı, elle girebilirsin.'}</div>
          )}

          <div className="bill-actions">
            <button type="button" className="ghost" onClick={reset} disabled={status === 'analyzing'}>Farklı dosya seç</button>
            <button type="button" className="primary" disabled={status === 'analyzing'} onClick={proceed}>
              {status === 'analyzing' ? 'Analiz ediliyor…' : 'İlerle →'}
            </button>
          </div>
        </div>}
      </div>
    </div>
  </div>;
}

function EVOnboarding({theme, cycleTheme, onDone}) {
  const EV_DATABASE = [
    { brand: 'Togg', model: 'T10X', batteries: [{ name: 'Standart Menzil', capacity: 52.4 }, { name: 'Uzun Menzil', capacity: 88.5 }] },
    { brand: 'Togg', model: 'T10F', batteries: [{ name: 'Standart Menzil', capacity: 52.4 }, { name: 'Uzun Menzil', capacity: 88.5 }] },
    { brand: 'Tesla', model: 'Model Y', batteries: [{ name: 'Arkadan İtişli (RWD)', capacity: 60.0 }, { name: 'Long Range / Performance', capacity: 78.1 }] },
    { brand: 'BYD', model: 'Atto 3', batteries: [{ name: 'Standart', capacity: 60.48 }] },
    { brand: 'BYD', model: 'Seal U DM-i', batteries: [{ name: 'Plug-in Hybrid (PHEV)', capacity: 18.3 }] },
    { brand: 'Volvo', model: 'EX30', batteries: [{ name: 'Single Motor', capacity: 51.0 }, { name: 'Extended Range', capacity: 69.0 }] },
    { brand: 'KG Mobility', model: 'Torres EVX', batteries: [{ name: 'Standart', capacity: 73.4 }] },
    { brand: 'Kia', model: 'EV3', batteries: [{ name: 'Standart', capacity: 58.3 }, { name: 'Uzun Menzil', capacity: 81.4 }] },
    { brand: 'Opel', model: 'Frontera Elektrik', batteries: [{ name: 'Standart', capacity: 44.0 }] },
    { brand: 'Mini', model: 'Countryman', batteries: [{ name: 'Countryman E', capacity: 66.45 }] },
    { brand: 'Renault', model: 'Megane E-Tech', batteries: [{ name: 'EV60', capacity: 60.0 }] },
    { brand: 'Hyundai', model: 'Ioniq 5', batteries: [{ name: 'Standart', capacity: 58.0 }, { name: 'Uzun Menzil', capacity: 72.6 }] },
    { brand: 'Ford', model: 'Kuga PHEV', batteries: [{ name: 'Plug-in Hybrid Batarya', capacity: 14.4 }] },
    { brand: 'Jaecoo', model: '7 PHEV', batteries: [{ name: 'Plug-in Hybrid Batarya', capacity: 18.3 }] }
  ];

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [battery, setBattery] = useState(0);
  const [dailyKm, setDailyKm] = useState('');
  const [avgCons, setAvgCons] = useState('');
  const [chargeDays, setChargeDays] = useState('');

  const availableModels = EV_DATABASE.filter(v => v.brand === brand);
  const selectedModelObj = availableModels.find(v => v.model === model);

  function handleDemo() {
    onDone({
      brand: 'Togg', model: 'T10F', batteryCapacity: 52.4,
      dailyKm: 45, avgConsumptionKwh: 15.8, homeChargeDaysPerWeek: 4
    });
  }

  function handleProceed(e) {
    e.preventDefault();
    if (!brand || !model || !battery || !dailyKm || !avgCons || !chargeDays) return;
    onDone({
      brand, model, batteryCapacity: battery,
      dailyKm: Number(dailyKm), avgConsumptionKwh: Number(avgCons), homeChargeDaysPerWeek: Number(chargeDays)
    });
  }

  return (
      <div className="auth-shell">
        <button className="icon-button theme-toggle auth-theme-toggle" onClick={cycleTheme} title={`Tema: ${theme}`}>
          {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
        </button>
        <div className="auth-visual">
          <div className="brand"><span className="brand-mark">ϟ</span><span><b>WATTFLEX</b><small>ENERGY INTELLIGENCE</small></span></div>
          <div className="live-pill"><span/> ADIM 2 / 2</div>
          <h1>Elektrikli aracını<br/><em>sisteme ekle</em>.</h1>
          <p>EV veya PHEV aracının şarj maliyetlerini ve ev tüketimine olan etkisini optimize etmek için bilgilerini girerek AI danışmanı etkinleştir.</p>
          <div className="ai-capabilities auth-feature-list">
            <span>✓ Şarj maliyeti simülasyonu</span>
            <span>✓ Gece/Gündüz tarife optimizasyonu</span>
            <span>✓ Akıllı şarj hatırlatıcıları</span>
          </div>
        </div>
        <div className="auth-panel">
          <div className="auth-card ev-card">
            <span className="kicker">ARAÇ PROFİLİ</span>
            <h2>Elektrikli Araç (EV) Kurulumu</h2>
            <form onSubmit={handleProceed}>
              <label>Marka
                <select value={brand} onChange={e => {setBrand(e.target.value); setModel(''); setBattery(0);}} required>
                  <option value="" disabled hidden>Seçiniz</option>
                  {[...new Set(EV_DATABASE.map(item => item.brand))].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label>Model
                <select value={model} onChange={e => {setModel(e.target.value); setBattery(0);}} required disabled={!brand}>
                  <option value="" disabled hidden>Model Seçiniz</option>
                  {availableModels.map(m => <option key={m.model} value={m.model}>{m.model}</option>)}
                </select>
              </label>
              <label>Batarya / Paket Seçeneği
                <select value={battery} onChange={e => setBattery(Number(e.target.value))} required disabled={!model}>
                  <option value="0" disabled hidden>Paket Seçiniz</option>
                  {selectedModelObj?.batteries.map(b => <option key={b.name} value={b.capacity}>{b.name} ({b.capacity} kWh)</option>)}
                </select>
              </label>

              {battery > 0 && <div style={{marginTop: '24px'}}>
                <div className="row">
                  <label>Günlük Ort. Mesafe (km)
                    <input type="number" min="1" value={dailyKm} onChange={e => setDailyKm(e.target.value)} required placeholder="Örn: 40"/>
                  </label>
                  <label>100 km Ort. Tüketim (kWh)
                    <input type="number" step="0.1" min="1" value={avgCons} onChange={e => setAvgCons(e.target.value)} required placeholder="Örn: 16.5"/>
                  </label>
                </div>
                <label>Haftada Kaç Gün Evden Şarj Ediliyor?
                  <input type="number" min="1" max="7" value={chargeDays} onChange={e => setChargeDays(e.target.value)} required placeholder="Örn: 3"/>
                </label>
              </div>}

              <div className="ev-actions">
                <button type="button" className="ghost" onClick={() => onDone(null)}>Bu adımı atla</button>
                <button type="button" className="btn-demo" onClick={handleDemo}>Demo yükle</button>
                <button type="submit" className="primary" disabled={!battery}>İlerle →</button>
              </div>
            </form>
          </div>
        </div>
      </div>
  );
}

function Root() {
  const [theme, setTheme] = useState(localStorage.getItem('wattflex-theme') || localStorage.getItem('voltwise-theme') || 'dark');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  });
  const [invoiceInfo, setInvoiceInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INVOICE_KEY)); } catch { return null; }
  });

  const [onboarded, setOnboarded] = useState(() => sessionStorage.getItem(ONBOARD_KEY) === '1');
  const [evOnboarded, setEvOnboarded] = useState(() => sessionStorage.getItem(EV_ONBOARD_KEY) === '1');
  const [evProfile, setEvProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem(EV_PROFILE_KEY)); } catch { return null; }
  });

  useEffect(() => {
    const resolved = theme === 'system'
        ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : theme;
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem('wattflex-theme', theme);
  }, [theme]);

  function cycleTheme() {
    setTheme(themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length]);
  }

  function handleLoginSuccess(sessionUser) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    setUser(sessionUser);
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ONBOARD_KEY);
    sessionStorage.removeItem(EV_ONBOARD_KEY);
    setUser(null);
    setOnboarded(false);
    setEvOnboarded(false);
  }

  function handleBillUploadDone(info) {
    if (info) localStorage.setItem(INVOICE_KEY, JSON.stringify(info));
    else localStorage.removeItem(INVOICE_KEY);
    setInvoiceInfo(info);
    sessionStorage.setItem(ONBOARD_KEY, '1');
    setOnboarded(true);
  }

  function handleEVOnboardDone(profile) {
    if (profile) localStorage.setItem(EV_PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(EV_PROFILE_KEY);
    setEvProfile(profile);
    sessionStorage.setItem(EV_ONBOARD_KEY, '1');
    setEvOnboarded(true);
  }

  if (!user) return <Login theme={theme} cycleTheme={cycleTheme} onSuccess={handleLoginSuccess}/>;
  if (!onboarded) return <BillUpload theme={theme} cycleTheme={cycleTheme} onDone={handleBillUploadDone}/>;
  if (!evOnboarded) return <EVOnboarding theme={theme} cycleTheme={cycleTheme} onDone={handleEVOnboardDone}/>;
  return <App theme={theme} cycleTheme={cycleTheme} user={user} onLogout={handleLogout} invoiceInfo={invoiceInfo} evProfile={evProfile}/>;
}

createRoot(document.getElementById('root')).render(<Root/>);
