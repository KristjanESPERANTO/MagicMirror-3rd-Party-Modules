/* eslint-disable */
const request = require("request");
const requestPromise = require("request-promise");
const nativeRequest = require("native-request");
const axios = require("axios");
const nodeFetch = require("node-fetch");
const fetch = require("fetch");
const http = require("http");
const https = require("https");

function legacyClients() {
  return [request, requestPromise, nativeRequest, axios, nodeFetch, fetch, http, https];
}

module.exports = { legacyClients };
