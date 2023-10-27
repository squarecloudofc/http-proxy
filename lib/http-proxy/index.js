const EE3 = require("node:events");
const http = require("node:http");
const https = require("node:https");
const web = require("./passes/web-incoming");
const ws = require("./passes/ws-incoming");

/**
 * Returns a function that creates the loader for
 * either `ws` or `web`"s  passes.
 *
 *
 * @param {String} Type Either "ws" or "web"
 *
 * @return {Function} Loader Function that when called returns an iterator for the right passes
 *
 * @api private
 */

function createRightProxy(type) {
  return function (options) {
    return function (req, res /*, [head], [opts] */) {
      const passes = type === "ws" ? this.wsPasses : this.webPasses;
      const args = [].slice.call(arguments);
      let cntr = args.length - 1;
      let head;
      let cbl;

      /* optional args parse begin */
      if (typeof args[cntr] === "function") {
        cbl = args[cntr];

        cntr--;
      }

      let requestOptions = options;
      if (!(args[cntr] instanceof Buffer) && args[cntr] !== res) {
        requestOptions = Object.assign({}, options);
        Object.assign(requestOptions, args[cntr]);

        cntr--;
      }

      if (args[cntr] instanceof Buffer) {
        head = args[cntr];
      }

      /* optional args parse end */
      ["target", "forward"].forEach(function (e) {
        if (typeof requestOptions[e] === "string") {
          requestOptions[e] = new URL(requestOptions[e]);
        }
      });

      if (!requestOptions.target && !requestOptions.forward) {
        return this.emit("error", new Error("Must provide a proper URL as target"));
      }

      for (let i = 0; i < passes.length; i++) {
        /**
         * Call of passes functions
         * pass(req, res, options, head)
         *
         * In WebSockets case the `res` variable
         * refer to the connection socket
         * pass(req, socket, options, head)
         */
        if (passes[i](req, res, requestOptions, head, this, cbl)) {
          break;
        }
      }
    };
  };
}

class ProxyServer {
  constructor(options) {
    EE3.call(this);

    options = options || {};
    options.prependPath = options.prependPath !== false;

    this.web = this.proxyRequest = createRightProxy("web")(options);
    this.ws = this.proxyWebsocketRequest = createRightProxy("ws")(options);
    this.options = options;

    this.webPasses = Object.keys(web).map((pass) => web[pass]);
    this.wsPasses = Object.keys(ws).map((pass) => ws[pass]);

    this.on("error", this.onError, this);
  }

  onError(err) {
    if (this.listeners("error").length === 1) {
      throw err;
    }
  }

  listen(port, hostname) {
    const closure = (req, res) => this.web(req, res);

    const server = this.options.ssl ? https.createServer(this.options.ssl, closure) : http.createServer(closure);

    if (this.options.ws) {
      server.on("upgrade", (req, socket, head) => this.ws(req, socket, head));
    }

    server.listen(port, hostname);
    this._server = server;

    return this;
  }

  close(callback) {
    if (this._server) {
      this._server.close((err) => {
        this._server = null;
        if (callback) {
          callback(err);
        }
      });
    }
  }

  before(type, passName, callback) {
    addPass(type === "ws" ? this.wsPasses : this.webPasses, type, passName, callback, false);
  }

  after(type, passName, callback) {
    addPass(type === "ws" ? this.wsPasses : this.webPasses, type, passName, callback, true);
  }
}

require("node:util").inherits(ProxyServer, EE3);

function addPass(passes, type, passName, callback, isAfter) {
  if (!["ws", "web"].includes(type)) {
    throw new Error("type must be `web` or `ws`");
  }

  const passIndex = passes.findIndex((pass) => pass.name === passName);

  if (passIndex === -1) {
    throw new Error("No such pass");
  }

  passes.splice(passIndex + (isAfter ? 1 : 0), 0, callback);
}

module.exports.Server = ProxyServer;
module.exports.createRightProxy = createRightProxy;
