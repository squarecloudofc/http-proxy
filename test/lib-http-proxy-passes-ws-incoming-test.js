/* eslint-disable no-undef */
const httpProxy = require("../lib/http-proxy/passes/ws-incoming");
const expect = require("expect.js");

describe("lib/http-proxy/passes/ws-incoming.js", () => {
  describe("#checkMethodAndHeader", () => {
    it("should drop non-GET connections", () => {
      let destroyCalled = false;
      const stubRequest = {
        method: "DELETE",
        headers: {},
      };
      const stubSocket = {
        destroy: () => {
          // Simulate Socket.destroy() method when call
          destroyCalled = true;
        },
      };
      returnValue = httpProxy.checkMethodAndHeader(stubRequest, stubSocket);
      expect(returnValue).to.be(true);
      expect(destroyCalled).to.be(true);
    });

    it("should drop connections when no upgrade header", () => {
      let destroyCalled = false;
      const stubRequest = {
        method: "GET",
        headers: {},
      };
      const stubSocket = {
        destroy: () => {
          // Simulate Socket.destroy() method when call
          destroyCalled = true;
        },
      };
      returnValue = httpProxy.checkMethodAndHeader(stubRequest, stubSocket);
      expect(returnValue).to.be(true);
      expect(destroyCalled).to.be(true);
    });

    it("should drop connections when upgrade header is different of `websocket`", () => {
      let destroyCalled = false;
      const stubRequest = {
        method: "GET",
        headers: {
          upgrade: "anotherprotocol",
        },
      };
      const stubSocket = {
        destroy: () => {
          // Simulate Socket.destroy() method when call
          destroyCalled = true;
        },
      };
      returnValue = httpProxy.checkMethodAndHeader(stubRequest, stubSocket);
      expect(returnValue).to.be(true);
      expect(destroyCalled).to.be(true);
    });

    it("should return nothing when all is ok", () => {
      let destroyCalled = false;
      const stubRequest = {
        method: "GET",
        headers: {
          upgrade: "websocket",
        },
      };
      const stubSocket = {
        destroy: () => {
          // Simulate Socket.destroy() method when call
          destroyCalled = true;
        },
      };
      returnValue = httpProxy.checkMethodAndHeader(stubRequest, stubSocket);
      expect(returnValue).to.be(undefined);
      expect(destroyCalled).to.be(false);
    });
  });

  describe("#XHeaders", () => {
    it("return if no forward request", () => {
      const returnValue = httpProxy.XHeaders({}, {}, {});
      expect(returnValue).to.be(undefined);
    });

    it("set the correct X-Forwarded-* headers from req.connection", () => {
      const stubRequest = {
        connection: {
          remoteAddress: "192.168.1.2",
          remotePort: "8080",
        },
        headers: {
          host: "192.168.1.2:8080",
        },
      };
      httpProxy.XHeaders(stubRequest, {}, { xfwd: true });
      expect(stubRequest.headers["X-Forwarded-For"]).to.be("192.168.1.2");
      expect(stubRequest.headers["X-Forwarded-Port"]).to.be(8080);
      expect(stubRequest.headers["X-Forwarded-Proto"]).to.be("ws");
    });

    it("set the correct X-Forwarded-* headers from req.socket", () => {
      const stubRequest = {
        socket: {
          remoteAddress: "192.168.1.3",
          remotePort: "8181",
        },
        connection: {
          pair: true,
        },
        headers: {
          host: "192.168.1.3:8181",
        },
      };
      httpProxy.XHeaders(stubRequest, {}, { xfwd: true });
      expect(stubRequest.headers["X-Forwarded-For"]).to.be("192.168.1.3");
      expect(stubRequest.headers["X-Forwarded-Port"]).to.be(8181);
      expect(stubRequest.headers["X-Forwarded-Proto"]).to.be("wss");
    });
  });
});
