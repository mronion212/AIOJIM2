const addon = require('./index.js')
const PORT = process.env.PORT || 1337;
const { initializeMapper } = require('./lib/id-mapper');

async function startServer() {
  console.log('--- Addon Starting Up ---');
  console.log('Initializing ID Mapper...');
  await initializeMapper();
  console.log('ID Mapper initialization complete.');

  addon.listen(PORT, () => {
    console.log(`Addon active and listening on port ${PORT}.`);
    console.log(`Open http://127.0.0.1:${PORT} in your browser.`);
  });
}


startServer().catch(error => {
  console.error('--- FATAL STARTUP ERROR ---');
  console.error(error);
  process.exit(1); 
});
