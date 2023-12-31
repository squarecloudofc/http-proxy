const httpNative = require("node:http");
const httpsNative = require("node:https");
const common = require("../common");
let webO = require("./web-outgoing");

webO = Object.keys(webO).map(function (pass) {
  return webO[pass];
});

const nativeAgents = {
  http: httpNative,
  https: httpsNative,
};

/*!
 * Array of passes.
 *
 * A `pass` is just a function that is executed on `req, res, options`
 * so that you can easily add new checks while still keeping the base
 * flexible.
 */

module.exports = {
  /**
   * Sets `content-length` to "0" if request is of DELETE type.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */
  deleteLength: (req) => {
    if ((req.method === "DELETE" || req.method === "OPTIONS") && !req.headers["content-length"]) {
      req.headers["content-length"] = "0";
      delete req.headers["transfer-encoding"];
    }
  },

  /**
   * Sets timeout in request socket if it was specified in options.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */

  timeout: (req, res, options) => {
    if (options.timeout) {
      req.socket.setTimeout(options.timeout);
    }
  },

  /**
   * Sets `X-Forwarded-*` headers if specified in config.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */

  XHeaders: (req, res, options) => {
    if (!options.xfwd) return;

    const encrypted = req.isSpdy || common.hasEncryptedConnection(req);
    const values = {
      For: req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.connection.remoteAddress || req.socket.remoteAddress,
      Port: common.getPort(req),
      Proto: encrypted ? "https" : "http",
    };

    for (const header of ["For", "Port", "Proto"]) {
      const headerName = `X-Forwarded-${header}`;
      if (req.headers?.[headerName]) {
        req.headers[headerName] += `, ${values[header]}`;
      } else {
        req.headers[headerName] = values[header];
      }
    }

    req.headers["X-Forwarded-Host"] = req.headers["X-Forwarded-Host"] || req.headers.host || "";
  },

  /**
   * Does the actual proxying. If `forward` is enabled fires up
   * a ForwardStream, same happens for ProxyStream. The request
   * just dies otherwise.
   *
   * @param {ClientRequest} Req Request object
   * @param {IncomingMessage} Res Response object
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */
  stream: (req, res, options, _, server, clb) => {
    server.emit("start", req, res, options.target || options.forward);

    const http = nativeAgents.http;
    const https = nativeAgents.https;

    if (options.forward) {
      // If forward enable, so just pipe the request
      const forwardReq = (options.forward.protocol === "https:" ? https : http).request(
        common.setupOutgoing(options.ssl || {}, options, req, "forward"),
      );

      // error handler (e.g. ECONNRESET, ECONNREFUSED)
      // Handle errors on incoming request as well as it makes sense to
      const forwardError = createErrorHandler(forwardReq, options.forward);
      req.on("error", forwardError);
      forwardReq.on("error", forwardError);
      (options.buffer || req).pipe(forwardReq);
      if (!options.target) {
        return res.end();
      }
    }

    // Request initalization
    const proxyReq = (options.target.protocol === "https:" ? https : http).request(common.setupOutgoing(options.ssl || {}, options, req));

    // Enable developers to modify the proxyReq before headers are sent
    proxyReq.on("socket", () => {
      if (server) {
        server.emit("proxyReq", proxyReq, req, res, options);
      }
      (options.buffer || req).pipe(proxyReq);
    });

    // allow outgoing socket to timeout so that we could
    // show an error page at the initial request
    if (options.proxyTimeout) {
      proxyReq.setTimeout(options.proxyTimeout, () => {
        if (options.proxyTimeoutCustomError) {
          const timeoutError = new Error("The proxy request timed out");
          timeoutError.code = "ETIMEDOUT";
          return proxyReq.destroy(timeoutError);
        }
        proxyReq.destroy();
      });
    }

    // Ensure we abort proxy if request is aborted
    req.on("aborted", proxyReq.destroy);

    // handle errors in proxy and incoming request, just like for forward proxy
    const proxyError = createErrorHandler(proxyReq, options.target);
    req.on("error", proxyError);
    proxyReq.on("error", proxyError);

    function createErrorHandler(proxyReq, url) {
      return function proxyError(err) {
        if (req.socket?.destroyed && err.code === "ECONNRESET") {
          server.emit("econnreset", err, req, res, url);
          return proxyReq.destroy();
        }

        if (clb) {
          clb(err, req, res, url);
        } else {
          server.emit("error", err, req, res, url);
        }
      };
    }

    proxyReq.on("response", (proxyRes) => {
      if (server) {
        server.emit("proxyRes", proxyRes, req, res);
      }

      if (!res.headersSent && !options.selfHandleResponse) {
        for (let i = 0; i < webO.length; i++) {
          if (webO[i](req, res, proxyRes, options)) {
            break;
          }
        }
      }

      if (!res.finished) {
        // Allow us to listen when the proxy has completed
        proxyRes.on("end", () => (server ? server.emit("end", req, res, proxyRes) : null));

        // We pipe to the response unless its expected to be handled by the user
        if (!options.selfHandleResponse) proxyRes.pipe(res);
      } else if (server) {
        server.emit("end", req, res, proxyRes);
      }
    });
  },
};
