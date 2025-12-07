// Manual mock for chalk@5 (ESM-only) for Jest testing
const chalkMock = {
  // Basic styling methods
  bold: (text) => `\x1b[1m${text}\x1b[22m`,
  dim: (text) => `\x1b[2m${text}\x1b[22m`,
  italic: (text) => `\x1b[3m${text}\x1b[23m`,
  underline: (text) => `\x1b[4m${text}\x1b[24m`,
  
  // Color shortcuts
  red: (text) => `\x1b[31m${text}\x1b[39m`,
  green: (text) => `\x1b[32m${text}\x1b[39m`,
  yellow: (text) => `\x1b[33m${text}\x1b[39m`,
  blue: (text) => `\x1b[34m${text}\x1b[39m`,
  magenta: (text) => `\x1b[35m${text}\x1b[39m`,
  cyan: (text) => `\x1b[36m${text}\x1b[39m`,
  white: (text) => `\x1b[37m${text}\x1b[39m`,
  gray: (text) => `\x1b[90m${text}\x1b[39m`,
  black: (text) => `\x1b[30m${text}\x1b[39m`,
  
  // Background colors
  bgRed: (text) => `\x1b[41m${text}\x1b[49m`,
  bgGreen: (text) => `\x1b[42m${text}\x1b[49m`,
  bgYellow: (text) => `\x1b[43m${text}\x1b[49m`,
  bgBlue: (text) => `\x1b[44m${text}\x1b[49m`,
  bgMagenta: (text) => `\x1b[45m${text}\x1b[49m`,
  bgCyan: (text) => `\x1b[46m${text}\x1b[49m`,
  bgWhite: (text) => `\x1b[47m${text}\x1b[49m`,
  bgBlack: (text) => `\x1b[40m${text}\x1b[49m`,
  
  // Static properties
  supportsColor: { level: 3, hasBasic: true, has256: true, has16m: true }
};

// Make hex method return a function that can be called
chalkMock.hex = function(color) {
  const fn = function(text) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
  };
  fn.bold = function(text) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `\x1b[1m\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
  };
  return fn;
};

chalkMock.bgHex = function(color) {
  const fn = function(text) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `\x1b[48;2;${r};${g};${b}m${text}\x1b[0m`;
  };
  fn.hex = function(textColor) {
    const bgR = parseInt(color.slice(1, 3), 16);
    const bgG = parseInt(color.slice(3, 5), 16);
    const bgB = parseInt(color.slice(5, 7), 16);
    const fgR = parseInt(textColor.slice(1, 3), 16);
    const fgG = parseInt(textColor.slice(3, 5), 16);
    const fgB = parseInt(textColor.slice(5, 7), 16);
    return function(text) {
      return `\x1b[48;2;${bgR};${bgG};${bgB}m\x1b[38;2;${fgR};${fgG};${fgB}m${text}\x1b[0m`;
    };
  };
  return fn;
};

module.exports = chalkMock;
module.exports.default = chalkMock;