const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;
const functionsDir = path.join(__dirname, "functions"); // Thư mục chứa các function

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
        .status(result.statusCode)
        .set(result.headers || {})
        .send(result.body);
    } catch (err) {
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  };
}

// Load tất cả file .js trong thư mục functions
fs.readdirSync(functionsDir).forEach((file) => {
  if (file.endsWith(".js")) {
    const route = "/" + file.replace(".js", "");
    const handlerModule = require(path.join(functionsDir, file));
    if (handlerModule.handler) {
      console.log(`Route mounted: ${route}`);
      app.all(route, netlifyWrapper(handlerModule.handler));
    }
  }
});

app.listen(port, () => {
  console.log(
    `Netlify-style function server running at http://localhost:${port}`
  );
});
