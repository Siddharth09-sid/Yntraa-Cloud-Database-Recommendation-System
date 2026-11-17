const { chromium } = require('playwright');
const S = process.argv[2] || require('os').tmpdir();
require('fs').mkdirSync(S + '/shots2', { recursive: true });
const URL = 'file://' + require('path').resolve(__dirname, '../index.html');
(async () => {
  const b = await chromium.launch(); const errs = []; const log = (...a) => console.log(...a);
  async function page(theme, w, h) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await p.addInitScript(t => { try { localStorage.setItem('yntraa-theme', t); } catch (e) {} }, theme);
    await p.goto(URL); await p.waitForTimeout(400); return p;
  }
  const fits = async (p, tag) => { const r = await p.evaluate(() => { const c = document.querySelector('.question-card'); const nav = document.querySelector('.quiz-nav'); return { navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : null, vh: innerHeight, sw: document.documentElement.scrollWidth, vw: innerWidth }; }); log('  ', tag, 'nav bottom', r.navBottom, '/ viewport', r.vh, r.navBottom <= r.vh ? 'FITS' : 'SCROLL', r.sw > r.vw ? 'H-OVERFLOW' : ''); };
  const pick = async (p, id) => { await p.click(`#opt-grid [data-opt="${id}"]`); await p.waitForTimeout(520); };

  for (const [name, theme, w, h] of [['desktop', 'dark', 1280, 800], ['mobile', 'light', 390, 844]]) {
    log('=== single flow', name);
    const p = await page(theme, w, h);
    await p.screenshot({ path: `${S}/shots2/${name}-0-landing.png` });
    await p.click('#hero-start'); await p.waitForTimeout(300);
    const core = ['oltp_transactional', 'structured_relational_joins', 'strict_acid', 'low_ms', 'medium_few_tb', 'balanced'];
    let clicks = 1;
    for (let i = 0; i < core.length; i++) {
      await fits(p, 'Q' + (i + 1) + ' ' + (await p.locator('.question-card h2').textContent()));
      if (i === 0 || i === 1) await p.screenshot({ path: `${S}/shots2/${name}-q${i + 1}.png` });
      await pick(p, core[i]); clicks++;
    }
    await p.waitForTimeout(400); await p.screenshot({ path: `${S}/shots2/${name}-reveal.png` });
    await p.waitForTimeout(2600);
    log('  clicks to result:', clicks);
    log('  podium:', (await p.locator('.podium__slot').allInnerTexts()).map(t => t.replace(/\n+/g, ' ')));
    log('  reasons:', (await p.locator('.reasons').innerText()).replace(/\n+/g, ' | '));
    await p.screenshot({ path: `${S}/shots2/${name}-result.png`, fullPage: false });
    await p.click('.podium__slot--2'); await p.waitForTimeout(200);
    log('  focus #2:', await p.locator('.result-hero__name').textContent());
    await p.click('#btn-bonus'); await p.waitForTimeout(300);
    for (const id of ['multi_region_failover', 'no']) { await fits(p, 'bonus ' + (await p.locator('.question-card h2').textContent())); await pick(p, id); }
    await fits(p, 'bonus ' + (await p.locator('.question-card h2').textContent()));
    await p.screenshot({ path: `${S}/shots2/${name}-bonus-q9.png` });
    await p.click('#opt-grid [data-opt="mysql_wire_protocol_compatibility"]'); await p.waitForTimeout(200);
    await p.click('#nav-next'); await p.waitForTimeout(300);
    for (const id of ['standard', 'sql_only_minimal_new_tooling']) { await fits(p, 'bonus ' + (await p.locator('.question-card h2').textContent())); await pick(p, id); }
    await p.waitForTimeout(2600);
    log('  after bonus podium:', (await p.locator('.podium__slot').allInnerTexts()).map(t => t.replace(/\n+/g, ' ')));
    log('  bonus cta:', (await p.locator('.bonus-cta').innerText()).slice(0, 60));
    await p.screenshot({ path: `${S}/shots2/${name}-result-full.png`, fullPage: true });
    // play again -> batch workload
    await p.click('#btn-restart'); await p.waitForTimeout(300);
    await p.click('#hero-start'); await p.waitForTimeout(300);
    for (const id of ['batch_etl_data_lake', 'key_value', 'strict_acid', 'sub_millisecond', 'small_under_100gb', 'cost_sensitive']) await pick(p, id);
    await p.waitForTimeout(2800);
    log('  batch (worst case answers):', (await p.locator('.podium__slot').allInnerTexts()).map(t => t.replace(/\n+/g, ' ')));
    // composite
    log('=== composite flow', name);
    await p.click('#btn-restart'); await p.waitForTimeout(300);
    await p.click('#hero-start'); await p.waitForTimeout(300); await p.click('#mode-switch'); await p.waitForTimeout(300);
    for (const id of ['oltp_transactional', 'cache_session_realtime', 'search_logging_observability']) { await p.click(`#opt-grid [data-opt="${id}"]`); await p.waitForTimeout(120); }
    await fits(p, 'select'); await p.screenshot({ path: `${S}/shots2/${name}-comp-select.png` });
    await p.click('#nav-next'); await p.waitForTimeout(300);
    const per = [['structured_relational_joins', 'strict_acid', 'low_ms'], ['key_value', 'eventual_ok', 'sub_millisecond'], ['unstructured_text_logs', 'eventual_ok', 'low_ms']];
    for (let i = 0; i < 3; i++) { await fits(p, 'job ' + (i + 1)); if (i === 0) await p.screenshot({ path: `${S}/shots2/${name}-comp-round.png` });
      for (const id of per[i]) { await p.click(`.composite-qblock [data-opt="${id}"]`); await p.waitForTimeout(150); } await p.waitForTimeout(600); }
    for (const id of ['medium_few_tb', 'balanced']) { await fits(p, 'shared ' + (await p.locator('.question-card h2').textContent())); await pick(p, id); }
    await p.waitForTimeout(2600);
    log('  stack:', (await p.locator('.stack-card').allInnerTexts()).map(t => t.replace(/\n+/g, ' | ')));
    log('  h-overflow:', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    await p.screenshot({ path: `${S}/shots2/${name}-comp-result.png`, fullPage: true });
    await p.click('#btn-restart'); await p.waitForTimeout(200); await p.click('#hero-existing'); await p.waitForTimeout(300);
    log('  existing:', await p.locator('.question-card h2').textContent());
    await p.close();
  }
  log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
