// Cross-platform Gradle wrapper runner for npm scripts.
// Windows cannot execute `./gradlew`; Unix does not have `gradlew.bat`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const androidDir = join(process.cwd(), 'android');
const windows = process.platform === 'win32';
// An ABSOLUTE path, not a bare `gradlew.bat`. `cwd` alone is not enough: with
// `shell: true` Windows runs the command through cmd.exe, and cmd only searches
// the working directory when `NoDefaultCurrentDirectoryInExePath` is unset —
// several shells (Git Bash among them) export it, and then a bare wrapper name
// fails with "'gradlew.bat' is not recognized as an internal or external
// command" even though the file is sitting right there in `cwd`. Quoted because
// an absolute path may contain spaces.
const wrapperPath = join(androidDir, windows ? 'gradlew.bat' : 'gradlew');
const wrapper = windows ? `"${wrapperPath}"` : wrapperPath;
const args = process.argv.slice(2);
const env = { ...process.env };

// The Gradle/Android toolchain in this repo targets Java 21. Windows machines
// commonly put a newer standalone JDK first on PATH even though Android Studio
// already bundles the compatible runtime. Prefer that JBR when it is present
// so `npm run android:aab` works from a normal PowerShell session.
if (windows) {
  const androidStudioJbr = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr');
  if (existsSync(join(androidStudioJbr, 'bin', 'java.exe'))) env.JAVA_HOME = androidStudioJbr;
}

const result = spawnSync(wrapper, args, {
  cwd: androidDir,
  env,
  stdio: 'inherit',
  shell: windows,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
