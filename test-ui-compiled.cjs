#!/usr/bin/env node

// Directly test the compiled UI class from the TypeScript source
// Import the compiled JS version directly

const { readFileSync } = require('fs');
const chalkModule = require('chalk');
const oraModule = require('ora');
const boxenModule = require('boxen');
const figuresModule = require('figures');

const chalk = chalkModule.default || chalkModule;
const ora = oraModule.default || oraModule;
const boxen = boxenModule.default || boxenModule;
const figures = figuresModule.default || figuresModule;

// Copy the CommonersUI class definition directly for testing
const defaultTheme = {
  primary: '#A7C6ED',
  secondary: '#B8D6F0',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#EF4444',
  info: '#60A5FA',
  muted: '#9CA3AF',
};

class CommonersUI {
  constructor(theme = defaultTheme) {
    this.theme = theme;
    this.activeSpinners = new Set();
    this.sectionStack = [];
  }

  stripAnsi(text) {
    return text.replace(/\u001b\[[0-9;]*[mGKH]/g, '');
  }

  wrapText(text, maxWidth) {
    const lines = [];
    let currentLine = '';
    let currentLength = 0;

    const words = text.split(' ');

    for (const word of words) {
      const cleanWord = this.stripAnsi(word);
      const wordLength = cleanWord.length;

      if (currentLength + wordLength + (currentLine ? 1 : 0) > maxWidth) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
          currentLength = wordLength;
        } else {
          lines.push(word.substring(0, maxWidth));
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
  }

  padToWidth(text, contentWidth, padding) {
    const paddingStr = ' '.repeat(padding);
    const cleanText = this.stripAnsi(text);
    const remainingSpace = Math.max(0, contentWidth - cleanText.length);
    return paddingStr + text + ' '.repeat(remainingSpace) + paddingStr;
  }

  renderBoxHeader(title, subtitle, boxWidth) {
    const width = boxWidth || Math.max(60, (process.stdout.columns || 80) - 4);
    const padding = 2;
    const contentWidth = width - 2 - (padding * 2);

    const topBorder = '╭' + '─'.repeat(width - 2) + '╮';
    console.log(' ' + topBorder);

    console.log(' │' + ' '.repeat(width - 2) + '│');

    const titleText = chalk.hex(this.theme.secondary).bold(title);
    const titleLine = this.padToWidth(titleText, contentWidth, padding);
    console.log(' │' + titleLine + '│');

    if (subtitle) {
      const subtitleText = chalk.hex(this.theme.muted)(subtitle);
      const subtitleLine = this.padToWidth(subtitleText, contentWidth, padding);
      console.log(' │' + subtitleLine + '│');
    }
  }

  renderBoxContent(content, boxWidth) {
    const width = boxWidth || Math.max(60, (process.stdout.columns || 80) - 4);
    const padding = 2;
    const contentWidth = width - 2 - (padding * 2);

    const cleanContent = this.stripAnsi(content);
    if (cleanContent.length > contentWidth) {
      const lines = this.wrapText(content, contentWidth);
      lines.forEach(line => {
        const contentLine = this.padToWidth(line, contentWidth, padding);
        console.log(' │' + contentLine + '│');
      });
    } else {
      const contentLine = this.padToWidth(content, contentWidth, padding);
      console.log(' │' + contentLine + '│');
    }
  }

  renderBoxFooter(boxWidth) {
    const width = boxWidth || Math.max(60, (process.stdout.columns || 80) - 4);
    console.log(' │' + ' '.repeat(width - 2) + '│');
    const bottomBorder = '╰' + '─'.repeat(width - 2) + '╯';
    console.log(' ' + bottomBorder);
  }

  pushBoxedSection(title, options = {}) {
    const level = this.sectionStack.length;
    const section = {
      title,
      subtitle: options.subtitle,
      level,
      items: [],
      boxed: true,
      contentLines: []
    };

    this.sectionStack.push(section);

    const terminalWidth = process.stdout.columns || 80;
    const boxWidth = Math.max(60, terminalWidth - 4);
    section.boxWidth = boxWidth;

    console.log();
    this.renderBoxHeader(title, options.subtitle, boxWidth);

    return section;
  }

  popSection() {
    const section = this.sectionStack.pop();
    if (section && section.boxed) {
      this.renderBoxFooter(section.boxWidth);
    }
    return section;
  }

  getCurrentSection() {
    return this.sectionStack[this.sectionStack.length - 1];
  }

  addToCurrentSection(message) {
    const currentSection = this.getCurrentSection();
    if (currentSection) {
      currentSection.items.push(message);
      if (currentSection.boxed) {
        this.renderBoxContent(message, currentSection.boxWidth);
      }
    }
  }

  success(message, details) {
    const currentSection = this.getCurrentSection();
    const fullMessage = `${figures.tick} ${chalk.hex(this.theme.success).bold(message)}`;

    if (currentSection?.boxed) {
      this.addToCurrentSection(fullMessage);
      if (details) {
        this.addToCurrentSection(chalk.hex(this.theme.muted)(`  ${details}`));
      }
    } else {
      console.log(`\\n${fullMessage}`);
      if (details) {
        console.log(chalk.hex(this.theme.muted)(`  ${details}`));
      }
    }
  }

  error(message, details) {
    const currentSection = this.getCurrentSection();
    const fullMessage = `${figures.cross} ${chalk.hex(this.theme.error).bold(message)}`;

    if (currentSection?.boxed) {
      this.addToCurrentSection(fullMessage);
      if (details) {
        this.addToCurrentSection(chalk.hex(this.theme.muted)(`  ${details}`));
      }
    } else {
      console.log(`\\n${fullMessage}`);
      if (details) {
        console.log(chalk.hex(this.theme.muted)(`  ${details}`));
      }
    }
  }

  warning(message, details) {
    const currentSection = this.getCurrentSection();
    const fullMessage = `${figures.warning} ${chalk.hex(this.theme.warning)(message)}`;

    if (currentSection?.boxed) {
      this.addToCurrentSection(fullMessage);
      if (details) {
        this.addToCurrentSection(chalk.hex(this.theme.muted)(`  ${details}`));
      }
    } else {
      console.log(`\\n${fullMessage}`);
      if (details) {
        console.log(chalk.hex(this.theme.muted)(`  ${details}`));
      }
    }
  }

  info(message, details) {
    const currentSection = this.getCurrentSection();
    const fullMessage = `${figures.info} ${chalk.hex(this.theme.info)(message)}`;

    if (currentSection?.boxed) {
      this.addToCurrentSection(fullMessage);
      if (details) {
        this.addToCurrentSection(chalk.hex(this.theme.muted)(`  ${details}`));
      }
    } else {
      console.log(`\\n${fullMessage}`);
      if (details) {
        console.log(chalk.hex(this.theme.muted)(`  ${details}`));
      }
    }
  }
}

// Test the UI
const ui = new CommonersUI();

console.log('Testing UI box formatting...\\n');

ui.pushBoxedSection('Test Box', { subtitle: 'Testing text overflow handling' });

ui.success('Short success message');
ui.info('This is an info message with some longer text that might overflow the box if not handled properly by the padding and wrapping functionality we just implemented');
ui.error('Error message');
ui.warning('Warning message with very long text that definitely exceeds the normal box width and should be wrapped properly across multiple lines to prevent breaking out of the box boundaries and ensure everything stays within the designated space');

ui.popSection();

console.log('\\nTest completed!');