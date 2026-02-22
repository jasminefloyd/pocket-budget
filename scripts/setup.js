import { execSync } from 'child_process';
console.log('Installing deps...');
execSync('npm install', { stdio: 'inherit', cwd: '/vercel/share/v0-project' });
console.log('Done!');
