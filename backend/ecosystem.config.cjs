/** PM2 process file for aidoctor.toolkitpro.cloud (server cwd = app/). */
module.exports = {
  apps: [
    {
      name: "aidoctor-api",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      time: true,
    },
  ],
};
