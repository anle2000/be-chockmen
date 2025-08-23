const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;

// 👉 Sửa lại đúng thư mục chứa functions kiểu Netlify
const functionsDir = path.join(__dirname, "netlify/functions");

app.use(express.json());

// Middleware giả lập Netlify event
function netlifyWrapper(handler) {
  return async (req, res) => {
    const event = {
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      body: req.body ? JSON.stringify(req.body) : undefined,
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

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(functionsDir)) {
  console.error(`❌ Directory not found: ${functionsDir}`);
  process.exit(1);
}

// Load tất cả file .js trong thư mục netlify/functions
fs.readdirSync(functionsDir).forEach((file) => {
  if (file.endsWith(".js")) {
    const route = "/" + file.replace(/\.js$/, "");
    const handlerPath = path.join(functionsDir, file);

    try {
      const handlerModule = require(handlerPath);
      if (typeof handlerModule.handler === "function") {
        console.log(`✅ Route mounted: ${route}`);
        app.all(route, netlifyWrapper(handlerModule.handler));
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
