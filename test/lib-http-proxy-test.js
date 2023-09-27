/* eslint-disable no-undef */
const httpProxy = require("../lib/http-proxy");
const expect = require("expect.js");
const { randomBytes } = require("crypto");
const http = require("http");
const net = require("net");
const ws = require("ws");
const io = require("socket.io");
const SSE = require("sse");
const ioClient = require("socket.io-client");

//
// Expose a port number generator.
// thanks to @3rd-Eden
//
let initialPort = 1024;
const gen = {};
Object.defineProperty(gen, "port", {
  get: function get() {
    return initialPort++;
  },
});

describe("lib/http-proxy.js", function () {
  describe("#createProxyServer", function () {
    it.skip("should throw without options", function () {
      let error;
      try {
        httpProxy.createProxyServer();
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an(Error);
    });

    it("should return an object otherwise", function () {
      const obj = httpProxy.createProxyServer({
        target: "http://www.google.com:80",
      });

      expect(obj.web).to.be.a(Function);
      expect(obj.ws).to.be.a(Function);
      expect(obj.listen).to.be.a(Function);
    });
  });

  describe("#createProxyServer with forward options and using web-incoming passes", function () {
    it("should pipe the request using web-incoming#stream method", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy
        .createProxyServer({
          forward: "http://127.0.0.1:" + ports.source,
        })
        .listen(ports.proxy);

      const source = http.createServer(function (req) {
        expect(req.method).to.eql("GET");
        expect(req.headers.host.split(":")[1]).to.eql(ports.proxy);
        source.close();
        proxy.close();
        done();
      });

      source.listen(ports.source);
      http.request("http://127.0.0.1:" + ports.proxy, function () {}).end();
    });
  });

  describe("#createProxyServer using the web-incoming passes", function () {
    it("should proxy sse", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy.createProxyServer({
        target: "http://localhost:" + ports.source,
      });
      proxy.listen(ports.proxy);
      const source = http.createServer();
      const sse = new SSE(source, { path: "/" });

      sse.on("connection", function (client) {
        client.send("Hello over SSE");
        client.close();
      });

      source.listen(ports.source);

      const options = {
        hostname: "localhost",
        port: ports.proxy,
      };

      http
        .request(options, function (res) {
          let streamData = "";
          res.on("data", function (chunk) {
            streamData += chunk.toString("utf8");
          });
          res.on("end", function (chunk) {
            expect(streamData).to.equal(":ok\n\ndata: Hello over SSE\n\n");
            source.close();
            proxy.close();
            done();
          });
        })
        .end();
    });

    it("should make the request on pipe and finish it", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy
        .createProxyServer({
          target: "http://127.0.0.1:" + ports.source,
        })
        .listen(ports.proxy);

      const source = http.createServer(function (req) {
        expect(req.method).to.eql("POST");
        expect(req.headers["x-forwarded-for"]).to.eql("127.0.0.1");
        expect(req.headers.host.split(":")[1]).to.eql(ports.proxy);
        source.close();
        proxy.close();
        done();
      });

      source.listen(ports.source);

      http
        .request(
          {
            hostname: "127.0.0.1",
            port: ports.proxy,
            method: "POST",
            headers: {
              "x-forwarded-for": "127.0.0.1",
            },
          },
          function () {},
        )
        .end();
    });
  });

  describe("#createProxyServer using the web-incoming passes", function () {
    it("should make the request, handle response and finish it", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy
        .createProxyServer({
          target: "http://127.0.0.1:" + ports.source,
          preserveHeaderKeyCase: true,
        })
        .listen(ports.proxy);

      const source = http.createServer(function (req, res) {
        expect(req.method).to.eql("GET");
        expect(req.headers.host.split(":")[1]).to.eql(ports.proxy);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Hello from " + source.address().port);
      });

      source.listen(ports.source);

      http
        .request(
          {
            hostname: "127.0.0.1",
            port: ports.proxy,
            method: "GET",
          },
          function (res) {
            expect(res.statusCode).to.eql(200);
            expect(res.headers["content-type"]).to.eql("text/plain");
            if (res.rawHeaders !== undefined) {
              expect(res.rawHeaders.indexOf("Content-Type")).not.to.eql(-1);
              expect(res.rawHeaders.indexOf("text/plain")).not.to.eql(-1);
            }

            res.on("data", function (data) {
              expect(data.toString()).to.eql("Hello from " + ports.source);
            });

            res.on("end", function () {
              source.close();
              proxy.close();
              done();
            });
          },
        )
        .end();
    });
  });

  describe("#createProxyServer() method with error response", function () {
    it("should make the request and emit the error event", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy.createProxyServer({
        target: "http://127.0.0.1:" + ports.source,
      });

      proxy.on("error", function (err) {
        expect(err).to.be.an(Error);
        expect(err.code).to.be("ECONNREFUSED");
        proxy.close();
        done();
      });

      proxy.listen(ports.proxy);

      http
        .request(
          {
            hostname: "127.0.0.1",
            port: ports.proxy,
            method: "GET",
          },
          function () {},
        )
        .end();
    });
  });

  describe("#createProxyServer setting the correct timeout value", function () {
    it("should hang up the socket at the timeout", function (done) {
      this.timeout(30);
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy
        .createProxyServer({
          target: "http://127.0.0.1:" + ports.source,
          timeout: 3,
        })
        .listen(ports.proxy);

      proxy.on("error", function (e) {
        expect(e).to.be.an(Error);
        expect(e.code).to.be.eql("ECONNRESET");
      });

      const source = http.createServer(function (req, res) {
        setTimeout(function () {
          res.end("At this point the socket should be closed");
        }, 5);
      });

      source.listen(ports.source);

      const testReq = http.request(
        {
          hostname: "127.0.0.1",
          port: ports.proxy,
          method: "GET",
        },
        function () {},
      );

      testReq.on("error", function (e) {
        expect(e).to.be.an(Error);
        expect(e.code).to.be.eql("ECONNRESET");
        proxy.close();
        source.close();
        done();
      });

      testReq.end();
    });
  });

  describe("#createProxyServer with xfwd option", function () {
    it("should not throw on empty http host header", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy
        .createProxyServer({
          forward: "http://127.0.0.1:" + ports.source,
          xfwd: true,
        })
        .listen(ports.proxy);

      const source = http.createServer(function (req, res) {
        expect(req.method).to.eql("GET");
        expect(req.headers.host.split(":")[1]).to.eql(ports.source);
        source.close();
        proxy.close();
        done();
      });

      source.listen(ports.source);

      const socket = net.connect({ port: ports.proxy }, () => socket.write("GET / HTTP/1.0\r\n\r\n"));

      // handle errors
      socket.on("data", () => socket.end());
      socket.on("error", () => expect.fail("Unexpected socket error"));
      socket.on("end", () => expect("Socket to finish").to.be.ok());
    });
  });
  describe("#createProxyServer using the ws-incoming passes", function () {
    it("should proxy the websockets stream", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy.createProxyServer({
        target: "ws://127.0.0.1:" + ports.source,
        ws: true,
      });
      const proxyServer = proxy.listen(ports.proxy);
      const destiny = new ws.Server({ port: ports.source }, function () {
        const client = new ws("ws://127.0.0.1:" + ports.proxy);

        client.on("open", function () {
          client.send("hello there");
        });

        client.on("message", function (msg) {
          expect(msg.toString()).to.be("Hello over websockets");
          client.close();
          proxyServer.close();
          destiny.close();
          done();
        });
      });

      destiny.on("connection", function (socket) {
        socket.on("message", function (msg) {
          expect(msg.toString()).to.be("hello there");
          socket.send("Hello over websockets");
        });
      });
    });

    it("should emit error on proxy error", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy.createProxyServer({
        // note: we don"t ever listen on this port
        target: "ws://127.0.0.1:" + ports.source,
        ws: true,
      });
      const proxyServer = proxy.listen(ports.proxy);
      const client = new ws("ws://127.0.0.1:" + ports.proxy);

      client.on("open", function () {
        client.send("hello there");
      });

      let count = 0;
      function maybeDone() {
        count += 1;
        if (count === 2) done();
      }

      client.on("error", function (err) {
        expect(err).to.be.an(Error);
        expect(err.code).to.be("ECONNRESET");
        maybeDone();
      });

      proxy.on("error", function (err) {
        expect(err).to.be.an(Error);
        expect(err.code).to.be("ECONNREFUSED");
        proxyServer.close();
        maybeDone();
      });
    });

    it("should close client socket if upstream is closed before upgrade", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const server = http.createServer();
      server.on("upgrade", function (req, socket, head) {
        const response = ["HTTP/1.1 404 Not Found", "Content-type: text/html", "", ""];
        socket.write(response.join("\r\n"));
        socket.end();
      });
      server.listen(ports.source);

      const proxy = httpProxy.createProxyServer({
        // note: we don"t ever listen on this port
        target: "ws://127.0.0.1:" + ports.source,
        ws: true,
      });
      const proxyServer = proxy.listen(ports.proxy);
      const client = new ws("ws://127.0.0.1:" + ports.proxy);

      client.on("open", function () {
        client.send("hello there");
      });

      client.on("error", function (err) {
        expect(err).to.be.an(Error);
        proxyServer.close();
        done();
      });
    });

    it("should proxy a socket.io stream", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy.createProxyServer({
        target: "ws://127.0.0.1:" + ports.source,
        ws: true,
      });
      const proxyServer = proxy.listen(ports.proxy);
      const server = http.createServer();
      const destiny = new io.Server(server);

      function startSocketIo() {
        const client = ioClient.connect("ws://127.0.0.1:" + ports.proxy);

        client.on("connect", function () {
          client.emit("incoming", "hello there");
        });

        client.on("outgoing", function (data) {
          expect(data).to.be("Hello over websockets");
          proxyServer.close();
          server.close();
          done();
        });
      }
      server.listen(ports.source);
      server.on("listening", startSocketIo);

      destiny.sockets.on("connection", function (socket) {
        socket.on("incoming", function (msg) {
          expect(msg).to.be("hello there");
          socket.emit("outgoing", "Hello over websockets");
        });
      });
    });

    it("should emit open and close events when socket.io client connects and disconnects", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy.createProxyServer({
        target: "ws://127.0.0.1:" + ports.source,
        ws: true,
      });
      const proxyServer = proxy.listen(ports.proxy);
      const server = http.createServer();
      const destiny = new io.Server(server);

      function startSocketIo() {
        const client = ioClient.connect("ws://127.0.0.1:" + ports.proxy, {
          rejectUnauthorized: null,
        });
        client.on("connect", client.disconnect);
      }
      let count = 0;

      proxyServer.on("open", function () {
        count += 1;
      });

      proxyServer.on("close", function () {
        proxyServer.close();
        server.close();
        destiny.close();
        if (count === 1) {
          done();
        }
      });

      server.listen(ports.source);
      server.on("listening", startSocketIo);
    });

    it("should pass all set-cookie headers to client", function (done) {
      const ports = { source: gen.port, proxy: gen.port };
      const proxy = httpProxy.createProxyServer({
        target: "ws://127.0.0.1:" + ports.source,
        ws: true,
      });
      proxy.listen(ports.proxy);
      const destiny = new ws.Server({ port: ports.source }, function () {
        const key = randomBytes(16).toString("base64");

        const requestOptions = {
          port: ports.proxy,
          host: "127.0.0.1",
          headers: {
            Connection: "Upgrade",
            Upgrade: "websocket",
            Host: "ws://127.0.0.1",
            "Sec-WebSocket-Version": 13,
            "Sec-WebSocket-Key": key,
          },
        };

        const req = http.request(requestOptions);

        req.on("upgrade", function (res, socket, upgradeHead) {
          expect(res.headers["set-cookie"].length).to.be(2);
          done();
        });

        req.end();
      });

      destiny.on("headers", function (headers) {
        headers.push("Set-Cookie: test1=test1");
        headers.push("Set-Cookie: test2=test2");
      });
    });

    it("should detect a proxyReq event and modify headers", function (done) {
      const ports = { source: gen.port, proxy: gen.port };

      const proxy = httpProxy.createProxyServer({
        target: "ws://127.0.0.1:" + ports.source,
        ws: true,
      });

      proxy.on("proxyReqWs", function (proxyReq, req, socket, options, head) {
        proxyReq.setHeader("X-Special-Proxy-Header", "foobar");
      });

      const proxyServer = proxy.listen(ports.proxy);

      const destiny = new ws.Server({ port: ports.source }, function () {
        const client = new ws("ws://127.0.0.1:" + ports.proxy);

        client.on("open", () => client.send("hello there"));

        client.on("message", function (msg) {
          expect(msg.toString()).to.be("Hello over websockets");
          client.close();
          proxyServer.close();
          destiny.close();
          done();
        });
      });

      destiny.on("connection", function (socket, upgradeReq) {
        expect(upgradeReq.headers["x-special-proxy-header"]).to.eql("foobar");

        socket.on("message", function (msg) {
          expect(msg.toString()).to.be("hello there");
          socket.send("Hello over websockets");
        });
      });
    });
  });
});
