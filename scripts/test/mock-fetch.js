// Deterministic HTTP fixtures used only by the subprocess regression tests.
import { appendFileSync } from 'node:fs';

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  appendFileSync(process.env.REQUEST_LOG, `${url}\n`);
  if (!options.signal) throw new Error('HTTP request has no timeout');
  const scenario = process.env.FEED_TEST_SCENARIO;
  const now = new Date().toISOString();
  if (url.includes('api.x.com')) {
    if (scenario === 'x-unauthorized') return new Response('', { status: 401 });
    if (scenario === 'x-throw') throw new Error('Simulated network failure');
    return Response.json(url.includes('/users/by?')
      ? { data: [{ id: '42', username: 'builder', name: 'Builder' }] }
      : { data: [{ id: 'new-tweet', text: 'New release', created_at: now }] });
  }
  if (url === 'https://example.com/podcast.rss') {
    return new Response(`<rss><channel><item><title>Episode</title><guid>new-episode</guid><pubDate>${now}</pubDate></item></channel></rss>`);
  }
  if (url.includes('/api/transcript')) {
    if (scenario === 'podcast-unauthorized') return new Response('', { status: 401 });
    return Response.json({ status: 'ready', url: 'https://example.com/transcript.txt' });
  }
  if (url === 'https://example.com/transcript.txt') return new Response('A real fixture transcript.');
  if (url === 'https://claude.com/resources/articles') {
    const path = scenario === 'legacy-claude' ? '/blog/fixture' : '/resources/articles/fixture';
    return new Response(`<a href="${path}">Article</a><a href="${path}">Duplicate</a>`);
  }
  if (url.startsWith('https://claude.com/')) {
    const published = scenario === 'old-claude' ? '2020-01-01' : now;
    const metadata = { '@graph': [{ '@type': 'WebSite' }, { '@type': 'BlogPosting', headline: 'Claude fixture', datePublished: published }] };
    return new Response(`<nav>Navigation noise</nav><script type="application/ld+json">${JSON.stringify(metadata)}</script><article><h1>Claude fixture</h1><div class="w-richtext"><p>Only the article body.</p><div>Embedded media</div><p>Final paragraph after nested media.</p></div></article><footer>Footer noise</footer>`);
  }
  if (url.startsWith('https://www.anthropic.com/engineering')) {
    if (scenario === 'blogs-down') return new Response('', { status: 503 });
    if (scenario === 'blogs-throw') throw new Error('Simulated blog connection failure');
    if (url.endsWith('/engineering')) {
      if (scenario === 'layout-changed') return new Response('<html>New layout</html>');
      const posts = [{ title: 'New article', slug: 'fixture', publishedAt: now }];
      if (scenario === 'partial-blog') posts.push({ title: 'Unavailable', slug: 'unavailable', publishedAt: now });
      return new Response(`<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { posts } } })}</script>`);
    }
    if (url.endsWith('/unavailable')) return new Response('', { status: 503 });
    return new Response('<article><h1>New article</h1><p>Useful blog content.</p></article>');
  }
  throw new Error(`Unexpected network request: ${url}`);
};
