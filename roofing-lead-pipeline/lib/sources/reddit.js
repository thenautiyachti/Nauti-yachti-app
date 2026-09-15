// Reddit source.
//
// This is the one public intent source with an official, documented read API and
// no authentication wall in front of the content. That is exactly why it is the
// source this prototype implements and Facebook groups are not: group posts sit
// behind a login, and Meta's Automated Data Collection Terms prohibit collecting
// them. See ../../README.md, "Why Reddit and not Facebook".
//
// Reddit asks for a descriptive User-Agent. Set REDDIT_USER_AGENT to something
// that names the app and a contact. Honour the rate limit; the default pacing
// below is deliberately slow.

const UA = process.env.REDDIT_USER_AGENT
  || 'roofing-lead-pipeline/0.1 (prototype; set REDDIT_USER_AGENT)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// App-only OAuth. Reddit blocks unauthenticated requests from datacenter IPs, so
// anonymous fetching works from a laptop and usually not from a server. Create a
// "script" app at https://www.reddit.com/prefs/apps and set REDDIT_CLIENT_ID and
// REDDIT_CLIENT_SECRET; the adapter then talks to oauth.reddit.com instead.
let tokenCache = { value: null, expires: 0 };

async function getToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (tokenCache.value && Date.now() < tokenCache.expires) return tokenCache.value;

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Reddit OAuth failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  tokenCache = {
    value: json.access_token,
    expires: Date.now() + (json.expires_in - 60) * 1000,
  };
  return tokenCache.value;
}

function buildUrl({ subreddits, keywords, window: win, limit }) {
  const q = keywords.split(',').map((k) => `"${k.trim()}"`).filter((k) => k !== '""').join(' OR ');
  const subs = (subreddits || '').split(',').map((s) => s.trim()).filter(Boolean);
  const params = new URLSearchParams({
    q, sort: 'new', t: win || 'week', limit: String(limit || 25), raw_json: '1',
  });
  if (subs.length === 1) {
    params.set('restrict_sr', 'on');
    return `https://www.reddit.com/r/${encodeURIComponent(subs[0])}/search.json?${params}`;
  }
  if (subs.length > 1) {
    params.set('restrict_sr', 'on');
    return `https://www.reddit.com/r/${subs.map(encodeURIComponent).join('+')}/search.json?${params}`;
  }
  return `https://www.reddit.com/search.json?${params}`;
}

// Maps a Reddit listing child to the lead shape in lib/db.js.
// consent is always public_thread_only: the person posted in public and asked
// nobody to contact them. The UI reads that field to decide which buttons exist.
function toLead(child) {
  const d = child.data;
  const body = (d.selftext || '').trim();
  return {
    source: 'reddit',
    source_ref: `https://www.reddit.com${d.permalink}`,
    author: d.author ? `u/${d.author}` : null,
    raw_text: `${d.title}\n\n${body}`.trim(),
    posted_at: new Date(d.created_utc * 1000).toISOString(),
    location_text: d.subreddit ? `r/${d.subreddit}` : null,
    consent: 'public_thread_only',
    consent_note: 'Public Reddit post. No consent to call or text — reply in the thread.',
  };
}

export async function fetchReddit(signal, { limit = 25 } = {}) {
  const token = await getToken();
  let url = buildUrl({ ...signal, limit });
  const headers = { 'User-Agent': UA, Accept: 'application/json' };
  if (token) {
    url = url.replace('https://www.reddit.com', 'https://oauth.reddit.com');
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });

  if (res.status === 429) throw new Error('Reddit rate-limited the request (429). Wait and retry.');
  if (res.status === 403 && !token) {
    throw new Error(
      'Reddit returned 403. It blocks anonymous requests from most servers — set '
      + 'REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to use the official OAuth path.');
  }
  if (!res.ok) throw new Error(`Reddit returned ${res.status} ${res.statusText}`);

  const json = await res.json();
  const children = json?.data?.children ?? [];
  await sleep(1100); // be a polite client
  return children.filter((c) => c.kind === 't3').map(toLead);
}

export { buildUrl };
