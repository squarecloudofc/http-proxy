/* eslint-disable no-undef */
const httpProxy = require("../lib/http-proxy");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const expect = require("expect.js");
const https = require("node:https");
const http = require("node:http");
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
  describe("HTTPS #createProxyServer", function () {
    describe("HTTPS to HTTP", function () {
      it("should proxy the request en send back the response", function (done) {
        const ports = { source: gen.port, proxy: gen.port };
        const source = http.createServer(function (req, res) {
          expect(req.method).to.eql("GET");
          expect(req.headers.host.split(":")[1]).to.eql(ports.proxy);
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Hello from " + ports.source);
        });

        source.listen(ports.source);

        const proxy = httpProxy
          .createProxyServer({
            target: "http://127.0.0.1:" + ports.source,
            ssl: {
              key: readFileSync(join(__dirname, "fixtures", "agent2-key.pem")),
              cert: readFileSync(join(__dirname, "fixtures", "agent2-cert.pem")),
              ciphers: "AES128-GCM-SHA256",
            },
          })
          .listen(ports.proxy);

        https
          .request(
            {
              host: "localhost",
              port: ports.proxy,
              path: "/",
              method: "GET",
              rejectUnauthorized: false,
            },
            function (res) {
              expect(res.statusCode).to.eql(200);

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
    describe("HTTPS not allow SSL self-signed", function () {
      it("should fail with error", function (done) {
        const ports = { source: gen.port, proxy: gen.port };
        https
          .createServer({
            key: readFileSync(join(__dirname, "fixtures", "agent2-key.pem")),
            cert: readFileSync(join(__dirname, "fixtures", "agent2-cert.pem")),
            ciphers: "AES128-GCM-SHA256",
          })
          .listen(ports.source);

        const proxy = httpProxy.createProxyServer({
          target: "https://127.0.0.1:" + ports.source,
          secure: true,
        });

        proxy.listen(ports.proxy);

        proxy.on("error", function (err, req, res) {
          expect(err).to.be.an(Error);
          expect(err.toString()).to.be("Error: self-signed certificate");
          done();
        });

        http
          .request({
            hostname: "127.0.0.1",
            port: ports.proxy,
            method: "GET",
          })
          .end();
      });
    });
    describe("HTTPS to HTTP using own server", function () {
      it("should proxy the request en send back the response", function (done) {
        const ports = { source: gen.port, proxy: gen.port };
        const source = http.createServer(function (req, res) {
          expect(req.method).to.eql("GET");
          expect(req.headers.host.split(":")[1]).to.eql(ports.proxy);
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Hello from " + ports.source);
        });

        source.listen(ports.source);

        const proxy = httpProxy.createServer({
          agent: new http.Agent({ maxSockets: 2 }),
        });

        const ownServer = https
          .createServer(
            {
              key: readFileSync(join(__dirname, "fixtures", "agent2-key.pem")),
              cert: readFileSync(join(__dirname, "fixtures", "agent2-cert.pem")),
              ciphers: "AES128-GCM-SHA256",
            },
            function (req, res) {
              proxy.web(req, res, {
                target: "http://127.0.0.1:" + ports.source,
              });
            },
          )
          .listen(ports.proxy);

        https
          .request(
            {
              host: "localhost",
              port: ports.proxy,
              path: "/",
              method: "GET",
              rejectUnauthorized: false,
            },
            function (res) {
              expect(res.statusCode).to.eql(200);

              res.on("data", function (data) {
                expect(data.toString()).to.eql("Hello from " + ports.source);
              });

              res.on("end", function () {
                source.close();
                ownServer.close();
                done();
              });
            },
          )
          .end();
      });
    });
  });
});
