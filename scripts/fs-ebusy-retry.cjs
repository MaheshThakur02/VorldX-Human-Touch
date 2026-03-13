"use strict";

const fs = require("node:fs");
const { setTimeout: sleep } = require("node:timers/promises");

if (!global.__VORLDX_FS_EBUSY_RETRY_PATCHED__) {
  global.__VORLDX_FS_EBUSY_RETRY_PATCHED__ = true;

  const RETRY_CODES = new Set(["EBUSY", "EPERM"]);
  const PATH_HINTS = [
    "\\.next\\",
    "\\.next-local-cache\\",
    "\\vorldx-next-cache\\",
    "/.next/",
    "/.next-local-cache/",
    "/vorldx-next-cache/"
  ];
  const MAX_RETRIES = parsePositiveInt(process.env.NEXT_FS_RETRY_MAX, 12);
  const RETRY_DELAY_MS = parsePositiveInt(process.env.NEXT_FS_RETRY_DELAY_MS, 30);

  function parsePositiveInt(raw, fallback) {
    const value = Number.parseInt(raw || "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function shouldRetry(error, targetPath) {
    if (!error || !RETRY_CODES.has(error.code)) {
      return false;
    }

    if (typeof targetPath !== "string" || targetPath.length === 0) {
      return true;
    }

    const normalizedPath = targetPath.toLowerCase();
    return PATH_HINTS.some((hint) => normalizedPath.includes(hint));
  }

  async function withRetryAsync(targetPath, operation) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!shouldRetry(error, targetPath) || attempt >= MAX_RETRIES) {
          throw error;
        }
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  function withRetryCallback(targetPath, operation, callback) {
    let attempt = 0;
    const run = () => {
      operation((error, ...result) => {
        if (shouldRetry(error, targetPath) && attempt < MAX_RETRIES) {
          attempt += 1;
          setTimeout(run, RETRY_DELAY_MS * attempt);
          return;
        }
        callback(error, ...result);
      });
    };
    run();
  }

  const originalFsPromises = fs.promises;
  const originalOpen = fs.open.bind(fs);
  const originalReadFile = fs.readFile.bind(fs);
  const originalWriteFile = fs.writeFile.bind(fs);
  const originalAppendFile = fs.appendFile.bind(fs);

  if (typeof originalFsPromises.open === "function") {
    const openPromise = originalFsPromises.open.bind(originalFsPromises);
    originalFsPromises.open = (...args) => withRetryAsync(args[0], () => openPromise(...args));
  }

  if (typeof originalFsPromises.readFile === "function") {
    const readFilePromise = originalFsPromises.readFile.bind(originalFsPromises);
    originalFsPromises.readFile = (...args) =>
      withRetryAsync(args[0], () => readFilePromise(...args));
  }

  if (typeof originalFsPromises.writeFile === "function") {
    const writeFilePromise = originalFsPromises.writeFile.bind(originalFsPromises);
    originalFsPromises.writeFile = (...args) =>
      withRetryAsync(args[0], () => writeFilePromise(...args));
  }

  if (typeof originalFsPromises.appendFile === "function") {
    const appendFilePromise = originalFsPromises.appendFile.bind(originalFsPromises);
    originalFsPromises.appendFile = (...args) =>
      withRetryAsync(args[0], () => appendFilePromise(...args));
  }

  fs.open = (path, flags, mode, callback) => {
    if (typeof mode === "function") {
      callback = mode;
      mode = undefined;
    }
    if (typeof callback !== "function") {
      if (typeof mode === "undefined") {
        return originalOpen(path, flags);
      }
      return originalOpen(path, flags, mode);
    }
    return withRetryCallback(
      path,
      (done) =>
        typeof mode === "undefined"
          ? originalOpen(path, flags, done)
          : originalOpen(path, flags, mode, done),
      callback
    );
  };

  fs.readFile = (path, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (typeof callback !== "function") {
      return typeof options === "undefined"
        ? originalReadFile(path)
        : originalReadFile(path, options);
    }
    return withRetryCallback(
      path,
      (done) =>
        typeof options === "undefined"
          ? originalReadFile(path, done)
          : originalReadFile(path, options, done),
      callback
    );
  };

  fs.writeFile = (path, data, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (typeof callback !== "function") {
      return typeof options === "undefined"
        ? originalWriteFile(path, data)
        : originalWriteFile(path, data, options);
    }
    return withRetryCallback(
      path,
      (done) =>
        typeof options === "undefined"
          ? originalWriteFile(path, data, done)
          : originalWriteFile(path, data, options, done),
      callback
    );
  };

  fs.appendFile = (path, data, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    if (typeof callback !== "function") {
      return typeof options === "undefined"
        ? originalAppendFile(path, data)
        : originalAppendFile(path, data, options);
    }
    return withRetryCallback(
      path,
      (done) =>
        typeof options === "undefined"
          ? originalAppendFile(path, data, done)
          : originalAppendFile(path, data, options, done),
      callback
    );
  };
}
