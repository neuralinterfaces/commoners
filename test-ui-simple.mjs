#!/usr/bin/env node

import { CommonersUI } from './packages/cli/src/ui/index.ts';

const ui = new CommonersUI();

console.log('Testing UI box formatting...\n');

// Test boxed section with various message types
ui.pushBoxedSection('Test Box', { subtitle: 'Testing text overflow handling' });

ui.success('Short success message');
ui.info('This is an info message with some longer text that might overflow the box if not handled properly by the padding and wrapping functionality we just implemented');
ui.error('Error message');
ui.warning('Warning message with very long text that definitely exceeds the normal box width and should be wrapped properly across multiple lines to prevent breaking out of the box boundaries');

ui.popSection();

console.log('\nTest completed!');