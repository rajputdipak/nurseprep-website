const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const ts = require(path.join(root, "node_modules/typescript"));
const assert = require("node:assert/strict");

const tests = [];
const hooks = { afterEach: [] };

function test(name, fn) {
  tests.push({ name, fn });
}

function afterEach(fn) {
  hooks.afterEach.push(fn);
}

const jar = new Map();
const cookieMock = {
  cookies: () => ({
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name, value) => {
      jar.set(name, value);
    },
    delete: (name) => {
      jar.delete(name);
    },
  }),
};

const nextServerMock = {
  NextResponse: {
    json: (body, init) =>
      new Response(JSON.stringify(body), {
        status: (init && init.status) || 200,
        headers: (init && init.headers) || {},
      }),
    next: () => new Response(null, { status: 200 }),
    redirect: (url) =>
      new Response(null, { status: 307, headers: { location: String(url) } }),
  },
};

const moduleCache = new Map();

function resolveRelative(name) {
  if (!name.startsWith("@/")) return null;
  const base = name.slice(2);
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (fs.existsSync(path.join(root, candidate))) return candidate;
  }
  throw new Error(`Cannot resolve module: ${name}`);
}

function resolveFile(base) {
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base];
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (fs.existsSync(path.join(root, candidate)) && fs.statSync(path.join(root, candidate)).isFile()) {
      return candidate;
    }
  }
  return null;
}

function load(relative) {
  if (moduleCache.has(relative)) return moduleCache.get(relative);
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(relative, module.exports);
  const customRequire = (name) => {
    if (name === "crypto" || name === "node:crypto") return require("node:crypto");
    if (name === "path" || name === "node:path") return require("node:path");
    if (name === "next/headers") return cookieMock;
    if (name === "next/server") return nextServerMock;
    if (name.startsWith("./") || name.startsWith("../")) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(relative), name));
      const resolved = resolveFile(base);
      if (resolved) return load(resolved);
    }
    const resolved = resolveRelative(name);
    if (resolved) return load(resolved);
    throw new Error(`Unexpected dependency: ${name} (from ${relative})`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(
    customRequire,
    module,
    module.exports
  );
  moduleCache.set(relative, module.exports);
  return module.exports;
}

function createSupabase(overrides = {}) {
  const calls = [];
  const pick = (key, fallback) => (key in overrides ? overrides[key] : fallback);
  const client = {
    auth: {
      signInWithPassword: async (args) => {
        calls.push({ method: "signInWithPassword", args });
        return pick("signInWithPassword", { data: { user: { id: "user-1" } }, error: null });
      },
      signInWithOtp: async (args) => {
        calls.push({ method: "signInWithOtp", args });
        return pick("signInWithOtp", { error: null });
      },
      signOut: async (args) => {
        calls.push({ method: "signOut", args });
        return pick("signOut", { error: null });
      },
      verifyOtp: async (args) => {
        calls.push({ method: "verifyOtp", args });
        return pick("verifyOtp", { data: { user: { id: "user-1" } }, error: null });
      },
      updateUser: async (args) => {
        calls.push({ method: "updateUser", args });
        return pick("updateUser", { error: null });
      },
      reauthenticate: async () => {
        calls.push({ method: "reauthenticate" });
        return pick("reauthenticate", { error: null });
      },
      getUser: async () => {
        calls.push({ method: "getUser" });
        return pick("getUser", { data: { user: { id: "user-1", email: "student@example.com" } } });
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => pick("profile", { data: { role: "user" }, error: null }),
          maybeSingle: async () => pick("profile", { data: { role: "user" }, error: null }),
        }),
      }),
    }),
  };
  return { client, calls };
}

function loadRoute(relative, supabase) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const customRequire = (name) => {
    if (name === "crypto" || name === "node:crypto") return require("node:crypto");
    if (name === "path" || name === "node:path") return require("node:path");
    if (name === "next/headers") return cookieMock;
    if (name === "next/server") return nextServerMock;
    if (name === "@/lib/supabase/server") return { createClient: () => supabase.client };
    if (name.startsWith("./") || name.startsWith("../")) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(relative), name));
      const resolved = resolveFile(base);
      if (resolved) return load(resolved);
    }
    const resolved = resolveRelative(name);
    if (resolved) return load(resolved);
    throw new Error(`Unexpected dependency: ${name} (from ${relative})`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(
    customRequire,
    module,
    module.exports
  );
  return module.exports;
}

function makeRequest(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function resetCookies() {
  jar.clear();
}

async function run(filter) {
  const selected = filter
    ? tests.filter((entry) => entry.name.includes(filter))
    : tests;
  let passed = 0;
  const failures = [];
  for (let i = 0; i < selected.length; i += 1) {
    const entry = selected[i];
    try {
      await entry.fn();
      passed += 1;
      console.log(`PASS ${String(i + 1).padStart(3, " ")}. ${entry.name}`);
    } catch (error) {
      failures.push({ name: entry.name, error });
      console.log(`FAIL ${String(i + 1).padStart(3, " ")}. ${entry.name}`);
      console.log(`     ${String(error && error.message ? error.message : error).split("\n")[0]}`);
      if (error && error.stack) {
        console.log(
          error.stack
            .split("\n")
            .slice(1, 4)
            .map((line) => `     ${line.trim()}`)
            .join("\n")
        );
      }
    } finally {
      for (let h = 0; h < hooks.afterEach.length; h += 1) {
        try {
          hooks.afterEach[h]();
        } catch {
          // reset hooks must never mask the test result
        }
      }
    }
  }
  console.log("");
  console.log(`${passed}/${selected.length} security tests passed`);
  if (failures.length) {
    console.log("");
    console.log("Failed:");
    failures.forEach((failure) => console.log(` - ${failure.name}`));
    process.exitCode = 1;
  }
  return failures.length === 0;
}

module.exports = {
  assert,
  root,
  test,
  afterEach,
  load,
  loadRoute,
  createSupabase,
  makeRequest,
  resetCookies,
  run,
};
