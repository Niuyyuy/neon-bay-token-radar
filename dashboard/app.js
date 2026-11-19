// Neon Bay Token Radar's page. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a per-protocol
// detail panel with the model's own inputs and the protocol's farm plan. No
// network: every byte it shows is in data.js. The page recomputes each row's
// implied value from the snapshot figures and regenerates its farm plan with
// the same derivation main.ts writes to board.json, so the screenshots, the
// code and the board are visibly the same arithmetic. No protocol name is
// special-cased anywhere in this file.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchlistOnly: false };
  if (shot === 'filtered') state.category = topCategory();
  if (shot === 'detail') state.selected = DATA.rows.length ? DATA.rows[0].slug : null;

  // The category with the most rows on the board: the filtered shot's filter.
  function topCategory() {
    var counts = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    var best = 'all', n = 0;
    Object.keys(counts).forEach(function (c) { if (counts[c] > n) { n = counts[c]; best = c; } });
    return best;
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: implied = TVL x category multiple x growth x
  // maturity x chain reach. The category multiple is the median market-cap to
  // TVL of the live-token protocols in the same category, learned from this
  // snapshot; growth is the seven-day TVL change; maturity is the time the
  // protocol has run with no token on record.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- farm plans: the same derivation main.ts writes to board.json ----
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 'about $6 of ETH gas';
    if (c.indexOf('solana') >= 0) return 'under $0.05 of SOL in fees';
    if (c.indexOf('bitcoin') >= 0) return 'about $2 of BTC in fees';
    if (c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('base') >= 0 || c.indexOf('polygon') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('linea') >= 0 || c.indexOf('blast') >= 0 || c.indexOf('scroll') >= 0) return 'under $0.50 of gas';
    return 'about $2 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow $' + Math.round(capital / 3) + ' against it, keeping the loan healthy.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position in range.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('yield aggregator') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s top vault on " + chain + ' and keep the shares.';
    if (c.indexOf('yield') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('curator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares earning.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the yield-bearing asset on ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then settle it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + " through " + name + "'s shielded pool on " + chain + ' and withdraw it later.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + " of " + name + "'s index token on " + chain + ' and hold it.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + " and use its main feature once.";
  }
  function weeklyFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Each week, repay a little of the loan and top up the supply so the position stays active on ' + name + '.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Each week, swap $' + Math.round(capital / 5) + " through " + name + "'s pool on " + chain + ' and re-balance the range.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Each week, close the hedge and open a fresh one on ' + name + ' so the account shows regular trading.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('curator') >= 0) return "Each week, claim the vault's yield on " + name + ' and redeposit it instead of withdrawing.';
    if (c.indexOf('bridge') >= 0) return 'Each week, bridge a small amount back and forth through ' + name + ' so both directions are used.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Each week, restake the staking rewards ' + name + ' pays instead of claiming them out.';
    if (c.indexOf('rwa') >= 0) return "Each week, check the asset's yield on " + name + ' and add $' + Math.round(capital / 10) + ' while it pays.';
    if (c.indexOf('stable') >= 0) return 'Each week, mint a little more of the stable asset on ' + name + ' and use it in one swap.';
    if (c.indexOf('prediction') >= 0) return 'Each week, place one small market position on ' + name + ' and let it settle.';
    if (c.indexOf('insurance') >= 0) return "Each week, check the cover's terms on " + name + ' and renew it before it lapses.';
    if (c.indexOf('privacy') >= 0) return 'Each week, make one shielded transfer through ' + name + ' so the wallet stays active.';
    if (c.indexOf('basis') >= 0) return 'Each week, check the funding rate on ' + name + ' and keep the vault position open.';
    if (c.indexOf('index') >= 0) return 'Each week, add $' + Math.round(capital / 10) + ' to the index position on ' + name + '.';
    return 'Each week, use ' + name + "'s main feature once more so the wallet shows repeat activity.";
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm on ' + chain + ', and keep its seed phrase offline.', cost: gas, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: weeklyFor(p, capital, chain), cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'If ' + p.name + ' runs a points program, check its points page once a week and confirm the wallet is earning; never connect the wallet to a link from a chat or an ad.', cost: 'no fee to check', time: '5 minutes a week' },
      { text: "Before you withdraw, open the protocol's own site from its official listing and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind in two halves a week apart so the position closes cleanly.', cost: gas + ' to unwind', time: '10 minutes' }
    ].map(stepText);
  }
  // ---- end of the farm-plan derivation ----

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var q = new URLSearchParams(hash);
    if (q.get('q')) state.q = q.get('q');
    if (q.get('p')) state.selected = q.get('p');
    if (q.get('category')) state.category = q.get('category');
    if (q.get('chain')) state.chain = q.get('chain');
  }
  function writeHash() {
    var q = new URLSearchParams();
    if (state.q) q.set('q', state.q);
    if (state.category !== 'all') q.set('category', state.category);
    if (state.chain !== 'all') q.set('chain', state.chain);
    if (state.selected) q.set('p', state.selected);
    var next = q.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    // The watchlist is the snapshot's own list, carried in data.js — ranks are
    // by implied value, so the watchlist is not the top 40 ranks.
    var wl = new Set(DATA.watchlist_slugs || []);
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !wl.has(r.slug)) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('span', null, 'Neon Bay Token Radar', el('small', { text: 'Pre-token protocol radar' }))),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by what their token would be worth' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more pre-token protocols beyond the watchlist, ranked by implied value. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Beyond watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var sort = el('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day growth'], ['age', 'Age'], ['name', 'Name']].map(function (o) {
        return el('option', { value: o[0], text: 'Sort: ' + o[1], selected: state.sort === o[0] ? 'selected' : null });
      })
    );
    sort.addEventListener('change', function () { state.sort = sort.value; render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null, onclick: function (e) { state.watchlistOnly = e.target.checked; render(); } }),
      'Watchlist only'
    );
    var count = el('span', { class: 'count', text: state.tab === 'pre-token' ? visibleRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort' }), sort),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      wl, count
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { selectRow(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRow(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank-badge' + (r.rank <= 3 ? ' top' : ''), text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function selectRow(slug) {
    state.selected = slug;
    writeHash();
    render();
  }

  function detailPanel() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var recomputed = impliedOf(row);
    var match = recomputed === row.implied_value_usd;
    var steps = farmSteps(row);
    var head = el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' — pre-token' }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { state.selected = null; writeHash(); render(); } })
    );
    var eq = el('div', { class: 'equation' },
      el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
      el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: 'x' + row.category_multiple.toFixed(3) })),
      el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
      el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
      el('div', null, el('span', { text: 'Growth x maturity x chains' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(4) + ' x ' + row.maturity_multiplier.toFixed(4) + ' x ' + row.chain_multiplier.toFixed(4) })),
      el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
    );
    var verify = el('p', { class: 'verify ' + (match ? 'ok' : 'bad'), text: 'This page recomputes the row from the snapshot figures as ' + fmtUsd(recomputed) + (match ? ' — the same number board.json carries.' : ' — which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' });
    var farm = el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — seven steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'note', text: 'DefiLlama records no token for ' + row.name + ' — that is not proof it has none. Never pay to claim an airdrop, and only ever claim from the link the protocol itself publishes.' })
    );
    return el('section', { class: 'panel detail', 'aria-label': 'Protocol detail' },
      head,
      el('div', { class: 'detail-section' },
        el('h3', { text: 'Implied value' }), eq, verify
      ),
      farm
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var rows = DATA.category_multiples.filter(function (c) { return c.live_samples >= 3; }).sort(function (a, b) { return b.multiple - a.multiple; });
    var tbody = el('tbody');
    rows.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.live_samples) }),
        el('td', { class: 'num', text: 'x' + c.multiple.toFixed(3) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('div', { class: 'detail-section' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { class: 'sub', text: 'One function scores every row. No protocol name is special-cased, and no row is hand-picked.' }),
        el('div', { class: 'formula' }, 'implied = round( tvl_usd x categoryMultiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x maturity x (1 + min(chains - 1, ' + m.chain_cap + ') x ' + m.chain_step + ') )'),
        el('p', { class: 'sub', text: 'The category multiple is the median market-cap-to-TVL ratio of the live-token protocols in the same category, learned from this snapshot — the market already prices each kind of business, and the model borrows that price. Categories with fewer than ' + m.min_live_samples + ' live samples use the global live median. Maturity is 0.7 + min(age, ' + m.maturity_days + ') / ' + m.maturity_days + ' x 0.5, or 0.85 when the listing date is unknown. The early radar is every rankable pre-token protocol beyond the watchlist, by implied value; exchanges, bridges, liquid-staking products, wrapped or staked products and versioned pools are never ranked, by the snapshot\'s own watchlist rule.' }),
        el('h3', { text: 'Category multiples learned from the snapshot' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'mult-table' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live samples' }), el('th', { scope: 'col', text: 'Multiple' }))),
            tbody
          )
        )
      )
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    var detail = state.selected ? detailPanel() : null;
    if (detail) shell.appendChild(detail);
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { text: 'Neon Bay Token Radar · snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · implied values are a model, never a promise.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (shot) window.__shotReady = true;
  }

  // The watchlist-only filter uses the snapshot's own list, carried in
  // data.js as watchlist_slugs.
  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; writeHash(); render(); }
  });
})();
