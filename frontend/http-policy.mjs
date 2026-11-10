export function redirects() {
  return [
    { source: "/home", destination: "/en/", permanent: true },
    {
      source: "/apps/category/All/:page*",
      destination: "/en/",
      permanent: true,
    },
    {
      source: "/apps/search/:q",
      destination: "/en/apps/search?q=:q",
      permanent: true,
    },
    { source: "/apps", destination: "/en/", permanent: true },
    {
      source: "/apps/:path*/flatpakhttps",
      destination:
        "flatpak+https://dl.flathub.org/repo/appstream/:path*.flatpakref",
      permanent: false,
    },
    {
      source: "/:locale/apps/:path*/flatpakhttps",
      destination:
        "flatpak+https://dl.flathub.org/repo/appstream/:path*.flatpakref",
      permanent: false,
    },
    {
      source: "/apps/details/:path*",
      destination: "/en/apps/:path*",
      permanent: true,
    },
    {
      source: "/apps/collection/verified",
      destination: "/en/apps/collection/verified/1",
      permanent: true,
    },
    {
      source: "/apps/collection/recently-updated",
      destination: "/en/apps/collection/recently-updated/1",
      permanent: true,
    },
    {
      source: "/apps/collection/recently-added",
      destination: "/en/apps/collection/recently-added/1",
      permanent: true,
    },
    {
      source: "/apps/collection/popular",
      destination: "/en/apps/collection/popular/1",
      permanent: true,
    },
    {
      source: "/apps/collection/trending",
      destination: "/en/apps/collection/trending/1",
      permanent: true,
    },
    {
      source: "/apps/collection/mobile",
      destination: "/en/apps/collection/mobile/1",
      permanent: true,
    },
    // Redirect non-localized app routes to localized ones (but not /apps itself)
    { source: "/apps/:path+", destination: "/en/apps/:path*", permanent: true },
    { source: "/apps", destination: "/en/", permanent: true },
    {
      source: "/apps/collection/developer/:developer",
      destination: "/en/apps/collection/developer/:developer/1",
      permanent: true,
    },
    {
      source: "/apps/category/:category",
      destination: "/en/apps/category/:category/1",
      permanent: true,
    },
    {
      source: "/apps/category/:category/subcategories/:subcategory",
      destination: "/en/apps/category/:category/subcategories/:subcategory/1",
      permanent: true,
    },
    {
      source: "/apps/collection/tag/:tag",
      destination: "/en/apps/collection/tag/:tag/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/collection/developer/:developer",
      destination: "/:locale/apps/collection/developer/:developer/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/collection/verified",
      destination: "/:locale/apps/collection/verified/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/collection/recently-updated",
      destination: "/:locale/apps/collection/recently-updated/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/collection/recently-added",
      destination: "/:locale/apps/collection/recently-added/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/collection/popular",
      destination: "/:locale/apps/collection/popular/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/collection/trending",
      destination: "/:locale/apps/collection/trending/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/collection/mobile",
      destination: "/:locale/apps/collection/mobile/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/category/:category",
      destination: "/:locale/apps/category/:category/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/category/:category/subcategories/:subcategory",
      destination:
        "/:locale/apps/category/:category/subcategories/:subcategory/1",
      permanent: true,
    },
    {
      source: "/:locale/apps/collection/tag/:tag",
      destination: "/:locale/apps/collection/tag/:tag/1",
      permanent: true,
    },
    { source: "/pipelines", destination: "/en/builds", permanent: true },
    {
      source: "/pipelines/:buildId",
      destination: "/en/builds/:buildId",
      permanent: true,
    },
  ]
}

export function headers({ production, siteBaseUri }) {
  const contentSecurityPolicy = `
    base-uri 'self' ${siteBaseUri};
    object-src 'none';
    form-action 'none';
    style-src 'self' 'unsafe-inline' https://dl.flathub.org;
    font-src 'self' https://dl.flathub.org;
    connect-src 'self' https://flathub.org https://builds.flathub.org/api/ https://webstats.gnome.org https://api.github.com https://api.stripe.com https://maps.googleapis.com https://o467221.ingest.sentry.io/api/6610580/;
    img-src 'self' https://dl.flathub.org https://webstats.gnome.org https://avatars.githubusercontent.com https://gitlab.com https://gitlab.gnome.org https://lh3.googleusercontent.com https://secure.gravatar.com https://invent.kde.org https://imgproxy.flathub.org data:;
    frame-ancestors 'none';
    frame-src 'self' https://*.js.stripe.com https://js.stripe.com https://hooks.stripe.com;
  `
    .replace(/\s{2,}/g, " ")
    .trim()
  return [
    {
      source: "/:path*{/}?",
      headers: [{ key: "X-Accel-Buffering", value: "no" }],
    },
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "Deny" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value:
            "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), cross-origin-isolated=(), display-capture=(), document-domain=(), encrypted-media=(), execution-while-not-rendered=(), execution-while-out-of-viewport=(), fullscreen=(), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), navigation-override=(), payment=(self), picture-in-picture=(), publickey-credentials-create=(self), publickey-credentials-get=(self), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()",
        },
        {
          key: "Content-Security-Policy",
          /**
           * For testing adjustments use https://addons.mozilla.org/en-GB/firefox/addon/laboratory-by-mozilla/
           * (which allows you to overwrite the Content Security Policy of a particular website).
           *
           * Do not add `unsafe-inline` to `script-src`, as we are using dangerouslySetInnerHTML in a few places,
           * which makes us vulnerable to arbitrary code execution if we receive unsanitized data from the APIs.
           *
           * For the development environment we either need to maintain a separate CSP or disable it altogether.
           * This is because it makes use of `eval` and other features that we don't want to allow in the production environment.
           */
          value: production ? contentSecurityPolicy : "",
        },
      ],
    },
    {
      source: "/:locale/login/email/confirm",
      headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    },
    {
      source: "/:locale/apps/:path",
      headers: [{ key: "Surrogate-Key", value: "app-:path" }],
    },
  ]
}
