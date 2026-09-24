module.exports = {
    apps: [{
        name: "odds-scraper-prod",
        script: "./build/index.js",
        autorestart: true,
        error_file: "./log/prod/error.log",
        out_file: "./log/prod/out.log",
        max_memory_restart: "1024M",
        kill_timeout: 30_000, // let App.stop() save the in-memory groupMarkets in Mongo
    }]
};
