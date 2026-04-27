/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // External packages that should not be bundled
  serverExternalPackages: ['@gutenye/ocr-node', 'sharp', 'onnxruntime-node'],
};

module.exports = nextConfig;
