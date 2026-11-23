import Script from "next/script";

const SAFE_GA_ID_RE = /^[A-Za-z0-9-]+$/;
const SAFE_CLARITY_ID_RE = /^[A-Za-z0-9]+$/;
const SAFE_POSTHOG_KEY_RE = /^[A-Za-z0-9_-]+$/;

function sanitizeHttpsOrigin(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.origin : fallback;
  } catch {
    return fallback;
  }
}

export function AnalyticsScripts() {
  const isVercel = process.env.VERCEL === "1";
  const rawGaId = process.env.NEXT_PUBLIC_GA_ID?.trim();
  const gaId = rawGaId && SAFE_GA_ID_RE.test(rawGaId) ? rawGaId : undefined;
  const rawClarityId = process.env.NEXT_PUBLIC_CLARITY_ID?.trim();
  const clarityId =
    rawClarityId && SAFE_CLARITY_ID_RE.test(rawClarityId)
      ? rawClarityId
      : undefined;
  const rawPosthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const posthogKey =
    rawPosthogKey && SAFE_POSTHOG_KEY_RE.test(rawPosthogKey)
      ? rawPosthogKey
      : undefined;
  const posthogHost = sanitizeHttpsOrigin(
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim(),
    "https://us.i.posthog.com"
  );

  return (
    <>
      {isVercel && (
        <Script
          id="vercel-analytics"
          src="/_vercel/insights/script.js"
          strategy="afterInteractive"
        />
      )}
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', ${JSON.stringify(gaId)});
            `}
          </Script>
        </>
      )}

      {clarityId && (
        <Script id="clarity-init" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", ${JSON.stringify(clarityId)});
          `}
        </Script>
      )}

      {posthogKey && (
        <Script id="posthog-init" strategy="afterInteractive">
          {`
            !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.people.toString(1)+".people (stub)"},o="init capture register register_once unregister identify".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
            posthog.init(${JSON.stringify(posthogKey)}, { api_host: ${JSON.stringify(posthogHost)}, person_profiles: 'identified_only' });
          `}
        </Script>
      )}
    </>
  );
}
