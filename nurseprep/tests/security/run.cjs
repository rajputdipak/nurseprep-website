const { run } = require("./harness.cjs");

require("./01-auth.cjs");
require("./02-zero-trust.cjs");
require("./03-session.cjs");
require("./04-rbac.cjs");
require("./05-input.cjs");
require("./06-business.cjs");
require("./07-uploads.cjs");
require("./08-audit.cjs");

run(process.argv[2]).then((ok) => {
  process.exitCode = ok ? 0 : 1;
});
