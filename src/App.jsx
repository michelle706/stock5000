import React, { useState, useEffect } from 'react';

const DEFAULT_TICKERS = ['AAPL', 'AMZN', 'NVDA', 'TSLA', 'BTC-USD'];
const BENCHMARK = 'QQQ';

function App() {
  const [tickers, setTickers] = useState(() => {
    const saved = localStorage.getItem('watchlist-tickers');
    return saved ? JSON.parse(saved) : DEFAULT_TICKERS;
  });
  const [data, setData] = useState({});
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('watchlist-notes');
    return saved ? JSON.parse(saved) : {};
  });
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTicker, setNewTicker] = useState('');

  useEffect(() => {
    localStorage.setItem('watchlist-tickers', JSON.stringify(tickers));
  }, [tickers]);

  useEffect(() => {
    localStorage.setItem('watchlist-notes', JSON.stringify(notes));
  }, [notes]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const symbols = [BENCHMARK, ...tickers].join(',');
      const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`);
      const json = await response.json();
      const results = json.quoteResponse.result;
      const newData = {};
      results.forEach(item => {
        newData[item.symbol] = item;
      });
      setData(newData);
      
      // Fetch news for the first ticker
      const newsResponse = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${tickers[0]}`);
      const newsJson = await newsResponse.json();
      setNews(newsJson.news || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddTicker = (e) => {
    e.preventDefault();
    if (newTicker && !tickers.includes(newTicker.toUpperCase())) {
      setTickers([...tickers, newTicker.toUpperCase()]);
      setNewTicker('');
    }
  };

  const handleRemoveTicker = (ticker) => {
    setTickers(tickers.filter(t => t !== ticker));
  };

  const handleNoteChange = (ticker, note) => {
    setNotes({ ...notes, [ticker]: note });
  };

  const formatPrice = (price) => price ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';
  const formatChange = (change) => change ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : '0.00%';

  return (
    <div className="container">
      <header className="header">
        <h1>STOCK 5000</h1>
        <div className="header-controls">
          <form onSubmit={handleAddTicker} className="add-ticker-box">
            <input 
              type="text" 
              className="add-ticker-input" 
              placeholder="SYMBOL" 
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value)}
            />
            <button type="submit" className="icon-btn">
              <svg width="20" height="20"><use href="#plus"/></svg>
            </button>
          </form>
          <button className="refresh-btn" onClick={fetchData} disabled={loading}>
            {loading ? 'SYNCING...' : 'REFRESH'}
          </button>
        </div>
      </header>

      <main className="bento-grid">
        {/* Benchmark Card */}
        {data[BENCHMARK] && (
          <div className="card benchmark">
            <div className="card-header">
              <div className="ticker-name-group">
                <span className="ticker-type">Benchmark</span>
                <h2>{BENCHMARK}</h2>
              </div>
            </div>
            <div className="price-display">
              <div className="current-price">${formatPrice(data[BENCHMARK].regularMarketPrice)}</div>
              <div className="price-changes">
                <span className={`change-pill ${data[BENCHMARK].regularMarketChangePercent >= 0 ? 'pos' : 'neg'}`}>
                  {formatChange(data[BENCHMARK].regularMarketChangePercent)}
                </span>
              </div>
            </div>
          </div>
        )}

        {tickers.map(ticker => {
          const item = data[ticker];
          return (
            <div key={ticker} className="card">
              <button className="remove-btn icon-btn" onClick={() => handleRemoveTicker(ticker)}>
                <svg width="16" height="16"><use href="#trash"/></svg>
              </button>
              <div className="card-header">
                <div className="ticker-name-group">
                  <span className="ticker-type">Equity</span>
                  <h2>{ticker}</h2>
                </div>
              </div>
              
              <div className="price-display">
                <div className="current-price">${formatPrice(item?.regularMarketPrice)}</div>
                <div className="price-changes">
                  <span className={`change-pill ${item?.regularMarketChangePercent >= 0 ? 'pos' : 'neg'}`}>
                    {formatChange(item?.regularMarketChangePercent)}
                  </span>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Day High</span>
                  <span className="stat-value">${formatPrice(item?.regularMarketDayHigh)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Day Low</span>
                  <span className="stat-value">${formatPrice(item?.regularMarketDayLow)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">52W High</span>
                  <span className="stat-value">${formatPrice(item?.fiftyTwoWeekHigh)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">52W Low</span>
                  <span className="stat-value">${formatPrice(item?.fiftyTwoWeekLow)}</span>
                </div>
              </div>

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
