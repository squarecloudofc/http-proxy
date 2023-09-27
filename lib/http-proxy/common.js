const common = exports;
const upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i;
const isSSL = /^https|wss/;

/**
 * Check if we're required to add a port number.
 *
 * @see https://url.spec.whatwg.org/#default-port
 * @param {Number|String} port Port number we need to check
 * @param {String} protocol Protocol we need to check against.
 * @returns {Boolean} Is it a default port for the given protocol
 * @api private
 */
function isPortRequired(port, protocol) {
  const excludedPorts = {
    http: [80, 8080],
    https: [443],
    ws: [80],
    wss: [443],
    ftp: [21],
    gopher: [70],
    file: [],
  };

  protocol = protocol.split(":")[0];
  port = +port;

  if (!port) return false;

  return !excludedPorts[protocol] || !excludedPorts[protocol].includes(port);
}

/**
 * Simple Regex for testing if protocol is https
 */
common.isSSL = isSSL;
/**
 * Copies the right headers from `options` and `req` to
 * `outgoing` which is then used to fire the proxied
 * request.
 *
 * Examples:
 *
 *    common.setupOutgoing(outgoing, options, req)
 *    // => { host: ..., hostname: ...}
 *
 * @param {Object} Outgoing Base object to be filled with required properties
 * @param {Object} Options Config object passed to the proxy
 * @param {ClientRequest} Req Request Object
 * @param {String} Forward String to select forward or target
 *
 * @return {Object} Outgoing Object with all required properties set
 *
 * @api private
 */

common.setupOutgoing = function (outgoing, options, req, forward) {
  outgoing.port = options[forward || "target"].port || (isSSL.test(options[forward || "target"].protocol) ? 443 : 80);
  ["host", "hostname", "socketPath", "pfx", "key", "passphrase", "cert", "ca", "ciphers", "secureProtocol"].forEach(
    (e) => (outgoing[e] = outgoing[e] || options[forward || "target"][e]),
  );

  outgoing.method = options.method || req.method;
  outgoing.headers = Object.assign({}, req.headers);

  if (options.headers) {
    Object.assign(outgoing.headers, options.headers);
  }

  if (options.auth) {
    outgoing.auth = options.auth;
  }

  if (options.ca) {
    outgoing.ca = options.ca;
  }

  if (options.lookup) {
    outgoing.lookup = options.lookup;
  }

  if (isSSL.test(options[forward || "target"].protocol)) {
    // Respect `NODE_TLS_REJECT_UNAUTHORIZED` environment variable (https://nodejs.org/docs/latest/api/cli.html#node_tls_reject_unauthorizedvalue)
    const NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const rejectUnauthorizedEnv = typeof NODE_TLS_REJECT_UNAUTHORIZED !== "undefined" ? NODE_TLS_REJECT_UNAUTHORIZED.toString() : undefined;
    outgoing.rejectUnauthorized = typeof options.secure === "undefined" ? rejectUnauthorizedEnv !== "0" : options.secure;
  }

  outgoing.agent = options.agent || false;
  outgoing.localAddress = options.localAddress;

  //
  // Remark: If we are false and not upgrading, set the connection: close. This is the right thing to do
  // as node core doesn"t handle this COMPLETELY properly yet.
  //
  if (!outgoing.agent) {
    outgoing.headers = outgoing.headers || {};
    if (typeof outgoing.headers.connection !== "string" || !upgradeHeader.test(outgoing.headers.connection)) {
      outgoing.headers.connection = "close";
    }
  }

  // the final path is target path + relative path requested by user:
  const target = options[forward || "target"];
  const targetPath = target && options.prependPath !== false ? target.path || target.pathname || "" : "";

  const urlParts = req.url.split("?");
  const pathToAppend = urlParts?.[0] || "";
  const query = urlParts.slice(1).join("?");
  const outgoingPath = !options.ignorePath ? (!options.toProxy ? pathToAppend + (query ? `?${query}` : "") : req.url) : "";

  if (options.ignorePath === true) {
    console.log("TESTANDO IGNORE PATH");
    console.log(outgoingPath);
    console.log(targetPath);
    console.log(options);
  }
  outgoing.path = common.urlJoin(targetPath, outgoingPath);

  if (options.changeOrigin) {
    outgoing.headers.host =
      isPortRequired(outgoing.port, options[forward || "target"].protocol) && !hasPort(outgoing.host)
        ? outgoing.host + ":" + outgoing.port
        : outgoing.host;
  }
  return outgoing;
};

/**
 * Set the proper configuration for sockets,
 * set no delay and set keep alive, also set
 * the timeout to 0.
 *
 * Examples:
 *
 *    common.setupSocket(socket)
 *    // => Socket
 *
 * @param {Socket} Socket instance to setup
 *
 * @return {Socket} Return the configured socket.
 *
 * @api private
 */

common.setupSocket = function (socket) {
  socket.setTimeout(0);
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 0);

  return socket;
};

/**
 * Get the port number from the host. Or guess it based on the connection type.
 *
 * @param {Request} req Incoming HTTP request.
 *
 * @return {String} The port number.
 *
 * @api private
 */
common.getPort = function (req) {
  const portMatch = req.headers.host && req.headers.host.match(/:(\d+)/);
  return portMatch ? portMatch[1] : common.hasEncryptedConnection(req) ? "443" : "80";
};

/**
 * Check if the request has an encrypted connection.
 *
 * @param {Request} req Incoming HTTP request.
 *
 * @return {Boolean} Whether the connection is encrypted or not.
 *
 * @api private
 */
common.hasEncryptedConnection = function (req) {
  return Boolean(req.connection?.encrypted || req.connection?.pair);
};

/**
 * OS-agnostic join (doesn"t break on URLs like path.join does on Windows)>
 *
 * @return {String} The generated path.
 *
 * @api private
 */

common.urlJoin = function (...args) {
  const lastIndex = args.length - 1;
  const last = args[lastIndex];
  const lastSegs = last.split("?");
  const retSegs = [];

  args[lastIndex] = lastSegs.shift();

  const path = args
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/http:\//g, "http://")
    .replace(/https:\//g, "https://");

  retSegs.push(path);
  retSegs.push(...lastSegs);

  return retSegs.join("?");
};

/**
 * Rewrites or removes the domain of a cookie header
 *
 * @param {String|Array} Header
 * @param {Object} Config, mapping of domain to rewritten domain.
 *                 "*" key to match any domain, null value to remove the domain.
 *
 * @api private
 */
common.rewriteCookieProperty = function rewriteCookieProperty(header, config, property) {
  if (Array.isArray(header)) {
    return header.map((headerElement) => rewriteCookieProperty(headerElement, config, property));
  }

  return header.replace(new RegExp(`(;\\s*${property}=)([^;]+)`, "i"), function (match, prefix, previousValue) {
    let newValue;
    if (previousValue in config) {
      newValue = config[previousValue];
    } else if ("*" in config) {
      newValue = config["*"];
    } else {
      // no match, return previous value
      return match;
    }
    if (newValue) {
      // replace value
      return prefix + newValue;
    } else {
      // remove value
      return "";
    }
  });
};

/**
 * Check the host and see if it potentially has a port in it (keep it simple)
 *
 * @returns {Boolean} Whether we have one or not
 *
 * @api private
 */
function hasPort(host) {
  return !!~host.indexOf(":");
}
