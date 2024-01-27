// Use explicit /index.js to help browserify negociation in require "/lib/http-proxy" (!)
const { Server: ProxyServer } = require("./http-proxy/index.js");
/**
 * Creates the proxy server.
 *
 * Examples:
 *
 *    httpProxy.createProxyServer({ .. }, 8000)
 *    // => "{ web: [Function], ws: [Function] ... }"
 *
 * @param {Object} Options Config object passed to the proxy
 * @return {Object} Proxy Proxy object with handlers for `ws` and `web` requests
 * @public
 */

function createProxyServer(options) {
  return new ProxyServer(options);
}

ProxyServer.createProxyServer = createProxyServer;
ProxyServer.createServer = createProxyServer;
ProxyServer.createProxy = createProxyServer;

/**
 * Export the proxy "Server" as the main export.
 */
module.exports = ProxyServer;
