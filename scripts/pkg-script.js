/* eslint-disable @typescript-eslint/no-var-requires */
const { spawn } = require('child_process');
const { exit } = require('process');
const commandLineArgs = require('command-line-args');
const optionDefinitions = [
  { name: 'script', alias: 's', type: String, defaultOption: true },
];
const options = commandLineArgs(optionDefinitions);

const pkgMap = {
  editor: '@caryhu/tui.editor',
  toastmark: '@toast-ui/toastmark',
};

const pathMap = {
  editor: 'app',
  toastmark: 'libs/toastmark',
};

let scriptType = process.env.type;
if (!scriptType || !['editor', 'toastmark'].includes(scriptType)) {
  scriptType = 'editor';
}

let script;
let pkg = pkgMap[scriptType];
let path = pathMap[scriptType];

Object.keys(options).forEach((key) => {
  const value = options[key];

  if (key === 'script') {
    script = value;
  }
});

if (!script) {
  throw new Error(`You should choose "lint", "test", "test:types", "serve", "build" as the type of script`);
}

if (!pkg) {
  throw new Error(`You should choose "editor", "toastmark" as the configuration of type`);
}

const spawnConfiguration = {
  stdio: 'inherit',
  shell: process.env.SHELL || 'bash.exe',
}

let childProcess;

if (script === 'test') {
  childProcess = spawn('jest', ['--watch', '--projects', path], spawnConfiguration);
} else {
  childProcess = spawn('lerna', ['run', '--stream', '--scope', pkg, script], spawnConfiguration);
}

childProcess
  .on('exit', (code) => {
    exit(code);
  })
  .on('error', (err) => {
    console.error(`Error occurred: ${err.message}`);
    exit(1);
  });
