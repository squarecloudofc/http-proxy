const http = require("node:http");
const https = require("node:https");
const common = require("../common");

/*!
 * Array of passes.
 *
 * A `pass` is just a function that is executed on `req, socket, options`
 * so that you can easily add new checks while still keeping the base
 * flexible.
 */

/*
 * Websockets Passes
 *
 */

module.exports = {
  /**
   * WebSocket requests must have the `GET` method and
   * the `upgrade:websocket` header
   *
   * @param {ClientRequest} Req Request object
   * @param {Socket} Websocket
   *
   * @api private
   */

  checkMethodAndHeader: function checkMethodAndHeader(req, socket) {
    if (req.method !== "GET" || !req.headers.upgrade || req.headers.upgrade.toLowerCase() !== "websocket") {
      socket.destroy();
      return true;
    }
  },

  /**
   * Sets `X-Forwarded-*` headers if specified in config.
   *
   * @param {ClientRequest} Req Request object
   * @param {Socket} Websocket
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */

  XHeaders: function XHeaders(req, res, options) {
    if (!options.xfwd) return;

    const values = {
      For: req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.connection.remoteAddress || req.socket.remoteAddress,
      Port: common.getPort(req),
      Proto: common.hasEncryptedConnection(req) ? "wss" : "ws",
    };

    for (const header of ["For", "Port", "Proto"]) {
      const headerName = `X-Forwarded-${header}`;
      if (req.headers?.[headerName]) {
        req.headers[headerName] += `, ${values[header]}`;
      } else {
        req.headers[headerName] = values[header];
      }
    }
  },

  /**
   * Does the actual proxying. Make the request and upgrade it
   * send the Switching Protocols request and pipe the sockets.
   *
   * @param {ClientRequest} Req Request object
   * @param {Socket} Websocket
   * @param {Object} Options Config object passed to the proxy
   *
   * @api private
   */
  stream: function stream(req, socket, options, head, server, clb) {
    const createHttpHeader = function (line, headers) {
      return (
        Object.keys(headers)
          .reduce(
            function (head, key) {
              const value = headers[key];

              if (!Array.isArray(value)) {
                head.push(key + ": " + value);
                return head;
              }

              for (let i = 0; i < value.length; i++) {
                head.push(key + ": " + value[i]);
              }
              return head;
            },
            [line],
          )
          .join("\r\n") + "\r\n\r\n"
      );
    };

    common.setupSocket(socket);

    if (head && head.length) socket.unshift(head);

    const proxyReq = (common.isSSL.test(options.target.protocol) ? https : http).request(
      common.setupOutgoing(options.ssl || {}, options, req),
    );

    // Enable developers to modify the proxyReq before headers are sent
    if (server) {
      server.emit("proxyReqWs", proxyReq, req, socket, options, head);
    }

    // Error Handler
    proxyReq.on("error", onOutgoingError);
    proxyReq.on("response", function (res) {
      // if upgrade event isn"t going to happen, close the socket
      if (!res.upgrade && socket.readyState !== "closed") {
        socket.write(createHttpHeader(`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}`, res.headers));
        res.pipe(socket);
      }
    });

    proxyReq.on("upgrade", function (proxyRes, proxySocket, proxyHead) {
      proxySocket.on("error", onOutgoingError);

      // Allow us to listen when the websocket has completed
      proxySocket.on("end", function () {
        server.emit("close", proxyRes, proxySocket, proxyHead);
      });

      // The pipe below will end proxySocket if socket closes cleanly, but not
      // if it errors (eg, vanishes from the net and starts returning
      // EHOSTUNREACH). We need to do that explicitly.
      socket.on("error", proxySocket.end);

      common.setupSocket(proxySocket);

      if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);

      //
      // Remark: Handle writing the headers to the socket when switching protocols
      // Also handles when a header is an array
      //
      socket.write(createHttpHeader("HTTP/1.1 101 Switching Protocols", proxyRes.headers));

      let proxyStream = proxySocket;

      if (options.createWsServerTransformStream) {
        const wsServerTransformStream = options.createWsServerTransformStream(req, proxyReq, proxyRes);

        wsServerTransformStream.on("error", onOutgoingError);
        proxyStream = proxyStream.pipe(wsServerTransformStream);
      }

      proxyStream = proxyStream.pipe(socket);

      if (options.createWsClientTransformStream) {
        const wsClientTransformStream = options.createWsClientTransformStream(req, proxyReq, proxyRes);

        wsClientTransformStream.on("error", onOutgoingError);
        proxyStream = proxyStream.pipe(wsClientTransformStream);
      }

      proxyStream.pipe(proxySocket);

      server.emit("open", proxySocket);
      server.emit("proxySocket", proxySocket); // DEPRECATED.
    });

    return proxyReq.end();

    function onOutgoingError(err) {
      if (clb) {
        clb(err, req, socket);
      } else {
        server.emit("error", err, req, socket);
      }
      socket.end();
    }
  },
};
