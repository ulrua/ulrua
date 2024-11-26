import pkg from '@mercuryworkshop/bare-mux/node';
import express from "express";
import { createServer } from "node:http";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { join } from "node:path";
import { hostname } from "node:os";
import { fileURLToPath } from "url";
import packageJson from './package.json' assert { type: 'json' };

// Enable debugging based on environment variable
const DEBUG = process.env.DEBUG === "true";

// Static public path
const publicPath = fileURLToPath(new URL("./public/", import.meta.url));

// Initialize BareMux correctly based on the export structure
const BareMux = pkg.BareMux;
const bareMux = BareMux ? new BareMux({ path: "/baremux/", bareServer: bare }) : null;

// Initialize Express app
const app = express();

// Serve static files
app.use(express.static(publicPath));
app.use("/uv/", express.static(uvPath));

// Default 404 handler
app.use((req, res) => {
  log("404 error for:", req.url);
  res.status(404);
  res.sendFile(join(publicPath, "404.html"));
});

// HTTP server
const server = createServer();

// Handle requests with BareMux or Express
server.on("request", (req, res) => {
  if (bareMux && bareMux.shouldRoute(req)) {
    log("Routing request through BareMux:", req.url);
    bareMux.routeRequest(req, res); // Route via BareMux
  } else {
    log("Routing request through Express:", req.url);
    app(req, res); // Route via Express
  }
});

// Handle WebSocket upgrade requests
server.on("upgrade", (req, socket, head) => {
  if (bareMux && bareMux.shouldRoute(req)) {
    log("Routing upgrade request through BareMux:", req.url);
    bareMux.routeUpgrade(req, socket, head); // Route WebSocket upgrade via BareMux
  } else {
    log("Upgrade request not handled, closing socket:", req.url);
    socket.end(); // Close socket if not handled
  }
});

// Set server port
let port = parseInt(process.env.PORT || "3000");

if (isNaN(port)) {
  port = 3000; // Default to port 3000 if not set
}

// Start server and log status
server.on("listening", () => {
  const address = server.address();
  log("Server listening on:", address);

  console.log("Listening on:");
  console.log(`\thttp://localhost:${address.port}`);
  console.log(`\thttp://${hostname()}:${address.port}`);
  console.log(
    `\thttp://${
      address.family === "IPv6" ? `[${address.address}]` : address.address
    }:${address.port}`
  );
});

// Graceful shutdown
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    log("Server closed successfully.");
    if (bareMux) {
      bareMux.close(() => {
        log("BareMux closed.");
        process.exit(0);
      });
    } else {
      process.exit(0); // Exit if BareMux is not initialized
    }
  });
}

server.listen({ port });

// Utility for debugging
function log(...args) {
  if (DEBUG) {
    console.log("[DEBUG]", ...args);
  }
}
