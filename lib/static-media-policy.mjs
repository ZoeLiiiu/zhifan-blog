const normalizeAllowedHosts = (allowedHosts) => (
  Array.isArray(allowedHosts) ? allowedHosts : []
)
  .map((host) => String(host).trim().toLowerCase())
  .filter((host) => /^[a-z0-9.-]+(?::\d+)?$/i.test(host));

export function createStaticArticleCsp(allowedHosts = []) {
  const mediaSources = normalizeAllowedHosts(allowedHosts)
    .map((host) => `https://${host}`)
    .join(" ");
  const allowedMedia = mediaSources ? ` ${mediaSources}` : "";
  return `default-src 'self'; base-uri 'self'; connect-src 'self'${allowedMedia}; frame-src 'none'; img-src 'self' blob:${allowedMedia}; media-src 'self'${allowedMedia}; object-src 'none'; script-src 'self'; style-src 'self'`;
}

export function createStaticArticleHtml(template, allowedHosts = []) {
  const csp = createStaticArticleCsp(allowedHosts);
  const meta = `    <meta http-equiv="Content-Security-Policy" content="${csp}" />`;
  return String(template).replace("</head>", `${meta}\n  </head>`);
}
