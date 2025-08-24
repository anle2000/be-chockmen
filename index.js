const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;

// 👉 Thư mục chứa các function kiểu Netlify
const functionsDir = path.join(__dirname, "netlify/functions");

app.use(express.json());

// Middleware giả lập Netlify Lambda-style event
function netlifyWrapper(handler) {
  return async (req, res) => {
    const isBodyMethod = !["GET", "HEAD"].includes(req.method);
    const event = {
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      body: isBodyMethod && req.body ? JSON.stringify(req.body) : undefined,
      queryStringParameters: req.query,
    };

    try {
      const result = await handler(event, {});
      res
        .status(result.statusCode || 200)
        .set(result.headers || {})
        .send(result.body || "");
    } catch (err) {
      console.error(`[ERROR] In function for ${req.path}:`, err);
      res.status(500).send("Internal Server Error");
    }
  };
}

// Kiểm tra thư mục tồn tại
if (!fs.existsSync(functionsDir)) {
  console.error(`❌ Directory not found: ${functionsDir}`);
  process.exit(1);
}

// Mount các function trong thư mục netlify/functions
fs.readdirSync(functionsDir).forEach((file) => {
  if (file.endsWith(".js")) {
    const functionName = file.replace(/\.js$/, "");
    const route = `/api/chockmen/${functionName}`;
    const handlerPath = path.join(functionsDir, file);

    try {
      const handlerModule = require(handlerPath);
      if (typeof handlerModule.handler === "function") {
        app.all(route, netlifyWrapper(handlerModule.handler));
        console.log(`✅ Route mounted: ${route}`);
      } else {
        console.warn(`⚠️  No valid 'handler' export in: ${file}`);
      }
    } catch (err) {
      console.error(`❌ Error loading function: ${file}`, err);
    }
  }
});

app.listen(port, () => {
  console.log(
    `🚀 Netlify-style function server running at http://localhost:${port}`
  );
});
