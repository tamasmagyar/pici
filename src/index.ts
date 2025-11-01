#!/usr/bin/env node

import { main } from './cli';

// Execute CLI when run directly
if (require.main === module) {
  main();
}
