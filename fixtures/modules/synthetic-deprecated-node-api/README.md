# Legacy Node API Harness

This fixture intentionally relies on deprecated Node.js APIs. Do not use this module as a template for new development.

```js
const fs = require("fs");
const data = new Buffer(fs.readFileSync("input.txt"));
```

The accompanying CI workflow continues to run on Node 16 and still references `actions/checkout@v2` to ensure the recommendation rules fire.
