# Deprecated HTTP Clients Fixture

This repository aggregates the legacy HTTP client libraries we warn about.

```js
const request = require("request");
const axios = require("axios");
const http = require("http");
const https = require("https");
```

The code intentionally mixes discouraged patterns so the comparison harness can confirm rule parity across implementations.
