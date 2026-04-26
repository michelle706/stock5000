import React, { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';

const SUPABASE_URL = 'https://kvyvjdtududkoxpzcfoe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXZqZHR1ZHVka294cHpjZm9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMjIyMjQsImV4cCI6MjA5Mjc5ODIyNH0.OdsC1sEfpb9Q4DTsELdRykP-PHBWn3kBGrgMIVYddPA';

const DEFAULT_TICKERS = ['QQQ', 'AAPL', 'NVDA', 'TSLA', 'BTC-USD'];

function App() {
  const [tickers, setTickers] = useState([]);
  const [data, setData] = useState({});
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [notes, setNotes] = useState({});
  const initialLoadDone = useRef(false);

  // Helper for Supabase REST API
  const supabaseFetch = async (path, options = {}) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Supabase request failed');
    }
    return response.status === 204 ? null : response.json();
  };

  // 1. Initial Load from Supabase
  useEffect(() => {
    const init = async () => {
      try {
        const stocks = await supabaseFetch('stocks?select=*');
        if (stocks.length === 0) {
          // If empty, seed with defaults
          for (const t of DEFAULT_TICKERS) {
            await supabaseFetch('stocks', {
              method: 'POST',
              body: JSON.stringify({ ticker: t, notes: '' })
            });
          }
          setTickers(DEFAULT_TICKERS);
          setNotes(DEFAULT_TICKERS.reduce((acc, t) => ({ ...acc, [t]: '' }), {}));
        } else {
          setTickers(stocks.map(s => s.ticker));
          setNotes(stocks.reduce((acc, s) => ({ ...acc, [s.ticker]: s.notes || '' }), {}));
        }
        initialLoadDone.current = true;
      } catch (e) {
        console.error("Failed to load from Supabase", e);
        // Fallback to defaults if Supabase fails
        setTickers(DEFAULT_TICKERS);
      }
    };
    init();
  }, []);

  const handleNoteChange = (ticker, text) => {
    setNotes(prev => ({ ...prev, [ticker]: text }));
  };

  // Debounced update to Supabase for notes
  useEffect(() => {
    if (!initialLoadDone.current) return;
    const timer = setTimeout(async () => {
      for (const ticker of Object.keys(notes)) {
        try {
          await supabaseFetch(`stocks?ticker=eq.${ticker}`, {
            method: 'PATCH',
            body: JSON.stringify({ notes: notes[ticker] })
          });
        } catch (e) { console.error("Note update failed", e); }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [notes]);

  const addTicker = async (e) => {
    e.preventDefault();
    const t = newTicker.toUpperCase().trim();
    if (t && !tickers.includes(t)) {
      try {
        await supabaseFetch('stocks', {
          method: 'POST',
          body: JSON.stringify({ ticker: t, notes: '' })
        });
        setTickers([...tickers, t]);
        setNotes(prev => ({ ...prev, [t]: '' }));
        setNewTicker('');
      } catch (e) { alert("Failed to add ticker: " + e.message); }
    }
  };

  const removeTicker = async (t) => {
    if (t === 'QQQ') return;
    try {
      await supabaseFetch(`stocks?ticker=eq.${t}`, { method: 'DELETE' });
      setTickers(tickers.filter(item => item !== t));
    } catch (e) { console.error("Delete failed", e); }
  };

  const fetchData = useCallback(async () => {
    if (tickers.length === 0) return;
    setLoading(true);
    const newData = { ...data };
    const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;
    
    // Fetch News
    try {
      const newsRes = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${API_KEY}`);
      const newsJson = await newsRes.json();
      const mappedNews = (Array.isArray(newsJson) ? newsJson : []).slice(0, 6).map(n => ({
        link: n.url,
        publisher: n.source,
        title: n.headline,
        providerPublishTime: n.datetime
      }));
      setNews(mappedNews);
    } catch (e) { console.error("News error", e); }

    const to = Math.floor(Date.now() / 1000);
    const from = to - (365 * 24 * 60 * 60);

    for (const ticker of tickers) {
      try {
        let name = ticker;
        let marketCap = null;
        let high52 = null;
        let low52 = null;
        let sparklinePts = '';
        let pct1m = 0;

        const symbol = ticker === 'BTC-USD' ? 'BINANCE:BTCUSDT' : ticker;

        // Quote
        const qRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`);
        const qJson = await qRes.json();

        // Candle
        const cRes = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${API_KEY}`);
        const cJson = await cRes.json();

        // Profile (fetch if name is missing)
        if (!newData[ticker]?.name) {
          const pRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${API_KEY}`);
          const pJson = await pRes.json();
          if (pJson && pJson.name) name = pJson.name;
          if (pJson && pJson.marketCapitalization) marketCap = pJson.marketCapitalization * 1e6;
        } else {
          name = newData[ticker].name;
          marketCap = newData[ticker].marketCap;
        }

        if (cJson.s === 'ok' && cJson.c && cJson.c.length > 0) {
          const closes = cJson.c;
          const min = Math.min(...closes);
          const max = Math.max(...closes);
          sparklinePts = closes.map((c, i) => {
            const x = (i / (closes.length - 1)) * 100;
            const y = 100 - ((c - min) / (max - min) || 0) * 100;
            return `${x},${y}`;
          }).join(' ');

          const currentPrice = closes[closes.length - 1];
          const monthAgoIdx = Math.max(0, closes.length - 22);
          const monthAgoPrice = closes[monthAgoIdx];
          pct1m = ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100;
          high52 = max;
          low52 = min;
        }

        newData[ticker] = {
          ...newData[ticker],
          price: qJson.c || 0,
          change: qJson.dp || 0,
          marketCap: marketCap,
          pe: null, 
          divYield: null,
          volume: null,
          high52: high52 || qJson.h,
          low52: low52 || qJson.l,
          name: name,
          isPositive: (qJson.dp || 0) >= 0,
          sparklinePts: sparklinePts,
          pct1m: pct1m,
          error: false
        };

        // Gentle delay to avoid rate limits
        await new Promise(r => setTimeout(r, 100));

      } catch (e) {
        console.error(`Error fetching ${ticker}`, e);
        if (!newData[ticker]) newData[ticker] = { error: true };
      }
    }

    setData(newData);
    setLoading(false);
  }, [tickers, data]);

  useEffect(() => {
    if (tickers.length > 0) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.length]);

  const formatNum = (num) => {
    if (!num) return 'N/A';
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    return num.toLocaleString();
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Stock Intelligence</h1>
        <div className="header-controls">
          <form className="add-ticker-box" onSubmit={addTicker}>
            <input 
              className="add-ticker-input" 
              placeholder="+ TICKER" 
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
            />
          </form>
          <button className="refresh-btn" onClick={fetchData} disabled={loading}>
            {loading ? 'SYNCING...' : 'REFRESH'}
          </button>
        </div>
      </header>

      <main className="bento-grid">
        {tickers.map(ticker => {
          const tData = data[ticker];
          const isBenchmark = ticker === 'QQQ';
          
          return (
            <div className={`card ${isBenchmark ? 'benchmark' : ''}`} key={ticker}>
              <button className="icon-btn remove-btn" onClick={() => removeTicker(ticker)}>×</button>
              
              <div className="card-header">
                <div className="ticker-name-group">
                  <div className="ticker-type">{isBenchmark ? 'Benchmark' : 'Equity'}</div>
                  <h2>{ticker}</h2>
                  <div className="ticker-symbol" style={{fontSize: '0.75rem'}}>{tData?.name || 'Loading...'}</div>
                </div>
              </div>

              {tData && !tData.error ? (
                <>
                  <div className="price-display">
                    <div className="current-price">
                      ${tData.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="price-changes">
                      <span className={`change-pill ${tData.isPositive ? 'pos' : 'neg'}`}>
                        {tData.change > 0 ? '▲' : '▼'} {Math.abs(tData.change || 0).toFixed(2)}% (1D)
                      </span>
                      <span className={`change-pill ${tData.pct1m >= 0 ? 'pos' : 'neg'}`}>
                        {tData.pct1m > 0 ? '▲' : '▼'} {Math.abs(tData.pct1m || 0).toFixed(2)}% (1M)
                      </span>
                    </div>
                  </div>

                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-label">Market Cap</span>
                      <span className="stat-value">{formatNum(tData.marketCap)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">P/E Ratio</span>
                      <span className="stat-value">{tData.pe?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Div Yield</span>
                      <span className="stat-value">{tData.divYield ? (tData.divYield * 100).toFixed(2) + '%' : '0.00%'}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Vol (Avg)</span>
                      <span className="stat-value">{formatNum(tData.volume)}</span>
                    </div>
                  </div>

                  <div className="sparkline-box">
                    <svg viewBox="0 -10 100 120" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                      <polyline
                        fill="none"
                        stroke={tData.isPositive ? 'var(--accent-pos)' : 'var(--accent-neg)'}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={tData.sparklinePts}
                      />
                    </svg>
                  </div>
                </>
              ) : (
                <div style={{height: '200px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)'}}>
                  {tData?.error ? 'Connection Error' : 'Aggregating Data...'}
                </div>
              )}

              <div className="journal-box">
                <textarea 
                  className="journal-textarea" 
                  placeholder={`Notes on ${ticker}...`}
                  value={notes[ticker] || ''}
                  onChange={(e) => handleNoteChange(ticker, e.target.value)}
                  spellCheck={false}
                />
              </div>
            </div>
          );
        })}
      </main>

      <section className="news-container">
        <h3>Market Intelligence</h3>
        <div className="news-grid">
          {news.length > 0 ? news.map((item, idx) => (
            <a key={idx} href={item.link} target="_blank" rel="noopener noreferrer" className="news-item">
              <div className="news-source">{item.publisher}</div>
              <div className="news-title">{item.title}</div>
              <div className="news-time">{new Date(item.providerPublishTime * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            </a>
          )) : (
            <div className="news-item" style={{gridColumn: '1/-1', textAlign: 'center'}}>Fetching latest headlines...</div>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;