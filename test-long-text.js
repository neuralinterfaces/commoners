#!/usr/bin/env node

// Create a direct test of the box formatting with very long content
import('./packages/cli/dist/index.mjs').then(() => {
  // Since we can't easily import the UI class, let's simulate the problematic output

  const chalkModule = await import('chalk');
  const chalk = chalkModule.default;

  // Simulate the same type of content that was breaking
  const testContent = [
    '[basic-python] /Users/garrettflynn/miniconda3/bin/python: No module named PyInstaller',
    '[basic-python] Build completed',
    '/Users/garrettflynn/Documents/GitHub/commoners/tests/demo/build/_basic-python/basic-python',
    'This is a very long line that should wrap properly within the box boundaries and not break out',
    'Another extremely long file path that goes on and on: /Users/garrettflynn/Documents/GitHub/commoners/tests/demo/.commoners/services/manualAutobuild/manualAutobuild/manualAutobuild'
  ];

  console.log('\\nTesting box formatting with problematic content:\\n');

  // Simulate a box manually to test the formatting
  const terminalWidth = process.stdout.columns || 80;
  const boxWidth = Math.max(60, terminalWidth - 4);
  const padding = 2;
  const contentWidth = boxWidth - 2 - (padding * 2);

  // Helper function to strip ANSI codes
  const stripAnsi = (text) => text.replace(/\\u001b\\[[0-9;]*[a-zA-Z]/g, '');

  // Helper function to wrap text
  const wrapText = (text, maxWidth) => {
    const lines = [];
    let currentLine = '';
    let currentLength = 0;

    const words = text.split(' ');

    for (const word of words) {
      const cleanWord = stripAnsi(word);
      const wordLength = cleanWord.length;
      const spaceNeeded = currentLine ? 1 : 0;

      if (currentLength + spaceNeeded + wordLength > maxWidth) {
        if (currentLine) {
          lines.push(currentLine);
        }

        if (wordLength > maxWidth) {
          let remainingWord = word;
          while (remainingWord.length > 0) {
            const cleanRemaining = stripAnsi(remainingWord);
            if (cleanRemaining.length <= maxWidth) {
              lines.push(remainingWord);
              break;
            } else {
              let breakPoint = maxWidth;
              while (breakPoint > 0 && remainingWord[breakPoint] === '\\u001b') {
                breakPoint--;
              }
              if (breakPoint === 0) breakPoint = maxWidth;

              lines.push(remainingWord.substring(0, breakPoint));
              remainingWord = remainingWord.substring(breakPoint);
            }
          }
          currentLine = '';
          currentLength = 0;
        } else {
          currentLine = word;
          currentLength = wordLength;
        }
      } else {
        if (currentLine) {
          currentLine += ' ' + word;
          currentLength += 1 + wordLength;
        } else {
          currentLine = word;
          currentLength = wordLength;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  };

  // Helper to pad content to width
  const padToWidth = (text, contentWidth, padding) => {
    const paddingStr = ' '.repeat(padding);
    const cleanText = stripAnsi(text);
    const remainingSpace = Math.max(0, contentWidth - cleanText.length);
    return paddingStr + text + ' '.repeat(remainingSpace) + paddingStr;
  };

  // Render box header
  const topBorder = '╭' + '─'.repeat(boxWidth - 2) + '╮';
  console.log(' ' + topBorder);
  console.log(' │' + ' '.repeat(boxWidth - 2) + '│');

  const titleText = chalk.blue.bold('Test Long Content');
  const titleLine = padToWidth(titleText, contentWidth, padding);
  console.log(' │' + titleLine + '│');

  console.log(' │' + ' '.repeat(boxWidth - 2) + '│');

  // Test each piece of content
  testContent.forEach(content => {
    const lines = wrapText(content, contentWidth);
    lines.forEach(line => {
      const cleanLine = stripAnsi(line);
      if (cleanLine.length > contentWidth) {
        const truncated = line.substring(0, contentWidth - 3) + '...';
        const contentLine = padToWidth(truncated, contentWidth, padding);
        console.log(' │' + contentLine + '│');
      } else {
        const contentLine = padToWidth(line, contentWidth, padding);
        console.log(' │' + contentLine + '│');
      }
    });
  });

  // Render box footer
  console.log(' │' + ' '.repeat(boxWidth - 2) + '│');
  const bottomBorder = '╰' + '─'.repeat(boxWidth - 2) + '╯';
  console.log(' ' + bottomBorder);
  console.log('\\nTest completed!');
});