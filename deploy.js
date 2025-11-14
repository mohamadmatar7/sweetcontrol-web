const { Client: SSHClient } = require("ssh2");
const SFTPClient = require("ssh2-sftp-client");
const fs = require("fs");

const ssh = new SSHClient();
const sftp = new SFTPClient();

const host = "ssh108.webhosting.be";
const username = "sweetcontrolbe";
const privateKey = fs.readFileSync("C:/Users/moham/.ssh/id_ed25519");
const remotePath = "/data/sites/web/sweetcontrolbe/www";


// ------------------------------
// 1) Create .htaccess inside /out
// ------------------------------
function createHtaccess() {
  const content = `
RewriteEngine On

RewriteRule ^motor/?$ motor.html [L]
RewriteRule ^joystick/?$ joystick.html [L]
RewriteRule ^donate/?$ donate.html [L]
RewriteRule ^graphic/?$ graphic.html [L]

RewriteRule ^$ index.html [L]
RewriteRule (.*)/$ $1.html [L]
  `.trim();

  fs.writeFileSync("./out/.htaccess", content);
  console.log("📄 .htaccess created");
}


// ------------------------------
// 2) Run SSH command
// ------------------------------
async function runSSHCommand(command) {
  return new Promise((resolve, reject) => {
    ssh.exec(command, (err, stream) => {
      if (err) return reject(err);

      stream
        .on("close", () => resolve())
        .on("data", (data) => console.log("SSH:", data.toString()))
        .stderr.on("data", (data) => console.error("SSH ERR:", data.toString()));
    });
  });
}


// ------------------------------
// 3) DEPLOY
// ------------------------------
async function deploy() {
  try {
    console.log("🔨 Building project...");
    require("child_process").execSync("npm run build", { stdio: "inherit" });

    console.log("📄 Creating .htaccess...");
    createHtaccess();

    console.log("🔌 Connecting via SSH...");
    await new Promise((resolve, reject) => {
      ssh
        .on("ready", resolve)
        .on("error", reject)
        .connect({
          host,
          username,
          privateKey,
        });
    });

    console.log("🧨 Removing old files (rm -rf)...");
    await runSSHCommand(`rm -rf ${remotePath}/*`);

    console.log("📡 Connecting via SFTP...");
    await sftp.connect({ host, username, privateKey });

    console.log("⬆️ Uploading build folder (+ .htaccess)...");
    await sftp.uploadDir("./out", remotePath);

    console.log("🎉 Deployment finished successfully!");
  } catch (err) {
    console.error("❌ Deployment failed:", err);
  } finally {
    ssh.end();
    sftp.end();
  }
}

deploy();
