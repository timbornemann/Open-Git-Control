const { app } = require('electron');
console.log('APP IS:', typeof app);
if (app) {
  app.whenReady().then(() => {
    console.log('App is ready');
    process.exit(0);
  });
} else {
  console.log('NO APP OBJECT');
  process.exit(1);
}
