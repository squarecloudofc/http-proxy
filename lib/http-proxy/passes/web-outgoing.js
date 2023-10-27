const common = require("../common");
const redirectRegex = /^201|30(1|2|7|8)$/;

/*!
 * Array of passes.
 *
 * A `pass` is just a function that is executed on `req, res, options`
 * so that you can easily add new checks while still keeping the base
 * flexible.
 */

module.exports = {
  /**
   * If is a HTTP 1.0 request, remove chunk headers
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {proxyResponse} Res Response object from the proxy request
   *
   * @api private
   */
  removeChunked: (req, res, proxyRes) => {
    if (req.httpVersion === "1.0") {
      delete proxyRes.headers["transfer-encoding"];
    }
  },

  /**
   * If is a HTTP 1.0 request, set the correct connection header
   * or if connection header not present, then use `keep-alive`
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {proxyResponse} Res Response object from the proxy request
   *
   * @api private
   */
  setConnection: (req, res, proxyRes) => {
    if (req.httpVersion === "1.0") {
      proxyRes.headers.connection = req.headers.connection || "close";
    } else if (req.httpVersion !== "2.0" && !proxyRes.headers.connection) {
      proxyRes.headers.connection = req.headers.connection || "keep-alive";
    }
  },

  setRedirectHostRewrite: (req, res, proxyRes, options) => {
    if (
      (options.hostRewrite || options.autoRewrite || options.protocolRewrite) &&
      proxyRes.headers.location &&
      redirectRegex.test(proxyRes.statusCode)
    ) {
      const target = new URL(options.target);
      const u = new URL(proxyRes.headers.location);

      if (target.host !== u.host) {
        return;
      }

      u.host = options.hostRewrite || (options.autoRewrite ? req.headers.host : u.host);
      u.protocol = options.protocolRewrite ?? u.protocol;

      proxyRes.headers.location = u.href;
    }
  },
  /**
   * Copy headers from proxyResponse to response
   * set each header in response object.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {proxyResponse} Res Response object from the proxy request
   * @param {Object} Options options.cookieDomainRewrite: Config to rewrite cookie domain
   *
   * @api private
   */
  writeHeaders: (req, res, proxyRes, options) => {
    // Remember, do not use 'const' for 'rewrite' since it needs to be mutable (to avoid TypeError: Assignment to constant variable).
    let rewriteCookieDomainConfig = options.cookieDomainRewrite;
    let rewriteCookiePathConfig = options.cookiePathRewrite;
    const preserveHeaderKeyCase = options.preserveHeaderKeyCase;

    let rawHeaderKeyMap;
    const setHeader = function (key, header) {
      if (header === undefined) return;
      if (key.toLowerCase() === "set-cookie") {
        if (rewriteCookieDomainConfig) {
          header = common.rewriteCookieProperty(header, rewriteCookieDomainConfig, "domain");
        }
        if (rewriteCookiePathConfig) {
          header = common.rewriteCookieProperty(header, rewriteCookiePathConfig, "path");
        }
      }

      try {
        res.setHeader(String(key).trim(), header);
      } catch (error) {
        console.warn(error, key, header);
      }
    };

    if (typeof rewriteCookieDomainConfig === "string") {
      rewriteCookieDomainConfig = { "*": rewriteCookieDomainConfig };
    }

    if (typeof rewriteCookiePathConfig === "string") {
      rewriteCookiePathConfig = { "*": rewriteCookiePathConfig };
    }

    if (preserveHeaderKeyCase && proxyRes.rawHeaders) {
      rawHeaderKeyMap = {};

      for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
        const lowerKey = proxyRes.rawHeaders[i].toLowerCase();
        rawHeaderKeyMap[lowerKey] = proxyRes.rawHeaders[i];
      }
    }

    for (const [key, header] of Object.entries(proxyRes.headers)) {
      if (preserveHeaderKeyCase && rawHeaderKeyMap) {
        const originalKey = rawHeaderKeyMap[key] || key;
        setHeader(originalKey, header);
      } else {
        setHeader(key, header);
      }
    }
  },

  /**
   * Set the statusCode from the proxyResponse
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {proxyResponse} Res Response object from the proxy request
   *
   * @api private
   */
  writeStatusCode: (req, res, proxyRes) => {
    res.statusCode = proxyRes.statusCode;
    if (proxyRes.statusMessage) {
      res.statusMessage = proxyRes.statusMessage;
    }
  },

  /**
   * If is a chunked response, flush headers.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {proxyResponse} Res Response object from the proxy request
   *
   * @api private
   */
  chunkedResponse: (req, res, proxyRes) => {
    const te = proxyRes.headers["transfer-encoding"];
    if (te && te.toLowerCase() === "chunked") {
      res.flushHeaders();
    }
  },
};
