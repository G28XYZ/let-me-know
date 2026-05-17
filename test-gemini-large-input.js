const { spawn } = require('child_process');

const text = "test ".repeat(10000); // 50,000 chars
const prompt = "Ты AI-преподаватель. Ответь JSON.\n" + text;

const child = spawn('/opt/homebrew/bin/gemini', ['--prompt', prompt, '--output-format', 'text', '--skip-trust']);
let output = '';
let err = '';
child.stdout.on('data', d => output += d);
child.stderr.on('data', d => err += d);
child.on('close', code => {
  console.log('CODE:', code);
  console.log('OUTPUT:', output);
  console.log('ERROR:', err);
});
