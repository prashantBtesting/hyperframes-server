process.on('uncaughtException', (err) => {
  console.error('CRASH:', err.message, '\n', err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED:', reason);
  process.exit(1);
});

console.log('Node version:', process.version);
console.log('PORT:', process.env.PORT);

// Check what the package actually exports
try {
  const { createRequire } = await import('module');
  const req = createRequire(import.meta.url);
  const pkg = req('./node_modules/@hyperframes/producer/package.json');
  console.log('HyperFrames version:', pkg.version);
  console.log('exports keys:', Object.keys(pkg.exports || {}));
} catch(e) {
  console.error('Package inspect failed:', e.message);
}

// Try the import
try {
  console.log('Importing server module...');
  const mod = await import('@hyperframes/producer/server');
  console.log('Module keys:', Object.keys(mod));
  const port = parseInt(process.env.PORT || '8080');
  await mod.startServer({ port });
  console.log('Server running on port', port);
} catch(e) {
  console.error('Import/start failed:', e.message);
  console.error(e.stack);
  process.exit(1);
}
