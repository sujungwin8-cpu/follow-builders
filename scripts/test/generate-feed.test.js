import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const originalFeed = JSON.stringify({ generatedAt: '2026-01-01T00:00:00Z', marker: 'previous data' });
const oldState = { seenTweets: { oldTweet: 1 }, seenVideos: { oldEpisode: 1 }, seenArticles: {} };

async function run(t, { args = [], keys = {}, scenario = '', seen = false, repeat = false, claude = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'follow-builders-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'config'));
  await copyFile(new URL('../generate-feed.js', import.meta.url), join(root, 'scripts/generate-feed.mjs'));
  await copyFile(new URL('./mock-fetch.js', import.meta.url), join(root, 'scripts/mock-fetch.mjs'));
  await writeFile(join(root, 'config/default-sources.json'), JSON.stringify({
    blogs: [{ name: 'Fixture Blog', indexUrl: claude ? 'https://claude.com/resources/articles' : 'https://www.anthropic.com/engineering' }],
    x_accounts: [{ name: 'Builder', handle: 'builder' }],
    podcasts: [{ name: 'Fixture Podcast', rssUrl: 'https://example.com/podcast.rss', url: 'https://example.com/podcast' }],
  }));
  const state = structuredClone(oldState);
  if (seen) state.seenArticles['https://www.anthropic.com/engineering/fixture'] = Date.now();
  await writeFile(join(root, 'state-feed.json'), JSON.stringify(state));
  for (const type of ['x', 'podcasts', 'blogs']) await writeFile(join(root, `feed-${type}.json`), originalFeed);
  const env = { ...process.env, X_BEARER_TOKEN: '', POD2TXT_API_KEY: '', ...keys,
    FEED_TEST_SCENARIO: scenario, REQUEST_LOG: join(root, 'requests.log'),
    GITHUB_STEP_SUMMARY: join(root, 'summary.md') };
  let outcome;
  async function invoke() {
    try {
      outcome = { code: 0, ...await exec(process.execPath,
        ['--import', join(root, 'scripts/mock-fetch.mjs'), join(root, 'scripts/generate-feed.mjs'), ...args],
        { env, timeout: 15000 }) };
    } catch (err) { outcome = err; }
  }
  await invoke();
  if (repeat) await invoke();
  const text = (path) => readFile(join(root, path), 'utf8').catch(() => null);
  const json = async (path) => JSON.parse(await text(path));
  return { ...outcome, text, json, report: await json('feed-status.json'), requests: await text('requests.log') || '' };
}

test('no keys: blogs collected, paid APIs skipped, old feeds and their dedup state preserved', async (t) => {
  const r = await run(t);
  assert.equal(r.code, 0);
  assert.equal(r.report.feeds.blogs.stats.blogPosts, 1);
  for (const type of ['x', 'podcasts']) {
    assert.equal(r.report.feeds[type].status, 'skipped');
    assert.equal(r.report.feeds[type].feedUpdated, false);
    assert.equal(await r.text(`feed-${type}.json`), originalFeed);
  }
  const state = await r.json('state-feed.json');
  assert.deepEqual(state.seenTweets, oldState.seenTweets);
  assert.deepEqual(state.seenVideos, oldState.seenVideos);
  assert.ok(!r.requests.includes('api.x.com') && !r.requests.includes('podcast.rss'));
  assert.match(await r.text('summary.md'), /X_BEARER_TOKEN not set/);
});

test('whitespace credentials count as missing', async (t) => {
  const r = await run(t, { keys: { X_BEARER_TOKEN: '  ', POD2TXT_API_KEY: '\t' } });
  assert.equal(r.code, 0);
  assert.equal(r.report.feeds.x.status, 'skipped');
  assert.equal(r.report.feeds.podcasts.status, 'skipped');
});

for (const [args, error] of [
  [['--tweets-only'], /X_BEARER_TOKEN not set/],
  [['--podcasts-only'], /POD2TXT_API_KEY not set/],
  [['--blog-only'], /Usage:/],
  [['--tweets-only', '--blogs-only'], /Usage:/],
]) test(`invalid or unconfigured explicit request ${args.join(' ')} fails before writes/network`, async (t) => {
  const r = await run(t, { args });
  assert.equal(r.code, 1);
  assert.match(r.stderr, error);
  assert.equal(r.requests, '');
  for (const type of ['x', 'podcasts', 'blogs']) assert.equal(await r.text(`feed-${type}.json`), originalFeed);
});

test('blogs-only never calls paid APIs, even with credentials', async (t) => {
  const r = await run(t, { args: ['--blogs-only'], keys: { X_BEARER_TOKEN: 'fixture', POD2TXT_API_KEY: 'fixture' } });
  assert.equal(r.code, 0);
  assert.equal(r.report.feeds.x.reason, 'not_requested');
  assert.ok(!r.requests.includes('api.x.com') && !r.requests.includes('podcast.rss'));
});

for (const keys of [
  { X_BEARER_TOKEN: 'fixture' },
  { POD2TXT_API_KEY: 'fixture' },
  { X_BEARER_TOKEN: 'fixture', POD2TXT_API_KEY: 'fixture' },
]) test(`default mode independently enables configured sources: ${Object.keys(keys)}`, async (t) => {
  const r = await run(t, { keys });
  assert.equal(r.code, 0);
  assert.equal(r.report.feeds.x.status, keys.X_BEARER_TOKEN ? 'success' : 'skipped');
  assert.equal(r.report.feeds.podcasts.status, keys.POD2TXT_API_KEY ? 'success' : 'skipped');
  assert.equal(r.report.feeds.blogs.status, 'success');
});

for (const [scenario, keys, feed, stateKey] of [
  ['x-unauthorized', { X_BEARER_TOKEN: 'fixture' }, 'x', 'seenTweets'],
  ['podcast-unauthorized', { POD2TXT_API_KEY: 'fixture' }, 'podcasts', 'seenVideos'],
]) test(`${scenario}: blog result saved, failed feed/state preserved, run fails visibly`, async (t) => {
  const r = await run(t, { scenario, keys });
  assert.equal(r.code, 1);
  assert.equal(r.report.feeds.blogs.status, 'success');
  assert.equal(r.report.feeds[feed].status, 'failed');
  assert.equal(await r.text(`feed-${feed}.json`), originalFeed);
  assert.deepEqual((await r.json('state-feed.json'))[stateKey], oldState[stateKey]);
});

for (const scenario of ['blogs-down', 'blogs-throw', 'layout-changed'])
  test(`${scenario}: failed collection cannot masquerade as a successful empty feed`, async (t) => {
    const r = await run(t, { scenario });
    assert.equal(r.code, 1);
    assert.equal(r.report.status, 'failed');
    assert.equal(r.report.feeds.blogs.feedUpdated, false);
    assert.equal(await r.text('feed-blogs.json'), originalFeed);
    assert.deepEqual(await r.json('state-feed.json'), oldState);
  });

test('partial blog outage saves available content and reports partial status', async (t) => {
  const r = await run(t, { scenario: 'partial-blog' });
  assert.equal(r.code, 0);
  assert.equal(r.report.status, 'partial');
  assert.equal((await r.json('feed-blogs.json')).blogs.length, 1);
  assert.equal(r.report.feeds.blogs.errors.length, 1);
});

test('genuine zero new articles is success, including a second deduplicated run', async (t) => {
  const r = await run(t, { repeat: true });
  assert.equal(r.code, 0);
  assert.equal(r.report.feeds.blogs.status, 'success');
  assert.equal(r.report.feeds.blogs.stats.blogPosts, 0);
});

for (const scenario of ['', 'legacy-claude'])
  test(`Claude current/legacy URLs, JSON-LD graph, article body and duplicate links (${scenario})`, async (t) => {
    const r = await run(t, { claude: true, scenario });
    assert.equal(r.code, 0);
    const articles = (await r.json('feed-blogs.json')).blogs;
    assert.equal(articles.length, 1);
    assert.ok(articles[0].publishedAt);
    assert.match(articles[0].content, /Only the article body/);
    assert.match(articles[0].content, /Final paragraph after nested media/);
    assert.doesNotMatch(articles[0].content, /Navigation noise|Footer noise/);
  });

test('article-page date prevents old Claude posts from being published as recent', async (t) => {
  const r = await run(t, { claude: true, scenario: 'old-claude' });
  assert.equal(r.code, 0);
  assert.equal(r.report.feeds.blogs.stats.blogPosts, 0);
});
