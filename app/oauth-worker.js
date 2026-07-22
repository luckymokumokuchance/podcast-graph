// ============================================================
// oauth-worker.js — GitHub OAuth のコード→トークン交換だけをする中継
//   Cloudflare Workers にこの中身を貼る。
//   環境変数(Settings > Variables)に GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET を設定。
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // GitHub から戻ってくる: /callback?code=...&back=<admin.htmlのURL>
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const back = url.searchParams.get('back');
      if (!code || !back) return new Response('missing code/back', { status: 400 });

      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await res.json();
      if (!data.access_token) {
        return new Response('token exchange failed: ' + JSON.stringify(data), { status: 400 });
      }
      // admin.html に ?token= を付けて戻す
      const dest = new URL(back);
      dest.searchParams.set('token', data.access_token);
      return Response.redirect(dest.toString(), 302);
    }

    return new Response('podcast-graph oauth relay', { status: 200 });
  },
};
