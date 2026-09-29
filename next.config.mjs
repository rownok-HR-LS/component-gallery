/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export served by GitHub Pages at https://rownok-hr-ls.github.io/component-gallery/
  output: "export",
  basePath: "/component-gallery",
  // Emit components/<slug>/index.html so /components/<slug> resolves on GitHub Pages.
  trailingSlash: true,
};

export default nextConfig;
