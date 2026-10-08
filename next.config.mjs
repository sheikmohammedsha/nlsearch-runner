// A static export, so the same build runs from `next dev`, from any file server
// and from GitHub Pages. PAGES_BASE_PATH is set by the Pages workflow, which
// serves the runner under /nlsearch/runner next to the documentation site.
const basePath = process.env.PAGES_BASE_PATH || "";

/** @type {import('next').NextConfig} */
export default {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  agentRules: false,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
