module.exports = {
  apps: [
    {
      name: "fishtokri",
      script: "dist/index.cjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 3010,
      }
    }
  ]
};
