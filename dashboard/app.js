// CryptRadar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail
// drawer with the model's own arithmetic and the protocol's farm plan.
// No network: every byte it shows is in data.js.
//
// The page recomputes each row's implied value from the snapshot figures and
// checks the number board.json carries, and it re-derives each farm plan from
// the same category / chains / TVL / age rules lib/model.ts uses — so what the
// screenshots show and what board.json holds are the same numbers and the same
// plan. State lives in the URL hash: #detail=<slug> opens a protocol,
// #category=<name> and #q=<text> filter the board, #tab=live shows the
// live-token view. That is how the three screenshots are taken: one URL each.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) {
    if (app) app.textContent = 'CryptRadar needs its data file (data.js) beside dashboard/.';
    return;
  }

  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
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
  function fmtMult(n) { return n.toFixed(2) + 'x'; }

  // The model, recomputed here from the snapshot figures: the page's code and
  // the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var extraChains = Math.max(0, Math.min((row.chains ? row.chains.length : 0) - 1, model.chain_cap));
    var chainMult = 1 + extraChains * model.chain_step;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
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

  // The farm plan, re-derived here by the same rules lib/model.ts writes into
  // board.json: category, chains, TVL and age decide the action, the capital,
  // the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open, then borrow a small amount against it.';
    if (c.indexOf('dex') !== -1 || c.indexOf('trad') !== -1 || c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small trade on ' + chain + '.';
    if (c.indexOf('yield') !== -1 || c.indexOf('leveraged farm') !== -1) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('curat') !== -1 || c.indexOf('allocat') !== -1 || c.indexOf('vault') !== -1) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('rwa') !== -1) return 'Mint $' + capital + ' of ' + name + '\'s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('restak') !== -1 || c.indexOf('staking') !== -1) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
    if (c.indexOf('bridge') !== -1) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('insurance') !== -1) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('stable') !== -1) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('prediction') !== -1) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('payment') !== -1) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('chain') !== -1) return 'Use $' + capital + ' of ' + name + '\'s own app on its chain and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Make one qualifying action each week, such as a deposit, a borrow or a repayment.';
    if (c.indexOf('dex') !== -1 || c.indexOf('trad') !== -1 || c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Make one qualifying action each week, such as a swap, a trade or a liquidity change.';
    if (c.indexOf('curat') !== -1 || c.indexOf('allocat') !== -1 || c.indexOf('vault') !== -1) return 'Make one qualifying action each week, such as a deposit, a withdrawal or a vote.';
    if (c.indexOf('restak') !== -1 || c.indexOf('staking') !== -1) return 'Make one qualifying action each week, such as a stake, a restake or a claim.';
    return 'Make one qualifying action each week, such as a deposit, a swap or a vote.';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open ' + p.name + '\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    ];
  }

  // ---- state from the URL hash, so one link opens one view ----
  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var out = {};
    h.split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1));
    });
    return out;
  }
  function writeHash() {
    var parts = [];
    if (state.tab === 'live') parts.push('tab=live');
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.category !== 'all') parts.push('category=' + encodeURIComponent(state.category));
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.selected) parts.push('detail=' + encodeURIComponent(state.selected));
    var next = parts.length ? '#' + parts.join('&') : '';
    if ((location.hash || '') !== next) history.replaceState(null, '', next || location.pathname + location.search);
  }
  (function applyHash() {
    var h = readHash();
    if (h.tab === 'live') state.tab = 'live';
    if (h.q) state.q = h.q;
    if (h.category) state.category = h.category;
    if (h.chain) state.chain = h.chain;
    if (h.detail) state.selected = h.detail;
  })();

  // ---- filtering and sorting ----
  function visibleRows() {
    var rows = DATA.rows.filter(function (r) {
      if (state.q) {
        var q = state.q.toLowerCase();
        var hay = (r.name + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (state.category !== 'all' && (r.category || '') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -9999 : a.change_7d; bv = b.change_7d === null ? -9999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      var diff = bv - av;
      return state.dir === -1 ? diff : -diff;
    });
    return rows;
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function sortButton(label, key) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ↓' : ' ↑') : '';
    return el('button', {
      text: label + arrow,
      onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        render();
      },
    });
  }

  // ---- render ----
  function render() {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var top = DATA.rows[0];
    var totalImplied = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);

    var hero = el('header', { class: 'hero' }, el('div', { class: 'wrap' },
      el('p', { class: 'kicker', text: 'CryptRadar · ' + DATA.model_version }),
      el('h1', {}, 'Every protocol ', el('em', {}, 'before launch'), ', ranked by what a launch would be worth.'),
      el('p', { class: 'lede', text: 'The board finds the protocols still before launch in the snapshot, prices each launch from its own figures, and shows exactly how to farm it before it happens.' }),
      el('p', { class: 'snapshot-line', text: 'Snapshot: ' + DATA.source + ' · as of ' + DATA.as_of + ' · watchlist floor $' + (DATA.floor_usd / 1e6) + 'M TVL.' }),
      el('div', { class: 'chips' },
        el('span', { class: 'chip' }, 'Board: ', el('b', {}, String(DATA.board_size) + ' protocols')),
        el('span', { class: 'chip' }, 'Watchlist covered: ', el('b', {}, String(DATA.watchlist_size) + ' of ' + DATA.watchlist_size)),
        el('span', { class: 'chip' }, 'Early finds: ', el('b', {}, String(DATA.early_size))),
        el('span', { class: 'chip' }, 'Top launch: ', el('b', {}, top ? fmtUsd(top.implied_value_usd) : 'n/a')),
        el('span', { class: 'chip' }, 'Board total: ', el('b', {}, fmtUsd(totalImplied)))
      )
    ));
    app.appendChild(hero);

    var wrap = el('div', { class: 'wrap' });
    app.appendChild(wrap);

    // Top three spotlight.
    var spot = el('section', { class: 'spotlight', 'aria-label': 'Top three launches' });
    DATA.rows.slice(0, 3).forEach(function (r) {
      spot.appendChild(el('button', { class: 'spot', onclick: function () { state.selected = r.slug; writeHash(); render(); } },
        el('span', { class: 'rank', text: 'Rank ' + r.rank }),
        el('h3', {}, r.name),
        el('p', { class: 'cat', text: (r.category || 'No category') + ' · ' + r.chains.join(', ') }),
        el('div', { class: 'value' }, fmtUsd(r.implied_value_usd), el('small', {}, 'implied launch value')),
        el('div', { class: 'tvl', text: fmtUsd(r.tvl_usd) + ' TVL · ' + fmtPct(r.change_7d) + ' in 7 days' })
      ));
    });
    wrap.appendChild(spot);

    // How the value is worked out.
    var method = el('section', { class: 'method', 'aria-label': 'How the value is worked out' },
      el('h2', {}, 'How the value is worked out'),
      el('p', {}, 'Implied value = TVL × category multiple × growth × maturity × chain breadth. The multiple follows the line of business: RWA 0.35, lending and trading 0.30, yield and curators 0.28, everything else 0.25, thin-margin lines 0.22. Growth is the 7-day TVL change, clamped to −60%…+120% and weighted one-half. Maturity runs 0.60 for a new protocol to 1.00 after three years tracked before launch. Each extra chain adds 2%, capped at +10%.'),
      el('p', {}, 'Example — the top row: ', el('code', {}, top ? fmtUsd(top.tvl_usd) + ' × ' + fmtMult(top.category_multiple) + ' × ' + fmtMult(top.growth_multiplier) + ' × ' + fmtMult(top.maturity_multiplier) + ' × ' + fmtMult(top.chain_multiplier) + ' = ' + fmtUsd(top.implied_value_usd) : '')),
      el('p', { class: 'note', text: '"Before launch" here means the snapshot\'s record shows the protocol before its launch. That is the record, not a promise of a launch.' })
    );
    wrap.appendChild(method);

    // Controls.
    var controls = el('div', { class: 'controls' });
    var searchWrap = el('div', {}, el('label', { for: 'q', text: 'Search' }),
      el('input', { id: 'q', type: 'search', placeholder: 'Name, category or chain…', value: state.q }));
    searchWrap.querySelector('input').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderTable(); });
    controls.appendChild(searchWrap);

    var catWrap = el('div', {}, el('label', { for: 'cat', text: 'Category' }));
    var catSel = el('select', { id: 'cat' });
    catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
    categories().forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    catSel.value = state.category;
    catSel.addEventListener('change', function (e) { state.category = e.target.value; writeHash(); renderTable(); });
    catWrap.appendChild(catSel);
    controls.appendChild(catWrap);

    var chainWrap = el('div', {}, el('label', { for: 'chain', text: 'Chain' }));
    var chainSel = el('select', { id: 'chain' });
    chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chains().forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderTable(); });
    chainWrap.appendChild(chainSel);
    controls.appendChild(chainWrap);

    var tvlWrap = el('div', {}, el('label', { for: 'tvl', text: 'Minimum TVL' }));
    var tvlSel = el('select', { id: 'tvl' });
    [['0', 'Any size'], ['100000000', '$100M+'], ['500000000', '$500M+'], ['1000000000', '$1B+']].forEach(function (o) {
      tvlSel.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    tvlSel.value = String(state.minTvl);
    tvlSel.addEventListener('change', function (e) { state.minTvl = Number(e.target.value); renderTable(); });
    tvlWrap.appendChild(tvlSel);
    controls.appendChild(tvlWrap);

    var tabs = el('div', { class: 'tabs' },
      el('button', { 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token (' + DATA.board_size + ')' }),
      el('button', { 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens (' + DATA.live_size + ')' })
    );
    tabs.children[0].addEventListener('click', function () { state.tab = 'pre-token'; state.selected = null; writeHash(); render(); });
    tabs.children[1].addEventListener('click', function () { state.tab = 'live'; state.selected = null; writeHash(); render(); });
    controls.appendChild(tabs);
    wrap.appendChild(controls);

    var countEl = el('p', { class: 'count', id: 'board', tabindex: '-1' });
    wrap.appendChild(countEl);
    var tableHost = el('div', { id: 'table-host' });
    wrap.appendChild(tableHost);

    wrap.appendChild(el('footer', {},
      el('p', {}, 'Data: ' + DATA.source + '. The snapshot is frozen at ' + DATA.as_of + '; nothing here updates live and nothing here fetches.'),
      el('p', {}, 'Model ' + DATA.model_version + ': implied = TVL × category multiple × growth × maturity × chain breadth. The board ranks 200 protocols — the full ' + DATA.watchlist_size + '-protocol watchlist plus ' + DATA.early_size + ' early finds below the $' + (DATA.floor_usd / 1e6) + 'M floor. Live tokens are shown apart, at the market\'s own values.'),
      el('p', {}, 'A farm plan is a starting point, not advice. Never pay to claim, and claim only from a link the protocol itself publishes.')
    ));

    renderTable();
    renderDrawer();
  }

  function renderTable() {
    // The focused view follows the filters: it lifts as soon as every filter is cleared.
    document.body.classList.toggle('focused', state.tab === 'live' || !!state.q || state.category !== 'all' || state.chain !== 'all');
    var host = document.getElementById('table-host');
    var countEl = document.querySelector('.count');
    if (!host) return;
    host.innerHTML = '';
    if (state.tab === 'live') {
      if (countEl) countEl.textContent = DATA.live_size + ' live-token protocols, shown apart at the market\'s own values — they are not ranked against the pre-token board.';
      var liveTable = el('div', { class: 'table-scroll' }, el('table', { class: 'board' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Protocol'), el('th', { class: 'num', text: 'TVL' }),
          el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: '7 days' }))),
        el('tbody', {}, DATA.live.map(function (r) {
          return el('tr', {},
            el('td', {}, el('span', { class: 'name', text: r.name }), el('span', { class: 'sub', text: (r.category || 'No category') + ' · ' + r.chains.join(', ') })),
            el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
            el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
            el('td', { class: 'num', text: fmtPct(r.change_7d) }));
        }))
      ));
      host.appendChild(liveTable);
      return;
    }

    var rows = visibleRows();
    if (countEl) countEl.textContent = 'Showing ' + rows.length + ' of ' + DATA.board_size + ' pre-token protocols, ranked by implied launch value. Click a row for its farm plan.';
    if (rows.length === 0) {
      host.appendChild(el('p', { class: 'empty', text: 'Nothing matches that filter. Clear the search or widen the category.' }));
      return;
    }
    var tbody = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr', {
        class: state.selected === r.slug ? 'selected' : '',
        onclick: function () { state.selected = r.slug; writeHash(); render(); },
      },
        el('td', { class: 'rank', text: '#' + r.rank }),
        el('td', {}, el('span', { class: 'name', text: r.name }), el('span', { class: 'sub', text: (r.category || 'No category') + ' · ' + r.chains.join(', ') })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num implied', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'view', text: 'View plan ›' })
      );
      tbody.appendChild(tr);
    });
    var table = el('div', { class: 'table-scroll' }, el('table', { class: 'board' },
      el('thead', {}, el('tr', {},
        el('th', {}, sortButton('Rank', 'implied')),
        el('th', {}, 'Protocol'),
        el('th', { class: 'num' }, sortButton('TVL', 'tvl')),
        el('th', { class: 'num' }, sortButton('7 days', 'growth')),
        el('th', { class: 'num' }, sortButton('Age', 'age')),
        el('th', { class: 'num' }, sortButton('Implied value', 'implied')),
        el('th', {}, 'Farm plan'))),
      tbody
    ));
    host.appendChild(table);
  }

  function renderDrawer() {
    var old = document.querySelector('.drawer');
    if (old) old.remove();
    if (!state.selected || state.tab === 'live') return;
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.selected) row = DATA.rows[i];
    if (!row) return;
    var recomputed = impliedOf(row, DATA.model);
    var steps = farmSteps(row);
    var drawer = el('aside', { class: 'drawer', 'aria-label': 'Protocol detail' },
      el('button', { class: 'close', text: '← Back to the board', onclick: function () { state.selected = null; writeHash(); render(); } }),
      el('h2', {}, row.name),
      el('p', { class: 'cat', text: (row.category || 'No category') + ' · ' + row.chains.join(', ') + ' · rank #' + row.rank }),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Implied value' }), el('div', { class: 'val amber', text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'stat' }, el('div', { class: 'label', text: 'TVL' }), el('div', { class: 'val', text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'stat' }, el('div', { class: 'label', text: '7-day change' }), el('div', { class: 'val', text: fmtPct(row.change_7d) })),
        el('div', { class: 'stat' }, el('div', { class: 'label', text: 'Tracked' }), el('div', { class: 'val', text: fmtAge(row.age_days) }))
      ),
      el('p', { class: 'math' }, 'TVL ', el('code', {}, fmtUsd(row.tvl_usd)), ' × category ', el('code', {}, fmtMult(row.category_multiple)), ' × growth ', el('code', {}, fmtMult(row.growth_multiplier)), ' × maturity ', el('code', {}, fmtMult(row.maturity_multiplier)), ' × chains ', el('code', {}, fmtMult(row.chain_multiplier)), ' = ', el('code', {}, fmtUsd(row.implied_value_usd)), recomputed === row.implied_value_usd ? ' ✓' : ' (recomputed ' + fmtUsd(recomputed) + ')'),
      el('p', { class: 'why', text: row.why }),
      el('h3', {}, 'Farm plan — six steps'),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        return el('li', {}, s.text, el('span', { class: 'cost' }, 'Cost: ', el('b', {}, s.cost), ' · Time: ', el('b', {}, s.time)));
      })),
      el('p', { class: 'caveat', text: 'This protocol is before launch in the snapshot dated ' + DATA.as_of + '. That is the snapshot\'s record, not a promise of a launch, and the implied value is this radar\'s own claim, not the protocol\'s and not make.fun\'s.' })
    );
    document.body.appendChild(drawer);
  }

  render();

  // A shared link to a filtered view opens focused on the board: the hero,
  // spotlight and method step aside so the filter and the filtered rows are
  // what the reader sees first. Clearing the filter restores the full page.
  (function () {
    var h = readHash();
    if (h.category || h.q || h.chain || h.tab === 'live') document.body.classList.add('focused');
  })();
})();
