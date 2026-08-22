module.exports = {
  apps: [
    {
      name: "backend",
      script: "./backend/dist/index.js",
      cwd: "/var/www/wms/Estoq",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};

