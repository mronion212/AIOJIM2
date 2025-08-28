const { startServerWithCacheWarming } = require('./index.js')
const PORT = process.env.PORT || 1337;
const { initializeMapper } = require('./lib/id-mapper');
const geminiService = require('./utils/gemini-service'); 

async function startServer() {
  console.log('--- Addon Starting Up ---');
  
  process.on('uncaughtException', (error) => {
    console.error('--- UNCAUGHT EXCEPTION ---');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('This error was not caught and could crash the application.');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('--- UNHANDLED PROMISE REJECTION ---');
    console.error('Reason:', reason);
    console.error('Promise:', promise);
    console.error('This rejection was not handled and could crash the application.');
  });
  
  console.log('Initializing ID Mapper...');
  await initializeMapper();
  console.log('ID Mapper initialization complete.');

  const addon = await startServerWithCacheWarming();

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
