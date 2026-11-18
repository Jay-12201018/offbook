// iOS-emulating walkthrough: iPhone UA, simulated safe areas, a fake recognizer
// that reproduces the iOS 27 "deaf after a cut session" bug and short early
// finals, and a fake speechSynthesis. Run: BASE=... node qa/e2e-ios.cjs
let pw; try { pw = require('playwright'); } catch { pw = require('/workspace/shots/node_modules/playwright'); }
const { chromium } = pw;
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:4173/offbook/';
const OUT = process.env.OUT || '/workspace/english-app/redesign/v2-screens/fix1';
fs.mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1';

const INIT = (opts) => {
  window.__asrQueue = []; window.__asrLog = []; window.__cut = false; window.__lastTtsEnd = 0; window.__speaking = false;
  class FakeRec {
    start() {
      const me = this; me._ended = false;
      const since = Date.now() - window.__lastTtsEnd;
      const deaf = window.__cut || window.__speaking || since > 1500;
      window.__asrLog.push({ deaf, cut: window.__cut, sinceTts: since });
      setTimeout(() => {
        me.onstart && me.onstart(); me.onaudiostart && me.onaudiostart();
        if (deaf) return; // iOS: mic indicator on, but nothing ever arrives
        const t0 = Date.now();
        const poll = () => {
          if (me._ended) return;
          if (window.__asrQueue.length) me._say(window.__asrQueue.shift());
          else if (Date.now() - t0 > 6000) { me.onerror && me.onerror({ error: 'no-speech' }); me._end(); }
          else setTimeout(poll, 100);
        };
        poll();
      }, 60);
    }
    _say(t) {
      const me = this; const w = t.split(' '); const first = w[0]; const rest = w.slice(1).join(' ');
      me.onspeechstart && me.onspeechstart();
      const emit = (list) => { if (me._ended) return; const res = { length: list.length }; list.forEach((r, i) => { res[i] = { 0: { transcript: r[0] }, isFinal: r[1], length: 1 }; }); me.onresult && me.onresult({ resultIndex: 0, results: res }); };
      // iOS style: the first word comes back as its own short FINAL result.
      setTimeout(() => emit([[first, true]]), 150);
      if (rest) setTimeout(() => emit([[first, true], [' ' + rest, false]]), 500);
      if (rest) setTimeout(() => emit([[first, true], [' ' + rest, true]]), 900);
      setTimeout(() => { me.onspeechend && me.onspeechend(); me._end(); }, 1500);
    }
    stop() { if (!this._ended) { window.__cut = true; window.__asrLog.push({ cutBy: 'stop' }); } this._end(); }
    abort() { if (!this._ended) { window.__cut = true; window.__asrLog.push({ cutBy: 'abort' }); } this._end(); }
    _end() { if (this._ended) return; this._ended = true; setTimeout(() => this.onend && this.onend(), 30); }
  }
  window.SpeechRecognition = undefined;
  window.webkitSpeechRecognition = FakeRec;
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (u) => {
      if (!(u.text || '').trim()) return;
      window.__speaking = true;
      setTimeout(() => u.onstart && u.onstart(), 20);
      setTimeout(() => { window.__speaking = false; window.__lastTtsEnd = Date.now(); u.onend && u.onend(); }, 250 + (u.text || '').length * 10);
    };
    window.speechSynthesis.cancel = () => { window.__speaking = false; };
  }
  // Simulate the iPhone safe areas (Dynamic Island / home indicator).
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style');
    s.textContent = ':root{--sat:59px !important;--sab:34px !important}';
    document.head.appendChild(s);
  });
  if (opts && opts.debug) localStorage.setItem('offbook-debug', '1'); else localStorage.removeItem('offbook-debug');
};

const log = (...a) => console.log('•', ...a);
let n = 0;
async function shot(page, name, full = false) {
  const f = `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f, fullPage: full });
  log('shot', f);
}
const listening = (p) => p.waitForSelector('.talk-btn.is-live', { timeout: 20000 });
async function say(p, text) { await listening(p); await p.evaluate((t) => window.__asrQueue.push(t), text); }

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, locale: 'zh-CN' });
  await ctx.addInitScript(INIT, { debug: !process.env.CLEAN });
  if (process.env.CLEAN) { /* clean screenshots only */ }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE);
  await page.getByText('开始，60 秒').click();
  await page.getByText('和外国人聊天').click();
  await page.waitForSelector('.watch');
  await shot(page, 'episode-safe-areas');
  await page.click('.play-btn');
  await page.waitForTimeout(1500);
  await page.getByText('听完了，下一步').click();
  await page.locator('.opt').first().click();
  await page.getByText('继续').click();
  await page.waitForSelector('.call--ringing');
  await shot(page, 'call-ringing-script-badge');
  const edge = await page.evaluate(() => {
    const r = document.querySelector('.practice').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, h: innerHeight, htmlBg: getComputedStyle(document.documentElement).backgroundColor, bodyBg: getComputedStyle(document.body).backgroundColor, theme: document.querySelector('meta[name=theme-color]').content };
  });
  log('call edges', edge);
  await page.click('.round-btn--green');
  // turn 1: iOS returns "Nah" as an early final, then the rest
  await say(page, "Nah I got this, it's on me");
  await page.waitForTimeout(700);
  await shot(page, 'call-listening-live-transcript');
  await page.waitForSelector('.mine:not(.is-live)', { timeout: 15000 });
  log('captured turn 1:', await page.textContent('.mine'));
  // turn 2: user taps ✓ early (finish) — must NOT cut the iOS session
  await listening(page);
  await page.evaluate(() => window.__asrQueue.push("yeah I'm sure I picked the place"));
  await page.waitForTimeout(800);
  await page.click('.talk-btn.is-live');
  await page.waitForSelector('.call--ended', { timeout: 20000 });
  await shot(page, 'call-ended');
  log('asr sessions so far:', JSON.stringify(await page.evaluate(() => window.__asrLog)));
  await page.getByText('看小结').click();
  await page.getByText('正好').click();
  await page.waitForSelector('.today');
  await shot(page, 'today-safe-areas');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await shot(page, 'today-bottom-safe-areas');

  // full episode: steal (cue then listen) + call with silence -> retry
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByText('只想说话').click();
  await page.click('.round-btn--green');
  await listening(page);
  log('waiting for silence timeout (no-speech)…');
  await page.waitForSelector('.talk-btn.is-ready', { timeout: 20000 });
  await shot(page, 'call-no-speech-retry');
  await page.click('.talk-btn.is-ready'); // retry: spoken cue, then a fresh session
  await say(page, 'Nah I got this');
  await page.waitForSelector('.mine:not(.is-live)', { timeout: 15000 });
  log('captured after retry:', await page.textContent('.mine'));
  await say(page, 'Yes I am sure');
  await page.waitForTimeout(2500);
  await say(page, 'You can throw in for the cab');
  await page.waitForTimeout(2500);
  await say(page, "Okay next one's on you");
  await page.waitForSelector('.call--ended', { timeout: 20000 });
  const sessions = await page.evaluate(() => window.__asrLog);
  log('deaf sessions:', sessions.filter((s) => s.deaf).length, 'cuts:', sessions.filter((s) => s.cutBy).length, 'total:', sessions.filter((s) => 'deaf' in s).length);
  await page.getByText('看小结').click();
  await page.waitForSelector('.recap .phrase-row', { timeout: 10000 });
  await page.getByText('这就够了').click();
  await page.waitForSelector('.today');

  // ---------- AI: mocked DeepSeek; first a 400 model error (no silent switch) ----------
  let mode = 'error';
  let turn = 0;
  await page.route('https://api.deepseek.com/**', async (route) => {
    const req = route.request();
    const hdr = { 'access-control-allow-origin': '*' };
    if (req.url().endsWith('/models')) return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ object: 'list', data: [{ id: 'deepseek-flash', object: 'model', owned_by: 'deepseek' }, { id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' }] }) });
    const body = JSON.parse(req.postData() || '{}');
    if (mode === 'error') return route.fulfill({ status: 400, contentType: 'application/json', headers: hdr, body: JSON.stringify({ error: { message: 'Model Not Exist', type: 'invalid_request_error' } }) });
    if (!body.stream) {
      if (body.response_format) {
        const sys = body.messages[0].content;
        const json = sys.includes('pairs')
          ? { pairs: [{ said: 'I pay this one', better: "I've got this one.", noteZh: '更地道' }], phrases: [{ en: "I've got this one.", zh: '这次我来' }, { en: 'Next one’s on you.', zh: '下次你请' }, { en: "Don't make it weird.", zh: '别搞得很别扭' }], praiseZh: '你接住了每一句。' }
          : { zh: '告诉他这次你来付', first: "Don't even…", line: "Don't even. I got this." };
        return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ model: body.model, choices: [{ message: { content: JSON.stringify(json) } }] }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ model: body.model, usage: { total_tokens: 41 }, choices: [{ message: { content: "Hey Jay! I'm ready when you are." } }] }) });
    }
    turn++;
    const lines = ["Oh, here, I'll grab the check real quick.", 'Wait, you got it? You sure?', 'Okay. Can I at least get the coffee after?', "Deal. See, that wasn't hard. [END]"];
    const text = lines[Math.min(turn - 1, lines.length - 1)];
    const sse = text.match(/.{1,10}/g).map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
    return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: hdr, body: sse });
  });

  await page.click('.tab >> nth=2');
  await page.locator('#ai').scrollIntoViewIfNeeded();
  await page.fill('input[name=deepseek-key]', 'sk-test-abcdef1234567890');
  mode = 'ok';
  await page.getByRole('button', { name: '测试连接' }).click();
  await page.waitForSelector('.test-result', { timeout: 10000 });
  log('test result:', (await page.textContent('.test-result')).replace(/\s+/g, ' '));
  log('model options:', await page.$$eval('#ai select option', (o) => o.map((x) => x.value)));
  await page.locator('#ai').screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-ai-test-success.png` });
  mode = 'error';
  await page.click('.tab >> nth=0');
  await page.getByText('只想说话').click();
  await page.waitForSelector('.call--ringing');
  await shot(page, 'call-ringing-ai-badge');
  await page.click('.round-btn--green');
  await page.waitForSelector('.hint-card--error', { timeout: 10000 });
  await shot(page, 'call-ai-error-visible');
  log('error card:', (await page.textContent('.hint-card--error')).replace(/\s+/g, ' '));
  log('badge still:', await page.textContent('.call__top .pill'));
  mode = 'ok';
  await page.getByRole('button', { name: '改用剧本' }).click();
  await page.waitForTimeout(400);
  log('badge after tap:', await page.textContent('.call__top .pill'));
  await page.click('.hangup');
  await page.waitForTimeout(500);
  if (await page.$('.call--ended')) { await page.getByText('看小结').click(); await page.getByText('这就够了').click(); }
  else if (await page.$('.practice')) await page.click('.practice__bar .icon-btn').catch(() => {});
  await page.waitForSelector('.today');

  // AI call works end to end
  await page.getByText('只想说话').click();
  await page.click('.round-btn--green');
  await say(page, 'OK no no I pay this one');
  await page.waitForTimeout(600);
  await shot(page, 'call-ai-live-transcript');
  await page.waitForSelector('.mine:not(.is-live)', { timeout: 15000 });
  log('AI turn 1 captured:', await page.textContent('.mine'));
  await say(page, 'yes you paid last time');
  await page.waitForTimeout(2000);
  await say(page, 'sure next time you pay');
  await page.waitForSelector('.call--ended', { timeout: 20000 });
  await shot(page, 'call-ai-ended');
  await page.getByText('看小结').click();
  await page.waitForSelector('.pair', { timeout: 10000 });
  await shot(page, 'ai-recap');
  await page.getByText('这就够了').click();
  await page.click('.tab >> nth=2');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  await shot(page, 'me-debug-panel');
  const all = await page.evaluate(() => window.__asrLog);
  log('ALL sessions: total', all.filter((s) => 'deaf' in s).length, 'deaf', all.filter((s) => s.deaf).length, 'cuts', all.filter((s) => s.cutBy).length);
  log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
