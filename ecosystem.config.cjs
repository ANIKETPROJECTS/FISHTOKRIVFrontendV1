module.exports = {
  apps: [
    {
      name: "fishtokri",
      script: "server/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      env: {
        NODE_ENV: "production",
        PORT: 3010,
        SESSION_SECRET: "fish_tokri_prod_secret",
        MONGODB_URI: "mongodb+srv://raneaniket23_db_user:0lEZL6KqIATNmZsj@fishtokricluster.vhw7jp9.mongodb.net/?appName=Fishtokricluster",
        MONGODB_DB: "fishtokri",
        // NOTE: Set this in shell BEFORE running `npm run build` on VPS so Vite bakes it into the frontend bundle
        VITE_GOOGLE_MAPS_API_KEY: "AIzaSyDe3GaC52SlaWDAFgFgod6Pwa1xZ0Lfw9o",
        AISENSY_API_KEY: ""  // fill in your AiSensy API key here for VPS
      }
    }
  ]
};
