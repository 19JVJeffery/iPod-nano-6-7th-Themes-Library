#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const http = require("http");
const https = require("https");

const repoRoot = path.resolve(__dirname, "..");
const themesPath = path.join(repoRoot, "themes.json");
const ipswDir = path.join(repoRoot, "ipsw");

const requiredArgs = ["issue", "theme-name", "author-name", "device", "description", "preview-image", "ipsw-url"];
const readArg = (key) => {
  const flag = `--${key}`;
  const index = process.argv.indexOf(flag);
  if (index === -1 || !process.argv[index + 1]) return "";
  return process.argv[index + 1];
};

const args = {
  issue: readArg("issue"),
  themeName: readArg("theme-name"),
  authorName: readArg("author-name"),
  device: readArg("device"),
  release: readArg("release") || "Community Submission",
  description: readArg("description"),
  previewImage: readArg("preview-image"),
  tags: readArg("tags"),
  ipswUrl: readArg("ipsw-url")
};

for (const key of requiredArgs) {
  if (!readArg(key)) {
    console.error(`Missing required argument --${key}`);
    process.exit(1);
  }
}

const sanitizeName = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

const downloadWithRedirects = async (url, destination, redirects = 0) => {
  if (redirects > 5) throw new Error("Too many redirects while downloading IPSW");
  const client = url.startsWith("https://") ? https : http;

  await new Promise((resolve, reject) => {
    const request = client.get(url, (response) => {
      const location = response.headers.location;
      if (location && response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        const redirectedUrl = new URL(location, url).toString();
        downloadWithRedirects(redirectedUrl, destination, redirects + 1).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download IPSW (${response.statusCode})`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });
    request.on("error", reject);
  });
};

const main = async () => {
  const ext = path.extname(new URL(args.ipswUrl).pathname || "").toLowerCase();
  if (ext && ext !== ".ipsw") {
    throw new Error("Provided IPSW URL path does not end in .ipsw");
  }

  await fsp.mkdir(ipswDir, { recursive: true });
  const slug = sanitizeName(`${args.themeName}-${args.device}-issue-${args.issue}`);
  const fileName = `${slug || `issue-${args.issue}`}.ipsw`;
  const filePath = path.join(ipswDir, fileName);
  console.log(`Downloading IPSW to ${path.relative(repoRoot, filePath)} ...`);
  await downloadWithRedirects(args.ipswUrl, filePath);

  const rawThemes = await fsp.readFile(themesPath, "utf8");
  const themes = JSON.parse(rawThemes);
  const newTheme = {
    name: args.themeName,
    author: { name: args.authorName },
    device: args.device,
    release: args.release,
    description: args.description,
    tags: args.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    previewImage: args.previewImage,
    ipswPath: `ipsw/${fileName}`,
    submissionIssue: Number(args.issue)
  };

  const duplicate = themes.some((theme) => theme.ipswPath === newTheme.ipswPath || theme.name === newTheme.name);
  if (duplicate) {
    throw new Error("Theme appears to already exist in themes.json");
  }

  themes.unshift(newTheme);
  await fsp.writeFile(themesPath, `${JSON.stringify(themes, null, 2)}\n`, "utf8");

  console.log("Imported submission successfully.");
  console.log("Next commands:");
  console.log(`  git add ${JSON.stringify(`ipsw/${fileName}`)} themes.json`);
  console.log(`  git commit -m "Approve theme submission #${args.issue}: ${args.themeName}"`);
  console.log("  git push");
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
