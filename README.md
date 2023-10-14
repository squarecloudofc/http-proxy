# @squarecloud/http-proxy

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]

A Full-Featured HTTP and WebSocket Proxy for Node.js forked from [http-party/node-http-proxy](https://github.com/http-party/node-http-proxy).

This fork adds the following features:

- Dependencies updates & security fixes.
- Websocket close before response fixed.
- Add support for Lookup option. Remove old followRedirects option.
- Support for modifying content of websocket streams.
- Respect NODE_TLS_REJECT_UNAUTHORIZED environment variable.
- Fix for issues when using an Agent, fix the type error when req.socket is undefined.
- Fixed bug when http:/ isn't replaced with: http://
- Fixed X-Forwarded-\* not capitalized.

Inspired by the project [Ambassify project](https://github.com/ambassify/node-http-proxy).

## Usage

Install package:

```sh
# npm
npm install @squarecloud/http-proxy

# yarn
yarn add @squarecloud/http-proxy

# pnpm
pnpm install @squarecloud/http-proxy

# bun
bun install @squarecloud/http-proxy
```

Create proxy:

```js
const { createServer } = require("node:http");
const { createProxyServer } = require("@squarecloud/http-proxy");

const proxy = createProxyServer({});
const target = "http://example.com"; /* address of your proxy server here */

const server = createServer(async (req, res) => {
    try {
        await proxy.web(req, res, { target });
    } catch (error) {
        console.error(error);
        res.statusCode = 500;
        res.end("Proxy error: " + error.toString());
    }
});

server.listen(80, () => console.log("Proxy is listening on http://localhost"));
```

Example with WebSocket:

```js
const { createServer } = require("node:http");
const { createProxyServer } = require("@squarecloud/http-proxy");

const proxy = createProxyServer({ ws: true });
const target = "ws://example.com"; /* address of your proxy server here */

const server = createServer(async (req, res) => { /* ... */ });

server.on("upgrade", async (req, socket, head) => {
    try {
        // use proxy.ws() instead of proxy.web() for proxying WebSocket requests.
        await proxy.ws(req, socket, head, { target });
    } catch (error) {
        console.error(error);
        socket.end();
    }
});

server.listen(80, () => console.log("Proxy is listening on http://localhost"));
```

Some options:

```js
// Options most used in the proxy configuration:
// * ws     : <true/false, if you want to proxy websockets>
// * xfwd   : <true/false, adds X-Forward headers>
// * secure : <true/false, verify SSL certificate>
// * prependPath: <true/false, Default: true - specify whether you want to prepend the target"s path to the proxy path>
// * ignorePath: <true/false, Default: false - specify whether you want to ignore the proxy path of the incoming request>
// * proxyTimeoutCustomError: true/false, default: false - specify whether you want to throw a custom `ETIMEDOUT` error when the `proxyTimeout` is reached. If false then the default `ECONNRESET` error will be thrown.
```

Checkout [http-party/node-http-proxy](https://github.com/http-party/node-http-proxy#options) for more options and examples.

## Development

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Install dependencies using `npm install`
- Run interactive tests using `npm run test`

## License

Published under [MIT License](./LICENSE).

Made with 💙 & Supported by [Square Cloud | A hosting company](https://squarecloud.app).

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@squarecloud/http-proxy?style=flat&colorA=18181B&colorB=2563eb
[npm-version-href]: https://npmjs.com/package/@squarecloud/http-proxy
[npm-downloads-src]: https://img.shields.io/npm/dm/@squarecloud/http-proxy?style=flat&colorA=18181B&colorB=2563eb
[npm-downloads-href]: https://npmjs.com/package/@squarecloud/http-proxy
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@squarecloud/http-proxy?style=flat&colorA=18181B&colorB=2563eb
[bundle-href]: https://bundlephobia.com/result?p=@squarecloud/http-proxy
